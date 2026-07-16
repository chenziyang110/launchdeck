# Implementation Plan: Launchdeck Global CLI Control Plane

**Branch**: `2026-07-08-launchdeck-global-cli-control-plane` | **Date**: 2026-07-08 | **Spec**: `F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md`
**Input**: Feature specification from `F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md`

## Summary

Build Launchdeck into a daemonless, user-scoped global CLI control plane for local software projects. The plan preserves the current CLI foundation while adding a versioned global registry, aliases, a global run index, file locks, event history, stronger process ownership proof, unified inspection, safe stop/restart behavior, and cross-platform validation. The first product surface remains CLI-only; future GUI, TUI, MCP, or daemon clients must consume the same state and contracts rather than introduce a second source of truth.

## Locked Planning Decisions

- The product is a universal CLI lifecycle control plane, not an agent-only skill and not a task-runner shortcut.
- Scope is user-scoped local project management. Whole-machine and multi-user registries are out of scope for this feature.
- The first implementation is daemonless. Long-running background service work is explicitly deferred.
- Launchdeck may stop or force-stop only Launchdeck-owned process trees with sufficient ownership evidence.
- Port/PID-only killing is forbidden. External process conflicts are inspectable but not killable by default.
- `clean` remains project hygiene. Destructive reset semantics stay out of scope.
- Existing commands such as `inspect-port` remain compatibility wrappers while `inspect` becomes the unified interface.
- JSON output must become stable and action-oriented without breaking existing tests abruptly.

## Must-Preserve Carry-Forward

| MP ID | Type | Planning Obligation | Plan Location | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- |
| MP-001 | goal | Preserve Global CLI Control Plane framing. | Summary, Architecture Invariants | If scope becomes plugin-first or agent-first. |
| MP-002 | scope | Preserve user-scoped registry and namespace. | Technical Context, Data Model | If machine-wide visibility is required. |
| MP-003 | decision | Preserve daemonless-first control plane. | Technical Context, Phase Plan | If an always-running service becomes mandatory. |
| MP-004 | capability | Preserve project add, scan, remove, repair, projects. | Capability Preservation Plan | If registry operations are moved to docs-only. |
| MP-005 | decision | Preserve one authoritative control-plane state. | Architecture Invariants | If a client introduces parallel truth. |
| MP-006 | scenario | Prevent duplicate starts and stale port failures. | Operational Consequence Design | If start bypasses run-index checks. |
| MP-007 | safety | Preserve stop/restart ownership proof. | Ownership model, CA-CP table | If kill-by-port or kill-by-PID is added. |
| MP-008 | non-goal | Preserve external-kill exclusion. | Forbidden Implementation Drift | If Launchdeck is asked to kill unmanaged listeners. |
| MP-009 | capability | Preserve status, ps, ports, conflicts. | Capability Preservation Plan | If global visibility is limited to current project. |
| MP-010 | contract | Preserve stable JSON, error codes, next actions. | Contracts, Output plan | If JSON becomes incidental CLI formatting. |
| MP-011 | safety | Preserve confirmation and force semantics. | CLI contract, CA-CP-014 | If force bypasses ownership proof. |
| MP-012 | capability | Preserve logs, events, JSONL streams. | Data Model, Contracts | If observability remains log-file-only. |
| MP-013 | decision | Preserve future-client reuse of CLI truth. | Architecture Invariants | If GUI/TUI/MCP requires separate storage. |
| MP-014 | capability | Preserve safe clean behavior. | Data Model, Quickstart | If clean expands into destructive reset. |
| MP-015 | safety | Preserve secret-safe logs/events. | Operational Consequence Design | If command/env values are emitted raw without redaction. |
| MP-016 | validation | Preserve official demo acceptance proof. | Quickstart, Phase 5 | If release lacks a runnable demo project. |
| MP-017 | validation | Preserve cross-platform lifecycle smoke claims. | Validation Strategy | If Windows/POSIX are not both exercised. |

## Capability Preservation Plan

