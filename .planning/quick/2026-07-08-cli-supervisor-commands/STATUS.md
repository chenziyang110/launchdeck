---
id: 2026-07-08-cli-supervisor-commands
slug: cli-supervisor-commands
title: CLI supervisor command surface
status: resolved
trigger: "[$sp-quick] do it"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: 2026-07-08
updated: 2026-07-08
---

## Discussion Handoff Source

handoff_consumer: none
source_discussion_slug: none
source_handoff_md: none
source_handoff_json: none
source_files_read: []

## Current Focus

goal: Add the next bounded CLI supervisor slice for Launchdeck global project/task management.
current_focus: Completed and leader-verified bounded CLI supervisor command slice.
next_action: Ready for user review or the next CLI/UI planning slice.

## Execution Intent

intent_outcome: Provide a more usable CLI management surface on top of the existing global runtime supervisor.
intent_constraints:
  - Keep the quick task bounded to CLI commands and their supporting registry/runtime helpers.
  - Preserve owned-only process control; do not stop or force-kill unknown external processes.
  - Avoid inline long-running test commands such as `node -e "setInterval(...)"`; use fixture scripts for managed-process tests.
  - Keep `project scan` explicit-directory only, bounded, and ignore heavy/generated folders.
success_evidence:
  - New failing tests are captured before production edits.
  - Targeted global-runtime/CLI tests pass.
  - `npm run check` and `npm test` pass before closeout.
cognition_facts:
  selected_capability: Launchdeck CLI supervisor global status, conflict diagnostics, registry maintenance, and cross-project logs.
  readiness: review
  compass_state: usable_with_review
  minimal_reads:
    - .planning/quick/2026-07-08-global-runtime-supervisor/STATUS.md
    - src/cli.js
    - test/cli.test.js
  validation_route: Add targeted CLI/global runtime tests, then run full project verification.
  known_risk: Project cognition coverage is partial for the new command names; live code and tests must prove final scope.

## Understanding Checkpoint

checkpoint:
  issue: Launchdeck can already register projects, show global processes/ports, inspect ports, and stop/restart Launchdeck-owned tasks. The next CLI gap is the operator experience: a person still needs a clear all-project status view, a conflict-focused view, registry cleanup, bounded project discovery, and easy cross-project log access. This is not a request for GUI, daemon, or killing unknown external processes.
  issue_detail: The core pain is duplicate service starts and port conflicts after agents or humans run projects repeatedly; the CLI should make the current project-service picture obvious and precise.
  expected_or_target: Add `status --all`, `conflicts`, `project remove <name>`, `project scan <dir>`, and `logs project:task` with a bounded `--follow` behavior if it remains testable and safe inside this quick task.
  known_facts:
    - Previous quick task completed project registry, `ps --all`, `ports`, `inspect-port`, and owned-only `start/stop/restart project:task`.
    - Project cognition returned readiness `review` and minimal reads for the previous quick status, `src/cli.js`, and `test/cli.test.js`.
    - Existing safety obligations require no automatic stop/restart of unknown external processes.
    - Windows managed-process tests should use fixture scripts, not inline `node -e "setInterval(...)"`.
  unknowns_or_risks:
    - `logs --follow` may become an interactive long-running behavior; if it cannot be tested without fragile hanging tests, implement non-follow global logs now and keep follow minimal or route the richer watch behavior to a later spec.
    - `project scan` could become expensive or surprising if it searches too widely; keep it explicit, bounded, and ignore common heavy folders.
  will_change:
    - CLI command parsing/help and user-facing command docs.
    - Global registry/runtime helpers needed for remove, scan, status, conflicts, and logs.
    - Focused tests for the new CLI surfaces.
  will_not_change:
    - No GUI/dashboard.
    - No daemon/background service.
    - No external process takeover or kill-by-port behavior.
    - No automatic whole-machine scan.
    - No Docker/container orchestration.
  affected_surfaces:
    - src/cli.js
    - src/global-runtime.js
    - runtime/log helper surfaces if needed
    - test/global-runtime.test.js and/or test/cli.test.js
    - README.md
    - .planning/quick/2026-07-08-cli-supervisor-commands artifacts
  execution_approach: one-subagent after confirmation for the bounded implementation lane, with leader-owned status, integration, validation, and closeout.
  implementation_plan:
    - Add RED tests for the new command behavior and verify they fail before production edits.
    - Implement registry removal and bounded scan helpers.
    - Implement all-project status and conflict-focused reporting using existing process/port ownership rules.
    - Extend logs to support registered `project:task` targets and add bounded `--follow` only if safe.
    - Update docs, run targeted tests, run full project checks, then run project-cognition closeout.
  next_action: After confirmation, dispatch or execute the first lane to create failing tests for the target CLI commands.
  validation_evidence:
    - `node --test test/global-runtime.test.js` or equivalent targeted suite.
    - `npm run check`.
    - `npm test`.
  stop_condition: Stop and route to `$sp-specify` if the desired behavior requires daemon/watch architecture, privileged process control, automatic external process killing, broad project crawling, or unresolved interactive `--follow` semantics.
  done_or_progress_signal:
    - New commands work in isolated fixtures and docs describe the safe operating model.
  user_corrections:
    - 2026-07-08 user confirmed with "确认执行".

