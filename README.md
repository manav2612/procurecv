# Speech to Text

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
why `medium` over `tiny`/`base`/`small`) as annotated sticky notes, not just a
box diagram.

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

The Whisper model size defaults to `medium` (set `WHISPER_MODEL_SIZE` env
var to override — no host in this repo does, on purpose, see "Deploying"
below). Benchmarked `tiny`/`base`/`small` on CPU: `small` was the smallest
size that reliably transcribed Hindi into correct Devanagari instead of
mis-scripted gibberish (see `PLAN.md`'s "known tradeoffs"). Bumped to
`medium` for better accuracy once real hardware (a self-hosted server) was
available — verified it loads and transcribes correctly (confirmed against
`tests/fixtures/english.mp3`) before making it the default. Costs more
latency and RAM than `small`; fine on real hardware, likely too much for
constrained free-tier hosts (see "Hosting decision, honestly").

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

## Deploying

**One model size everywhere, on purpose.** `WHISPER_MODEL_SIZE` is never
overridden per-host (not in `docker-compose.yml`, `fly.toml`, or
`render.yaml`) — every deployment target runs the app's own default,
`medium`, chosen for accuracy now that real hardware (a self-hosted server)
is available (see `PLAN.md`). Behavior shouldn't silently differ depending
on where it's deployed; if a given host's hardware can't handle `medium`
well, that's accepted and documented as a tradeoff of that host (see
"Hosting decision, honestly" below), not solved by quietly running a
different, less accurate model there.

### Primary: your own server

```bash
git clone https://github.com/manav2612/speech-to-text.git
cd speech-to-text
docker compose up --build app
```

Brings up the full app (API, WebSocket, and the built frontend, all from
one container) plus a local Postgres (`db` service), wired together
automatically — no env vars to configure. Recommended over any free managed
host when you have real hardware available: no RAM ceiling, no shared-CPU
slowdown, no card requirement, nothing to fight.

### Alternative: Render (free, no card, but slow)

`render.yaml` provisions both the web service **and** a Postgres database
on Render, wired together automatically (`fromDatabase`).

1. Push this repo to GitHub.
2. In Render: **New -> Blueprint**, point it at the repo. Render reads
   `render.yaml` and shows you both resources it will create (the
   `speech-to-text` web service and the `speech-to-text-db` database).
3. Click **Apply**. No env vars to fill in by hand.
4. Render builds the `Dockerfile` and runs `alembic upgrade head`
   automatically on container start, creating the schema on first boot.

Honest expectation: Render's free plan gives 512MB RAM and a heavily
*shared* (not dedicated) sliver of CPU. This was already confirmed too slow
to usably process audio chunks running the smaller `small` model; now that
the app's default is `medium` (heavier still, chosen once real hardware
became the primary target — see above), Render is likely to fail loading
the model at all on 512MB, not just run slowly. That's a real limitation of
this specific free tier, not a bug — see "Known accuracy limitations" above
and "Hosting decision, honestly" below. If you actually need Render to
work, override `WHISPER_MODEL_SIZE` down to `tiny`/`base` for that
deployment specifically; this repo just doesn't do that by default anymore
(see "One model size everywhere" above for why).

### Hosting decision, honestly

This app ended up evaluating three managed hosts, in order, hitting a real
and different blocker at each, before landing on self-hosting instead:

1. **Render** — genuinely free, no card, and both the Postgres wiring and
   single-service static-file serving worked correctly (confirmed live).
   The blocker: 512MB RAM and heavily shared CPU couldn't run `faster-whisper`
   at a usable speed.
2. **Fly.io** — would likely have fixed the speed problem (dedicated, not
   shared, CPU/RAM per machine; `fly.toml` in this repo reflects that
   config, 2GB VM). Blocker: requires a card on file, a hard constraint here.
3. **Hugging Face Spaces** — investigated based on a claim (mine, and
   wrong) that its free tier had a generous CPU option. It doesn't: Docker
   and `cpu-basic` both require a paid plan; the only free option with real
   compute is ZeroGPU, which is GPU-only and built around Gradio's UI
   component model — it doesn't fit this app's shape (a custom FastAPI +
   WebSocket server with its own React frontend) without a substantial
   rewrite. Ruled out once this was actually checked against Hugging Face's
   own current documentation rather than assumed.

With a real server available, self-hosting sidesteps all three constraints
at once (RAM ceiling, shared CPU, card requirement) — so that's now the
primary path, with Render kept documented as the free/no-card fallback,
honestly slower. `render.yaml` and `fly.toml` are kept in the repo rather
than deleted, since the config and lessons in each remain accurate
regardless of which one is actually running.

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
