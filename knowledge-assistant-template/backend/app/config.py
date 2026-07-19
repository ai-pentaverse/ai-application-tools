from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central config. Values are read from environment / .env file."""

    app_name: str = "Knowledge Assistant API"

    # LLM provider
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-4-6"

    # Retrieval
    vector_store_path: str = "./data/chroma"
    collection_name: str = "knowledge_base"
    embedding_model: str = "text-embedding-3-small"  # swap for your embedder
    top_k: int = 5
    chunk_size: int = 800
    chunk_overlap: int = 120

    # CORS — set to your deployed frontend origin(s) in production
    allowed_origins: list[str] = ["http://localhost:5173"]

    class Config:
        env_file = ".env"


settings = Settings()
