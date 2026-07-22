#!/usr/bin/env python3
"""
Multi-Agent RAG FastAPI backend with LangGraph orchestration.

Pipeline: guardrail → retrieval (ChromaDB + BM25 rerank) → generation → judge
Telemetry: OpenLit + MLflow
Voice: gTTS endpoint
Prompt caching: Anthropic cache_control headers on static system prompts
"""

from __future__ import annotations

import io
import json
import logging
import logging.config
import os
import re
import threading
import time
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import Any, TypedDict

import chromadb
import mlflow
import openlit
from chromadb.config import Settings
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from gtts import gTTS
from langgraph.graph import END, StateGraph
from openai import APIConnectionError, APIStatusError, OpenAI, RateLimitError
from pydantic import BaseModel, Field
from rank_bm25 import BM25Okapi
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

# ---------------------------------------------------------------------------
# Structured JSON logging
# ---------------------------------------------------------------------------

def _build_logging_config() -> dict[str, Any]:
    """
    Build a logging dictConfig that uses JSON formatting when
    python-json-logger is installed, and plain text otherwise.
    Checking availability *before* building the config avoids the
    ValueError that occurs when dictConfig tries to resolve a missing class.
    """
    level = os.getenv("LOG_LEVEL", "INFO")
    try:
        import pythonjsonlogger.jsonlogger  # noqa: F401  -- probe only

        return {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "json": {
                    "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
                    "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
                }
            },
            "handlers": {
                "stdout": {
                    "class": "logging.StreamHandler",
                    "stream": "ext://sys.stdout",
                    "formatter": "json",
                }
            },
            "root": {"handlers": ["stdout"], "level": level},
        }
    except ImportError:
        return {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "plain": {
                    "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                    "datefmt": "%Y-%m-%dT%H:%M:%S",
                }
            },
            "handlers": {
                "stdout": {
                    "class": "logging.StreamHandler",
                    "stream": "ext://sys.stdout",
                    "formatter": "plain",
                }
            },
            "root": {"handlers": ["stdout"], "level": level},
        }


logging.config.dictConfig(_build_logging_config())
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment / constants
# ---------------------------------------------------------------------------

MLFLOW_URI: str = os.getenv("MLFLOW_TRACKING_URI", "sqlite:///mlflow.db")
LLM_MODEL: str = os.getenv("LLM_MODEL_NAME", "gpt-4o-mini")
EMBED_MODEL: str = os.getenv("EMBED_MODEL_NAME", "text-embedding-3-small")
CHROMA_DIR: str = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
DATA_BUNDLE_PATH: str = os.path.join(os.path.dirname(__file__), "data_bundle.json")
BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))
CORS_ORIGINS: list[str] = json.loads(
    os.getenv(
        "CORS_ORIGINS",
        '["http://localhost:5173","http://127.0.0.1:5173","http://localhost:3000"]',
    )
)

# Detect whether the backend is Anthropic-native (supports cache_control)
_base_url: str = os.getenv("LLM_BASE_URL", "")
IS_ANTHROPIC_NATIVE: bool = "anthropic" in _base_url.lower() or not _base_url

# Generation tunables
GEN_TEMPERATURE: float = float(os.getenv("GEN_TEMPERATURE", "0.2"))
GEN_MAX_TOKENS: int = int(os.getenv("GEN_MAX_TOKENS", "512"))
JUDGE_MAX_TOKENS: int = int(os.getenv("JUDGE_MAX_TOKENS", "256"))
RETRIEVAL_CANDIDATES: int = int(os.getenv("RETRIEVAL_CANDIDATES", "6"))
RETRIEVAL_TOP_K: int = int(os.getenv("RETRIEVAL_TOP_K", "3"))

# Session / context window
SESSION_MAX_TURNS: int = int(os.getenv("SESSION_MAX_TURNS", "20"))
# Hard token budget for history injected into the prompt.
# ~4 chars per token is a safe estimate; we stay well under model limits.
SESSION_HISTORY_TOKEN_BUDGET: int = int(
    os.getenv("SESSION_HISTORY_TOKEN_BUDGET", "3000")
)
# Max number of concurrent sessions kept in memory before oldest is evicted.
SESSION_MAX_SESSIONS: int = int(os.getenv("SESSION_MAX_SESSIONS", "500"))

