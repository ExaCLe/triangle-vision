"""Tests for the settings API."""
import pytest
from fastapi.testclient import TestClient


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
