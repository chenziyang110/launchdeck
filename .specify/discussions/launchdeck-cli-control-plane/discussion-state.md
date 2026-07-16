# Discussion State: Launchdeck CLI Control Plane

## Current Command

- active_command: sp-discussion
- state_surface: discussion-state
- status: completed
- slug: launchdeck-cli-control-plane
- updated_at: 2026-07-08T16:50:55.6971188+08:00
- closed_at: none
- archived_at: none

## Phase Mode

- phase_mode: discussion-only
- summary: The post-v1 product discussion now frames Launchdeck as a CLI-only, single-user global control plane for local project services. The goal is to make all terminals, agents, and scripts see one authoritative task/process/port state without requiring a daemon in the first product shape.

## Session Routing

- current_stage: handoff-consumed
- current_topic: CLI-only global project lifecycle control plane
- frontstage_reply_contract: unified
- visible_reply_mode: standard
- backstage_state_visibility: summarized
- question_pack_mode: none
- decision_advancement_mode: recommendation-first
- primary_question: none
- optional_followups: []
- recommendation_required_for_choices: true
- blocker_reason: none
- readiness_note: Formal handoff was confirmed by the user and consumed by `F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane` for downstream planning.
- ui_discussion_status: not_applicable

## Advisor Contract

- truth_pass_status: complete
- verified_project_facts:
  - Prior v1 discussion handoff for `launchdeck-tool` was consumed by `.specify/features/2026-07-07-launchdeck-v1-cross`.
  - Current repository remains the implementation target for Launchdeck product work.
  - Current implemented CLI already has local/global runtime concepts, but this discussion is product-level and should not claim implementation completion without live verification.
- open_assumptions:
  - CLI remains the core product surface.
  - No always-running daemon is required for the first global control-plane shape.
  - Default global scope is one OS user on one machine; whole-machine/multi-user sharing is deferred unless explicitly reopened.
  - Launchdeck should prefer refusing unsafe actions over killing unknown processes.
- evidence_checked:
  - `.specify/memory/project-rules.md`
  - `.specify/memory/learnings/INDEX.md`
  - `.specify/discussions/launchdeck-tool/discussion-state.md`
  - `.specify/discussions/launchdeck-tool/discussion-log.md`
  - `.specify/discussions/launchdeck-tool/requirements.md`
  - `.specify/discussions/launchdeck-tool/technical-options.md`
  - `.specify/discussions/launchdeck-tool/project-context.md`
  - `.specify/discussions/launchdeck-tool/open-questions.md`
