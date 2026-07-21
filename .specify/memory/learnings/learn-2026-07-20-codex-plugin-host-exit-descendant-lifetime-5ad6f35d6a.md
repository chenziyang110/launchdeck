# Real Codex host exit can terminate managed descendants started by a plugin MCP.

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
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
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

Real Codex host exit can terminate managed descendants started by a plugin MCP.

## Lesson

Run host-exit survival before update/disable/uninstall stages; stop and withhold dependent claims when the PID does not survive.

## Recommended Action

Run host-exit survival before update/disable/uninstall stages; stop and withhold dependent claims when the PID does not survive.

## When To Apply

sp-accept, sp-debug, sp-fast, sp-implement, sp-quick

## Trigger Signals

- Standalone adapter-exit tests were treated as sufficient evidence for Codex host lifetime.
- The exact real-host post-exit process and port receipt contradicted the standalone passing test.
- high
- host-process-tree-lifetime
- verification_gap

## Evidence

Codex 0.144.4 started run_v3ZefiY9qQFN once, but after exec/MCP exit PID 22356 was dead, port 59037 was free, and standalone CLI classified the shared record stale-owned.

## Prevention Or Recovery

Decisive signal: The exact real-host post-exit process and port receipt contradicted the standalone passing test.

False starts:
- Standalone adapter-exit tests were treated as sufficient evidence for Codex host lifetime.

Rejected paths:
_No rejected paths recorded._

Avoid:
- Do not reuse standalone MCP adapter-exit evidence as a Codex lifecycle claim.

## Success Criteria

_No explicit success criteria recorded._

## Exceptions

_No exceptions recorded._
