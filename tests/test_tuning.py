"""Tests for the tuning simulation endpoint."""
from fastapi.testclient import TestClient


def _payload(**overrides):
    base = {
        "model_name": "default",
        "main_iterations": 20,
        "main_snapshot_interval": 5,
        "heatmap_steps": 20,
        "seed": 123,
    }
    base.update(overrides)
    return base


def test_tuning_simulation_runs_pretest_by_default(client: TestClient):
    """Default tuning simulation should run pretest first."""
    response = client.post("/api/tuning/simulate", json=_payload())
    assert response.status_code == 200
    data = response.json()
    assert data["pretest_trials"] > 0
    assert data["snapshots"][0]["phase"] == "pretest"
    assert data["final_bounds"] is not None


def test_tuning_simulation_manual_mode_skips_pretest(client: TestClient):
    """Manual mode should skip pretest and use provided bounds directly."""
    response = client.post(
        "/api/tuning/simulate",
        json=_payload(
            pretest_mode="manual",
            manual_size_min=80.0,
            manual_size_max=180.0,
            manual_sat_min=0.2,
            manual_sat_max=0.7,
        ),
    )
    assert response.status_code == 200
    data = response.json()

    assert data["pretest_trials"] == 0
    assert data["snapshots"][0]["phase"] == "main"
    assert data["final_bounds"] == {
        "size_lower": 80.0,
        "size_upper": 180.0,
        "saturation_lower": 0.2,
        "saturation_upper": 0.7,
    }


def test_tuning_simulation_manual_mode_requires_all_bounds(client: TestClient):
    """Manual mode must include all four manual bounds."""
    response = client.post(
        "/api/tuning/simulate",
        json=_payload(
            pretest_mode="manual",
            manual_size_min=80.0,
            manual_size_max=180.0,
            manual_sat_min=0.2,
        ),
    )
    assert response.status_code == 422
    assert "Manual mode requires all four bounds" in response.json()["detail"]


def test_tuning_simulation_rejects_invalid_global_bounds(client: TestClient):
    """Global bounds must be valid ascending ranges."""
    response = client.post(
        "/api/tuning/simulate",
        json=_payload(global_size_min=300.0, global_size_max=300.0),
    )
    assert response.status_code == 422
    assert "global_size_min must be < global_size_max" in response.json()["detail"]


def test_tuning_smooth_heatmap_returns_error_score(client: TestClient):
    """Analysis-style smoothing endpoint returns a heatmap + MSE*100 score."""
    response = client.post(
        "/api/tuning/smooth-heatmap",
        json={
            "model_name": "default",
            "size_min": 1.0,
            "size_max": 100.0,
            "sat_min": 0.0,
            "sat_max": 1.0,
            "steps": 40,
            "trials": [
                {"triangle_size": 10.0, "saturation": 0.2, "success": False},
                {"triangle_size": 20.0, "saturation": 0.3, "success": False},
                {"triangle_size": 60.0, "saturation": 0.6, "success": True},
                {"triangle_size": 80.0, "saturation": 0.8, "success": True},
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "heatmap" in data
    assert "error_score" in data
    assert isinstance(data["error_score"], float)
    assert data["error_score"] >= 0.0
    assert len(data["heatmap"]["triangle_sizes"]) == 40
    assert len(data["heatmap"]["saturations"]) == 40
    assert len(data["heatmap"]["grid"]) == 40
