"""
Orchestrates the RAG flow: semantic search -> LLM synthesis -> formatted,
source-backed answer. This is the function the /query endpoint calls.
"""

from __future__ import annotations

from app.schemas import AnswerResponse, Source
from app.services import vector_store, llm


def answer_question(question: str) -> AnswerResponse:
    hits = vector_store.search(question)

    passages = [{"text": h["text"], "metadata": h["metadata"]} for h in hits]
    result = llm.synthesize_answer(question, passages)

    sources = [
        Source(
            id=f"s{i + 1}",
            title=h["metadata"].get("source", "Untitled document"),
            location=f"Chunk {h['metadata'].get('chunk_index', i)}",
            excerpt=h["text"][:280],
        )
        for i, h in enumerate(hits)
    ]

    return AnswerResponse(
        text=result.get("text", ""),
        confidence=float(result.get("confidence", 0.5)),
        sources=sources,
    )
