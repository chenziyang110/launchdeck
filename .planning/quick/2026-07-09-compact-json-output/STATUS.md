---
id: "2026-07-09-compact-json-output"
slug: "compact-json-output"
title: "Compact JSON Output"
status: resolved
trigger: "Add a compact agent-friendly JSON output mode for the Launchdeck CLI."
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent | parallel-subagents
execution_surface: native-subagents
created: "2026-07-09"
updated: "2026-07-09"
---

## Discussion Handoff Source
<!-- agent-fill:discussion_handoff_source -->

handoff_consumer: none
source_discussion_slug: none
source_handoff_md: none
source_handoff_json: none
source_files_read: []
locked_direction:
  - "Add a compact machine-readable CLI output shape for low-context agent/script use."
must_preserve:
  - "Existing default human output remains unchanged."
  - "Existing --json envelope remains backward-compatible unless --compact is explicitly requested."
  - "The live demo service on 127.0.0.1:8888 is not stopped by this task."
reopen_conditions: []
quick_task_candidate:
  bounded_scope:
    - "Global CLI output option and output serialization only."
    - "Focused tests for compact JSON behavior."
  excluded_scope:
    - "No daemon/runtime lifecycle changes."
    - "No UI or MCP changes."
    - "No broad schema redesign."
  validation_route:
    - "npm test"
    - "targeted CLI smoke for --json --compact"

## Current Focus
<!-- agent-fill:current_focus -->

goal: "Add a compact JSON output mode that expresses key CLI results with fewer fields for agents and scripts."
current_focus: "Resolved."
next_action: "None."

## Execution Intent
<!-- agent-fill:execution_intent -->

intent_outcome: "A user can run Launchdeck commands with --json --compact and receive a short, accurate object without duplicated payload fields."
intent_constraints:
  - "Do not break the existing --json contract."
  - "Keep the implementation scoped and test-backed."
  - "Prefer generic output compaction over per-command rewrites unless evidence shows that is too lossy."
success_evidence:
  - "Tests cover compact success and failure/envelope behavior."
  - "A CLI smoke command shows materially smaller JSON than normal --json."
cognition_facts:
  selected_capability: "project-cognition compass"
  minimal_reads:
    - "src/cli.js"
    - "test/cli.test.js"
    - "src/config.js"
  validation_route: "npm test plus targeted CLI smoke"
  known_risk: "Compact output must not silently remove fields required to make safe stop/restart decisions."

## Understanding Checkpoint
<!-- agent-fill:understanding_checkpoint -->

checkpoint:
  issue: "Current --json output is accurate but too verbose for context-limited agents."
  issue_detail: "The stable JSON envelope keeps full payload data and legacy mirrored top-level fields, so agent loops pay for duplicated and low-signal fields."
  expected_or_target: "Add an explicit compact JSON mode, likely --json --compact, with only safety-critical fields and concise next actions."
  known_facts:
    - "The current output layer mirrors payload fields for compatibility."
    - "The CLI contract requires schemaVersion for JSON envelopes."
    - "The user wants minimum words/tokens with maximum accurate operational signal."
  unknowns_or_risks:
    - "Each command has slightly different safety-critical fields."
    - "Logs need enough content to be useful while staying bounded."
    - "A too-aggressive compact mode could hide owner/port/pid/runId evidence needed for precise stop decisions."
  will_change:
    - "CLI option parsing/output serialization for compact JSON."
    - "Focused tests and docs for the new compact output mode."
  will_not_change:
    - "Existing --json output shape."
    - "Process supervision, port ownership, stop/force-stop behavior."
    - "The currently running demo service."
  in_scope:
    - "--json --compact output contract."
    - "Compact success/failure envelope."
    - "Compact list/detail outputs for operational commands where generic compaction can preserve key signals."
  out_of_scope:
    - "Replacing the main JSON schema."
    - "Adding GUI/MCP/API surfaces."
    - "Changing runtime state files."
  affected_surfaces:
    - "src/cli.js"
    - "src/output.js"
    - "test/cli.test.js"
    - "README.md or docs/cli-contract.md if behavior is documented there"
  execution_approach: "Use a small implementation lane after confirmation, with a reviewer/checker lane if subagent support is available."
  implementation_plan:
    - "Inspect the narrow output and CLI parsing surfaces."
    - "Add --compact as an opt-in JSON modifier."
    - "Serialize compact envelopes without duplicated data/top-level mirrors."
    - "Add tests and a smoke command showing reduced output."
  next_action: "Implement after user confirmation."
  validation_evidence:
    - "Pending"
  stop_condition: "Stop before code edits until the user confirms this understanding checkpoint."
  done_or_progress_signal: "Compact JSON mode exists, tests pass, and smoke output is visibly shorter."
  user_corrections:
    - "User confirmed the --json --compact direction."

