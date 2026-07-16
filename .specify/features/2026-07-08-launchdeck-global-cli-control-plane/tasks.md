# Tasks: Launchdeck Global CLI Control Plane

**Input**: Design documents from `F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/`
**Prerequisites**: plan.md, spec.md, alignment.md, context.md, research.md, data-model.md, contracts/cli-contract.md, quickstart.md, plan-contract.json
**Tests**: Required by default for this feature because it changes persistence, lifecycle execution, process termination, JSON contracts, and user-visible CLI behavior.
**Organization**: Tasks are grouped by scenario-derived user story. The spec uses scenario priority rather than explicit US labels; this package maps them to US1-US5 in scenario order.

## Planning Inputs

- **Locked decisions**: CLI-only control plane, daemonless first, user-scoped state, owned-only stop/restart, no kill-by-port/PID, safe clean only, stable JSON/JSONL contracts, future clients reuse the same truth.
- **Active profile**: Standard Delivery with Senior Consequence Gate.
- **Cognition advisory**: project-cognition readiness was `review`, freshness `partial_refresh`, baseline `greenfield_empty`; task generation continues with live evidence and plan artifacts.
- **Execution model**: adaptive; execution_mode standard; workflow_status ready; dispatch_shape leader-inline; execution_surface leader-inline; capability_degraded false; delegated_task_generation_lanes none.
- **Implementation constitution**: extend existing CLI/runtime/adapter boundaries; add `src/control-plane/` only for global orchestration; keep path adapter and process adapter authoritative for platform/path safety.
- **Validation references**: `npm run check`, `npm test`, focused `node --test ...`, and `quickstart.md` release smoke.

## Implementation Target Boundary

- **Target root**: `F:/github/launchdeck`
- **Target-relative paths**: `src/`, `test/`, `examples/demo-api/`, `scripts/`, `docs/`, `README.md`, `package.json`, feature-local `implementation-review/` artifacts.
- **Evidence status**: target is current repository; live reads confirmed existing CLI/runtime/global-runtime/process/path/output/error/test surfaces.
- **Boundary constraints**: no daemon/service/GUI/TUI/MCP/editor; no external process kill; no destructive reset; no source/test edits before `/sp.implement`.
- **Reference-only paths**: spec/plan/data/contracts/quickstart are planning inputs; sibling directories under `F:/github` are ignored.

## Task-Generation Evidence Index

- `task-generation/evidence-index.json`: generated with no delegated lanes; all decisions came from leader-inline synthesis of approved artifacts and live reads.
- `task-generation/checkpoints.ndjson`: generated with a leader-inline synthesis checkpoint.
- `task-generation/handoffs/`: no lane handoffs were delegated.

## Task Guardrail Index

| Guardrail | Rule | Task IDs |
| --- | --- | --- |
| G-BOUNDARY | Extend existing CLI/runtime/adapter modules and add src/control-plane only for global orchestration. | T001,T007,T008,T009,T010,T014,T015,T016,T019,T020,T023,T024,T027,T028,T031 |
| G-NO-DAEMON | Do not add daemon/service/GUI/TUI/MCP in this feature. | T001,T008,T015,T028,T034 |
| G-OWNED-ONLY | Stop/restart/force-stop require verified Launchdeck ownership; port/PID alone is insufficient. | T018,T019,T022,T023,T024,T025 |
| G-STATE-VERSION | State files are versioned; newer versions fail closed for dangerous mutations. | T003,T007,T010,T011 |
| G-CLEAN-SAFE | Clean is hygiene only and never reset/delete roots/kill processes. | T030,T031,T032 |
| G-JSON | JSON envelope, error codes, next actions, JSONL streams are compatibility surfaces. | T005,T006,T009,T010,T020,T024,T028 |
| G-REDACT | Events/output/log metadata must avoid secret leakage. | T005,T009,T026,T028,T031 |
| G-DEMO | Demo and tests use checked-in fixture scripts, not inline node -e long-running processes. | T002,T033,T035,T037 |
| G-CROSS | Cross-platform-ready claims require Windows/macOS/Linux lifecycle smoke evidence. | T035,T037,T038 |

## Capability Operation Coverage

| Operation | Upstream Source | Selected Entry Point | Task IDs / Packet Fields | Validation | Degradation Check |
| --- | --- | --- | --- | --- | --- |
| Register project | spec FR-001..FR-008 | launchdeck project add/scan/remove/repair/projects | T012,T014,T017 | node --test test/global-runtime.test.js | Executable CLI tasks, not template-only |
| Start managed task | spec FR-009..FR-017 | launchdeck start/dev | T013,T015,T017 | node --test test/managed-cli.test.js | Run index and duplicate prevention tasked |
| Inspect state/conflicts | spec FR-026..FR-033 | launchdeck inspect + inspect-port | T018,T019,T020,T021 | node --test test/inspect-cli.test.js | Unified inspect plus wrapper preserved |
| Stop/restart owned task | spec FR-018..FR-025 | launchdeck stop/force-stop/restart | T022,T023,T024,T025 | node --test test/lifecycle-ownership.test.js | Owned-only gate tasked |
| Observe logs/events | spec FR-034..FR-039 | launchdeck logs/events | T026,T028,T029 | node --test test/recovery-observability.test.js | JSONL stream tasked |
| Reconcile stale state | spec FR-044 | launchdeck reconcile | T026,T027,T029 | node --test test/recovery-observability.test.js | No-kill recovery tasked |
| Clean safely | spec FR-040..FR-043 | launchdeck clean --safe | T030,T031,T032 | node --test test/clean-control-plane.test.js | Reset remains excluded |
| Official demo/release proof | spec FR-053..FR-056 | examples/demo-api + smoke script | T033,T034,T035,T036,T037,T038 | node scripts/smoke-lifecycle.js --quickstart | Checked-in scripts, no inline node -e |

## User-Observable Path Coverage

| Feature / Surface | Real Entry Point | Producer Data | Transformer / State Builder | Consumer Surface | Executor / Boundary | Task IDs / Packet Fields | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Project registry commands | launchdeck project add/scan/remove/repair/projects | .launchdeck.yml + registry state | src/control-plane/state.js + actions.js | CLI JSON/human output | src/cli.js | T012,T014,T017 | node --test test/global-runtime.test.js |
| Managed start and global status | launchdeck start/dev/status/ps/ports | TaskDefinition + RunIndexState | src/control-plane/runs.js + inspect.js | CLI lifecycle/status output | src/runtime.js + adapters/process.js | T013,T015,T016,T017 | node --test test/managed-cli.test.js test/global-runtime.test.js |
| Unified inspect and conflicts | launchdeck inspect / inspect-port / conflicts | RunIndexState + OS listeners | src/control-plane/ownership.js + inspect.js | CLI inspect output | src/adapters/process.js | T018,T019,T020,T021 | node --test test/inspect-cli.test.js |
| Owned stop/restart | launchdeck stop/force-stop/restart | ManagedRun + OwnershipProof | src/control-plane/actions.js | CLI lifecycle output | src/runtime.js + process adapter | T022,T023,T024,T025 | node --test test/lifecycle-ownership.test.js |
| Recovery and observability | launchdeck reconcile/logs/events | RunIndexState + EventRecord + logs | src/control-plane/runs.js + events.js | CLI JSON/JSONL output | src/runtime.js | T026,T027,T028,T029 | node --test test/recovery-observability.test.js |
| Safe clean | launchdeck clean --safe | clean config + runtime evidence | src/runtime.js + path adapter | CLI clean output | src/adapters/path.js | T030,T031,T032 | node --test test/clean-control-plane.test.js |
| Demo and release smoke | examples/demo-api + scripts/smoke-lifecycle.js | demo config + smoke script | scripts/smoke-lifecycle.js | terminal smoke output | node src/cli.js | T033,T035,T037 | node scripts/smoke-lifecycle.js --quickstart |