| Capability Operation | Upstream Source | Selected Entry Point | Owning Surface | Required Implementation | Acceptance Proof | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- | --- | --- |
| Register project | spec FR-001 to FR-008 | `launchdeck project add [path] --alias <alias>` | CLI + registry store | Add/update registry entry with stable projectId, alias uniqueness, config path, root path, version. | CLI contract tests and quickstart. | If alias is omitted from v1. |
| Scan projects | spec FR-004 | `launchdeck project scan <dir>` | CLI + registry store | Bounded scan that skips generated/heavy dirs and registers valid `.launchdeck.yml` projects. | Integration test with fixture tree. | If it crawls unbounded filesystem. |
| Remove project | spec FR-007 | `launchdeck project remove <target>` | CLI + registry + run index | Refuse removal while Launchdeck-owned tasks are running. Removing never deletes project files. | Regression test for active owned task refusal. | If force removal is requested without a separate contract. |
| Repair project | spec FR-008 | `launchdeck project repair <target> --path/--config/--alias` | CLI + registry store | Update stale path/config/alias without changing project identity. | CLI contract test. | If repair silently creates duplicate identity. |
| Start managed task | spec FR-011 to FR-018 | `launchdeck start project:task` and `launchdeck dev project:task` | lifecycle orchestrator | Lock project/task, create transaction event, check run index, check declared ports, spawn with run metadata. | Duplicate-start and port-conflict tests. | If command directly spawns without run-index mutation. |
| Stop/restart managed task | spec FR-019 to FR-029 | `launchdeck stop`, `force-stop`, `restart` | lifecycle orchestrator + ownership proof | Stop only verified Launchdeck-owned process trees; restart is stop plus start under a transaction. | Ownership matrix tests. | If external port owner is stopped. |
| Inspect state | spec FR-030 to FR-039 | `launchdeck inspect <target>` | inspect service | Inspect project, task, pid, port, run, or conflict using registry, run index, runtime state, and OS observations. | JSON schema examples and CLI tests. | If `inspect-port` remains the only deep view. |
| Observe history | spec FR-040 to FR-044 | `logs`, `logs --follow`, `events`, JSONL | event/log store | Store structured events and stream tail/follow safely. | JSONL parser tests and quickstart. | If follow starts an uncontrolled watcher. |
| Clean safely | spec FR-045 to FR-050 | `launchdeck clean` | existing clean planner + registry context | Keep path containment checks and refusal semantics; add global status awareness where useful. | Clean safety tests. | If project roots or unknown files can be deleted. |

## Implementation Target Boundary

- **Current project root**: `F:/github/launchdeck`
- **Current project roles**:
  - `launchdeck`: CLI product implementation, tests, examples, docs.
  - `.specify/features/2026-07-08-launchdeck-global-cli-control-plane`: planning/spec artifacts only.
- **Target project root**: `F:/github/launchdeck`
- **Target paths/modules**:
  - Existing: `src/cli.js`, `src/global-runtime.js`, `src/runtime.js`, `src/config.js`, `src/output.js`, `src/errors.js`, `src/adapters/process.js`, `src/adapters/path.js`
  - Planned: `src/control-plane/state.js`, `src/control-plane/locks.js`, `src/control-plane/events.js`, `src/control-plane/runs.js`, `src/control-plane/ownership.js`, `src/control-plane/inspect.js`, `src/control-plane/actions.js`
  - Tests: `test/global-runtime.test.js`, `test/managed-cli.test.js`, `test/runtime-state.test.js`, `test/cli-contract.test.js`, plus focused control-plane unit tests.
- **Target evidence status**: Current implementation facts verified by live reads. Project cognition compass is usable with review and required minimal reads were performed.
- **Reference sources**: `spec.md`, `alignment.md`, `context.md`, `references.md`, `brainstorming/handoff-to-specify.json`, project memory learnings.
- **Cognition scope rule**: Current project cognition cannot prove another project's implementation facts.
- **Stop condition**: Stop and return to `sp-discussion` if daemon/service, GUI/TUI/MCP, external kill, destructive reset, or multi-user scope becomes base scope.

## Scenario Profile Inputs

### Active Profile

- Standard Delivery with Senior Consequence Gate.
- Source artifacts: `alignment.md`, `context.md`, `brainstorming/handoff-to-specify.json`.
- Routing reason: The feature touches running process state, file locks, process termination, ports, logs, and cross-platform filesystem behavior.

### Profile-Driven Implementation Constraints

- Every lifecycle mutation must define ordering, idempotency, failure recovery, and validation evidence.
- Stop/restart/force-stop must fail closed when ownership proof is incomplete.
- Cross-platform behavior must be validated on Windows and POSIX before release claims.
- Planning artifacts must hand task generation enough contract detail to avoid ad hoc CLI behavior.

## Technical Context

