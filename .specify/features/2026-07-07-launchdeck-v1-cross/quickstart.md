# Quickstart: Launchdeck v1 Lifecycle Smoke

This smoke verifies the intended v1 CLI behavior. It is a validation recipe for implementation tasks, not proof that the current prototype already passes every step.

## Prerequisites

- Node.js `>=20`
- Repository checkout at `F:/github/launchdeck`
- Dependencies installed with the package manager chosen by the implementation environment

## Local Verification

From `F:/github/launchdeck`:

```powershell
npm run check
npm test
```

These commands must pass before any `dev-ready` claim.

## Lifecycle Smoke Project

Create or use a disposable project directory with this config:

```yaml
version: 1
project:
  name: smoke-project
tasks:
  build:
    command: node -e "console.log('built')"
    risk: low
  fail:
    command: node -e "process.exit(7)"
    risk: low
  dev:
    command: node -e "setInterval(() => console.log('tick'), 1000)"
    longRunning: true
    risk: low
    ports: [4173]
clean:
  safe:
    - dist
  risky:
    - node_modules
```

## Expected Command Path

```powershell
launchdeck doctor --json
launchdeck tasks --json
launchdeck run build
launchdeck run fail
launchdeck start dev --json
launchdeck ps --json
launchdeck logs dev --json
launchdeck stop dev --json
launchdeck clean --json
launchdeck clean --safe --json
```

Expected outcomes:

- `doctor --json` emits valid JSON with `ok`, `command`, `status`, and `checks`.
- `tasks --json` lists `build`, `fail`, and `dev`; `dev` has type `managed`.
- `run build` exits `0`.
- `run fail` exits `7`.
- `start dev --json` creates a managed process record and log path.
- A duplicate `start dev --json` fails with `task_already_running`.
- `ps --json` reports `dev` as `running`, `stale`, `unknown`, or `stopped` after refresh, never by deleting the record silently.
- `logs dev --json` can read existing logs after the process exits.
- `stop dev --json` is idempotent.
- `clean --json` is a dry run and does not delete files.
- `clean --safe --json` removes only configured safe targets.
- `clean --all` without `--yes` fails with `confirmation_required`.

## Safety Smoke

Add unsafe clean targets one at a time in a disposable copy:

```yaml
clean:
  safe:
    - .
    - ..
```

Expected outcomes:

- Project root target fails with `clean_target_root`.
- Out-of-root target fails with `clean_target_outside_project`.
- No approved target is removed when the plan contains a refusal.

## Verification Claim Levels

- `dev-ready`: local checks and lifecycle smoke pass on one named OS.
- `platform-ready`: lifecycle smoke passes on the named target OS.
- `cross-platform-ready`: same lifecycle smoke passes on Windows, macOS, and Linux.
