import pytest
from fastapi.testclient import TestClient


def test_read_test_combinations(client: TestClient):
    response = client.get("/api/test-combinations/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_read_test_combinations_by_test(client: TestClient):
    test_id = 1
    response = client.get(f"/api/test-combinations/test/{test_id}")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_next_combination_invalid_test(client: TestClient):
    response = client.get("/api/test-combinations/next/99999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Test not found"


def test_get_next_combination_valid_test(client: TestClient):
    # First create a test
    test_response = client.post(
        "/api/tests/",
        json={
            "title": "Test for combinations",
            "description": "Testing next combination endpoint",
            "min_triangle_size": 50.0,
            "max_triangle_size": 300.0,
            "min_saturation": 0.5,
            "max_saturation": 1.0,
        },
    )
    assert test_response.status_code == 200
    test_id = test_response.json()["id"]

    # Get next combination
    response = client.get(f"/api/test-combinations/next/{test_id}")
    assert response.status_code == 200

    data = response.json()
    assert "triangle_size" in data
    assert "saturation" in data
    assert "rectangle_id" in data
    assert "test_id" in data
    assert data["test_id"] == test_id

    # Submit result
    result_response = client.post(
        "/api/test-combinations/result", json={**data, "success": 1}
    )
    assert result_response.status_code == 200


def test_get_next_combination_maintains_state(client: TestClient):
    """Test that getting multiple combinations maintains algorithm state"""
    # Create test
    test_response = client.post(
        "/api/tests/",
        json={
            "title": "State test",
            "description": "Testing state maintenance",
            "min_triangle_size": 50.0,
            "max_triangle_size": 300.0,
            "min_saturation": 0.5,
            "max_saturation": 1.0,
        },
    )
    test_id = test_response.json()["id"]

    # Get multiple combinations
    combinations = []
    for _ in range(5):
        response = client.get(f"/api/test-combinations/next/{test_id}")
        assert response.status_code == 200
        combinations.append(response.json())

    # Verify we get different combinations
    unique_combinations = {
        (c["triangle_size"], c["saturation"], c["orientation"]) for c in combinations
    }
    assert len(unique_combinations) > 1, "Should get different combinations"


def test_submit_result_workflow(client: TestClient):
    """Test the complete workflow of getting a combination and submitting its result"""
    # Create a test
    test_response = client.post(
        "/api/tests/",
        json={
            "title": "Result submission test",
            "description": "Testing result submission workflow",
            "min_triangle_size": 50.0,
            "max_triangle_size": 300.0,
            "min_saturation": 0.5,
            "max_saturation": 1.0,
        },
    )
    test_id = test_response.json()["id"]

    # Get next combination
    combination_response = client.get(f"/api/test-combinations/next/{test_id}")
    assert combination_response.status_code == 200
    combination = combination_response.json()

    # Submit successful result
    success_response = client.post(
        "/api/test-combinations/result", json={**combination, "success": 1}
    )
    assert success_response.status_code == 200

    # Submit failed result
    failure_response = client.post(
        "/api/test-combinations/result", json={**combination, "success": 0}
    )
    assert failure_response.status_code == 200


def test_submit_result_invalid_rectangle(client: TestClient):
    """Test submitting result with invalid rectangle ID"""
    response = client.post(
        "/api/test-combinations/result",
        json={
            "test_id": 1,
            "rectangle_id": 99999,
            "triangle_size": 150.0,
            "saturation": 0.75,
            "orientation": "N",
            "success": 1,
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Rectangle not found"


def test_submit_result_updates_rectangle(client: TestClient):
    """Test that submitting results updates rectangle statistics"""
    # Create test and get first combination
    test_response = client.post(
        "/api/tests/",
        json={
            "title": "Rectangle update test",
            "description": "Testing rectangle stats updates",
            "min_triangle_size": 50.0,
            "max_triangle_size": 300.0,
            "min_saturation": 0.5,
            "max_saturation": 1.0,
        },
    )
    test_id = test_response.json()["id"]

    combination_response = client.get(f"/api/test-combinations/next/{test_id}")
    combination = combination_response.json()

    # Submit multiple results
    for success in [1, 1, 0]:  # 2 successes, 1 failure
        response = client.post(
            "/api/test-combinations/result", json={**combination, "success": success}
        )
        assert response.status_code == 200

    # Get combinations to verify stats
    combinations = client.get(f"/api/test-combinations/test/{test_id}").json()
    assert len(combinations) == 3

    # Count successes and failures
    successes = sum(1 for c in combinations if c["success"] == 1)
    failures = sum(1 for c in combinations if c["success"] == 0)
    assert successes == 2
    assert failures == 1


def test_submit_result_invalid_orientation(client: TestClient):
    """Test submitting result with invalid orientation"""
    # Create test first
    test_response = client.post(
        "/api/tests/",
        json={
            "title": "Orientation test",
            "description": "Testing orientation validation",
            "min_triangle_size": 50.0,
            "max_triangle_size": 300.0,
            "min_saturation": 0.5,
            "max_saturation": 1.0,
        },
    )
    test_id = test_response.json()["id"]

    # Get a valid combination first
    combination_response = client.get(f"/api/test-combinations/next/{test_id}")
    combination = combination_response.json()

    # Try to submit with invalid orientation
    invalid_combination = combination.copy()
    invalid_combination["orientation"] = "INVALID"
    response = client.post("/api/test-combinations/result", json=invalid_combination)
    assert response.status_code == 422

    # Check the validation error details
    error_detail = response.json()["detail"][0]  # Get first validation error
    assert error_detail["type"] == "literal_error"
    assert error_detail["loc"] == ["body", "orientation"]
    assert "Input should be" in error_detail["msg"]
    assert any(orient in error_detail["msg"] for orient in ["N", "E", "S", "W"])
