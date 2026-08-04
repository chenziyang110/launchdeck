"""Deterministic source data for a fresh events database."""

from typing import Final

SEED_EVENTS: Final[tuple[dict[str, object], ...]] = (
    {
        "slug": "django-community-night",
        "title": "Django Community Night",
        "description": "An evening of practical patterns for maintainable Django apps.",
        "venue": "Riverside Workshop",
        "starts_at": "2026-09-12T17:00:00+00:00",
        "capacity": 80,
        "is_free": True,
    },
    {
        "slug": "sqlite-for-web-builders",
        "title": "SQLite for Web Builders",
        "description": "A hands-on session on reliable local persistence and migrations.",
        "venue": "Harbor Library",
        "starts_at": "2026-09-19T15:30:00+00:00",
        "capacity": 45,
        "is_free": True,
    },
    {
        "slug": "testing-real-requests",
        "title": "Testing Real Requests",
        "description": "Build confidence with Django's native request and database tests.",
        "venue": "Northstar Studio",
        "starts_at": "2026-10-03T18:00:00+00:00",
        "capacity": 32,
        "is_free": False,
    },
)
