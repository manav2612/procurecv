from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(url: str) -> str:
    """Managed Postgres providers (Neon, Render, Supabase, ...) hand out plain
    postgres://... or postgresql://... connection strings; SQLAlchemy needs the
    driver named explicitly (postgresql+psycopg2://...). Normalizing in one
    place means it doesn't matter which scheme a given host gives us — one
    less way to misconfigure DATABASE_URL. Used by both Settings below and
    alembic/env.py, which reads the env var directly and would otherwise skip
    this."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg2://" + url[len(prefix):]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://procurecv:procurecv@localhost:5432/procurecv"

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, v: str) -> str:
        return normalize_database_url(v)


settings = Settings()
