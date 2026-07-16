---
id: "2026-07-09"
slug: "agent-skill-canonical-path"
title: "Move launchdeck-agent skill to project-level .agents source"
status: resolved
trigger: "$sp-quick do it after deciding skill+CLI+MCP should use .agents as canonical project source"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
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
locked_direction: []
must_preserve: []
reopen_conditions: []
quick_task_candidate:
  bounded_scope:
    - Move launchdeck-agent skill source from .codex/skills to .agents/skills.
    - Add minimal project-level sync/validation support for agent host directories.
    - Update quick/feature records that refer to the canonical skill source path.
  excluded_scope:
    - No Launchdeck CLI runtime behavior changes.
    - No MCP server implementation in this quick task.
    - No demo service start or runtime state mutation.
  validation_route:
    - Verify .agents/skills/launchdeck-agent contains all expected files.
    - Verify host-specific skill directories are treated only as generated/synced targets.
    - Verify project records point to .agents/skills/launchdeck-agent as the canonical path.

## Current Focus
<!-- agent-fill:current_focus -->

goal: "Make .agents/skills/launchdeck-agent the project-level canonical skill source and keep agent-host directories as generated or sync targets."
current_focus: "Resolved after path migration, validation, and project cognition refresh."
next_action: "None; quick task complete."

## Execution Intent
<!-- agent-fill:execution_intent -->

intent_outcome: "Launchdeck agent skill lives under .agents/skills/launchdeck-agent, with repository guidance and checks aligned to that path."
intent_constraints:
  - "Do not edit src/, test/, package.json, dependencies, .launchdeck runtime state, or demo services."
  - "Do not implement MCP server behavior now; only leave structure/guidance if needed."
  - "Keep .codex as host-specific/generated target, not source of truth."
success_evidence:
  - "File existence and routing checks pass under .agents/skills/launchdeck-agent."
  - "Path sweep shows no active references to the former host-specific skill source path."
  - "Safety scan still rejects raw process-kill guidance."
cognition_facts:
  selected_capability: "launchdeck-agent skill package path and project-level agent conventions"
  minimal_reads:
    - ".agents/skills/launchdeck-agent/SKILL.md"
    - ".agents/skills/launchdeck-agent/references/adoption-flow.md"
    - ".agents/skills/launchdeck-agent/references/clean-safety.md"
  validation_route: "live filesystem checks, rg path sweep, safety scan, project cognition update"
  known_risk: "Resolved: project cognition refresh adopted .agents/skills/launchdeck-agent."

## Understanding Checkpoint
<!-- agent-fill:understanding_checkpoint -->

checkpoint:
  issue: "The launchdeck-agent skill was implemented under .codex/skills, which makes it look like a Codex-only local asset instead of a project-level product artifact. The user wants skill + CLI + future MCP organization to follow a project-owned source layout. This task is not asking to change Launchdeck runtime behavior."
  issue_detail: "AGENTS.md says project skills are auto-loaded from .agents/skills. External references also support treating agent-specific directories as install/sync targets rather than the canonical source."
  expected_or_target: ".agents/skills/launchdeck-agent becomes canonical; .codex is only a host-specific adapter target."
  known_facts:
    - "The skill files were moved to .agents/skills/launchdeck-agent before this quick state was initialized."
    - "Project cognition currently points at the old .codex/skills path."
    - "User explicitly approved doing the structural correction after discussion."
  unknowns_or_risks:
    - "Whether Codex should use symlink or copy sync on Windows; default to a conservative sync script and no automatic generated copy unless validated."
  will_change:
    - ".agents/skills/launchdeck-agent/**"
    - ".agents/scripts/** if needed for sync/validation"
    - "docs or project guidance that names skill layout"
    - ".specify feature/quick workflow records for the corrected path"
  will_not_change:
    - "Launchdeck CLI source behavior"
    - "Launchdeck runtime state"
    - "Demo services"
    - "MCP server implementation"
  in_scope:
    - "Canonical skill path correction"
    - "Minimal host sync/validation structure"
    - "Path-reference repair for this skill feature"
  out_of_scope:
    - "Publishing plugin marketplace package"
    - "Building launchdeck-mcp"
    - "Changing lifecycle command semantics"
  affected_surfaces:
    - "project-level agent skill source"
    - "Codex host adapter directory"
    - "workflow records and implementation summary"
    - "project cognition index"
  execution_approach: "one-subagent on native-subagents"
  implementation_plan:
    - "Check moved skill files and existing project guidance."
    - "Add minimal .agents scripts/docs as needed to make the source-vs-host-target contract explicit."
    - "Replace old canonical host-specific skill path references in active workflow records with .agents/skills/launchdeck-agent."
    - "Validate skill routing, path sweep, and safety scan."
    - "Run project cognition closeout update and write SUMMARY.md."
  next_action: "None; task resolved."
  validation_evidence:
    - "Test-Path checks for all expected skill files under .agents/skills/launchdeck-agent"
    - "rg sweep for the former host-specific skill source path"
    - "rg safety scan for unsafe raw process guidance"
    - "project-cognition update result"
  stop_condition: "If the change requires a new cross-agent packaging standard, actual MCP behavior, or agent-host installation semantics that cannot be safely decided in this quick pass, stop and escalate to specification."
  done_or_progress_signal: "checkpoint confirmed by user request: do it"
  user_corrections: []

