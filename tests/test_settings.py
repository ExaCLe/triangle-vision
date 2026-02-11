"""Tests for the settings API."""
import pytest
from fastapi.testclient import TestClient
from algorithm_to_find_combinations.ground_truth import bandpass_probability, threshold_probability


def test_get_pretest_settings_returns_defaults(client: TestClient):
    """GET /api/settings/pretest should return default settings."""
    response = client.get("/api/settings/pretest")
    assert response.status_code == 200
    data = response.json()
    assert data["lower_target"] == 0.40
    assert data["upper_target"] == 0.95
    assert data["probe_rule"]["success_target"] == 10
    assert data["probe_rule"]["trial_cap"] == 30
    assert data["search"]["max_probes_per_axis"] == 12
    assert data["search"]["refine_steps_per_edge"] == 2
    assert data["display"]["masking"]["duration_ms"] == 0
    assert data["display"]["eink"]["enabled"] is False
    assert data["display"]["eink"]["flash_color"] == "white"
    assert data["display"]["flip"]["horizontal"] is False
    assert data["display"]["flip"]["vertical"] is False
    assert data["display"]["invert_colors"] is False


def test_put_and_get_roundtrip(client: TestClient):
    """PUT then GET should return the updated settings."""
    updated = {
        "lower_target": 0.35,
        "upper_target": 0.90,
        "probe_rule": {"success_target": 8, "trial_cap": 25},
        "search": {"max_probes_per_axis": 10, "refine_steps_per_edge": 3},
        "global_limits": {
            "min_triangle_size": 20.0,
            "max_triangle_size": 350.0,
            "min_saturation": 0.1,
            "max_saturation": 0.9,
        },
        "display": {
            "masking": {"duration_ms": 250},
            "eink": {
                "enabled": True,
                "flash_color": "black",
                "flash_duration_ms": 120,
            },
            "flip": {"horizontal": True, "vertical": False},
            "invert_colors": True,
        },
    }
    put_response = client.put("/api/settings/pretest", json=updated)
    assert put_response.status_code == 200

    get_response = client.get("/api/settings/pretest")
    assert get_response.status_code == 200
    data = get_response.json()
    assert data["lower_target"] == 0.35
    assert data["upper_target"] == 0.90
    assert data["probe_rule"]["success_target"] == 8
    assert data["search"]["refine_steps_per_edge"] == 3
    assert data["global_limits"]["min_triangle_size"] == 20.0
    assert data["display"]["masking"]["duration_ms"] == 250
    assert data["display"]["eink"]["enabled"] is True
    assert data["display"]["eink"]["flash_color"] == "black"
    assert data["display"]["eink"]["flash_duration_ms"] == 120
    assert data["display"]["flip"]["horizontal"] is True
    assert data["display"]["invert_colors"] is True


def test_list_simulation_models(client: TestClient):
    """GET /api/settings/simulation-models should return available models."""
    response = client.get("/api/settings/simulation-models")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 2
    names = [m["name"] for m in data]
    assert "default" in names
    assert "model2" in names
    for m in data:
        assert "label" in m
        assert "description" in m