**Language/Version**: JavaScript ESM on Node.js `>=20`  
**Primary Dependencies**: Existing `yaml` package and Node standard library. Add dependencies only with explicit task justification.  
**Storage**: Versioned user-scoped files under `LAUNCHDECK_HOME`, plus project-local `.launchdeck/` runtime and logs for compatibility.  
**Testing**: `node --test`; static syntax check via `npm run check`; contract and integration tests with isolated `LAUNCHDECK_HOME`.  
**Target Platform**: Windows, macOS, Linux local developer machines.  
**Project Type**: CLI application.  
**Performance Goals**: Registry/status reads should remain fast for tens of projects and hundreds of runs; lifecycle mutations should hold locks only around state transitions, not for the whole child-process lifetime.  
**Constraints**: Daemonless first, no external kill by default, no destructive reset, no shell-specific assumptions for managed commands, no inline `node -e "setInterval"` demo fixtures.  
**Scale/Scope**: Single user controlling multiple local projects; no network service, database, or multi-user coordination.

## Technical Approach

### State Layout

Use a v2 user-scoped control-plane layout with migration from the current `projects.json` registry:

```text
LAUNCHDECK_HOME/
├── registry/
│   └── projects.json
├── runtime/
│   ├── runs.json
│   └── indexes/
├── locks/
│   ├── registry.lock
│   ├── project-<projectId>.lock
│   └── task-<projectId>-<task>.lock
├── events/
│   └── events.jsonl
└── logs/
    └── <projectId>/
```

Read paths must accept the current `LAUNCHDECK_HOME/projects.json` and write the new layout after safe registry mutation. Project-local `.launchdeck/runtime/state.json` remains supported as a compatibility source and is reconciled into the global run index.

### Module Boundaries

- `src/cli.js` remains the command router and presentation layer.
- `src/global-runtime.js` remains the compatibility facade for existing global commands, then delegates to control-plane modules.
- `src/runtime.js` remains project-local process/log/clean primitives.
- `src/control-plane/state.js` owns versioned reads, writes, migration, and atomic persistence.
- `src/control-plane/locks.js` owns lock acquisition, stale-lock recovery, wait timeouts, and lock error payloads.
- `src/control-plane/events.js` owns transaction ids, event append, retention hooks, redaction, and JSONL streaming.
- `src/control-plane/runs.js` owns the global run index and reconciliation with project-local state.
- `src/control-plane/ownership.js` owns process ownership evidence and confidence states.
- `src/control-plane/inspect.js` owns unified status, ps, ports, conflicts, inspect, and next actions.
- `src/control-plane/actions.js` owns lifecycle mutations: project add/remove/repair, start, stop, restart, reconcile.

### Ownership Model

Managed starts inject non-secret metadata into child environments:

- `LAUNCHDECK_PROJECT_ID`
- `LAUNCHDECK_TASK`
- `LAUNCHDECK_RUN_ID`
- `LAUNCHDECK_HOME`

The run index records root PID, process group behavior, command, cwd, createdAt, spawnedAt, declared ports, log path, transaction id, and ownership proof fields. Stop/restart decisions classify a target as:

- `verified-owned`: run id and project/task identity match, PID is alive, command/cwd or process tree evidence is consistent, and declared port listeners do not contradict ownership.
- `probable-owned`: Launchdeck state matches but OS evidence is partial. It can be shown and reconciled but not force-stopped by default.
- `stale-owned`: Launchdeck state points to a dead or replaced process. It should be reconciled, not killed.
- `external`: listener or PID is not Launchdeck-owned. It can be inspected but not killed.
- `unknown`: evidence is insufficient. Fail closed.

### Lifecycle Transaction Order

`start`:

1. Resolve project alias/id/path and task.
2. Acquire registry/project/task locks.
3. Emit `start.requested` with transaction id.
4. Reconcile existing run state for that project/task.
5. Refuse duplicate running or starting run.
6. Inspect declared ports and refuse external conflicts.
7. Spawn child with run metadata.
8. Persist `starting` run and project-local state.
9. Run readiness check and transition to `ready`, `running`, or `failed`.
10. Emit terminal event and release locks.

`stop` and `force-stop`:

1. Resolve target and acquire project/task locks.
2. Reconcile run state.
3. Prove ownership.
4. Refuse external, unknown, probable, or stale targets unless the command is a future explicitly contracted repair/reconcile path.
5. Stop process tree using existing adapter primitives.
6. Persist stopped or stop_failed run state.
7. Emit event with next actions.

