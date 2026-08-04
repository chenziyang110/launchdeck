"""SQLite persistence for the inventory service."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Final

from .seed import SEED_ITEMS

DEFAULT_DATABASE_PATH: Final[Path] = Path("data") / "inventory.db"


def resolve_database_path(database_path: str | Path | None = None) -> Path:
    """Resolve an explicit path or the local ``INVENTORY_DB_PATH`` override."""

    configured_path = database_path or os.environ.get("INVENTORY_DB_PATH")
    return Path(configured_path or DEFAULT_DATABASE_PATH).expanduser()


def connect(database_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(database_path: Path) -> None:
    """Create the local store and insert the deterministic seed exactly once."""

    database_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                sku TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity >= 0),
                location TEXT NOT NULL
            )
            """
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO items (sku, name, quantity, location)
            VALUES (:sku, :name, :quantity, :location)
            """,
            SEED_ITEMS,
        )


def list_items(database_path: Path) -> list[dict[str, object]]:
    with connect(database_path) as connection:
        rows = connection.execute(
            "SELECT sku, name, quantity, location FROM items ORDER BY sku"
        ).fetchall()
    return [dict(row) for row in rows]


def get_item(database_path: Path, sku: str) -> dict[str, object] | None:
    with connect(database_path) as connection:
        row = connection.execute(
            "SELECT sku, name, quantity, location FROM items WHERE sku = ?",
            (sku,),
        ).fetchone()
    return dict(row) if row else None


def insert_item(database_path: Path, item: dict[str, object]) -> dict[str, object]:
    with connect(database_path) as connection:
        connection.execute(
            """
            INSERT INTO items (sku, name, quantity, location)
            VALUES (:sku, :name, :quantity, :location)
            """,
            item,
        )
    return item