# ---------------------------------------------------------------------------
# Jailbreak patterns
# ---------------------------------------------------------------------------

_JAILBREAK_PATTERNS: list[str] = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"you\s+are\s+dan\b",
    r"bypass\s+(all\s+)?safety",
    r"reveal\s+(your\s+)?system\s+prompt",
    r"pretend\s+you\s+have\s+no\s+restrictions",
    r"jailbreak",
    r"do\s+anything\s+now",
]
JAILBREAK_RE: re.Pattern[str] = re.compile(
    "|".join(_JAILBREAK_PATTERNS), re.IGNORECASE
)
JAILBREAK_KEYWORDS: frozenset[str] = frozenset(
    {"DAN", "jailbreak", "system prompt", "admin password", "ignore instructions"}
)

# ---------------------------------------------------------------------------
# Static prompts (defined once so they are cacheable across requests)
# ---------------------------------------------------------------------------

_GEN_SYSTEM_PROMPT: str = (
    "You are an enterprise knowledge assistant. "
    "Answer ONLY using the provided context. "
    "If the context is insufficient, say you don't have enough information. "
    "Be concise and factual."
)

_JUDGE_SYSTEM_PROMPT: str = (
    "You are a factual alignment judge. "
    "Score 0.0–1.0 how well the ANSWER is supported by the CONTEXT for the QUESTION. "
    'Reply with JSON only, no markdown: {"score": 0.85, "reason": "brief explanation"}'
)

# ---------------------------------------------------------------------------
# Session store  (in-memory, thread-safe, LRU-evicting)
# ---------------------------------------------------------------------------

Turn = dict[str, str]  # {"role": "user"|"assistant", "content": "..."}


class SessionStore:
    """
    Thread-safe in-memory store of per-session conversation history.

    Uses an OrderedDict as a simple LRU cache: when the capacity is reached
    the oldest session is evicted.  Each session holds a list of turns
    (alternating user / assistant dicts) capped at SESSION_MAX_TURNS pairs.
    """

    def __init__(
        self,
        max_sessions: int = SESSION_MAX_SESSIONS,
        max_turns: int = SESSION_MAX_TURNS,
        history_token_budget: int = SESSION_HISTORY_TOKEN_BUDGET,
    ) -> None:
        self._store: OrderedDict[str, list[Turn]] = OrderedDict()
        self._lock = threading.Lock()
        self._max_sessions = max_sessions
        self._max_turns = max_turns
        self._token_budget = history_token_budget

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_history(self, session_id: str) -> list[Turn]:
        """Return a copy of the trimmed history for *session_id*."""
        with self._lock:
            history = self._store.get(session_id, [])
            if session_id in self._store:
                self._store.move_to_end(session_id, last=True)
            return self._trim_to_budget(list(history))

    def append_turn(
        self, session_id: str, user_msg: str, assistant_msg: str
    ) -> None:
        """Append a completed turn and enforce the turn-count cap."""
        with self._lock:
            if session_id not in self._store:
                if len(self._store) >= self._max_sessions:
                    # Evict the least-recently-used session
                    evicted_id, _ = self._store.popitem(last=False)
                    logger.debug(
                        "Session evicted (capacity)", extra={"session_id": evicted_id}
                    )
                self._store[session_id] = []
            self._store.move_to_end(session_id, last=True)

            turns = self._store[session_id]
            turns.append({"role": "user", "content": user_msg})
            turns.append({"role": "assistant", "content": assistant_msg})

            # Cap total stored turns (pairs × 2 messages each)
            max_msgs = self._max_turns * 2
            if len(turns) > max_msgs:
                self._store[session_id] = turns[-max_msgs:]

    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            if session_id in self._store:
                del self._store[session_id]
                return True
            return False

    def session_count(self) -> int:
        with self._lock:
            return len(self._store)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _trim_to_budget(self, history: list[Turn]) -> list[Turn]:
        """
        Trim *history* from the front (oldest first) until the total
        estimated token count fits within SESSION_HISTORY_TOKEN_BUDGET.
        Always keeps history in complete user/assistant pairs.
        """
        while history:
            # Rough estimate: 1 token ≈ 4 characters
            total_chars = sum(len(t["content"]) for t in history)
            if total_chars // 4 <= self._token_budget:
                break
            # Drop the oldest pair (2 messages)
            history = history[2:]
        return history


