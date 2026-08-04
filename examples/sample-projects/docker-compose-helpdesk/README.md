# Docker Compose Helpdesk

A small, standalone helpdesk application for a local support team. Docker
Compose runs the Node service, stores tickets in a local named volume, and
exposes both a browser page and a JSON API. It can be copied and run
independently.

## Requirements

- Docker Engine with Docker Compose v2
- Node.js 20 or newer for the optional host-native test command

## Install

Install the locked host dependencies (there are no third-party packages, but
the lock file keeps the project install contract explicit):

```bash
npm ci
```

The Compose install happens during the image build:

```bash
docker compose build
```

On a Windows host using Windows containers, select the Windows-compatible
Dockerfile before building or starting Compose:

```powershell
$env:HELPDESK_DOCKERFILE = "Dockerfile.windows"
docker compose build
```

Linux containers use `Dockerfile` by default. The Windows Dockerfile targets
the Windows Server 2025 container base used by current Windows runners.

## Test

Run the native tests without starting a long-lived service:

```bash
npm test
```

The same tests can run in the Compose image:

```bash
docker compose run --rm --no-deps helpdesk npm test
```

## Run

Start the helpdesk on the default, sample-specific host port `8110`:

```bash
docker compose up --build
```

Open <http://localhost:8110/>. The seeded queue contains three fixed tickets.
The service is healthy when `GET /health` returns JSON with `"status":"ok"`:

```bash
curl http://localhost:8110/health
```

To choose another host port, set `HELPDESK_PORT` before Compose starts:

```bash
HELPDESK_PORT=9110 docker compose up --build
```

On Windows PowerShell:

```powershell
$env:HELPDESK_PORT = "9110"
docker compose up --build
```

The API supports `GET /api/tickets`, `GET /api/tickets/:id`, and
`POST /api/tickets`. A POST body contains `title`, `description`,
`requesterEmail`, and an optional `priority` (`low`, `normal`, or `high`).

The first start writes the deterministic records from `db/seed.json` to the
Compose-managed `helpdesk-data` volume. Restarts preserve tickets. The
idempotent seed command reports the existing store, while an explicit reset
restores the three seed records:

```bash
docker compose run --rm --no-deps helpdesk npm run seed
docker compose run --rm --no-deps helpdesk npm run seed -- --reset
```

## Cleanup

Stop the service and keep the local ticket volume:

```bash
docker compose down --remove-orphans
```

To remove the service and its persisted local tickets too:

```bash
docker compose down --volumes --remove-orphans
```

If the app was run directly with `npm start`, stop it with `Ctrl+C` and remove
the generated `data/tickets.json` when the local store is no longer needed.
