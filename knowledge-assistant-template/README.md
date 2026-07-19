# Knowledge Assistant — Template

A ready-to-use skeleton for an enterprise AI application: ingest documents,
retrieve relevant passages with semantic search, and answer questions with
source-backed, citation-linked responses. Built to be adapted to any
domain (legal, HR, finance, support, product docs...) — swap the data,
prompts, and branding, keep the architecture.

```
knowledge-assistant/
├── frontend/     React + Vite single-page UI
└── backend/      FastAPI RAG service (ingestion, retrieval, LLM synthesis)
```

## What's included

- **Evidence-linked chat UI** — every answer's `[1] [2]` citation markers
  are clickable and sync to source cards in a right-hand Evidence panel,
  so users can verify a claim without leaving the conversation.
- **Document ingestion** — drag-and-drop upload modal on the frontend,
  parsing (PDF/DOCX/TXT/MD + a generic fallback) and chunking on the backend.
- **Pluggable RAG pipeline** — vector store (Chroma by default), embeddings,
  and the LLM call are each isolated in `backend/app/services/`, so you can
  swap providers without touching routes or the UI.
- **Demo mode** — the frontend runs standalone with mock data
  (`VITE_DEMO_MODE=true`, the default) so you can see and iterate on the UI
  before the backend is wired up.

## Quickstart

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, demo mode on by default
```

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # add your ANTHROPIC_API_KEY
uvicorn app.main:app --reload --port 8000
```

Then in `frontend/.env` set `VITE_DEMO_MODE=false` and restart `npm run dev`.
Vite proxies `/api/*` to `http://localhost:8000` (see `vite.config.js`).

## Adapting this template to your use case

| To change...                      | Edit...                                                  |
|------------------------------------|-----------------------------------------------------------|
| Branding, colors, copy             | `frontend/src/index.css`, `Sidebar.jsx`, `Header.jsx`     |
| Suggested starter prompts          | `frontend/src/data/mockData.js`                           |
| How documents are parsed/chunked   | `backend/app/services/ingestion.py`                        |
| Vector store / embedding provider  | `backend/app/services/vector_store.py`                      |
| LLM provider / answer prompt       | `backend/app/services/llm.py`                                |
| API routes / conversation storage  | `backend/app/main.py`, `backend/app/store.py`                 |

## Notes on production-readiness

This is a skeleton, not a deployed system. Before shipping:
- Replace the in-memory `store.py` with a real database.
- Add auth (the CORS + route layer currently has none).
- Point `vector_store.py` at a managed vector DB and an explicit embedding
  function (the current Chroma default embedder is fine for prototyping only).
- Add streaming responses (SSE/WebSocket) for long answers if latency matters.