# Module-level singleton
session_store = SessionStore()

# ---------------------------------------------------------------------------
# MLflow / OpenLit
# ---------------------------------------------------------------------------

mlflow.set_tracking_uri(MLFLOW_URI)
mlflow.set_experiment("multi-agent-rag")

try:
    openlit.init(
        otlp_endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
        application_name="multi-agent-rag",
        disable_batch=True,
    )
    logger.info("OpenLit telemetry initialised")
except Exception as exc:
    logger.warning("OpenLit init skipped", extra={"error": str(exc)})

# ---------------------------------------------------------------------------
# OpenAI client
# ---------------------------------------------------------------------------

client = OpenAI(
    base_url=_base_url or "http://localhost:8000/v1",
    api_key=os.getenv("LLM_API_KEY", "local-dev-key"),
    timeout=30.0,
    max_retries=0,  # we handle retries ourselves via tenacity
)

# ---------------------------------------------------------------------------
# ChromaDB / BM25 singletons
# ---------------------------------------------------------------------------

chroma_client: chromadb.ClientAPI | None = None
collection: Any = None
bm25_index: BM25Okapi | None = None
bm25_corpus: list[str] = []
bm25_ids: list[str] = []


# ---------------------------------------------------------------------------
# Embedding function
# ---------------------------------------------------------------------------


class HackathonEmbeddingFunction:
    """OpenAI-compatible embedding function for ChromaDB with hash fallback."""

    def __init__(self, openai_client: OpenAI, model: str) -> None:
        self._client = openai_client
        self._model = model

    def __call__(self, input: list[str]) -> list[list[float]]:
        try:
            resp = self._client.embeddings.create(model=self._model, input=input)
            return [item.embedding for item in resp.data]
        except Exception as exc:
            logger.warning(
                "Embedding gateway failed; using hash fallback",
                extra={"error": str(exc)},
            )
            return [_hash_embed(t) for t in input]

    def name(self) -> str:
        return f"hackathon_{self._model}"


def _hash_embed(text: str, dim: int = 384) -> list[float]:
    import hashlib

    h = hashlib.sha256(text.encode()).digest()
    vec = [(h[i % len(h)] / 255.0) * 2 - 1 for i in range(dim)]
    norm = sum(v * v for v in vec) ** 0.5 or 1.0
    return [v / norm for v in vec]


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())


# ---------------------------------------------------------------------------
# Data loading / indexing
# ---------------------------------------------------------------------------


def _load_and_index_data() -> None:
    global chroma_client, collection, bm25_index, bm25_corpus, bm25_ids

    embed_fn = HackathonEmbeddingFunction(client, EMBED_MODEL)
    chroma_client = chromadb.PersistentClient(
        path=CHROMA_DIR,
        settings=Settings(anonymized_telemetry=False),
    )

    collection = chroma_client.get_or_create_collection(
        name="synthetic_chunks",
        embedding_function=embed_fn,
        metadata={"hnsw:space": "cosine"},
    )

    if not os.path.exists(DATA_BUNDLE_PATH):
        logger.warning(
            "data_bundle.json not found — run generate_synthetic.py first",
            extra={"path": DATA_BUNDLE_PATH},
        )
        return

    with open(DATA_BUNDLE_PATH, encoding="utf-8") as f:
        bundle: dict[str, Any] = json.load(f)

    chunks: list[dict[str, Any]] = bundle.get("synthetic_chunks", [])
    if not chunks:
        logger.warning("No synthetic_chunks in data_bundle.json")
        return

    existing: int = collection.count()
    if existing < len(chunks):
        ids = [c["chunk_id"] for c in chunks]
        documents = [c["text"] for c in chunks]
        metadatas = [
            {
                "source_type": str(c.get("source_type", "")),
                "source_file": str(c.get("source_file", "")),
            }
            for c in chunks
        ]
        batch_size = 50
        for i in range(0, len(ids), batch_size):
            collection.upsert(
                ids=ids[i : i + batch_size],
                documents=documents[i : i + batch_size],
                metadatas=metadatas[i : i + batch_size],
            )
        logger.info("Indexed chunks into ChromaDB", extra={"count": len(chunks)})
    else:
        logger.info(
            "ChromaDB already indexed", extra={"existing_docs": existing}
        )

    bm25_corpus = [c["text"] for c in chunks]
    bm25_ids = [c["chunk_id"] for c in chunks]
    bm25_index = BM25Okapi([_tokenize(t) for t in bm25_corpus])
    logger.info("BM25 index ready", extra={"docs": len(bm25_corpus)})


