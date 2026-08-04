"""Application URL patterns."""

from django.urls import path

from . import views

urlpatterns = [
    path("", views.event_list, name="event-list"),
    path("api/events", views.event_list_json, name="event-list-json"),
    path("health", views.health, name="health"),
]
