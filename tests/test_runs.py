"""Tests for the runs API endpoints."""
import pytest
from fastapi.testclient import TestClient


def _create_test(client: TestClient):
    """Helper to create a test and return its ID."""
    test_data = {
        "title": "Run Test",
        "description": "Test for runs",
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

    test_response = client.get(f"/api/tests/{test_id}")
    assert test_response.status_code == 200
    test_data = test_response.json()
    assert test_data["min_triangle_size"] == 100.0
    assert test_data["max_triangle_size"] == 200.0
    assert test_data["min_saturation"] == 0.3
    assert test_data["max_saturation"] == 0.8


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


def test_create_run_reuse_last_from_other_test(client: TestClient):
    """Reuse mode should support bounds sourced from a different test."""
    source_test_id = _create_test(client)
    target_test_id = _create_test(client)

    manual_run_response = client.post(
        "/api/runs/",
        json={
            "test_id": source_test_id,
            "pretest_mode": "manual",
            "pretest_size_min": 110.0,
            "pretest_size_max": 210.0,
            "pretest_saturation_min": 0.25,
            "pretest_saturation_max": 0.75,
        },
    )
    assert manual_run_response.status_code == 200

    response = client.post(
        "/api/runs/",
        json={
            "test_id": target_test_id,
            "pretest_mode": "reuse_last",
            "reuse_test_id": source_test_id,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "main"
    assert data["pretest_size_min"] == 110.0
    assert data["pretest_size_max"] == 210.0
    assert data["pretest_saturation_min"] == 0.25
    assert data["pretest_saturation_max"] == 0.75

    target_test_response = client.get(f"/api/tests/{target_test_id}")
    assert target_test_response.status_code == 200
    target_test_data = target_test_response.json()
    assert target_test_data["min_triangle_size"] == 110.0
    assert target_test_data["max_triangle_size"] == 210.0
    assert target_test_data["min_saturation"] == 0.25
    assert target_test_data["max_saturation"] == 0.75


def test_create_run_reuse_last_from_other_test_saved_bounds(client: TestClient):
    """Reuse mode can use source test's saved bounds even without prior runs."""
    source_test_id = _create_test(client)
    target_test_id = _create_test(client)

    update_response = client.put(
        f"/api/tests/{source_test_id}",
        json={
            "min_triangle_size": 120.0,
            "max_triangle_size": 240.0,
            "min_saturation": 0.2,
            "max_saturation": 0.7,
        },
    )
    assert update_response.status_code == 200

    response = client.post(
        "/api/runs/",
        json={
            "test_id": target_test_id,
            "pretest_mode": "reuse_last",
            "reuse_test_id": source_test_id,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "main"
    assert data["pretest_size_min"] == 120.0
    assert data["pretest_size_max"] == 240.0
    assert data["pretest_saturation_min"] == 0.2
    assert data["pretest_saturation_max"] == 0.7


def test_pretest_completion_persists_bounds_on_test(client: TestClient):
    """Finishing pretest should persist resulting bounds on the test."""
    # Speed up pretest completion for deterministic tests.
    settings_response = client.put(
        "/api/settings/pretest",
        json={
            "lower_target": 0.4,
            "upper_target": 0.95,
            "probe_rule": {"success_target": 1, "trial_cap": 1},
            "search": {"max_probes_per_axis": 1, "refine_steps_per_edge": 1},
            "global_limits": {
                "min_triangle_size": 10.0,
                "max_triangle_size": 400.0,
                "min_saturation": 0.0,
                "max_saturation": 1.0,
            },
        },
    )
    assert settings_response.status_code == 200

    test_id = _create_test(client)
    run_response = client.post(
        "/api/runs/",
        json={"test_id": test_id, "pretest_mode": "run"},
    )
    assert run_response.status_code == 200
    run_id = run_response.json()["id"]

    for _ in range(20):
        trial_response = client.get(f"/api/runs/{run_id}/next")
        assert trial_response.status_code == 200
        trial = trial_response.json()
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
        run_state = client.get(f"/api/runs/{run_id}")
        assert run_state.status_code == 200
        if run_state.json()["status"] == "main":
            break

    test_response = client.get(f"/api/tests/{test_id}")
    assert test_response.status_code == 200
    test_data = test_response.json()
    assert test_data["min_triangle_size"] is not None
    assert test_data["max_triangle_size"] is not None
    assert test_data["min_saturation"] is not None
    assert test_data["max_saturation"] is not None


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
