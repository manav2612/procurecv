---
title: ProcureCV
emoji: 🎙️
colorFrom: purple
colorTo: blue
sdk: docker
app_port: 8000
pinned: false
---
<!--
The YAML frontmatter above is required by Hugging Face Spaces (see the
"Deploying (Hugging Face Spaces)" section below) — HF reads it to know this
is a Docker-SDK Space and which port the container listens on. It's inert
everywhere else (GitHub renders it as a plain horizontal-rule-delimited
block, ignored by every other tool that reads this file).
-->

# ProcureCV

Real-time, multilingual (Hindi + English) Speech-to-Text web application with a
transcription-history dashboard — built for the Procucev AI Tech hiring assignment.

- **Backend**: Python (FastAPI) + PostgreSQL, self-hosted `faster-whisper` for STT
- **Frontend**: React + TypeScript (Vite)

See [`PLAN.md`](./PLAN.md) for the architecture and [`TODO.md`](./TODO.md) for
current progress. [`architecture.excalidraw`](./architecture.excalidraw) is a
minimal, editable visual map of the same architecture (open at
[excalidraw.com](https://excalidraw.com) via File → Open, or the VS Code
Excalidraw extension) — which files do what, the request/data flow, and the
key design decisions (why VAD-based chunking, why one locked model instance,
why `small` over `tiny`/`base`) as annotated sticky notes, not just a box
diagram.

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
`POST /api/sessions` first, then connect. Protocol:

1. Server sends `{"type": "ready", "session_id", "language_hint"}` once it's
   accepted the connection and confirmed the session exists.
2. Client sends one self-contained audio blob per binary message (each chunk
   must decode independently — see the frontend's VAD-based chunking below).
3. Per chunk, server sends `{"type": "processing"}`, then zero or more
   `{"type": "final", "id", "text", "start_ts", "end_ts", "confidence"}`
   (persisted to the DB as each is produced), then always
   `{"type": "chunk_done", "segment_count"}` — so the client can reliably
   track in-flight chunks even when one produces no text (e.g. silence).
4. Client can send `{"type": "ping"}` any time -> server replies
   `{"type": "pong"}` (heartbeat, keeps idle connections/proxies alive).
   `{"type": "stop"}` ends the loop from the client side.

See `backend/app/routers/transcribe.py` for the full protocol docstring and
known approximations (timestamps are wall-clock-based, not sample-accurate).

The frontend doesn't chunk on a blind fixed timer — `useTranscription.ts`
watches mic energy (RMS via `AnalyserNode`) and cuts a chunk when the speaker
pauses (or after a max-duration cap for long uninterrupted speech), so short
utterances get sent — and transcribed — as soon as you stop talking, instead
of waiting out a fixed interval. See that file's top comment for the exact
thresholds and the honest caveat that they're tuned by guess, not measured
against real hardware.

The Whisper model size defaults to `small` (set `WHISPER_MODEL_SIZE` env var
to override) — benchmarked against `tiny`/`base` on this CPU, `small` is the
only one that reliably transcribes Hindi into correct Devanagari instead of
mis-scripted gibberish; the tradeoff is a few seconds of latency per chunk
(near-real-time, not sub-second). See `PLAN.md`'s "known tradeoffs" section.

### Known accuracy limitations (measured, Phase 6)

Real transcriptions against known ground truth, not a general disclaimer:

- **English: essentially solved.** Exact word-for-word matches in testing, ~6s latency, confidence 0.74-0.79.
- **Pure Hindi: good on clips with a few seconds of speech, shaky on very short ones.** A ~8s Hindi sentence came back in correct, readable Devanagari with only minor spelling slips. A ~3s Hindi clip mis-scripted entirely into Perso-Arabic script instead of Devanagari.
- **Code-switched Hindi+English — the real weak point, and exactly the assignment's core scenario.** Whisper locks onto one auto-detected language per chunk, so English words inside mostly-Hindi speech get phonetically transliterated into Devanagari instead of staying in Latin script:
  > expected: *"...aur main ek full stack **developer** hoon."*
  > got: *"...और मैं एक फुल स्टाक **धवलड़पा** हूँ"*

  Confidence reliably flags this (0.38-0.48 on garbled code-switch output vs 0.74+ on clean single-language audio) — a segment's `confidence` field is a decent "trust this less" signal if you're reviewing the dashboard.
- **Chunk boundaries matter more than chunk size.** Splitting one clip at an arbitrary fixed timestamp (not a natural pause) made a chunk take 6x longer to transcribe than the same audio as one piece, because the cut landed mid-phrase and triggered Whisper's internal retry decoding on the ambiguous boundary. This is the concrete evidence behind the VAD-based chunking design above — it's not just a hunch that pause-aligned cuts would help, a fixed-point cut was measurably worse. Full writeup with numbers: `TODO.md`'s Phase 6 section.

## Frontend setup

See `frontend/README.md`. Quick start:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev   # http://localhost:5173 — expects the backend running on :8000
```

## Running the full stack in Docker

```bash
docker compose up --build app   # also brings up the `db` (Postgres) service
```

Serves the whole app — API, WebSocket, and the built frontend — from one
container on http://localhost:8000 (see `Dockerfile`: a Node stage builds
`frontend/dist`, a Python stage serves it via FastAPI's `StaticFiles` mount
in `app/main.py`). This is what actually gets deployed; the split
`uvicorn --reload` + `npm run dev` setup above is just for day-to-day dev.

## Deploying (Hugging Face Spaces, free, no card required)

**Current recommendation**, after Render's free tier (512MB RAM, heavily
shared CPU) proved too constrained to run `faster-whisper` usefully — even
its lighter `base` model struggled. Hugging Face Spaces' free CPU tier gives
**16GB RAM**, no credit card required, and takes this repo's existing
`Dockerfile` as-is (Space type: Docker, configured via the YAML frontmatter
at the very top of this file).

1. Create a Hugging Face account (free) at huggingface.co if you don't have
   one, then create a new Space: **huggingface.co/new-space**, SDK = **Docker**.
2. Push this repo's code to the Space (Spaces are git repos) — either
   `git push` directly to the Space's git URL, or connect it to this GitHub
   repo if your plan supports that sync.
3. In the Space's **Settings -> Repository secrets**, add `DATABASE_URL` —
   reuse a Neon connection string (free, doesn't expire; see below) or any
   Postgres instance. The app accepts either `postgres://...` or
   `postgresql://...` directly (see `app/config.py`'s
   `normalize_database_url`) — no manual scheme editing needed.
4. The Space builds the `Dockerfile` and starts the container automatically.
   `alembic upgrade head` runs on every start (see the `Dockerfile`'s `CMD`),
   creating the schema on first boot.

With 16GB available, `WHISPER_MODEL_SIZE` doesn't need to be downgraded —
the app's own `small` default (chosen for Hindi accuracy, see `PLAN.md`)
should run comfortably; set it as a Space secret/variable only if you want
to override it.

**Database — Neon** (free, doesn't expire, no card): create a project at
neon.tech, copy its connection string, and paste it into the Space's
`DATABASE_URL` secret. This exact path (Neon + this app) was already
verified for real earlier — see `TODO.md` Phase 7: a live `alembic upgrade
head` and a full CRUD round-trip both ran successfully against it.

**Verification status**: the backend-to-Postgres path (Neon) and the
Dockerfile's build logic are both independently verified for real. The
Hugging Face Space itself — actually building and serving traffic there —
isn't, since I don't have an HF account; that needs confirming by whoever
runs the deploy.

### Previously tried: Render (documented for reference, not recommended)

`render.yaml` and `fly.toml` are still in this repo from evaluating Render
and Fly.io before landing on Hugging Face Spaces. Render's free plan
deployed successfully (the Postgres wiring and single-service static
serving both worked, and both are exercised the same way regardless of
host) but couldn't run the model at a usable speed — 512MB RAM forced a
downgrade to `WHISPER_MODEL_SIZE=base`, and the free plan's heavily shared
CPU still made even that too slow to reliably process audio chunks. Fly.io
would likely have solved the resource problem (dedicated, not shared,
CPU/RAM) but requires a card on file, which was a hard constraint. Kept
here rather than deleted, since the Postgres-wiring and single-service
lessons documented in `TODO.md` are still accurate and useful regardless of
which host is actually used.

## Status

Phases 1-6 are done: scaffolding, backend skeleton, STT integration,
live-transcription frontend, the CRUD dashboard, and multilingual validation
(see "Known accuracy limitations" above). Phase 7 (Docker + deploy config)
is prepared and locally verified where possible, but the actual Render web
service deploy still needs to be run by you — see "Deploying" above and
`TODO.md`.

Honest caveats (no display/mic/Docker in this dev sandbox):
- **Mic recording (Phase 4)**: verified via build, typecheck, lint, and a
  dev-server smoke test — not a live browser session with real mic input.
- **Dashboard (Phase 5)**: the REST contract it depends on was verified
  end-to-end against a live backend via curl (create → nested-get → update →
  delete, matching `types.ts` exactly); the UI itself hasn't been clicked
  through in a real browser.
- **Postgres**: ~~all backend testing used SQLite~~ — updated 2026-08-15:
  the Alembic migration and a full CRUD round-trip (create session, create
  segment, nested fetch, cascade delete) have now been run against a real
  Neon Postgres instance and passed. Backend-DB integration is verified;
  what's left is exercising it through the actual deployed Render service
  and a real browser.

Exercise the deployed app in an actual browser before considering the whole
system fully verified end-to-end — the backend-to-Postgres path is now
confirmed for real, but the deploy itself and the live mic-to-dashboard flow
still aren't.
