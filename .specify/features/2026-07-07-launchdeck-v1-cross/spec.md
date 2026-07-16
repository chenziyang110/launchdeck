# Feature Specification: Launchdeck v1 Cross-Platform CLI Lifecycle Tool

**Feature Branch**: `2026-07-07-launchdeck-v1-cross`  
**Created**: 2026-07-07  
**Status**: Review requested  
**Input**: User-confirmed discussion handoff `.specify/discussions/launchdeck-tool/handoff-to-specify.md`

## Overview

### Feature Goal

Launchdeck v1 is a cross-platform local CLI for explicit single-project lifecycle control through `.launchdeck.yml`. It must let a developer initialize, inspect, run, manage, log, stop, and safely clean a local software project without rediscovering project-specific commands, ports, process IDs, logs, cache paths, or cleanup risks.

### Intended Users and Value

- **Primary users / roles**: developers operating local projects from a terminal.
- **Secondary consumers**: scripts, CI tasks, editor integrations, coding agents, and future MCP/skill layers that consume the CLI/protocol.
- **Problem or opportunity**: local projects expose lifecycle behavior through stack-specific conventions that are easy to run but hard to inspect, stop, recover, or safely clean once automated.
- **Confirmed product outcome**: a project-local lifecycle control layer that is more than a task alias runner because it understands command type, risk, ports, runtime state, logs, cleanup boundaries, errors, and release claim evidence.

## Confirmed Scope

### In Scope

- Config discovery from `.launchdeck.yml`, `.launchdeck.yaml`, `launchdeck.yml`, or `launchdeck.yaml`.
- Config version `1` with `project.name`, `tasks`, and `clean.safe` / `clean.risky`.
- Task metadata: `command`, `cwd`, `env`, `description`, `risk`, `longRunning`, `ports`, and `log`.
- CLI commands: `init`, `doctor`, `tasks`, `run <task>`, `setup`, `build`, `package`, `test`, `lint`, `typecheck`, `dev`, `start [task]`, `restart [task]`, `ps`, `logs [task]`, `stop [task]`, `clean`, `clean --safe`, and `clean --all --yes`.
- Project-local runtime state under `.launchdeck/runtime/state.json`.
- Project-local logs under `.launchdeck/logs/`.
- Conservative cleanup with dry-run default, safe/risky target separation, and explicit confirmation for risky cleanup.
- Stable `--json` output envelope, structured error object, simple exit-code policy, and stable snake_case error codes.
- Cross-platform behavior contract for Windows, macOS, and Linux, with platform-sensitive behavior isolated behind runtime adapters.
- Verification claim levels: `dev-ready`, `platform-smoke-ready`, and `cross-platform-ready`.

### Out of Scope

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

### Deferred Or Future Scope

- `init --scan`: reopen if users will not adopt v1 without scan-generated config.
- `init --template <name>`: reopen if starter config pressure requires stack-specific templates.
- `doctor --suggest`: reopen if validation without guidance blocks adoption.
- Task `platforms` overrides: reopen if common cross-platform projects cannot express commands without OS-specific branches.
- Richer shell configuration or structured command DSL: reopen if shell-string commands cannot safely support common projects.
- Runtime state pruning: reopen if stopped/stale records make normal `ps` output noisy.
- Standalone binaries and package-manager installers: reopen before packaging/release decisions.
- MCP server, agent skill integration, and UI/TUI dashboard: reopen when the CLI/protocol is stable enough to serve integrations.
- Monorepo orchestration: reopen if target users need one Launchdeck command to run tasks across multiple packages/apps.

## Must-Preserve Discussion Inputs

- **Source**: `.specify/discussions/launchdeck-tool/handoff-to-specify.md`
- **Coverage Status**: complete
- **Planning Gate Status**: ready

### Mapped Must-Preserve Items

