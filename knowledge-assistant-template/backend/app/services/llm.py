"""
LLM call wrapper. Swap the provider here (OpenAI, Bedrock, Azure, etc.)
without touching the retrieval/API layers.
"""

from __future__ import annotations
import json

from anthropic import Anthropic

from app.config import settings

_client = Anthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """You are an enterprise knowledge assistant. Answer the user's \
question using ONLY the provided context passages. Every factual claim must be \
followed by a citation marker like [1], [2] referencing the passage number it \
came from. If the context does not contain enough information to answer \
confidently, say so plainly instead of guessing.

Respond with a single JSON object matching this schema, and nothing else:
{
  "text": "<answer with inline [n] citation markers>",
  "confidence": <float 0-1, your calibrated confidence in this answer>
}"""


def synthesize_answer(question: str, passages: list[dict]) -> dict:
    """passages: list of {"text": ..., "metadata": {...}} from vector_store.search().
    Returns {"text": ..., "confidence": ...} — sources/ids are attached by the
    caller (retrieval.py), since the LLM only needs to number them.
    """
    context = "\n\n".join(
        f"[{i + 1}] {p['text']}" for i, p in enumerate(passages)
    )

    message = _client.messages.create(
        model=settings.llm_model,
        max_tokens=1000,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Context passages:\n\n{context}\n\nQuestion: {question}",
            }
        ],
    )

    raw = "".join(block.text for block in message.content if block.type == "text")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Model didn't return clean JSON — fail safe rather than crash the request.
        return {"text": raw, "confidence": 0.5}
