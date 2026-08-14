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
- [ ] Vite + React + TS scaffold
- [ ] Mic capture via `MediaRecorder`, chunked upload (~3s)
- [ ] WebSocket client, live transcript display
- [ ] Session start/stop controls

## Phase 5 — Frontend: dashboard
- [ ] List view of past sessions/transcriptions
- [ ] Search/filter
- [ ] Edit transcript text (PUT)
- [ ] Delete session/segment (DELETE)

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