| ID | Claim | Spec Preservation |
| --- | --- | --- |
| MP-001 | Launchdeck is a universal lifecycle control tool for local software projects. | Overview, scope, requirements. |
| MP-002 | v1 is CLI-first, local, single-project, explicit-config lifecycle control. | Confirmed Scope and Boundary Constraints. |
| MP-003 | GUI/TUI, MCP, agent skill, discovery default, orchestration, remote/cloud, reset, plugins, marketplace, and native packaging are out of v1. | Out of Scope and Deferred Or Future Scope. |
| MP-004 | `.launchdeck.yml v1` must be small, explicit, readable, and stable. | Functional requirements FR-001 through FR-010. |
| MP-005 | Windows, macOS, and Linux are first-class lifecycle platforms. | Cross-platform requirements and verification proof. |
| MP-006 | First-run flow prioritizes init, doctor, tasks, run/build, dev, ps, logs, stop, clean preview/safe. | Scenarios and acceptance proof. |
| MP-007 | `doctor` is read-only and reports error/warn/info findings with stable codes. | FR-011 through FR-015. |
| MP-008 | `tasks` is read-only inventory, not validation or execution. | FR-016 through FR-018. |
| MP-009 | `longRunning` controls foreground vs managed execution. | FR-019 through FR-026. |
| MP-010 | Runtime state and logs are inspectable recovery surfaces. | FR-027 through FR-034. |
| MP-011 | Clean is dry-run by default, safe/risky split, project-local, root/out-of-root refusing, separate from reset. | FR-035 through FR-041. |
| MP-012 | OS-specific process/path/shell/clean behavior belongs behind runtime adapters. | Non-functional requirements and context. |
| MP-013 | Release claims must name verification level; cross-platform-ready requires Windows/macOS/Linux smoke evidence. | Acceptance Proof and verification levels. |
| MP-014 | JSON envelope, structured error object, exit-code stance, and stable error codes are compatibility surfaces. | FR-042 through FR-051. |
| MP-015 | Target implementation project is `F:/github/launchdeck`. | Context and references. |
| MP-016 | Remaining unknowns are soft downstream details, not handoff blockers. | Risks and Gaps. |

### Discussion Conflicts

No open conflicts remain. Out-of-scope and deferred items were confirmed in the user-reviewed handoff.

## Scenarios and Usage Paths

### Primary Scenario - Inspect And Run A Local Project

A developer enters a project and wants to know what Launchdeck can safely do before running commands.

**Usage Path**:
1. Run `launchdeck init` if the project does not already have a Launchdeck config.
2. Run `launchdeck doctor` to inspect whether the lifecycle contract is safe and operable.
3. Run `launchdeck tasks` to list available tasks, risks, command/managed type, ports, and command text.
4. Run `launchdeck run build` or a lifecycle alias such as `launchdeck build`.

**Acceptance Signals**:
- `init` creates editable `.launchdeck.yml` without executing commands.
- `doctor` and `tasks` are read-only.
- Foreground task output streams and the Launchdeck process returns the child exit code.
- JSON output exposes `ok`, `command`, `status`, `projectRoot`, `configPath`, and command-specific payload fields.

### Secondary Scenario - Manage A Long-Running Dev Process

A developer wants to start a dev server, inspect it later, recover logs, and stop it without manual process hunting.

**Usage Path**:
1. Configure a task with `longRunning: true`.
2. Run `launchdeck dev` or `launchdeck start <task>`.
3. Run `launchdeck ps` to inspect managed records.
4. Run `launchdeck logs <task>` to inspect output.
5. Run `launchdeck stop <task>` to stop the managed process.

**Acceptance Signals**:
- Launchdeck records task name, command, cwd, PID or platform handle, ports, log path, started time, stopped time when known, status, and last refresh.
- Duplicate starts fail with `process_already_running`.
- Logs remain readable after process exit when the log file exists.
- `stop` is idempotent and preserves diagnostic state.

### Secondary Scenario - Clean Generated State Safely

A developer wants to remove generated state without deleting project source, credentials, external files, or reset-like resources.

**Usage Path**:
1. Declare `clean.safe` and optionally `clean.risky`.
2. Run `launchdeck clean` to preview targets.
3. Run `launchdeck clean --safe` to delete safe targets.
4. Run `launchdeck clean --all --yes` only when risky cleanup is explicitly intended.

