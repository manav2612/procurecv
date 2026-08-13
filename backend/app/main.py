from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import segments, sessions

app = FastAPI(title="ProcureCV")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(segments.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
