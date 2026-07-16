# Discussion State: Launchdeck Agent Skill Suite

## Current Command

- active_command: sp-discussion
- state_surface: discussion-state
- status: completed
- slug: launchdeck-agent-skill-suite
- updated_at: 2026-07-09T16:59:13+08:00
- closed_at: 2026-07-09T16:59:13+08:00
- archived_at: none

## Phase Mode

- phase_mode: discussion-only
- summary: Discussing a Launchdeck skill suite for agents. Users should express natural intent such as "start this project"; the agent should route that intent into Launchdeck skills, discover and persist lifecycle knowledge, then use Launchdeck as the control plane so later runs are fast, safe, and free from duplicate starts, port conflicts, and unmanaged process cleanup.

## Session Routing

- current_stage: handoff-ready
- current_topic: agent skill suite for Launchdeck-managed project lifecycle discovery
- frontstage_reply_contract: unified
- visible_reply_mode: standard
- backstage_state_visibility: summarized
- question_pack_mode: none
- decision_advancement_mode: recommendation-first
- primary_question: none
- optional_followups: []
- recommendation_required_for_choices: true
- blocker_reason: none
- readiness_note: Handoff is user-confirmed and ready for sp-specify consumption.
- ui_discussion_status: not_applicable

## Advisor Contract

- truth_pass_status: complete
- verified_project_facts:
  - Current repository remains the implementation target for Launchdeck product work.
  - README describes Launchdeck as a daemonless user-scoped global control plane with registry, locks, logs, events, and live OS inspection.
  - README says v1 covers project add/scan/list, start/stop/force-stop/restart/reconcile, status/ps/ports/conflicts/inspect, logs/events, clean, JSON, and compact JSON.
  - README states Launchdeck does not kill unknown external processes and requires ownership proof for stop/restart/force-stop.
  - `src/cli.js` exposes lifecycle commands for run/start/dev/restart/ps/ports/inspect/logs/stop/force-stop/clean.
  - `src/runtime.js` manages project-local runtime paths, state, managed process records, logs, stop behavior, declared port checks, and ownership proof surfaces.
  - `test/cli.test.js` verifies an end-to-end local lifecycle flow covering doctor, build, test, dev duplicate start idempotency, ps, logs, stop, and clean.
- open_assumptions:
  - The first skill suite targets coding agents using local CLI access, not a GUI.
  - Launchdeck remains the execution authority; skills should not directly own process killing or port cleanup.
  - Agents should be allowed to propose configuration and run safe read-only discovery before mutating project state.
- evidence_checked:
  - `.specify/memory/project-rules.md`
  - `.specify/memory/learnings/INDEX.md`
  - `.specify/project-cognition/status.json`
  - `project-cognition compass --intent discussion --query "agent skill suite discovers any project's run/build/test/stop/log/clean lifecycle and uses Launchdeck to manage it safely, preventing port conflicts and zombie processes" --format json`
  - `README.md`
  - `src/cli.js`
  - `src/runtime.js`
  - `test/cli.test.js`
