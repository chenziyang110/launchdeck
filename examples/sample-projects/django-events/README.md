# Django Events

A small event calendar built with Django and backed by a local SQLite database.
It includes a deterministic seed command, a rendered event page, a JSON API,
and a health endpoint.

## Requirements

- Python 3.11, 3.12, or 3.13
- Poetry 2.x

## Install

Install the locked application dependencies:

```bash
poetry install
```

## Test

Run Django's native test runner:

```bash
poetry run python manage.py test
```

The tests use an isolated SQLite test database and verify the seeded records,
HTML page, JSON response, idempotent seed behavior, and ORM persistence.

## Run

The easiest local run performs migrations and seeds the database before
starting Django's development server:

```bash
poetry run events-server
```

It listens on `http://127.0.0.1:8105` by default. Override the local port with
`PORT` (and the bind address with `HOST`):

```bash
PORT=9105 poetry run events-server
```

On Windows PowerShell:

```powershell
$env:PORT = "9105"
poetry run events-server
```

The server creates `data/events.sqlite3` in the project directory. To perform
the lifecycle steps manually, use Django's native commands:

```bash
poetry run python manage.py migrate
poetry run python manage.py seed_events
poetry run python manage.py runserver 127.0.0.1:8105
```

Set `EVENTS_DB_PATH` to place the SQLite file somewhere else. The application
also exposes the same port override when run through `events-server`.

## Surfaces

- `GET /` renders the upcoming seeded events.
- `GET /api/events` returns the events as JSON.
- `GET /health` reports SQLite readiness and the current seeded event count.

Example health response:

```json
{"status":"ok","service":"django-events","database":"sqlite","seededEvents":3}
```

## Cleanup

Stop the foreground server with `Ctrl+C`. Remove only the generated local
database when it is no longer needed:

```bash
rm -rf data
```

On Windows PowerShell:

```powershell
Remove-Item -LiteralPath data -Recurse -Force
```

The source tree contains no checked-in database, virtual environment, or build
output.