## Consequence Obligation Mapping

| Obligation ID | Task IDs | Affected State / Dependency | Required References | Validation | Stop And Reopen |
| --- | --- | --- | --- | --- | --- |
| CA-CP-001 | T003,T007,T011,T012,T014 | Registry writes, migration, atomic state | plan.md#operational-consequence-design | registry migration/add/remove tests | Unsupported registry mutation or missing atomic write routes back to /sp.plan |
| CA-CP-002 | T003,T007,T012,T014 | Project identity and alias uniqueness | data-model.md#entity-projectregistration | alias collision tests | If projectId/alias identity cannot be made stable |
| CA-CP-003 | T012,T014,T017 | Active remove refusal | contracts/cli-contract.md#project-commands | active owned remove refusal test | If removal must delete files or force-remove running tasks |
| CA-CP-004 | T013,T015,T017 | Start state machine | plan.md#lifecycle-transaction-order | duplicate-start tests | If starting state cannot be recorded before concurrent spawn risk |
| CA-CP-005 | T013,T015,T018,T019,T021 | Port preflight and conflict refusal | data-model.md#entity-portobservation | external conflict tests | If external conflict requires kill behavior |
| CA-CP-006 | T022,T023,T024,T025 | Stop state machine | contracts/cli-contract.md#lifecycle-commands | stop failure fixture test | If stop cannot preserve stop_failed evidence |
| CA-CP-007 | T022,T023,T024,T025 | Force-stop ownership gate | plan.md#ownership-model | force-owned matrix tests | If force-stop needs to target unverified owners |
| CA-CP-008 | T022,T023,T025 | Restart transaction | plan.md#lifecycle-transaction-order | restart tests | If restart cannot be serialized safely |
| CA-CP-009 | T013,T015,T026,T027,T029 | Ready vs running and reconcile | data-model.md#entity-managedrun | ready/stale tests | If readiness collapses into PID alive only |
| CA-CP-010 | T005,T009,T026,T028,T029 | Append-only events | data-model.md#entity-eventrecord | JSONL stream tests | If events need mutable database/daemon |
| CA-CP-011 | T016,T018,T019,T020,T021 | Unified inspect | contracts/cli-contract.md#inspect-commands | inspect payload tests | If inspect mutates lifecycle state |
| CA-CP-012 | T004,T008,T011 | Lock metadata and stale recovery | data-model.md#entity-lockrecord | lock contention tests | If stale lock takeover cannot be proven safely |
| CA-CP-013 | T003,T007,T015 | State versions fail closed | data-model.md#storage-namespaces | version compatibility tests | If newer state must be mutated blindly |
| CA-CP-014 | T006,T010,T024 | Non-interactive no prompts | contracts/cli-contract.md#contract-rules | CLI contract tests | If command requires prompt in automation mode |
| CA-CP-015 | T030,T031,T032 | Clean path safety | contracts/cli-contract.md#clean-commands | clean safety tests | If clean expands into reset |
| CA-CP-016 | T005,T009,T026,T028,T029,T031 | Redaction | research.md#r8-evolve-json-output-centrally | redaction tests | If events/log metadata requires secrets |
| CA-CP-017 | T018,T019,T021,T022,T023,T025,T035 | Cross-platform fail-closed ownership | research.md#r5-treat-ownership-as-evidence-not-a-boolean | ownership matrix + smoke | If platform evidence cannot support safe stop |
| CA-CP-018 | T016,T020,T021 | inspect-port compatibility | contracts/cli-contract.md#launchdeck-inspect-port-port---json | compatibility tests | If wrapper must be removed |
| CA-CP-019 | T006,T010,T016,T020,T024,T028 | Stable JSON envelope | contracts/cli-contract.md#json-envelope | JSON contract tests | If legacy compatibility cannot be maintained |
| CA-CP-020 | T033,T034,T035,T036,T037,T038 | Demo/docs/cross-platform proof | quickstart.md#release-smoke-checklist | quickstart smoke | If release lacks demo or smoke evidence |

## Analyze Remediation Mapping

| Finding ID | Disposition | Task/Section Evidence | Notes |
| --- | --- | --- | --- |
| No prior analyze blockers | not_applicable | First task-generation pass | No remediation mapping required |

## Tasks

### Phase 0: Implementation Guardrails

**Purpose**: Freeze architecture constraints, safety invariants, and embedded review expectations before implementation.

- [X] T001 Record implementation guardrail and embedded review baseline in .specify/features/2026-07-08-launchdeck-global-cli-control-plane/implementation-review/ledger.json

#### T001 Contract

| Field | Value |
| --- | --- |
| agent | quality-reviewer |
| depends_on | none |
| parallel_safe | false |
| packet | task-packets/T001.json |
| write_scope | .specify/features/2026-07-08-launchdeck-global-cli-control-plane/implementation-review/ledger.json |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | implementation-review/ledger.json (new) |
| anti_goals | Do not edit Launchdeck source or tests in this guardrail task. |
| does_not_remove | Specification-first flow, embedded implement review |
| capability_operations | preserves all CLI lifecycle operations without implementing them |
| acceptance_criteria | Ledger records Standard Delivery profile, Senior Consequence Gate, no daemon, no external kill, owned-only stop, JSON contract, and review window policy. |
| verify_commands | Test-Path .specify/features/2026-07-08-launchdeck-global-cli-control-plane/implementation-review/ledger.json |
| MP | MP-001, MP-003, MP-005, MP-007, MP-011, MP-013 |
| CA | CA-CP-017 |
| FR | FR-019, FR-020, FR-021 |

---

### Phase 1: Setup

**Purpose**: Create reusable test fixtures and keep long-running demos in checked-in scripts.

- [X] T002 Create reusable control-plane test fixture helpers in test/helpers/control-plane-fixture.js
- [X] T003 [P] Add state store and registry migration failing tests in test/control-plane-state.test.js
- [X] T004 [P] Add lock and transaction failing tests in test/control-plane-locks.test.js
- [X] T005 [P] Add event store and redaction failing tests in test/control-plane-events.test.js
- [X] T006 [P] Add JSON envelope and error-code contract failing tests in test/cli-control-plane-contract.test.js

#### T002 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | none |
| parallel_safe | false |
| packet | task-packets/T002.json |
| write_scope | test/helpers/control-plane-fixture.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | test/helpers/control-plane-fixture.js (new) |
| anti_goals | Do not use inline node -e long-running fixtures., Do not start real services outside isolated temp directories. |
| does_not_remove | Existing test/helpers/cli-fixture.js behavior |
| capability_operations | supports demo/test lifecycle validation |
| acceptance_criteria | Helper creates isolated LAUNCHDECK_HOME, temp project roots, fixture server scripts, and JSON CLI runner utilities., Helper avoids inline node -e long-running process patterns. |
| verify_commands | node --check test/helpers/control-plane-fixture.js |
| MP | MP-016 |
| CA | CA-CP-020 |
| FR | FR-053, FR-056 |

#### T003 Contract

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T002: fixture helpers |
| parallel_safe | true |
| packet | task-packets/T003.json |
| write_scope | test/control-plane-state.test.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | test/control-plane-state.test.js (new) |
| anti_goals | Do not implement state store in this test task. |
| does_not_remove | Legacy LAUNCHDECK_HOME/projects.json compatibility |
| capability_operations | validates project add, projects, state migration, version fail-closed |
| acceptance_criteria | Tests cover v2 registry/projects.json creation, legacy projects.json read, alias uniqueness, unsupported newer version dangerous-mutation refusal, and repairable project path/config metadata. |
| verify_commands | node --test test/control-plane-state.test.js |
| MP | MP-002, MP-004, MP-014 |
| CA | CA-CP-001, CA-CP-002, CA-CP-013 |
| FR | FR-001, FR-002, FR-003, FR-004, FR-051, FR-052 |