**Acceptance Signals**:
- `clean` defaults to dry-run.
- `clean --all` without `--yes` fails with `confirmation_required`.
- Clean refuses the project root, out-of-root paths, empty targets, and ambiguous targets.
- Missing targets are skipped rather than fatal.

### Edge Cases and Failure Paths

- Missing config returns `config_not_found` with guidance to run `launchdeck init`.
- Existing config causes `init` to fail with `config_exists` unless overwrite is explicit.
- Unsupported config version returns `unsupported_config_version`.
- Missing or invalid task metadata blocks affected execution with stable config/task error codes.
- `start`, `dev`, and `restart` fail with `task_not_managed` when the selected task is not `longRunning: true`.
- Stale runtime state remains inspectable and is marked stopped/stale/unknown instead of disappearing silently.
- Missing logs produce a clear `log_not_found` result without crashing.
- Platform stop limitations produce `platform_stop_unsupported` or `process_stop_failed`, not false success.
- Cross-platform readiness cannot be claimed until lifecycle smoke passes on Windows, macOS, and Linux.

## Capability Decomposition

### Capability Map

- **Capability 1: Explicit Project Lifecycle Protocol**  
  Supports: all scenarios.  
  Depends on: `.launchdeck.yml` discovery and normalization.  
  Delivery note: core.

- **Capability 2: Conservative Init**  
  Supports: first-run setup.  
  Depends on: target cwd semantics and config file naming.  
  Delivery note: core.

- **Capability 3: Read-Only Inspection**  
  Supports: `doctor` and `tasks`.  
  Depends on: normalized config, path safety checks, advisory executable lookup, and stable findings.  
  Delivery note: core.

- **Capability 4: Foreground Task Execution**  
  Supports: `run <task>` and lifecycle aliases for short tasks.  
  Depends on: task lookup, cwd resolution, environment merge, output streaming, and exit-code preservation.  
  Delivery note: core.

- **Capability 5: Managed Process Runtime**  
  Supports: long-running `run`, `dev`, `start`, `restart`, `ps`, `logs`, and `stop`.  
  Depends on: project-local state, logs, liveness refresh, duplicate prevention, and platform process adapters.  
  Delivery note: core.

- **Capability 6: Safe Cleanup**  
  Supports: `clean`, `clean --safe`, and `clean --all --yes`.  
  Depends on: canonical project-root containment, target classification, confirmation handling, and stable removed/skipped/refused output.  
  Delivery note: core.

- **Capability 7: Machine-Readable Compatibility Surface**  
  Supports: all future automation and integration consumers.  
  Depends on: JSON envelope, stable error object, stable error codes, and simple exit-code stance.  
  Delivery note: enabling.

- **Capability 8: Cross-Platform Verification Contract**  
  Supports: credible release claims.  
  Depends on: runtime adapters and lifecycle smoke evidence on named OS families.  
  Delivery note: validation-oriented.

### Capability Relationships

- Config normalization is the shared prerequisite for inspection, execution, runtime, cleanup, and JSON output.
- Runtime state and logs are shared state surfaces for `dev`, `start`, `restart`, `ps`, `logs`, `stop`, and configured clean targets.
- Cleanup safety and task cwd/log path safety must use the same project-root containment model.
- JSON output and error codes cut across every command and must be planned as a compatibility surface, not command-by-command copy.
- Cross-platform implementation details must not change the user-visible command contract.

### Capability Preservation Ledger

