# Flask Notes API

A small local JSON API for experimenting with a conventional Python development workflow.

## Setup

PowerShell:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
```

## Run

```powershell
flask-demo
```

The server listens on `http://127.0.0.1:5055` by default. Override the bind address with `HOST` or `PORT` when needed.

Open `http://127.0.0.1:5055` in a browser to use the Notes workspace.

Useful endpoints:

- `GET /` — browser interface
- `GET /health` — health check
- `GET /api/notes` — list the in-memory notes
- `POST /api/notes` — create a note from `{"text":"..."}`
- `DELETE /api/notes/<id>` — delete a note

Example:

```powershell
curl.exe http://127.0.0.1:5055/health
curl.exe -X POST http://127.0.0.1:5055/api/notes -H "Content-Type: application/json" -d '{"text":"try the API"}'
```

## Test

```powershell
python -m pytest
```

The data store is intentionally in memory, so restarting the process resets the notes.
