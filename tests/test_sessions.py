from fastapi.testclient import TestClient


def test_session_run_lifecycle(client: TestClient):
    create_response = client.post("/api/sessions/runs", json={})
    assert create_response.status_code == 200
    run = create_response.json()
    assert run["status"] == "created"
    assert run["started_at"] is None
    assert run["completed_at"] is None

    start_response = client.post(f"/api/sessions/runs/{run['id']}/start")
    assert start_response.status_code == 200
    started = start_response.json()
    assert started["status"] == "active"
    assert started["started_at"] is not None

    complete_response = client.post(f"/api/sessions/runs/{run['id']}/complete")
    assert complete_response.status_code == 200
    completed = complete_response.json()
    assert completed["status"] == "completed"
    assert completed["completed_at"] is not None
    assert completed["cancelled_at"] is None

    restart_response = client.post(f"/api/sessions/runs/{run['id']}/start")
    assert restart_response.status_code == 409


def test_session_trial_and_contrast_result(client: TestClient):
    run_response = client.post("/api/sessions/runs", json={})
    run_id = run_response.json()["id"]

    trial_response = client.post(
        f"/api/sessions/runs/{run_id}/trials",
        json={
            "trial_index": 1,
            "triangle_size": 120.0,
            "saturation": 0.65,
            "orientation": "N",
        },
    )
    assert trial_response.status_code == 200
    trial = trial_response.json()
    assert trial["run_id"] == run_id

    result_response = client.post(
        f"/api/sessions/trials/{trial['id']}/contrast-results",
        json={"contrast": 0.42},
    )
    assert result_response.status_code == 200
    result = result_response.json()
    assert result["trial_id"] == trial["id"]
    assert result["contrast"] == 0.42


def test_session_run_cancel_created(client: TestClient):
    run_response = client.post("/api/sessions/runs", json={})
    run_id = run_response.json()["id"]

    # Only active runs can be completed; created runs should return conflict.
    complete_response = client.post(f"/api/sessions/runs/{run_id}/complete")
    assert complete_response.status_code == 409

    cancel_response = client.post(f"/api/sessions/runs/{run_id}/cancel")
    assert cancel_response.status_code == 200
    cancelled = cancel_response.json()
    assert cancelled["status"] == "cancelled"
    assert cancelled["cancelled_at"] is not None
    assert cancelled["completed_at"] is None

    restart_response = client.post(f"/api/sessions/runs/{run_id}/start")
    assert restart_response.status_code == 409


def test_session_run_cancel_active(client: TestClient):
    run_response = client.post("/api/sessions/runs", json={})
    run_id = run_response.json()["id"]

    start_response = client.post(f"/api/sessions/runs/{run_id}/start")
    assert start_response.status_code == 200

    cancel_response = client.post(f"/api/sessions/runs/{run_id}/cancel")
    assert cancel_response.status_code == 200
    cancelled = cancel_response.json()
    assert cancelled["status"] == "cancelled"
    assert cancelled["cancelled_at"] is not None
