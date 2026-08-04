"""Small standard-library HTTP API for the Python side of the sample."""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import unquote, urlparse

from .storage import create_issue, get_issue, initialize_database, list_issues, update_issue

MAX_BODY_BYTES = 1024 * 1024


def send_json(handler: BaseHTTPRequestHandler, status: int, payload: Any) -> None:
    body = f"{json.dumps(payload, separators=(',', ':'))}\n".encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0"))
    if length > MAX_BODY_BYTES:
        raise ValueError("Request body is too large")
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object")
    return payload


class IssueHandler(BaseHTTPRequestHandler):
    database_path = None

    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            issues = list_issues(self.database_path)
            return send_json(self, 200, {"status": "ok", "service": "node-python-issue-tracker-python", "database": "sqlite", "seededIssues": 3, "storedIssues": len(issues)})
        if parsed.path == "/api/issues":
            issues = list_issues(self.database_path)
            return send_json(self, 200, {"issues": issues, "count": len(issues)})
        issue_id = self.issue_id(parsed.path)
        if issue_id:
            issue = get_issue(issue_id, self.database_path)
            return send_json(self, 200, issue) if issue else send_json(self, 404, {"error": "issue_not_found", "message": f"Issue {issue_id} was not found."})
        return send_json(self, 404, {"error": "not_found", "message": "Route was not found."})

    def do_POST(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if urlparse(self.path).path != "/api/issues":
            return send_json(self, 404, {"error": "not_found", "message": "Route was not found."})
        try:
            return send_json(self, 201, create_issue(read_json(self), self.database_path))
        except (ValueError, TypeError) as error:
            return send_json(self, 400, {"error": "invalid_issue", "message": str(error)})

    def do_PATCH(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        issue_id = self.issue_id(urlparse(self.path).path)
        if not issue_id:
            return send_json(self, 404, {"error": "not_found", "message": "Route was not found."})
        try:
            return send_json(self, 200, update_issue(issue_id, read_json(self), self.database_path))
        except KeyError:
            return send_json(self, 404, {"error": "issue_not_found", "message": f"Issue {issue_id} was not found."})
        except (ValueError, TypeError) as error:
            return send_json(self, 400, {"error": "invalid_issue", "message": str(error)})

    @staticmethod
    def issue_id(path: str) -> str | None:
        prefix = "/api/issues/"
        suffix = path[len(prefix):] if path.startswith(prefix) else ""
        return unquote(suffix) if suffix and "/" not in suffix else None

    def log_message(self, format: str, *args: Any) -> None:
        return None


def create_server(host: str = "127.0.0.1", port: int = 5821, database_path: str | None = None) -> ThreadingHTTPServer:
    selected_path = initialize_database(database_path)
    IssueHandler.database_path = selected_path
    return ThreadingHTTPServer((host, port), IssueHandler)


def main() -> None:
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5821"))
    server = create_server(host, port)
    print(f"Python issue tracker listening on http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

