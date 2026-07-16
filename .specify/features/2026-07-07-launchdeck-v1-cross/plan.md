# Implementation Plan: Launchdeck v1 Cross-Platform CLI Lifecycle Tool

**Branch**: `2026-07-07-launchdeck-v1-cross` | **Date**: 2026-07-07 | **Spec**: `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/spec.md`
**Input**: Feature specification from `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/spec.md`

## Summary

Launchdeck v1 is a CLI-first, local, single-project lifecycle control tool for software projects. The implementation plan keeps the current Node.js CLI shape and turns the existing config/runtime prototype into a stable v1 product surface: explicit `.launchdeck.yml` protocol, read-only inspection commands, foreground and managed task execution, durable runtime state/logs, safe cleanup, JSON/error compatibility, and cross-platform process/path adapters for Windows, macOS, and Linux.

No GUI/TUI, MCP, agent skill, auto-discovery default, remote execution, project graph orchestration, plugin marketplace, or destructive reset behavior is part of this v1 plan.

## Locked Planning Decisions

- Launchdeck is the product; agent integrations are later consumers of the CLI/protocol.
- v1 is CLI-first, local, single-project, and explicit-config driven.
- `.launchdeck.yml` version 1 is a compatibility surface, not an internal-only file.
- `doctor`, `tasks`, `ps`, `logs`, and default `clean` are inspection/recovery surfaces and must avoid hidden mutation.
- Long-running processes must be managed by Launchdeck with state and logs that remain inspectable after exits.
- Cleanup is dry-run by default, split into safe/risky targets, project-local, and separate from destructive reset.
- JSON envelopes, error codes, and exit-code behavior are public automation contracts.
- Windows, macOS, and Linux support cannot be claimed from single-OS evidence.

## Must-Preserve Carry-Forward

| MP ID | Type | Planning Obligation | Plan Location | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- |
| MP-001 | goal | Preserve Launchdeck as universal lifecycle control for local software projects. | Summary; Implementation Constitution | Product reframed as skill-only or task-runner-only. |
| MP-002 | scope | Preserve CLI-first local single-project explicit-config v1. | Locked Planning Decisions; Phase Plan | Workspace graph or remote orchestration is required in v1. |
| MP-003 | non_goal | Keep GUI/TUI, MCP, agent skill, discovery default, orchestration, remote/cloud, reset, plugins, marketplace, and native packaging out of v1. | Forbidden Implementation Drift | User explicitly pulls one of these into v1. |
| MP-004 | decision | Keep `.launchdeck.yml` v1 small, explicit, readable, and stable. | Contracts; Data Model | Config becomes auto-generated-only or stack-specific. |
| MP-005 | requirement | Treat Windows, macOS, and Linux as first-class platforms. | Technical Context; Verification Plan | Any OS is demoted from release proof. |
| MP-006 | scenario | Preserve first-run flow: `init`, `doctor`, `tasks`, `run/build`, `dev`, `ps`, `logs`, `stop`, `clean` preview/safe. | Capability Preservation Plan; Quickstart | Flow requires scan/template-first onboarding. |
| MP-007 | requirement | `doctor` stays read-only with stable severity and codes. | Operational Consequence Design | `doctor` mutates project state. |
| MP-008 | requirement | `tasks` is read-only inventory. | Operational Consequence Design | `tasks` executes or hides risk/type metadata. |
| MP-009 | requirement | `longRunning` controls foreground vs managed execution. | Data Model; Runtime Contract | Execution ignores metadata. |
| MP-010 | requirement | Runtime state/logs remain inspectable recovery surfaces. | Runtime Contract; Phase Plan | Inspection deletes or hides state/logs. |
| MP-011 | requirement | Clean is dry-run by default, safe/risky, project-local, root/out-of-root refusing, and separate from reset. | Clean Contract; Operational Consequence Design | Clean becomes reset-like or out-of-root capable. |
| MP-012 | architecture | OS-specific process/path/shell/clean behavior belongs behind runtime adapters. | Implementation Constitution | Platform checks spread through CLI semantics. |
| MP-013 | validation | Release claims name verification level; cross-platform-ready requires all-OS smoke. | Verification Plan; Quickstart | Release language overstates evidence. |
| MP-014 | compatibility | JSON envelope, structured errors, exit-code stance, and stable codes are contracts. | CLI JSON Contract; Error Codes Contract | Human text becomes the only parseable surface. |
| MP-015 | boundary | Target implementation project is `F:/github/launchdeck`. | Implementation Target Boundary | Work targets another repository. |
| MP-016 | risk | Remaining unknowns are soft downstream details, not blockers. | Research Inputs; Phase Plan | New hard unknown changes scope or safety. |

