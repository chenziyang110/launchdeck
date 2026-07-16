# Project Learning Index

Thin first-read index of reusable engineering lessons for later `sp-xxx` workflows.

Read this file after `.specify/memory/project-rules.md` and before command-local
context. Open only the linked detail documents whose `applies_to` or
`trigger_signals` match the current work.

---

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
  {
    "id": "learn-2026-07-09-implement-rerun-validation-after-recovery-before-resolve-2f5f32b309",
    "problem": "Rerun planned validation after implementation recovery before resolving the feature",
    "lesson": "Observed auto-capture evidence from implement-tracker.md",
    "learning_type": "recovery_path",
    "source_command": "sp-implement",
    "recurrence_key": "implement.rerun-validation-after-recovery-before-resolve",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-quick"
    ],
    "trigger_signals": [
      "medium",
      "recovery_path"
    ],
    "detail": "./learn-2026-07-09-implement-rerun-validation-after-recovery-before-resolve-2f5f32b309.md",
    "first_seen": "2026-07-09T09:54:13Z",
    "last_seen": "2026-07-09T09:54:13Z",
    "occurrence_count": 1,
    "signal_strength": "medium"
  },
  {
    "id": "learn-2026-07-16-lifecycle-test-file-concurrency-7dc773cddb",
    "problem": "The Node test runner executes process- and port-heavy lifecycle files concurrently by default, causing the full Windows suite to exceed its verification timeout even though each file passes alone.",
    "lesson": "Keep the repository test script on node --test --test-concurrency=1 unless fresh cross-platform evidence proves a safe concurrency increase.",
    "learning_type": "project_constraint",
    "source_command": "sp-implement",
    "recurrence_key": "lifecycle-test-file-concurrency",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-quick"
    ],
    "trigger_signals": [
      "Serial execution completed the full suite without force-exit after default concurrent execution timed out.",
      "The full lifecycle test suite stalls or times out while individual test files pass.",
      "cross-process-test-resource-contention",
      "high",
      "project_constraint"
    ],
    "detail": "./learn-2026-07-16-lifecycle-test-file-concurrency-7dc773cddb.md",
    "first_seen": "2026-07-16T08:52:34Z",
    "last_seen": "2026-07-16T08:52:34Z",
    "occurrence_count": 1,
    "signal_strength": "high"
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Managed Entries

### learn-2026-07-09-implement-rerun-validation-after-recovery-before-resolve-2f5f32b309 - Rerun planned validation after implementation recovery before resolving the feature

- Type: `recovery_path`
- Source Command: `sp-implement`
- Recurrence Key: `implement.rerun-validation-after-recovery-before-resolve`
- Applies To: sp-debug, sp-implement, sp-quick
- Trigger Signals: medium, recovery_path
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-07-09T09:54:13Z`
- Last Seen: `2026-07-09T09:54:13Z`
- Detail: `./learn-2026-07-09-implement-rerun-validation-after-recovery-before-resolve-2f5f32b309.md`

#### Lesson

Observed auto-capture evidence from implement-tracker.md


---

### learn-2026-07-16-lifecycle-test-file-concurrency-7dc773cddb - The Node test runner executes process- and port-heavy lifecycle files concurrently by default, causing the full Windows suite to exceed its verification timeout even though each file passes alone.

- Type: `project_constraint`
- Source Command: `sp-implement`
- Recurrence Key: `lifecycle-test-file-concurrency`
- Applies To: sp-debug, sp-implement, sp-quick
- Trigger Signals: Serial execution completed the full suite without force-exit after default concurrent execution timed out., The full lifecycle test suite stalls or times out while individual test files pass., cross-process-test-resource-contention, high, project_constraint
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-07-16T08:52:34Z`
- Last Seen: `2026-07-16T08:52:34Z`
- Detail: `./learn-2026-07-16-lifecycle-test-file-concurrency-7dc773cddb.md`

#### Lesson

Keep the repository test script on node --test --test-concurrency=1 unless fresh cross-platform evidence proves a safe concurrency increase.