def test_get_model_heatmap(client: TestClient):
    """GET /api/settings/simulation-models/{name}/heatmap returns a probability grid."""
    response = client.get(
        "/api/settings/simulation-models/default/heatmap",
        params={"steps": 5},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["model_name"] == "default"
    assert len(data["triangle_sizes"]) == 5
    assert len(data["saturations"]) == 5
    assert len(data["grid"]) == 5
    assert len(data["grid"][0]) == 5
    # Probabilities should be in [0, 1]
    for row in data["grid"]:
        for p in row:
            assert 0 <= p <= 1


def test_get_model_heatmap_unknown(client: TestClient):
    """GET /api/settings/simulation-models/{unknown}/heatmap returns 404."""
    response = client.get("/api/settings/simulation-models/nonexistent/heatmap")
    assert response.status_code == 404


def test_custom_model_heatmap(client: TestClient):
    """POST /api/settings/simulation-models/custom/heatmap returns a grid."""
    response = client.post(
        "/api/settings/simulation-models/custom/heatmap",
        json={"base": 0.5, "coefficient": 0.4, "exponent": 0.5, "steps": 5},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["model_name"] == "custom"
    assert len(data["grid"]) == 5
    for row in data["grid"]:
        for p in row:
            assert 0 <= p <= 1


# ── Bandpass model tests ──────────────────────────────────

def test_bandpass_probability_center():
    """Bandpass model should return high probability in the center of the window."""
    p = bandpass_probability(
        175, 0.5,
        ts_low=50, ts_w_low=15, ts_high=300, ts_w_high=15,
        sat_low=0.2, sat_w_low=0.05, sat_high=0.8, sat_w_high=0.05,
        gamma=1.0, eps_clip=0.01,
    )
    assert p > 0.9


def test_bandpass_probability_outside():
    """Bandpass model should return ~0.25 far outside the window."""
    p = bandpass_probability(
        1, 0.0,
        ts_low=50, ts_w_low=15, ts_high=300, ts_w_high=15,
        sat_low=0.2, sat_w_low=0.05, sat_high=0.8, sat_w_high=0.05,
        gamma=1.0, eps_clip=0.01,
    )
    assert abs(p - 0.25) < 0.02


def test_list_simulation_models_includes_bandpass(client: TestClient):
    """Simulation models list should include the bandpass_default model."""
    response = client.get("/api/settings/simulation-models")
    assert response.status_code == 200
    data = response.json()
    names = [m["name"] for m in data]
    assert "bandpass_default" in names
    bp = next(m for m in data if m["name"] == "bandpass_default")
    assert bp["model_type"] == "bandpass"


def test_get_bandpass_model_heatmap(client: TestClient):
    """GET heatmap for the built-in bandpass model should work."""
    response = client.get(
        "/api/settings/simulation-models/bandpass_default/heatmap",
        params={"steps": 5},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["model_name"] == "bandpass_default"
    assert len(data["grid"]) == 5
    for row in data["grid"]:
        for p in row:
            assert 0 <= p <= 1


def test_custom_bandpass_heatmap(client: TestClient):
    """POST custom heatmap with bandpass type should work."""
    response = client.post(
        "/api/settings/simulation-models/custom/heatmap",
        json={
            "model_type": "bandpass",
            "ts_low": 50, "ts_w_low": 15,
            "ts_high": 300, "ts_w_high": 15,
            "sat_low": 0.2, "sat_w_low": 0.05,
            "sat_high": 0.8, "sat_w_high": 0.05,
            "gamma": 1.0, "eps_clip": 0.01,
            "steps": 5,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["model_name"] == "custom"
    assert len(data["grid"]) == 5
    for row in data["grid"]:
        for p in row:
            assert 0 <= p <= 1


def test_save_and_load_bandpass_custom_model(client: TestClient):
    """Save a bandpass custom model and verify it appears in the model list."""
    save_response = client.post(
        "/api/settings/custom-models",
        json={
            "name": "my_bandpass",
            "model_type": "bandpass",
            "ts_low": 60, "ts_w_low": 10,
            "ts_high": 250, "ts_w_high": 20,
            "sat_low": 0.1, "sat_w_low": 0.03,
            "sat_high": 0.9, "sat_w_high": 0.04,
            "gamma": 0.8, "eps_clip": 0.02,
        },
    )
    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved["name"] == "my_bandpass"
    assert saved["model_type"] == "bandpass"
    assert saved["ts_low"] == 60

    # Verify it shows up in simulation-models list
    list_response = client.get("/api/settings/simulation-models")
    data = list_response.json()
    names = [m["name"] for m in data]
    assert "my_bandpass" in names
    bp = next(m for m in data if m["name"] == "my_bandpass")
    assert bp["model_type"] == "bandpass"

    # Verify heatmap works for the saved model
    heatmap_response = client.get(
        "/api/settings/simulation-models/my_bandpass/heatmap",
        params={"steps": 3},
    )
    assert heatmap_response.status_code == 200
    hm = heatmap_response.json()
    assert hm["model_name"] == "my_bandpass"
    for row in hm["grid"]:
        for p in row:
            assert 0 <= p <= 1


# ── Contrast-threshold model tests ────────────────────────

def test_threshold_probability_above_threshold():
    """High sat + large size should give high probability (well above threshold)."""
    p = threshold_probability(
        200, 0.8,
        c_inf=0.12, c_0=0.95, ts_50=60.0, beta=2.0, k=3.0,
    )
    assert p > 0.9


def test_threshold_probability_below_threshold():
    """Very low sat (below threshold curve) should give ~0.25."""
    p = threshold_probability(
        200, 0.01,
        c_inf=0.12, c_0=0.95, ts_50=60.0, beta=2.0, k=3.0,
    )
    assert abs(p - 0.25) < 0.02


def test_threshold_probability_small_size_needs_high_sat():
    """Small triangle size raises the threshold; moderate sat should still be low."""
    p = threshold_probability(
        10, 0.3,
        c_inf=0.12, c_0=0.95, ts_50=60.0, beta=2.0, k=3.0,
    )
    # At ts=10 the threshold C_t is very high (~0.93), sat=0.3 is well below
    assert p < 0.30


def test_list_simulation_models_includes_threshold(client: TestClient):
    """Simulation models list should include the threshold_default model."""
    response = client.get("/api/settings/simulation-models")
    assert response.status_code == 200
    data = response.json()
    names = [m["name"] for m in data]
    assert "threshold_default" in names
    th = next(m for m in data if m["name"] == "threshold_default")
    assert th["model_type"] == "threshold"


def test_get_threshold_model_heatmap(client: TestClient):
    """GET heatmap for the built-in threshold model should work."""
    response = client.get(
        "/api/settings/simulation-models/threshold_default/heatmap",
        params={"steps": 5},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["model_name"] == "threshold_default"
    assert len(data["grid"]) == 5
    for row in data["grid"]:
        for p in row:
            assert 0 <= p <= 1


def test_custom_threshold_heatmap(client: TestClient):
    """POST custom heatmap with threshold type should work."""
    response = client.post(
        "/api/settings/simulation-models/custom/heatmap",
        json={
            "model_type": "threshold",
            "c_inf": 0.12, "c_0": 0.95,
            "ts_50": 60.0, "beta": 2.0, "k": 3.0,
            "steps": 5,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["model_name"] == "custom"
    assert len(data["grid"]) == 5
    for row in data["grid"]:
        for p in row:
            assert 0 <= p <= 1


def test_save_and_load_threshold_custom_model(client: TestClient):
    """Save a threshold custom model and verify roundtrip."""
    save_response = client.post(
        "/api/settings/custom-models",
        json={
            "name": "my_threshold",
            "model_type": "threshold",
            "c_inf": 0.15, "c_0": 0.90,
            "ts_50": 80.0, "beta": 1.5, "k": 4.0,
        },
    )
    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved["name"] == "my_threshold"
    assert saved["model_type"] == "threshold"
    assert saved["c_inf"] == 0.15

    # Verify it shows up in simulation-models list
    list_response = client.get("/api/settings/simulation-models")
    data = list_response.json()
    names = [m["name"] for m in data]
    assert "my_threshold" in names
    th = next(m for m in data if m["name"] == "my_threshold")
    assert th["model_type"] == "threshold"

    # Verify heatmap works
    heatmap_response = client.get(
        "/api/settings/simulation-models/my_threshold/heatmap",
        params={"steps": 3},
    )
    assert heatmap_response.status_code == 200
    hm = heatmap_response.json()
    assert hm["model_name"] == "my_threshold"
    for row in hm["grid"]:
        for p in row:
            assert 0 <= p <= 1
