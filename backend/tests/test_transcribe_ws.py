"""
Real end-to-end test of the /ws/transcribe endpoint against the actual
faster-whisper model (not mocked). Excluded from the default `pytest` run
(see pytest.ini) since it loads a real ML model and takes tens of seconds —
run explicitly with `pytest -m slow` to verify STT is actually working.
"""

from pathlib import Path

import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "english.mp3"


@pytest.mark.slow
def test_websocket_handshake_transcribes_and_persists_segment(client):
    create_resp = client.post("/api/sessions", json={"language_hint": "en"})
    session_id = create_resp.json()["id"]

    audio_bytes = FIXTURE.read_bytes()

    with client.websocket_connect(f"/ws/transcribe/{session_id}") as ws:
        ready = ws.receive_json()
        assert ready == {"type": "ready", "session_id": session_id, "language_hint": "en"}

        ws.send_bytes(audio_bytes)

        messages = []
        while True:
            msg = ws.receive_json()
            messages.append(msg)
            if msg["type"] == "chunk_done":
                break

        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}

    assert messages[0]["type"] == "processing"
    finals = [m for m in messages if m["type"] == "final"]
    assert len(finals) == 1
    assert "test" in finals[0]["text"].lower()
    assert finals[0]["confidence"] > 0
    assert messages[-1] == {"type": "chunk_done", "segment_count": 1}

    session_resp = client.get(f"/api/sessions/{session_id}")
    segments = session_resp.json()["segments"]
    assert len(segments) == 1
    assert segments[0]["text"] == finals[0]["text"]


@pytest.mark.slow
def test_websocket_closes_for_missing_session(client):
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/transcribe/999999") as ws:
            ws.receive_json()
