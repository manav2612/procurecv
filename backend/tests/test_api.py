def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_session_and_segment_crud_flow(client):
    create_resp = client.post("/api/sessions", json={"language_hint": "hi-en"})
    assert create_resp.status_code == 201
    session = create_resp.json()
    assert session["status"] == "active"
    assert session["language_hint"] == "hi-en"
    session_id = session["id"]

    list_resp = client.get("/api/sessions")
    assert list_resp.status_code == 200
    assert any(s["id"] == session_id for s in list_resp.json())

    get_resp = client.get(f"/api/sessions/{session_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["segments"] == []

    segment_resp = client.post(
        f"/api/sessions/{session_id}/segments",
        json={"text": "namaste hello", "start_ts": 0.0, "end_ts": 1.5, "confidence": 0.92},
    )
    assert segment_resp.status_code == 201
    segment = segment_resp.json()
    assert segment["session_id"] == session_id
    segment_id = segment["id"]

    get_resp = client.get(f"/api/sessions/{session_id}")
    assert len(get_resp.json()["segments"]) == 1

    update_seg_resp = client.put(f"/api/segments/{segment_id}", json={"text": "namaste world"})
    assert update_seg_resp.status_code == 200
    assert update_seg_resp.json()["text"] == "namaste world"

    update_session_resp = client.put(f"/api/sessions/{session_id}", json={"status": "completed"})
    assert update_session_resp.status_code == 200
    assert update_session_resp.json()["status"] == "completed"

    delete_seg_resp = client.delete(f"/api/segments/{segment_id}")
    assert delete_seg_resp.status_code == 204

    get_resp = client.get(f"/api/sessions/{session_id}")
    assert get_resp.json()["segments"] == []

    delete_session_resp = client.delete(f"/api/sessions/{session_id}")
    assert delete_session_resp.status_code == 204

    get_resp = client.get(f"/api/sessions/{session_id}")
    assert get_resp.status_code == 404


def test_segment_under_missing_session_returns_404(client):
    response = client.post(
        "/api/sessions/999/segments",
        json={"text": "x", "start_ts": 0.0, "end_ts": 1.0},
    )
    assert response.status_code == 404


def test_update_missing_segment_returns_404(client):
    response = client.put("/api/segments/999", json={"text": "x"})
    assert response.status_code == 404
