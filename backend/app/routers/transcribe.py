import asyncio
import logging
import time

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session as DBSession

from app import crud, schemas
from app.database import get_db
from app.stt import transcribe_chunk

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/transcribe/{session_id}")
async def websocket_transcribe(
    websocket: WebSocket, session_id: int, db: DBSession = Depends(get_db)
):
    """Streaming transcription over a WebSocket.

    Protocol: client sends one self-contained audio blob per message (e.g. a
    few seconds of WebM/Opus or WAV from MediaRecorder — each chunk must
    decode independently, since chunks are transcribed one at a time). Server
    replies with one JSON message per finalized segment:
    {"type": "final", "id", "text", "start_ts", "end_ts", "confidence"}, or
    {"type": "error", "detail"} if a chunk fails to transcribe.

    start_ts/end_ts are approximated as wall-clock-elapsed-since-connect at
    the moment each chunk arrives, plus the segment's offset within that
    chunk — not a sample-accurate position in the original audio. That's a
    deliberate simplification: chunks are decoded independently (no shared
    audio timeline across chunks), and wall-clock arrival time is a close
    enough proxy for ordering/display in a near-real-time dashboard.

    `db` is injected via Depends(get_db) (not instantiated directly) so it
    honors app.dependency_overrides — this is what lets the test suite point
    it at an in-memory SQLite DB instead of requiring a live Postgres.
    """
    session = crud.get_session(db, session_id)
    if session is None:
        await websocket.close(code=4404, reason="Session not found")
        return

    await websocket.accept()
    language_hint = session.language_hint
    connected_at = time.monotonic()

    try:
        while True:
            chunk = await websocket.receive_bytes()
            chunk_offset = time.monotonic() - connected_at

            try:
                segments = await asyncio.to_thread(transcribe_chunk, chunk, language_hint)
            except Exception:
                logger.exception("Transcription failed for session %s", session_id)
                await websocket.send_json({"type": "error", "detail": "transcription failed"})
                continue

            for seg in segments:
                db_segment = crud.create_segment(
                    db,
                    session_id,
                    schemas.SegmentCreate(
                        text=seg.text,
                        start_ts=chunk_offset + seg.start_ts,
                        end_ts=chunk_offset + seg.end_ts,
                        confidence=seg.confidence,
                    ),
                )
                await websocket.send_json(
                    {
                        "type": "final",
                        "id": db_segment.id,
                        "text": db_segment.text,
                        "start_ts": db_segment.start_ts,
                        "end_ts": db_segment.end_ts,
                        "confidence": db_segment.confidence,
                    }
                )
    except WebSocketDisconnect:
        pass
