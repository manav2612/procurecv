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
- [x] Alembic setup + initial migration — generated/verified against SQLite initially (no Docker in this sandbox), then **actually re-verified against a real Neon Postgres instance on 2026-08-15**: `alembic upgrade head` created the schema cleanly, plus a full CRUD round-trip (create session/segment, nested fetch, cascade delete) confirmed working, test data cleaned up afterward
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
- [x] Delete-session confirmation uses an in-app toast (`ToastProvider`/`useToast` in `Toaster.tsx`) instead of the native `confirm()` dialog, plus a success toast on delete.

## Post-Phase-5 hardening (found via real usage, not planned upfront)
- [x] **Real-time protocol upgrade**: WS handshake (`ready` before the client starts recording), `ping`/`pong` heartbeat, `processing`/`chunk_done` per-chunk lifecycle messages. Replaced fixed-4s-timer chunking with VAD-based chunking (cuts on a speech pause or max-duration cap). Verified against the live backend with a real Node WebSocket client, not just pytest.
- [x] **Fixed a real bug**: switching from the Record tab to Dashboard unmounts `<Recorder/>` (App.tsx renders them as an either/or), but `useTranscription` had no unmount cleanup — the WebSocket/MediaRecorder/AudioContext/intervals kept running orphaned, and every new session had to share the one CPU-bound Whisper model with however many orphaned sessions were still streaming at it. Confirmed via the user's own test data (a 74s gap between segments that should've been a few seconds apart; 3 different sessions' backlogged segments all landing in the same 12s window). Fixed with a `useEffect` cleanup on unmount (frontend) + a `threading.Lock` serializing all model inference server-wide as a defensive backstop (backend, `app/stt.py`).

