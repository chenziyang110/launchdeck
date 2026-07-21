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
  },
  {
    "id": "LRN-20260720-105628-386061",
    "summary": "Codex plugin MCP must explicitly forward optional Launchdeck state-home overrides.",
    "learning_type": "tooling_trap",
    "source_command": "sp-implement",
    "evidence": "Codex 0.144.4 ignored parent LAUNCHDECK_HOME until .mcp.json declared env_vars=[LAUNCHDECK_HOME]; the next real MCP trace resolved the isolated registry and reported host=codex.",
    "recurrence_key": "codex-plugin-mcp-env-forwarding",
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
    "first_seen": "2026-07-20T10:56:28Z",
    "last_seen": "2026-07-20T10:56:28Z",
    "occurrence_count": 1,
    "pain_score": 0,
    "false_starts": [
      "Assuming shell_environment_policy.inherit=all would forward the variable to plugin MCP."
    ],
    "rejected_paths": [],
    "decisive_signal": "codex mcp list showed env_vars and capabilities.get reported the isolated stateHome.",
    "root_cause_family": "host-environment-boundary",
    "injection_targets": [],
    "promotion_hint": "",
    "problem": "Codex plugin MCP must explicitly forward optional Launchdeck state-home overrides.",
    "recommended_action": "Declare required optional parent variables in plugin MCP env_vars and verify stateHome through a real host call.",
    "avoid": [
      "Do not infer MCP environment inheritance from the Codex parent process or shell command policy."
    ],
    "trigger_signals": [],
    "success_criteria": [],
    "exceptions": []
  },
  {
    "id": "LRN-20260720-105629-396135",
    "summary": "Real Codex host exit can terminate managed descendants started by a plugin MCP.",
    "learning_type": "verification_gap",
    "source_command": "sp-implement",
    "evidence": "Codex 0.144.4 started run_v3ZefiY9qQFN once, but after exec/MCP exit PID 22356 was dead, port 59037 was free, and standalone CLI classified the shared record stale-owned.",
    "recurrence_key": "codex-plugin-host-exit-descendant-lifetime",
    "default_scope": "execution-heavy",
    "applies_to": [
      "sp-accept",
      "sp-debug",
      "sp-fast",
      "sp-implement",
      "sp-quick"
    ],
    "signal_strength": "high",
    "status": "candidate",
    "first_seen": "2026-07-20T10:56:29Z",
    "last_seen": "2026-07-20T10:56:29Z",
    "occurrence_count": 1,
    "pain_score": 8,
    "false_starts": [
      "Standalone adapter-exit tests were treated as sufficient evidence for Codex host lifetime."
    ],
    "rejected_paths": [],
    "decisive_signal": "The exact real-host post-exit process and port receipt contradicted the standalone passing test.",
    "root_cause_family": "host-process-tree-lifetime",
    "injection_targets": [],
    "promotion_hint": "",
    "problem": "Real Codex host exit can terminate managed descendants started by a plugin MCP.",
    "recommended_action": "Run host-exit survival before update/disable/uninstall stages; stop and withhold dependent claims when the PID does not survive.",
    "avoid": [
      "Do not reuse standalone MCP adapter-exit evidence as a Codex lifecycle claim."
    ],
    "trigger_signals": [],
    "success_criteria": [],
    "exceptions": []
  },
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


---

### LRN-20260720-105628-386061 - Codex plugin MCP must explicitly forward optional Launchdeck state-home overrides.

- Status: `candidate`
- Type: `tooling_trap`
- Source Command: `sp-implement`
- Recurrence Key: `codex-plugin-mcp-env-forwarding`
- Scope: `cross-workflow`
- Applies To: sp-debug, sp-implement, sp-map-build, sp-map-rebuild, sp-map-scan, sp-map-update, sp-quick
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-07-20T10:56:28Z`
- Last Seen: `2026-07-20T10:56:28Z`

#### Evidence

Codex 0.144.4 ignored parent LAUNCHDECK_HOME until .mcp.json declared env_vars=[LAUNCHDECK_HOME]; the next real MCP trace resolved the isolated registry and reported host=codex.

#### Structured Learning

- False Starts: Assuming shell_environment_policy.inherit=all would forward the variable to plugin MCP.
- Decisive Signal: codex mcp list showed env_vars and capabilities.get reported the isolated stateHome.
- Root Cause Family: `host-environment-boundary`


---

### LRN-20260720-105629-396135 - Real Codex host exit can terminate managed descendants started by a plugin MCP.

- Status: `candidate`
- Type: `verification_gap`
- Source Command: `sp-implement`
- Recurrence Key: `codex-plugin-host-exit-descendant-lifetime`
- Scope: `execution-heavy`
- Applies To: sp-accept, sp-debug, sp-fast, sp-implement, sp-quick
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-07-20T10:56:29Z`
- Last Seen: `2026-07-20T10:56:29Z`

#### Evidence

Codex 0.144.4 started run_v3ZefiY9qQFN once, but after exec/MCP exit PID 22356 was dead, port 59037 was free, and standalone CLI classified the shared record stale-owned.

#### Structured Learning

- Pain Score: `8`
- False Starts: Standalone adapter-exit tests were treated as sufficient evidence for Codex host lifetime.
- Decisive Signal: The exact real-host post-exit process and port receipt contradicted the standalone passing test.
- Root Cause Family: `host-process-tree-lifetime`


---

### LRN-20260721-065608-794126 - Example-based E2E fixtures must exclude persisted Launchdeck runtime state.

- Status: `candidate`
- Type: `tooling_trap`
- Source Command: `sp-e2e-testing`
- Recurrence Key: `launchdeck-e2e-fresh-example-state`
- Scope: `cross-workflow`
- Applies To: sp-debug, sp-implement, sp-map-build, sp-map-rebuild, sp-map-scan, sp-map-update, sp-quick
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-07-21T06:56:08Z`
- Last Seen: `2026-07-21T06:56:08Z`

#### Evidence

test/e2e/demo-project-task-management-flow.test.js passed after createExampleFixture excluded .launchdeck and scratch; npm run test:e2e passed 17/17.

