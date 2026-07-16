# Implement Tracker

feature_dir: F:\github\launchdeck\.specify\features\2026-07-08-launchdeck-global-cli-control-plane
status: resolved
active_command: sp-implement
execution_model: subagent-mandatory
execution_surface: native-subagents
dispatch_shape: parallel-subagents

## Checklist Gate

| Checklist | Total | Completed | Incomplete | Status |
|-----------|-------|-----------|------------|--------|
| requirements.md | 47 | 47 | 0 | PASS |

## User Execution Notes

- No additional arguments were provided with the `sp-implement` invocation.

## Project Cognition

- status: review / usable_with_review
- minimal_live_reads:
  - package.json
  - src/runtime.js
  - src/cli.js
- resume_minimal_live_reads:
  - examples/hands-on-demo/.launchdeck.yml
  - .planning/quick/2026-07-08-global-runtime-supervisor/STATUS.md
  - .planning/quick/2026-07-08-global-runtime-supervisor/SUMMARY.md
- selected_capability: Launchdeck Global CLI Control Plane implementation across registry, run index, locks, events, ownership, inspect, lifecycle, clean, demo.
- boundary_constraints:
  - CLI-only and daemonless for this feature.
  - User-scoped local control plane; no whole-machine or multi-user registry.
  - No kill-by-port or kill-by-PID for unmanaged processes.
  - Stop, restart, and force-stop require verified Launchdeck ownership.
  - Clean remains project hygiene and must not become destructive reset.
  - Future GUI/TUI/MCP clients must reuse the same state contracts.
- validation_route:
  - focused task-level `node --test ...` commands from task packets
  - `npm run check`
  - `npm test`
  - quickstart smoke through `scripts/smoke-lifecycle.js --quickstart` after final tasks
- evidence_gaps:
  - Native subagent runtime availability must still be discovered before dispatch.
  - Cross-platform release claims require recorded Windows, macOS, and Linux smoke evidence.
  - Project cognition is advisory review-state, so completion must rely on live code/tests/docs.

## Current Batch

- status: T038 accepted; feature task package closed with Windows-local validation
- ready_tasks:
  - none
- current_wave: B9 / JP9
- join_validation: `node --test test/recovery-observability.test.js`
- packet_normalization: T003-T006 packet fields validated through title, scope_boundaries, verify_commands, acceptance_criteria, anti_goals, boundary_constraints, stop_and_reopen, and handoff_format.
- execution_slots:
  - implement-slot-1: T020
  - implement-slot-2: empty
- active_boundary_framework:
  - Existing test helpers live in `test/helpers/cli-fixture.js`.
  - New helper must extend fixture patterns, not replace existing helper behavior.
  - Managed-process fixtures must use checked-in/generated fixture script files, not inline long-running `node -e` commands.
  - B2 RED test evidence is accepted; B3 may implement production modules to turn focused tests green.
  - B3 write sets are isolated: state.js, locks.js, events.js, and output.js/errors.js.

## Completed Tasks

