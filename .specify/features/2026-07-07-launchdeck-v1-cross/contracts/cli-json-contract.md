# Contract: CLI JSON Envelope

## Applicability

Commands that support `--json` emit exactly one JSON object to stdout on both success and classified failure. Human-readable output may change, but JSON fields are compatibility surfaces.

## Common Success Envelope

```json
{
  "ok": true,
  "command": "tasks",
  "status": "ok",
  "projectRoot": "F:/github/launchdeck",
  "configPath": "F:/github/launchdeck/.launchdeck.yml"
}
```

## Common Failure Envelope

```json
{
  "ok": false,
  "command": "run",
  "status": "error",
  "projectRoot": "F:/github/launchdeck",
  "configPath": "F:/github/launchdeck/.launchdeck.yml",
  "error": {
    "code": "task_not_found",
    "message": "Task not found.",
    "details": {
      "task": "serve"
    }
  }
}
```

## Partial Failure Envelope

```json
{
  "ok": false,
  "command": "stop",
  "status": "partial",
  "projectRoot": "F:/github/launchdeck",
  "configPath": "F:/github/launchdeck/.launchdeck.yml",
  "results": [
    {
      "task": "dev",
      "ok": true,
      "status": "stopped"
    },
    {
      "task": "api",
      "ok": false,
      "status": "stop_failed",
      "error": {
        "code": "stop_failed",
        "message": "Failed to stop managed task."
      }
    }
  ],
  "error": {
    "code": "partial_failure",
    "message": "One or more operations failed."
  }
}
```

## Command Payloads

| Command | Required command-specific fields |
| --- | --- |
| `init --json` | `created`, `path`, `status` |
| `doctor --json` | `checks`, `summary`, `status` |
| `tasks --json` | `project`, `tasks` |
| `run <task> --json` | `task`, `code` or `process` depending on foreground/managed result |
| `start [task] --json` | `task`, `process` |
| `restart [task] --json` | `task`, `process` or `results` when partial |
| `ps --json` | `processes` |
| `logs [task] --json` | `task`, `logPath`, `content` or missing-log error |
| `stop [task] --json` | `process` or `results` |
| `clean --json` | `targets`, `removed`, `dryRun`, `mode` |

## Exit Code Rules

- Successful Launchdeck-level commands exit `0`.
- Launchdeck-level classified failures exit non-zero, using `1` by default.
- Foreground task execution preserves the child process exit code.
- Partial failures exit non-zero and use `status: "partial"` plus `error.code: "partial_failure"`.

## Stability Rules

- `ok`, `command`, `status`, and `error.code` are stable public fields.
- `projectRoot` and `configPath` appear whenever config resolution was possible.
- New fields may be added, but existing field meanings must not change in v1.