# ---------------------------------------------------------------------------
# Usage parsing helpers
# ---------------------------------------------------------------------------


def _get_attr(obj: Any, *keys: str, default: int = 0) -> int:
    for key in keys:
        if isinstance(obj, dict) and key in obj:
            val = obj[key]
            return int(val) if val is not None else default
        if hasattr(obj, key):
            val = getattr(obj, key)
            return int(val) if val is not None else default
    return default


def parse_usage(response: Any) -> dict[str, Any]:
    usage: Any = None
    if hasattr(response, "usage"):
        usage = response.usage
    elif isinstance(response, dict):
        usage = response.get("usage")

    if usage is None:
        return {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "cached_tokens": 0,
            "caching_enabled": False,
        }

    prompt_tokens = _get_attr(usage, "prompt_tokens", "input_tokens")
    completion_tokens = _get_attr(usage, "completion_tokens", "output_tokens")
    total_tokens = _get_attr(usage, "total_tokens") or (
        prompt_tokens + completion_tokens
    )

    cached_tokens = 0
    details = None
    if isinstance(usage, dict):
        details = usage.get("prompt_tokens_details") or usage.get(
            "input_tokens_details"
        )
    elif hasattr(usage, "prompt_tokens_details"):
        details = usage.prompt_tokens_details

    if details:
        cached_tokens = _get_attr(
            details, "cached_tokens", "cache_read_input_tokens"
        )

    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "cached_tokens": cached_tokens,
        "caching_enabled": cached_tokens > 0,
    }


def merge_usage(
    a: dict[str, Any], b: dict[str, Any]
) -> dict[str, Any]:
    return {
        "prompt_tokens": a.get("prompt_tokens", 0) + b.get("prompt_tokens", 0),
        "completion_tokens": (
            a.get("completion_tokens", 0) + b.get("completion_tokens", 0)
        ),
        "total_tokens": a.get("total_tokens", 0) + b.get("total_tokens", 0),
        "cached_tokens": a.get("cached_tokens", 0) + b.get("cached_tokens", 0),
        "caching_enabled": (
            a.get("caching_enabled", False) or b.get("caching_enabled", False)
        ),
    }


# ---------------------------------------------------------------------------
# Prompt caching helpers
# ---------------------------------------------------------------------------


def _cached_text_block(text: str) -> dict[str, Any]:
    """
    Returns a content block with Anthropic cache_control when the backend
    supports it, otherwise a plain string that OpenAI-compatible APIs accept.
    """
    if IS_ANTHROPIC_NATIVE:
        return {
            "type": "text",
            "text": text,
            "cache_control": {"type": "ephemeral"},
        }
    return {"type": "text", "text": text}


def _build_generation_messages(
    context: str,
    query: str,
    history: list[Turn] | None = None,
) -> list[dict[str, Any]]:
    """
    Build the messages payload for the generation LLM call.

    Message order (preserves cache-friendly prefix):
      1. system  — static, cache_control marked (never changes → always cached)
      2. history — prior user/assistant turns from the session
      3. user    — current turn with retrieved context prepended

    The static system prompt is always first so the cached prefix is
    maximally stable across requests regardless of session length.
    """
    system_content: Any
    if IS_ANTHROPIC_NATIVE:
        system_content = [_cached_text_block(_GEN_SYSTEM_PROMPT)]
    else:
        system_content = _GEN_SYSTEM_PROMPT

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_content}
    ]

    # Inject prior conversation turns between system and the new user turn
    if history:
        messages.extend(history)

    # Current user turn: context + question
    user_content = f"Context:\n{context}\n\nQuestion: {query}"
    messages.append({"role": "user", "content": user_content})

    return messages


