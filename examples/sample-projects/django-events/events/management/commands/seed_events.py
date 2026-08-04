"""Idempotently load the fixed local event calendar."""

from __future__ import annotations

from datetime import datetime

from django.core.management.base import BaseCommand
from django.db import transaction

from events.models import Event
from events.seed import SEED_EVENTS


class Command(BaseCommand):
    help = "Create or refresh the deterministic sample events."

    @transaction.atomic
    def handle(self, *args, **options):
        for seed in SEED_EVENTS:
            values = {
                **seed,
                "starts_at": datetime.fromisoformat(str(seed["starts_at"])),
            }
            slug = str(values.pop("slug"))
            Event.objects.update_or_create(slug=slug, defaults=values)
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(SEED_EVENTS)} events."))
