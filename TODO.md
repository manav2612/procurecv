# ProcureCV — TODO

Checklist form of `PLAN.md`. Check items off as they're completed.

## Phase 1 — Scaffolding
- [x] `git init`, initial commit
- [x] `CLAUDE.md` (project purpose, stack, structure, conventions)
- [x] `/checkpoint` skill (`git add -A && git commit -m "checkpoint: <label|timestamp>"`)
- [x] Repo layout: `backend/`, `frontend/`, top-level `README.md`
- [x] `.gitignore` (Python, Node, env files, model weights cache)

## Phase 2 — Backend skeleton
- [ ] FastAPI app scaffold (`backend/app/main.py`)
- [ ] SQLAlchemy models: `Session`, `TranscriptSegment`
- [ ] Alembic setup + initial migration
- [ ] REST CRUD: `GET/POST /api/sessions`, `GET/PUT/DELETE /api/sessions/{id}`, `GET/PUT/DELETE /api/segments/{id}`
- [ ] Local Postgres via docker-compose for dev

## Phase 3 — STT integration
- [ ] Install & smoke-test `faster-whisper` standalone on a sample WAV file
- [ ] Pick model size (start `small`, benchmark CPU latency)
- [ ] WebSocket endpoint `/ws/transcribe/{session_id}`: receive chunked audio, run inference
- [ ] Stream partial transcript back to client; persist finalized segments to DB

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
