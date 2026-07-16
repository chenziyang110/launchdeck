# Handoff To Specify: Launchdeck Tool

- status: handoff_ready
- quality_gate_status: user_confirmed
- user_review_required: false
- user_confirmed_at: 2026-07-07T10:51:43.9189243+08:00
- discussion_slug: launchdeck-tool
- created_at: 2026-07-06T19:00:15.2357122+08:00
- source_workflow: sp-discussion
- entry_source: sp-discussion
- handoff_status: handoff-ready
- planning_gate_status: ready
- hard_unknown_count: 0
- open_conflict_count: 0
- handoff_kind: discussion_requirement_contract
- recommended_consumer_after_user_confirmation: sp-specify

## Handoff Reviewer Guide

This handoff has been reviewed and confirmed by the user. Use it as input to downstream specification.

- Confirm the target project is `F:/github/launchdeck`.
- Confirm v1 is CLI-first, local, single-project, explicit-config lifecycle control.
- Confirm deferred surfaces stay deferred: GUI/TUI, MCP, agent skill package, automatic discovery by default, monorepo orchestration, remote/cloud execution, plugins, marketplace, and destructive reset.
- Confirm the Must-Preserve Ledger and Consequence Obligations are carried into the spec.
- If any listed hard requirement is wrong, return to discussion rather than silently editing the downstream spec around it.

## Handoff Goal

Specify Launchdeck v1 as a cross-platform CLI tool that can initialize, inspect, run, manage, log, stop, and safely clean local software projects through an explicit `.launchdeck.yml` lifecycle protocol.

## Agent Requirement Contract

### Target Need

Developers need one project-local control surface for common software lifecycle operations across arbitrary stacks: setup, build/package, test/lint/typecheck, dev/start, process inspection, logs, stop/restart, and safe cleanup.

Launchdeck should make these operations predictable and recoverable without requiring callers to rediscover package managers, shell commands, PIDs, ports, log files, or cache paths every time.

### Core Constraints

- Cross-platform support for Windows, macOS, and Linux is a first-class product requirement.
- v1 is CLI-first and local-project scoped.
- v1 is single-project, not workspace graph orchestration.
- v1 is explicit-config first through `.launchdeck.yml`.
- v1 must keep command execution, long-running process state, logs, stop behavior, and cleanup inspectable.
- Cleanup must be conservative, project-local, and dry-run by default.
- JSON output and error codes are compatibility surfaces.
- Agent/MCP/skill integrations are consumers of the CLI/protocol, not the v1 core product.

### Success Criteria

- A project can run `launchdeck init` to create an editable config without executing project commands.
- A project can run `launchdeck doctor` to get read-only readiness and safety findings.
- A project can run `launchdeck tasks` to inspect configured lifecycle capabilities without validation or execution.
- A project can run foreground tasks and preserve their child exit codes.
- A project can start managed long-running tasks and inspect/stop/restart them through Launchdeck.
- Logs remain readable after managed process exit when log files exist.
- Cleanup previews by default and only deletes configured project-local targets under explicit safe/all confirmation modes.
- `--json` output has a stable envelope, stable error object, and stable snake_case error codes.
- Release claims distinguish `dev-ready`, `platform-smoke-ready`, and `cross-platform-ready`.

## Scope

### In Scope For v1

- Config discovery from `.launchdeck.yml`, `.launchdeck.yaml`, `launchdeck.yml`, or `launchdeck.yaml`.
- Config version `1`.
- Project metadata through `project.name`.
- Task declarations with `command`, `cwd`, `env`, `description`, `risk`, `longRunning`, `ports`, and `log`.
- Clean declarations with `clean.safe` and `clean.risky`.
- Commands: `init`, `doctor`, `tasks`, `run <task>`, `setup`, `build`, `package`, `test`, `lint`, `typecheck`, `dev`, `start [task]`, `restart [task]`, `ps`, `logs [task]`, `stop [task]`, `clean`, `clean --safe`, and `clean --all --yes`.
- Runtime state under `.launchdeck/runtime/state.json`.
- Logs under `.launchdeck/logs/`.
- Platform-sensitive behavior behind runtime adapters.
- Smoke verification for lifecycle behavior.

### Out Of Scope For v1

