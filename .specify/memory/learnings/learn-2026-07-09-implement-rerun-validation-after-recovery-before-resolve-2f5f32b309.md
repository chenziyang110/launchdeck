# Rerun planned validation after implementation recovery before resolving the feature

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
    "promotion_hint": ""
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

Rerun planned validation after implementation recovery before resolving the feature

## Lesson

Observed auto-capture evidence from implement-tracker.md

## When To Apply

sp-debug, sp-implement, sp-quick

## Trigger Signals

- medium
- recovery_path

## Evidence

Observed auto-capture evidence from implement-tracker.md
- feature_dir: F:\github\launchdeck\.specify\features\2026-07-09-launchdeck-agent-skill
- tracker_status: resolved
- retry_attempts: 1
- current_batch: final-validation
- goal: close launchdeck agent skill implementation after validation
- completed_checks: FINAL_FILE_ROUTING_PASS, FINAL_CLI_HELP_PASS, FINAL_SAFETY_SCAN_PASS, FINAL_EVAL_PASS triggers=10 non_triggers=7, PROJECT_COGNITION_UPDATE_READY

## Prevention Or Recovery

Decisive signal: not recorded

False starts:
_No false starts recorded._

Rejected paths:
_No rejected paths recorded._

## Exceptions

_No exceptions recorded yet._