- advice_confidence: high
- discussion_compass_status: current
- current_decision_frame: Define Launchdeck as a CLI-only, single-instance global control plane for local project lifecycle operations, where every CLI invocation reads and mutates one authoritative user-scoped state.
- confirmed_decisions:
  - Single instance means a single authoritative control plane/state namespace, not necessarily one always-running daemon process.
  - Default scope is user-scoped on the local machine.
  - Many CLI clients may read the same state; mutating operations must be serialized by global locks.
  - Launchdeck should model Project, Task, Run, and Port as first-class product objects.
  - `project:task` should have at most one Launchdeck-owned running instance by default.
  - Launchdeck must distinguish run state, ownership, and port state.
  - Launchdeck must only stop/restart Launchdeck-owned process trees by default.
  - External processes may be inspected but must not be stopped automatically.
  - Unknown or stale state should be reconciled before dangerous operations.
  - Human output should follow conclusion -> evidence -> safe next step.
  - JSON output should use stable envelopes with `ok`, `code`, `message`, `data`, and `next` style fields.
  - `.launchdeck.yml` is a safety control contract, not merely a task shortcut file.
  - Automatic discovery should detect and propose; explicit config remains the authority.
  - `doctor` should decide whether a project can be safely managed, not only parse YAML.
  - Observation should support snapshots, foreground watch/follow, and event streams.
  - Cross-platform semantics must manage owned process trees, not arbitrary ports or single PIDs.
  - Ready state is distinct from process running state.
  - Failures should produce recoverable categories and safe recovery paths.
  - Project identity should use system-owned `projectId` as truth, user-facing `alias` as the command reference, and `path` as repairable location.
  - The global state model should separate registry, runtime index, locks, events, and live OS inspection.
  - Lifecycle mutations should behave like small transactions that lock, inspect reality, update state, write events, and preserve failure evidence.
  - Lock granularity should allow different projects/tasks to proceed concurrently while serializing the same `project:task`.
  - Ownership proof should be evidence-based and should never rely on port or PID alone.
  - `inspect` should be the unified diagnostic command for project, task, run, port, PID, and path targets.
  - `status`, `ps`, `ports`, `conflicts`, and `inspect` should have distinct information roles.
  - `project scan` discovers candidates; `project add` registers; neither command runs tasks.
  - Port conflicts should present facts, ownership, impact, and safe actions instead of choosing a winner.
  - Logs and events should be separate but linked through `projectId`, `task`, `runId`, and `txId`.
  - `clean` is for regenerable or explicitly managed hygiene; destructive `reset` must be separate, explicit, and deferred.
  - `--yes` confirms a known impact area; it does not authorize unsafe inference.
  - `--force` strengthens Launchdeck-owned operations only and does not grant ownership.
  - Non-interactive automation must never hang on prompts; missing confirmation should return structured failure.
  - JSON and JSON Lines are compatibility surfaces for automation and future clients.
  - Extensions may add discovery, adapters, ready checks, presentation, or opt-in policy, but cannot violate core ownership/safety invariants.
  - Product maturity should be judged by global visibility, precise owned control, no external kills, and cross-platform lifecycle evidence.
  - The minimum complete CLI surface covers onboarding, understanding, operating, observing, recovering, and maintaining.
  - Official demo should prove duplicate-start prevention, port ownership, inspect, restart/stop, stale recovery, logs/events, and clean safety.
  - Documentation should split README, concepts, commands, config, demo, JSON, and safety material.
  - Error codes and next actions are product-level APIs.
  - Future GUI/TUI/MCP/editor clients must reuse the same control plane, state, events, and safety model.
  - State/data migrations must fail closed for dangerous operations when versions are unsupported.
  - Security requirements include path containment, symlink/junction safety, PID reuse checks, no env value leakage, and safe alias/task names.
  - Cross-platform readiness requires lifecycle behavior evidence on Windows, macOS, and Linux, not just CLI startup.
- changed_recommendations:
  - Product direction expanded from v1 single-project lifecycle control toward a global CLI control plane for many local projects.
  - The preferred global model is state+lock based first, with daemon/service mode deferred.
- next_discussion_paths:
  - User reviews the draft handoff pair.
  - If approved, mark handoff-ready for downstream `sp-specify`.
  - If changes are requested, repair Markdown/JSON together in `sp-discussion`.

## Context Boundary

- context_boundary_status: locked
- current_project_root: F:/github/launchdeck
- current_project_roles:
  - role: implementation target
    scope: Launchdeck CLI product, protocol, runtime state, global registry, and lifecycle semantics.
    evidence_source: current workspace plus consumed prior discussion package.
    notes: This discussion extends the Launchdeck product direction after the v1 handoff was consumed.
- target_project_root: F:/github/launchdeck
- target_project_roles:
  - role: implementation target
    scope: Same as current project.
    evidence_source: active workspace.
    notes: No external target project is in scope.
- reference_sources:
  - `.specify/discussions/launchdeck-tool/`
  - User confirmations in the current discussion about CLI-only direction, single-instance control plane, and global task visibility.
- external_systems: []
- boundary_blockers: []
- path_status: target-read-confirmed
- boundary_confidence: high

## Evidence Navigation

- latest_cognition_intent: discussion
- latest_cognition_readiness: review
- latest_minimal_live_reads: []
- latest_live_evidence:
  - `.specify/discussions/launchdeck-tool/discussion-state.md`
  - `.specify/discussions/launchdeck-tool/requirements.md`
  - `.specify/discussions/launchdeck-tool/technical-options.md`
- cognition_authority_rule: project cognition navigates; live repository evidence proves
- truth_pass_authority_rule: verify current-project facts with live evidence before technical advice
- unresolved_evidence_conflicts: []

## Lightweight Recovery

