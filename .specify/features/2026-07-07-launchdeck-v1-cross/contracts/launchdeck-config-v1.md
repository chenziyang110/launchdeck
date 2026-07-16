# Contract: `.launchdeck.yml` Version 1

## Discovery

Normal commands search upward from the target cwd for the first file with one of these names:

- `.launchdeck.yml`
- `.launchdeck.yaml`
- `launchdeck.yml`
- `launchdeck.yaml`

The directory containing the discovered config is `projectRoot`. Task cwd, task logs, runtime state, and clean targets resolve relative to `projectRoot`.

`init` is different: it writes `.launchdeck.yml` in the target cwd and must not silently overwrite an existing target config or an ancestor config.

## Schema

```yaml
version: 1
project:
  name: example-project
tasks:
  build:
    command: npm run build
    description: Build production assets
    risk: medium
  dev:
    command: npm run dev
    cwd: .
    description: Start the development server
    risk: low
    longRunning: true
    ports: [5173]
    log: .launchdeck/logs/dev.log
clean:
  safe:
    - dist
    - .cache
  risky:
    - node_modules
```

## Fields

### Root

| Field | Type | Required | Behavior |
| --- | --- | --- | --- |
| `version` | integer | yes | Must be `1`. Other versions fail with `unsupported_config_version`. |
| `project` | object | no | Currently supports `name`. |
| `tasks` | object map | yes | Keys are task names. |
| `clean` | object | no | Supports `safe` and `risky` target arrays. |

### Task

| Field | Type | Required | Behavior |
| --- | --- | --- | --- |
| `command` | string | yes | Shell command string executed by runtime adapter. |
| `cwd` | string | no | Defaults to `.`; must remain inside `projectRoot`. |
| `env` | object string map | no | Extra environment variables. |
| `description` | string | no | Human-readable task description. |
| `risk` | string | no | One of `low`, `medium`, `high`, `destructive`; default `medium`. |
| `longRunning` | boolean | no | `true` means managed process. |
| `ports` | integer array | no | Values must be 1 through 65535. |
| `log` | string | no | Project-relative log path; must remain inside `projectRoot`. |

### Clean

| Field | Type | Required | Behavior |
| --- | --- | --- | --- |
| `safe` | string array | no | Targets removable by `clean --safe`. |
| `risky` | string array | no | Targets removable only by `clean --all --yes`. |

## Validation Rules

- Config must be YAML object data.
- `version` must exist and equal `1`.
- Task names must be non-empty strings.
- Task `command` must be a non-empty string.
- Task `cwd` and `log` resolve relative to `projectRoot` and must not escape it.
- `risk` must be `low`, `medium`, `high`, or `destructive`.
- `ports` must be integers from 1 to 65535.
- Clean targets must be non-empty project-relative paths and must not resolve to project root or outside project root.

## Backward Compatibility

Version 1 should remain small and additive. New v1 fields may be added only when unknown-field behavior is intentionally documented. A future incompatible schema must use a different `version` and fail old CLIs with `unsupported_config_version`.
