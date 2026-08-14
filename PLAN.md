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
  ├─ AnalyserNode watches mic RMS energy (VAD); MediaRecorder captures a
  │   chunk from speech-onset to speech-pause (or a max-duration cap) —
  │   not a blind fixed-length timer
  ├─ WebSocket → /ws/transcribe/{session_id}  (live streaming transcription,
  │   with a ready/processing/chunk_done/ping-pong protocol — see below)
  └─ REST client → /api/... (dashboard CRUD)

FastAPI backend
  ├─ WebSocket endpoint: sends a "ready" handshake, then per audio chunk runs
  │   faster-whisper inference (finalized segments only — no interim/partial
  │   text within a chunk, that's a known scope cut), appends segments to DB,
  │   and replies "processing" -> zero-or-more "final" -> always "chunk_done"
  ├─ REST CRUD endpoints: sessions & transcript segments
  ├─ faster-whisper model: lazy-loaded singleton (first WS message pays the
  │   ~30-60s load cost, not app startup — keeps the CRUD test suite fast/
  │   offline), inference serialized process-wide via a threading.Lock since
  │   ctranslate2 isn't safe/efficient for concurrent calls into one model
  └─ SQLAlchemy models + Alembic migrations

PostgreSQL
  ├─ sessions(id, created_at, status, language_hint)
  └─ transcript_segments(id, session_id, text, start_ts, end_ts, confidence, created_at)
```

Single deployable service: FastAPI serves the built React static assets, so only one process/host is needed for deployment (simpler than separate frontend/backend hosts). DB via a free-tier managed Postgres (Neon/Supabase) so the app host stays stateless.

## Known tradeoffs (flagging honestly, not hiding them)
- True low-latency real-time STT with a self-hosted Whisper-family model on free-tier CPU hosting will feel "near real-time" (a few seconds of buffering per chunk), not instant. The assignment explicitly says partial/imperfect is fine — this will be called out in the README rather than over-promised.
- Hindi+English code-switch accuracy depends on the model size; starting with `small`/`medium` multilingual weights for reasonable CPU latency, documenting the tradeoff, and leaving room to size up if a GPU host is used instead.
- Only one chunk transcribes at a time, server-wide (see the `threading.Lock` above) — under concurrent load (multiple sessions/tabs at once) chunks queue up rather than running in parallel. Correct and predictable, but means latency scales with how many sessions are active simultaneously, not just per-session. A real production version would need multiple model workers/replicas to fix that; out of scope here.
- No interim/word-by-word streaming within a chunk — you only see text once a whole VAD-detected chunk finishes transcribing. Genuinely incremental ASR (partial hypotheses mid-utterance) would need a different model/architecture; this is a deliberate, documented scope cut, not an oversight.
- **Code-switched Hindi+English is the weakest case, measured not guessed** (Phase 6 validation, see `TODO.md` for the full writeup): Whisper forces a chunk's auto-detected dominant language onto the whole chunk, so English words inside mostly-Hindi audio get phonetically transliterated into unreadable Devanagari instead of staying in Latin script. Confidence scores reliably flag this (0.38-0.48 on garbled code-switch output vs 0.74+ on clean single-language audio) — worth surfacing in the UI as a trust signal if this were taken further.
- **Chunk boundaries must land on natural pauses, not arbitrary fixed points — this is now evidence-backed, not just a design hunch.** Splitting one 24s code-switched clip at naive fixed timestamps made a single chunk take 136s (6x the whole-clip baseline) because the cut landed mid-phrase and triggered Whisper's internal retry/temperature-fallback decoding on the ambiguous boundary audio. This is exactly what the VAD-based chunking (cuts on a speech pause, see Phase 4) is protecting against, and the benchmark now proves the failure mode it avoids rather than just asserting it would help. Bonus finding: chunks that happen to land on purely-English speech within a code-switched conversation transcribe *better* in isolation than as part of a longer Hindi-dominant chunk — a possible future refinement (bias VAD chunk boundaries toward language transitions), not implemented.
- Latency correlates with decode difficulty (how much Whisper's internal retry logic kicks in on uncertain audio), not raw audio duration — a harder-to-transcribe 12s chunk took longer (136s) than an easier 24s chunk (25s). "Real-time" here means "usually a few seconds," not a hard latency bound.

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