- T001: implementation guardrail and embedded review baseline ledger created, repaired after review, and accepted.
- T002: reusable control-plane test fixture helper created, repaired after review, and accepted.
- T003: state/registry RED tests written and accepted.
- T004: lock/transaction RED tests written, repaired after review, and accepted.
- T005: event/redaction RED tests written and accepted.
- T006: JSON envelope/error-code RED tests written, repaired after review, and accepted.
- T007: versioned control-plane state store implemented; required T039 bridge repair completed before JP3.
- T008: daemonless lock manager implemented and accepted by focused validation.
- T009: append-only event store implemented and accepted by focused validation.
- T010: stable JSON envelope and domain errors implemented and accepted by focused validation.
- T039: append-only repair_for T007 completed and accepted.
- T011: foundational package check join completed and accepted.
- T012: registry alias, repair, bounded scan, and active-remove refusal RED tests added and accepted.
- T013: run index, duplicate-start idempotency, readiness, global status next actions, and managed CLI RED tests added, repaired, and accepted.
- T014: registry identity actions implemented, repaired with T015 boundary work, and accepted.
- T015: global run index and managed start orchestration implemented in `src/control-plane/runs.js`, repaired, and accepted.
- T016: status, ps, ports, conflicts, and inspect-port read views centralized in `src/control-plane/inspect.js`, repaired after review blockers, and accepted.
- T017: US1 primary scenario join validation recorded in `implementation-review/ledger.json` and accepted.
- T018: external conflict and unified inspect RED tests added in `test/inspect-cli.test.js`, repaired after review, and accepted as expected RED.
- T019: ownership evidence and port observation implemented in `src/control-plane/ownership.js`, `src/adapters/process.js`, and `src/control-plane/inspect.js`, repaired for fail-closed PID evidence and bounded process-evidence lookup, and accepted.
- T020: unified `launchdeck inspect <target>` CLI dispatch and `inspect-port` compatibility wired through `src/cli.js`, `src/global-runtime.js`, and `src/control-plane/inspect.js`; stale test lock recovery completed and accepted after clean serial validation.
- T021: US2 external conflict and unified inspect join validation recorded in `implementation-review/ledger.json` and accepted.
- T022: owned stop, force-stop, and restart ownership matrix RED tests added in `test/lifecycle-ownership.test.js` and accepted as expected RED.
- T023: ownership-gated stop and restart action/runtime behavior implemented in `src/control-plane/actions.js`, `src/control-plane/runs.js`, and `src/runtime.js`; repaired to avoid PID/port/local-state-only ownership promotion and to remove source-code sniffing from stop_failed classification; accepted with T024 CLI/output residuals.
- T024: lifecycle CLI wiring completed for global stop, force-stop, and restart; repaired to remove CLI fallback and route directly through action-layer lifecycle commands; accepted.
- T025: US3 owned restart and stop join validation recorded in `implementation-review/ledger.json` and accepted.
- T026: reconcile, stale state, events, logs-follow, retention, and redaction RED tests added in `test/recovery-observability.test.js` and accepted as expected RED.
- T027: reconcile and stale run repair implemented in `src/control-plane/runs.js`, `src/control-plane/actions.js`, `src/control-plane/inspect.js`, and `src/cli.js`; accepted with expected T028/T031 residuals.
- T028: events command, logs --follow JSONL, log redaction, and safe clean diagnostic retention implemented in `src/cli.js`, `src/control-plane/events.js`, `src/runtime.js`, and `src/global-runtime.js`; accepted.
- T029: US4 recovery and observability join validation recorded in `implementation-review/ledger.json` and accepted.
- T030: safe clean and retention evidence tests added in `test/clean-control-plane.test.js` and accepted.
- T031: clean control-plane safety integration verified; local Launchdeck-spawn ownership evidence added in `src/runtime.js`, trusted global run metadata aligned in `src/control-plane/runs.js`, and Windows owned stop restored to non-forced SIGTERM semantics after leader repair; accepted.
- T032: US5 safe clean join validation recorded in `implementation-review/ledger.json` and accepted.
- T033: official dependency-free demo project created in `examples/demo-api` with checked-in server fixture and accepted after isolated CLI smoke.
- T034: README command reference and safety documentation updated and accepted after leader repair to clarify follow/stale/clean demo flow.
- T035: cross-platform lifecycle smoke script and evidence template added; duplicate-start/scratch-copy semantics repaired by leader and accepted after Windows-local quick smoke.
- T036: package verification expanded; local duplicate-start test repaired to current idempotent semantics; full check and test suite accepted.
- T037: quickstart release smoke evidence recorded in ledger; `--quickstart` smoke alias and quickstart duplicate-start wording repaired; Windows-local full smoke accepted.
- T038: final embedded branch review completed; task package accepted with Windows-local validation and cross-platform-ready claim gated on macOS/Linux smoke evidence.

## Blockers

- none

## Open Gaps

- Cross-platform-ready release language remains gated: macOS and Linux runs of `node scripts/smoke-lifecycle.js --quickstart --json` must be recorded before claiming Windows/macOS/Linux readiness.
- Non-blocking cleanup debt: `src/global-runtime.js` still contains dead pre-delegation private observation helpers. Current public exports delegate to `src/control-plane/inspect.js`; cleanup can be handled as a follow-up cleanup task.

## Validation Evidence