#### T004 Contract

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T002: fixture helpers |
| parallel_safe | true |
| packet | task-packets/T004.json |
| write_scope | test/control-plane-locks.test.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | test/control-plane-locks.test.js (new) |
| anti_goals | Do not implement lock acquisition in this test task. |
| does_not_remove | Daemonless file-backed coordination |
| capability_operations | validates registry/project/task locks and stale lock recovery |
| acceptance_criteria | Tests cover exclusive lock creation, owner metadata, bounded wait timeout, stale-lock refusal/takeover rules, and lock release cleanup. |
| verify_commands | node --test test/control-plane-locks.test.js |
| MP | MP-003, MP-005 |
| CA | CA-CP-010, CA-CP-012 |
| FR | FR-010, FR-011, FR-012, FR-015, FR-050 |

#### T005 Contract

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T002: fixture helpers |
| parallel_safe | true |
| packet | task-packets/T005.json |
| write_scope | test/control-plane-events.test.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | test/control-plane-events.test.js (new) |
| anti_goals | Do not implement event persistence in this test task. |
| does_not_remove | Append-only JSONL event contract |
| capability_operations | validates events command inputs and JSONL event records |
| acceptance_criteria | Tests cover append-only JSON Lines, transaction ids, redacted data, corrupt-line tolerant reads, and next action preservation. |
| verify_commands | node --test test/control-plane-events.test.js |
| MP | MP-012, MP-015 |
| CA | CA-CP-010, CA-CP-016 |
| FR | FR-013, FR-035, FR-036, FR-039, FR-048 |

#### T006 Contract

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T002: fixture helpers |
| parallel_safe | true |
| packet | task-packets/T006.json |
| write_scope | test/cli-control-plane-contract.test.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | test/cli-control-plane-contract.test.js (new) |
| anti_goals | Do not change src/output.js or src/errors.js in this test task. |
| does_not_remove | Existing legacy top-level JSON payload compatibility |
| capability_operations | validates stable JSON envelope, next actions, error codes, non-interactive refusals |
| acceptance_criteria | Tests cover schemaVersion, data, next, stable domain error codes, mirrored legacy fields, and non-interactive no-prompt behavior. |
| verify_commands | node --test test/cli-control-plane-contract.test.js |
| MP | MP-012, MP-014 |
| CA | CA-CP-014, CA-CP-019 |
| FR | FR-045, FR-046, FR-047, FR-049, FR-052 |

---

### Phase 2: Foundational

**Purpose**: Blocking control-plane primitives: state, locks, events, JSON/error contracts.

- [X] T007 [P] Implement versioned control-plane state store in src/control-plane/state.js
- [X] T008 [P] Implement daemonless lock manager in src/control-plane/locks.js
- [X] T009 [P] Implement append-only event store in src/control-plane/events.js
- [X] T010 [P] Implement stable envelope and domain errors in src/output.js and src/errors.js
- [X] T011 Join foundational modules and syntax checks in package.json and src/control-plane imports

#### T007 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T003: state tests |
| parallel_safe | true |
| packet | task-packets/T007.json |
| write_scope | src/control-plane/state.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/control-plane/state.js (new) |
| anti_goals | Do not change CLI routing in this task., Do not delete legacy projects.json. |
| does_not_remove | Legacy registry read compatibility, current project-local runtime compatibility |
| capability_operations | implements registry storage migration and state version checks |
| acceptance_criteria | State store reads legacy and v2 registry, writes v2 layout atomically, validates versions, exposes project/runs/events path helpers, and returns structured version errors. |
| verify_commands | node --check src/control-plane/state.js, node --test test/control-plane-state.test.js |
| MP | MP-002, MP-004, MP-014 |
| CA | CA-CP-001, CA-CP-002, CA-CP-013 |
| FR | FR-001, FR-004, FR-051, FR-052 |

#### T008 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T004: lock tests |
| parallel_safe | true |
| packet | task-packets/T008.json |
| write_scope | src/control-plane/locks.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/control-plane/locks.js (new) |
| anti_goals | Do not hold locks for the entire managed child process lifetime., Do not add a daemon or service. |
| does_not_remove | File-backed daemonless coordination |
| capability_operations | implements registry/project/task lock acquisition |
| acceptance_criteria | Lock manager supports exclusive lock files, metadata, bounded waits, safe stale detection, release cleanup, and structured lock_busy errors. |
| verify_commands | node --check src/control-plane/locks.js, node --test test/control-plane-locks.test.js |
| MP | MP-003, MP-005 |
| CA | CA-CP-010, CA-CP-012 |
| FR | FR-010, FR-011, FR-012, FR-015, FR-050 |

#### T009 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T005: event tests |
| parallel_safe | true |
| packet | task-packets/T009.json |
| write_scope | src/control-plane/events.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/control-plane/events.js (new) |
| anti_goals | Do not persist raw environment secrets., Do not make events a hidden background service. |
| does_not_remove | JSONL event stream compatibility |
| capability_operations | implements transaction/event persistence and redaction |
| acceptance_criteria | Event store appends JSONL records, redacts configured/env-like values, reads bounded event history, tolerates corrupt lines, and includes next action payloads. |
| verify_commands | node --check src/control-plane/events.js, node --test test/control-plane-events.test.js |
| MP | MP-012, MP-015 |
| CA | CA-CP-010, CA-CP-016 |
| FR | FR-013, FR-035, FR-036, FR-039, FR-048 |

#### T010 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T006: JSON contract tests |
| parallel_safe | true |
| packet | task-packets/T010.json |
| write_scope | src/output.js, src/errors.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/output.js (modify), src/errors.js (modify) |
| anti_goals | Do not remove existing public error-code mapping., Do not stop mirroring legacy top-level JSON fields during transition. |
| does_not_remove | Existing --json consumers, legacy top-level fields |
| capability_operations | implements JSON envelope, next actions, stable error codes |
| acceptance_criteria | Success/failure envelopes include schemaVersion, data, next, stable domain error codes, and compatibility mirrors where existing tests require them. |
| verify_commands | node --check src/output.js, node --check src/errors.js, node --test test/cli-control-plane-contract.test.js test/cli-contract.test.js |
| MP | MP-012, MP-014 |
| CA | CA-CP-014, CA-CP-019 |
| FR | FR-045, FR-046, FR-047, FR-049, FR-052 |

#### T011 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T007: state store, T008: locks, T009: events, T010: output/errors |
| parallel_safe | false |
| packet | task-packets/T011.json |
| write_scope | package.json, src/control-plane/state.js, src/control-plane/locks.js, src/control-plane/events.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | package.json (modify), control-plane modules syntax-clean (modify if needed) |
| anti_goals | Do not add new npm dependencies unless tests prove the standard library is insufficient. |
| does_not_remove | npm run check, npm test |
| capability_operations | preserves project verification entry points |
| acceptance_criteria | npm run check covers new control-plane modules and tests that can be syntax-checked; focused foundational tests pass. |
| verify_commands | npm run check, node --test test/control-plane-state.test.js test/control-plane-locks.test.js test/control-plane-events.test.js test/cli-control-plane-contract.test.js |
| MP | MP-005, MP-012 |
| CA | CA-CP-001, CA-CP-010, CA-CP-019 |
| FR | FR-009, FR-010, FR-045 |