- advice_confidence: high
- discussion_compass_status: current
- current_decision_frame: The skill suite should be invisibly invoked from user intent; users ask the agent to run a project, and the agent routes itself into Launchdeck discovery/adoption/operation without requiring users to name a skill.
- confirmed_decisions:
  - The skill suite is for agent usage.
  - The skill suite should help discover a project's lifecycle commands.
  - The skill suite should use Launchdeck to manage project execution.
  - The goal is to prevent port conflicts, duplicate service starts, zombie processes, and unsafe kills.
  - Users should not need to know or choose a specific Launchdeck skill.
  - User intent such as "help me start/run this project" should trigger automatic Launchdeck skill routing.
  - First-run discovery should persist lifecycle knowledge so subsequent runs are fast and stable.
  - Launchdeck skills should follow skill-creator progressive disclosure: trigger-rich descriptions, lean bodies, references for details, scripts only for deterministic repeated logic.
  - Skill evaluation should test both natural intent triggering and safe Launchdeck lifecycle behavior.
  - First-pass skill contracts are defined for router, onboarding, operation, observation, recovery, and cleanup skills.
  - V0 should ship as one `launchdeck-agent` skill with bundled references, not six public skills.
  - V0 intent routing should require lifecycle intent plus local project/service context.
  - Launchdeck routing should trigger for requests that may create duplicate local processes, occupy ports, stop owned services, inspect logs/state, recover conflicts, or clean generated outputs.
  - Launchdeck routing should decline general explanations, ordinary code edits, API design, documentation-only tasks, and production deployment requests unless local lifecycle intent is also present.
  - First-run adoption should be staged as root identification, reuse check, read-only discovery, candidate classification, `.launchdeck.yml` authoring or repair, doctor, registry adoption, managed start, and reusable handle reporting.
  - Adoption confidence should distinguish `exact`, `strong`, `weak`, and `unknown` lifecycle candidates.
  - Adoption should stop safely rather than guessing when commands are unknown, candidates conflict, ports are externally occupied, doctor fails, required local dependencies are missing, or the request is production deployment.
  - Discovery should prefer existing Launchdeck config/registry, then machine-readable manifests and task definitions, then framework conventions, then docs, then loose clues.
  - V0 discovery should cover Node, Python, Docker Compose, and Make/Just/Taskfile first.
  - Discovery output should be compact candidates with task kind, command, long-running flag, ports, confidence, evidence, and risks.
  - Evidence conflicts should downgrade confidence and prevent automatic lifecycle mutation.
  - Command flows should observe Launchdeck state before mutation.
  - Start/dev/run should be idempotent and report existing matching managed runs instead of launching duplicates.
  - Restart and stop should require inspect/reconcile evidence and Launchdeck ownership proof.
  - Force-stop should require Launchdeck ownership plus evidence that normal stop failed or the process is stuck.
  - Clean should default to safe clean and remain separate from stop/reset.
  - Recovery should diagnose, prove ownership, reconcile if safe, and mutate only through Launchdeck.
  - Port conflicts should classify occupants as same Launchdeck task, other Launchdeck task, external known process, unknown process, or stale record.
  - Occupied ports without verified Launchdeck ownership should default to inspect-only behavior and refuse automatic kill/stop.
  - Stale state should route through reconcile before lifecycle mutation.
  - Duplicate-start risk should return an existing matching managed run rather than creating another instance.
  - Clean should be separated into safe clean, risky clean, and reset.
  - V0 should allow only safe clean automatically through `launchdeck clean --safe`; risky clean requires explicit confirmation; reset is out of automatic scope.
  - Clean must preserve `.launchdeck.yml`, logs/events, running runtime state, env/secrets, databases, user data, source files, and config files.
  - V0 eval prompts should cover should-trigger, should-not-trigger, behavior/safety, and compact-output cases.
  - Behavior evals should prove unknown adoption, existing run reuse, duplicate-start prevention, owned/external port conflict handling, stale reconcile, ownership-gated stop/force-stop, safe clean, risky clean, and reset refusal.
  - V0 eval prompts should live inside `launchdeck-agent/references/eval-prompts.md`; executable fixtures can be deferred until prose evals reveal repeatable failure patterns.
  - V0 package should be one `launchdeck-agent` skill with a short router `SKILL.md` and bundled references.
  - The `SKILL.md` description is the key trigger surface and should include natural project lifecycle phrases.
  - V0 should not expose separate public onboarding, operation, recovery, or cleanup skills until router behavior is proven.
  - V0 should ship without scripts unless evals show a repeated discovery failure; any future scanner script must be read-only.
  - Handoff assessment is ready-for-specify.
  - Draft unified handoff pair has been created and is pending user confirmation.
- changed_recommendations:
  - Move from "agent runs project commands directly" to "agent discovers lifecycle, writes or repairs Launchdeck config, then operates through Launchdeck."
  - Move from user-selected skills to intent-routed hidden skill orchestration.
  - Treat skill descriptions as a critical product surface because descriptions decide whether natural user intent enters the Launchdeck flow.
  - Prefer explicit first-pass contracts for each skill before writing actual SKILL.md files.
  - Prefer one router skill for v0 to prove natural-intent trigger behavior before splitting references into separate skills.
- next_discussion_paths:
  - Define the skill suite roles and boundaries.
  - Define the adoption flow for an unknown project.
  - Define safe discovery and confidence levels.
  - Define the agent intent router and cached lifecycle knowledge model.
  - Define trigger evals and behavior evals for the skill suite.
  - Define the actual `launchdeck-agent` SKILL.md and reference file contents.
  - Define the exact adoption flow reference for first-run projects.
  - Define discovery rules per ecosystem and how confidence labels are assigned.
  - Define command flows for start, restart, stop, observe, logs, ports, inspect, and clean.
  - Define recovery playbooks for port conflicts, stale state, stop failures, and unknown ownership.
  - Define clean safety and risky reset boundaries.
  - Define trigger and behavior eval prompts for the v0 router skill.
  - Define the actual `launchdeck-agent/SKILL.md` and reference file skeletons.
  - User reviews the draft handoff pair.
  - If approved, mark the handoff ready for sp-specify consumption.
  - If changes are requested, repair the handoff pair in sp-discussion.

## Lightweight Recovery

- latest_event_checkpoint: 2026-07-09T16:29:56+08:00
- last_compaction_checkpoint: 2026-07-09T16:29:56+08:00
- compact_summary_status: current
- ordinary_turn_write_policy: deferred-checkpoint
- ordinary_turn_write_gate: suppress local writes until save trigger; do not update persisted counters for every user reply
- structured_refresh_policy: semantic-checkpoint-only
- save_trigger_policy: semantic-checkpoint | user-triggered-save | five-turn-cadence | compaction-risk | durable-lifecycle-transition
- unsaved_turn_count: 0
- unsaved_turn_count_policy: memory-only between save triggers; persist only when flushing a batched event or semantic checkpoint
- pending_context_summary: []
- compaction_preserve_items:
  - Skill suite discovers project lifecycle commands but Launchdeck remains the execution authority.
  - Skills should use Launchdeck state, registry, locks, ports, inspect, logs, and ownership proof to avoid duplicate starts and unsafe kills.
  - Unknown projects require a staged adoption flow before agent-managed runs.
  - Users should express intent, not skill names; skill routing is agent-internal.
  - First-run discovery should become stored Launchdeck configuration and registry state for quick future operation.
  - Skill authoring should keep SKILL.md concise and push detailed ecosystem rules into references.