| Upstream Signal | Source | Selected Entry Point | Implementation Obligation | Acceptance Proof | Narrowing Confirmation |
| --- | --- | --- | --- | --- | --- |
| create/init lifecycle contract | `requirements.md#init-contract` | `launchdeck init` | Create editable `.launchdeck.yml` without running project commands or overwriting existing config silently. | init acceptance checks and JSON payload. | Not narrowed. |
| scaffold/scan/template | handoff deferred scope | Deferred `init --scan` and `init --template <name>` | Preserve future entry points without making v1 depend on inference. | Deferred scope and reopen triggers. | User-confirmed deferral. |
| CLI lifecycle control | handoff goal | Public CLI commands | Commands must operate as the primary product surface. | scenario smoke and command acceptance proof. | Not narrowed. |
| agent integration | handoff out-of-scope/deferred | Future consumer layer over CLI/protocol | Keep JSON/error compatibility so integrations can be built later. | JSON contract requirements. | User-confirmed deferral. |
| reset/destructive cleanup | clean discussion | Deferred separate reset contract | Do not hide reset under `clean`. | clean negative acceptance proof. | User-confirmed exclusion. |

## Requirements

### Functional Requirements

- **FR-001**: Launchdeck MUST discover config from `.launchdeck.yml`, `.launchdeck.yaml`, `launchdeck.yml`, or `launchdeck.yaml` by searching upward from the target cwd for normal commands.
- **FR-002**: Launchdeck MUST support config `version: 1` and reject unsupported versions with `unsupported_config_version`.
- **FR-003**: Launchdeck MUST treat the discovered config directory as `projectRoot` for task cwd, runtime state, logs, and clean targets.
- **FR-004**: Launchdeck MUST support `project.name` and default it to the project-root directory name when absent.
- **FR-005**: Launchdeck MUST support task fields `command`, `cwd`, `env`, `description`, `risk`, `longRunning`, `ports`, and `log`.
- **FR-006**: Launchdeck MUST validate task risk against `low`, `medium`, `high`, and `destructive`.
- **FR-007**: Launchdeck MUST validate ports as integers from 1 through 65535.
- **FR-008**: Launchdeck MUST resolve task `cwd` relative to `projectRoot` and refuse cwd paths that escape the project root.
- **FR-009**: Launchdeck MUST resolve task `log` paths relative to `projectRoot` and refuse log paths that escape the project root.
- **FR-010**: Launchdeck MUST support `clean.safe` and `clean.risky` as explicit configured cleanup target lists.
- **FR-011**: `init` MUST create editable `.launchdeck.yml` in the target cwd and MUST NOT install dependencies, run project commands, start processes, stop processes, or clean files.
- **FR-012**: `init` MUST fail with `config_exists` if a config already exists in the target directory unless overwrite is explicit.
- **FR-013**: `init` MUST NOT overwrite an ancestor config discovered through upward search.
- **FR-014**: `doctor` MUST be read-only and MUST classify findings as `error`, `warn`, or `info`.
- **FR-015**: `doctor` MUST return overall status `ok`, `warn`, or `error`; `doctor` warnings MUST NOT fail the process by default.
- **FR-016**: `doctor --json` MUST include stable finding fields including `severity`, `status`, and `code`.
- **FR-017**: `tasks` MUST be read-only inventory and MUST NOT execute, deeply validate, start, stop, delete, or modify project state.
- **FR-018**: `tasks` MUST show task name, type (`command` or `managed`), risk, ports, and command in default human output.
- **FR-019**: `tasks --json` MUST expose project, root, config, and normalized task metadata.
- **FR-020**: `run <task>` MUST execute short tasks in the foreground, stream output, wait for completion, and return the child exit code.
- **FR-021**: `run <task>` MUST start long-running tasks as managed processes when `longRunning: true`.
- **FR-022**: Lifecycle aliases `setup`, `build`, `package`, `test`, `lint`, and `typecheck` MUST behave like `run <same-name>`.
- **FR-023**: `dev` MUST behave as `start dev` and require the selected `dev` task to be managed.
- **FR-024**: `start [task]` MUST start only managed long-running tasks and default to `start` when configured, otherwise `dev`.
- **FR-025**: `restart [task]` MUST stop then start a managed task and report partial failure with inspectable state.
- **FR-026**: Launchdeck MUST prevent duplicate starts for a currently running managed task unless restart behavior is explicitly requested.
- **FR-027**: Managed process records MUST include task name, command, cwd, PID or platform process handle, ports, log path, started time, stopped time when known, status, and last refresh.
- **FR-028**: Runtime state MUST live under `.launchdeck/runtime/state.json`.
- **FR-029**: Default logs MUST live under `.launchdeck/logs/`.
- **FR-030**: `ps` MUST refresh liveness before output and MUST show known running, stopped, stale, or unknown records instead of silently deleting stale state.
- **FR-031**: `logs [task]` MUST read existing logs even after process exit and MUST return `log_not_found` style output when logs are missing.
- **FR-032**: `stop [task]` MUST be idempotent, refresh state before attempting stop, preserve process records/log paths, and record stopped time when stop is attempted or confirmed.
- **FR-033**: `stop` without a task MUST stop all currently running managed tasks.
- **FR-034**: Runtime inspection commands MUST NOT silently erase `.launchdeck/runtime` or `.launchdeck/logs`.
- **FR-035**: `clean` MUST be dry-run preview by default.
- **FR-036**: `clean --safe` MUST remove only configured `clean.safe` targets.
- **FR-037**: `clean --all --yes` MUST remove configured safe and risky targets.
- **FR-038**: `clean --all` without explicit confirmation MUST fail with `confirmation_required`.
- **FR-039**: Clean target resolution MUST refuse project root, out-of-root paths, empty targets, and ambiguous targets.
- **FR-040**: Missing clean targets MUST be skipped rather than fatal.
- **FR-041**: `clean` MUST NOT perform destructive reset, database reset, Docker volume/container reset, credential deletion, or project reinitialization.
- **FR-042**: Commands that support `--json` MUST return a JSON object with `ok`.
- **FR-043**: JSON failure output MUST include `error.code`, `error.message`, and optional `error.details`.
- **FR-044**: JSON output SHOULD include `command`, `status`, `projectRoot`, and `configPath` when applicable.
- **FR-045**: Command payloads MAY include `task`, `tasks`, `process`, `processes`, `checks`, `targets`, `removed`, `content`, `code`, and `signal`.
- **FR-046**: Launchdeck-level failures MUST use stable snake_case error codes from the v1 vocabulary unless a new public code is intentionally added.
- **FR-047**: `internal_error` MUST be rare and treated as a missing-classification signal.
- **FR-048**: Successful Launchdeck-level commands MUST return process exit code `0`.
- **FR-049**: Foreground task commands MUST preserve child process exit codes.
- **FR-050**: Launchdeck-level failures MUST return non-zero, using `1` by default unless preserving a child exit code.
- **FR-051**: Partial failures MUST use `ok: false`, `status: partial`, per-item results where applicable, and `error.code: partial_failure`.

