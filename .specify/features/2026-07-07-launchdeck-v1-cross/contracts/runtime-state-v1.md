# Contract: Runtime State Version 1

## Storage Locations

Runtime files live under the project root:

```text
.launchdeck/
├── runtime/
│   └── state.json
└── logs/
    └── <task>.log
```

Inspection commands must not silently erase `.launchdeck/runtime` or `.launchdeck/logs`.

## State File Shape

```json
{
  "version": 1,
  "projectRoot": "F:/github/launchdeck",
  "updatedAt": "2026-07-07T00:00:00.000Z",
  "processes": {
    "dev": {
      "task": "dev",
      "command": "npm run dev",
      "cwd": "F:/github/launchdeck",
      "pid": 12345,
      "ports": [5173],
      "logPath": "F:/github/launchdeck/.launchdeck/logs/dev.log",
      "startedAt": "2026-07-07T00:00:00.000Z",
      "lastRefresh": "2026-07-07T00:01:00.000Z",
      "status": "running"
    }
  }
}
```

## Process Status Values

| Status | Meaning |
| --- | --- |
| `running` | Launchdeck believes the process is alive after refresh. |
| `stopped` | Process is confirmed stopped or stop was idempotently accepted for a non-running process. |
| `stale` | A previous process record no longer appears alive. |
| `unknown` | Liveness cannot be determined reliably on this platform or due to adapter error. |
| `stop_failed` | A stop attempt failed or liveness remained running after stop. |

## Command Behavior

### `start`

- Requires target task to have `longRunning: true`.
- Refuses duplicate running task with `task_already_running`.
- Creates log directory and log file path.
- Writes process record after successful spawn.

### `ps`

- Reads state.
- Refreshes liveness.
- Writes updated statuses and `lastRefresh`.
- Does not delete stale records.

### `logs`

- Reads log content by task or default selection.
- Works after process exit when log exists.
- Returns `log_not_found` when log path is missing.
- Does not delete records or logs.

### `stop`

- Refreshes state before attempting stop.
- Without a task, stops all currently running managed records.
- Is idempotent for stopped/stale records.
- Records `stoppedAt` when stop is attempted or confirmed.
- Reports `stop_failed` or `partial_failure` when one or more processes cannot be stopped.

### `restart`

- Stops the selected managed task first.
- Starts the task only when stop succeeds or the task was already non-running.
- Reports partial failure when stop succeeds but start fails, or when stop failure prevents start.

## Invalid State Handling

Invalid or unreadable state JSON must produce `runtime_state_invalid` instead of silently starting from an empty state. A recovery command may be added in a later version, but v1 inspection must not erase evidence automatically.
