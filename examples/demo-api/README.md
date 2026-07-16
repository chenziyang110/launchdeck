# Launchdeck Demo API

This is the official Launchdeck control-plane demo. It is dependency-free, uses a checked-in fixture server, and can be run from the repository root or from this directory.

Use an isolated home when trying the global registry so local user state is not changed:

```powershell
$env:LAUNCHDECK_HOME = "$PWD\\.tmp\\demo-api-launchdeck-home"
```

## From The Repository Root

Register the demo:

```powershell
node src/cli.js project add examples/demo-api --alias demo --json
node src/cli.js projects --json
```

Start the managed API:

```powershell
node src/cli.js start demo:dev --json
```

Run the same start again to demonstrate existing-run behavior. Launchdeck returns the current run instead of spawning a duplicate:

```powershell
node src/cli.js start demo:dev --json
```

Inspect the global state:

```powershell
node src/cli.js status --all --json
node src/cli.js ps --all --json
node src/cli.js ports --json
node src/cli.js conflicts --json
node src/cli.js inspect task:demo:dev --json
node src/cli.js inspect port:8888 --json
```

Read logs and events:

```powershell
node src/cli.js logs demo:dev --json
node src/cli.js events demo --json
```

Restart and stop only the Launchdeck-owned process:

```powershell
node src/cli.js restart demo:dev --json
node src/cli.js stop demo:dev --json
```

Demonstrate stale recovery by starting the demo, asking the checked-in fixture to exit outside the Launchdeck stop path, then reconciling:

```powershell
node src/cli.js start demo:dev --json
curl http://127.0.0.1:8888/_demo/exit
node src/cli.js reconcile demo --json
node src/cli.js inspect task:demo:dev --json
```

Clean safely from the demo directory. The server creates `scratch/clean-safe`, while run evidence and logs remain available for inspection:

```powershell
cd examples/demo-api
node ../../src/cli.js clean --json
node ../../src/cli.js clean --safe --json
```

## From This Directory

Syntax-check and run the fixture directly:

```powershell
npm run check
npm run start
```

The server listens on `127.0.0.1:8888` by default. It also accepts `PORT` or `--port`:

```powershell
$env:PORT = "8890"
node scripts/server.js
node scripts/server.js --port 8891
```

Health and event endpoints:

```powershell
curl http://127.0.0.1:8888/health
curl http://127.0.0.1:8888/events
curl http://127.0.0.1:8888/_demo/exit
```

The server logs startup, requests, heartbeats, Launchdeck run markers, and graceful SIGTERM shutdown. It writes run evidence under `scratch/run-evidence` and safe cleanup targets under `scratch/clean-safe`.
