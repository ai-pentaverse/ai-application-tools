"""
Document ingestion: parse an uploaded file into plain text, then split it
into overlapping chunks suitable for embedding.

This is the layer to extend per use case — e.g. add table-aware parsing
for financial reports, or slide-aware parsing for decks.
"""

from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path

from app.config import settings


@dataclass
class Chunk:
    text: str
    metadata: dict


def parse_file(path: Path) -> str:
    """Extract raw text from a file. Dispatches by extension."""
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)

    if suffix == ".docx":
        from docx import Document

        doc = Document(str(path))
        return "\n".join(p.text for p in doc.paragraphs)

    if suffix in (".txt", ".md", ".csv"):
        return path.read_text(errors="ignore")

    # Fallback: let `unstructured` figure it out (html, pptx, etc.)
    from unstructured.partition.auto import partition

    elements = partition(filename=str(path))
    return "\n\n".join(str(el) for el in elements)


def chunk_text(text: str, source_name: str) -> list[Chunk]:
    """Naive fixed-size chunking with overlap. Swap in a semantic/
    recursive splitter (e.g. langchain's RecursiveCharacterTextSplitter)
    for higher-quality retrieval."""
    size = settings.chunk_size
    overlap = settings.chunk_overlap
    chunks: list[Chunk] = []

    start = 0
    idx = 0
    while start < len(text):
        end = start + size
        piece = text[start:end].strip()
        if piece:
            chunks.append(
                Chunk(
                    text=piece,
                    metadata={"source": source_name, "chunk_index": idx},
                )
            )
            idx += 1
        start += size - overlap

    return chunks


def ingest_file(path: Path) -> list[Chunk]:
    text = parse_file(path)
    return chunk_text(text, source_name=path.name)