## Execution
<!-- agent-fill:execution -->

active_lane: "implementation"
join_point: "verification-complete"
blockers: []
blocked_dispatch:
  status: none
  reason: ""
lanes:
  - id: reviewer
    type: native-subagent
    status: completed
    summary: "Reviewed compact JSON risks, parser behavior, next actions, partial results, follow streams, and test coverage."
  - id: leader-integration
    type: leader
    status: completed
    summary: "Implemented compact JSON mode, parser support, docs, tests, and smoke validation."
retry_attempts: 0
recovery_action: none
blocker_reason: ""

## Validation
<!-- agent-fill:validation -->

validation_evidence:
  - command: "npm run check"
    result: "passed"
  - command: "node --test test/cli-control-plane-contract.test.js test/cli-contract.test.js"
    result: "passed: 25 tests"
  - command: "npm test"
    result: "passed: 141 tests"
  - command: "demo read-only compact smoke"
    result: "passed: inspect, clean refusal, and ps size comparison"
unverified_surfaces: []
terminal_status: verified

## Summary Pointer
<!-- agent-fill:summary_pointer -->

summary_path: ".planning/quick/2026-07-09-compact-json-output/SUMMARY.md"
resume_decision: "No resume needed; implementation and verification are complete. Project cognition closeout is partial_refresh and recorded below."
changed_code_paths:
  - "src/cli.js"
  - "src/output.js"
  - "test/cli-contract.test.js"
  - "test/cli-control-plane-contract.test.js"
  - "README.md"
  - ".planning/quick/2026-07-09-compact-json-output/STATUS.md"
  - ".planning/quick/2026-07-09-compact-json-output/SUMMARY.md"
changed_behavior_surfaces:
  - "CLI global option parsing: --compact"
  - "JSON envelope serialization: compact mode"
  - "CLI help and README JSON guidance"
  - "JSON contract tests for compact success/failure/parser behavior"
project_cognition_refresh:
  status: partial_refresh
  evidence:
    - "project-cognition update id upd-20260709T072817.646824900Z"
    - "result_state: partial_refresh"
    - "minimal_live_reads: STATUS.md, SUMMARY.md, README.md, src/cli.js, src/output.js, test/cli-contract.test.js, test/cli-control-plane-contract.test.js"

## Senior Consequence Analysis
<!-- agent-fill:senior_consequence_analysis -->

affected_objects: []
state_behavior_matrix:
  - object: "CLI JSON output"
    before: "Full --json envelope with data plus mirrored top-level fields."
    after: "Plain --json unchanged; --json --compact emits reduced contract."
  - object: "Process/port task management summaries"
    before: "Agents consumed verbose process and port payloads."
    after: "Compact mode keeps task, pid, runId, status, ports, owner, counts."
dependency_impact:
  - "No dependency changes."
recovery_and_validation:
  - "Parser regression covered by logs --json --compact default-dev test."
  - "Full npm test passed."
project_cognition_evidence:
  - "project-cognition compass selected src/cli.js, test/cli.test.js, and src/config.js as minimal reads."
  - "closeout-plan rerun with explicit changed paths to avoid broad F:/github git-root noise."
coverage_gaps:
  - "No additional unverified code surface within the declared quick-task scope."
  - "Project cognition refresh is partial_refresh because active runtime path_index does not fully cover new quick artifacts and some touched test/output paths."
escalation_decision: none
