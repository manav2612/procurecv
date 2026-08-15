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

## Deploying (Render + Neon, both free, no card required)

1. **Database — [Neon](https://neon.tech)**: create a free project, copy its
   connection string (the `postgresql://...` one, not the pooled variant —
   psycopg2 doesn't need pooling for this app's traffic). It should look like
   `postgresql://<user>:<password>@<host>/<db>?sslmode=require`.
2. **Web service — [Render](https://render.com)**: push this repo to GitHub,
   then in Render either apply [`render.yaml`](./render.yaml) as a Blueprint
   (New -> Blueprint, point at the repo) or create a Web Service manually
   with runtime "Docker" and the same settings it describes.
3. In the Render dashboard, set the `DATABASE_URL` env var to the Neon
   connection string from step 1 (`render.yaml` deliberately leaves it unset
   — `sync: false` — since it's a secret, not something to commit).
4. Deploy. Render builds the `Dockerfile` and runs `alembic upgrade head`
   automatically on container start (see the `Dockerfile`'s `CMD`), so the
   schema gets created against Neon on first boot — no separate migration
   step needed.

**Why `render.yaml` sets `WHISPER_MODEL_SIZE=base` instead of the app's own
`small` default**: Render's free plan gives 512MB RAM, and `small` needs
more than that to load reliably — it'll likely get OOM-killed. `base` fits,
at the cost of the Hindi mis-scripting issue documented above under "Known
accuracy limitations." If you deploy somewhere with more RAM (a paid plan,
or a different host), remove that override so it falls back to `small`.

**Expect a slow first request after any idle period**: Render's free plan
spins the container down after ~15 minutes of inactivity (cold start ~30-60s
on the next request), Neon auto-suspends similarly, and the Whisper model
itself is lazy-loaded on the first WebSocket message (another ~30-60s the
very first time, less once the model is cached). Stacked together, the
first real interaction after a period of inactivity could take a minute or
two before it feels responsive — normal for this setup, not a bug.

**Not yet verified**: I don't have Render/Neon accounts or credentials, so
this config is prepared and validated as thoroughly as possible from here
(Dockerfile logic verified by running the equivalent single-service setup
locally without Docker — see "Serve built frontend from FastAPI" — plus
YAML/schema validation of `render.yaml` and `docker-compose.yml`), but the
actual deploy has to be run by you. Please report back what you find so this
can be fixed forward if something doesn't work as expected.

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