`restart` is one transaction that performs ownership-proven stop, waits for declared port release, then starts under the same target locks.

## Implementation Constitution

### Architecture Invariants

- The user-scoped control-plane store is the single authoritative global truth.
- Project-local runtime state remains a compatibility and recovery source, not the global source of truth.
- CLI JSON, logs, and future clients must consume the same contracts and state.
- Process termination must go through ownership proof.
- All state mutations must be versioned, lock-protected, evented, and recoverable.

### Boundary Ownership

- `src/control-plane/*` owns global lifecycle state and mutation rules.
- `src/runtime.js` owns project-local process primitives and clean path planning.
- `src/adapters/process.js` owns platform-specific process and port observations.
- `src/output.js` owns stable JSON envelopes and human-output helpers.
- `src/errors.js` owns public error codes and structured remediation fields.

### Forbidden Implementation Drift

- Do not add an always-running daemon, service, GUI, TUI, MCP server, or editor integration in this feature.
- Do not implement kill-by-port or kill-by-PID for unmanaged processes.
- Do not bypass locks for start/stop/restart/project remove.
- Do not let `project remove` delete project files or remove a project with running owned tasks.
- Do not hide incompatible state versions by silently ignoring them.
- Do not create a second registry format for future clients.

### Required Implementation References

- `F:/github/launchdeck/src/global-runtime.js`
- `F:/github/launchdeck/src/runtime.js`
- `F:/github/launchdeck/src/cli.js`
- `F:/github/launchdeck/src/adapters/process.js`
- `F:/github/launchdeck/src/adapters/path.js`
- `F:/github/launchdeck/test/global-runtime.test.js`
- `F:/github/launchdeck/.specify/memory/learnings/windows-node-managed-test-eperm.md`
- `F:/github/launchdeck/.specify/memory/learnings/launchdeck-git-root-closeout-scope.md`

### Review Focus

- Verify every lifecycle mutation has a lock, event, state write, failure state, and test.
- Verify every stop path proves Launchdeck ownership before terminating.
- Verify JSON output remains parseable and includes next actions for blocked states.
- Verify Windows tests use fixture scripts and tolerate transient temp cleanup EPERM only through the documented rerun policy.

## Operational Consequence Design

| Obligation ID | State Machine / Ordering Decision | Concurrency And Idempotency | Recovery Path | Validation Evidence |
| --- | --- | --- | --- | --- |
| CA-CP-001 | Registry writes move through read, validate, lock, atomic write, event. | Registry lock serializes mutation. | Invalid registry fails closed with repair guidance. | Registry migration/add/remove tests. |
| CA-CP-002 | Project identity is stable projectId plus unique alias. | Alias uniqueness checked under registry lock. | Repair command updates stale path/config/alias. | Alias collision tests. |
| CA-CP-003 | Project remove checks run index before deletion. | Registry and project locks prevent race with start. | Return next actions: stop or inspect active tasks. | Active remove refusal test. |
| CA-CP-004 | Start has `requested -> starting -> ready/running/failed`. | Task lock prevents duplicate starts. | Failed start records event and run state. | Duplicate-start tests. |
| CA-CP-005 | Declared port inspection happens before spawn and after readiness. | Task lock plus port observation prevents same-task duplicate. | Conflict returns inspect commands, never kills. | External conflict tests. |
| CA-CP-006 | Stop has `requested -> stopping -> stopped/stop_failed`. | Task lock serializes stop/restart. | `stop_failed` keeps evidence and next actions. | Stop failure fixture test. |
| CA-CP-007 | Force-stop still requires verified ownership. | Same task lock and proof gate as stop. | Refuse with ownership evidence payload. | Force-owned matrix tests. |
| CA-CP-008 | Restart is a single transaction. | Holds task lock across stop, port wait, start. | If stop succeeds and start fails, state is explicit. | Restart lifecycle tests. |
| CA-CP-009 | Readiness is distinct from process alive. | Status reads do not mutate except explicit reconcile. | `reconcile` repairs stale transitions. | Ready vs running tests. |
| CA-CP-010 | Logs/events are append-only operational evidence. | Event writes are atomic append operations. | Corrupt event lines are reported and skipped with warnings. | JSONL stream tests. |
| CA-CP-011 | Inspect combines registry, run index, runtime, and OS observations. | Inspect is read-only by default. | Next actions point to stop, reconcile, repair, or inspect. | Inspect payload tests. |
| CA-CP-012 | Locks carry owner pid, command, cwd, createdAt, expiresAt. | `wx` file create and bounded wait. | Stale lock recovery only after conservative proof. | Lock contention tests. |
| CA-CP-013 | State versions are explicit. | Writers emit current version only. | Unsupported newer state fails closed. | Version compatibility tests. |
| CA-CP-014 | Non-interactive commands never prompt. | Flags select force/confirm behavior explicitly. | Return actionable error with required flag. | Non-interactive CLI tests. |
| CA-CP-015 | Clean never deletes outside project root. | Existing path adapter containment remains authoritative. | Unsafe targets are blocked with reason. | Clean safety regression tests. |
| CA-CP-016 | Secret-bearing fields are redacted in events/output. | Redaction applied before persistence. | Raw logs remain user-owned files; events store metadata only. | Redaction tests. |
| CA-CP-017 | Cross-platform process observation is best-effort but fail-closed. | Ownership confidence tracks partial evidence. | Unknown evidence blocks stop and recommends inspect. | Windows/POSIX smoke. |
| CA-CP-018 | Compatibility wrappers remain available. | `inspect-port` delegates to `inspect port:<port>`. | Deprecated wording may be documented, not removed. | Compatibility tests. |
| CA-CP-019 | JSON envelope is stable and versioned. | `output.js` centralizes envelope creation. | Compatibility period mirrors legacy top-level fields. | CLI JSON contract tests. |
| CA-CP-020 | Release claims require runnable demo and docs. | Demo uses normal CLI and fixtures. | Missing demo blocks release checklist. | Quickstart smoke. |

