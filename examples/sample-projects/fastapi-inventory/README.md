# FastAPI Inventory

A small inventory service backed by SQLite. The database is created in `data/`
on first start and is seeded with the same three records on every fresh copy.
Seed insertion is idempotent, so restarting the service does not duplicate
items.

## Requirements

- Python 3.11, 3.12, or 3.13
- Poetry 2.x

## Install

```bash
poetry install
```

The committed `poetry.lock` keeps application and test dependencies
repeatable.

## Test

```bash
poetry run pytest
```

## Run

The service listens on `127.0.0.1:8104` by default:

```bash
poetry run python -m inventory_api
```

To use another local port, set `PORT` before starting.

```bash
PORT=9104 poetry run python -m inventory_api
```

On Windows PowerShell:

```powershell
$env:PORT = "9104"
poetry run python -m inventory_api
```

## API

- `GET /health` reports database readiness and the seeded item count.
- `GET /api/items` returns items sorted by SKU.
- `GET /api/items/{sku}` returns one item or `404`.
- `POST /api/items` adds an item and persists it in SQLite.

Example health response:

```json
{"status":"ok","service":"fastapi-inventory","database":"sqlite","seededItems":3}
```

## Cleanup

Stop the foreground process with `Ctrl+C`. Remove the generated `data/`
directory after stopping if the local database is no longer needed.
