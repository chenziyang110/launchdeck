# CLI Contract: Launchdeck Global CLI Control Plane

## Contract Rules

- Commands are non-interactive by default. When a command cannot proceed safely, it returns a structured refusal and `next` actions.
- `--json` returns a single JSON object for normal commands.
- Streaming commands use JSON Lines when `--json` is combined with `--follow` or event streaming.
- Stop, restart, and force-stop never target external or unknown processes.
- Existing command names stay available unless a later migration explicitly removes them.

## JSON Envelope

Success:

```json
{
  "ok": true,
  "schemaVersion": 1,
  "command": "status",
  "data": {},
  "next": []
}
```

Error:

```json
{
  "ok": false,
  "schemaVersion": 1,
  "command": "start",
  "code": "port_conflict",
  "message": "Declared port is already occupied.",
  "details": {},
  "next": [
    {
      "label": "Inspect port",
      "command": "launchdeck inspect port:8888",
      "reason": "Shows the listener and Launchdeck declarations for this port.",
      "risk": "safe"
    }
  ]
}
```

Compatibility:

- Legacy top-level payload fields may be mirrored while tests and docs migrate.
- New structured payloads live in `data`.
- `schemaVersion` is required for every JSON object and JSONL event.

## Project Commands

### `launchdeck project add [path] [--alias alias] [--name name] [--json]`

Registers or updates a project in the user-scoped registry.

Success data:

- `project`: ProjectRegistration.
- `created`: boolean.
- `updated`: boolean.

Errors:

- `config_not_found`
- `config_invalid`
- `alias_conflict`
- `registry_lock_busy`
- `state_version_unsupported`

### `launchdeck project scan <dir> [--json]`

Performs a bounded scan for Launchdeck projects and registers them.

Success data:

- `scannedRoot`
- `added`
- `updated`
- `skipped`
- `errors`

Rules:

- Generated, dependency, and hidden runtime directories are skipped.
- The command never crawls the entire machine implicitly.

### `launchdeck project remove <target> [--json]`

Removes a registry entry only.

Success data:

- `removed`: ProjectRegistration.

Refusal:

- If any run for the project is `starting`, `running`, `ready`, or `stopping`, return `project_has_active_runs`.
- Include next actions to inspect and stop the owned tasks.
- Project files, local runtime files, and logs are never deleted.

### `launchdeck project repair <target> [--path path] [--config path] [--alias alias] [--json]`

Repairs registry metadata without changing project identity.

Success data:

- `before`
- `after`
- `changes`

Errors:

- `project_not_found`
- `alias_conflict`
- `config_invalid`
- `registry_lock_busy`

### `launchdeck projects [--json]`

Lists registered projects.

Success data:

- `projects`: array of ProjectRegistration with status.
- `errors`: registry/config read errors.

## Lifecycle Commands

### `launchdeck start [task|project:task] [--json]`

Starts a managed long-running task.

Success data:

- `project`
- `task`
- `run`
- `readiness`
- `ports`

Refusals:

- `task_not_found`
- `task_not_managed`
- `duplicate_run`
- `start_in_progress`
- `port_conflict`
- `project_lock_busy`
- `task_lock_busy`
- `state_version_unsupported`

Required next actions:

- Duplicate or in-progress run: `status`, `inspect run:<runId>`, `logs`.
- Port conflict: `inspect port:<port>`, `ports`, `conflicts`.

### `launchdeck stop [task|project:task] [--force-owned] [--json]`

Stops Launchdeck-owned managed tasks.

Success data:

- `stopped`: array of run summaries.
- `failed`: array of stop failures.

Refusals:

- `ownership_not_verified`
- `external_process`
- `unknown_process_owner`
- `task_lock_busy`
- `run_not_found`

Rules:

- `--force-owned` may escalate stop method only after ownership is verified.
- If no task is supplied from a project directory, stop all verified-owned running tasks for that project.
- If global target is supplied, target resolution must be unambiguous.

### `launchdeck force-stop [task|project:task] [--json]`

Explicit force command for verified-owned process trees.

Rules:

- Equivalent safety gate to `stop --force-owned`.
- Exists to make force semantics visible and auditable.

### `launchdeck restart [task|project:task] [--json]`