## Dispatch Compilation Hints

### Boundary Owner

- Control-plane lifecycle: `src/control-plane/actions.js`
- State and migration: `src/control-plane/state.js`
- Ownership proof: `src/control-plane/ownership.js` plus `src/adapters/process.js`
- CLI contract and output: `src/cli.js`, `src/output.js`, `src/errors.js`

### Required Packet References

- `F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md`
- `F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json`
- `F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md`
- `F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md`

### Packet Validation Gates

- `npm run check`
- `npm test`
- Focused tests for the touched surface before claiming completion.

### Task-Level Quality Floor

- Every task that changes lifecycle behavior must add or update a test for success, refusal, and failure/recovery where applicable.
- Every new error state must include JSON contract fields and human-readable next actions.

## Alignment Inputs

### Canonical References

- `spec.md`: authoritative user requirements.
- `alignment.md`: source signal disposition and user-confirmed scope.
- `context.md`: verified current implementation facts and affected object map.
- `brainstorming/handoff-to-specify.json`: MP/CA obligations and stop/reopen conditions.

### Input Risks From Alignment

- The current code already has partial global features; implementation must evolve them instead of creating parallel commands.
- The current project is inside a broader `F:/github` git root; closeout and file reporting must stay scoped to `F:/github/launchdeck`.
- Cross-platform ownership proof has unavoidable observation differences; the plan contains this with confidence states and fail-closed stop behavior.

## Research Inputs

### Standard Stack

- Node ESM, existing `yaml`, Node standard filesystem and child-process APIs.
- Repository patterns already cover CLI routing, process adapters, path safety, config parsing, JSON output, and isolated `LAUNCHDECK_HOME` tests.

### Don't Hand-Roll

- Reuse existing path containment and process adapter primitives.
- Reuse Node file primitives for atomic write and exclusive lock-file creation instead of adding a daemon or database in this feature.

### Common Pitfalls

- Treating PID or port listener as ownership is unsafe.
- Holding locks while child processes run would freeze the whole control plane.
- Ignoring stale project-local state makes duplicate starts and port conflicts harder to explain.
- Adding global output fields outside `output.js` will fragment the JSON contract.

### Assumptions To Validate

- Cross-platform process start-time, cwd, and command evidence availability varies. Tasks must probe adapter behavior and keep stop decisions fail-closed when evidence is partial.
- Event retention defaults are not product-critical for v1; implement a bounded policy with explicit config-free defaults and document it.
- State layout migration from `projects.json` to `registry/projects.json` must be tested before flipping writers.

### Environment / Dependency Notes

- Tests must use fixture scripts instead of inline `node -e "setInterval"` commands.
- On Windows, a transient temp cleanup EPERM in managed-process tests should be rerun once before treating it as a product failure, per project memory.

