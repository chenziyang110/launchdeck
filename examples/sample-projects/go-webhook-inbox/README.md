# Go Webhook Inbox

A small, dependency-free Go HTTP service that receives webhook JSON, stores it
in a local JSON file, and exposes a health check plus read API. The first run
creates `data/events.json` from the deterministic seed in
`internal/inbox/seed.json`; seeding is idempotent, so restarting the service
does not duplicate events.

## Requirements

- Go 1.22 or newer

## Install

From this directory, verify the module and download its (standard-library-only)
dependency set:

```bash
go mod download
go mod verify
```

There are no third-party modules, so installation does not require a package
manager or a service such as a database.

## Test

Run the native Go tests:

```bash
go test ./...
```

The tests cover deterministic seed creation, idempotent reopen, HTTP health,
webhook validation, and persistence across a write.

## Run

The service listens on `127.0.0.1:8106` by default:

```bash
go run ./cmd/inbox
```

To use another local port, set `PORT` before starting. `HOST` and
`INBOX_DATA_PATH` can also be overridden for an isolated run:

```bash
PORT=9106 INBOX_DATA_PATH=/tmp/go-webhook-inbox/events.json go run ./cmd/inbox
```

On Windows PowerShell:

```powershell
$env:PORT = "9106"
$env:INBOX_DATA_PATH = "$PWD\data\events-local.json"
go run ./cmd/inbox
```

## API

- `GET /health` reports readiness, storage type, and event counts.
- `GET /api/events` returns all events in stable ID order.
- `GET /api/events/{id}` returns one stored event.
- `POST /api/webhooks` accepts `{ "eventType": "...", "source": "...", "payload": { ... } }` and persists it.

Example request:

```bash
curl -X POST http://127.0.0.1:8106/api/webhooks \
  -H 'Content-Type: application/json' \
  -d '{"eventType":"order.created","source":"checkout","payload":{"orderId":"ord-9"}}'
```

Example health response:

```json
{"status":"ok","service":"go-webhook-inbox","persistence":"json-file","eventCount":3,"seededEventCount":3}
```

## Cleanup

Stop the foreground process with `Ctrl+C`. The only generated project-local
data file is `data/events.json`; remove it after stopping when you want a
fresh seeded inbox:

```bash
rm -f data/events.json
```

On Windows PowerShell:

```powershell
Remove-Item -Force data/events.json -ErrorAction SilentlyContinue
```

If you set `INBOX_DATA_PATH`, remove that override path instead. Do not remove
`internal/inbox/seed.json`, which is committed source data.
