# Handoff To Specify: Launchdeck Global CLI Control Plane

## Handoff Metadata

- handoff_kind: discussion_requirement_contract
- discussion_slug: launchdeck-cli-control-plane
- handoff_goal: Specify Launchdeck Global CLI Control Plane as a user-scoped, CLI-first control plane for registering multiple local projects, preventing duplicate service starts, inspecting port/process ownership, safely stopping/restarting only Launchdeck-owned tasks, and preserving global status/log/event/recovery semantics.
- recommended_consumer: sp-specify
- handoff_status: handoff-ready
- planning_gate_status: ready
- coverage_status: sufficient-for-specify
- hard_unknown_count: 0
- open_conflict_count: 0

## Handoff Reviewer Guide

Decision to make: confirm whether this draft accurately captures the intended product direction and is safe to mark handoff-ready for `sp-specify`, or request concrete changes before the next stage.

Review first: Handoff Goal, Context Boundary, Implementation Target, Agent Requirement Contract, Source Evidence, Blocking Unknowns, Downstream Instructions, Must-Preserve Ledger, and Consequence Obligations.

Approve only if: the goal is a CLI-first global control plane rather than a loose command bundle, the target project is `F:/github/launchdeck`, hard blockers are absent, deferred decisions are acceptable as soft unknowns, and the safety invariants cover ownership, external processes, path cleanup, state compatibility, and cross-platform claims.

Request changes if: the handoff weakens the no-external-kill rule, treats daemon/GUI/MCP/reset as in-scope implementation, hides a hard product decision as a soft unknown, or lets downstream workflows flatten the work into small command patches without preserving the global control-plane model.

What not to over-review: exact filenames, final JSON field spelling, exact lock timeout seconds, exact log retention days, and final UI layout can remain downstream soft unknowns unless they change the product boundary or safety model.

## Context Boundary

- current_project_root: `F:/github/launchdeck`
- target_project_root: `F:/github/launchdeck`
- reference_projects: none
- external_systems: local operating system process table, local port inspection surfaces, local filesystem, future CLI clients only
- path_status: target-read-confirmed
- boundary_confidence: high

Current project roles:

- role: implementation target
  - scope: Launchdeck CLI product, lifecycle protocol, global registry, runtime state, locks, logs, events, safety model, documentation, demo, and tests.
  - evidence_source: active workspace plus consumed prior `launchdeck-tool` discussion package.
  - notes: Current repository is the product implementation target.

Target project roles:

- role: implementation target
  - scope: Same as current project.
  - evidence_source: user-confirmed current workspace.
  - notes: No external target project is in scope.

## Implementation Target

- target_project: Launchdeck
- target_root: `F:/github/launchdeck`
- target_paths_or_modules: to be selected by downstream specification and planning
- target_paths_still_to_verify:
  - current CLI command surface
  - current global runtime implementation
  - current tests and documentation
  - current example/demo surfaces
- target_project_cognition_status: available as advisory, not authoritative
- authority_note: Current project cognition may navigate the codebase, but downstream source claims must be proven from live repository reads.

## Agent Requirement Contract

### Target Need

Launchdeck needs a user-scoped global CLI control plane so a developer can register multiple local projects, see which project services are running, know which ports are occupied and by whom, avoid duplicate starts, and safely restart or stop only services that Launchdeck owns.

### Constraints

- CLI remains the first complete product surface.
- Default control-plane scope is one OS user on one machine.
- Single instance means one authoritative state/control namespace, not necessarily an always-running daemon.
- Launchdeck must not kill external processes by default.
- Port and PID are evidence only; neither grants ownership.
- `--yes` and `--force` must not bypass ownership, path, version, or external-process safety.
- `clean` is hygiene; destructive `reset` is separate and deferred.
- Persistent state incompatibility must fail closed for dangerous mutations.
- Cross-platform-ready claims require lifecycle smoke evidence on Windows, macOS, and Linux.

### Success Criteria

- User can register multiple projects and list them globally.
- Starting an already running `project:task` does not create a second instance.
- `status --all`, `ps --all`, `ports`, and `conflicts` explain global running state and blocked tasks.
- `inspect` explains project/task/run/port/PID/path targets with evidence, ownership confidence, safe actions, and blocked actions.
- Owned port conflicts offer owner task actions; external port conflicts offer inspect/manual actions only.
- Stale state can be detected and repaired through `reconcile`.
- Logs and events link to project/task/run/transaction identity.
- Clean only removes safe/generated/stale/retention-expired managed data and never deletes unknown files, project roots, or running evidence.
- JSON and JSON Lines output are stable enough for automation and future clients.

### Design Direction

