"""URL routing for the events sample."""

from django.urls import include, path

urlpatterns = [
    path("", include("events.urls")),
]