### Non-Functional Requirements

- Cross-platform behavior MUST be specified for Windows, macOS, and Linux as product behavior, not agent-specific workaround logic.
- Runtime adapters MUST isolate platform-sensitive path, shell, process, executable lookup, filesystem clean, log/text behavior, liveness, and process-tree stop details.
- Destructive path safety MUST use canonical containment checks, not string-prefix checks alone.
- JSON and error codes MUST be treated as compatibility surfaces for scripts, automation, and future integrations.
- Human output MAY evolve for clarity, but it MUST NOT be the only parseable surface for automation.
- Verification evidence MUST name the achieved release confidence level.

### Boundary Constraints

- v1 is local and single-project scoped.
- v1 supports monorepos only through nearest-config discovery and task `cwd`, not orchestration.
- v1 keeps `command` as a shell string.
- The first implementation target is `F:/github/launchdeck`.
- Current repository evidence shows a Node ESM CLI package with `yaml`, `src/cli.js`, `src/config.js`, `src/runtime.js`, and CLI tests; this evidence informs planning but does not override the product contract.

## Acceptance Proof

### Acceptance Signals

- A temporary project can create or use `.launchdeck.yml`, run `doctor`, list `tasks`, run a foreground task, start a managed task, inspect `ps`, read `logs`, stop the task, preview clean targets, run safe cleanup, and verify risky cleanup requires explicit confirmation.
- JSON output remains parseable on success and failure.
- Clean refuses project-root and out-of-root targets.
- Managed process state remains inspectable after stop, stale process detection, missing logs, and stop failures.
- Release notes or completion summary name one of `dev-ready`, `platform-smoke-ready`, or `cross-platform-ready`.

