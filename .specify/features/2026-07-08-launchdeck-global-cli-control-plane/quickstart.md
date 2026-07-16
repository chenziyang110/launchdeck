# Quickstart: Launchdeck Global CLI Control Plane

This quickstart describes the expected user journey after the feature is implemented. It is also the release smoke path for the CLI-only product loop.

## Prerequisites

- Node.js `>=20`
- Dependencies installed with `npm install`
- Commands run from `F:/github/launchdeck`
- Use an isolated `LAUNCHDECK_HOME` for smoke tests:

```powershell
$env:LAUNCHDECK_HOME = "$PWD\\.tmp\\quickstart-launchdeck-home"
```

## 1. Verify The Build

```powershell
npm run check
npm test
```

Expected:

- Syntax checks pass.
- Unit and integration tests pass.
- If a Windows managed-process cleanup test fails with a transient temp EPERM, rerun the focused test once before treating it as a product regression.

## 2. Register The Demo Project

The implementation should include an official demo project, for example `examples/demo-api`, with a checked-in server script. The demo must not rely on inline `node -e "setInterval"` commands.

```powershell
node src/cli.js project add examples/demo-api --alias demo --json
node src/cli.js projects --json
```

Expected:

- `project add` returns `ok: true`.
- The project has a stable `projectId`.
- The alias `demo` is unique and visible in `projects`.

## 3. Start A Managed Service

```powershell
node src/cli.js start demo:dev --json
```

Expected:

- A managed run is created.
- The response includes `runId`, `transactionId`, `pid`, declared ports, readiness status, and next actions.
- The run eventually reaches `ready` when the demo health/port check succeeds.

## 4. Prevent Duplicate Starts

Run the same command again:

```powershell
node src/cli.js start demo:dev --json
```

Expected:

- The command does not start a second instance.
- The response returns the existing managed run without spawning another process.
- The response includes next actions such as `status`, `inspect run:<runId>`, and `logs demo:dev`.

## 5. Inspect Global State

```powershell
node src/cli.js status --all --json
node src/cli.js ps --all --json
node src/cli.js ports --json
node src/cli.js conflicts --json
node src/cli.js inspect task:demo:dev --json
node src/cli.js inspect port:8888 --json
```

Expected:

- `status --all` shows all registered projects and running managed tasks.
- `ps --all` shows the demo run.
- `ports` shows the declared demo port and listener evidence.
- `conflicts` is empty for the healthy demo case.
- `inspect` shows ownership confidence as `verified-owned` for the Launchdeck-managed task.

## 6. View Logs And Events

```powershell
node src/cli.js logs demo:dev --json
node src/cli.js events demo --json
```

Expected:

- Logs are readable without changing process state.
- Events include start transaction records and redacted metadata.

Optional streaming check:

```powershell
node src/cli.js logs demo:dev --follow --json
```

Expected:

- The command visibly streams JSON Lines until interrupted.
- It does not create a hidden watcher.

## 7. Restart Precisely

```powershell
node src/cli.js restart demo:dev --json
```

Expected:

- Launchdeck proves ownership before stopping the old run.
- The old run transitions to `stopped`.
- A new run is started with a new `runId`.
- The declared port is released before the new run claims it.

## 8. Stop Precisely

```powershell
node src/cli.js stop demo:dev --json
node src/cli.js status --all --json
```

Expected:

- The demo task is stopped.
- The run is no longer `running` or `ready`.
- The port is free or no longer claimed by the demo run.

## 9. Refuse Unsafe Project Removal

Start the demo again:

```powershell
node src/cli.js start demo:dev --json
node src/cli.js project remove demo --json
```

Expected:

- `project remove` refuses with `project_has_active_runs`.
- The response includes next actions to inspect and stop the active task.
- Project files and local `.launchdeck/` data are not deleted.

Stop and remove:

```powershell
node src/cli.js stop demo:dev --json
node src/cli.js project remove demo --json
```

Expected:

- The registry entry is removed after the run is stopped.
- The demo project files remain on disk.

## 10. Reconcile Stale State

Simulate a stale state using a controlled fixture path from tests or by terminating the demo process outside Launchdeck during manual smoke.

```powershell
node src/cli.js reconcile demo --json
node src/cli.js inspect task:demo:dev --json
```

Expected:

- Reconcile marks dead Launchdeck-owned runs as stale or stopped.
- Reconcile does not kill external or unknown processes.
- Inspect explains the state and next actions.

## 11. Clean Safely

```powershell
node src/cli.js clean --safe --json
```

Expected:

- Only configured safe clean targets inside the project are removed.
- Unknown paths, project roots, and paths outside the project are refused.

## Release Smoke Checklist

- Build and tests pass.
- Demo project can be registered with alias.
- Start creates one managed service.
- Duplicate start returns the existing run without spawning another service.
- Status, ps, ports, conflicts, inspect, logs, and events all report coherent state.
- Restart stops the owned run and starts a new one.
- Stop terminates only the verified Launchdeck-owned process tree.
- Project remove refuses active owned runs.
- Reconcile repairs stale state without killing unknown processes.
- Clean safe refuses unsafe paths.
- Windows and POSIX smoke results are recorded before release claims.
