# Daymark — Habit tracker

Daymark is a small standalone habit tracker built with React and Vite. It keeps a short daily list, calculates consecutive streaks, and saves changes in the browser's local storage.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Run it

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The production-shaped local server is also available with:

```sh
npm run start -- --port 4173
```

The port can be changed by passing another `--port` value or setting `PORT`. The app is served on all local interfaces so it can be checked from an isolated browser or container.

## Verify it

```sh
npm test
npm run build
npm run health -- --port 4173
```

The health command checks `GET /health.json`, which is served by Vite's static public directory and returns a small JSON payload with `status: "ok"`.

## Data behavior

The first visit starts with three deterministic habits. Completion dates and newly added habits are persisted under the `daymark.habits.v1` local-storage key. Clearing that key resets the app to the seed state.

## Project layout

- `src/data/seed.js` — deterministic starter state
- `src/lib/habits.js` — immutable habit operations and streak calculations
- `src/lib/storage.js` — local-storage load/save boundary
- `public/health.json` — static health surface
- `test/` — native Vitest tests for state and persistence