### Measurable Success Criteria

- **SC-001**: The v1 lifecycle smoke passes on at least one named OS before any `dev-ready` claim.
- **SC-002**: The same lifecycle smoke passes on Windows, macOS, and Linux before any `cross-platform-ready` claim.
- **SC-003**: Every required v1 command that supports `--json` emits valid JSON for success and classified failure paths.
- **SC-004**: Config, task, runtime, clean, platform, and partial-failure error groups have stable documented codes.
- **SC-005**: The v1 spec, plan, tasks, and implementation do not add out-of-scope GUI/TUI, MCP, agent package, discovery default, orchestration, remote/cloud execution, plugin, marketplace, or destructive reset behavior.

## Decision Capture

### Discussion Decision Digest

- **Selected Direction**: CLI-first lifecycle control. Source: user-confirmed handoff and `technical-options.md`. Rationale: the current repository already has a CLI shape, config loader, process runtime, and dogfood config, and the core product promise is lifecycle control rather than an agent-only integration.
- **Rejected Alternatives**: Protocol/core library first was deferred because it hides the visible user value behind API packaging; agent/MCP first was rejected for v1 because the tool must be usable independently of a particular agent.
- **Accepted Tradeoffs**: Hand-written config is accepted for v1 to preserve safety and clarity; auto-discovery is deferred. Node is acceptable as the first runtime unless packaging/release pressure changes. Shell-string commands are accepted for stack-agnosticism with adapter and warning obligations.
- **Experience Commitments**: The first-run CLI path is `init`, `doctor`, `tasks`, `run build`, `dev`, `ps`, `logs dev`, `stop dev`, `clean`, and `clean --safe`. No UI/TUI experience is in v1.
- **Review Criteria Carry-Forward**: Preserve v1 scope, cross-platform requirement, `.launchdeck.yml` protocol, read-only inspection, conservative cleanup, managed runtime recovery, stable JSON/errors, and verification-level release claims.
- **Must Not Dilute**: Do not reduce Launchdeck to a thin task runner. Do not turn cleanup into reset. Do not claim cross-platform readiness from single-OS evidence. Do not make agent integration the core product. Do not replace explicit config with opaque inference.

### Locked Decisions

- Launchdeck v1 is a CLI-first tool, not a skill-first package.
- `.launchdeck.yml` is the authoritative v1 lifecycle protocol.
- `doctor` and `tasks` are read-only.
- `longRunning` determines foreground versus managed execution.
- Runtime state and logs are recovery surfaces.
- `clean` is conservative, project-local, and dry-run by default.
- Cross-platform behavior must be validated before release claims.
- JSON output and error codes are compatibility surfaces.

### User-Confirmed Deferrals

- Agent skill and MCP integration -> deferred until CLI/protocol is stable.
- GUI/TUI -> deferred until lifecycle control is proven.
- Auto-scan/templates -> deferred suggestion layer.
- Monorepo orchestration -> deferred beyond nearest-config/task-cwd support.
- Reset/database/Docker destructive operations -> deferred separate contract.
- Native installer packaging -> deferred until packaging/release decisions.

### Canonical References

- `.specify/discussions/launchdeck-tool/handoff-to-specify.md`
- `.specify/discussions/launchdeck-tool/handoff-to-specify.json`
- `.specify/discussions/launchdeck-tool/requirements.md`
- `.specify/discussions/launchdeck-tool/technical-options.md`
- `.specify/discussions/launchdeck-tool/open-questions.md`
- `README.md`
- `.launchdeck.yml`
- `src/cli.js`
- `src/config.js`
- `src/runtime.js`
- `test/cli.test.js`

## Consequence Analysis

### Lifecycle And State Behavior

