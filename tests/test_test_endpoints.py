import pytest
from fastapi.testclient import TestClient


def test_create_test(client: TestClient):
    """
    Test POST /tests/ endpoint
    This test verifies that:
    1. A new test can be created with valid data
    2. The response contains the correct fields
    3. The created_at field is present
    4. The response status code is 200
    """
    test_data = {
        "title": "Test Title",
        "description": "Test Description",
    }
    response = client.post("/api/tests/", json=test_data)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == test_data["title"]
    assert data["description"] == test_data["description"]
    assert data["min_triangle_size"] is None
    assert data["max_triangle_size"] is None
    assert data["min_saturation"] is None
    assert data["max_saturation"] is None
    assert "id" in data
    assert "created_at" in data


def test_read_tests(client: TestClient):
    """
    Test GET /tests/ endpoint
    This test verifies that:
    1. Multiple tests can be retrieved
    2. The response is a list
    3. The response contains the correct number of items
    4. Each item has the required fields
    """
    # Create some test data first
    test_data = [
        {
            "title": "Test 1",
            "description": "Description 1",
        },
        {
            "title": "Test 2",
            "description": "Description 2",
            "min_triangle_size": 2.0,
            "max_triangle_size": 6.0,
            "min_saturation": 0.3,
            "max_saturation": 0.9,
        },
    ]
    for data in test_data:
        client.post("/api/tests/", json=data)

    response = client.get("/api/tests/")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 2
    for item in data:
        assert "id" in item
        assert "title" in item
        assert "description" in item
        assert "created_at" in item
        assert "min_triangle_size" in item
        assert "max_triangle_size" in item
        assert "min_saturation" in item
        assert "max_saturation" in item


def test_read_test(client: TestClient):
    """
    Test GET /tests/{test_id} endpoint
    This test verifies that:
    1. A specific test can be retrieved by ID
    2. The response contains the correct data
    3. Non-existent IDs return 404
    """
    # Create a test first
    test_data = {
        "title": "Test Title",
        "description": "Test Description",
    }
    create_response = client.post("/api/tests/", json=test_data)
    test_id = create_response.json()["id"]

    # Test successful retrieval
    response = client.get(f"/api/tests/{test_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == test_data["title"]
    assert data["description"] == test_data["description"]
    assert data["min_triangle_size"] is None
    assert data["max_triangle_size"] is None
    assert data["min_saturation"] is None
    assert data["max_saturation"] is None

    # Test non-existent ID
    response = client.get("/api/tests/999999")
    assert response.status_code == 404


def test_update_test(client: TestClient):
    """
    Test PUT /tests/{test_id} endpoint
    This test verifies that:
    1. An existing test can be updated
    2. The response contains the updated data
    3. Non-existent IDs return 404
    4. The created_at field remains unchanged
    """
    # Create a test first
    test_data = {
        "title": "Original Title",
        "description": "Original Description",
    }
    create_response = client.post("/api/tests/", json=test_data)
    test_id = create_response.json()["id"]
    original_created_at = create_response.json()["created_at"]

    # Update the test
    update_data = {
        "title": "Updated Title",
        "description": "Updated Description",
        "min_triangle_size": 2.0,
        "max_triangle_size": 6.0,
        "min_saturation": 0.3,
        "max_saturation": 0.9,
    }
    response = client.put(f"/api/tests/{test_id}", json=update_data)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == update_data["title"]
    assert data["description"] == update_data["description"]
    assert data["created_at"] == original_created_at
    assert data["min_triangle_size"] == update_data["min_triangle_size"]
    assert data["max_triangle_size"] == update_data["max_triangle_size"]
    assert data["min_saturation"] == update_data["min_saturation"]
    assert data["max_saturation"] == update_data["max_saturation"]

    # Test non-existent ID
    response = client.put("/api/tests/999999", json=update_data)
    assert response.status_code == 404


def test_delete_test(client: TestClient):
    """
    Test DELETE /tests/{test_id} endpoint
    This test verifies that:
    1. An existing test can be deleted
    2. The response contains the deleted test data
    3. Non-existent IDs return 404
    4. Deleted tests cannot be retrieved
    """
    # Create a test first
    test_data = {
        "title": "Test Title",
        "description": "Test Description",
    }
    create_response = client.post("/api/tests/", json=test_data)
    test_id = create_response.json()["id"]

    # Delete the test
    response = client.delete(f"/api/tests/{test_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == test_data["title"]
    assert data["description"] == test_data["description"]
    assert data["min_triangle_size"] is None
    assert data["max_triangle_size"] is None
    assert data["min_saturation"] is None
    assert data["max_saturation"] is None

    # Verify the test is deleted
    response = client.get(f"/api/tests/{test_id}")
    assert response.status_code == 404

    # Test non-existent ID
    response = client.delete("/api/tests/999999")
    assert response.status_code == 404


def test_delete_test_with_related_run_and_combination(client: TestClient):
    """
    Deleting a test should also remove related runs/combinations so deletion
    still succeeds after the test has execution history.
    """
    create_response = client.post(
        "/api/tests/",
        json={"title": "Delete With History", "description": "Has related data"},
    )
    assert create_response.status_code == 200
    test_id = create_response.json()["id"]

    run_response = client.post(
        "/api/runs/",
        json={
            "test_id": test_id,
            "pretest_mode": "manual",
            "pretest_size_min": 100.0,
            "pretest_size_max": 200.0,
            "pretest_saturation_min": 0.2,
            "pretest_saturation_max": 0.8,
        },
    )
    assert run_response.status_code == 200
    run_id = run_response.json()["id"]

    next_trial_response = client.get(f"/api/runs/{run_id}/next")
    assert next_trial_response.status_code == 200
    trial = next_trial_response.json()

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

    delete_response = client.delete(f"/api/tests/{test_id}")
    assert delete_response.status_code == 200

    assert client.get(f"/api/tests/{test_id}").status_code == 404
    assert client.get(f"/api/runs/{run_id}").status_code == 404

    combinations_response = client.get(f"/api/test-combinations/test/{test_id}")
    assert combinations_response.status_code == 200
    assert combinations_response.json() == []
