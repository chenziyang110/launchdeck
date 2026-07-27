"""A small in-memory notes API with an application factory."""

from __future__ import annotations

import os
from typing import Any

from flask import Flask, jsonify, render_template, request

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 5055


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_mapping(TESTING=False)
    if test_config:
        app.config.update(test_config)

    notes: list[dict[str, Any]] = []
    next_note_id = 1

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/health")
    def health():
        return jsonify(service="flask-notes-api", status="healthy")

    @app.get("/api/notes")
    def list_notes():
        return jsonify(items=notes, count=len(notes))

    @app.post("/api/notes")
    def create_note():
        nonlocal next_note_id
        payload = request.get_json(silent=True)
        text = payload.get("text", "").strip() if isinstance(payload, dict) else ""
        if not text:
            return jsonify(error="A non-empty 'text' field is required."), 400

        note = {"id": next_note_id, "text": text}
        next_note_id += 1
        notes.append(note)
        return jsonify(note), 201

    @app.delete("/api/notes/<int:note_id>")
    def delete_note(note_id: int):
        for index, note in enumerate(notes):
            if note["id"] == note_id:
                notes.pop(index)
                return "", 204
        return jsonify(error="Note not found."), 404

    return app


def main() -> None:
    host = os.environ.get("HOST", DEFAULT_HOST)
    port = int(os.environ.get("PORT", str(DEFAULT_PORT)))
    debug = os.environ.get("FLASK_DEBUG", "").lower() in {"1", "true", "yes"}
    create_app().run(host=host, port=port, debug=debug, use_reloader=False)


if __name__ == "__main__":
    main()