def _build_judge_messages(
    query: str, context: str, answer: str
) -> list[dict[str, Any]]:
    """
    Build the messages payload for the judge LLM call.

    Static judge instructions are placed in the system message (cached).
    Dynamic content (question / context / answer) goes in the user turn.
    """
    system_content: Any
    if IS_ANTHROPIC_NATIVE:
        system_content = [_cached_text_block(_JUDGE_SYSTEM_PROMPT)]
    else:
        system_content = _JUDGE_SYSTEM_PROMPT

    user_content = (
        f"QUESTION: {query}\n"
        f"CONTEXT: {context[:1500]}\n"
        f"ANSWER: {answer}"
    )

    return [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_content},
    ]


# ---------------------------------------------------------------------------
# Reranker (BM25-based FlashRank-style)
# ---------------------------------------------------------------------------


def flashrank_rerank(
    query: str,
    candidates: list[dict[str, Any]],
    top_k: int = RETRIEVAL_TOP_K,
) -> tuple[list[dict[str, Any]], str]:
    if not candidates:
        return [], ""

    query_tokens = _tokenize(query)
    local_bm25 = BM25Okapi([_tokenize(c.get("text", "")) for c in candidates])
    scores = local_bm25.get_scores(query_tokens)

    scored = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)

    reranked: list[dict[str, Any]] = []
    feed_lines: list[str] = []
    for rank, (doc, score) in enumerate(scored[:top_k], start=1):
        entry = {
            **doc,
            "rerank_score": round(float(score), 4),
            "rerank_rank": rank,
        }
        reranked.append(entry)
        feed_lines.append(
            f"#{rank} score={score:.3f} id={doc.get('id', '?')}"
        )

    return reranked, " | ".join(feed_lines)


# ---------------------------------------------------------------------------
# LLM call wrappers with retry
# ---------------------------------------------------------------------------

_RETRYABLE = (APIConnectionError, RateLimitError)


@retry(
    retry=retry_if_exception_type(_RETRYABLE),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    reraise=True,
)
def _llm_chat(
    messages: list[dict[str, Any]],
    *,
    temperature: float,
    max_tokens: int,
) -> Any:
    return client.chat.completions.create(
        model=LLM_MODEL,
        messages=messages,  # type: ignore[arg-type]
        temperature=temperature,
        max_tokens=max_tokens,
    )


# ---------------------------------------------------------------------------
# LangGraph state
# ---------------------------------------------------------------------------


class GraphState(TypedDict, total=False):
    query: str
    session_id: str
    history: list[Turn]           # prior turns injected into the prompt
    is_jailbreak: bool
    jailbreak_reason: str
    retrieved_docs: list[dict[str, Any]]
    rerank_feed: str
    context: str
    answer: str
    judge_score: float
    judge_reason: str
    token_usage: dict[str, Any]
    telemetry: dict[str, Any]


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------


def guardrail_node(state: GraphState) -> GraphState:
    query = state.get("query", "")
    is_jailbreak = False
    reason = ""

    if JAILBREAK_RE.search(query):
        is_jailbreak = True
        reason = "Regex jailbreak pattern matched"
    else:
        lower = query.lower()
        for kw in JAILBREAK_KEYWORDS:
            if kw.lower() in lower:
                is_jailbreak = True
                reason = f"Keyword match: {kw!r}"
                break

    if is_jailbreak:
        logger.warning(
            "Jailbreak attempt blocked",
            extra={"reason": reason, "query_preview": query[:120]},
        )

    telemetry = {
        **state.get("telemetry", {}),
        "guardrail": {
            "passed": not is_jailbreak,
            "reason": reason if is_jailbreak else "OK",
        },
    }
    return {
        **state,
        "is_jailbreak": is_jailbreak,
        "jailbreak_reason": reason,
        "telemetry": telemetry,
    }


