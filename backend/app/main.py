from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import segments, sessions, transcribe

# Note: the Whisper model is lazy-loaded on the first WebSocket message (see
# app/stt.py's get_model()), not at app startup — this keeps the REST/CRUD
# test suite fast and network-independent. It does mean the first real
# transcription connection pays a one-time ~30-60s model-load cost.

app = FastAPI(title="ProcureCV")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(segments.router)
app.include_router(transcribe.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Single-deployable-service mode (see PLAN.md): if the frontend has been
# built, serve it directly instead of running a separate frontend host.
# ../frontend/dist is the same relative layout in local dev (after `npm run
# build`) and in the Docker image (see Dockerfile) — resolved via __file__,
# not cwd, so it works regardless of where uvicorn is launched from. If it
# doesn't exist (no build yet), the mount is skipped — use the Vite dev
# server instead (frontend/README.md), which is what the CORS origin above
# is for. Must be registered last: a mount at "/" would otherwise shadow the
# API routes above it.
_frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
