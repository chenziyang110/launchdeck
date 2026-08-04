"""SQLite-backed event model."""

from __future__ import annotations

from django.db import models


class Event(models.Model):
    slug = models.SlugField(max_length=80, unique=True)
    title = models.CharField(max_length=160)
    description = models.TextField()
    venue = models.CharField(max_length=120)
    starts_at = models.DateTimeField()
    capacity = models.PositiveIntegerField()
    is_free = models.BooleanField(default=True)

    class Meta:
        ordering = ["starts_at", "slug"]

    def __str__(self) -> str:
        return self.title

    def as_dict(self) -> dict[str, object]:
        return {
            "slug": self.slug,
            "title": self.title,
            "description": self.description,
            "venue": self.venue,
            "startsAt": self.starts_at.isoformat(),
            "capacity": self.capacity,
            "isFree": self.is_free,
        }