def retrieval_node(state: GraphState) -> GraphState:
    query = state.get("query", "")
    telemetry = dict(state.get("telemetry", {}))

    if state.get("is_jailbreak"):
        telemetry["retrieval"] = {
            "candidate_count": 0,
            "reranked_count": 0,
            "rerank_feed": "",
            "skipped": True,
        }
        return {
            **state,
            "retrieved_docs": [],
            "rerank_feed": "",
            "context": "",
            "telemetry": telemetry,
        }

    candidates: list[dict[str, Any]] = []

    # --- Semantic retrieval (ChromaDB) ---
    if collection is not None:
        try:
            results = collection.query(
                query_texts=[query], n_results=RETRIEVAL_CANDIDATES
            )
            ids = (results.get("ids") or [[]])[0]
            docs = (results.get("documents") or [[]])[0]
            metas = (results.get("metadatas") or [[]])[0]
            dists = (results.get("distances") or [[]])[0]
            for i, doc_id in enumerate(ids):
                candidates.append(
                    {
                        "id": doc_id,
                        "text": docs[i] if i < len(docs) else "",
                        "metadata": metas[i] if i < len(metas) else {},
                        "semantic_distance": (
                            dists[i] if i < len(dists) else None
                        ),
                    }
                )
        except Exception as exc:
            logger.warning(
                "ChromaDB query failed", extra={"error": str(exc)}
            )

    # --- BM25 fallback ---
    if not candidates and bm25_index is not None:
        scores = bm25_index.get_scores(_tokenize(query))
        top_indices = sorted(
            range(len(scores)), key=lambda i: scores[i], reverse=True
        )[:RETRIEVAL_CANDIDATES]
        for idx in top_indices:
            if scores[idx] > 0:
                candidates.append(
                    {
                        "id": bm25_ids[idx],
                        "text": bm25_corpus[idx],
                        "metadata": {},
                        "bm25_score": float(scores[idx]),
                    }
                )

    reranked, rerank_feed = flashrank_rerank(query, candidates)
    context = "\n\n".join(d.get("text", "") for d in reranked)

    telemetry["retrieval"] = {
        "candidate_count": len(candidates),
        "reranked_count": len(reranked),
        "rerank_feed": rerank_feed,
    }

    return {
        **state,
        "retrieved_docs": reranked,
        "rerank_feed": rerank_feed,
        "context": context,
        "telemetry": telemetry,
    }


def generation_node(state: GraphState) -> GraphState:
    query = state.get("query", "")
    telemetry = dict(state.get("telemetry", {}))
    usage = dict(state.get("token_usage", parse_usage(None)))

    if state.get("is_jailbreak"):
        telemetry["generation"] = {"blocked": True}
        return {
            **state,
            "answer": (
                "I cannot process that request — it appears to violate our "
                "safety guardrails. Please ask a question related to enterprise "
                "policies and documentation."
            ),
            "token_usage": usage,
            "telemetry": telemetry,
        }

    context = state.get("context", "")
    history = state.get("history", [])
    messages = _build_generation_messages(context, query, history)

    try:
        response = _llm_chat(
            messages, temperature=GEN_TEMPERATURE, max_tokens=GEN_MAX_TOKENS
        )
        answer = (response.choices[0].message.content or "").strip()
        usage = merge_usage(usage, parse_usage(response))
        telemetry["generation"] = {
            "blocked": False,
            "model": LLM_MODEL,
            "cached_tokens": usage.get("cached_tokens", 0),
            "history_turns": len(state.get("history", [])) // 2,
        }
    except APIStatusError as exc:
        logger.error(
            "LLM generation HTTP error",
            extra={"status": exc.status_code, "error": str(exc)},
        )
        answer = (
            f"Based on available documentation: {context[:600]}"
            if context
            else "The LLM gateway returned an error and no context was retrieved."
        )
        telemetry["generation"] = {
            "blocked": False,
            "fallback": True,
            "error": str(exc),
        }
    except Exception as exc:
        logger.error("LLM generation failed", extra={"error": str(exc)})
        answer = (
            f"Based on available documentation: {context[:600]}"
            if context
            else "Unable to reach the LLM gateway and no context was retrieved."
        )
        telemetry["generation"] = {
            "blocked": False,
            "fallback": True,
            "error": str(exc),
        }

    return {
        **state,
        "answer": answer,
        "token_usage": usage,
        "telemetry": telemetry,
    }