Treat Launchdeck as a local project-service control plane, not a task runner, process killer, or agent-only plugin. The CLI should organize capabilities around onboarding, understanding, operating, observing, recovering, and maintaining project services.

### Optimal Solution Approach

Use a daemonless, user-scoped control-plane namespace first: registry, runtime run index, locks, events, logs, and live OS inspection. Keep a daemon/service as a deferred implementation option. This preserves the user's intent while keeping cross-platform adoption, safety review, and CLI usability manageable.

### Scope

In scope:

- project registry and identity: `projectId`, alias, name, path, config path
- `project add`, `project scan`, `project remove`, `project repair`, `projects`
- global runtime run index
- registry/project/task locks and stale lock handling
- transaction-like start/stop/restart/reconcile/project mutations
- status/ps/ports/conflicts/inspect command roles
- ownership proof model and no-external-kill safety
- duplicate-start prevention
- safe owned lifecycle operations
- ready vs running state
- logs/events linkage and retention constraints
- clean/reset boundary
- confirmation, force, non-interactive, timeout, JSON, and next-action contracts
- official demo and documentation requirements
- compatibility, security, and cross-platform validation requirements

Out of scope:

- daemon/service implementation
- GUI/TUI/MCP/editor implementation
- external process kill
- destructive reset implementation
- auto-restart policy
- plugin marketplace
- workspace orchestration
- whole-machine or multi-user shared registry
- Docker volume/container ownership

Deferred:

- exact lock timeout defaults
- exact log/event retention days or run counts
- exact JSON schema versioning mechanism
- final field names for `inspect --json`
- daemon/service transport if future clients need it

## Source Evidence

- source_type: discussion_state
  - evidence_status: current
  - source: `.specify/discussions/launchdeck-cli-control-plane/discussion-state.md`
  - claim: Current direction is a CLI-only, user-scoped global control plane with single authoritative state namespace and safety-first ownership semantics.

- source_type: requirements
  - evidence_status: current
  - source: `.specify/discussions/launchdeck-cli-control-plane/requirements.md`
  - claim: Requirements define project/task/run/port objects, registry, locks, ownership proof, inspect/status layering, clean/reset boundary, automation, security, documentation, demo, and cross-platform readiness.

- source_type: technical_options
  - evidence_status: current
  - source: `.specify/discussions/launchdeck-cli-control-plane/technical-options.md`
  - claim: Recommended option is a state-and-lock based single-instance control plane, with daemon/service mode deferred.

- source_type: open_questions
  - evidence_status: current
  - source: `.specify/discussions/launchdeck-cli-control-plane/open-questions.md`
  - claim: No hard blockers remain; soft unknowns are carried forward for downstream specification.

- source_type: prior_discussion
  - evidence_status: contextual
  - source: `.specify/discussions/launchdeck-tool/`
  - claim: Prior v1 handoff established Launchdeck as CLI-first local lifecycle control and was consumed by `.specify/features/2026-07-07-launchdeck-v1-cross`.

## Blocking Unknowns

Hard unknowns: none.

Soft unknowns to carry:

- registry storage path defaults
- event/log retention defaults
- lock timeout and stale-lock recovery details
- exact `inspect --json` payload schema
- official demo implementation details
- JSON schema versioning strategy
- cross-platform process-tree proof strategy

Each soft unknown may be resolved during `sp-specify`, planning, or implementation as long as it does not change the locked product boundary or safety invariants.

## Downstream Instructions

- Specify this as one coherent feature: Launchdeck Global CLI Control Plane.
- Do not reduce it to isolated command additions.
- Preserve the object model: Project, Task, Run, Port, Lock, Event, Log.
- Preserve the safety invariants: no external kill by default, no port/PID-only ownership, no unsafe clean, no confirmation bypass.
- Preserve daemonless first as the recommended default while keeping daemon-compatible state semantics.
- Keep future GUI/TUI/MCP/editor clients as deferred presentation clients over the same control plane.
- Treat JSON, error codes, next actions, events, and persistent state versions as compatibility surfaces.
- Include demo, documentation, security, and cross-platform validation in the specification scope.
- Return to `sp-discussion` if downstream work tries to make external kill, reset, daemon, GUI, MCP, or multi-user registry a required part of this feature.

## Discussion Decision Digest

- locked_direction: Launchdeck is a CLI control plane for local project services.
- rejected_alternatives:
  - task-runner-only framing
  - process-killer framing
  - agent-plugin-first framing
  - daemon-first framing
  - per-project-only state as product center
  - external kill as default capability
- accepted_tradeoffs:
  - default user-scoped state over whole-machine state
  - state+lock coordination before daemon
  - fail closed when ownership or path safety is uncertain
  - explicit config remains authority while discovery only proposes
  - exact retention and timeout defaults can be downstream soft unknowns
