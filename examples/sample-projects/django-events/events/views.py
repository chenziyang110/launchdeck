"""HTML, JSON, and health views for the events sample."""

from __future__ import annotations

from django.db import OperationalError
from django.http import JsonResponse
from django.shortcuts import render

from .models import Event


def event_list(request):
    return render(request, "events/index.html", {"events": Event.objects.all()})


def event_list_json(request):
    events = [event.as_dict() for event in Event.objects.all()]
    return JsonResponse({"events": events, "count": len(events)})


def health(request):
    try:
        seeded_events = Event.objects.count()
    except OperationalError:
        return JsonResponse(
            {
                "status": "error",
                "service": "django-events",
                "database": "sqlite",
                "seededEvents": 0,
            },
            status=503,
        )

    return JsonResponse(
        {
            "status": "ok",
            "service": "django-events",
            "database": "sqlite",
            "seededEvents": seeded_events,
        }
    )
