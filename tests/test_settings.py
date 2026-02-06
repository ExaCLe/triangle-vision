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
