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

Run the fast test suite (CRUD only, in-memory SQLite, no Postgres/model
needed):

```bash
pytest
```

Run the real speech-to-text integration test too (loads the actual
`faster-whisper` model — first run downloads it, ~1-2 min; cached after that):

```bash
pytest -m slow
```

### Real-time transcription (WebSocket)

`ws://localhost:8000/ws/transcribe/{session_id}` — create a session via
`POST /api/sessions` first, then connect. Send one self-contained audio blob
per WebSocket message (e.g. a few seconds of WAV/WebM from the browser's
`MediaRecorder`); the server replies with one JSON message per finalized
segment: `{"type": "final", "id", "text", "start_ts", "end_ts", "confidence"}`,
persisting each segment to the DB as it's produced. See
`backend/app/routers/transcribe.py` for the full protocol notes and known
approximations (timestamps are wall-clock-based, not sample-accurate).

The Whisper model size defaults to `small` (set `WHISPER_MODEL_SIZE` env var
to override) — benchmarked against `tiny`/`base` on this CPU, `small` is the
only one that reliably transcribes Hindi into correct Devanagari instead of
mis-scripted gibberish; the tradeoff is a few seconds of latency per chunk
(near-real-time, not sub-second). See `PLAN.md`'s "known tradeoffs" section.

## Status

Phase 1 (scaffolding), Phase 2 (backend skeleton), and Phase 3 (STT
integration: `faster-whisper`, WebSocket streaming endpoint) are done. The
frontend is not built yet — see `TODO.md`.

Note: this dev sandbox has no Docker available, so the backend was validated
against an in-memory SQLite DB via the test suite rather than a live Postgres
instance. The generated Alembic migration uses dialect-agnostic SQLAlchemy
Core operations, so it applies the same way against Postgres — but running
it against real Postgres once Docker/a DB is available is worth doing before
you consider this phase fully verified end-to-end.
