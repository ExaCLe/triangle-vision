"""Tests for the runs API endpoints."""
import pytest
from fastapi.testclient import TestClient


def _create_test(client: TestClient):
    """Helper to create a test and return its ID."""
    test_data = {
        "title": "Run Test",
        "description": "Test for runs",
        "min_triangle_size": 50.0,
        "max_triangle_size": 300.0,
        "min_saturation": 0.1,
        "max_saturation": 1.0,
    }
    response = client.post("/api/tests/", json=test_data)
    assert response.status_code == 200
    return response.json()["id"]


def test_create_run_with_pretest_mode(client: TestClient):
    """POST /api/runs/ with pretest_mode='run' should create a pretest run."""
    test_id = _create_test(client)
    response = client.post(
        "/api/runs/",
        json={"test_id": test_id, "pretest_mode": "run"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pretest"
    assert data["pretest_mode"] == "run"
    assert data["test_id"] == test_id


def test_create_run_with_manual_mode(client: TestClient):
    """POST /api/runs/ with pretest_mode='manual' should skip pretest."""
    test_id = _create_test(client)
    response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "pretest_mode": "manual",
            "pretest_size_min": 100.0,
            "pretest_size_max": 200.0,
            "pretest_saturation_min": 0.3,
            "pretest_saturation_max": 0.8,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "main"
    assert data["pretest_size_min"] == 100.0
    assert data["pretest_saturation_max"] == 0.8


def test_create_run_manual_missing_bounds(client: TestClient):
    """Manual mode without bounds should fail with 422."""
    test_id = _create_test(client)
    response = client.post(
        "/api/runs/",
        json={"test_id": test_id, "pretest_mode": "manual"},
    )
    assert response.status_code == 422


def test_create_run_reuse_last_no_prior(client: TestClient):
    """Reuse last with no prior run should fail with 404."""
    test_id = _create_test(client)
    response = client.post(
        "/api/runs/",
        json={"test_id": test_id, "pretest_mode": "reuse_last"},
    )
    assert response.status_code == 404


def test_get_next_trial_pretest(client: TestClient):
    """GET /api/runs/{run_id}/next during pretest should return a pretest trial."""
    test_id = _create_test(client)
    run_response = client.post(
        "/api/runs/",
        json={"test_id": test_id, "pretest_mode": "run"},
    )
    run_id = run_response.json()["id"]

    next_response = client.get(f"/api/runs/{run_id}/next")
    assert next_response.status_code == 200
    data = next_response.json()
    assert data["phase"] == "pretest"
    assert "triangle_size" in data
    assert "saturation" in data
    assert "orientation" in data


def test_submit_pretest_result(client: TestClient):
    """POST /api/runs/{run_id}/result during pretest should record result."""
    test_id = _create_test(client)
    run_response = client.post(
        "/api/runs/",
        json={"test_id": test_id, "pretest_mode": "run"},
    )
    run_id = run_response.json()["id"]

    trial = client.get(f"/api/runs/{run_id}/next").json()
    result_response = client.post(
        f"/api/runs/{run_id}/result",
        json={
            "triangle_size": trial["triangle_size"],
            "saturation": trial["saturation"],
            "orientation": trial["orientation"],
            "success": 1,
        },
    )
    assert result_response.status_code == 200
    data = result_response.json()
    assert data["phase"] == "pretest"


def test_get_next_trial_main_phase(client: TestClient):
    """GET /api/runs/{run_id}/next during main phase should return main trial."""
    test_id = _create_test(client)
    run_response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "pretest_mode": "manual",
            "pretest_size_min": 100.0,
            "pretest_size_max": 200.0,
            "pretest_saturation_min": 0.3,
            "pretest_saturation_max": 0.8,
        },
    )
    run_id = run_response.json()["id"]

    next_response = client.get(f"/api/runs/{run_id}/next")
    assert next_response.status_code == 200
    data = next_response.json()
    assert data["phase"] == "main"


def test_run_summary(client: TestClient):
    """GET /api/runs/{run_id}/summary should return trial counts."""
    test_id = _create_test(client)
    run_response = client.post(
        "/api/runs/",
        json={"test_id": test_id, "pretest_mode": "run"},
    )
    run_id = run_response.json()["id"]

    # Submit a few pretest trials
    for _ in range(3):
        trial = client.get(f"/api/runs/{run_id}/next").json()
        client.post(
            f"/api/runs/{run_id}/result",
            json={
                "triangle_size": trial["triangle_size"],
                "saturation": trial["saturation"],
                "orientation": trial["orientation"],
                "success": 1,
            },
        )

    summary = client.get(f"/api/runs/{run_id}/summary").json()
    assert summary["pretest_trial_count"] == 3
    assert summary["total_trials_count"] == 3


def test_list_runs_for_test(client: TestClient):
    """GET /api/runs/test/{test_id} should list runs."""
    test_id = _create_test(client)
    # Create two runs
    client.post("/api/runs/", json={"test_id": test_id, "pretest_mode": "run"})
    client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "pretest_mode": "manual",
            "pretest_size_min": 100.0,
            "pretest_size_max": 200.0,
            "pretest_saturation_min": 0.3,
            "pretest_saturation_max": 0.8,
        },
    )

    response = client.get(f"/api/runs/test/{test_id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