def judge_node(state: GraphState) -> GraphState:
    query = state.get("query", "")
    answer = state.get("answer", "")
    context = state.get("context", "")
    telemetry = dict(state.get("telemetry", {}))
    usage = dict(state.get("token_usage", parse_usage(None)))

    if state.get("is_jailbreak"):
        telemetry["judge"] = {"score": 0.0, "reason": "Skipped — jailbreak blocked"}
        return {
            **state,
            "judge_score": 0.0,
            "judge_reason": "Skipped — jailbreak blocked",
            "token_usage": usage,
            "telemetry": telemetry,
        }

    messages = _build_judge_messages(query, context, answer)
    score = 0.5
    reason = "Default score — judge unavailable"

    try:
        response = _llm_chat(
            messages, temperature=0.0, max_tokens=JUDGE_MAX_TOKENS
        )
        raw = (response.choices[0].message.content or "").strip()
        usage = merge_usage(usage, parse_usage(response))

        raw_clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw).strip()
        match = re.search(r"\{[\s\S]*\}", raw_clean)
        if match:
            parsed = json.loads(match.group())
            score = max(0.0, min(1.0, float(parsed.get("score", 0.5))))
            reason = str(parsed.get("reason", reason))
    except APIStatusError as exc:
        logger.error(
            "Judge HTTP error",
            extra={"status": exc.status_code, "error": str(exc)},
        )
        score, reason = _heuristic_score(context, answer, exc)
    except Exception as exc:
        logger.warning("Judge call failed", extra={"error": str(exc)})
        score, reason = _heuristic_score(context, answer, exc)

    telemetry["judge"] = {"score": score, "reason": reason}

    _log_to_mlflow(state, usage, score)

    return {
        **state,
        "judge_score": score,
        "judge_reason": reason,
        "token_usage": usage,
        "telemetry": telemetry,
    }


def _heuristic_score(
    context: str, answer: str, exc: Exception
) -> tuple[float, str]:
    ctx_words = set(_tokenize(context))
    ans_words = set(_tokenize(answer))
    overlap = len(ctx_words & ans_words)
    score = min(1.0, overlap / max(len(ans_words), 1))
    return score, f"Heuristic overlap score (judge error: {exc})"


def _log_to_mlflow(
    state: GraphState,
    usage: dict[str, Any],
    judge_score: float,
) -> None:
    try:
        with mlflow.start_run(
            run_name=f"chat_{uuid.uuid4().hex[:8]}", nested=True
        ):
            mlflow.log_param("model", LLM_MODEL)
            mlflow.log_param("query_len", len(state.get("query", "")))
            mlflow.log_param(
                "is_jailbreak", str(state.get("is_jailbreak", False))
            )
            mlflow.log_metric("judge_score", judge_score)
            mlflow.log_metric(
                "prompt_tokens", usage.get("prompt_tokens", 0)
            )
            mlflow.log_metric(
                "completion_tokens", usage.get("completion_tokens", 0)
            )
            mlflow.log_metric(
                "total_tokens", usage.get("total_tokens", 0)
            )
            mlflow.log_metric(
                "cached_tokens", usage.get("cached_tokens", 0)
            )
            mlflow.log_metric(
                "cache_hit_rate",
                (
                    usage.get("cached_tokens", 0)
                    / max(usage.get("prompt_tokens", 1), 1)
                ),
            )
    except Exception as exc:
        logger.warning("MLflow logging failed", extra={"error": str(exc)})


# ---------------------------------------------------------------------------
# Graph compilation
# ---------------------------------------------------------------------------


def _build_graph() -> Any:
    graph: StateGraph = StateGraph(GraphState)
    graph.add_node("guardrail", guardrail_node)
    graph.add_node("retrieval", retrieval_node)
    graph.add_node("generation", generation_node)
    graph.add_node("judge", judge_node)
    graph.set_entry_point("guardrail")
    graph.add_edge("guardrail", "retrieval")
    graph.add_edge("retrieval", "generation")
    graph.add_edge("generation", "judge")
    graph.add_edge("judge", END)
    return graph.compile()


rag_graph = _build_graph()

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: str = Field(
        default_factory=lambda: uuid.uuid4().hex,
        min_length=1,
        max_length=128,
        description="Opaque session identifier. Generate once per browser session and reuse.",
    )


