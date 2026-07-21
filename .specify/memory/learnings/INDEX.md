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
  },
  {
    "id": "learn-2026-07-20-codex-plugin-mcp-env-forwarding-41904c9cb3",
    "problem": "Codex plugin MCP must explicitly forward optional Launchdeck state-home overrides.",
    "lesson": "Declare required optional parent variables in plugin MCP env_vars and verify stateHome through a real host call.",
    "learning_type": "tooling_trap",
    "source_command": "sp-implement",
    "recurrence_key": "codex-plugin-mcp-env-forwarding",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-map-build",
      "sp-map-rebuild",
      "sp-map-scan",
      "sp-map-update",
      "sp-quick"
    ],
    "trigger_signals": [
      "Assuming shell_environment_policy.inherit=all would forward the variable to plugin MCP.",
      "codex mcp list showed env_vars and capabilities.get reported the isolated stateHome.",
      "high",
      "host-environment-boundary",
      "tooling_trap"
    ],
    "detail": "./learn-2026-07-20-codex-plugin-mcp-env-forwarding-41904c9cb3.md",
    "first_seen": "2026-07-20T10:56:28Z",
    "last_seen": "2026-07-20T10:56:28Z",
    "occurrence_count": 1,
    "signal_strength": "high"
  },
  {
    "id": "learn-2026-07-20-codex-plugin-host-exit-descendant-lifetime-5ad6f35d6a",
    "problem": "Real Codex host exit can terminate managed descendants started by a plugin MCP.",
    "lesson": "Run host-exit survival before update/disable/uninstall stages; stop and withhold dependent claims when the PID does not survive.",
    "learning_type": "verification_gap",
    "source_command": "sp-implement",
    "recurrence_key": "codex-plugin-host-exit-descendant-lifetime",
    "applies_to": [
      "sp-accept",
      "sp-debug",
      "sp-fast",
      "sp-implement",
      "sp-quick"
    ],
    "trigger_signals": [
      "Standalone adapter-exit tests were treated as sufficient evidence for Codex host lifetime.",
      "The exact real-host post-exit process and port receipt contradicted the standalone passing test.",
      "high",
      "host-process-tree-lifetime",
      "verification_gap"
    ],
    "detail": "./learn-2026-07-20-codex-plugin-host-exit-descendant-lifetime-5ad6f35d6a.md",
    "first_seen": "2026-07-20T10:56:29Z",
    "last_seen": "2026-07-20T10:56:29Z",
    "occurrence_count": 1,
    "signal_strength": "high"
  },
  {
    "id": "learn-2026-07-21-launchdeck-e2e-fresh-example-state-26573b1dec",
    "problem": "Copying examples/demo-api with an existing .launchdeck directory made the real MCP task.run return runtime_state_invalid.",
    "lesson": "Copy only source/config assets into a unique temporary project, exclude .launchdeck and scratch, and set an isolated LAUNCHDECK_HOME.",
    "learning_type": "tooling_trap",
    "source_command": "sp-e2e-testing",
    "recurrence_key": "launchdeck-e2e-fresh-example-state",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-map-build",
      "sp-map-rebuild",
      "sp-map-scan",
      "sp-map-update",
      "sp-quick"
    ],
    "trigger_signals": [
      "An E2E test copies a checked-in or locally exercised Launchdeck example.",
      "high",
      "tooling_trap"
    ],
    "detail": "./learn-2026-07-21-launchdeck-e2e-fresh-example-state-26573b1dec.md",
    "first_seen": "2026-07-21T06:56:08Z",
    "last_seen": "2026-07-21T06:56:08Z",
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


---

### learn-2026-07-20-codex-plugin-mcp-env-forwarding-41904c9cb3 - Codex plugin MCP must explicitly forward optional Launchdeck state-home overrides.

- Type: `tooling_trap`
- Source Command: `sp-implement`
- Recurrence Key: `codex-plugin-mcp-env-forwarding`
- Applies To: sp-debug, sp-implement, sp-map-build, sp-map-rebuild, sp-map-scan, sp-map-update, sp-quick
- Trigger Signals: Assuming shell_environment_policy.inherit=all would forward the variable to plugin MCP., codex mcp list showed env_vars and capabilities.get reported the isolated stateHome., high, host-environment-boundary, tooling_trap
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-07-20T10:56:28Z`
- Last Seen: `2026-07-20T10:56:28Z`
- Detail: `./learn-2026-07-20-codex-plugin-mcp-env-forwarding-41904c9cb3.md`

#### Lesson

Declare required optional parent variables in plugin MCP env_vars and verify stateHome through a real host call.


---

### learn-2026-07-20-codex-plugin-host-exit-descendant-lifetime-5ad6f35d6a - Real Codex host exit can terminate managed descendants started by a plugin MCP.

- Type: `verification_gap`
- Source Command: `sp-implement`
- Recurrence Key: `codex-plugin-host-exit-descendant-lifetime`
- Applies To: sp-accept, sp-debug, sp-fast, sp-implement, sp-quick
- Trigger Signals: Standalone adapter-exit tests were treated as sufficient evidence for Codex host lifetime., The exact real-host post-exit process and port receipt contradicted the standalone passing test., high, host-process-tree-lifetime, verification_gap
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-07-20T10:56:29Z`
- Last Seen: `2026-07-20T10:56:29Z`
- Detail: `./learn-2026-07-20-codex-plugin-host-exit-descendant-lifetime-5ad6f35d6a.md`

#### Lesson

Run host-exit survival before update/disable/uninstall stages; stop and withhold dependent claims when the PID does not survive.


---

### learn-2026-07-21-launchdeck-e2e-fresh-example-state-26573b1dec - Copying examples/demo-api with an existing .launchdeck directory made the real MCP task.run return runtime_state_invalid.

- Type: `tooling_trap`
- Source Command: `sp-e2e-testing`
- Recurrence Key: `launchdeck-e2e-fresh-example-state`
- Applies To: sp-debug, sp-implement, sp-map-build, sp-map-rebuild, sp-map-scan, sp-map-update, sp-quick
- Trigger Signals: An E2E test copies a checked-in or locally exercised Launchdeck example., high, tooling_trap
- Signal: `high`
- Occurrence Count: 1
- First Seen: `2026-07-21T06:56:08Z`
- Last Seen: `2026-07-21T06:56:08Z`
- Detail: `./learn-2026-07-21-launchdeck-e2e-fresh-example-state-26573b1dec.md`

#### Lesson

Copy only source/config assets into a unique temporary project, exclude .launchdeck and scratch, and set an isolated LAUNCHDECK_HOME.

