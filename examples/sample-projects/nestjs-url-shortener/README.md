# NestJS URL Shortener

A small standalone NestJS service for creating, inspecting, and resolving short links. It uses a JSON file as local persistence so the sample can be copied and run without a database server.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Run it

```bash
npm ci
npm test
npm run build
npm start
```

The service listens on port `4013` by default. Override it with `PORT`:

```bash
PORT=4513 npm start
```

On PowerShell:

```powershell
$env:PORT = 4513
npm start
```

The local store is created at `data/urls.json` on first start and is seeded from `data/seed.json`. Set `URL_STORE_PATH` to use a different file, which is useful for isolated runs and tests.

## API

Check health:

```bash
curl http://localhost:4013/health
```

List seeded links:

```bash
curl http://localhost:4013/api/links
```

Create a link:

```bash
curl -X POST http://localhost:4013/api/links \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.org/articles/42","slug":"article-42"}'
```

Resolve a link with `GET /r/:slug`. The response is a `302` redirect and increments the persisted click count. `GET /api/links/:slug` returns the stored record without redirecting.

## Project layout

- `src/` contains the NestJS application and HTTP controllers.
- `data/seed.json` contains stable, repeatable seed records.
- `data/urls.json` is generated local persistence and is ignored by Git.
- `test/` contains the native HTTP tests.
