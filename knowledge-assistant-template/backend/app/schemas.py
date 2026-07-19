from typing import Literal
from pydantic import BaseModel, Field


class Source(BaseModel):
    id: str
    title: str
    location: str            # e.g. "Section 4.1 · p. 21"
    excerpt: str


class QueryRequest(BaseModel):
    question: str


class AnswerResponse(BaseModel):
    role: Literal["assistant"] = "assistant"
    text: str                 # may contain [1], [2]... citation markers
    confidence: float = Field(ge=0, le=1)
    sources: list[Source]


class Conversation(BaseModel):
    id: str
    title: str


class DocumentStatus(BaseModel):
    id: str
    name: str
    status: Literal["uploading", "indexed", "failed"]