## Capability Preservation Plan

| Capability Operation | Upstream Source | Selected Entry Point | Owning Surface | Required Implementation | Acceptance Proof | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- | --- | --- |
| Initialize config | FR-011 to FR-013, CA-018 | Public CLI `launchdeck init` | `src/cli.js`, `src/config.js` | Create editable `.launchdeck.yml` in target cwd; no project command execution; no silent overwrite; ancestor config must not be overwritten. | CLI tests for no config, target config exists, ancestor config exists, `--force` target behavior. | User requires scan/template-first init. |
| Inventory tasks | FR-017 to FR-019, CA-012 | Public CLI `launchdeck tasks` | `src/cli.js`, `src/config.js` | Read-only normalized task list with type, risk, ports, command, root, and config path. | Human and JSON parse tests; no runtime file writes. | Inventory becomes validation/execution. |
| Run short tasks | FR-020, FR-022, FR-049 | Public CLI `launchdeck run <task>` and lifecycle aliases | `src/cli.js`, `src/runtime.js` | Foreground execution streams output and preserves child exit code. | CLI fixture child exits with non-zero and parent returns same code. | Alias behavior diverges from `run`. |
| Manage long-running tasks | FR-021, FR-023 to FR-026 | Public CLI `run`, `start`, `dev`, `restart` | `src/runtime.js` with process adapter | Start only `longRunning: true` tasks as managed; prevent duplicates; restart reports partial failure when stop/start cannot complete. | Lifecycle smoke covers start/duplicate/ps/logs/stop/restart. | Managed execution becomes opaque shell backgrounding. |
| Inspect runtime | FR-027 to FR-034 | Public CLI `ps`, `logs`, `stop` | Runtime state/log contract | Refresh liveness without deleting records; retain logs after exit; stop idempotently and report stop failures. | Tests for stale records, missing logs, idempotent stop, stop all. | Inspection commands delete recovery evidence. |
| Clean project artifacts | FR-035 to FR-041 | Public CLI `clean`, `clean --safe`, `clean --all --yes` | `src/runtime.js` clean/path adapter | Dry-run default; safe-only removal; explicit all+yes; canonical containment refusal. | Refusal tests for root/out-of-root/symlink/junction where platform supports it. | Cleanup expands into reset. |
| Agent/MCP integration | MP-003 | Deferred | none in v1 | Keep CLI/protocol stable for future consumers but do not implement integration package. | Out-of-scope check in tasks and review. | User asks to add integration after CLI is stable. |

## Implementation Target Boundary

- **Current project root**: `F:/github/launchdeck`
- **Current project roles**:
  - `implementation-target`: CLI package, config/runtime implementation, tests, examples, and docs for Launchdeck itself.
  - `spec-workspace`: `.specify/features/2026-07-07-launchdeck-v1-cross/` planning artifacts.
- **Target project root**: `F:/github/launchdeck`
- **Target paths/modules**:
  - `src/cli.js`: command routing, flags, human/JSON output, command-level status and exit mapping.
  - `src/config.js`: config discovery, protocol validation, normalization, sample config.
  - `src/runtime.js`: task execution orchestration, state/log handling, clean planning/execution.
  - `src/errors.js`: classified error payloads and JSON failure shape.
  - `test/cli.test.js`, `test/config.test.js`: current Node test coverage to extend.
  - Future internal adapter modules may be added under `src/` only if they preserve the public CLI shape.
