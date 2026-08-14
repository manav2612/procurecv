from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
