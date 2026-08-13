# ProcureCV

Real-time, multilingual (Hindi + English) Speech-to-Text web application with a
transcription-history dashboard — built for the Procucev AI Tech hiring assignment.

- **Backend**: Python (FastAPI) + PostgreSQL, self-hosted `faster-whisper` for STT
- **Frontend**: React + TypeScript (Vite)

See [`PLAN.md`](./PLAN.md) for the architecture and [`TODO.md`](./TODO.md) for
current progress.

## Backend setup

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt   # or requirements.txt for prod-only deps

cp .env.example .env                  # adjust DATABASE_URL if needed
docker compose -f ../docker-compose.yml up -d db   # local Postgres
alembic upgrade head                  # create the schema

uvicorn app.main:app --reload         # http://localhost:8000
```

Run the test suite (uses an in-memory SQLite DB, no Postgres required):

```bash
pytest
```

## Status

Phase 1 (scaffolding) and Phase 2 (backend skeleton: FastAPI app, models,
Alembic migration, REST CRUD for sessions/segments) are done. STT integration
(`faster-whisper`) and the frontend are not built yet — see `TODO.md`.

Note: this dev sandbox has no Docker available, so the backend was validated
against an in-memory SQLite DB via the test suite rather than a live Postgres
instance. The generated Alembic migration uses dialect-agnostic SQLAlchemy
Core operations, so it applies the same way against Postgres — but running
it against real Postgres once Docker/a DB is available is worth doing before
you consider this phase fully verified end-to-end.
