"""SQLite persistence and deterministic seed handling for issue records."""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SEED_PATH = PROJECT_ROOT / "data" / "seed.json"
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "data" / "python-issues.sqlite3"
VALID_STATUSES = {"open", "in_progress", "closed"}


def resolve_database_path(value: str | os.PathLike[str] | None = None) -> Path:
    selected = value or os.environ.get("ISSUE_DB_PATH") or DEFAULT_DATABASE_PATH
    return Path(selected).expanduser().resolve()


def load_seed_records(seed_path: Path = SEED_PATH) -> list[dict[str, Any]]:
    records = json.loads(seed_path.read_text(encoding="utf-8"))
    if not isinstance(records, list) or not records:
        raise ValueError("Seed data must be a non-empty list")
    return [validate_issue(record) for record in records]


def validate_issue(issue: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(issue, dict):
        raise ValueError("Issue must be an object")
    normalized = {
        "id": str(issue.get("id", "")).strip(),
        "title": str(issue.get("title", "")).strip(),
        "description": str(issue.get("description", "")).strip(),
        "status": str(issue.get("status", "open")).strip(),
        "labels": [str(label).strip() for label in issue.get("labels", []) if str(label).strip()],
        "assignee": str(issue.get("assignee", "")).strip(),
        "createdAt": str(issue.get("createdAt", "")).strip(),
    }
    if not normalized["id"] or not normalized["title"] or len(normalized["title"]) > 120:
        raise ValueError("Issue requires a title up to 120 characters")
    if normalized["status"] not in VALID_STATUSES:
        raise ValueError("Issue status is invalid")
    if len(normalized["description"]) > 2000 or len(normalized["labels"]) > 12:
        raise ValueError("Issue fields exceed the supported limits")
    if len(normalized["assignee"]) > 80 or not normalized["createdAt"]:
        raise ValueError("Issue fields exceed the supported limits")
    return normalized


def connect(database_path: Path | str) -> sqlite3.Connection:
    connection = sqlite3.connect(resolve_database_path(database_path))
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database(database_path: Path | str | None = None) -> Path:
    selected_path = resolve_database_path(database_path)
    selected_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(selected_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS issues (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'closed')),
                labels_json TEXT NOT NULL,
                assignee TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        for issue in load_seed_records():
            connection.execute(
                """
                INSERT OR IGNORE INTO issues
                    (id, title, description, status, labels_json, assignee, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (issue["id"], issue["title"], issue["description"], issue["status"], json.dumps(issue["labels"], separators=(",", ":")), issue["assignee"], issue["createdAt"]),
            )
    return selected_path


def seed_database(database_path: Path | str | None = None) -> int:
    selected_path = initialize_database(database_path)
    with connect(selected_path) as connection:
        return int(connection.execute("SELECT COUNT(*) FROM issues").fetchone()[0])


def row_to_issue(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "title": row["title"], "description": row["description"], "status": row["status"], "labels": json.loads(row["labels_json"]), "assignee": row["assignee"], "createdAt": row["created_at"]}


def list_issues(database_path: Path | str | None = None) -> list[dict[str, Any]]:
    selected_path = initialize_database(database_path)
    with connect(selected_path) as connection:
        rows = connection.execute("SELECT * FROM issues ORDER BY id").fetchall()
    return [row_to_issue(row) for row in rows]


def get_issue(issue_id: str, database_path: Path | str | None = None) -> dict[str, Any] | None:
    selected_path = initialize_database(database_path)
    with connect(selected_path) as connection:
        row = connection.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
    return row_to_issue(row) if row else None


def create_issue(payload: dict[str, Any], database_path: Path | str | None = None) -> dict[str, Any]:
    selected_path = initialize_database(database_path)
    existing = list_issues(selected_path)
    numbers = [int(issue["id"].split("-")[1]) for issue in existing if issue["id"].startswith("ISSUE-") and issue["id"].split("-")[1].isdigit()]
    next_number = max(numbers or [1000]) + 1
    from datetime import datetime, timezone

    issue = validate_issue({"id": f"ISSUE-{next_number}", "title": payload.get("title"), "description": payload.get("description", ""), "status": payload.get("status", "open"), "labels": payload.get("labels", []), "assignee": payload.get("assignee", ""), "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")})
    with connect(selected_path) as connection:
        connection.execute(
            "INSERT INTO issues VALUES (?, ?, ?, ?, ?, ?, ?)",
            (issue["id"], issue["title"], issue["description"], issue["status"], json.dumps(issue["labels"], separators=(",", ":")), issue["assignee"], issue["createdAt"]),
        )
    return issue


def update_issue(issue_id: str, payload: dict[str, Any], database_path: Path | str | None = None) -> dict[str, Any]:
    current = get_issue(issue_id, database_path)
    if current is None:
        raise KeyError(issue_id)
    updated = validate_issue({**current, **payload, "id": issue_id, "createdAt": current["createdAt"]})
    selected_path = resolve_database_path(database_path)
    with connect(selected_path) as connection:
        connection.execute(
            "UPDATE issues SET title = ?, description = ?, status = ?, labels_json = ?, assignee = ? WHERE id = ?",
            (updated["title"], updated["description"], updated["status"], json.dumps(updated["labels"], separators=(",", ":")), updated["assignee"], issue_id),
        )
    return updated

