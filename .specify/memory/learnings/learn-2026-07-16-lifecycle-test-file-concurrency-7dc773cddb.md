# The Node test runner executes process- and port-heavy lifecycle files concurrently by default, causing the full Windows suite to exceed its verification timeout even though each file passes alone.

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
  {
    "id": "LRN-20260716-085234-454122",
    "summary": "Serialize lifecycle test files to avoid cross-process resource contention",
    "learning_type": "project_constraint",
    "source_command": "sp-implement",
    "evidence": "Default concurrent Launchdeck test timed out after 184 seconds; all test files passed individually; node --test --test-concurrency=1 completed 148 tests in 149 seconds, and the final Launchdeck-managed full suite exited 0.",
    "recurrence_key": "lifecycle-test-file-concurrency",
    "default_scope": "project",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-quick"
    ],
    "signal_strength": "high",
    "status": "candidate",
    "first_seen": "2026-07-16T08:52:34Z",
    "last_seen": "2026-07-16T08:52:34Z",
    "occurrence_count": 1,
    "pain_score": 0,
    "false_starts": [],
    "rejected_paths": [],
    "decisive_signal": "Serial execution completed the full suite without force-exit after default concurrent execution timed out.",
    "root_cause_family": "cross-process-test-resource-contention",
    "injection_targets": [
      "package.json scripts.test"
    ],
    "promotion_hint": "Promote after the constraint prevents another timeout or after CI evidence confirms it across all supported operating systems.",
    "problem": "The Node test runner executes process- and port-heavy lifecycle files concurrently by default, causing the full Windows suite to exceed its verification timeout even though each file passes alone.",
    "recommended_action": "Keep the repository test script on node --test --test-concurrency=1 unless fresh cross-platform evidence proves a safe concurrency increase.",
    "avoid": [
      "Do not mask the symptom with --test-force-exit or assume a long full-suite run is an open-handle leak before isolating files."
    ],
    "trigger_signals": [
      "The full lifecycle test suite stalls or times out while individual test files pass."
    ],
    "success_criteria": [
      "The complete suite exits 0 without force-exit and CI runs the same serialized command on Windows, macOS, and Linux."
    ],
    "exceptions": []
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

The Node test runner executes process- and port-heavy lifecycle files concurrently by default, causing the full Windows suite to exceed its verification timeout even though each file passes alone.

## Lesson

Keep the repository test script on node --test --test-concurrency=1 unless fresh cross-platform evidence proves a safe concurrency increase.

## Recommended Action

Keep the repository test script on node --test --test-concurrency=1 unless fresh cross-platform evidence proves a safe concurrency increase.

## When To Apply

sp-debug, sp-implement, sp-quick

## Trigger Signals

- Serial execution completed the full suite without force-exit after default concurrent execution timed out.
- The full lifecycle test suite stalls or times out while individual test files pass.
- cross-process-test-resource-contention
- high
- project_constraint

## Evidence

Default concurrent Launchdeck test timed out after 184 seconds; all test files passed individually; node --test --test-concurrency=1 completed 148 tests in 149 seconds, and the final Launchdeck-managed full suite exited 0.

## Prevention Or Recovery

Decisive signal: Serial execution completed the full suite without force-exit after default concurrent execution timed out.

False starts:
_No false starts recorded._

Rejected paths:
_No rejected paths recorded._

Avoid:
- Do not mask the symptom with --test-force-exit or assume a long full-suite run is an open-handle leak before isolating files.

## Success Criteria

- The complete suite exits 0 without force-exit and CI runs the same serialized command on Windows, macOS, and Linux.

## Exceptions

_No exceptions recorded._
