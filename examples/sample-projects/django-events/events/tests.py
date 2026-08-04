from __future__ import annotations

from datetime import datetime
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from .models import Event
from .seed import SEED_EVENTS


class EventsNativeTests(TestCase):
    def setUp(self):
        call_command("seed_events", stdout=StringIO())

    def test_health_reports_ready_sqlite_database(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "ok",
                "service": "django-events",
                "database": "sqlite",
                "seededEvents": len(SEED_EVENTS),
            },
        )

    def test_real_page_renders_seeded_events(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Django Community Night")
        self.assertContains(response, "Testing Real Requests")

    def test_json_api_is_deterministic_and_sorted(self):
        response = self.client.get("/api/events")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["count"], len(SEED_EVENTS))
        self.assertEqual(
            [event["slug"] for event in body["events"]],
            ["django-community-night", "sqlite-for-web-builders", "testing-real-requests"],
        )

    def test_seed_is_idempotent(self):
        call_command("seed_events", stdout=StringIO())
        call_command("seed_events", stdout=StringIO())

        self.assertEqual(Event.objects.count(), len(SEED_EVENTS))
        self.assertEqual(
            list(Event.objects.values_list("slug", "title")),
            [
                ("django-community-night", "Django Community Night"),
                ("sqlite-for-web-builders", "SQLite for Web Builders"),
                ("testing-real-requests", "Testing Real Requests"),
            ],
        )

    def test_orm_write_persists_into_api(self):
        Event.objects.create(
            slug="new-local-meetup",
            title="New Local Meetup",
            description="A persisted event.",
            venue="Town Hall",
            starts_at=datetime.fromisoformat(str(SEED_EVENTS[0]["starts_at"])),
            capacity=20,
            is_free=True,
        )

        response = self.client.get("/api/events")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], len(SEED_EVENTS) + 1)
        self.assertIn("new-local-meetup", [event["slug"] for event in response.json()["events"]])