- GUI/TUI.
- MCP server.
- Agent skill package.
- Automatic project discovery as default behavior.
- Template marketplace.
- Workspace graph orchestration.
- Multi-project fan-out commands.
- Dependency-aware task ordering.
- Daemon/service mode.
- Remote execution or cloud environments.
- CI/CD replacement.
- Database reset.
- Docker volume/container reset built-in behavior.
- Destructive `reset`.
- Package manager abstraction.
- Plugin system.
- Shell completion generation.
- Native installer packaging as a product requirement.
- Multi-instance managed tasks.
- Config schema migration engine.

### Reserved Or Deferred

- `init --scan`.
- `init --template <name>`.
- `doctor --suggest`.
- Task `platforms` overrides.
- Richer shell configuration.
- Runtime state pruning.
- Standalone binaries.
- Homebrew, Scoop, and winget packaging.
- MCP server.
- Agent skill integration.
- UI/TUI dashboard.
- Monorepo orchestration.

## Context Boundary

- current_project_root: `F:/github/launchdeck`
- target_project_root: `F:/github/launchdeck`
- target_project_role: implementation target
- target_project_scope: Launchdeck CLI, protocol docs, examples, schema, and local lifecycle runtime.
- path_status: target-read-confirmed
- boundary_confidence: high
- external_systems_in_scope: none

The current repository is the product implementation target unless the user later overrides that boundary.

## CLI Product Contract

### First-Run Flow

```text
launchdeck init
launchdeck doctor
launchdeck tasks
launchdeck run build
launchdeck dev
launchdeck ps
launchdeck logs dev
launchdeck stop dev
launchdeck clean
launchdeck clean --safe
```

### Init

- Creates editable `.launchdeck.yml` in target cwd.
- Fails with `config_exists` if config already exists in the target directory unless `--force`.
- Must not install dependencies, run project commands, start processes, or clean files.
- Does not overwrite ancestor configs discovered upward.
- `init --json` exposes `ok`, `configPath`, `created`, and `overwritten`.

### Project Root And `--cwd`

- Default target cwd is process cwd.
- Future/global `--cwd <path>` selects target cwd.
- Normal commands search upward from target cwd for nearest config.
- The config directory is the project root.
- Task `cwd` resolves relative to project root.
- Runtime state and logs live under project root.
- `init` writes to target cwd and does not overwrite ancestor configs.
- v1 monorepo behavior is nearest config plus task `cwd`, not orchestration.

### Doctor

- Read-only command answering whether Launchdeck can safely understand and operate the project.
- Must not install, start, stop, delete, modify config, or mutate runtime state.
- Findings use `error`, `warn`, and `info`.
- Overall status uses `ok`, `warn`, and `error`.
- `doctor --json` exposes stable `severity`, `status`, and `code`.

### Tasks

- Read-only inventory command answering what Launchdeck can do in the project.
- Does not execute or validate commands.
- Default human columns: `TASK`, `TYPE`, `RISK`, `PORTS`, `COMMAND`.
- Type is `command` or `managed`.
- Ordering: `setup`, `build`, `package`, `dev`, `start`, `test`, `lint`, `typecheck`, then custom names alphabetically.
- `tasks --json` includes project, root, config, and normalized task metadata.

### Execution

- Task type is determined by `longRunning`.
- `run <task>` is universal and respects metadata.
- Short task: foreground execution, streamed output, waits, returns child exit code.
- Long-running task: managed start, state/log recording, returns after launch.
- Lifecycle aliases behave like `run <same-name>`.
- `dev` is equivalent to `start dev` and requires configured `dev` with `longRunning: true`.
- `start [task]` only starts managed tasks; no arg uses `start` if present, otherwise `dev`.
- Duplicate managed starts fail with `process_already_running`.
- `restart [task]` stops then starts a managed task and reports partial failures explicitly.
- v1 supports one running managed process per task name.

### Runtime Recovery

- Runtime state is an operation ledger, not disposable cache.
- Process records include task name, command, cwd, PID or handle, ports, log path, started time, stopped time, status, and last refresh.
- Status values include `running`, `stopped`, `stale`, and `unknown`.
- `ps` refreshes liveness and shows known records, including stopped or stale ones.
- `logs <task>` reads logs after process exit when logs exist.
- `logs --lines` limits recent output.
- `stop [task]` is idempotent, refreshes before stop, preserves state/logs, and reports no-op or not-found states clearly.
- Runtime cleanup happens only through configured clean targets or future pruning, not through inspection commands.

### Clean