- latest_event_checkpoint: 2026-07-08T15:17:52.6503678+08:00
- last_compaction_checkpoint: 2026-07-08T15:17:52.6503678+08:00
- compact_summary_status: current
- ordinary_turn_write_policy: deferred-checkpoint
- ordinary_turn_write_gate: suppress local writes until save trigger; do not update persisted counters for every user reply
- structured_refresh_policy: semantic-checkpoint-only
- save_trigger_policy: semantic-checkpoint | user-triggered-save | five-turn-cadence | compaction-risk | durable-lifecycle-transition
- unsaved_turn_count: 0
- pending_context_summary: []
- compaction_preserve_items:
  - Single-instance means one user-scoped control plane/state namespace.
  - Launchdeck should avoid duplicate service starts and avoid external-process kills.
  - State, ownership, port inspection, readiness, recovery, and global registry semantics must remain first-class product requirements.

## Senior Consequence Analysis

- consequence_gate_status: triggered
- trigger_reason: The selected direction affects running processes, shared runtime state, port conflict handling, stop/restart safety, cleanup safety, cross-platform behavior, and future downstream consumers.
- stand_down_reason: none
- active_consequence_obligations:
  - CA-CP-001: Global state must be single-authoritative per default user scope.
  - CA-CP-002: Mutating lifecycle operations must be globally serialized to prevent duplicate starts and split-brain runtime state.
  - CA-CP-003: Stop/restart authority must require Launchdeck ownership proof; port or PID alone is insufficient.
  - CA-CP-004: External processes may be visible but must be inspect-only by default.
  - CA-CP-005: Stale and uncertain state must route to reconcile/inspect before dangerous lifecycle actions.
  - CA-CP-006: Human and JSON output must always expose reason and safe next actions.
  - CA-CP-007: Ready, running, failed, stale, external, and conflict states must be distinct enough for safe automation.
  - CA-CP-008: Project identity must not depend only on path or display name; aliases must be unique and repairable.
  - CA-CP-009: Registry, runtime index, locks, events, and OS inspection must remain distinct authority layers.
  - CA-CP-010: Every lifecycle mutation must leave an explanatory state/event trail even on failure.
  - CA-CP-011: Lock stale recovery must avoid PID-reuse mistakes and remain visible to the user.
  - CA-CP-012: Inspect output must expose evidence, ownership confidence, safe actions, and blocked actions.
  - CA-CP-013: Logs and events must be retained enough for diagnosis without leaking secrets or growing unbounded.
  - CA-CP-014: `clean` must remain non-destructive hygiene and must not absorb reset semantics.
  - CA-CP-015: Confirmation flags must not bypass ownership, path, or version safety.
  - CA-CP-016: Automation support must provide stable JSON, non-interactive behavior, timeouts, and structured next actions.
  - CA-CP-017: Future clients must reuse the same control-plane state and cannot maintain a second truth.
  - CA-CP-018: Persistent state versioning must block dangerous mutations when compatibility is unknown.
  - CA-CP-019: Security threat-model requirements must survive specification and implementation.
  - CA-CP-020: Cross-platform support claims must be tied to lifecycle smoke evidence on Windows, macOS, and Linux.
- coverage_gap_count: 8

## Handoff

- handoff_assessment_status: ready-for-specify
- handoff_assessment_path: .specify/discussions/launchdeck-cli-control-plane/handoff-assessment.md
- handoff_assessment_decided_at: 2026-07-08T15:17:52.6503678+08:00
- handoff_scope_shape: unified
- handoff_review_status: user-confirmed
- handoff_user_confirmed_at: 2026-07-08T15:29:26.6223662+08:00
- handoff_blocker_reason: none
- handoff_quality_gate: user_confirmed
- handoff_consumption_status: consumed
- consumed_by_feature_dir: F:/github/launchdeck/.specify/features/2026-07-08-launchdeck-global-cli-control-plane
- consumed_at: 2026-07-08T16:50:55.6971188+08:00
- handoff_to_specify: .specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.md
- handoff_to_specify_json: .specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.json
- handoff_kind: discussion_requirement_contract
- handoff_goal: Specify Launchdeck Global CLI Control Plane as a user-scoped, CLI-first control plane for registering multiple local projects, preventing duplicate service starts, inspecting port/process ownership, safely stopping/restarting only Launchdeck-owned tasks, and preserving global status/log/event/recovery semantics.
- consumer_eligibility: sp-specify=ready; sp-quick=not-recommended
- recommended_consumer: sp-specify
- quick_task_candidate_status: requires-spec-first
- quality_gate_status: user_confirmed
- handoff_requested_by_user: true
- next_command: none
