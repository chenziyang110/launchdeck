# Copying examples/demo-api with an existing .launchdeck directory made the real MCP task.run return runtime_state_invalid.

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
  {
    "id": "LRN-20260721-065608-794126",
    "summary": "Example-based E2E fixtures must exclude persisted Launchdeck runtime state.",
    "learning_type": "tooling_trap",
    "source_command": "sp-e2e-testing",
    "evidence": "test/e2e/demo-project-task-management-flow.test.js passed after createExampleFixture excluded .launchdeck and scratch; npm run test:e2e passed 17/17.",
    "recurrence_key": "launchdeck-e2e-fresh-example-state",
    "default_scope": "cross-workflow",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-map-build",
      "sp-map-rebuild",
      "sp-map-scan",
      "sp-map-update",
      "sp-quick"
    ],
    "signal_strength": "high",
    "status": "candidate",
    "first_seen": "2026-07-21T06:56:08Z",
    "last_seen": "2026-07-21T06:56:08Z",
    "occurrence_count": 1,
    "pain_score": 0,
    "false_starts": [],
    "rejected_paths": [],
    "decisive_signal": "",
    "root_cause_family": "",
    "injection_targets": [],
    "promotion_hint": "",
    "problem": "Copying examples/demo-api with an existing .launchdeck directory made the real MCP task.run return runtime_state_invalid.",
    "recommended_action": "Copy only source/config assets into a unique temporary project, exclude .launchdeck and scratch, and set an isolated LAUNCHDECK_HOME.",
    "avoid": [
      "Do not execute an E2E fixture against copied runtime state from another run."
    ],
    "trigger_signals": [
      "An E2E test copies a checked-in or locally exercised Launchdeck example."
    ],
    "success_criteria": [
      "The MCP task.run/task.start lifecycle completes against a fresh copied project without runtime_state_invalid."
    ],
    "exceptions": [
      "Apply only to tests that require a fresh lifecycle state; evidence-preservation tests may deliberately seed runtime state."
    ]
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

Copying examples/demo-api with an existing .launchdeck directory made the real MCP task.run return runtime_state_invalid.

## Lesson

Copy only source/config assets into a unique temporary project, exclude .launchdeck and scratch, and set an isolated LAUNCHDECK_HOME.

## Recommended Action

Copy only source/config assets into a unique temporary project, exclude .launchdeck and scratch, and set an isolated LAUNCHDECK_HOME.

## When To Apply

sp-debug, sp-implement, sp-map-build, sp-map-rebuild, sp-map-scan, sp-map-update, sp-quick

## Trigger Signals

- An E2E test copies a checked-in or locally exercised Launchdeck example.
- high
- tooling_trap

## Structured Facets

_No structured facets recorded._

## Evidence

test/e2e/demo-project-task-management-flow.test.js passed after createExampleFixture excluded .launchdeck and scratch; npm run test:e2e passed 17/17.

## Prevention Or Recovery

Decisive signal: not recorded

False starts:
_No false starts recorded._

Rejected paths:
_No rejected paths recorded._

Avoid:
- Do not execute an E2E fixture against copied runtime state from another run.

## Success Criteria

- The MCP task.run/task.start lifecycle completes against a fresh copied project without runtime_state_invalid.

## Exceptions

- Apply only to tests that require a fresh lifecycle state; evidence-preservation tests may deliberately seed runtime state.