- `clean` is dry-run preview.
- `clean --safe` removes only `clean.safe`.
- `clean --all --yes` removes safe and risky targets.
- `clean --all` without confirmation fails with `confirmation_required`.
- Cleanup is project-root-local only.
- Refuse project root, out-of-root paths, empty targets, and ambiguous targets.
- Missing targets are non-fatal skipped entries.
- `.launchdeck/logs` and `.launchdeck/runtime` may be configured safe targets, but runtime commands do not auto-delete them.
- Clean is separate from future destructive reset behavior.

## Cross-Platform Runtime Contract

CLI/core owns:

- command names
- task selection
- JSON shape
- error vocabulary
- safety policy
- lifecycle semantics

Runtime adapters own:

- platform detection
- path handling
- shell execution
- foreground process execution
- managed process start
- liveness checks
- process-tree stop
- executable lookup
- filesystem clean
- logs and text handling

v1 keeps `command` as a shell string. Windows can initially use `taskkill /T`; macOS/Linux can use process groups and signals with single-PID fallback. Destructive path safety must use canonical containment checks, not string-prefix checks.

## JSON And Exit Code Contract

Success envelope:

```json
{ "ok": true, "command": "doctor", "status": "ok" }
```

Failure envelope:

```json
{
  "ok": false,
  "command": "run",
  "error": {
    "code": "task_not_found",
    "message": "Task not found.",
    "details": {}
  }
}
```

Shared fields:

- `ok`
- `command`
- `status`
- `projectRoot`
- `configPath`
- `error`

Command payloads may add:

- `task`
- `tasks`
- `process`
- `processes`
- `checks`
- `targets`
- `removed`
- `content`
- `code`
- `signal`

Exit code stance:

- Success is `0`.
- Foreground task returns child exit code.
- Launchdeck-level failures return `1`.
- `doctor` status `ok` and `warn` return `0`.
- `doctor` status `error` returns non-zero.
- `clean --all` without confirmation returns non-zero.
- Partial success uses `{ "ok": false, "status": "partial", "error": { "code": "partial_failure" } }`.

## Error Code Vocabulary

Config and args:

- `unknown_command`
- `invalid_arguments`
- `config_not_found`
- `config_exists`
- `config_invalid`
- `unsupported_config_version`

Task:

- `task_required`
- `task_not_found`
- `task_not_managed`
- `task_invalid`
- `cwd_missing`
- `cwd_outside_project`
- `log_path_outside_project`
- `invalid_task_port`
- `invalid_task_risk`

Foreground execution:

- `command_failed`
- `command_spawn_failed`
- `command_not_found`

Runtime:

- `process_already_running`
- `process_not_found`
- `process_stop_failed`
- `process_start_failed`
- `runtime_state_invalid`
- `runtime_state_write_failed`
- `log_not_found`

Clean:

- `confirmation_required`
- `clean_path_outside_project`
- `clean_refuses_project_root`
- `clean_target_invalid`
- `clean_failed`

Platform:

- `platform_unsupported`
- `platform_stop_unsupported`
- `path_resolution_failed`

Partial and internal:

- `partial_failure`
- `internal_error`

`internal_error` should be rare and treated as a missing-classification signal.

## Verification Contract

Claim levels:

- `dev-ready`: local correctness plus lifecycle smoke on at least one dev OS.
- `platform-smoke-ready`: lifecycle smoke passes on the named OS.
- `cross-platform-ready`: lifecycle smoke passes on Windows, macOS, and Linux.

Smoke coverage:

- `doctor`
- `tasks`
- foreground `run`
- managed `start` or `dev`
- `ps`
- `logs`
- `stop`
- `clean`
- `clean --safe`
- `clean --all` confirmation behavior
- unsafe clean refusal

Evidence should preserve OS/version, runtime version, Launchdeck version or commit, command, exit code, key JSON, process stop verification, and skipped or unsupported checks.

## Consumer Eligibility

- `sp-specify`: eligible after user confirmation. Reason: the feature spans CLI command semantics, runtime behavior, safety policy, cross-platform verification, and compatibility contracts.
- `sp-quick`: not recommended. Reason: the scope is not a small isolated fix; it needs a formal spec before further implementation.
- `sp-plan`: downstream after `sp-specify`.
- `sp-implement`: downstream after spec and plan.

## Open Questions For Downstream

These are soft unknowns, not handoff blockers:

