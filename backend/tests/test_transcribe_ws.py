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
def test_websocket_transcribes_and_persists_segment(client):
    create_resp = client.post("/api/sessions", json={"language_hint": "en"})
    session_id = create_resp.json()["id"]

    audio_bytes = FIXTURE.read_bytes()

    with client.websocket_connect(f"/ws/transcribe/{session_id}") as ws:
        ws.send_bytes(audio_bytes)
        message = ws.receive_json()

    assert message["type"] == "final"
    assert "test" in message["text"].lower()
    assert message["confidence"] > 0

    session_resp = client.get(f"/api/sessions/{session_id}")
    segments = session_resp.json()["segments"]
    assert len(segments) == 1
    assert segments[0]["text"] == message["text"]


@pytest.mark.slow
def test_websocket_closes_for_missing_session(client):
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/transcribe/999999") as ws:
            ws.receive_json()