- **Target evidence status**: Project cognition reported a greenfield-empty baseline and directed minimal live reads. Live reads confirmed the existing Node CLI, config loader, runtime helper, error helper, and tests.
- **Reference sources**: Discussion artifacts under `.specify/discussions/launchdeck-tool/`, spec package, repository live reads, and official Node/Microsoft/GitHub docs listed in `research.md`.
- **Cognition scope rule**: Current project cognition applies to this repository only.
- **Stop condition**: If implementation requires changing the package runtime away from Node.js, adding out-of-scope product surfaces, or weakening cleanup/process safety contracts, stop and reopen planning/specification.

## Scenario Profile Inputs

### Active Profile

- **Standard Delivery**: No special reference fidelity profile applies. The feature is a product implementation plan for the current repository, not a clone or migration.
- **Source artifacts**: `alignment.md`, `context.md`, `brainstorming/handoff-to-specify.json`.

### Profile-Driven Implementation Constraints

- Preserve every MP and CA obligation because the plan is the bridge from open discussion to executable tasks.
- Treat JSON/errors/config/state/clean behavior as contracts even though the current code is still small.
- Use verification levels to avoid overstating cross-platform confidence.

## Technical Context

**Language/Version**: JavaScript ESM on Node.js `>=20`  
**Primary Dependencies**: Existing `yaml` package; Node standard library for CLI, filesystem, child process, and tests  
**Storage**: Project-local files: `.launchdeck.yml`, `.launchdeck/runtime/state.json`, `.launchdeck/logs/`  
**Testing**: Node built-in test runner via `npm test`; syntax check via `npm run check`; future CI matrix smoke for Windows/macOS/Linux  
**Target Platform**: Windows, macOS, and Linux local shells  
**Project Type**: CLI package  
**Performance Goals**: CLI startup and config parsing should stay lightweight; logs should be tail-read without loading unbounded files by default  
**Constraints**: Safe cleanup, deterministic root selection, stable JSON/error contracts, idempotent stop, no hidden mutation in inspection commands  
**Scale/Scope**: One local project root per invocation; no workspace graph, daemon, or multi-project fan-out in v1

## Implementation Constitution

### Architecture Invariants

- CLI semantics are product semantics; helper modules may move, but public command behavior must not drift.
- Config discovery and normalization remain centralized in `src/config.js` or a clearly owned config module.
- Platform-sensitive behavior is isolated behind runtime/path/process adapter functions instead of scattered `process.platform` branches.
- Runtime state and logs are durable recovery evidence; inspection commands may refresh status but must not silently erase records or logs.
- JSON envelopes, error payloads, and exit-code rules are compatibility surfaces and require tests.
- Cleanup target resolution must prove project-root containment using canonical paths where possible and must refuse ambiguous paths.

### Boundary Ownership

- `src/cli.js` owns command parsing, default command behavior, human output, JSON output, and Launchdeck-level exit mapping.
- `src/config.js` owns `.launchdeck.yml` discovery, version checks, field validation, defaults, and normalized task/project shapes.
- `src/runtime.js` owns orchestration for foreground execution, managed execution, state/log refresh, stop, restart, and clean.
- Adapter functions own OS-specific shell, process-tree stop, PID liveness, path canonicalization, executable lookup, and log filesystem details.
- `src/errors.js` owns stable v1 error codes and JSON error payload conversion.

### Forbidden Implementation Drift

- Do not add GUI/TUI, MCP, agent skill, remote/cloud execution, daemon mode, plugins, marketplace, native installer packaging, destructive reset, DB reset, Docker reset, or multi-project orchestration in v1.
- Do not turn `tasks`, `doctor`, `ps`, `logs`, or default `clean` into hidden mutation commands.
- Do not treat `start` as a generic background runner for tasks that omit `longRunning: true`.
- Do not silently overwrite ancestor configs during `init`.
- Do not claim cross-platform-ready without Windows, macOS, and Linux smoke evidence.
- Do not add unstructured error messages where a stable domain code exists.

### Required Implementation References

