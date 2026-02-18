"""Tests for the runs API endpoints."""

from fastapi.testclient import TestClient


def _create_test(client: TestClient) -> int:
    response = client.post(
        "/api/tests/",
        json={
            "title": "Run Test",
            "description": "Test for runs",
        },
    )
    assert response.status_code == 200
    return response.json()["id"]


def _create_adaptive_run(
    client: TestClient,
    test_id: int,
    *,
    name: str,
    pretest_mode: str = "run",
    **extra,
):
    payload = {
        "test_id": test_id,
        "name": name,
        "method": "adaptive_rectangles",
        "pretest_mode": pretest_mode,
    }
    payload.update(extra)
    return client.post("/api/runs/", json=payload)


def test_create_adaptive_run_with_pretest_mode(client: TestClient):
    test_id = _create_test(client)
    response = _create_adaptive_run(
        client,
        test_id,
        name="adaptive run",
        pretest_mode="run",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "pretest"
    assert data["name"] == "adaptive run"
    assert data["method"] == "adaptive_rectangles"
    assert data["pretest_mode"] == "run"


def test_create_adaptive_run_manual_mode(client: TestClient):
    test_id = _create_test(client)
    response = _create_adaptive_run(
        client,
        test_id,
        name="manual adaptive",
        pretest_mode="manual",
        pretest_size_min=100.0,
        pretest_size_max=200.0,
        pretest_saturation_min=0.3,
        pretest_saturation_max=0.8,
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


def test_create_run_requires_name(client: TestClient):
    test_id = _create_test(client)
    response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "method": "axis_logistic",
        },
    )
    assert response.status_code == 422


def test_create_run_requires_method(client: TestClient):
    test_id = _create_test(client)
    response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "missing-method",
        },
    )
    assert response.status_code == 422


def test_create_run_name_must_be_unique_per_test(client: TestClient):
    test_id = _create_test(client)
    first = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "same-name",
            "method": "axis_logistic",
        },
    )
    assert first.status_code == 200

    second = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "same-name",
            "method": "axis_isotonic",
            "axis_switch_policy": "alternate",
        },
    )
    assert second.status_code == 422
    assert "unique" in second.json()["detail"].lower()


def test_create_axis_run_defaults_uncertainty_policy(client: TestClient):
    test_id = _create_test(client)
    response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "axis logistic",
            "method": "axis_logistic",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "axis"
    assert data["method"] == "axis_logistic"
    assert data["axis_switch_policy"] == "uncertainty"


def test_create_axis_run_with_alternate_policy(client: TestClient):
    test_id = _create_test(client)
    response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "axis isotonic",
            "method": "axis_isotonic",
            "axis_switch_policy": "alternate",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "axis"
    assert data["method"] == "axis_isotonic"
    assert data["axis_switch_policy"] == "alternate"


def test_axis_run_rejects_adaptive_fields(client: TestClient):
    test_id = _create_test(client)
    response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "bad axis",
            "method": "axis_logistic",
            "pretest_mode": "manual",
            "pretest_size_min": 100.0,
            "pretest_size_max": 200.0,
            "pretest_saturation_min": 0.3,
            "pretest_saturation_max": 0.8,
        },
    )
    assert response.status_code == 422


def test_get_next_trial_pretest(client: TestClient):
    test_id = _create_test(client)
    run_response = _create_adaptive_run(
        client,
        test_id,
        name="adaptive pretest run",
        pretest_mode="run",
    )
    run_id = run_response.json()["id"]

    next_response = client.get(f"/api/runs/{run_id}/next")
    assert next_response.status_code == 200
    data = next_response.json()
    assert data["phase"] == "pretest"
    assert "triangle_size" in data
    assert "saturation" in data
    assert "orientation" in data


def test_get_next_trial_axis_phase(client: TestClient):
    test_id = _create_test(client)
    run_response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "axis run",
            "method": "axis_logistic",
        },
    )
    assert run_response.status_code == 200
    run_id = run_response.json()["id"]

    next_response = client.get(f"/api/runs/{run_id}/next")
    assert next_response.status_code == 200
    data = next_response.json()
    assert data["phase"] == "axis"
    assert "triangle_size" in data
    assert "saturation" in data
    assert "orientation" in data


def test_submit_axis_result_and_summary_counts(client: TestClient):
    test_id = _create_test(client)
    run_response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "axis summary run",
            "method": "axis_isotonic",
            "axis_switch_policy": "alternate",
        },
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
    assert result_response.json()["phase"] == "axis"

    summary = client.get(f"/api/runs/{run_id}/summary")
    assert summary.status_code == 200
    data = summary.json()
    assert data["method"] == "axis_isotonic"
    assert data["axis_trials_count"] == 1
    assert data["total_trials_count"] == 1


def test_axis_analysis_endpoint_returns_curves_and_thresholds(client: TestClient):
    test_id = _create_test(client)
    run_response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "axis analysis run",
            "method": "axis_logistic",
        },
    )
    run_id = run_response.json()["id"]

    # collect a few samples to make analysis non-empty
    for idx in range(8):
        trial = client.get(f"/api/runs/{run_id}/next").json()
        result = client.post(
            f"/api/runs/{run_id}/result",
            json={
                "triangle_size": trial["triangle_size"],
                "saturation": trial["saturation"],
                "orientation": trial["orientation"],
                "success": 1 if idx % 2 == 0 else 0,
            },
        )
        assert result.status_code == 200

    analysis = client.get(f"/api/runs/{run_id}/analysis")
    assert analysis.status_code == 200
    data = analysis.json()

    assert data["run"]["method"] == "axis_logistic"
    assert data["counts"]["total"] == 8
    assert "size" in data["curves"]
    assert "saturation" in data["curves"]
    assert "probability" in data["curves"]["size"]
    assert data["threshold_table"]["percent_step"] == 5
    assert len(data["threshold_table"]["size"]) > 0
    assert len(data["threshold_table"]["saturation"]) > 0


def test_axis_analysis_percent_step_override(client: TestClient):
    test_id = _create_test(client)
    run_response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "axis step run",
            "method": "axis_isotonic",
        },
    )
    run_id = run_response.json()["id"]

    analysis = client.get(f"/api/runs/{run_id}/analysis?percent_step=10")
    assert analysis.status_code == 200
    data = analysis.json()
    assert data["threshold_table"]["percent_step"] == 10


def test_axis_analysis_percent_step_validation(client: TestClient):
    test_id = _create_test(client)
    run_response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "axis invalid-step run",
            "method": "axis_isotonic",
        },
    )
    run_id = run_response.json()["id"]

    analysis = client.get(f"/api/runs/{run_id}/analysis?percent_step=0")
    assert analysis.status_code == 422


def test_run_list_includes_name_and_method(client: TestClient):
    test_id = _create_test(client)
    response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "name": "continue candidate",
            "method": "axis_logistic",
        },
    )
    assert response.status_code == 200

    list_response = client.get(f"/api/runs/test/{test_id}")
    assert list_response.status_code == 200
    runs = list_response.json()
    assert len(runs) == 1
    assert runs[0]["name"] == "continue candidate"
    assert runs[0]["method"] == "axis_logistic"
