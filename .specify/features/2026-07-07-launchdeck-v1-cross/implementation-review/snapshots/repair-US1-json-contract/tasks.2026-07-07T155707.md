# Tasks: Launchdeck v1 Cross-Platform CLI Lifecycle Tool

**Input**: Design documents from `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/`  
**Prerequisites**: `plan.md`, `spec.md`, `alignment.md`, `context.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `plan-contract.json`  
**Execution model**: adaptive / standard / leader-inline. Native subagent tools exist, but the active tool policy requires an explicit user request before spawning subagents; task generation is artifact-only and downstream high-risk behavior is mapped into tasks, packets, and review checkpoints.  
**Feature delivery shape**: serial foundation with intra-story parallel test batches, followed by pipeline-heavy implementation and explicit join points.

## Planning Inputs

- Locked planning decisions: CLI-first local single-project tool; explicit `.launchdeck.yml` v1; read-only `doctor` and `tasks`; `longRunning` owns foreground vs managed execution; runtime state/logs are recovery evidence; `clean` is dry-run by default and never reset; JSON/errors/exit codes are contracts; cross-platform-ready requires Windows/macOS/Linux smoke evidence.
- Implementation constitution: keep CLI semantics in `src/cli.js`; centralize config protocol in `src/config.js`; keep runtime orchestration in `src/runtime.js`; isolate OS-sensitive path/process behavior behind adapter modules; keep JSON/error contract centralized; prove cleanup containment with negative tests.
- Active profile: `Standard Delivery`. No reference fidelity profile applies.
- Cognition intake: `query_ready`, `usable_with_review`, `baseline_kind=greenfield_empty`; minimal live reads consumed: `src/cli.js`, `test/cli.test.js`, `src/config.js`.
- Validation references: `quickstart.md`, `contracts/cli-json-contract.md`, `contracts/runtime-state-v1.md`, `contracts/error-codes-v1.md`, `contracts/launchdeck-config-v1.md`.
- Must-preserve obligations: `MP-001` through `MP-016` are carried into the Task Guardrail Index and task packets.

## Implementation Target Boundary

- **Target root**: `F:/github/launchdeck`
- **Target-relative paths**: `src/cli.js`, `src/config.js`, `src/runtime.js`, `src/errors.js`, future `src/output.js`, future `src/adapters/process.js`, future `src/adapters/path.js`, `test/*.test.js`, `README.md`, `examples/`, `schema/`, `.github/workflows/ci.yml`
- **Evidence status**: project cognition plus live reads; current code is a prototype, spec/contracts own final behavior.
- **Boundary constraints**: no GUI/TUI, MCP, agent skill, discovery default, daemon, remote/cloud, plugin marketplace, destructive reset, database reset, Docker reset, or native installer packaging in v1.
- **Reference-only paths**: discussion files under `.specify/discussions/launchdeck-tool/` shape requirements but are not implementation write targets.

## Task Guardrail Index

- `G-SCOPE`: preserve `MP-001`, `MP-002`, `MP-003`, `MP-015`; no deferred product surface enters v1.
- `G-CONFIG`: preserve `MP-004`, `MP-006`, `MP-007`, `MP-008`; config, `doctor`, and `tasks` are explicit and read-only where required.
- `G-RUNTIME`: preserve `MP-009`, `MP-010`, `MP-012`; managed process behavior is inspectable and adapter-owned.
- `G-CLEAN`: preserve `MP-011`; cleanup is preview-first, project-local, canonical, and separate from reset.
- `G-COMPAT`: preserve `MP-014`; JSON, errors, and exit codes are public contracts.
- `G-PLATFORM`: preserve `MP-005`, `MP-013`; release claims are gated by OS smoke evidence.
- `G-TESTS`: constitution principles III and VI; behavior changes need failing tests first and verified passing checks before completion.

Task mapping:

| Task IDs | Guardrails |
| --- | --- |
| T001, T022 | G-SCOPE, G-PLATFORM, G-TESTS |
| T002, T004, T005, T010, T011, T016 | G-TESTS, G-CONFIG, G-RUNTIME, G-CLEAN, G-COMPAT |
| T003, T006, T007, T008, T009 | G-CONFIG, G-COMPAT, G-SCOPE |
| T012, T013, T014, T015 | G-RUNTIME, G-PLATFORM, G-COMPAT |
| T017, T018, T019 | G-CLEAN, G-COMPAT |
| T020, T021 | G-SCOPE, G-PLATFORM, G-COMPAT |

## Capability Operation Coverage

| Operation | Upstream Source | Selected Entry Point | Task IDs / Packet Fields | Validation | Degradation Check |
| --- | --- | --- | --- | --- | --- |
| init | FR-011 to FR-013, CA-018 | `launchdeck init` | T004, T007, T009 | `node --test test/cli-contract.test.js` | executable CLI path, not template-only |
| doctor | FR-014 to FR-016, CA-011 | `launchdeck doctor` | T004, T007, T009 | `node --test test/cli-contract.test.js` | read-only findings with stable fields |
| tasks | FR-017 to FR-019, CA-012 | `launchdeck tasks` | T004, T007, T009 | `launchdeck tasks --json` smoke | read-only inventory, no execution |
| run and aliases | FR-020 to FR-022, CA-013, CA-020 | `launchdeck run`, lifecycle aliases | T004, T008, T009 | child exit-code tests | preserves foreground exit semantics |
| managed runtime | FR-021, FR-023 to FR-034, CA-002, CA-005, CA-014 | `dev/start/restart/ps/logs/stop` | T010 to T015 | managed lifecycle tests | state/logs remain inspectable |
| clean | FR-035 to FR-041, CA-001, CA-015 | `launchdeck clean` | T016 to T019 | clean safety tests | not reset, not out-of-root deletion |
| agent/MCP integration | MP-003, CA-022 | deferred | T001, T020, T022 packet guardrails | out-of-scope review | user-confirmed deferral |

## User-Observable Path Coverage

| Feature / Surface | Real Entry Point | Producer Data | Transformer / State Builder | Consumer Surface | Executor / Boundary | Task IDs / Packet Fields | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Config lifecycle | `launchdeck init`, upward config search | target cwd and YAML config | `src/config.js` normalization | human/JSON command output | CLI command boundary | T004, T006, T007, T009 | CLI contract tests |
| Doctor/tasks inspection | `launchdeck doctor`, `launchdeck tasks` | normalized config/tasks | report and inventory builders | human/JSON output | read-only CLI boundary | T004, T007, T009 | no-runtime-write and JSON tests |
| Foreground run | `launchdeck run <task>`, aliases | task command metadata | runtime foreground executor | process exit and optional JSON | child process boundary | T004, T008, T009 | child exit-code tests |
| Managed process lifecycle | `dev/start/restart/ps/logs/stop` | long-running task metadata and state | runtime state/log refresh | process list/log/stop JSON | process adapter boundary | T010 to T015 | lifecycle and stale-state tests |
| Clean | `launchdeck clean` | `clean.safe`, `clean.risky` | clean target planner | dry-run/removed/refused output | filesystem/path adapter boundary | T016 to T019 | canonical containment tests |
| Release claim evidence | CI and quickstart smoke | smoke config and workflow matrix | verification claim levels | docs/release output | CI/local shell boundary | T020 to T022 | `npm run check`, `npm test`, matrix smoke |

## Consequence Obligation Mapping

| Obligation ID | Task IDs | Affected State / Dependency | Required References | Validation | Stop And Reopen |
| --- | --- | --- | --- | --- | --- |
| CA-001 | T016, T017, T018, T019 | clean preview/safe/all/refused/skipped | clean contract, data-model CleanTarget | `node --test test/clean-safety.test.js` | root/out-of-root refusal cannot be proven |
| CA-002 | T010, T011, T012, T013, T014, T015 | managed running/stopped/stale/unknown/stop_failed | runtime-state contract | managed lifecycle tests | stop cannot be failure-aware |
| CA-003 | T003, T004, T007, T008, T014, T018 | JSON success/error/partial | CLI JSON contract | JSON parse tests | command emits human-only output |
| CA-004 | T005, T006, T007, T009 | config no/configured/invalid/version | config contract | config tests | schema becomes stack-specific |
| CA-005 | T010, T013, T015 | runtime state/log durability | runtime-state contract | invalid-state and stale tests | inspection deletes evidence |
| CA-006 | T012, T021, T022 | Windows/macOS/Linux evidence | research R-007, quickstart | CI matrix smoke | cross-platform-ready requested without all OS |
| CA-007 | T011, T012, T013, T015 | platform adapter execution | research R-002/R-003 | adapter tests | OS behavior leaks into CLI semantics |
| CA-008 | T005, T006, T020 | config v1 compatibility | config contract | unsupported version tests | breaking schema needed |
| CA-009 | T003, T004, T020 | error vocabulary | error-codes contract | error-code tests | unclassified common failure |
| CA-010 | T004, T007, T009, T022 | first-run flow | quickstart | lifecycle smoke | inspection requires mutation |
| CA-011 | T004, T007, T009 | doctor findings | data-model DoctorFinding | doctor JSON tests | doctor mutates project state |
| CA-012 | T004, T007, T009 | tasks inventory | data-model Task | tasks no-runtime-write tests | tasks executes commands |
| CA-013 | T004, T008, T010, T014, T015 | execution foreground/managed/duplicate/partial | runtime-state contract | exit-code and restart tests | longRunning ignored |
| CA-014 | T010, T013, T014, T015 | ps/logs/stop states | runtime-state contract | runtime CLI tests | records/logs hidden or erased |
| CA-015 | T016, T017, T018, T019 | clean dry-run/safe/all/refused | config and runtime contracts | clean tests | clean becomes reset |
| CA-016 | T011, T012, T017, T021 | path/shell/process/clean/log adapters | research R-002 to R-005 | adapter and matrix tests | no adapter boundary |
| CA-017 | T020, T021, T022 | release claim levels | quickstart | smoke evidence | claim wording overstates evidence |
| CA-018 | T004, T007, T009 | init no/existing/ancestor states | config contract | init tests | ancestor overwrite required |
| CA-019 | T005, T006, T007 | deterministic root | data-model Project | root JSON tests | root selection ambiguous |
| CA-020 | T003, T004, T008, T014, T018 | JSON/exit codes | CLI JSON contract | exit-code tests | partial/child exits indistinguishable |
| CA-021 | T003, T004, T020 | error vocabulary | error-codes contract | code scan/tests | `internal_error` used for known failures |
| CA-022 | T001, T020, T022 | v1 boundary/deferred scope | plan forbidden drift | out-of-scope review | deferred integration becomes required |

## Requirement Coverage Map

| Requirement Range | Task IDs | Coverage |
| --- | --- | --- |
| FR-001 to FR-010 | T005, T006, T020 | Config discovery, version, project root, task metadata, cwd/log containment, clean declaration, docs/schema. |
| FR-011 to FR-013 | T004, T007, T009 | `init` target config behavior, no command execution, no ancestor overwrite. |
| FR-014 to FR-016 | T004, T007, T009 | `doctor` read-only findings, stable severity/status/code fields. |
| FR-017 to FR-019 | T004, T007, T009 | `tasks` read-only inventory and JSON metadata. |
| FR-020 to FR-022 | T004, T008, T009 | Foreground `run`, lifecycle aliases, child exit preservation. |
| FR-023 to FR-026 | T011, T014, T015 | Managed `dev/start/restart`, longRunning requirement, duplicate refusal, partial failure. |
| FR-027 to FR-034 | T010, T013, T014, T015 | Runtime state/log shape, refresh, stale/unknown, logs, idempotent stop. |
| FR-035 to FR-041 | T016, T017, T018, T019 | Clean dry-run, safe/all, confirmation, containment refusal, no reset. |
| FR-042 to FR-051 | T003, T004, T008, T014, T018, T020 | JSON envelopes, stable errors, exit code stance, partial failures. |
| SC-001 to SC-005 | T020, T021, T022 | Local smoke, OS matrix, JSON/error code documentation, out-of-scope guard. |

## Analyze Remediation Mapping

| Finding ID | Disposition | Task/Section Evidence | Notes |
|------------|-------------|-----------------------|-------|
| No prior analyze blockers | not_applicable | First task-generation pass | No remediation mapping required |

## Phase 0: Implementation Guardrails

**Purpose**: Freeze scope, safety, and review expectations before code-writing tasks.

- [x] T001 Record embedded pre-implement review and v1 boundary confirmation in `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/implementation-review/reviews.ndjson`

**Checkpoint G0**: Pre-implement guardrails are recorded; no code task may start until T001 confirms `G-SCOPE`, `G-COMPAT`, `G-RUNTIME`, `G-CLEAN`, and `G-PLATFORM`.

## Phase 1: Setup And Contract Foundation

**Purpose**: Create shared test helpers and stable contract primitives that every story consumes.

- [x] T002 [P] Create reusable CLI fixture helpers in `F:/github/launchdeck/test/helpers/cli-fixture.js`
- [x] T003 Implement shared JSON/error output helpers in `F:/github/launchdeck/src/output.js` and `F:/github/launchdeck/src/errors.js`

**Join Point F1**: Run `node --check src/output.js src/errors.js test/helpers/cli-fixture.js`; pass condition is syntax-clean helper foundation.

## Phase 2: User Story 1 - Inspect And Run A Local Project (Priority: P1)

**Goal**: A user can create or load explicit config, inspect readiness/tasks, and run short tasks with stable JSON/errors/exit codes.  
**Independent Test**: From a temp project, `init`, `doctor --json`, `tasks --json`, `run build`, `run fail`, and aliases behave exactly as specified without starting managed processes or cleaning files.

### Tests for User Story 1

- [x] T004 [P] [US1] Add CLI contract tests for init, doctor, tasks, run, aliases, JSON, and exit codes in `F:/github/launchdeck/test/cli-contract.test.js`
- [x] T005 [P] [US1] Add config v1 root, version, cwd, log, task, and clean normalization tests in `F:/github/launchdeck/test/config-contract.test.js`

**Join Point US1-RED**: Run `node --test test/cli-contract.test.js test/config-contract.test.js`; pass condition is failures are expected missing-behavior failures, not syntax or fixture failures.

### Implementation for User Story 1

- [x] T006 [US1] Implement v1 config discovery, version, project root, task cwd/log validation, and normalized task type in `F:/github/launchdeck/src/config.js`
- [x] T007 [US1] Implement init, doctor, and tasks CLI behavior with stable JSON envelopes in `F:/github/launchdeck/src/cli.js`
- [x] T008 [US1] Implement foreground run, lifecycle alias, child exit-code, and command JSON behavior in `F:/github/launchdeck/src/cli.js` and `F:/github/launchdeck/src/runtime.js`
- [ ] T009 [US1] Validate User Story 1 and record checkpoint evidence in `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/implementation-review/reviews.ndjson`

## Phase 3: User Story 2 - Manage A Long-Running Dev Process (Priority: P2)

**Goal**: A user can start, inspect, read logs, restart, and stop one managed long-running task while preserving durable runtime evidence.  
**Independent Test**: From a temp project, `start dev --json`, duplicate start, `ps --json`, `logs dev --json`, stale-state refresh, idempotent `stop dev --json`, stop-all, and restart partial failure behavior are covered.

### Tests for User Story 2

- [ ] T010 [P] [US2] Add managed runtime state and stale/invalid/log tests in `F:/github/launchdeck/test/runtime-state.test.js`
- [ ] T011 [P] [US2] Add platform adapter and managed CLI lifecycle tests in `F:/github/launchdeck/test/managed-cli.test.js`

**Join Point US2-RED**: Run `node --test test/runtime-state.test.js test/managed-cli.test.js`; pass condition is failures reflect missing runtime/adapter behavior.

### Implementation for User Story 2

- [ ] T012 [US2] Implement process and path adapter modules in `F:/github/launchdeck/src/adapters/process.js` and `F:/github/launchdeck/src/adapters/path.js`
- [ ] T013 [US2] Implement runtime state v1, liveness refresh, logs, stop verification, stale/unknown/stop_failed states in `F:/github/launchdeck/src/runtime.js`
- [ ] T014 [US2] Implement managed command envelopes, duplicate-start code, restart partial failure, logs, ps, and stop CLI behavior in `F:/github/launchdeck/src/cli.js`
- [ ] T015 [US2] Validate User Story 2 and record checkpoint evidence in `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/implementation-review/reviews.ndjson`

## Phase 4: User Story 3 - Clean Generated State Safely (Priority: P3)

**Goal**: A user can preview cleanup, remove safe targets, require confirmation for risky targets, and never delete root/out-of-root/ambiguous targets.  
**Independent Test**: From a temp project, `clean --json`, `clean --safe --json`, `clean --all`, `clean --all --yes`, missing targets, root targets, out-of-root targets, and platform-available symlink/junction cases are covered.

### Tests for User Story 3

- [ ] T016 [P] [US3] Add clean dry-run, safe/all confirmation, missing target, root, out-of-root, and symlink/junction safety tests in `F:/github/launchdeck/test/clean-safety.test.js`

**Join Point US3-RED**: Run `node --test test/clean-safety.test.js`; pass condition is failures reflect missing canonical clean behavior.

### Implementation for User Story 3

- [ ] T017 [US3] Implement canonical clean target planning and refusal behavior in `F:/github/launchdeck/src/runtime.js` and `F:/github/launchdeck/src/adapters/path.js`
- [ ] T018 [US3] Implement clean dry-run/safe/all JSON envelopes and confirmation errors in `F:/github/launchdeck/src/cli.js`
- [ ] T019 [US3] Validate User Story 3 and record checkpoint evidence in `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/implementation-review/reviews.ndjson`

## Final Phase: Polish, Documentation, And Cross-Platform Evidence

**Purpose**: Keep docs, validation scripts, and release evidence aligned with v1 behavior.

- [ ] T020 Update v1 user docs, examples, schema, and public error-code references in `F:/github/launchdeck/README.md`, `F:/github/launchdeck/examples/`, and `F:/github/launchdeck/schema/launchdeck.schema.json`
- [ ] T021 Add Windows, macOS, and Linux lifecycle smoke workflow in `F:/github/launchdeck/.github/workflows/ci.yml`
- [ ] T022 Run full local checks plus quickstart smoke and record verification evidence in `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/implementation-review/reviews.ndjson`

## Task Contract Matrix

All tasks inherit default read scope `plan.md`, `spec.md`, `data-model.md`, `contracts/`, `quickstart.md`, `src/`, `test/`, `package.json`, `README.md`, and default forbidden scope `.env`, `*.pem`, `*.key`, credential files, secret directories, unrelated parent repository paths, and deferred product surfaces. Per-task packets under `task-packets/` mirror and expand this matrix.

| Task | agent | depends_on | parallel_safe | write_scope | acceptance | verify |
| --- | --- | --- | --- | --- | --- | --- |
| T001 | quality-reviewer | none | false | `implementation-review/reviews.ndjson` | Review records v1 boundary, forbidden drift, and embedded review policy. | Manual review of review entry |
| T002 | test-engineer | T001 | true | `test/helpers/cli-fixture.js` | Helpers create temp projects, run CLI, parse JSON, and clean safely. | `node --check test/helpers/cli-fixture.js` |
| T003 | executor | T001 | true | `src/output.js`, `src/errors.js` | Shared envelope/error helpers support success, failure, partial, and classified codes. | `node --check src/output.js src/errors.js` |
| T004 | test-engineer | T002,T003 | true | `test/cli-contract.test.js` | CLI contract tests cover US1 real entrypoints and fail before behavior exists. | `node --test test/cli-contract.test.js` |
| T005 | test-engineer | T002,T003 | true | `test/config-contract.test.js` | Config contract tests cover v1 discovery, validation, root, task type. | `node --test test/config-contract.test.js` |
| T006 | executor | T005 | false | `src/config.js` | Config v1 behavior passes config contract tests. | `node --test test/config-contract.test.js` |
| T007 | executor | T004,T006 | false | `src/cli.js` | `init`, `doctor`, `tasks` match JSON/read-only contract. | `node --test test/cli-contract.test.js` |
| T008 | executor | T004,T006,T007 | false | `src/cli.js`, `src/runtime.js` | Foreground run and aliases stream output and preserve child exit codes. | `node --test test/cli-contract.test.js` |
| T009 | quality-reviewer | T006,T007,T008 | false | `implementation-review/reviews.ndjson` | US1 join evidence shows checks passing and no scope drift. | `npm run check; npm test` |
| T010 | test-engineer | T002,T003 | true | `test/runtime-state.test.js` | Runtime state tests cover invalid/stale/log/idempotent states. | `node --test test/runtime-state.test.js` |
| T011 | test-engineer | T002,T003 | true | `test/managed-cli.test.js` | Managed CLI tests cover real entrypoints and adapter-visible behavior. | `node --test test/managed-cli.test.js` |
| T012 | executor | T010,T011 | false | `src/adapters/process.js`, `src/adapters/path.js` | Adapter modules isolate platform process/path behavior. | `node --check src/adapters/process.js src/adapters/path.js` |
| T013 | executor | T010,T012 | false | `src/runtime.js` | Runtime state v1 and process/log/stop semantics pass runtime tests. | `node --test test/runtime-state.test.js` |
| T014 | executor | T011,T012,T013 | false | `src/cli.js` | Managed commands emit stable JSON and partial failures. | `node --test test/managed-cli.test.js` |
| T015 | quality-reviewer | T012,T013,T014 | false | `implementation-review/reviews.ndjson` | US2 join evidence proves runtime inspectability and stop behavior. | `npm run check; npm test` |
| T016 | test-engineer | T002,T003 | true | `test/clean-safety.test.js` | Clean safety tests cover preview, safe/all, missing, root, out-of-root, ambiguous. | `node --test test/clean-safety.test.js` |
| T017 | security-reviewer | T012,T016 | false | `src/runtime.js`, `src/adapters/path.js` | Clean planner refuses unsafe targets before deletion. | `node --test test/clean-safety.test.js` |
| T018 | executor | T016,T017 | false | `src/cli.js` | Clean CLI output and exit behavior match contract. | `node --test test/clean-safety.test.js` |
| T019 | quality-reviewer | T017,T018 | false | `implementation-review/reviews.ndjson` | US3 join evidence proves cleanup remains non-reset. | `npm run check; npm test` |
| T020 | writer | T009,T015,T019 | true | `README.md`, `examples/`, `schema/launchdeck.schema.json` | Docs/examples/schema match implemented v1 commands/errors. | Manual doc/schema review plus `npm test` |
| T021 | executor | T009,T015,T019 | true | `.github/workflows/ci.yml` | CI matrix runs local checks and lifecycle smoke on all supported OSes. | YAML review plus local command parity |
| T022 | verifier | T020,T021 | false | `implementation-review/reviews.ndjson` | Full local verification and quickstart evidence recorded with claim level. | `npm run check; npm test`; quickstart smoke |

Packet fields for every task:

- `anti_goals`: no new dependencies unless explicitly justified; no deferred product surfaces; no destructive reset; no source edits outside `write_scope`; no human-text-only compatibility.
- `does_not_remove`: preserve `init`, `doctor`, `tasks`, `run`, aliases, managed runtime, clean, JSON/errors, and v1 scope unless task explicitly owns a tested change to that surface.
- `capability_operations`: listed per packet; each packet says implements, validates, preserves, or does-not-own.
- `consumer_surfaces`: CLI real entrypoints or generated docs/CI surfaces listed per packet.
- `required_evidence`: includes `real_entrypoint_evidence` for command-visible tasks.
- `handoff_format`: `status`, `changed_files`, `validation_output`, `concerns`, `recovery_hints`.
- `retry_max`: 2; `escalation`: `debugger` unless packet uses `security-reviewer` or `verifier`.

## Dependencies And Execution Order

### Phase Dependencies

- Phase 0 blocks every code-writing and test-writing task.
- Phase 1 starts after Phase 0 and creates shared helper/contract primitives.
- US1 can start after Phase 1 and should complete before US2/US3 implementation because it stabilizes JSON, root, and command conventions.
- US2 and US3 tests can start after Phase 1; their implementation waits for their RED join point and relevant adapter foundation.
- Final phase waits for US1, US2, and US3 join points.

### Parallel Batches And Join Points

- Batch F1: T002 and T003 can run in parallel. Join Point F1 validates helper foundation.
- Batch US1-RED: T004 and T005 can run in parallel. Join Point US1-RED validates expected failing tests.
- Batch US2-RED: T010 and T011 can run in parallel. Join Point US2-RED validates expected failing tests.
- Batch US3-RED: T016 is a single-lane batch. Join Point US3-RED validates expected failing tests.
- Batch POLISH: T020 and T021 can run in parallel after story joins. T022 is the final serial verification join.

## Parallel Example

```powershell
# After T001 and Phase 1 are ready, create independent US1 tests:
# Lane A: T004 test/cli-contract.test.js
# Lane B: T005 test/config-contract.test.js
# Join: run node --test test/cli-contract.test.js test/config-contract.test.js and confirm RED failures are behavior gaps.
```

## Implementation Dispatch

### Current Ready Batch Dispatch

- execution_model: adaptive
- execution_mode: standard
- workflow_status: ready
- dispatch_shape: leader-inline
- execution_surface: leader-inline
- capability_degraded: true
- blocked_reason: native subagent tools are available, but spawning is not authorized unless the user explicitly asks for subagents.
- current_ready_batch: T001 only

### Embedded Implement Review Preparation

- embedded_review_gate: required
- auto_repair_tasks: true
- review_window_policy: max_completed_tasks_before_review=5, max_unreviewed_changed_paths=8, max_unreviewed_validation_failures=0
- visible_review_command: none
- next_command: `/sp.implement`

## Confirmed Delivery Boundary

1. Complete guardrails and foundation.
2. Complete US1, US2, and US3 with their tests and join evidence.
3. Complete docs/schema/examples and OS matrix.
4. Run `npm run check`, `npm test`, and the quickstart smoke before claiming `dev-ready`.
5. Claim `cross-platform-ready` only after the same lifecycle smoke passes on Windows, macOS, and Linux.

## Implementation-Readiness Task Self-Audit

- buildable FR coverage: passed; FR-001 through FR-051 map to T004 through T022.
- success criteria coverage: passed; SC-001 through SC-005 map to T020 through T022 and story joins.
- locked decision preservation: passed through Guardrail Index and task anti-goals.
- guardrail mapping: passed; every implementation task maps to at least one guardrail.
- capability operation mapping: passed; all in-scope operations map to tasks and validation.
- user-observable path coverage: passed; every CLI/runtime-visible surface has a real-entrypoint validation task.
- DP1 packet readiness: passed; each task has objective, dependency, write scope, read scope, forbidden scope.
- DP2 packet readiness: passed; each task has verification commands, acceptance criteria, and handoff fields.
- DP3 packet readiness: passed as far as task generation can determine; high-risk joins require embedded review before continuation.
- reference fidelity mapping: not_applicable; active profile is Standard Delivery.
- unmapped task status: passed; setup/polish tasks are justified.
- write-set conflict status: passed; parallel batches have isolated write scopes and join points before shared consumers.

## Recommended Next Command

`/sp.implement`