## Execution

active_lane: cli-supervisor-command-implementation
join_point: completed
files_or_surfaces: src/cli.js, src/global-runtime.js, src/errors.js, test/global-runtime.test.js, test/cli-contract.test.js, README.md, .specify/memory/learnings/INDEX.md, .specify/memory/learnings/launchdeck-git-root-closeout-scope.md
blocked_dispatch: none
blockers: []
recovery_action: none
retry_attempts: 0
blocker_reason: none
result:
  implemented:
    - `launchdeck status --all`
    - `launchdeck conflicts`
    - `launchdeck project remove <name|id|path>`
    - `launchdeck project scan <dir>`
    - `launchdeck logs project:task`
    - public error contract entries for `unsupported_option`, `scan_root_not_found`, and `scan_root_invalid`
    - reusable project learning for broad `F:/github` git-root closeout scoping
  deferred:
    - `launchdeck logs --follow` richer watch/tail behavior; CLI now returns `unsupported_option` instead of silently accepting it.

## Validation

planned_checks:
  - RED targeted tests before production edits.
  - Targeted global-runtime/CLI tests.
  - npm run check.
  - npm test.
completed_checks:
  - command: node --test test/global-runtime.test.js
    phase: RED
    result: failed as expected after tests only; new command assertions returned status 1 before implementation.
  - command: node --test test/global-runtime.test.js
    phase: GREEN targeted
    result: passed 10/10.
  - command: node --test test/global-runtime.test.js
    phase: leader targeted rerun before follow regression test
    result: passed 10/10.
  - command: node --test test/global-runtime.test.js
    phase: leader targeted final rerun
    result: passed 11/11 after adding explicit `logs --follow` unsupported regression coverage.
  - command: npm run check
    phase: leader final syntax
    result: passed.
  - command: npm test
    phase: leader final full
    result: passed 64/64.
  - command: rg "node -e .*setInterval|command: .*node -e .*setInterval|setInterval\\(.*\\)" test src examples README.md package.json -n
    phase: safety scan
    result: no inline `node -e` long-running commands; only fixture/example script bodies contain `setInterval`.

## Senior Consequence Analysis

gate_status: triggered_bounded
stand_down_reason: not applicable
affected_objects:
  - CLI commands: `status --all`, `conflicts`, `project remove`, `project scan`, `logs project:task`, and help output.
  - Global project registry records.
  - Project-local runtime state and log files referenced from registered projects.
  - Port ownership/conflict reporting.
  - Humans or agents consuming CLI text/JSON-like output.
state_behavior_matrix:
  - created/registered -> appears in all-project status and can be removed from registry without deleting files.
  - running -> appears in status, conflict, ports, and logs views with Launchdeck ownership context.
  - failed/completed -> visible as non-running or historical state, not treated as a healthy active service.
  - missing/stale -> reported without silently deleting registry entries.
  - external/unknown -> reported as a conflict/occupant where relevant, but never killed automatically.
dependency_impact:
  - CLI parser/help -> new commands must not regress existing single-project command behavior.
  - global runtime helper -> registry and port semantics must remain idempotent and test-isolated.
  - process adapter -> ownership confidence remains below destructive action policy.
  - docs/tests -> command surface must stay synchronized.
recovery_and_validation:
  - Rollback remains file-scoped to CLI/runtime/docs/tests.
  - `project remove` is registry-only and idempotent enough to retry safely.
  - `project scan` is explicit-directory and bounded to avoid accidental broad crawling.
  - Validation must include targeted tests and full project verification.
project_cognition_evidence:
  - compass readiness: review
  - minimal reads: previous global runtime supervisor STATUS, src/cli.js, test/cli.test.js
  - previous quick status confirmed owned-only safety obligations and Windows test constraints.
  - closeout update: `upd-20260708T040642.194681000Z`, result_state `partial_refresh`, readiness `review`.
  - learning capture added after the first closeout because the broad `F:/github` git root is a recurring workflow pitfall.
  - cognition ignored learning files by `.cognitionignore`; they remain written as project memory.
coverage_gaps:
  - Exact `logs --follow` semantics remain risk-bearing until live code/test inspection; latest resolve phase before implementation of follow behavior; route: continue with bounded assumption or stop if it grows.
  - Exact scan depth/ignore behavior requires implementation decision; latest resolve phase before RED tests; route: continue with conservative bounded defaults.
consequence_obligations:
  - CA-001: Preserve owned-only destructive behavior; no command may kill unknown external processes.
  - CA-002: Status/conflicts must distinguish registered, running, stale, missing, and external/unknown states.
  - CA-003: Registry remove/scan operations must be idempotent and test-isolated.
  - CA-004: Existing lifecycle commands must remain compatible.
  - CA-005: Cross-project logs must not infer ownership from ports alone; use registered project/task runtime records.
escalation_decision: stay quick unless stop_condition is hit.

## Summary Pointer

summary_path: .planning/quick/2026-07-08-cli-supervisor-commands/SUMMARY.md
resume_decision: resolved