Performs ownership-proven stop, waits for declared port release, and starts a new run.

Success data:

- `stoppedRun`
- `startedRun`
- `transactionId`

Refusals:

- All stop refusals.
- All start refusals.
- `port_release_timeout`

## Global View Commands

### `launchdeck status [--all] [--watch] [--json]`

Summarizes projects, runs, ports, conflicts, and errors.

Success data:

- `summary`
- `projects`
- `runs`
- `ports`
- `conflicts`
- `errors`

Rules:

- Without `--all`, status may default to current project when inside a registered project.
- `--watch` refreshes read-only status; it does not mutate state.

### `launchdeck ps [--all] [--json]`

Lists managed runs.

Success data:

- `runs`: array of managed run summaries.
- `errors`: read/reconcile warnings.

### `launchdeck ports [--json]`

Lists declared managed ports across registered projects.

Success data:

- `ports`: array of PortObservation.
- `conflicts`: array of Conflict.
- `errors`: read/adapter errors.

### `launchdeck conflicts [--json]`

Lists blocking and warning conflicts.

Success data:

- `conflicts`: array of Conflict.
- `errors`: read/adapter errors.

## Inspect Commands

### `launchdeck inspect <target> [--json]`

Accepted target forms:

- `project:<alias|id|path>`
- `task:<project:task>`
- `run:<runId>`
- `port:<port>`
- `pid:<pid>`
- `conflict:<id>`

Success data:

- `target`
- `classification`
- `project`
- `task`
- `run`
- `ports`
- `listeners`
- `ownership`
- `conflicts`
- `events`
- `logs`
- `safeActions`
- `blockedActions`

Rules:

- Inspect is read-only by default.
- Inspect may recommend `reconcile`, but it does not repair state unless a future explicit flag is added.

### `launchdeck inspect-port <port> [--json]`

Compatibility wrapper for:

```text
launchdeck inspect port:<port>
```

The response may include the same data under legacy top-level names during transition.

## Observability Commands

### `launchdeck logs [task|project:task|run:<runId>] [--follow] [--json]`

Reads managed task logs.

Rules:

- `--follow` streams until interrupted.
- With `--json --follow`, emit JSON Lines with `schemaVersion`, `type`, `runId`, `line`, and `timestamp`.
- Follow must be a visible CLI process, not a hidden watcher.

### `launchdeck events [target] [--follow] [--json]`

Reads structured event history.

Rules:

- Without `--follow`, returns a bounded newest-first or chronological list as documented by implementation.
- With `--json --follow`, emits JSON Lines.
- Event payloads are redacted.

## Recovery Commands

### `launchdeck reconcile [target] [--json]`

Refreshes stale Launchdeck state against OS observations.

Success data:

- `updatedRuns`
- `staleRuns`
- `unresolved`
- `events`

Rules:

- Reconcile does not kill external or unknown processes.
- Reconcile can mark dead runs as stale/stopped.

## Clean Commands

### `launchdeck clean [--safe] [--json]`

Runs configured safe clean targets.

Rules:

- Path containment uses the existing path adapter.
- Unknown targets and project roots are refused.
- Running tasks may block clean if the configured target overlaps runtime/log paths in a risky way.

## Error Codes

Required additions or preserved codes:

- `alias_conflict`
- `config_invalid`
- `config_not_found`
- `duplicate_run`
- `external_process`
- `lock_busy`
- `ownership_not_verified`
- `port_conflict`
- `port_release_timeout`
- `project_has_active_runs`
- `project_not_found`
- `registry_lock_busy`
- `run_not_found`
- `start_in_progress`
- `state_version_unsupported`
- `task_lock_busy`
- `unknown_process_owner`

## JSONL Event Contract

Each line:

```json
{
  "schemaVersion": 1,
  "eventId": "evt_...",
  "transactionId": "tx_...",
  "timestamp": "2026-07-08T00:00:00.000Z",
  "level": "info",
  "type": "run.started",
  "projectId": "proj_...",
  "alias": "demo",
  "task": "dev",
  "runId": "run_...",
  "message": "Task started.",
  "data": {},
  "next": []
}
```

Consumers must ignore unknown fields and fail gracefully on malformed lines.