---

### Phase 3: User Story 1 - Register, Start Once, Observe Globally (Priority: P1)

**Purpose**: A user registers a project, starts one managed task, and sees it globally without duplicate service starts.

**Independent Test**: Run project add, start, duplicate start, status, ps, and ports with isolated LAUNCHDECK_HOME.

- [X] T012 [P] [US1] Add registry alias, repair, and active-remove refusal tests in test/global-runtime.test.js
- [X] T013 [P] [US1] Add run index, duplicate-start, and readiness tests in test/managed-cli.test.js and test/global-runtime.test.js
- [X] T014 [US1] Implement registry identity actions in src/control-plane/actions.js and src/global-runtime.js
- [X] T015 [US1] Implement global run index and managed start orchestration in src/control-plane/runs.js and src/runtime.js
- [X] T016 [US1] Implement status, ps, and ports views over the run index in src/control-plane/inspect.js and src/global-runtime.js
- [X] T017 [US1] Join US1 primary scenario with focused CLI validation and ledger update

#### T012 Contract

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T011: foundational join |
| parallel_safe | true |
| packet | task-packets/T012.json |
| write_scope | test/global-runtime.test.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | test/global-runtime.test.js (modify) |
| anti_goals | Do not implement registry behavior in this test task. |
| does_not_remove | Existing project add/list/remove/scan coverage |
| capability_operations | validates project add, project scan, project remove, project repair, projects |
| acceptance_criteria | Tests cover unique aliases, idempotent add, repair path/config/alias, bounded scan, and project remove refusal while active owned runs exist. |
| verify_commands | node --test test/global-runtime.test.js |
| MP | MP-004 |
| CA | CA-CP-001, CA-CP-002, CA-CP-003 |
| FR | FR-001, FR-002, FR-003, FR-005, FR-006, FR-007, FR-008 |

#### T013 Contract

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T011: foundational join |
| parallel_safe | true |
| packet | task-packets/T013.json |
| write_scope | test/managed-cli.test.js, test/global-runtime.test.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | test/managed-cli.test.js (modify), test/global-runtime.test.js (modify) |
| anti_goals | Do not implement run index in this test task. |
| does_not_remove | Existing duplicate task_already_running coverage until compatibility migration is complete |
| capability_operations | validates start, dev, duplicate start prevention, ready vs running |
| acceptance_criteria | Tests cover starting record, runId/transactionId, env markers, idempotent second start without second spawn, readiness via port/HTTP/process-alive, and status-safe next actions. |
| verify_commands | node --test test/managed-cli.test.js test/global-runtime.test.js |
| MP | MP-006, MP-012 |
| CA | CA-CP-004, CA-CP-005, CA-CP-009 |
| FR | FR-009, FR-014, FR-017, FR-023, FR-024 |

#### T014 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T012: registry tests, T007: state store, T008: locks |
| parallel_safe | false |
| packet | task-packets/T014.json |
| write_scope | src/control-plane/actions.js, src/global-runtime.js, src/cli.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/control-plane/actions.js (new), src/global-runtime.js (modify), src/cli.js (modify) |
| anti_goals | Do not delete project files during project remove., Do not let project remove bypass active run checks. |
| does_not_remove | project add, project scan, project remove, projects |
| capability_operations | implements project add, project scan, project remove, project repair, projects |
| acceptance_criteria | Registry commands use projectId and alias, lock registry mutations, preserve idempotency, implement repair, and refuse active owned project removal with next actions. |
| verify_commands | node --check src/control-plane/actions.js, node --check src/global-runtime.js, node --check src/cli.js, node --test test/global-runtime.test.js |
| MP | MP-004, MP-006 |
| CA | CA-CP-001, CA-CP-002, CA-CP-003 |
| FR | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008 |

#### T015 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T013: run tests, T007: state store, T008: locks, T009: events |
| parallel_safe | false |
| packet | task-packets/T015.json |
| write_scope | src/control-plane/runs.js, src/runtime.js, src/cli.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/control-plane/runs.js (new), src/runtime.js (modify), src/cli.js (modify) |
| anti_goals | Do not spawn through shell when existing adapter can spawn safely., Do not hold task lock for entire process lifetime. |
| does_not_remove | dev/start managed task behavior, existing project-local runtime compatibility |
| capability_operations | implements start, dev, duplicate-start prevention, ready/running tracking |
| acceptance_criteria | Managed starts create runId/transactionId, write starting state before spawn when needed, inject non-secret env markers, prevent duplicate runs, record events, and distinguish ready from running. |
| verify_commands | node --check src/control-plane/runs.js, node --check src/runtime.js, node --check src/cli.js, node --test test/managed-cli.test.js test/global-runtime.test.js |
| MP | MP-003, MP-005, MP-006, MP-012 |
| CA | CA-CP-004, CA-CP-005, CA-CP-009, CA-CP-013 |
| FR | FR-009, FR-011, FR-013, FR-014, FR-016, FR-017, FR-023, FR-024, FR-025 |

#### T016 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T014: registry actions, T015: run index start |
| parallel_safe | false |
| packet | task-packets/T016.json |
| write_scope | src/control-plane/inspect.js, src/global-runtime.js, src/cli.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/control-plane/inspect.js (new), src/global-runtime.js (modify), src/cli.js (modify) |
| anti_goals | Do not mutate lifecycle state in read-only observation commands except explicitly safe refresh. |
| does_not_remove | status --all, ps --all, ports, conflicts |
| capability_operations | implements status, ps, ports read views for primary scenario |
| acceptance_criteria | status/ps/ports report registry, run, readiness, port, conflict, error, and next-action data from the global run index without hiding stale/conflict states. |
| verify_commands | node --check src/control-plane/inspect.js, node --check src/global-runtime.js, node --check src/cli.js, node --test test/global-runtime.test.js test/managed-cli.test.js |
| MP | MP-009, MP-012 |
| CA | CA-CP-011, CA-CP-018, CA-CP-019 |
| FR | FR-026, FR-027, FR-028, FR-029, FR-033, FR-045 |

#### T017 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T014: registry actions, T015: run index start, T016: global views |
| parallel_safe | false |
| packet | task-packets/T017.json |
| write_scope | .specify/features/2026-07-08-launchdeck-global-cli-control-plane/implementation-review/ledger.json |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | implementation-review/ledger.json (modify) |
| anti_goals | Do not implement new behavior in this join task. |
| does_not_remove | Primary scenario acceptance signals |
| capability_operations | validates register, start once, observe globally |
| acceptance_criteria | Focused validation proves project add, start, duplicate start refusal/idempotency, status, ps, ports, and next actions work with isolated LAUNCHDECK_HOME. |
| verify_commands | node --test test/global-runtime.test.js test/managed-cli.test.js, npm run check |
| MP | MP-001, MP-006, MP-009, MP-012 |
| CA | CA-CP-001, CA-CP-004, CA-CP-005, CA-CP-011, CA-CP-019 |
| FR | FR-001, FR-009, FR-017, FR-026, FR-027, FR-028 |

---

### Phase 4: User Story 2 - External Conflict And Unified Inspect (Priority: P2)

**Purpose**: A user sees why a declared port is blocked without Launchdeck killing the external listener.

**Independent Test**: Run external listener conflict, start refusal, inspect port, inspect task, and inspect-port compatibility tests.

- [X] T018 [P] [US2] Add external conflict and unified inspect failing tests in test/inspect-cli.test.js
- [X] T019 [US2] Implement ownership evidence and port observation in src/control-plane/ownership.js and src/adapters/process.js
- [X] T020 [US2] Wire unified inspect command and inspect-port compatibility in src/cli.js and src/global-runtime.js
- [X] T021 [US2] Join US2 external conflict and inspect validation with ledger update