## Constitution Check

- **Scope passed**: CLI-only, daemonless, user-scoped.
- **Safety passed**: stop/restart/force-stop are ownership-gated and fail closed.
- **State passed**: versioned files, locks, events, and recovery paths are defined.
- **Compatibility passed**: existing global commands remain and delegate into unified contracts.
- **Validation passed**: test and quickstart gates cover state, lifecycle, ownership, output, and cross-platform smoke.

## Project Structure

### Documentation (this feature)

```text
.specify/features/2026-07-08-launchdeck-global-cli-control-plane/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── plan-contract.json
├── contracts/
│   └── cli-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── cli.js
├── config.js
├── errors.js
├── global-runtime.js
├── output.js
├── runtime.js
├── adapters/
│   ├── path.js
│   └── process.js
└── control-plane/
    ├── actions.js
    ├── events.js
    ├── inspect.js
    ├── locks.js
    ├── ownership.js
    ├── runs.js
    └── state.js

test/
├── cli-contract.test.js
├── global-runtime.test.js
├── managed-cli.test.js
├── runtime-state.test.js
├── control-plane-state.test.js
├── control-plane-locks.test.js
├── control-plane-ownership.test.js
└── helpers/
```

**Structure Decision**: Add a small `src/control-plane/` layer for global state orchestration while preserving existing CLI, runtime, adapter, and output modules as integration boundaries.

## Phase Plan

1. **State foundation**: add versioned state store, v1-to-v2 registry migration, atomic writes, locks, events, and JSON envelope helpers.
2. **Registry identity**: add aliases, repair, remove-active refusal, registry status errors, and compatibility wrappers.
3. **Run lifecycle**: add run index, transaction ids, start/stop/restart state machines, duplicate-start prevention, and readiness transitions.
4. **Ownership and inspection**: add ownership proof, confidence states, unified inspect, improved status/ps/ports/conflicts, and next actions.
5. **Observability and hygiene**: add events, JSONL streams, `logs --follow`, clean confirmation semantics, redaction, and retention.
6. **Demo and release evidence**: add official demo project, docs, quickstart smoke, Windows/POSIX smoke, and release checklist.

## Validation Strategy

- `npm run check` after each implementation slice touching JavaScript.
- `npm test` before completion and after any lifecycle/ownership changes.
- Focused tests:
  - registry migration and alias collision
  - lock contention and stale lock recovery
  - duplicate start prevention
  - external port conflict refusal
  - ownership confidence matrix
  - project remove active owned refusal
  - inspect target matrix
  - JSON envelope compatibility
  - JSONL events/log follow parsing
  - clean path containment
- Cross-platform smoke:
  - Windows: start, duplicate start, status, inspect port, restart, stop, clean safe, project remove.
  - POSIX: same command set, plus process-group stop behavior.

## Decision Preservation Check

- Global CLI control plane -> Summary, Technical Approach, Architecture Invariants.
- Daemonless first -> Technical Context, Forbidden Implementation Drift, Phase Plan.
- User-scoped single truth -> State Layout, Data Model, Operational Consequence Design.
- Safe owned-only stop -> Ownership Model, CA-CP-006/007/017, CLI contract.
- Stable JSON and next actions -> Contracts, `output.js` ownership, CA-CP-019.
- Demo and cross-platform proof -> Quickstart, Validation Strategy, CA-CP-020.

## Research Adoption Check

- Current implementation already has partial global registry and port inspection -> plan evolves `src/global-runtime.js` rather than replacing it wholesale.
- Current project-local runtime state exists -> plan treats it as compatibility/recovery source.
- Existing path adapter is safer than ad hoc clean checks -> plan keeps it authoritative.
- Windows managed-process EPERM learning -> plan encodes fixture and rerun constraints.

## Complexity Tracking

| Complexity | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| `src/control-plane/` module group | Lifecycle state, locks, events, ownership, and inspection need independent tests and contracts. | Keeping everything in `src/cli.js` or `src/global-runtime.js` would make ownership and recovery paths difficult to verify. |
| Versioned global state layout | Current registry-only state cannot represent aliases, run index, locks, and events cleanly. | Extending a single `projects.json` forever would blur registry and runtime responsibilities. |
| Ownership confidence states | Cross-platform process evidence is partial and safety-critical. | Boolean owned/not-owned would either overkill external processes or block useful diagnostics. |