- Exact command-specific JSON schemas.
- Exact doctor finding code names.
- Exact verbose `tasks` output.
- Exact partial restart failure payload.
- Exact corrupt runtime state behavior.
- Exact clean action values.
- Exact symlink/junction canonicalization rules.
- Exact shell override fields.
- Exact native process strategy per platform.
- Exact CI provider or local platform execution setup.
- Exact smoke artifact format.
- Exact starter config shape.
- Exact global `--cwd` syntax and placement.
- Exact public error documentation format.

## Return To Discussion If

- The product is changed back to agent-skill-first rather than tool-first.
- v1 must include GUI/TUI, MCP, agent package, cloud execution, marketplace, plugin system, or monorepo orchestration.
- Cleanup is expected to perform destructive reset behavior.
- Cross-platform support is demoted from core requirement.
- `.launchdeck.yml` stops being the explicit v1 protocol.
- JSON/error compatibility is no longer required.
- Target project root changes from `F:/github/launchdeck`.

## Must-Preserve Ledger

| id | type | claim | source | downstream_requirement | blocking_level | owner | latest_resolve_phase | status | deferred_to | stop_and_reopen_condition | superseded_by | mapped_to |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MP-001 | goal | Launchdeck is a universal lifecycle control tool for local software projects. | User direction and discussion-state confirmed decisions | Spec must frame Launchdeck as product/core CLI, not only as an agent skill. | hard | specify | specify | active | none | Product is reframed as skill-only or agent-only. | none | CA-004, CA-022 |
| MP-002 | scope | v1 is CLI-first, local, single-project, explicit-config lifecycle control. | v1 scope discussion | Spec must keep v1 bounded to local CLI lifecycle operations. | hard | specify | specify | active | none | v1 expands into GUI, cloud, orchestration, or marketplace. | none | CA-022 |
| MP-003 | non_goal | GUI/TUI, MCP, agent skill, automatic discovery default, monorepo orchestration, remote/cloud, reset, plugins, marketplace, and native packaging are out of v1. | v1 scope discussion | Spec must list these as non-goals or deferred. | hard | specify | specify | active | later versions | Any non-goal becomes required v1 behavior. | none | CA-022 |
| MP-004 | protocol | `.launchdeck.yml v1` must be small, explicit, readable, and stable. | protocol discussion | Spec must define the config as the central v1 protocol. | hard | specify | specify | active | none | Config becomes implicit, generated-only, or unstable. | none | CA-008 |
| MP-005 | platform | Windows, macOS, and Linux are first-class lifecycle platforms. | user confirmation and cross-platform discussion | Spec must include cross-platform behavior and verification expectations. | hard | specify | specify | active | none | Cross-platform support is treated as later nice-to-have. | none | CA-006, CA-016, CA-017 |
| MP-006 | flow | First-run flow is init, doctor, tasks, run/build, dev, ps, logs, stop, clean preview/safe. | CLI first-run discussion | Spec must preserve inspection before mutation and recovery after start. | hard | specify | specify | active | none | First-run encourages execution before inspection. | none | CA-010 |
| MP-007 | doctor | `doctor` is read-only and reports error/warn/info findings with stable codes. | doctor discussion | Spec must prohibit doctor mutations and define severity/status. | hard | specify | specify | active | none | Doctor installs, starts, stops, deletes, or rewrites config. | none | CA-011 |
| MP-008 | tasks | `tasks` is read-only inventory, not validation or execution. | tasks discussion | Spec must keep tasks focused on capability listing. | hard | specify | specify | active | none | Tasks begins executing or mutating project state. | none | CA-012 |
| MP-009 | execution | `longRunning` controls foreground vs managed execution. | execution discussion | Spec must define run/start/dev/restart around task metadata. | hard | specify | specify | active | none | Managed execution is inferred opaquely or duplicates starts silently. | none | CA-013 |
| MP-010 | runtime | Runtime state/logs are inspectable recovery surfaces, not disposable cache. | runtime recovery discussion | Spec must preserve state/logs through ps/logs/stop and stale states. | hard | specify | specify | active | none | Inspection commands silently delete state/logs. | none | CA-002, CA-005, CA-014 |
| MP-011 | clean | Clean is dry-run by default, safe/risky split, project-local, root/out-of-root refusing, separate from reset. | clean discussion | Spec must define conservative cleanup and confirmation requirements. | hard | specify | specify | active | future reset | Clean performs destructive reset behavior. | none | CA-001, CA-015 |
| MP-012 | adapters | OS-specific process/path/shell/clean behavior belongs behind runtime adapters. | cross-platform runtime discussion | Spec or plan must preserve product semantics above platform implementation details. | hard | specify, plan | plan | active | implementation design | Core CLI embeds platform behavior in ways that change product semantics per OS. | none | CA-007, CA-016 |
| MP-013 | verification | Release claims must name verification level; cross-platform-ready requires Windows/macOS/Linux smoke evidence. | verification discussion | Spec must include claim levels and smoke coverage. | hard | specify | specify | active | none | Product claims cross-platform without all-OS evidence. | none | CA-017 |
| MP-014 | compatibility | JSON envelope, structured error object, exit-code stance, and stable error codes are compatibility surfaces. | JSON/error discussion | Spec must define machine-readable output and error vocabulary. | hard | specify | specify | active | none | Human text becomes the only parseable surface. | none | CA-003, CA-009, CA-020, CA-021 |
| MP-015 | boundary | Target implementation project is `F:/github/launchdeck`. | context boundary discussion | Downstream workflow must operate on this project unless user overrides it. | hard | specify | specify | active | none | Target root changes without user confirmation. | none | context-boundary |
| MP-016 | unknowns | Remaining unknowns are soft downstream details, not handoff blockers. | open-questions.md | Spec may resolve them, but must return to discussion if they alter hard scope. | medium | specify | specify | active | plan/implementation | A soft unknown changes product boundary or safety policy. | none | open-questions |