#### T018 Contract

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T017: US1 join |
| parallel_safe | true |
| packet | task-packets/T018.json |
| write_scope | test/inspect-cli.test.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | test/inspect-cli.test.js (new) |
| anti_goals | Do not implement inspect behavior in this test task., Do not kill external listener fixtures. |
| does_not_remove | inspect-port compatibility tests |
| capability_operations | validates inspect, inspect-port, conflicts, external process inspect-only behavior |
| acceptance_criteria | Tests cover inspect port:<port>, inspect pid:<pid>, inspect task:<alias:task>, external port conflict refusal, safeActions/blockedActions, and inspect-port compatibility. |
| verify_commands | node --test test/inspect-cli.test.js |
| MP | MP-007, MP-008, MP-009, MP-012 |
| CA | CA-CP-005, CA-CP-011, CA-CP-017, CA-CP-018 |
| FR | FR-020, FR-021, FR-028, FR-029, FR-030, FR-031, FR-032 |

#### T019 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T018: inspect tests, T016: inspect view foundation |
| parallel_safe | false |
| packet | task-packets/T019.json |
| write_scope | src/control-plane/ownership.js, src/adapters/process.js, src/control-plane/inspect.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/control-plane/ownership.js (new), src/adapters/process.js (modify), src/control-plane/inspect.js (modify) |
| anti_goals | Do not infer ownership from port or PID alone., Do not stop or signal any external process. |
| does_not_remove | Existing listPortListeners and stopProcessTreeSync adapter behavior |
| capability_operations | implements ownership proof and port observation for inspect/start refusal |
| acceptance_criteria | Ownership module classifies verified-owned, probable-owned, stale-owned, external, and unknown using run metadata and available OS evidence; external/unknown states are inspect-only. |
| verify_commands | node --check src/control-plane/ownership.js, node --check src/adapters/process.js, node --check src/control-plane/inspect.js, node --test test/inspect-cli.test.js test/global-runtime.test.js |
| MP | MP-007, MP-008, MP-015 |
| CA | CA-CP-005, CA-CP-011, CA-CP-017 |
| FR | FR-019, FR-020, FR-021, FR-025, FR-028, FR-031, FR-055 |

#### T020 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T019: ownership evidence |
| parallel_safe | false |
| packet | task-packets/T020.json |
| write_scope | src/cli.js, src/global-runtime.js, src/control-plane/inspect.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/cli.js (modify), src/global-runtime.js (modify), src/control-plane/inspect.js (modify) |
| anti_goals | Do not remove inspect-port command., Do not make inspect mutate lifecycle state. |
| does_not_remove | inspect-port compatibility, status/ps/ports/conflicts outputs |
| capability_operations | implements inspect and preserves inspect-port wrapper |
| acceptance_criteria | CLI accepts project/task/run/port/pid/conflict targets, normalizes output, includes evidence, ownership confidence, safe/blocked actions, next actions, and returns compatible inspect-port JSON. |
| verify_commands | node --check src/cli.js, node --check src/global-runtime.js, node --test test/inspect-cli.test.js test/global-runtime.test.js |
| MP | MP-009, MP-012 |
| CA | CA-CP-011, CA-CP-018, CA-CP-019 |
| FR | FR-030, FR-031, FR-032, FR-033, FR-045 |

#### T021 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T019: ownership evidence, T020: inspect command |
| parallel_safe | false |
| packet | task-packets/T021.json |
| write_scope | .specify/features/2026-07-08-launchdeck-global-cli-control-plane/implementation-review/ledger.json |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | implementation-review/ledger.json (modify) |
| anti_goals | Do not implement new behavior in this join task. |
| does_not_remove | External process inspect-only invariant |
| capability_operations | validates external port conflict and unified inspect |
| acceptance_criteria | Focused validation proves external occupied port blocks start, inspect explains listener and declarations, next actions avoid Launchdeck stop, and inspect-port remains compatible. |
| verify_commands | node --test test/inspect-cli.test.js test/global-runtime.test.js, npm run check |
| MP | MP-007, MP-008, MP-009 |
| CA | CA-CP-005, CA-CP-011, CA-CP-017, CA-CP-018 |
| FR | FR-020, FR-021, FR-029, FR-030, FR-031, FR-032 |

---

### Phase 5: User Story 3 - Owned Stop, Force-Stop, And Restart (Priority: P2)

**Purpose**: A user precisely stops or restarts only Launchdeck-owned process trees.

**Independent Test**: Run owned stop/restart/force-stop and unsafe owner refusal tests.

- [X] T022 [US3] Add stop, force-stop, and restart ownership matrix failing tests in test/lifecycle-ownership.test.js
- [X] T023 [US3] Implement ownership-gated stop, force-stop, and restart actions in src/control-plane/actions.js
- [X] T024 [US3] Wire lifecycle commands and refusal next actions in src/cli.js and src/output.js
- [X] T025 [US3] Join US3 owned restart and stop validation with ledger update

#### T022 Contract

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T021: US2 join |
| parallel_safe | false |
| packet | task-packets/T022.json |
| write_scope | test/lifecycle-ownership.test.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | test/lifecycle-ownership.test.js (new) |
| anti_goals | Do not implement lifecycle stop/restart behavior in this test task. |
| does_not_remove | Existing stop tests in test/managed-cli.test.js |
| capability_operations | validates stop, force-stop, restart, ownership refusal |
| acceptance_criteria | Tests cover verified-owned stop, unknown/probable/external refusal, force-stop preserving ownership gate, restart stop-wait-start transaction, port release timeout, and stop_failed evidence. |
| verify_commands | node --test test/lifecycle-ownership.test.js |
| MP | MP-007, MP-011, MP-012 |
| CA | CA-CP-006, CA-CP-007, CA-CP-008, CA-CP-017 |
| FR | FR-018, FR-019, FR-020, FR-021, FR-022, FR-025 |

#### T023 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T022: lifecycle ownership tests, T019: ownership evidence, T015: run index |
| parallel_safe | false |
| packet | task-packets/T023.json |
| write_scope | src/control-plane/actions.js, src/control-plane/runs.js, src/runtime.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/control-plane/actions.js (modify), src/control-plane/runs.js (modify), src/runtime.js (modify) |
| anti_goals | Do not stop external, unknown, probable, or stale-only targets., Do not let force-stop grant ownership. |
| does_not_remove | Existing stop idempotency for stale managed records |
| capability_operations | implements stop, force-stop, restart |
| acceptance_criteria | Stop and restart acquire task locks, reconcile state, prove verified ownership, stop owned tree, wait for release during restart, persist stopped/stop_failed states, and emit events/next actions. |
| verify_commands | node --check src/control-plane/actions.js, node --check src/control-plane/runs.js, node --check src/runtime.js, node --test test/lifecycle-ownership.test.js test/managed-cli.test.js |
| MP | MP-007, MP-011, MP-015 |
| CA | CA-CP-006, CA-CP-007, CA-CP-008, CA-CP-017 |
| FR | FR-018, FR-019, FR-020, FR-021, FR-022, FR-025, FR-050, FR-055 |