- `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/spec.md`
- `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/contracts/launchdeck-config-v1.md`
- `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/contracts/cli-json-contract.md`
- `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/contracts/runtime-state-v1.md`
- `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/contracts/error-codes-v1.md`
- `F:/github/launchdeck/src/cli.js`, `F:/github/launchdeck/src/config.js`, `F:/github/launchdeck/src/runtime.js`, `F:/github/launchdeck/src/errors.js`

### Review Focus

- Check that command behavior still maps to the v1 contract rather than merely passing current prototype tests.
- Check that safety-critical path/process behavior has negative tests.
- Check that JSON and error outputs are parseable and stable for both success and failure.
- Check that cross-platform evidence is labeled honestly.

## Operational Consequence Design

| Obligation ID | State Machine / Ordering Decision | Concurrency And Idempotency | Recovery Path | Validation Evidence |
| --- | --- | --- | --- | --- |
| CA-001 | Clean flows through dry-run, safe, all-confirmed, refused, skipped states. Destructive cleanup is never implicit. | One clean invocation plans targets before deleting; missing targets are skipped. | Refused targets return classified errors before deletion. | Root/out-of-root/empty/symlink refusal tests; dry-run/no-delete test. |
| CA-002 | Managed processes move through running, stopped, stale, unknown, stop-failed states. | Duplicate starts refused unless restart is explicit. Stop is idempotent. | `ps`, `logs`, and `stop` preserve records for inspection. | Start/duplicate/exit/stale/stop tests plus OS smoke. |
| CA-003 | JSON commands return success, error, or partial envelopes. | Shared output helper avoids per-command drift. | Partial failures include item results and top-level `partial_failure`. | JSON parse tests for success/error/partial. |
| CA-004 | Config moves through no-config, configured, invalid, unsupported-version states. | Config read is stateless per invocation. | Unsupported/invalid config fails before side effects. | Config discovery and validation tests. |
| CA-005 | Runtime state/logs move through present, missing, corrupted, stale, missing-log states. | Refresh updates liveness without erasing records. | Corrupt state reports `runtime_state_invalid`; logs remain readable after exit. | State corruption, stale process, missing log tests. |
| CA-006 | Platform support is tracked as dev-ready, platform-ready, or cross-platform-ready. | Same smoke scenario must be repeatable per OS. | Claim is downgraded if one OS lacks evidence. | CI matrix or manual smoke artifacts for Windows/macOS/Linux. |
| CA-007 | Runtime adapters own platform execution states. | Adapter functions are the only OS-specific process/path stop boundary. | Adapter failure maps to classified error codes. | Unit tests using adapter seams plus live OS smoke. |
| CA-008 | Config schema stays v1-compatible. | New fields must be additive and ignored/validated intentionally. | Unsupported future version returns `unsupported_config_version`. | Contract tests with v1 and unsupported version. |
| CA-009 | Error vocabulary is a stable compatibility state. | Central error helper prevents unclassified command-specific strings. | `internal_error` triggers review for missing classification. | Error-code contract test coverage. |
| CA-010 | First-run flow orders inspection before risky action. | `init`, `doctor`, and `tasks` have no project command side effects. | User can inspect config/tasks before running or cleaning. | Quickstart smoke and no-runtime-write checks. |
| CA-011 | `doctor` reports ok, warn, error finding states. | Read-only; warnings do not fail by default. | Error findings guide repair through stable codes. | Doctor JSON and exit-code tests. |
| CA-012 | `tasks` exposes inventory state. | Read-only; no deep validation, process start, stop, or file deletion. | User sees type, risk, ports, command before execution. | No-runtime-write and JSON schema tests. |
| CA-013 | Execution chooses foreground or managed by `longRunning`. | Duplicate managed starts refused; foreground preserves child exit. | Restart reports partial failure if stop/start is incomplete. | Foreground exit-code and managed lifecycle tests. |
| CA-014 | Runtime commands handle running, stopped, stale, missing-log, stop-failed states. | Stop all aggregates per-task results. | Partial stop failures remain inspectable. | Stop all, stop missing, missing log, stop-failed adapter tests. |
| CA-015 | Clean handles dry-run, safe, all, refused states. | Confirmation required for risky deletion. | Refusal occurs before any deletion batch when plan is unsafe. | Clean contract tests and canonical containment tests. |
| CA-016 | Platform-sensitive path/shell/process/clean/log behavior is isolated. | Adapters are deterministic and injectable for tests. | OS-specific error maps to shared vocabulary. | Adapter coverage plus matrix smoke. |
| CA-017 | Release claims map to achieved verification level. | Claim generation is documentation/release-process controlled. | Fall back to dev-ready or platform-ready if evidence is incomplete. | Quickstart and release checklist evidence. |
| CA-018 | `init` handles no-config, existing-config, ancestor-config states. | No command execution; no silent overwrite. | `config_exists` explains target/ancestor distinction. | Init overwrite and ancestor tests. |
| CA-019 | Root selection is deterministic and visible. | Project root is discovered once and passed through command output. | JSON includes `projectRoot` and `configPath` where applicable. | Upward discovery and JSON root tests. |
| CA-020 | JSON/exit codes distinguish success, Launchdeck error, child exit, and partial. | Shared exit mapping avoids drift. | Child exits are preserved for foreground tasks. | CLI process tests for exit code 0, 1, child code, partial. |
| CA-021 | Error vocabulary distinguishes classified and internal states. | New public errors require contract update. | `internal_error` is rare and review-blocking. | Error contract scan and negative tests. |
| CA-022 | v1 boundary tracks current and deferred states. | Tasks must not add deferred surfaces. | Reopen spec if deferred scope is required. | Out-of-scope checklist in task generation/review. |

