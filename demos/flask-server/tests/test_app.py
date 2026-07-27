from flask_demo import create_app


def test_health_endpoint():
    client = create_app({"TESTING": True}).test_client()

    response = client.get("/health")

    assert response.status_code == 200
    assert response.get_json() == {
        "service": "flask-notes-api",
        "status": "healthy",
    }


def test_home_page_renders_note_workspace():
    client = create_app({"TESTING": True}).test_client()

    response = client.get("/")

    assert response.status_code == 200
    assert response.content_type.startswith("text/html")
    assert b"Flask Notes" in response.data
    assert b'id="note-form"' in response.data


def test_note_lifecycle():
    client = create_app({"TESTING": True}).test_client()

    created = client.post("/api/notes", json={"text": "first note"})
    listed = client.get("/api/notes")

    assert created.status_code == 201
    assert created.get_json() == {"id": 1, "text": "first note"}
    assert listed.get_json() == {
        "items": [{"id": 1, "text": "first note"}],
        "count": 1,
    }

    deleted = client.delete("/api/notes/1")
    after_delete = client.get("/api/notes")

    assert deleted.status_code == 204
    assert after_delete.get_json() == {"items": [], "count": 0}


def test_note_text_is_required():
    client = create_app({"TESTING": True}).test_client()

    response = client.post("/api/notes", json={"text": "  "})

    assert response.status_code == 400
    assert response.get_json() == {"error": "A non-empty 'text' field is required."}


def test_delete_reports_a_missing_note():
    client = create_app({"TESTING": True}).test_client()

    response = client.delete("/api/notes/404")

    assert response.status_code == 404
    assert response.get_json() == {"error": "Note not found."}
