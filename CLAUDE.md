# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repo.

## What this project is

ProcureCV is a real-time, multilingual (Hindi + English code-switching) Speech-to-Text
web application with a database-backed transcription history dashboard (full CRUD).
It's being built as a coding assignment for a Procucev Enterprises hiring process —
see `PLAN.md` for the full requirements breakdown and `TODO.md` for progress.
Partial/incomplete features are acceptable per the assignment brief; prioritize a
working vertical slice over polish.

## Stack

- **Backend**: Python, FastAPI, SQLAlchemy + Alembic, PostgreSQL
- **STT engine**: self-hosted `faster-whisper` (multilingual, auto language detection —
  do not force a single language, since Hindi/English code-switching is a core requirement)
- **Frontend**: React + TypeScript, built with Vite
- **Deployment target**: single service — FastAPI serves the built frontend static
  assets, with a free-tier managed Postgres (Neon/Supabase) as the DB
- **Real-time protocol**: the `/ws/transcribe/{session_id}` WebSocket has a small
  JSON handshake/control protocol (`ready`, `processing`, `final`, `chunk_done`,
  `ping`/`pong`, `stop`) layered on top of the raw audio-chunk bytes — see the
  docstring in `backend/app/routers/transcribe.py` before changing it.

## Structure

```
backend/     FastAPI app, SQLAlchemy models, Alembic migrations, faster-whisper integration
frontend/    React + TS app (Vite) — mic capture, live transcript view, CRUD dashboard
PLAN.md      Architecture and phased implementation plan
TODO.md      Granular checklist, mirrors PLAN.md phases
```

## Conventions

- Follow the phase order in `TODO.md`; check items off as they're completed rather
  than jumping ahead, since later phases assume earlier ones are working.
- Keep the WebSocket streaming endpoint and the REST CRUD endpoints decoupled —
  the dashboard's CRUD should work even before/without STT wired up (this was
  deliberately sequenced in Phase 2 vs Phase 3 of the plan).
- Don't commit model weights, `.env` files, or `node_modules`/`__pycache__` — see
  `.gitignore`.
- Use the `/checkpoint` skill to commit work-in-progress at natural stopping points.
- **The Whisper model is a process-wide singleton behind a lock** (`get_model()` +
  `_inference_lock` in `backend/app/stt.py`). Don't add a second model instance or
  call `model.transcribe()` outside that lock — ctranslate2 isn't safe/efficient for
  concurrent calls into one model, and this app deliberately serializes all chunks
  rather than parallelizing them (see `PLAN.md`'s tradeoffs).
- **Any frontend hook/component holding a live browser resource (WebSocket,
  MediaRecorder, AudioContext, `setInterval`/`setTimeout`) must clean it up in a
  `useEffect` return, not only on an explicit user action.** `App.tsx` renders
  Record/Dashboard as an either/or, so navigating away *unmounts* the component —
  React unmounting does not tear down plain JS/DOM handles held only via refs. A
  missing cleanup here caused a real bug (orphaned recordings competing for the
  shared model, see `TODO.md`'s "Post-Phase-5 hardening").
