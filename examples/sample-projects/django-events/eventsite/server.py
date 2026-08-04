"""Convenient local server entry point with migration and seed setup."""

from __future__ import annotations

import os


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "eventsite.settings")

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
