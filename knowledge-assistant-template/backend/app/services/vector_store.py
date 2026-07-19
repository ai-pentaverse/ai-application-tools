"""
Thin wrapper around Chroma for embedding storage + semantic search.

Swap this module out (e.g. for Pinecone, Weaviate, pgvector) without
touching the rest of the app — everything else talks to `add_chunks`
and `search` only.
"""

from __future__ import annotations
import uuid

import chromadb

from app.config import settings
from app.services.ingestion import Chunk

_client = chromadb.PersistentClient(path=settings.vector_store_path)
_collection = _client.get_or_create_collection(settings.collection_name)


def add_chunks(chunks: list[Chunk]) -> None:
    if not chunks:
        return
    _collection.add(
        ids=[str(uuid.uuid4()) for _ in chunks],
        documents=[c.text for c in chunks],
        metadatas=[c.metadata for c in chunks],
    )
    # NOTE: Chroma's default embedding function runs locally for you.
    # For production, pass an explicit `embedding_function=` when creating
    # the collection (e.g. OpenAI, Voyage, or your own embedder) so
    # ingestion and query-time embeddings always match.


def search(query: str, top_k: int | None = None) -> list[dict]:
    """Returns top_k chunks most semantically similar to `query`."""
    results = _collection.query(
        query_texts=[query],
        n_results=top_k or settings.top_k,
    )
    hits = []
    for doc, meta, dist in zip(
        results["documents"][0], results["metadatas"][0], results["distances"][0]
    ):
        hits.append({"text": doc, "metadata": meta, "distance": dist})
    return hits
