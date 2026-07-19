from pathlib import Path
import shutil
import tempfile
import uuid

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.schemas import AnswerResponse, Conversation, DocumentStatus, QueryRequest
from app.services import retrieval
from app.services.ingestion import ingest_file
from app.services.vector_store import add_chunks
from app import store

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/conversations", response_model=list[Conversation])
def get_conversations():
    return store.list_conversations()


@app.post("/conversations/{conversation_id}/query", response_model=AnswerResponse)
def query(conversation_id: str, body: QueryRequest):
    store.get_or_create(conversation_id)
    if not body.question.strip():
        raise HTTPException(400, "question must not be empty")
    return retrieval.answer_question(body.question)


@app.post("/documents", response_model=DocumentStatus)
async def upload_document(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        chunks = ingest_file(tmp_path)
        # Preserve the original filename in chunk metadata, not the temp name.
        for c in chunks:
            c.metadata["source"] = file.filename
        add_chunks(chunks)
        status = "indexed"
    except Exception:
        status = "failed"
    finally:
        tmp_path.unlink(missing_ok=True)

    return DocumentStatus(id=str(uuid.uuid4()), name=file.filename, status=status)