## Dispatch Compilation Hints

### Boundary Owner

- Leader-inline planning owns the design packet for this turn. Downstream `/sp.tasks` should split implementation by config/CLI/runtime/clean/contracts/tests rather than by speculative product surfaces.

### Required Packet References

- `spec.md`, `plan.md`, `data-model.md`, all files under `contracts/`, `quickstart.md`.
- Source references: `src/cli.js`, `src/config.js`, `src/runtime.js`, `src/errors.js`, `test/cli.test.js`, `test/config.test.js`.

### Packet Validation Gates

- `npm run check`
- `npm test`
- CLI smoke from `quickstart.md` on at least one OS before `dev-ready`.
- Same smoke on Windows, macOS, and Linux before `cross-platform-ready`.

### Task-Level Quality Floor

- Every command touched by implementation must have success, classified failure, JSON where applicable, and exit-code coverage.
- Safety-critical path/process behavior requires negative tests, not only happy-path smoke.

## Alignment Inputs

### Canonical References

- `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/spec.md`
- `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/alignment.md`
- `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/context.md`
- `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/references.md`
- `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/brainstorming/handoff-to-specify.json`

### Input Risks From Alignment

- Cross-platform process-tree stop behavior needs OS-specific proof.
- Symlink/junction cleanup containment needs implementation-level proof.
- Runtime pruning is deferred, so v1 must avoid accidental state deletion during inspection.
- Scan/template onboarding is deferred, so init must be intentionally simple and editable.

## Research Inputs

### Standard Stack

- Keep the current Node.js ESM CLI, `yaml`, and Node's built-in test runner. This keeps v1 focused on lifecycle semantics instead of packaging churn.

### Don't Hand-Roll

- Use Node standard library process/filesystem primitives for spawning, logs, and filesystem operations.
- Use Windows `taskkill` through an adapter for process-tree termination rather than inventing process tree discovery in v1.

### Common Pitfalls

- Detached/background child processes can escape parent lifecycle assumptions if state and stop behavior are not adapter-owned.
- String prefix path checks are not sufficient for cleanup safety; canonical containment is required where possible.
- Human-readable command output is not a contract substitute for JSON success/error/partial envelopes.

### Assumptions To Validate

- POSIX process-group termination is enough for v1 managed local tasks when spawned through the adapter.
- Windows `taskkill /T /F /PID` behavior is acceptable for managed process trees, but must be smoke-tested.
- GitHub Actions or equivalent CI can provide Windows, macOS, and Linux smoke evidence for `cross-platform-ready`.