class ChatResponse(BaseModel):
    answer: str
    session_id: str
    history_turns: int
    is_jailbreak: bool
    jailbreak_reason: str
    judge_score: float
    judge_reason: str
    token_usage: dict[str, Any]
    telemetry: dict[str, Any]


class HealthResponse(BaseModel):
    status: str
    model: str
    embed_model: str
    indexed_docs: int
    prompt_caching: bool
    active_sessions: int


# ---------------------------------------------------------------------------
# App lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN001
    _load_and_index_data()
    logger.info(
        "Application ready",
        extra={
            "model": LLM_MODEL,
            "prompt_caching": IS_ANTHROPIC_NATIVE,
            "indexed_docs": collection.count() if collection else 0,
        },
    )
    yield
    logger.info("Application shutting down")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Multi-Agent RAG API",
    version="1.0.0",
    description=(
        "LangGraph pipeline: guardrail → retrieval → generation (cached) → judge"
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global error handler
# ---------------------------------------------------------------------------


@app.exception_handler(Exception)
async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    logger.exception(
        "Unhandled exception",
        extra={"path": request.url.path, "error": str(exc)},
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Please try again."},
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        model=LLM_MODEL,
        embed_model=EMBED_MODEL,
        indexed_docs=collection.count() if collection else 0,
        prompt_caching=IS_ANTHROPIC_NATIVE,
        active_sessions=session_store.session_count(),
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    start = time.perf_counter()
    request_id = uuid.uuid4().hex[:12]
    session_id = req.session_id.strip()
    query = req.message.strip()

    logger.info(
        "Chat request received",
        extra={
            "request_id": request_id,
            "session_id": session_id,
            "query_len": len(query),
        },
    )

    # Load existing history for this session (already trimmed to token budget)
    history = session_store.get_history(session_id)

    try:
        result: GraphState = rag_graph.invoke(
            {
                "query": query,
                "session_id": session_id,
                "history": history,
                "telemetry": {},
            }
        )
    except Exception as exc:
        logger.exception(
            "Graph invocation failed", extra={"request_id": request_id}
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    answer = result.get("answer", "")
    is_jailbreak = bool(result.get("is_jailbreak", False))

    # Only persist the turn when it was not blocked by the guardrail.
    # Jailbreak attempts must not pollute the session history.
    if not is_jailbreak:
        session_store.append_turn(session_id, query, answer)

    history_turns = len(session_store.get_history(session_id)) // 2

    latency = round(time.perf_counter() - start, 3)
    telemetry = {
        **result.get("telemetry", {}),
        "latency_seconds": latency,
        "session_id": session_id,
        "history_turns": history_turns,
    }

    logger.info(
        "Chat request completed",
        extra={
            "request_id": request_id,
            "session_id": session_id,
            "latency": latency,
            "history_turns": history_turns,
            "judge_score": result.get("judge_score", 0.0),
            "is_jailbreak": is_jailbreak,
            "cached_tokens": result.get("token_usage", {}).get("cached_tokens", 0),
        },
    )

    return ChatResponse(
        answer=answer,
        session_id=session_id,
        history_turns=history_turns,
        is_jailbreak=is_jailbreak,
        jailbreak_reason=result.get("jailbreak_reason", ""),
        judge_score=float(result.get("judge_score", 0.0)),
        judge_reason=result.get("judge_reason", ""),
        token_usage=result.get("token_usage", parse_usage(None)),
        telemetry=telemetry,
    )


@app.delete("/api/session/{session_id}", status_code=204)
async def delete_session(session_id: str) -> None:
    """Clear the conversation history for a session (e.g. on 'New chat')."""
    session_store.delete_session(session_id)
    logger.info("Session cleared", extra={"session_id": session_id})


@app.get("/api/tts")
async def text_to_speech(
    text: str = Query(..., min_length=1, max_length=2000),
) -> StreamingResponse:
    try:
        tts = gTTS(text=text[:2000], lang="en")
        buffer = io.BytesIO()
        tts.write_to_fp(buffer)
        buffer.seek(0)
        return StreamingResponse(buffer, media_type="audio/mpeg")
    except Exception as exc:
        logger.error("TTS failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=f"TTS failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=BACKEND_PORT,
        reload=False,
        log_config=None,  # use our own logging config
        access_log=False,  # avoid double-logging; use middleware if needed
    )