## Phase 6 — Multilingual validation
- [x] Test recordings: 8 gTTS-generated clips (2 pure Hindi, 2 pure English, 3 short code-switch, 1 longer multi-sentence code-switch paragraph), run through the real `transcribe_chunk()` pipeline against known ground truth — not just spot-checked by ear.
- [x] Tune chunk size: ran the same 24s code-switched clip as 1 / 2 / 4 pieces (naive fixed-point splits, not VAD-aligned) to isolate the effect of chunk boundaries from chunk content. Result: cutting mid-utterance is actively harmful, not neutral — see finding 3 below. This validates (didn't just assume) the VAD-based chunking design from Phase 4/hardening.
- [x] Document known accuracy limitations in README — done, with concrete before/after examples, not just a general disclaimer.

**Findings (real transcriptions, not estimates):**
1. **English: essentially solved.** Both English test clips transcribed with an exact word-for-word match, ~5.6-5.9s latency, confidence 0.74-0.79.
2. **Pure Hindi: good but clip-length-sensitive.** A longer Hindi sentence (~8s of speech) came back in correct, readable Devanagari with only minor spelling slips. A *short* Hindi clip (~3s) mis-scripted entirely into Perso-Arabic script instead of Devanagari — the same tiny/base-model failure mode from Phase 3 benchmarking, but it turns out `small` isn't fully immune either on short clips, just much less prone to it.
3. **Code-switched Hindi+English: still the real weak point**, exactly the assignment's core scenario. Whisper forces the whole chunk's dominant auto-detected language, so English words inside a mostly-Hindi chunk get phonetically transliterated into Devanagari garbage (e.g. "developer" -> "धवलड़पा") instead of staying in Latin script. Confidence on these dropped to 0.38-0.48 vs 0.74+ for clean single-language audio — confidence score is a decent proxy for "trust this segment less."
4. **Naive fixed-point chunk splitting is actively harmful, both for latency and accuracy** — a real, non-obvious finding, not a restatement of the plan. The same 24s clip: as 1 chunk, 25.4s latency; split into 2 equal 12s chunks, the *second* chunk alone took 136.2s (6x the whole-clip baseline) because the cut landed mid-phrase and Whisper's internal retry/temperature-fallback decoding kicked in hard on the ambiguous boundary audio. Split into 4x 6s chunks, latency per chunk was more bounded (5.9-40.1s) and — interestingly — two of the four chunks that happened to land on mostly-English speech came back in clean, correct English, better than that same content transcribed as part of a longer Hindi-dominant chunk. **Takeaway**: chunk boundaries need to land on natural pauses (what the VAD-based chunking already does), not arbitrary fixed points — this is empirical evidence for, not just a hunch behind, that design decision. It also suggests smaller VAD-aligned chunks may help code-switch accuracy specifically (isolating language-dominant spans), a possible future refinement beyond what's implemented now.
5. **Latency is driven by decode difficulty, not audio duration.** The hardest/most garbled clips took the longest (up to 136s for 12s of audio) while a longer, more coherent 24s clip finished in 25s — worth knowing since "latency scales with input length" is the intuitive but wrong assumption.

## Phase 7 — Dockerize + deploy
- [x] `app/main.py` now mounts the built frontend (`frontend/dist`) as static files after all API routes — single-service deploy, verified locally against a real build (root serves `index.html`, JS asset resolves, `/api/health` + full WS handshake still work alongside the mount, unmapped paths correctly 404). Backend test suite still green (4/4).
- [x] `Dockerfile`: multi-stage (Node stage builds the frontend, Python stage serves it + the API; `CMD` runs `alembic upgrade head` before `uvicorn` on every start). `.dockerignore` added.
- [x] `docker-compose.yml`: added an `app` service (builds the full Dockerfile, depends on `db` being healthy, persists the downloaded Whisper model in a named volume so it isn't re-fetched every restart) alongside the existing `db` service.
- [x] Host chosen (user's call, asked directly rather than assumed): **Render** (web service, Docker runtime, free plan, no card required). `render.yaml` blueprint written; `WHISPER_MODEL_SIZE` overridden to `base` for the free plan's 512MB RAM (the app's own default is `small` — see PLAN.md — which needs more RAM than that and would likely get OOM-killed). Full step-by-step in README.md's "Deploying" section.
- [x] **Database — pivoted from Neon to Render's own native Postgres, after real debugging, not on a whim.** Originally: Neon project created by the user, verified working from this environment (real `alembic upgrade head`, full CRUD round-trip incl. cascade delete, test data cleaned up). But wiring it into Render via a manually-pasted `DATABASE_URL` hit a real, never-fully-explained failure: Render's dashboard showed the env var as set, the user redeployed multiple times, and a startup diagnostic (temporarily added to the Dockerfile, since reverted) proved conclusively — `set=no len=0` — that the value never actually reached the running container. Rather than keep debugging Render's env var/Environment-Group scoping blind, switched `render.yaml` to provision Postgres directly on Render and wire it via `fromDatabase`, which Render handles internally with no manual paste step and therefore no scope-mismatch failure mode to hit. Tradeoff: Render's free Postgres expires after 30 days (Neon doesn't) — acceptable to get a working, verified deploy now; switching back to Neon later is a one-env-var change, not a code change.
- [x] **Defensive code improvement that came out of this debugging**: `app/config.py` now has `normalize_database_url()`, converting a plain `postgres://` or `postgresql://` connection string (what every managed Postgres provider hands out) to the `postgresql+psycopg2://` SQLAlchemy needs — applied via a pydantic field_validator on `Settings.database_url` AND explicitly in `alembic/env.py` (which reads the env var directly, bypassing Settings). Previously this required a manual, easy-to-forget edit (and was a source of real confusion in this session) — now it's automatic regardless of which provider's URL format you paste in.
- [x] User applied the updated `render.yaml` blueprint — **deploy succeeded**: `https://procurecv.onrender.com` is live, serving the built frontend correctly (confirms the Postgres pivot fixed the earlier startup crash — the container wouldn't have started at all otherwise).
- [x] **Found and fixed a real bug on the deployed site**: the frontend's API base URL defaulted to a hardcoded `http://localhost:8000` when no `VITE_API_BASE_URL` was set at build time. Locally that default is masked by a `.env` file (`cp .env.example .env`, per the frontend setup instructions), but the Docker build has no `.env` (correctly excluded via `.dockerignore`), so the deployed bundle baked in `localhost:8000` — meaning the browser tried to reach the *visitor's own machine* instead of the Render server, producing "Failed to fetch" on every request. Fixed in `frontend/src/api.ts`: `API_BASE` now defaults to `""` (empty) instead of a hardcoded host, making `fetch()` calls resolve relative to whatever origin actually served the page — correct for the single-service deploy. `WS_BASE` needed separate handling since `WebSocket()` requires an absolute URL (unlike `fetch()`): derives `wss://`/`ws://` + `window.location.host` at runtime when no explicit override is set. Verified by rebuilding with the local `.env` moved aside (exactly matching what the Docker build context sees) and confirming the bundle has no hardcoded `localhost:8000` and correctly computes the WS URL from `window.location`.
- [x] Frontend fix redeployed on Render — "Failed to fetch" resolved, page loads and calls the API correctly. But: user reported the app "not able to process chunks" / very slow. Root cause: Render's free plan gives a heavily *shared* (not dedicated) sliver of CPU, on top of the 512MB RAM already forcing the `base` model downgrade — genuinely too constrained to run Whisper inference at a usable speed, not a remaining code bug.
- [x] **Second host pivot: evaluated Fly.io, ruled out on a hard constraint, chose Hugging Face Spaces instead.** `fly.toml` was written (dedicated CPU/RAM would have fixed the speed problem, deploys the same Dockerfile unchanged) and `flyctl` installed in this environment — but `fly auth login`'s browser-based flow doesn't work in a headless sandbox, and generating a token requires an account that (per the user) they didn't want to put a card on file for, which Fly requires. Landed on **Hugging Face Spaces** instead: free CPU tier gives 16GB RAM (no downgrade from `small` needed), Docker-native (same Dockerfile), genuinely no card required. Kept `fly.toml`/`render.yaml` in the repo for reference rather than deleting — the Postgres-wiring and single-service lessons in this file apply regardless of host.
- [x] Added HF Space config as YAML frontmatter at the top of `README.md` (`sdk: docker`, `app_port: 8000`) — the mechanism HF uses to recognize a plain git-pushed repo as a Docker Space. Verified the frontmatter parses correctly and the Dockerfile's CMD still resolves to port 8000 with no `PORT` env var set (HF doesn't inject one, unlike Render/Fly).
- [ ] **Not done — needs the user's own HF account**: creating the Space, pushing this repo to it, and setting `DATABASE_URL` (reusing the already-verified Neon connection string) as a Space secret. Verify end-to-end once live: record -> transcribe -> appears in dashboard, at a usable speed this time given the RAM headroom.

## Phase 8 — Wrap-up
- [ ] `README.md`: setup instructions, architecture diagram, known limitations
- [ ] Push to GitHub (public or invite reviewer)
- [ ] Capture GitHub repo link + deployed app link
- [ ] Ready to submit to `govardhan.sherkhane@procucev.com` (submission itself is your call, not automated)
