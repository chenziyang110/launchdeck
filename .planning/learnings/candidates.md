# Candidate Learnings

Passive candidate learnings captured from `sp-xxx` workflows.

---

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
  {
    "id": "LRN-20260709-095413-156244",
    "summary": "Rerun planned validation after implementation recovery before resolving the feature",
    "learning_type": "recovery_path",
    "source_command": "sp-implement",
    "evidence": "Observed auto-capture evidence from implement-tracker.md\n- feature_dir: F:\\github\\launchdeck\\.specify\\features\\2026-07-09-launchdeck-agent-skill\n- tracker_status: resolved\n- retry_attempts: 1\n- current_batch: final-validation\n- goal: close launchdeck agent skill implementation after validation\n- completed_checks: FINAL_FILE_ROUTING_PASS, FINAL_CLI_HELP_PASS, FINAL_SAFETY_SCAN_PASS, FINAL_EVAL_PASS triggers=10 non_triggers=7, PROJECT_COGNITION_UPDATE_READY",
    "recurrence_key": "implement.rerun-validation-after-recovery-before-resolve",
    "default_scope": "execution-heavy",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-quick"
    ],
    "signal_strength": "medium",
    "status": "candidate",
    "first_seen": "2026-07-09T09:54:13Z",
    "last_seen": "2026-07-09T09:54:13Z",
    "occurrence_count": 1,
    "pain_score": 0,
    "false_starts": [],
    "rejected_paths": [],
    "decisive_signal": "",
    "root_cause_family": "",
    "injection_targets": [],
    "promotion_hint": "",
    "problem": "",
    "recommended_action": "",
    "avoid": [],
    "trigger_signals": [],
    "success_criteria": [],
    "exceptions": []
  },
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

## Managed Entries

### LRN-20260709-095413-156244 - Rerun planned validation after implementation recovery before resolving the feature

- Status: `candidate`
- Type: `recovery_path`
- Source Command: `sp-implement`
- Recurrence Key: `implement.rerun-validation-after-recovery-before-resolve`
- Scope: `execution-heavy`
- Applies To: sp-debug, sp-implement, sp-quick
- Signal: `medium`
- Occurrence Count: 1
- First Seen: `2026-07-09T09:54:13Z`
- Last Seen: `2026-07-09T09:54:13Z`

#### Evidence

Observed auto-capture evidence from implement-tracker.md
- feature_dir: F:\github\launchdeck\.specify\features\2026-07-09-launchdeck-agent-skill
- tracker_status: resolved
- retry_attempts: 1
- current_batch: final-validation
- goal: close launchdeck agent skill implementation after validation
- completed_checks: FINAL_FILE_ROUTING_PASS, FINAL_CLI_HELP_PASS, FINAL_SAFETY_SCAN_PASS, FINAL_EVAL_PASS triggers=10 non_triggers=7, PROJECT_COGNITION_UPDATE_READY


---

### LRN-20260716-085234-454122 - Serialize lifecycle test files to avoid cross-process resource contention

- Status: `candidate`
- Type: `project_constraint`
- Source Command: `sp-implement`
- Recurrence Key: `lifecycle-test-file-concurrency`
- Scope: `project`
- Applies To: sp-debug, sp-implement, sp-quick
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-07-16T08:52:34Z`
- Last Seen: `2026-07-16T08:52:34Z`

#### Evidence

Default concurrent Launchdeck test timed out after 184 seconds; all test files passed individually; node --test --test-concurrency=1 completed 148 tests in 149 seconds, and the final Launchdeck-managed full suite exited 0.

#### Structured Learning

- Decisive Signal: Serial execution completed the full suite without force-exit after default concurrent execution timed out.
- Root Cause Family: `cross-process-test-resource-contention`
- Injection Targets: package.json scripts.test
- Promotion Hint: Promote after the constraint prevents another timeout or after CI evidence confirms it across all supported operating systems.