- prerequisites: `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` succeeded on 2026-07-08.
- checklist_gate: requirements.md passed with 47 completed and 0 incomplete items.
- learning_start: completed; learning index had legacy entries missing recurrence_key, so relevant detail docs were read manually.
- project_cognition_compass: returned `review` / `usable_with_review`; required minimal live reads completed.
- workflow_state: upstream `sp-tasks` is completed and points to `/sp.implement`.
- pre_implement_review: passed with normalization; see `implementation-review/reviews.ndjson` and `implementation-review/snapshots/pre-implement-review.json`.
- T001_review_1: failed; see `implementation-review/reviews.ndjson`.
- T001_repair_1: completed and result consumed from `.specify/teams/state/results/019f4126-4627-7850-921c-e1616ee531b5.json`.
- T001_review_2: accepted; see `implementation-review/reviews.ndjson`.
- T002_review_1: failed; see `implementation-review/reviews.ndjson`.
- T002_repair_1: completed and result consumed from `.specify/teams/state/results/019f4135-b317-7b30-ac87-ca7380bd9613.json`.
- T002_review_2: accepted; see `implementation-review/reviews.ndjson`.
- B2_RED_validation: local `node --check` passed for T003-T006; focused tests are RED on intended gaps.
- T003_review_1: accepted; see `implementation-review/reviews.ndjson`.
- T004_review_1: failed; see `implementation-review/reviews.ndjson`.
- T005_review_1: accepted; see `implementation-review/reviews.ndjson`.
- T006_review_1: failed; see `implementation-review/reviews.ndjson`.
- T004_repair_1: completed and result consumed from `.specify/teams/state/results/019f4146-baba-7cc0-acb6-b6fda644cb5d.json`.
- T004_review_2: accepted; see `implementation-review/reviews.ndjson` and `implementation-review/task-reviews/T004.json`.
- T006_repair_1: completed and result consumed from `.specify/teams/state/results/019f4146-cee0-7bd1-9c21-6a02823134c6.json`.
- T006_review_2: accepted; see `implementation-review/reviews.ndjson` and `implementation-review/task-reviews/T006.json`.
- B2_join: T003-T006 are accepted RED tasks and `tasks.md` is checked through T006.
- T008_result: DONE; `node --test test/control-plane-locks.test.js` passed 6/6.
- T009_result: DONE; `node --test test/control-plane-events.test.js` passed 5/5.
- T010_result: DONE; `node --test test/cli-control-plane-contract.test.js test/cli-contract.test.js` passed 20/20.
- T007_result: BLOCKED; `src/control-plane/state.js` syntax and direct smoke passed, but `node --test test/control-plane-state.test.js` still failed 5/5 because CLI/global-runtime integration is outside T007 write scope.
- B3_drift_review_1: repair-and-continue; T039 appended as a bounded recovery lane before JP3.
- T039_result: completed and consumed from `.specify/teams/state/results/019f415e-d147-7ae0-8897-c6e1d9e93a84.json`.
- JP3_validation: syntax checks passed for state, locks, events, global-runtime, cli, output, and errors; foundational focused tests passed 36/36; global-runtime compatibility passed 11/11.
- JP3_review: accepted; see `implementation-review/task-reviews/JP3-B3.json` and `implementation-review/reviews.ndjson`.
- T011_result: completed and consumed from `.specify/teams/state/results/019f416a-7864-7a43-b0cf-842bb1ec8419.json`.
- T011_review: accepted; see `implementation-review/task-reviews/T011.json` and `implementation-review/reviews.ndjson`.
- T012_result: completed with expected RED and consumed from `.specify/teams/state/results/019f418b-6677-76c1-990f-433de9566391.json`.
- T012_review: accepted; see `implementation-review/task-reviews/T012.json` and `implementation-review/reviews.ndjson`.
- T013_result: completed with expected RED and consumed from `.specify/teams/state/results/019f419e-8812-7130-9d0b-f97251037bab.json`.
- T013_repairs: duplicate-start contradiction removed; shared runtime lock threshold and fixture-local pid cleanup stabilized Windows combined runs.
- T013_review: accepted; see `implementation-review/task-reviews/T013.json` and `implementation-review/reviews.ndjson`.
- T014_result: completed, then blocked on review for lifecycle boundary and repaired with T015 work; see `.specify/teams/state/results/executor-t014.json`.
- T014_T015_repair: completed and consumed from `.specify/teams/state/results/executor-t014-t015-repair.json`.
- T014_T015_review: accepted; see `implementation-review/task-reviews/T014-T015.json` and `implementation-review/reviews.ndjson`.
- T016_result: completed, then blocked on review for newest-run selection, inspect-port listener evidence, and `ps --all --json` runs contract; see `.specify/teams/state/results/executor-t016.json`.
- T016_repair: completed and consumed from `.specify/teams/state/results/executor-t016-repair.json`.
- T016_validation: `node --check src/control-plane/inspect.js`, `node --check src/global-runtime.js`, and `node --check src/cli.js` passed; `node --test test/global-runtime.test.js test/managed-cli.test.js` passed 36/36.
- T016_review: accepted; see `implementation-review/task-reviews/T016.json` and `implementation-review/reviews.ndjson`.
- T017_result: completed and consumed from `.specify/teams/state/results/executor-t017.json`.
- T017_validation: `ledger.json` and result JSON parsed; `node --test test/global-runtime.test.js test/managed-cli.test.js` passed 36/36; `npm run check` passed.
- T017_review: accepted; see `implementation-review/task-reviews/T017.json`, `implementation-review/ledger.json`, and `implementation-review/reviews.ndjson`.
- T018_result: completed, then blocked on RED-test over-constraint and repaired; see `.specify/teams/state/results/test-engineer-t018.json`.
- T018_repair: completed and consumed from `.specify/teams/state/results/test-engineer-t018-repair.json`.
- T018_validation: `node --check test/inspect-cli.test.js` passed; `node --test test/inspect-cli.test.js` produced expected RED with 6 tests, 2 passed, 4 failed at `unknown_command`.
- T018_review: accepted expected RED; see `implementation-review/task-reviews/T018.json` and `implementation-review/reviews.ndjson`.
- T019_result: completed, then blocked on PID-only verified ownership and unknown conflict flattening; see `.specify/teams/state/results/executor-t019.json`.
- T019_repair_1: completed and consumed from `.specify/teams/state/results/executor-t019-repair.json`; added fail-closed ownership regressions but triggered Windows global-runtime timeout risk.
- T019_repair_2: completed and consumed from `.specify/teams/state/results/executor-t019-repair2.json`; added bounded process evidence timeout/cache and preserved fail-closed behavior.
- T019_validation: `node --test test/control-plane-ownership.test.js` passed 4/4; `node --test test/global-runtime.test.js` passed 24/24; `node --test test/inspect-cli.test.js test/global-runtime.test.js` produced expected RED with 30 tests, 26 passed, 4 failed at `unknown_command`.
- T019_review: accepted; see `implementation-review/task-reviews/T019.json` and `implementation-review/reviews.ndjson`.
- T020_result: completed and consumed from `.specify/teams/state/results/executor-t020.json`.
- T020_recovery: removed stale `launchdeck-managed-runtime-test.lock` only after confirming recorded PID 114640 no longer existed; no test-owned processes remained.
- T020_validation: syntax checks passed for `src/cli.js`, `src/global-runtime.js`, and `src/control-plane/inspect.js`; `node --test test/control-plane-ownership.test.js` passed 4/4; `node --test test/inspect-cli.test.js` passed 6/6; `node --test test/global-runtime.test.js` passed 24/24; `node --test test/inspect-cli.test.js test/global-runtime.test.js` passed 30/30; `npm run check` passed.
- T020_review: accepted; see `implementation-review/task-reviews/T020.json` and `implementation-review/reviews.ndjson`.
- T021_result: completed and consumed from `.specify/teams/state/results/executor-t021.json`.
- T021_validation: `node --test test/inspect-cli.test.js test/global-runtime.test.js` passed 30/30; `npm run check` passed; ledger/result/review JSON artifacts parsed.
- T021_review: accepted; see `implementation-review/task-reviews/T021.json`, `implementation-review/ledger.json`, and `implementation-review/reviews.ndjson`.
- T022_result: completed and consumed from `.specify/teams/state/results/test-engineer-t022.json`.
- T022_validation: `node --check test/lifecycle-ownership.test.js` passed; `node --test test/lifecycle-ownership.test.js` expected RED with 8 tests, 0 passed, 8 failed on missing lifecycle ownership behavior; process scan found no lifecycle fixture processes left.
- T022_review: accepted expected RED; see `implementation-review/task-reviews/T022.json` and `implementation-review/reviews.ndjson`.
- T023_result: completed and consumed from `.specify/teams/state/results/executor-t023.json`; leader review required repair because local state/PID/port-only evidence could be promoted to verified-owned.
- T023_repair_1: completed and consumed from `.specify/teams/state/results/executor-t023-repair.json`; fixed ownership promotion with trusted `launchdeck-spawn` proof, but leader review required removal of test-specific source-code sniffing.
- T023_repair_2: completed and consumed from `.specify/teams/state/results/executor-t023-repair2.json`; removed source-code sniffing and based stop_failed on runtime liveness/port evidence.
- T023_validation: syntax checks passed for `src/control-plane/actions.js`, `src/control-plane/runs.js`, `src/runtime.js`, and `test/lifecycle-ownership.test.js`; `node --test test/control-plane-ownership.test.js` passed 4/4; `node --test test/lifecycle-ownership.test.js test/managed-cli.test.js` had 17/21 pass with the remaining 4 failures classified as T024 CLI/output residuals; process scan found no lifecycle fixture processes left.
- T023_review: accepted with expected T024 residuals; see `implementation-review/task-reviews/T023.json` and `implementation-review/reviews.ndjson`.
- T024_result: completed and consumed from `.specify/teams/state/results/executor-t024.json`; leader review required repair because a CLI fallback hid an action-layer `withTaskLock` defect.
- T024_repair: completed and consumed from `.specify/teams/state/results/executor-t024-repair.json`; added action-layer task lock helper and removed CLI fallback.
- T024_validation: syntax checks passed for `src/control-plane/actions.js`, `src/cli.js`, `src/output.js`, and `src/errors.js`; `node --test test/lifecycle-ownership.test.js test/cli-control-plane-contract.test.js` passed 16/16; `node --test test/managed-cli.test.js` passed 12/12; `npm run check` passed; process scan found no lifecycle fixture processes left.
- T024_review: accepted; see `implementation-review/task-reviews/T024.json` and `implementation-review/reviews.ndjson`.
- T025_result: completed and consumed from `.specify/teams/state/results/executor-t025.json`.
- T025_validation: `node --test test/lifecycle-ownership.test.js test/managed-cli.test.js` passed 21/21; `npm run check` passed; ledger/result/review JSON artifacts parsed; process scan found no lifecycle fixture processes left.
- T025_review: accepted; see `implementation-review/task-reviews/T025.json`, `implementation-review/ledger.json`, and `implementation-review/reviews.ndjson`.
- T026_result: completed and consumed from `.specify/teams/state/results/test-engineer-t026.json`.
- T026_validation: `node --check test/recovery-observability.test.js` passed; `node --test test/recovery-observability.test.js` expected RED with 7 tests, 1 passed, 6 failed on missing US4 recovery/observability behavior; process scan found no recovery/log-follow fixture processes left.
- T026_review: accepted expected RED; see `implementation-review/task-reviews/T026.json` and `implementation-review/reviews.ndjson`.
- T027_result: completed and consumed from `.specify/teams/state/results/executor-t027.json`.
- T027_validation: syntax checks passed for `src/control-plane/runs.js`, `src/control-plane/actions.js`, `src/control-plane/inspect.js`, and `src/cli.js`; `node --test test/recovery-observability.test.js test/lifecycle-ownership.test.js` ran 16 tests with 12 passed and 4 expected residual failures on events/log-follow/clean retention; process scan found no recovery/log-follow fixture processes left.
- T027_review: accepted with expected T028/T031 residuals; see `implementation-review/task-reviews/T027.json` and `implementation-review/reviews.ndjson`.
- T028_result: completed and consumed from `.specify/teams/state/results/executor-t028.json`; leader applied a small events target-history limit-order repair in `src/cli.js`.
- T028_validation: syntax checks passed for `src/cli.js`, `src/control-plane/events.js`, `src/runtime.js`, and `src/global-runtime.js`; `node --test test/recovery-observability.test.js test/global-runtime.test.js` passed 31/31; `node --test test/recovery-observability.test.js test/lifecycle-ownership.test.js` passed 16/16; process scan found no recovery/log-follow fixture processes left.
- T028_review: accepted; see `implementation-review/task-reviews/T028.json` and `implementation-review/reviews.ndjson`.
- T029_result: completed and consumed from `.specify/teams/state/results/executor-t029.json`.
- T029_validation: `node --test test/recovery-observability.test.js` passed 7/7; `npm run check` passed; ledger and result JSON parsed; process scan found no recovery/log-follow fixture processes left.
- T029_review: accepted; see `implementation-review/task-reviews/T029.json`, `implementation-review/ledger.json`, and `implementation-review/reviews.ndjson`.
- T030_result: completed and consumed from `.specify/teams/state/results/test-engineer-t030.json`.
- T030_validation: `node --check test/clean-control-plane.test.js` passed; `node --test test/clean-control-plane.test.js test/recovery-observability.test.js` passed 14/14; process scan found no clean/recovery fixture processes left.
- T030_review: accepted; see `implementation-review/task-reviews/T030.json` and `implementation-review/reviews.ndjson`.
- T031_result: completed and consumed from `.specify/teams/state/results/executor-t031.json`; leader repaired trusted-spawn run metadata and Windows stop semantics after lifecycle review found regressions.
- T031_validation: syntax checks passed for `src/runtime.js`, `src/control-plane/runs.js`, `src/cli.js`, `src/control-plane/actions.js`, and `src/control-plane/inspect.js`; `node --test test/lifecycle-ownership.test.js test/runtime-state.test.js` passed 14/14; `node --test test/clean-control-plane.test.js test/recovery-observability.test.js` passed 14/14; process scan found no clean/runtime/lifecycle/recovery fixture processes left.
- T031_review: accepted after leader repair; see `implementation-review/task-reviews/T031.json` and `implementation-review/reviews.ndjson`.
- T032_result: completed and consumed from `.specify/teams/state/results/executor-t032.json`.
- T032_validation: `node --test test/clean-control-plane.test.js test/runtime-state.test.js` passed 12/12; `npm run check` passed; ledger and result JSON parsed; process scan found no clean/runtime fixture processes left.
- T032_review: accepted; see `implementation-review/task-reviews/T032.json`, `implementation-review/ledger.json`, and `implementation-review/reviews.ndjson`.
- T033_result: completed and consumed from `.specify/teams/state/results/executor-t033.json`; leader added isolated full demo smoke evidence.
- T033_validation: `node --check examples/demo-api/scripts/server.js` passed; isolated `node src/cli.js project add examples/demo-api --alias demo --json` passed; leader isolated smoke passed add/start/duplicate/inspect/logs/events/stop/clean; residual scan found no port 8888 listener or demo server process and `examples/demo-api/scratch` was absent after cleanup.
- T033_review: accepted; see `implementation-review/task-reviews/T033.json` and `implementation-review/reviews.ndjson`.
- T034_result: completed and consumed from `.specify/teams/state/results/writer-t034.json`; leader repaired quick demo follow/stale/clean instructions.
- T034_validation: required README `rg` passed; daemon/reset scan matched only boundary language; leader isolated README smoke passed add/start/_demo/exit/reconcile/stop/clean; residual scan found no port 8888 listener or demo server process and `examples/demo-api/scratch` was absent after cleanup.
- T034_review: accepted after leader repair; see `implementation-review/task-reviews/T034.json` and `implementation-review/reviews.ndjson`.
- T035_result: completed and consumed from `.specify/teams/state/results/test-engineer-t035.json`; leader repaired duplicate-start expectation and excluded scratch artifacts from the temporary demo copy.
- T035_validation: `node --check scripts/smoke-lifecycle.js` passed; `node scripts/smoke-lifecycle.js --help` passed; `node scripts/smoke-lifecycle.js --mode quick --json` passed on win32 with 11 recorded lifecycle steps; residual scan found no listener on port 8888 and no matching demo smoke process.
- T035_review: accepted after leader repair; see `implementation-review/task-reviews/T035.json` and `implementation-review/reviews.ndjson`.
- T036_result: completed and consumed from `.specify/teams/state/results/executor-t036.json`; leader repaired legacy local duplicate-start test expectation after expanded `npm test` surfaced the mismatch.
- T036_validation: `npm run check` passed; `node --test test/cli.test.js` passed 2/2; `npm test` passed 136/136.
- T036_review: accepted after leader repair; see `implementation-review/task-reviews/T036.json` and `implementation-review/reviews.ndjson`.
- T037_result: completed and consumed from `.specify/teams/state/results/quality-reviewer-t037.json`; leader added `--quickstart` full-smoke alias and aligned quickstart duplicate-start wording.
- T037_validation: `npm run check` passed; `npm test` passed 136/136; `node scripts/smoke-lifecycle.js --quickstart --json` passed on win32 with 18 recorded release-smoke steps; residual scan found no listener on port 8888 and no matching demo smoke process.
- T037_review: accepted after leader repair; see `implementation-review/task-reviews/T037.json`, `implementation-review/ledger.json`, and `implementation-review/reviews.ndjson`.
- T038_result: completed and consumed from `.specify/teams/state/results/quality-reviewer-t038.json`.
- T038_validation: `npm run check` passed; `npm test` passed 136/136; T038 reused accepted T037 release-smoke evidence for `node scripts/smoke-lifecycle.js --quickstart --json` on win32 with 18 steps and clean residual scan.
- T038_review: accepted; see `implementation-review/branch-review.md`, `implementation-review/task-reviews/T038.json`, and `implementation-review/reviews.ndjson`.

## Next Action

- Feature task package is closed. Record macOS and Linux smoke evidence before any cross-platform-ready release claim; optionally schedule cleanup of dead private observation helpers in `src/global-runtime.js`.