## Consequence Obligations

- CA-001: Launchdeck must not make destructive cleanup implicit.
- CA-002: Long-running processes must be inspectable and stoppable through Launchdeck state.
- CA-003: Agent/tool-readable output must preserve enough structure for recovery and diagnosis.
- CA-004: The config protocol must remain stack-agnostic and local-project scoped.
- CA-005: Runtime state and logs must be observable and safe to clean.
- CA-006: Windows, macOS, and Linux must be first-class supported platforms for lifecycle behavior.
- CA-007: OS-specific behavior must be isolated behind a product-preserving runtime boundary.
- CA-008: `.launchdeck.yml v1` must remain small, explicit, readable, and stable enough for downstream tools to rely on.
- CA-009: JSON output and error categories must be treated as compatibility surfaces.
- CA-010: The CLI first-run flow must prioritize inspection and recoverability before mutation.
- CA-011: `doctor` must remain read-only and classify findings with stable severity and codes.
- CA-012: `tasks` must remain read-only and expose risk, managed/command type, ports, and command text before execution.
- CA-013: Execution commands must respect `longRunning`, avoid implicit duplicate starts, preserve child exit codes for foreground tasks, and keep managed state inspectable after start/restart failures.
- CA-014: Managed runtime commands must preserve inspectable state and logs across running, stopped, stale, missing-log, and stop-failed cases.
- CA-015: `clean` must default to dry-run, separate safe and risky targets, refuse project-root/out-of-root deletion, and remain distinct from destructive reset behavior.
- CA-016: Platform-sensitive behavior must be isolated behind runtime adapters for path, shell, process, executable lookup, cleanup, and logs, with validation evidence on Windows, macOS, and Linux before cross-platform release claims.
- CA-017: Release claims must name the verification level achieved, and cross-platform readiness requires lifecycle smoke evidence on Windows, macOS, and Linux.
- CA-018: `init` must create an explicit editable config without executing project commands, must not silently overwrite existing configs, and must keep scan/template inference advisory.
- CA-019: Target cwd, config discovery, project root, task cwd, and runtime state location must be deterministic and visible, with `init` protected from accidental ancestor overwrite.
- CA-020: JSON output must use a stable envelope and error object, while exit codes remain simple and preserve child process exit codes for foreground tasks.
- CA-021: v1 error codes must be stable, actionable, snake_case, and grouped by user-action domain; `internal_error` should be rare and treated as a classification gap.
- CA-022: v1 scope must remain local, single-project, CLI-first, explicit-config lifecycle control; deferred integrations and orchestration must not dilute the core lifecycle contracts.

## Quality Gate

- target boundary present: pass
- recommended consumer present: pass
- handoff kind present: pass
- handoff status: handoff-ready
- planning gate status: ready
- Must-Preserve Ledger present: pass
- consequence obligations present: pass
- hard blockers: none
- unresolved conflicts: none
- placeholders requiring user input: none
- quality gate: user_confirmed
- user confirmation required before downstream consumption: false
- user confirmed at: 2026-07-07T10:51:43.9189243+08:00