#### T024 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T023: lifecycle actions, T010: output envelope |
| parallel_safe | false |
| packet | task-packets/T024.json |
| write_scope | src/cli.js, src/output.js, src/errors.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/cli.js (modify), src/output.js (modify), src/errors.js (modify) |
| anti_goals | Do not introduce interactive prompts in non-interactive CLI., Do not remove existing stop command shape without compatibility. |
| does_not_remove | stop command, restart command, force-owned semantics |
| capability_operations | exposes stop, force-stop, restart through CLI |
| acceptance_criteria | CLI routes stop/force-stop/restart to ownership-gated actions and returns domain errors with next actions for unsafe targets and timeouts. |
| verify_commands | node --check src/cli.js, node --check src/output.js, node --check src/errors.js, node --test test/lifecycle-ownership.test.js test/cli-control-plane-contract.test.js |
| MP | MP-011, MP-012 |
| CA | CA-CP-006, CA-CP-007, CA-CP-008, CA-CP-014, CA-CP-019 |
| FR | FR-018, FR-019, FR-022, FR-045, FR-046, FR-047, FR-049 |

#### T025 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T023: lifecycle actions, T024: CLI wiring |
| parallel_safe | false |
| packet | task-packets/T025.json |
| write_scope | .specify/features/2026-07-08-launchdeck-global-cli-control-plane/implementation-review/ledger.json |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | implementation-review/ledger.json (modify) |
| anti_goals | Do not implement new behavior in this join task. |
| does_not_remove | Owned-only stop/restart safety invariant |
| capability_operations | validates owned restart, stop, force-stop refusal semantics |
| acceptance_criteria | Focused validation proves verified-owned stop/restart works, external/unknown targets are refused, force-stop does not bypass ownership, and events record both phases. |
| verify_commands | node --test test/lifecycle-ownership.test.js test/managed-cli.test.js, npm run check |
| MP | MP-007, MP-011 |
| CA | CA-CP-006, CA-CP-007, CA-CP-008, CA-CP-017 |
| FR | FR-018, FR-019, FR-020, FR-021, FR-022 |

---

### Phase 6: User Story 4 - Stale Recovery And Observability (Priority: P2)

**Purpose**: A user repairs stale Launchdeck state and reads logs/events as JSON/JSONL.

**Independent Test**: Run stale-state reconcile, events, logs, logs --follow JSONL, and redaction tests.

- [X] T026 [US4] Add reconcile, stale state, events, and logs-follow failing tests in test/recovery-observability.test.js
- [X] T027 [US4] Implement reconcile and stale run repair in src/control-plane/runs.js and src/control-plane/actions.js
- [X] T028 [US4] Implement events command, logs --follow JSONL, and retention policy in src/cli.js and src/control-plane/events.js
- [X] T029 [US4] Join US4 recovery and observability validation with ledger update

#### T026 Contract

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T025: US3 join |
| parallel_safe | false |
| packet | task-packets/T026.json |
| write_scope | test/recovery-observability.test.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | test/recovery-observability.test.js (new) |
| anti_goals | Do not implement reconcile/events/log follow behavior in this test task. |
| does_not_remove | Existing logs command coverage |
| capability_operations | validates reconcile, events, logs --follow JSONL |
| acceptance_criteria | Tests cover stale run detection, reconcile without kill, events command, logs --follow JSONL visible stream, retention safety, and secret redaction. |
| verify_commands | node --test test/recovery-observability.test.js |
| MP | MP-012, MP-015 |
| CA | CA-CP-009, CA-CP-010, CA-CP-016 |
| FR | FR-034, FR-035, FR-036, FR-037, FR-038, FR-039, FR-044, FR-048 |

#### T027 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T026: recovery tests, T019: ownership evidence, T023: lifecycle actions |
| parallel_safe | false |
| packet | task-packets/T027.json |
| write_scope | src/control-plane/runs.js, src/control-plane/actions.js, src/control-plane/inspect.js, src/cli.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/control-plane/runs.js (modify), src/control-plane/actions.js (modify), src/control-plane/inspect.js (modify), src/cli.js (modify) |
| anti_goals | Do not kill processes during reconcile., Do not silently delete stale state. |
| does_not_remove | Inspectable stale state evidence |
| capability_operations | implements reconcile and stale state recovery |
| acceptance_criteria | Reconcile compares run index and OS observations, marks stale/stopped safely, writes events, preserves evidence, and blocks dangerous operations until safe. |
| verify_commands | node --check src/control-plane/runs.js, node --check src/control-plane/actions.js, node --check src/control-plane/inspect.js, node --check src/cli.js, node --test test/recovery-observability.test.js test/lifecycle-ownership.test.js |
| MP | MP-007, MP-009, MP-012 |
| CA | CA-CP-009, CA-CP-011, CA-CP-017 |
| FR | FR-016, FR-025, FR-033, FR-044 |

#### T028 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T026: recovery tests, T009: events store, T027: reconcile |
| parallel_safe | false |
| packet | task-packets/T028.json |
| write_scope | src/cli.js, src/control-plane/events.js, src/runtime.js, src/global-runtime.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/cli.js (modify), src/control-plane/events.js (modify), src/runtime.js (modify), src/global-runtime.js (modify) |
| anti_goals | Do not create hidden watchers for follow., Do not delete current running or latest failed evidence. |
| does_not_remove | Existing logs project:task behavior |
| capability_operations | implements events, logs --follow, JSONL streams, retention |
| acceptance_criteria | events reads redacted JSONL history, logs --follow streams visible JSON Lines, retention avoids unbounded growth while preserving running/latest failure evidence. |
| verify_commands | node --check src/cli.js, node --check src/control-plane/events.js, node --check src/runtime.js, node --test test/recovery-observability.test.js test/global-runtime.test.js |
| MP | MP-012, MP-015 |
| CA | CA-CP-010, CA-CP-016, CA-CP-019 |
| FR | FR-034, FR-035, FR-036, FR-037, FR-038, FR-039, FR-048 |

#### T029 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T027: reconcile, T028: events/logs |
| parallel_safe | false |
| packet | task-packets/T029.json |
| write_scope | .specify/features/2026-07-08-launchdeck-global-cli-control-plane/implementation-review/ledger.json |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | implementation-review/ledger.json (modify) |
| anti_goals | Do not implement new behavior in this join task. |
| does_not_remove | Stale evidence and observability acceptance signals |
| capability_operations | validates stale recovery, events, logs, retention |
| acceptance_criteria | Focused validation proves stale state is inspectable, reconcile repairs without killing, events/logs are machine-readable, and secret data is redacted. |
| verify_commands | node --test test/recovery-observability.test.js, npm run check |
| MP | MP-012, MP-015 |
| CA | CA-CP-009, CA-CP-010, CA-CP-016, CA-CP-019 |
| FR | FR-034, FR-035, FR-036, FR-039, FR-044, FR-048 |

---

### Phase 7: User Story 5 - Safe Clean (Priority: P3)

**Purpose**: A user cleans declared safe data without killing services or deleting unsafe paths.

**Independent Test**: Run clean --safe path safety and evidence preservation tests.

- [X] T030 [US5] Add safe clean and retention evidence tests in test/clean-control-plane.test.js
- [X] T031 [US5] Implement clean control-plane safety integration in src/runtime.js and src/cli.js
- [X] T032 [US5] Join US5 safe clean validation with ledger update

#### T030 Contract

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T029: US4 join |
| parallel_safe | false |
| packet | task-packets/T030.json |
| write_scope | test/clean-control-plane.test.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | test/clean-control-plane.test.js (new) |
| anti_goals | Do not implement clean behavior in this test task. |
| does_not_remove | Existing clean path containment coverage |
| capability_operations | validates clean --safe and clean/reset separation |
| acceptance_criteria | Tests cover path escape, symlink/junction escape, project-root refusal, unknown target refusal, running evidence preservation, latest failure evidence preservation, and reset staying absent/deferred. |
| verify_commands | node --test test/clean-control-plane.test.js |
| MP | MP-010, MP-015 |
| CA | CA-CP-015 |
| FR | FR-040, FR-041, FR-042, FR-043, FR-055 |

