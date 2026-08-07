from __future__ import annotations

import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import Request, urlopen

from issue_tracker.server import create_server
from issue_tracker.storage import create_issue, get_issue, initialize_database, list_issues, update_issue


class IssueTrackerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory(prefix="issue-tracker-python-")
        self.database_path = Path(self.temp_directory.name) / "issues.sqlite3"

    def tearDown(self) -> None:
        self.temp_directory.cleanup()

    def test_seed_is_deterministic_and_idempotent(self) -> None:
        initialize_database(self.database_path)
        initialize_database(self.database_path)
        issues = list_issues(self.database_path)
        self.assertEqual([issue["id"] for issue in issues], ["ISSUE-1001", "ISSUE-1002", "ISSUE-1003"])
        self.assertEqual(len(issues), 3)

    def test_new_issue_persists_and_can_be_updated(self) -> None:
        issue = create_issue({"title": "Add release notes", "labels": ["docs"]}, self.database_path)
        self.assertEqual(issue["id"], "ISSUE-1004")
        updated = update_issue(issue["id"], {"status": "closed"}, self.database_path)
        self.assertEqual(updated["status"], "closed")
        self.assertEqual(get_issue(issue["id"], self.database_path)["title"], "Add release notes")

    def test_http_health_and_issue_list(self) -> None:
        server = create_server(port=0, database_path=str(self.database_path))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(lambda: (server.shutdown(), server.server_close(), thread.join(timeout=2)))
        base_url = f"http://127.0.0.1:{server.server_port}"
        with urlopen(f"{base_url}/health") as response:
            health = json.load(response)
        with urlopen(f"{base_url}/api/issues") as response:
            collection = json.load(response)
        self.assertEqual(health["status"], "ok")
        self.assertEqual(health["database"], "sqlite")
        self.assertEqual(collection["count"], 3)
        request = Request(f"{base_url}/api/issues", data=json.dumps({"title": "Test the HTTP endpoint"}).encode(), headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(request) as response:
            self.assertEqual(response.status, 201)


if __name__ == "__main__":
    unittest.main()

