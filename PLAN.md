# ProcureCV — Implementation Plan

Source: `Procucev AI Tech Hiring Assignment.pdf` — Assignment 1: Real-time Transcription.

## Assignment requirements (verbatim summary)
- Web app: real-time **Speech-to-Text**, multilingual (e.g. Hindi + English mixed in one sentence).
- Store transcriptions in a **relational DB**; transcription history visible on a dashboard with full **CRUD**.
- STT engine should be a **self-deployed open-source** service (assignment names `faster-whisper`-style local models as the kind of thing they mean; also name-checks "Gemini Live" as one *example*, not a requirement).
- TTS is optional/bonus; 3rd-party API allowed, open-source preferred.
- Partial completion is explicitly acceptable — they're assessing coding skill, not a finished product.
- Deliverables: GitHub repo link + a deployed app link (any cloud).
- Deadline: none fixed ("till the job position is vacant").

## Chosen stack (confirmed)
- **Backend**: Python + FastAPI
- **Frontend**: React (Vite + TypeScript)
- **Database**: PostgreSQL (SQLAlchemy + Alembic migrations)
- **STT engine**: self-hosted `faster-whisper`, multilingual model, CPU-friendly quantization (int8), auto language detection (no forced single language, so Hindi/English code-switching is handled as one stream)
- **Reference only**: the previously-cloned `navin-chaudhary/text-to-speech` repo (FastAPI + WebSocket/SSE chunked-audio pattern) — informs the streaming architecture below, not copied wholesale.

## Architecture

```
Browser (React)
  ├─ MediaRecorder captures mic audio in ~3s chunks
  ├─ WebSocket → /ws/transcribe/{session_id}  (live streaming transcription)
  └─ REST client → /api/... (dashboard CRUD)

FastAPI backend
  ├─ WebSocket endpoint: receives audio chunks, runs faster-whisper inference,
  │   streams partial transcript back, appends finalized segments to DB
  ├─ REST CRUD endpoints: sessions & transcript segments
  ├─ faster-whisper model loaded once at startup (small/medium, int8, CPU)
  └─ SQLAlchemy models + Alembic migrations

PostgreSQL
  ├─ sessions(id, created_at, status, language_hint)
  └─ transcript_segments(id, session_id, text, start_ts, end_ts, confidence, created_at)
```

Single deployable service: FastAPI serves the built React static assets, so only one process/host is needed for deployment (simpler than separate frontend/backend hosts). DB via a free-tier managed Postgres (Neon/Supabase) so the app host stays stateless.

## Known tradeoffs (flagging honestly, not hiding them)
- True low-latency real-time STT with a self-hosted Whisper-family model on free-tier CPU hosting will feel "near real-time" (a few seconds of buffering per chunk), not instant. The assignment explicitly says partial/imperfect is fine — this will be called out in the README rather than over-promised.
- Hindi+English code-switch accuracy depends on the model size; starting with `small`/`medium` multilingual weights for reasonable CPU latency, documenting the tradeoff, and leaving room to size up if a GPU host is used instead.

## Phases

1. **Scaffolding** — git init, `CLAUDE.md`, `/checkpoint` skill (as originally requested), repo layout (`backend/`, `frontend/`).
2. **Backend skeleton** — FastAPI app, SQLAlchemy models, Alembic migration, REST CRUD for sessions/segments (no STT yet, so the dashboard has something to talk to).
3. **STT integration** — load `faster-whisper`, build a standalone test script against a sample audio file before wiring it to the WebSocket, then add the streaming WebSocket endpoint.
4. **Frontend: live transcription** — mic capture, WebSocket client, live transcript view.
5. **Frontend: dashboard** — list/search/edit/delete transcription history, wired to REST CRUD.
6. **Multilingual validation** — test with mixed Hindi/English recordings, tune chunking/model size.
7. **Dockerize + deploy** — Dockerfile, docker-compose for local dev, deploy backend+frontend as one service, Postgres on a free managed host, verify the public URL works end-to-end.
8. **Wrap-up** — README (setup, architecture, known limitations), push to GitHub, capture the deployed link, ready for submission to `govardhan.sherkhane@procucev.com`.

See `TODO.md` for the granular checklist.
