# ProcureCV frontend

React + TypeScript (Vite). Live mic-based transcription UI — see the
top-level `README.md` for the full project and `PLAN.md`/`TODO.md` for
status.

## Setup

```bash
npm install
cp .env.example .env   # adjust VITE_API_BASE_URL if the backend isn't on :8000
npm run dev             # http://localhost:5173, expects the backend running on :8000
```

```bash
npm run build   # tsc -b && vite build
npm run lint     # oxlint
```

## Structure

```
src/api.ts                    REST client for /api/sessions, /api/segments
src/hooks/useTranscription.ts mic capture (MediaRecorder) + WebSocket client
src/components/Recorder.tsx   live transcription UI
src/types.ts                  types mirroring the backend's Pydantic schemas
```

## Known limitations

- Mic capture uses `MediaRecorder` with WebM/Opus — works in Chrome/Firefox;
  Safari's `MediaRecorder` support for WebM is inconsistent, so recording may
  not work there. Not polyfilled (out of scope for this assignment).
- Not tested against a live microphone/browser in the environment this was
  built in (no display/audio device available there) — verified via a build,
  typecheck, lint, and a dev-server smoke test that the app serves and
  modules resolve correctly. Exercise the actual "Start Recording" flow in a
  real browser with mic access before considering this fully verified.
