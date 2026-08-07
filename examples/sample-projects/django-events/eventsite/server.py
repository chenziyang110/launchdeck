"""Convenient local server entry point with migration and seed setup."""

from __future__ import annotations

import os
from pathlib import Path


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "eventsite.settings")

    database_path = Path(
        os.environ.get(
            "EVENTS_DB_PATH",
            str(Path(__file__).resolve().parents[1] / "data" / "events.sqlite3"),
        )
    ).expanduser()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("EVENTS_DB_PATH", str(database_path))

    import django
    from django.core.management import call_command, execute_from_command_line

    django.setup()
    call_command("migrate", interactive=False, verbosity=0)
    call_command("seed_events", verbosity=0)

    host = os.environ.get("HOST", "127.0.0.1")
    port = os.environ.get("PORT", "8105")
    execute_from_command_line(
        ["manage.py", "runserver", f"{host}:{port}", "--noreload"]
    )