- hook_persistence_policy: hooks may remind on resume or compaction, but must not create per-user-reply discussion writes

## Context Boundary

- context_boundary_status: locked
- current_project_root: F:/github/launchdeck
- current_project_roles:
  - role: implementation target
    scope: Launchdeck CLI product and future agent skill integration surface.
    evidence_source: active workspace and live reads.
    notes: The current discussion extends Launchdeck with agent-facing skills.
- target_project_root: F:/github/launchdeck
- target_project_roles:
  - role: implementation target
    scope: Same as current project.
    evidence_source: active workspace.
    notes: No external target project is in scope.
- reference_sources:
  - Existing consumed Launchdeck tool and CLI control-plane discussions.
  - Current README, CLI, runtime, and lifecycle test evidence.
- external_systems: []
- boundary_blockers: []
- path_status: target-read-confirmed
- boundary_confidence: high

## Evidence Navigation

- latest_cognition_intent: discussion
- latest_cognition_readiness: review
- latest_minimal_live_reads:
  - `src/runtime.js`
  - `src/cli.js`
  - `test/cli.test.js`
- latest_live_evidence:
  - `README.md`
  - `src/runtime.js`
  - `src/cli.js`
  - `test/cli.test.js`
- cognition_authority_rule: project cognition navigates; live repository evidence proves
- truth_pass_authority_rule: verify current-project facts with live evidence before technical advice
- unresolved_evidence_conflicts: []

## Session Selection

- incomplete_statuses: active, blocked, handoff-ready
- resume_rule: resume only when exactly one incomplete discussion is available or the user selected a slug
- collision_rule: append date or short numeric suffix when a generated slug already exists
- close_archive_rule: handoff-ready remains resumable only until consumed or explicitly dropped; after `sp-specify` consumes the handoff, mark consumed/completed before archiving

## Handoff Assessment

- handoff_assessment_status: ready-for-specify
- handoff_assessment_path: .specify/discussions/launchdeck-agent-skill-suite/handoff-assessment.md
- handoff_assessment_decided_at: 2026-07-09T16:29:56+08:00
- handoff_scope_shape: unified

## Handoff Review

- handoff_review_status: handoff-ready
- handoff_user_confirmed_at: 2026-07-09T16:40:46+08:00
- handoff_blocker_reason: none
- handoff_quality_gate: handoff-ready
- handoff_consumption_status: consumed
- consumed_at: 2026-07-09T16:59:13+08:00
- consumed_by_feature_dir: .specify/features/2026-07-09-launchdeck-agent-skill

## Senior Consequence Analysis

- consequence_gate_status: triggered
- trigger_reason: Agent skills would affect lifecycle operations, project discovery, process start/stop behavior, port conflict handling, shared Launchdeck state, safety boundaries, and downstream automation behavior.
- stand_down_reason: none
- active_consequence_obligations:
  - CA-AS-001: Skills must treat Launchdeck as the execution authority and must not independently kill unknown processes.
  - CA-AS-002: Skills must discover and classify lifecycle commands before running or proposing managed configuration.
  - CA-AS-003: Skills must require Launchdeck ownership proof before stop/restart/force-stop decisions.
  - CA-AS-004: Skills must prefer inspect/reconcile/status evidence before starting a service that may already exist.
  - CA-AS-005: Skills must preserve agent-readable output and use compact JSON when context budget matters.
  - CA-AS-006: Skills must distinguish read-only discovery, config proposal, config adoption, operation, recovery, and cleanup.
  - CA-AS-007: Skills must preserve user control over risky cleanup and destructive operations.
  - CA-AS-008: Skills must support arbitrary local project stacks by detecting common project files while keeping `.launchdeck.yml` explicit as authority.
  - CA-AS-009: Skill invocation must be intent-routed from natural user requests, not dependent on users naming the correct skill.
  - CA-AS-010: Learned lifecycle knowledge must persist as Launchdeck config/registry state so later runs do not repeat expensive or risky discovery.
- latest_consequence_handoff: none
- coverage_gap_count: 4

## Handoff

- handoff_to_specify: .specify/discussions/launchdeck-agent-skill-suite/handoff-to-specify.md
- handoff_to_specify_json: .specify/discussions/launchdeck-agent-skill-suite/handoff-to-specify.json
- handoff_kind: discussion_requirement_contract
- handoff_goal: Specify a v0 `launchdeck-agent` skill package that lets coding agents safely discover, adopt, operate, recover, observe, and clean local software projects through Launchdeck.
- consumer_eligibility: sp-specify=ready; sp-quick=blocked-requires-spec-first
- recommended_consumer: sp-specify
- quick_task_candidate_status: requires-spec-first
- quality_gate_status: handoff-ready
- handoff_requested_by_user: true
- next_command: none
