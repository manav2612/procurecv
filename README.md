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

## Frontend setup

See `frontend/README.md`. Quick start:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev   # http://localhost:5173 — expects the backend running on :8000
```

## Status

Phases 1-5 are done: scaffolding, backend skeleton, STT integration,
live-transcription frontend, and the CRUD dashboard. Remaining work is
multilingual validation and deployment — see `TODO.md`.

Honest caveats (no display/mic/Docker in this dev sandbox):
- **Mic recording (Phase 4)**: verified via build, typecheck, lint, and a
  dev-server smoke test — not a live browser session with real mic input.
- **Dashboard (Phase 5)**: the REST contract it depends on was verified
  end-to-end against a live backend via curl (create → nested-get → update →
  delete, matching `types.ts` exactly); the UI itself hasn't been clicked
  through in a real browser.
- **Postgres**: all backend testing used SQLite; the Alembic migration is
  dialect-agnostic but hasn't been run against real Postgres yet.

Exercise the app in an actual browser with a real Postgres instance before
considering it fully verified end-to-end.

Note: this dev sandbox has no Docker available, so the backend was validated
against an in-memory SQLite DB via the test suite rather than a live Postgres
instance. The generated Alembic migration uses dialect-agnostic SQLAlchemy
Core operations, so it applies the same way against Postgres — but running
it against real Postgres once Docker/a DB is available is worth doing before
you consider this phase fully verified end-to-end.