### Environment / Dependency Notes

- Node.js `>=20` remains the minimum runtime.
- No new runtime dependency is required by the plan.
- CI matrix setup is a task-phase concern; plan only defines the required evidence.

## Constitution Check

*GATE: passed for planning.*

- Spec package is complete and user-confirmed for planning.
- Hard unknowns: 0.
- Open conflicts: 0.
- Planning writes are limited to plan artifacts.
- Source code, tests, dependency files, runtime output, and implementation changes are forbidden in this phase.

## Project Structure

### Documentation (this feature)

```text
F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── plan-contract.json
├── contracts/
│   ├── launchdeck-config-v1.md
│   ├── cli-json-contract.md
│   ├── runtime-state-v1.md
│   └── error-codes-v1.md
└── workflow-state.md
```

### Source Code (repository root)

```text
F:/github/launchdeck/
├── package.json
├── src/
│   ├── cli.js
│   ├── config.js
│   ├── errors.js
│   └── runtime.js
└── test/
    ├── cli.test.js
    └── config.test.js
```

**Structure Decision**: Keep the single-package CLI structure. Add internal adapter modules only when they clarify platform ownership; do not introduce a monorepo, daemon package, service, or integration package for v1.

## Phase Plan

### Phase 0: Research And Contract Lock

- Complete `research.md` with official Node, Microsoft, and GitHub references.
- Lock config, JSON, runtime state, and error-code contracts before implementation tasks.
- Confirm current code gaps against spec without editing source.

### Phase 1: Design Artifacts

- Complete `data-model.md`.
- Complete `contracts/launchdeck-config-v1.md`.
- Complete `contracts/cli-json-contract.md`.
- Complete `contracts/runtime-state-v1.md`.
- Complete `contracts/error-codes-v1.md`.
- Complete `quickstart.md`.
- Complete `plan-contract.json`.

### Phase 2: Recommended `/sp.tasks` Sequencing

1. Contract and error foundation: shared envelope, error vocabulary, exit mapping, command status.
2. Config/root/init/tasks/doctor: protocol validation, deterministic root, read-only inventory and findings.
3. Runtime/process management: foreground run, managed start/dev/restart, state/log refresh, idempotent stop, stale/unknown states, adapters.
4. Clean safety: canonical containment, dry-run/safe/all-confirmed behavior, refusal tests.
5. JSON compatibility and docs/examples: stable schemas and example outputs.
6. Verification matrix: local smoke, OS-specific smoke, release claim labeling.

## Decision Preservation Check

- CLI-first product direction -> Summary, Locked Planning Decisions, Forbidden Implementation Drift.
- Explicit config protocol -> Contracts, Technical Context, CA-004, CA-008.
- Read-only inspection before mutation -> Capability Preservation Plan, CA-010 to CA-012.
- Managed runtime recovery -> CA-002, CA-005, CA-013, CA-014, Runtime State Contract.
- Safe cleanup -> CA-001, CA-015, Clean contract in config/runtime docs.
- JSON/error compatibility -> CA-003, CA-009, CA-020, CA-021, CLI JSON Contract, Error Codes Contract.
- Cross-platform evidence -> CA-006, CA-016, CA-017, Quickstart.
- v1 boundary -> MP-003, CA-022, Forbidden Implementation Drift.

## Research Adoption Check

- Node `child_process.spawn` supports asynchronous child process creation and will remain the v1 execution primitive -> Runtime/process tasks and adapter boundary.
- Node filesystem APIs remain the v1 basis for logs, state, realpath, and cleanup -> Clean safety and runtime state contracts.
- Windows process-tree termination uses `taskkill` semantics through an adapter -> CA-002, CA-007, CA-016.
- GitHub-hosted runners can provide Ubuntu, Windows, and macOS evidence -> Verification plan and quickstart release claim levels.

## Complexity Tracking

No constitution violations are required by this plan.

## Next Command

`/sp.tasks`
