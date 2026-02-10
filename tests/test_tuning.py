"""Tests for the tuning simulation endpoint."""
import random

from fastapi.testclient import TestClient
from algorithm_to_find_combinations.ground_truth import SIMULATION_MODELS, compute_probability


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


def test_tuning_smooth_heatmap_accepts_brush_radii(client: TestClient):
    """Smoothing endpoint should accept configurable brush radii."""
    response = client.post(
        "/api/tuning/smooth-heatmap",
        json={
            "model_name": "default",
            "size_min": 1.0,
            "size_max": 100.0,
            "sat_min": 0.0,
            "sat_max": 1.0,
            "steps": 30,
            "inner_radius": 8.0,
            "outer_radius": 44.0,
            "trials": [
                {"triangle_size": 12.0, "saturation": 0.2, "success": False},
                {"triangle_size": 56.0, "saturation": 0.6, "success": True},
                {"triangle_size": 74.0, "saturation": 0.7, "success": True},
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["error_score"], float)


def test_tuning_smooth_heatmap_rejects_invalid_brush_radii_pair(client: TestClient):
    """Outer brush radius must remain larger than inner brush radius."""
    response = client.post(
        "/api/tuning/smooth-heatmap",
        json={
            "model_name": "default",
            "size_min": 1.0,
            "size_max": 100.0,
            "sat_min": 0.0,
            "sat_max": 1.0,
            "inner_radius": 48.0,
            "outer_radius": 10.0,
            "trials": [
                {"triangle_size": 12.0, "saturation": 0.2, "success": False},
                {"triangle_size": 56.0, "saturation": 0.6, "success": True},
            ],
        },
    )
    assert response.status_code == 422
    assert "outer_radius" in response.json()["detail"]


def test_tuning_smooth_heatmap_can_skip_heatmap_payload(client: TestClient):
    """Timeline requests can ask only for error score without the full heatmap grid."""
    response = client.post(
        "/api/tuning/smooth-heatmap",
        json={
            "model_name": "default",
            "size_min": 1.0,
            "size_max": 100.0,
            "sat_min": 0.0,
            "sat_max": 1.0,
            "include_heatmap": False,
            "trials": [
                {"triangle_size": 18.0, "saturation": 0.25, "success": False},
                {"triangle_size": 72.0, "saturation": 0.65, "success": True},
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["heatmap"] is None
    assert isinstance(data["error_score"], float)


def test_compare_shifted_models_returns_ranked_candidates(client: TestClient):
    """Shifted-model endpoint should return a complete ranked comparison payload."""
    response = client.post(
        "/api/tuning/compare-shifted-models",
        json={
            "model_name": "default",
            "size_min": 1.0,
            "size_max": 100.0,
            "sat_min": 0.0,
            "sat_max": 1.0,
            "size_shift_min": -4.0,
            "size_shift_max": 4.0,
            "size_shift_steps": 5,
            "sat_shift_min": -0.04,
            "sat_shift_max": 0.04,
            "sat_shift_steps": 5,
            "trials": [
                {"triangle_size": 14.0, "saturation": 0.12, "success": False},
                {"triangle_size": 32.0, "saturation": 0.28, "success": False},
                {"triangle_size": 56.0, "saturation": 0.52, "success": True},
                {"triangle_size": 84.0, "saturation": 0.74, "success": True},
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert data["trial_count"] == 4
    assert len(data["size_shifts"]) == 5
    assert len(data["sat_shifts"]) == 5
    assert len(data["fit_gain_grid"]) == 5
    assert len(data["fit_gain_grid"][0]) == 5
    assert len(data["candidates"]) == 25
    assert data["baseline_candidate"]["size_shift"] == 0.0
    assert data["baseline_candidate"]["sat_shift"] == 0.0
    assert data["baseline_candidate"]["fit_gain"] == 0.0
    assert data["summary"]["baseline_rank"] >= 1
    assert "best_candidate" in data
    assert data["baseline_heatmap"] is not None
    assert data["best_heatmap"] is not None
    assert data["delta_heatmap"] is not None
    assert data["delta_abs_max"] >= 0.0
    assert len(data["baseline_heatmap"]["grid"]) == 40
    assert len(data["best_heatmap"]["grid"]) == 40
    assert len(data["delta_heatmap"]["grid"]) == 40


def test_compare_shifted_models_detects_shift_direction(client: TestClient):
    """Synthetic shifted outcomes should push best-fit shifts in the same direction."""
    rng = random.Random(42)
    model = SIMULATION_MODELS["threshold_default"]

    size_min, size_max = 1.0, 100.0
    sat_min, sat_max = 0.0, 1.0
    injected_size_shift = -12.0
    injected_sat_shift = -0.12

    trials = []
    for _ in range(900):
        triangle_size = rng.uniform(size_min, size_max)
        saturation = rng.uniform(sat_min, sat_max)
        shifted_size = max(size_min, min(size_max, triangle_size - injected_size_shift))
        shifted_sat = max(sat_min, min(sat_max, saturation - injected_sat_shift))
        p_success = compute_probability(model, shifted_size, shifted_sat)
        success = rng.random() < p_success
        trials.append(
            {
                "triangle_size": triangle_size,
                "saturation": saturation,
                "success": success,
            }
        )

    response = client.post(
        "/api/tuning/compare-shifted-models",
        json={
            "model_name": "threshold_default",
            "size_min": size_min,
            "size_max": size_max,
            "sat_min": sat_min,
            "sat_max": sat_max,
            "size_shift_min": -12.0,
            "size_shift_max": 12.0,
            "size_shift_steps": 5,
            "sat_shift_min": -0.12,
            "sat_shift_max": 0.12,
            "sat_shift_steps": 5,
            "surface_steps": 24,
            "trials": trials,
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert data["summary"]["baseline_rank"] > 1
    assert data["summary"]["baseline_fit_gap"] > 0.0
    assert data["best_candidate"]["size_shift"] < 0.0
    assert data["best_candidate"]["sat_shift"] < 0.0


def test_compare_shifted_models_rejects_invalid_shift_range(client: TestClient):
    """Min/max shift ranges must be ordered."""
    response = client.post(
        "/api/tuning/compare-shifted-models",
        json={
            "model_name": "default",
            "size_min": 1.0,
            "size_max": 100.0,
            "sat_min": 0.0,
            "sat_max": 1.0,
            "size_shift_min": 5.0,
            "size_shift_max": -5.0,
            "trials": [
                {"triangle_size": 14.0, "saturation": 0.12, "success": False},
                {"triangle_size": 84.0, "saturation": 0.74, "success": True},
            ],
        },
    )
    assert response.status_code == 422
    assert "size_shift_min" in response.json()["detail"]


def test_compare_shifted_models_can_skip_surface_heatmaps(client: TestClient):
    """Clients can disable heavy visualization payload when only ranking is needed."""
    response = client.post(
        "/api/tuning/compare-shifted-models",
        json={
            "model_name": "default",
            "size_min": 1.0,
            "size_max": 100.0,
            "sat_min": 0.0,
            "sat_max": 1.0,
            "include_heatmaps": False,
            "trials": [
                {"triangle_size": 14.0, "saturation": 0.12, "success": False},
                {"triangle_size": 84.0, "saturation": 0.74, "success": True},
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["baseline_heatmap"] is None
    assert data["best_heatmap"] is None
    assert data["delta_heatmap"] is None


def test_discrimination_experiment_returns_repeated_run_comparison(client: TestClient):
    """Experiment endpoint should rerun baseline and shifted models repeatedly."""
    response = client.post(
        "/api/tuning/discrimination-experiment",
        json={
            "simulation": _payload(main_iterations=10, main_snapshot_interval=5, seed=123),
            "size_shift_min": -4.0,
            "size_shift_max": 4.0,
            "size_shift_steps": 3,
            "sat_shift_min": 0.0,
            "sat_shift_max": 0.0,
            "sat_shift_steps": 1,
            "repeats": 2,
            "estimate_steps": 30,
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert data["repeats"] == 2
    assert len(data["size_shifts"]) == 3
    assert len(data["sat_shifts"]) == 1
    assert len(data["reliability_grid"]) == 1
    assert len(data["reliability_grid"][0]) == 3
    assert len(data["candidates"]) == 3
    assert data["baseline_candidate"]["size_shift"] == 0.0
    assert data["baseline_candidate"]["sat_shift"] == 0.0
    assert data["focus_candidate"]["size_shift"] != 0.0 or data["focus_candidate"]["sat_shift"] != 0.0
    assert len(data["baseline_mean_heatmap"]["grid"]) == 30
    assert len(data["focus_mean_heatmap"]["grid"]) == 30
    assert len(data["focus_delta_heatmap"]["grid"]) == 30
    assert len(data["focus_signal_heatmap"]["grid"]) == 30
    assert data["focus_signal_abs_max"] >= 0.0
    assert len(data["baseline_ground_truth_heatmap"]["grid"]) == 30
    assert len(data["focus_ground_truth_heatmap"]["grid"]) == 30
    assert len(data["ground_truth_delta_heatmap"]["grid"]) == 30
    assert data["ground_truth_delta_abs_max"] >= 0.0


def test_discrimination_experiment_rejects_invalid_shift_range(client: TestClient):
    """Discrimination experiment should reject invalid shift ranges."""
    response = client.post(
        "/api/tuning/discrimination-experiment",
        json={
            "simulation": _payload(main_iterations=8, main_snapshot_interval=4, seed=7),
            "size_shift_min": 3.0,
            "size_shift_max": -3.0,
            "size_shift_steps": 3,
            "repeats": 2,
        },
    )
    assert response.status_code == 422
    assert "size_shift_min" in response.json()["detail"]
