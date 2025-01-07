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
    test_data = {"title": "Test Title", "description": "Test Description"}
    response = client.post("/tests/", json=test_data)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == test_data["title"]
    assert data["description"] == test_data["description"]
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
        {"title": "Test 1", "description": "Description 1"},
        {"title": "Test 2", "description": "Description 2"},
    ]
    for data in test_data:
        client.post("/tests/", json=data)

    response = client.get("/tests/")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 2
    for item in data:
        assert "id" in item
        assert "title" in item
        assert "description" in item
        assert "created_at" in item


def test_read_test(client: TestClient):
    """
    Test GET /tests/{test_id} endpoint
    This test verifies that:
    1. A specific test can be retrieved by ID
    2. The response contains the correct data
    3. Non-existent IDs return 404
    """
    # Create a test first
    test_data = {"title": "Test Title", "description": "Test Description"}
    create_response = client.post("/tests/", json=test_data)
    test_id = create_response.json()["id"]

    # Test successful retrieval
    response = client.get(f"/tests/{test_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == test_data["title"]
    assert data["description"] == test_data["description"]

    # Test non-existent ID
    response = client.get("/tests/999999")
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
    test_data = {"title": "Original Title", "description": "Original Description"}
    create_response = client.post("/tests/", json=test_data)
    test_id = create_response.json()["id"]
    original_created_at = create_response.json()["created_at"]

    # Update the test
    update_data = {"title": "Updated Title", "description": "Updated Description"}
    response = client.put(f"/tests/{test_id}", json=update_data)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == update_data["title"]
    assert data["description"] == update_data["description"]
    assert data["created_at"] == original_created_at

    # Test non-existent ID
    response = client.put("/tests/999999", json=update_data)
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
    test_data = {"title": "Test Title", "description": "Test Description"}
    create_response = client.post("/tests/", json=test_data)
    test_id = create_response.json()["id"]

    # Delete the test
    response = client.delete(f"/tests/{test_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == test_data["title"]
    assert data["description"] == test_data["description"]

    # Verify the test is deleted
    response = client.get(f"/tests/{test_id}")
    assert response.status_code == 404

    # Test non-existent ID
    response = client.delete("/tests/999999")
    assert response.status_code == 404
