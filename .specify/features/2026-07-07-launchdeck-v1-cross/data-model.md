# Data Model: Launchdeck v1

## Entities

### LaunchdeckConfig

Represents the normalized contents of a v1 config file.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | integer | yes | Must be `1`; unsupported versions fail with `unsupported_config_version`. |
| `project` | Project | no | Defaults project name from project-root directory when absent. |
| `tasks` | map of Task | yes | Empty map is valid but `doctor` should warn. |
| `clean` | CleanConfig | no | Defaults to empty safe/risky lists. |

### Project

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | no | Display/JSON name; default is project root basename. |
| `projectRoot` | absolute path | derived | Directory containing the discovered config. |
| `configPath` | absolute path | derived | Path to `.launchdeck.yml`, `.launchdeck.yaml`, `launchdeck.yml`, or `launchdeck.yaml`. |

### Task

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | derived | Map key. |
| `command` | string | yes | User-authored shell command string. |
| `cwd` | project-relative path | no | Defaults to `.`; must resolve inside `projectRoot`. |
| `env` | object string map | no | Merged onto process environment by runtime adapter. |
| `description` | string | no | Human inventory/help text. |
| `risk` | enum | no | `low`, `medium`, `high`, `destructive`; default `medium`. |
| `longRunning` | boolean | no | Controls managed execution; default `false`. |
| `ports` | integer array | no | Each port is `1..65535`. |
| `log` | project-relative path | no | Must resolve inside `projectRoot`; default under `.launchdeck/logs/`. |
| `type` | enum | derived | `managed` when `longRunning: true`, otherwise `command`. |

### CleanConfig

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `safe` | CleanTarget array | no | Removable by `clean --safe`. |
| `risky` | CleanTarget array | no | Removable only by `clean --all --yes`. |

### CleanTarget

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `kind` | enum | derived | `safe` or `risky`. |
| `rawPath` | string | yes | As written in config. |
| `resolvedPath` | absolute path | derived | Resolved against `projectRoot`. |
| `canonicalPath` | absolute path | derived when existing | Real path used for containment proof. |
| `exists` | boolean | derived | Missing targets are skipped. |
| `status` | enum | derived | `planned`, `removed`, `skipped_missing`, `refused`. |
| `refusalCode` | string | derived | `clean_target_empty`, `clean_target_root`, `clean_target_outside_project`, or `clean_target_ambiguous`. |

### DoctorFinding

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `code` | string | yes | Stable snake_case finding code. |
| `severity` | enum | yes | `error`, `warn`, or `info`. |
| `status` | enum | yes | `pass`, `warn`, `fail`, or `info`. |
| `message` | string | yes | Human-readable diagnosis. |
| `details` | object | no | Structured context for JSON output. |

### RuntimeState

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | integer | yes | Runtime state schema version; v1 uses `1`. |
| `projectRoot` | absolute path | yes | Root this state belongs to. |
| `processes` | map of ManagedProcessRecord | yes | Keyed by task name. |
| `updatedAt` | ISO timestamp | yes | Last state write. |

### ManagedProcessRecord

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `task` | string | yes | Task name. |
| `command` | string | yes | Command used to start process. |
| `cwd` | absolute path | yes | Working directory used by the process. |
| `pid` | integer | platform-dependent | Stored when available. |
| `handle` | object | platform-dependent | Future adapter-specific process handle when PID is insufficient. |
| `ports` | integer array | no | From task metadata. |
| `logPath` | absolute path | yes | Log file for stdout/stderr. |
| `startedAt` | ISO timestamp | yes | Start time. |
| `stoppedAt` | ISO timestamp | no | Stop/exit time when known. |
| `lastRefresh` | ISO timestamp | yes | Last liveness refresh. |
| `status` | enum | yes | `running`, `stopped`, `stale`, `unknown`, or `stop_failed`. |
| `exitCode` | integer | no | Known child exit code when foreground/managed status captures it. |
| `signal` | string | no | Known termination signal. |
| `lastError` | object | no | Classified runtime/adapter error. |

### CommandEnvelope

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | boolean | yes | Top-level command success. |
| `command` | string | yes | Launchdeck command name. |
| `status` | string | yes | Command-specific state such as `ok`, `warn`, `error`, `partial`, `running`, `dry_run`. |
| `projectRoot` | absolute path | when config applies | Omitted only for commands that cannot resolve config. |
| `configPath` | absolute path | when config applies | Omitted only for commands that cannot resolve config. |
| `error` | ErrorPayload | on failure | Required when `ok: false`. |

### ErrorPayload

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `code` | string | yes | Stable snake_case v1 code. |
| `message` | string | yes | Human-readable message. |
| `details` | object | no | Structured context. |

## State Transitions

### Config

```text
no_config -> configured
configured -> invalid
configured -> unsupported_version
invalid -> configured
```

`init` may only perform `no_config -> configured` in the target cwd, or explicit target overwrite when forced. It must not overwrite ancestor config.

### Managed Process

```text
not_started -> running
running -> stopped
running -> stale
running -> unknown
running -> stop_failed
stale -> stopped
unknown -> stopped
stop_failed -> running
stop_failed -> stopped
```

`ps` refreshes status. `logs` reads logs independent of process status. `stop` is idempotent and preserves the record.

### Clean

```text
declared -> planned
planned -> skipped_missing
planned -> refused
planned -> removed
```

The full plan must be created before deletion starts. Refused targets block unsafe deletion.

### Verification Claim

```text
unverified -> dev_ready -> platform_ready -> cross_platform_ready
```

`cross_platform_ready` requires the same lifecycle smoke on Windows, macOS, and Linux.