- `CA-001`: Cleanup targets -> preview/safe/all states -> destructive cleanup must never be implicit.
- `CA-002`: Long-running processes -> running/stopped/stale/unknown states -> processes must remain inspectable and stoppable through Launchdeck.
- `CA-003`: JSON output -> success/error/partial states -> downstream tools must receive structured recovery and diagnosis fields.
- `CA-004`: Config protocol -> created/configured/invalid states -> `.launchdeck.yml` must remain stack-agnostic and local-project scoped.
- `CA-005`: Runtime state/logs -> running/stopped/stale/missing-log states -> observable, recoverable, and safe to clean only through configured cleanup.
- `CA-006`: Supported platforms -> Windows/macOS/Linux states -> lifecycle behavior must be first-class on each OS.
- `CA-007`: Runtime adapters -> platform-specific execution states -> OS behavior must not leak into incompatible CLI semantics.
- `CA-008`: Config schema -> v1 compatibility state -> the protocol must remain small, explicit, readable, and stable.
- `CA-009`: JSON/errors -> compatibility state -> field meanings and error categories must be treated as contracts.
- `CA-010`: First-run flow -> before/after mutation states -> inspection and recoverability must precede risky action.
- `CA-011`: `doctor` -> ok/warn/error states -> read-only findings with stable severity and codes.
- `CA-012`: `tasks` -> inventory state -> expose task type, risk, ports, and command before execution.
- `CA-013`: Execution -> foreground/managed/duplicate/partial states -> respect `longRunning`, avoid duplicate starts, preserve exit codes, and keep failure inspectable.
- `CA-014`: Runtime commands -> running/stopped/stale/missing-log/stop-failed states -> preserve inspectable state and logs.
- `CA-015`: Clean -> dry-run/safe/all/refused states -> default dry-run, split safe/risky, refuse root/out-of-root, separate from reset.
- `CA-016`: Platform-sensitive behavior -> path/shell/process/clean/log states -> isolate adapters and validate on all supported OS families.
- `CA-017`: Release claims -> dev/platform/cross-platform states -> name the achieved verification level honestly.
- `CA-018`: `init` -> no-config/existing-config/ancestor-config states -> create editable config without command execution or silent overwrite.
- `CA-019`: Root selection -> cwd/config/task/runtime states -> deterministic and visible project-root behavior.
- `CA-020`: JSON/exit codes -> success/error/child-exit/partial states -> stable envelope and simple exit-code stance.
- `CA-021`: Error vocabulary -> classified/internal states -> actionable domain codes and rare `internal_error`.
- `CA-022`: v1 boundary -> current/deferred states -> local single-project CLI scope must not be diluted by deferred integrations.

### Recovery And Validation

- Process recovery requires `ps`, `logs`, and `stop` to work after context loss and after process exit when state/logs exist.
- Cleanup recovery requires dry-run preview, explicit confirmation, refused entries, skipped missing targets, and clear JSON results.
- Platform recovery requires stop failures to report unsupported or failed state instead of false success.
- Compatibility recovery requires JSON to remain valid on failure and partial success.
- Validation requires lifecycle smoke evidence plus unit coverage for config parsing, path safety, clean target resolution, runtime state, error payloads, and JSON parseability.

## Risks and Gaps

### Planning Risks

- Cross-platform process-tree stop may require stronger platform-specific implementation than the first Node runtime can provide.
- Symlink/junction cleanup semantics can create destructive safety gaps if planned too late.
- JSON compatibility can drift if each command evolves output independently.
- A too-npm-shaped starter config could weaken the universal-project positioning.
- Runtime state retention can become noisy if pruning is not addressed after v1 behavior is proven.

### Information Gaps

- Exact command-specific JSON schemas must be finalized before implementation lock.
- Exact doctor finding code names must be finalized before doctor implementation lock.
- Exact partial restart/stop failure payloads must be finalized before runtime implementation lock.
- Exact CI or local platform execution setup must be finalized before release workflow lock.
- Exact smoke artifact format must be finalized before release claim.
