# Node.js + Python Issue Tracker

A small two-service issue tracker monorepo. The Node.js service serves the
browser page and a JSON-file API; the Python service exposes the same issue
model backed by SQLite. Both services use the committed seed records, native
test runners, and only standard-library runtime APIs.

## Requirements

- Node.js 20 or newer and npm 10 or newer
- Python 3.11, 3.12, or 3.13
- Poetry 2.x for the Python project

## Install

Install each side from this directory. The lock files make the installs
repeatable; the Python project intentionally has no third-party runtime
dependencies.

```bash
npm ci
poetry install
```

## Test

Run the native test suites independently or together:

```bash
npm test
poetry run python -m unittest discover -s python/tests -p 'test_*.py'
npm run test:all
```

The tests cover deterministic, idempotent seeding, local persistence, the
issue API, and health responses without requiring a database server.

## Run

Start the Node.js page/API on `127.0.0.1:4821`:

```bash
npm start
```

Start the Python API in another terminal on `127.0.0.1:5821`:

```bash
poetry run issue-server
```

Both default ports are unique within the sample gallery and can be overridden
without editing source files:

```bash
PORT=4921 npm start
PORT=5921 poetry run issue-server
```

On Windows PowerShell:

```powershell
$env:PORT = "4921"
npm start
$env:PORT = "5921"
poetry run issue-server
```

The Node service renders the issue page at `GET /` and exposes:

- `GET /health` — JSON readiness and persisted issue count
- `GET /api/issues` — seeded and user-created issues
- `GET /api/issues/:id` — one issue
- `POST /api/issues` — create an issue from `{title, description, labels, assignee}`
- `PATCH /api/issues/:id` — update editable fields, including `status`

The Python service exposes the same API and `GET /health` on its own port. Its
SQLite file is created at `data/python-issues.sqlite3`; the Node store is
created at `data/node-issues.json`. Set `ISSUE_STORE_PATH` or `ISSUE_DB_PATH`
to place either runtime store in an isolated temporary directory.

Example health checks:

```bash
curl http://127.0.0.1:4821/health
curl http://127.0.0.1:5821/health
```

## Seed data

`data/seed.json` is the deterministic source shared by both services. Seeding
is repeatable and idempotent:

```bash
npm run seed
poetry run issue-seed
```

## Cleanup

Stop foreground services with `Ctrl+C`. Remove only generated local stores
after stopping them:

```bash
rm -f data/node-issues.json data/python-issues.sqlite3 data/python-issues.sqlite3-*
```

On Windows PowerShell:

```powershell
Remove-Item -LiteralPath data/node-issues.json,data/python-issues.sqlite3 -Force -ErrorAction SilentlyContinue
Get-ChildItem -LiteralPath data -Filter 'python-issues.sqlite3-*' -ErrorAction SilentlyContinue | Remove-Item -Force
```

Do not commit `node_modules`, a virtual environment, SQLite files, JSON
runtime stores, or other generated output.