#### T031 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T030: clean tests, T028: retention/events |
| parallel_safe | false |
| packet | task-packets/T031.json |
| write_scope | src/runtime.js, src/cli.js, src/control-plane/actions.js, src/control-plane/inspect.js |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/runtime.js (modify), src/cli.js (modify), src/control-plane/actions.js (modify), src/control-plane/inspect.js (modify) |
| anti_goals | Do not stop services from clean., Do not delete registry entries, project roots, unknown files, or external paths., Do not implement destructive reset. |
| does_not_remove | clean --safe hygiene command, reset deferred boundary |
| capability_operations | implements clean --safe safety and preserves reset separation |
| acceptance_criteria | Clean uses path adapter containment, refuses unsafe targets, preserves active/latest-failure evidence, records events when appropriate, and returns actionable blocked reasons. |
| verify_commands | node --check src/runtime.js, node --check src/cli.js, node --check src/control-plane/actions.js, node --test test/clean-control-plane.test.js test/runtime-state.test.js |
| MP | MP-010, MP-011, MP-015 |
| CA | CA-CP-015, CA-CP-016 |
| FR | FR-040, FR-041, FR-042, FR-043, FR-055 |

#### T032 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T031: clean integration |
| parallel_safe | false |
| packet | task-packets/T032.json |
| write_scope | .specify/features/2026-07-08-launchdeck-global-cli-control-plane/implementation-review/ledger.json |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | implementation-review/ledger.json (modify) |
| anti_goals | Do not implement new behavior in this join task. |
| does_not_remove | Clean/reset separation and path safety invariant |
| capability_operations | validates safe clean path |
| acceptance_criteria | Focused validation proves clean never stops services, never removes registry/project roots/unknown/external paths, and preserves running/latest failure evidence. |
| verify_commands | node --test test/clean-control-plane.test.js test/runtime-state.test.js, npm run check |
| MP | MP-010, MP-015 |
| CA | CA-CP-015 |
| FR | FR-040, FR-041, FR-042, FR-043, FR-055 |

---

### Final Phase: Demo, Docs, Smoke, And Review Closeout

**Purpose**: Complete release evidence, demo, docs, cross-platform smoke, and final embedded review.

- [X] T033 [P] Create official demo project in examples/demo-api with checked-in fixture scripts
- [X] T034 [P] Update README command reference and safety documentation in README.md
- [X] T035 [P] Add cross-platform lifecycle smoke script and evidence template in scripts/smoke-lifecycle.js and docs/cross-platform-smoke.md
- [X] T036 Update package syntax checks and full test coverage in package.json
- [X] T037 Run quickstart release smoke and record implementation-review final evidence
- [X] T038 Perform final embedded review repair window and task closeout in implementation-review/branch-review.md
- [X] T039 Repair T007 registry/CLI bridge drift in src/global-runtime.js, src/cli.js, and src/control-plane/state.js before JP3

#### T033 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T032: US5 join |
| parallel_safe | true |
| packet | task-packets/T033.json |
| write_scope | examples/demo-api/.launchdeck.yml, examples/demo-api/package.json, examples/demo-api/scripts/server.js, examples/demo-api/README.md |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | examples/demo-api/.launchdeck.yml (new), examples/demo-api/package.json (new), examples/demo-api/scripts/server.js (new), examples/demo-api/README.md (new) |
| anti_goals | Do not use inline node -e long-running commands., Do not add external service dependencies. |
| does_not_remove | Official demo acceptance proof |
| capability_operations | implements official demo project |
| acceptance_criteria | Demo supports project add, start, duplicate refusal, inspect, restart/stop, stale recovery, logs/events, and clean using checked-in scripts. |
| verify_commands | node --check examples/demo-api/scripts/server.js, node src/cli.js project add examples/demo-api --alias demo --json |
| MP | MP-016 |
| CA | CA-CP-020 |
| FR | FR-053, FR-054 |

#### T034 Contract

| Field | Value |
| --- | --- |
| agent | style-reviewer |
| depends_on | T032: US5 join |
| parallel_safe | true |
| packet | task-packets/T034.json |
| write_scope | README.md |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | README.md (modify) |
| anti_goals | Do not document daemon, GUI, TUI, MCP, external-kill, or reset as shipped behavior. |
| does_not_remove | Existing CLI command reference |
| capability_operations | documents all confirmed CLI capabilities and safety boundaries |
| acceptance_criteria | README covers positioning, quick demo, concepts, command reference, .launchdeck.yml, JSON/errors, safety, no-external-kill, clean/reset separation, and release claim requirements. |
| verify_commands | rg -n "inspect\|force-stop\|reconcile\|events\|schemaVersion\|no external\|clean" README.md |
| MP | MP-001, MP-008, MP-010, MP-012, MP-013, MP-017 |
| CA | CA-CP-018, CA-CP-019, CA-CP-020 |
| FR | FR-054 |

#### T035 Contract

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T032: US5 join |
| parallel_safe | true |
| packet | task-packets/T035.json |
| write_scope | scripts/smoke-lifecycle.js, docs/cross-platform-smoke.md |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | scripts/smoke-lifecycle.js (new), docs/cross-platform-smoke.md (new) |
| anti_goals | Do not claim cross-platform ready without recorded Windows, macOS, and Linux evidence., Do not use privileged system hooks. |
| does_not_remove | Cross-platform-ready release gate |
| capability_operations | validates cross-platform lifecycle smoke |
| acceptance_criteria | Smoke script exercises demo add/start/duplicate/status/inspect/restart/stop/reconcile/clean with isolated LAUNCHDECK_HOME; evidence doc records platform, commands, result, and limitations. |
| verify_commands | node --check scripts/smoke-lifecycle.js, node scripts/smoke-lifecycle.js --help |
| MP | MP-017 |
| CA | CA-CP-017, CA-CP-020 |
| FR | FR-056 |

#### T036 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T033: demo, T034: docs, T035: smoke script |
| parallel_safe | false |
| packet | task-packets/T036.json |
| write_scope | package.json |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | package.json (modify) |
| anti_goals | Do not remove npm run check or npm test., Do not add dependencies without justification. |
| does_not_remove | Existing verification entrypoints |
| capability_operations | preserves project verification commands |
| acceptance_criteria | npm run check includes new source, smoke, demo, helper, and test files; npm test remains the broad project test entrypoint. |
| verify_commands | npm run check, npm test |
| MP | MP-017 |
| CA | CA-CP-020 |
| FR | FR-053, FR-056 |

#### T037 Contract

| Field | Value |
| --- | --- |
| agent | quality-reviewer |
| depends_on | T036: package verification update |
| parallel_safe | false |
| packet | task-packets/T037.json |
| write_scope | .specify/features/2026-07-08-launchdeck-global-cli-control-plane/implementation-review/ledger.json |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | implementation-review/ledger.json (modify) |
| anti_goals | Do not claim release-safe if any required quickstart step is skipped, failed, or only manually assumed. |
| does_not_remove | Quickstart release smoke checklist |
| capability_operations | validates complete CLI product loop |
| acceptance_criteria | Quickstart steps 1-11 pass with isolated LAUNCHDECK_HOME or blocked steps are recorded with exact reason and no release-safe claim. |
| verify_commands | npm run check, npm test, node scripts/smoke-lifecycle.js --quickstart |
| MP | MP-016, MP-017 |
| CA | CA-CP-020 |
| FR | FR-053, FR-056 |

#### T038 Contract