- experience_commitments:
  - user can ask Launchdeck before killing a port or starting another service
  - errors include reason and safe next action
  - `inspect` explains evidence and blocked actions
  - official demo proves the core loop
- review_criteria_carried_forward:
  - no duplicate same-task starts
  - no external-process kills by default
  - global status shows registered project services
  - port ownership is explained before action
  - clean cannot delete unknown or unsafe targets
  - cross-platform claims require evidence
- must_not_dilute:
  - ownership proof
  - clean/reset separation
  - single control-plane truth
  - JSON/next-action compatibility
  - future clients reusing the same state model

## Must-Preserve Ledger

| ID | Type | Claim | Source | Downstream Requirement | Blocking |
| --- | --- | --- | --- | --- | --- |
| MP-001 | goal | Launchdeck Global CLI Control Plane is the feature, not a loose set of CLI patches. | requirements.md | Spec title, goals, scenarios, and acceptance criteria must preserve this framing. | hard |
| MP-002 | scope | Default scope is user-scoped local machine control plane. | discussion-state.md | Whole-machine/multi-user registry remains deferred unless explicitly reopened. | soft |
| MP-003 | decision | Single instance means one authoritative state/control namespace, not necessarily a daemon. | technical-options.md | Daemon/service mode must be deferred while state remains daemon-compatible. | hard |
| MP-004 | decision | Project identity uses stable `projectId`, unique alias, and repairable path. | requirements.md | Registry spec must not use display name or path as sole identity. | hard |
| MP-005 | decision | Registry, runtime index, locks, events, and OS inspection are distinct authority layers. | requirements.md | Persistent state design must keep these responsibilities separate. | hard |
| MP-006 | scenario | Duplicate start of the same `project:task` must not create a second instance. | requirements.md | Acceptance tests must cover repeated start/dev. | hard |
| MP-007 | decision | Stop/restart requires Launchdeck ownership proof; port or PID alone is insufficient. | requirements.md | Lifecycle operations must block unknown/external ownership. | hard |
| MP-008 | non_goal | Launchdeck is not a system process killer and must not kill external processes by default. | requirements.md | External kill remains out of scope. | hard |
| MP-009 | decision | `inspect` is the unified evidence and safe-action explanation command. | technical-options.md | Spec must include target types, evidence, ownership confidence, safe actions, and blocked actions. | hard |
| MP-010 | decision | `clean` is hygiene and `reset` is separate/destructive/deferred. | requirements.md | Clean commands must not absorb reset semantics. | hard |
| MP-011 | decision | Confirmation and force flags cannot bypass ownership, path, version, or external-process safety. | requirements.md | Permission model must encode this invariant. | hard |
| MP-012 | decision | JSON, error codes, next actions, and JSON Lines are compatibility surfaces. | requirements.md | Spec must define stable automation behavior. | hard |
| MP-013 | tradeoff | Future GUI/TUI/MCP/editor clients are deferred but must reuse the same control-plane truth. | requirements.md | Do not create a second state model for future integrations. | soft |
| MP-014 | decision | Persistent state compatibility must fail closed for dangerous mutations. | requirements.md | Migration/version rules must block unsafe operations on unsupported state. | hard |
| MP-015 | decision | Security must fail closed for path escape, symlink/junction escape, PID reuse, env leakage, corrupt state, and unsafe names. | requirements.md | Security requirements and tests must preserve threat-model coverage. | hard |
| MP-016 | scenario | Official demo must prove duplicate start, port ownership, inspect, restart/stop, stale recovery, logs/events, and clean. | requirements.md | Demo and docs must be part of acceptance. | soft |
| MP-017 | decision | Cross-platform-ready requires lifecycle smoke on Windows, macOS, and Linux. | requirements.md | Release claims must not exceed validation evidence. | hard |

## Consequence Obligations

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

## UI Discussion

- ui_discussion_status: deferred
- confirmed_ui_decisions: none
- deferred_ui_decisions: future GUI/TUI/MCP/editor clients are out of scope for this feature but must reuse the same control-plane state and safety model.
- ui_sketches_present: false
- ui_sketch_reference: none

## Quality Gate

- status: user_confirmed
- self_reviewed_at: 2026-07-08T15:17:52.6503678+08:00
- user_review_required: false
- user_confirmed_at: 2026-07-08T15:29:26.6223662+08:00
- blocked_reasons: none

## Consumer Eligibility

- sp-specify: ready
- sp-quick: not recommended; requires spec first

## Quick Task Candidate

- status: requires-spec-first
- reason: Scope affects global state, lifecycle safety, ownership, JSON compatibility, security, docs, demo, and cross-platform validation.
- bounded_quick_task: none
