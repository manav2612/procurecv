import asyncio
import json
import logging
import time

from fastapi import APIRouter, Depends, WebSocket
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

    Protocol (JSON control/status messages, binary audio):
      server -> client, right after accept: {"type": "ready", "session_id", "language_hint"}
      client -> server: one self-contained audio blob per binary message (e.g.
        a few seconds of WebM/Opus from MediaRecorder — each chunk must
        decode independently, since chunks are transcribed one at a time)
      client -> server (text): {"type": "ping"} -> server replies {"type": "pong"}
        (heartbeat, keeps the connection alive through idle proxies)
      client -> server (text): {"type": "stop"} -> server closes the loop
      server -> client, per chunk received: {"type": "processing"}, then zero
        or more {"type": "final", "id", "text", "start_ts", "end_ts",
        "confidence"} (one per transcribed segment), then always
        {"type": "chunk_done", "segment_count"} so the client can reliably
        track "how many chunks are still in flight" regardless of whether a
        chunk produced any text (e.g. it was silence)
      server -> client, on a chunk that fails to transcribe: {"type": "error",
        "detail"} followed by {"type": "chunk_done", "segment_count": 0}

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

    await websocket.send_json(
        {"type": "ready", "session_id": session_id, "language_hint": language_hint}
    )

    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            break

        audio_bytes = message.get("bytes")
        text_payload = message.get("text")

        if audio_bytes is not None:
            chunk_offset = time.monotonic() - connected_at
            await websocket.send_json({"type": "processing"})

            try:
                segments = await asyncio.to_thread(transcribe_chunk, audio_bytes, language_hint)
            except Exception:
                logger.exception("Transcription failed for session %s", session_id)
                await websocket.send_json({"type": "error", "detail": "transcription failed"})
                await websocket.send_json({"type": "chunk_done", "segment_count": 0})
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
            await websocket.send_json({"type": "chunk_done", "segment_count": len(segments)})

        elif text_payload is not None:
            try:
                control = json.loads(text_payload)
            except ValueError:
                continue
            control_type = control.get("type")
            if control_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif control_type == "stop":
                break
