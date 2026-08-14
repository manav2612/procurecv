# ProcureCV — TODO

Checklist form of `PLAN.md`. Check items off as they're completed.

## Phase 1 — Scaffolding
- [x] `git init`, initial commit
- [x] `CLAUDE.md` (project purpose, stack, structure, conventions)
- [x] `/checkpoint` skill (`git add -A && git commit -m "checkpoint: <label|timestamp>"`)
- [x] Repo layout: `backend/`, `frontend/`, top-level `README.md`
- [x] `.gitignore` (Python, Node, env files, model weights cache)

## Phase 2 — Backend skeleton
- [x] FastAPI app scaffold (`backend/app/main.py`)
- [x] SQLAlchemy models: `TranscriptionSession` (table `sessions`), `TranscriptSegment`
- [x] Alembic setup + initial migration (generated/verified against SQLite — no Docker in this sandbox; re-verify against real Postgres when available)
- [x] REST CRUD: `GET/POST /api/sessions`, `GET/PUT/DELETE /api/sessions/{id}`, `POST /api/sessions/{id}/segments`, `PUT/DELETE /api/segments/{id}`
- [x] Local Postgres via docker-compose for dev (`docker-compose.yml`, untested locally — no Docker in this sandbox)

## Phase 3 — STT integration
- [x] Install & smoke-test `faster-whisper` standalone on a sample WAV file (used gTTS-generated English/Hindi/mixed samples, since no real mic input in this sandbox)
- [x] Pick model size — benchmarked tiny/base/small; `small` chosen as default (only one giving correct Devanagari for Hindi, at the cost of a few seconds latency per chunk — see PLAN.md tradeoffs)
- [x] WebSocket endpoint `/ws/transcribe/{session_id}`: receive chunked audio, run inference
- [x] Persist finalized segments to DB as they're produced, streamed back to client as JSON (real-time "partial" streaming mid-chunk not implemented — only per-chunk finals; noted as a partial-completion tradeoff)

## Phase 4 — Frontend: live transcription
- [x] Vite + React + TS scaffold
- [x] Mic capture via `MediaRecorder`, VAD-based chunking (cuts on speech pauses, not a blind timer — one fresh recorder instance per chunk; see `useTranscription.ts` for why)
- [x] WebSocket client with a proper handshake (`ready`/`processing`/`chunk_done`/`ping`-`pong`), live transcript display
- [x] Session start/stop controls, with live "listening / hearing you / transcribing" status indicator
- Verified: full protocol sequence (ready -> processing -> final -> chunk_done -> ping/pong) confirmed against the live running backend with a real Node WebSocket client sending real audio — not just unit tests. The dashboard's session CRUD was also exercised live through the browser during manual verification. Actual mic capture (MediaRecorder + VAD thresholds) still hasn't been exercised with a real microphone in this environment — no audio input device here — so the VAD thresholds are unvalidated against real hardware/room noise.

## Phase 5 — Frontend: dashboard
- [x] List view of past sessions/transcriptions (expand a session to load its segments)
- [x] Search/filter (client-side, by session id/language/status)
- [x] Edit transcript text (PUT)
- [x] Delete session/segment (DELETE)
- Verified: full CRUD lifecycle smoke-tested against a live backend via curl
  (create session → create segment → get with nested segments → update
  segment → delete segment → delete session → 404), confirming the REST
  contract matches `types.ts`/`api.ts` exactly. UI itself not clicked through
  in a real browser (no display in this sandbox) — build/typecheck/lint pass.

## Phase 6 — Multilingual validation
- [ ] Test recordings: pure Hindi, pure English, mixed code-switch sentences
- [ ] Tune chunk size / model size for acceptable accuracy vs latency
- [ ] Document known accuracy limitations in README

## Phase 7 — Dockerize + deploy
- [ ] `Dockerfile` for backend (serves built frontend static assets)
- [ ] `docker-compose.yml` for local full-stack dev
- [ ] Provision free-tier managed Postgres (Neon/Supabase)
- [ ] Deploy to a free cloud host (Render/Railway/Fly.io — decide at this phase)
- [ ] Verify deployed URL end-to-end (record → transcribe → appears in dashboard)

## Phase 8 — Wrap-up
- [ ] `README.md`: setup instructions, architecture diagram, known limitations
- [ ] Push to GitHub (public or invite reviewer)
- [ ] Capture GitHub repo link + deployed app link
- [ ] Ready to submit to `govardhan.sherkhane@procucev.com` (submission itself is your call, not automated)