## Execution
<!-- agent-fill:execution -->

active_lane: "none"
join_point: "closed"
blockers: []
blocked_dispatch:
  status: none
  reason: ""
lanes:
  - id: lane-001-canonical-skill-path
    owner: executor
    write_scope:
      - .agents/skills/launchdeck-agent/**
      - .agents/scripts/**
      - .agents/README.md
      - .specify/features/2026-07-09-launchdeck-agent-skill/**
      - .planning/quick/2026-07-09-agent-skill-canonical-path/**
    result_path: .planning/quick/2026-07-09-agent-skill-canonical-path/worker-results/lane-001.json
    status: complete
retry_attempts: 0
recovery_action: none
blocker_reason: ""

## Validation
<!-- agent-fill:validation -->

validation_evidence:
  - "PowerShell required-file check: checked 8 required files under .agents/skills/launchdeck-agent."
  - ".agents/scripts/validate-skills.ps1: Launchdeck agent skill validation passed; checked 8 required files."
  - ".agents/scripts/sync-skills.ps1 check mode: reported source, target, and 8 files without copying."
  - "rg old-path sweep across .agents, quick task, and feature artifacts: no matches."
  - "rg safety scan under .agents/skills/launchdeck-agent: no matches."
unverified_surfaces: []
terminal_status: resolved

## Summary Pointer
<!-- agent-fill:summary_pointer -->

summary_path: ".planning/quick/2026-07-09-agent-skill-canonical-path/SUMMARY.md"
resume_decision: "resolved"
changed_code_paths:
  - ".agents/README.md"
  - ".agents/scripts/sync-skills.ps1"
  - ".agents/scripts/validate-skills.ps1"
  - ".specify/features/2026-07-09-launchdeck-agent-skill/**"
  - ".planning/quick/2026-07-09-agent-skill-canonical-path/**"
  - ".specify/project-cognition/updates/sp-quick-closeout.json"
changed_behavior_surfaces:
  - "Project skill source convention: .agents/skills is canonical."
  - "Host adapter convention: .codex/skills is generated or synced target only."
  - "Skill validation and sync helper scripts."
project_cognition_refresh:
  status: fresh
  evidence:
    - "project-cognition update recorded update_id=upd-20260709T101713.027503400Z with result_state=partial_refresh"
    - "project-cognition complete-refresh returned freshness=fresh readiness=query_ready dirty=false"
    - "last_refresh_changed_files_basis includes .agents/skills/launchdeck-agent paths"

## Senior Consequence Analysis
<!-- agent-fill:senior_consequence_analysis -->

affected_objects: []
state_behavior_matrix:
  - "created: .agents/skills/launchdeck-agent is the new committed source location."
  - "missing: host-specific generated copies should not be required as product source."
  - "stale: existing workflow/cognition records pointing to host-specific skill sources must be refreshed or explicitly marked historical."
dependency_impact:
  - "AGENTS.md project skill discovery depends on .agents/skills."
  - "Codex host behavior may still need a generated/link target under .codex, but that is adapter state, not canonical source."
recovery_and_validation:
  - "If path migration breaks validation, restore from .agents/skills source and rerun file/safety checks."
  - "If project cognition update cannot adopt new paths, mark dirty only as fallback."
project_cognition_evidence:
  - "compass readiness=query_ready; returned old .codex minimal reads, confirming map is stale for this path."
coverage_gaps: []
escalation_decision: "continue in quick; bounded structural correction, no runtime semantics change"
