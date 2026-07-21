# Codex plugin MCP must explicitly forward optional Launchdeck state-home overrides.

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
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
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

Codex plugin MCP must explicitly forward optional Launchdeck state-home overrides.

## Lesson

Declare required optional parent variables in plugin MCP env_vars and verify stateHome through a real host call.

## Recommended Action

Declare required optional parent variables in plugin MCP env_vars and verify stateHome through a real host call.

## When To Apply

sp-debug, sp-implement, sp-map-build, sp-map-rebuild, sp-map-scan, sp-map-update, sp-quick

## Trigger Signals

- Assuming shell_environment_policy.inherit=all would forward the variable to plugin MCP.
- codex mcp list showed env_vars and capabilities.get reported the isolated stateHome.
- high
- host-environment-boundary
- tooling_trap

## Evidence

Codex 0.144.4 ignored parent LAUNCHDECK_HOME until .mcp.json declared env_vars=[LAUNCHDECK_HOME]; the next real MCP trace resolved the isolated registry and reported host=codex.

## Prevention Or Recovery

Decisive signal: codex mcp list showed env_vars and capabilities.get reported the isolated stateHome.

False starts:
- Assuming shell_environment_policy.inherit=all would forward the variable to plugin MCP.

Rejected paths:
_No rejected paths recorded._

Avoid:
- Do not infer MCP environment inheritance from the Codex parent process or shell command policy.

## Success Criteria

_No explicit success criteria recorded._

## Exceptions

_No exceptions recorded._
