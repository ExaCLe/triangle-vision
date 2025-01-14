from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_create_test_combination():
    response = client.post(
        "/test-combinations/",
        json={
            "test_id": 1,
            "rectangle_id": 1,
            "triangle_size": 150.0,
            "saturation": 0.75,
            "orientation": "N",
            "success": 1,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["triangle_size"] == 150.0
    assert "id" in data


def test_read_test_combinations():
    response = client.get("/test-combinations/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_read_test_combination():
    # First create a test combination
    create_response = client.post(
        "/test-combinations/",
        json={
            "test_id": 1,
            "rectangle_id": 1,
            "triangle_size": 150.0,
            "saturation": 0.75,
            "orientation": "N",
            "success": 1,
        },
    )
    combination_id = create_response.json()["id"]

    response = client.get(f"/test-combinations/{combination_id}")
    assert response.status_code == 200
    assert response.json()["id"] == combination_id


def test_read_test_combinations_by_test():
    test_id = 1
    response = client.get(f"/test-combinations/test/{test_id}")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