| Field | Value |
| --- | --- |
| agent | quality-reviewer |
| depends_on | T037: quickstart smoke |
| parallel_safe | false |
| packet | task-packets/T038.json |
| write_scope | .specify/features/2026-07-08-launchdeck-global-cli-control-plane/implementation-review/branch-review.md |
| read_scope | F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/data-model.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/contracts/cli-contract.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/quickstart.md, F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane/plan-contract.json, F:/github/launchdeck/.specify/memory/constitution.md |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | implementation-review/branch-review.md (new) |
| anti_goals | Do not modify source during the review closeout task unless sp-implement generates explicit repair tasks., Do not claim complete without verification output. |
| does_not_remove | Embedded implement review gate, review window policy |
| capability_operations | validates complete task package and prepares final implementation handoff |
| acceptance_criteria | Branch review records completed tasks, changed files, validation outputs, unresolved concerns, cross-platform evidence status, and any appended repair tasks. |
| verify_commands | npm run check, npm test |
| MP | MP-001, MP-017 |
| CA | CA-CP-001, CA-CP-020 |
| FR | FR-001, FR-056 |

#### T039 Contract

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T007: state store, T010: output/errors |
| parallel_safe | false |
| repair_for | T007 |
| write_scope | src/global-runtime.js, src/cli.js, src/control-plane/state.js |
| read_scope | task-packets/T007.json, task-packets/T012.json, task-packets/T014.json, test/control-plane-state.test.js, src/control-plane/state.js, src/global-runtime.js, src/cli.js |
| forbidden | .env, .env.*, **/*secret*, **/*credential*, **/node_modules/**, F:/github/* outside F:/github/launchdeck |
| expected_outputs | src/global-runtime.js (modify), src/cli.js (modify), src/control-plane/state.js (modify only if needed) |
| anti_goals | Do not introduce src/control-plane/actions.js., Do not implement registry lock orchestration, active-project remove refusal, or broader T014 lifecycle behavior., Do not edit tests. |
| does_not_remove | T007 state store primitive, existing project add/list/remove/scan surfaces, T010 JSON envelope compatibility |
| capability_operations | bridges project add/projects/project repair to the versioned control-plane state store so JP3 foundational validation can pass |
| acceptance_criteria | test/control-plane-state.test.js passes 5/5 without test edits; project add reads legacy v1 when needed and writes v2 registry/projects.json; project repair supports alias/path/config updates while preserving projectId; alias conflicts and unsupported state versions surface public JSON error codes/details. |
| verify_commands | node --check src/control-plane/state.js, node --check src/global-runtime.js, node --check src/cli.js, node --test test/control-plane-state.test.js, node --test test/cli-control-plane-contract.test.js test/cli-contract.test.js |
| MP | MP-004, MP-012, MP-014 |
| CA | CA-CP-001, CA-CP-002, CA-CP-013, CA-CP-014, CA-CP-019 |
| FR | FR-001, FR-002, FR-003, FR-004, FR-045, FR-052 |

---

## Dependencies & Execution Order

- Phase 0 guardrails must complete before source-writing implementation.
- Phase 1 setup must complete before failing test batches.
- Phase 2 foundational primitives block all user stories.
- US1 is the first product loop and blocks US2-US5 implementation joins because later commands depend on stable run/registry state.
- US2 blocks US3 because stop/restart ownership depends on inspect/ownership evidence.
- US3 blocks US4 because reconcile/log events depend on stable lifecycle transitions.
- US4 blocks US5 because clean must preserve runtime/log/event evidence.
- Final phase depends on all user stories.

## Parallel Batches And Join Points

| Batch | Parallel-safe tasks | Join Point | Validation / Pass Condition |
| --- | --- | --- | --- |
| B0 | T001 | JP0 | Test-Path .specify/features/2026-07-08-launchdeck-global-cli-control-plane/implementation-review/ledger.json |
| B1 | T002 | JP1 | node --check test/helpers/control-plane-fixture.js |
| B2 | T003, T004, T005, T006 | JP2 | node --test test/control-plane-state.test.js test/control-plane-locks.test.js test/control-plane-events.test.js test/cli-control-plane-contract.test.js |
| B3 | T007, T008, T009, T010 | JP3 | focused foundational tests plus node --check on new modules |
| B4 | T011 | JP4 | npm run check and focused foundational tests |
| B5 | T012, T013 | JP5 | node --test test/global-runtime.test.js test/managed-cli.test.js |
| B6 | T014, T015, T016, T017 | JP6 | US1 focused validation |
| B7 | T018, T019, T020, T021 | JP7 | US2 focused validation |
| B8 | T022, T023, T024, T025 | JP8 | US3 focused validation |
| B9 | T026, T027, T028, T029 | JP9 | US4 focused validation |
| B10 | T030, T031, T032 | JP10 | US5 focused validation |
| B11 | T033, T034, T035 | JP11 | demo/docs/smoke assets validate independently |
| B12 | T036, T037, T038 | JP12 | npm run check, npm test, quickstart smoke |

## Parallel Examples

- After T002, run T003, T004, T005, and T006 as independent failing-test lanes, then join at JP2.
- After T003-T006 fail for expected missing behavior, run T007, T008, T009, and T010 in parallel because their write sets are isolated, then join at JP3.
- After US5, run T033 demo, T034 docs, and T035 smoke assets in parallel, then join before package verification.

## Embedded Implement Review Policy

- embedded_review_gate: required before first code-writing task and after every join point.
- auto_repair_tasks: true, only when the accepted spec and plan remain valid.
- review_window_policy: max_completed_tasks_before_review=5, max_unreviewed_changed_paths=8, max_unreviewed_validation_failures=0.
- visible_review_command: none.
- Review artifacts: implementation-review/reviews.ndjson, implementation-review/repairs.ndjson, implementation-review/snapshots/, implementation-review/branch-review.md.

## Implementation Dispatch

- **Feature delivery shape**: serial phases with intra-phase parallel batches and high-risk join points.
- **Current ready batch dispatch**: T001 only; leader-inline or one executor lane is sufficient.
- **Embedded review gate**: required before first code-writing task and after each join point.
- **auto_repair_tasks**: true, only when spec/plan remain valid.
- **review_window_policy**: max_completed_tasks_before_review=5, max_unreviewed_changed_paths=8, max_unreviewed_validation_failures=0.
- **visible_review_command**: none.

## Confirmed Delivery Boundary

1. Complete Phase 0-2 foundation.
2. Complete every user story US1-US5; no user story is a scope deferral.
3. Complete official demo, docs, smoke script, quickstart release smoke, and final embedded review.
4. Stop and reopen upstream if any stop-and-reopen condition from plan-contract.json becomes true.

## User-Confirmed Deferrals

No new delivery deferrals were introduced by task generation. Existing out-of-scope items remain daemon/service, GUI/TUI/MCP/editor clients, external process kill, destructive reset, workspace orchestration, whole-machine/multi-user registry, and Docker volume/container ownership.

## Implementation-Readiness Task Self-Audit

- **Buildable FR coverage**: passed; FR-001 through FR-056 map to tasks, join points, or final validation.
- **Locked decision preservation**: passed; no daemon, no external kill, clean/reset separation, stable JSON, and future-client truth are guardrails.
- **Task guardrails**: passed; guardrail index maps hard rules to tasks.
- **User-observable path coverage**: passed; every CLI/runtime surface has real-entrypoint validation.
- **DP1/DP2/DP3 packet readiness**: passed for task generation; every packet has identity, dependencies, write scope, validation, and handoff format.
- **Reference fidelity mapping**: not_applicable; active profile is Standard Delivery, no Reference-Implementation inventory.
- **Unmapped tasks**: passed; setup, join, final, and verification tasks have explicit justification.
- **Write-set conflict status**: passed; shared CLI/router/package edits are serial join tasks or sequential tasks.

## Recommended Next Command

- `/sp.implement`
