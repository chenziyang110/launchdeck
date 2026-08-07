from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from inventory_api.db import initialize_database
from inventory_api.main import create_app
from inventory_api.seed import SEED_ITEMS


@pytest.fixture
def client(tmp_path: Path):
    with TestClient(create_app(str(tmp_path / "inventory.db"))) as test_client:
        yield test_client


def test_health_reports_a_ready_seeded_database(client: TestClient):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "fastapi-inventory",
        "database": "sqlite",
        "seededItems": len(SEED_ITEMS),
    }


def test_seed_is_deterministic_and_sorted(client: TestClient):
    response = client.get("/api/items")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == len(SEED_ITEMS)
    assert body["items"] == sorted(SEED_ITEMS, key=lambda item: item["sku"])


def test_seed_is_idempotent(tmp_path: Path):
    database_path = tmp_path / "inventory.db"

    initialize_database(database_path)
    initialize_database(database_path)

    with TestClient(create_app(str(database_path))) as client:
        assert client.get("/api/items").json()["count"] == len(SEED_ITEMS)


def test_new_item_persists_across_app_instances(tmp_path: Path):
    database_path = str(tmp_path / "inventory.db")
    item = {
        "sku": "MS-1004",
        "name": "Ergonomic Mouse",
        "quantity": 12,
        "location": "B-02",
    }

    with TestClient(create_app(database_path)) as first_client:
        response = first_client.post("/api/items", json=item)
        assert response.status_code == 201
        assert response.json() == item

    with TestClient(create_app(database_path)) as second_client:
        response = second_client.get("/api/items/MS-1004")
        assert response.status_code == 200
        assert response.json() == item


def test_missing_item_is_not_found(client: TestClient):
    response = client.get("/api/items/UNKNOWN")

    assert response.status_code == 404
