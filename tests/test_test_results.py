from fastapi.testclient import TestClient
from main import app
import pytest
from db.database import Base, engine, get_db
from sqlalchemy.orm import Session

client = TestClient(app)


def test_create_test_result():
    response = client.post(
        "/test-results/",
        json={
            "test_id": 1,
            "accuracy": 0.95,
            "processing_time": 1.5,
            "num_triangles": 100,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["accuracy"] == 0.95
    assert "id" in data


def test_read_test_results():
    response = client.get("/test-results/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_read_test_result():
    # First create a test result
    create_response = client.post(
        "/test-results/",
        json={
            "test_id": 1,
            "accuracy": 0.95,
            "processing_time": 1.5,
            "num_triangles": 100,
        },
    )
    test_result_id = create_response.json()["id"]

    response = client.get(f"/test-results/{test_result_id}")
    assert response.status_code == 200
    assert response.json()["id"] == test_result_id


def test_update_test_result():
    # First create a test result
    create_response = client.post(
        "/test-results/",
        json={
            "test_id": 1,
            "accuracy": 0.95,
            "processing_time": 1.5,
            "num_triangles": 100,
        },
    )
    test_result_id = create_response.json()["id"]

    response = client.put(
        f"/test-results/{test_result_id}",
        json={"accuracy": 0.98, "processing_time": 1.2, "num_triangles": 120},
    )
    assert response.status_code == 200
    assert response.json()["accuracy"] == 0.98


def test_delete_test_result():
    # First create a test result
    create_response = client.post(
        "/test-results/",
        json={
            "test_id": 1,
            "accuracy": 0.95,
            "processing_time": 1.5,
            "num_triangles": 100,
        },
    )
    test_result_id = create_response.json()["id"]

    response = client.delete(f"/test-results/{test_result_id}")
    assert response.status_code == 200

    # Verify deletion
    get_response = client.get(f"/test-results/{test_result_id}")
    assert get_response.status_code == 404
