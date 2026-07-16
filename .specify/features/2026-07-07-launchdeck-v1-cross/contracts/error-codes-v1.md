# Contract: Error Codes Version 1

## Rules

- Error codes are stable snake_case strings.
- Public command failures should use a classified code from this file.
- `internal_error` is allowed only for genuinely unexpected failures and should trigger follow-up classification.
- Adding a new public code requires updating this contract and related JSON tests.

## Config And Discovery

| Code | Meaning |
| --- | --- |
| `config_not_found` | No config file found by normal upward search. |
| `config_exists` | `init` target config already exists or ancestor config blocks silent overwrite. |
| `config_invalid` | Config is not a valid v1 object or field validation failed. |
| `unsupported_config_version` | Config version is not supported by this CLI. |
| `project_root_escape` | Task cwd, log path, or clean target escapes project root. |

## Task And Command

| Code | Meaning |
| --- | --- |
| `task_not_found` | Requested task does not exist. |
| `task_not_managed` | Command requires `longRunning: true` but task is not managed. |
| `task_already_running` | Managed task is already running. |
| `task_command_failed` | Foreground task exited with non-zero code when represented as Launchdeck failure. |
| `command_usage_error` | CLI arguments or flag combination is invalid. |

## Runtime

| Code | Meaning |
| --- | --- |
| `runtime_state_invalid` | Runtime state file cannot be parsed or validated. |
| `process_not_found` | Requested managed process record does not exist. |
| `process_not_running` | Process is not currently running when running state is required. |
| `stop_failed` | Stop attempt failed or process remained alive. |
| `log_not_found` | Requested log file does not exist. |
| `partial_failure` | Multi-step or multi-item command partially failed. |

## Clean

| Code | Meaning |
| --- | --- |
| `confirmation_required` | Risky clean requested without explicit confirmation. |
| `clean_target_empty` | Configured clean target is empty or invalid. |
| `clean_target_root` | Clean target resolves to project root. |
| `clean_target_outside_project` | Clean target resolves outside project root. |
| `clean_target_ambiguous` | Clean target cannot be proven safe. |
| `clean_failed` | Filesystem removal failed for an otherwise approved target. |

## Platform And Internal

| Code | Meaning |
| --- | --- |
| `platform_unsupported` | Required lifecycle behavior is unsupported on the current OS. |
| `adapter_failed` | Platform adapter failed with a classified operational error. |
| `internal_error` | Unexpected unclassified failure. |
