# Discussion Log: Launchdeck CLI Control Plane

## 2026-07-08T14:46:06.7072188+08:00

- event_kind: semantic-checkpoint
- covered_turn_count: 12
- user_input_summary: User asked to make the CLI product more complete, confirmed CLI-only direction, confirmed a single-instance/global task visibility model, and asked to record the current discussion before continuing.
- agent_conclusion: Recorded a new active discussion package for the post-v1 CLI control-plane direction instead of mutating the already consumed `launchdeck-tool` handoff package.
- confirmed_decisions:
  - Launchdeck should be a CLI-only global project lifecycle control plane.
  - Single instance means one user-scoped authoritative state/control namespace, not necessarily a permanent daemon in the first version.
  - Many terminals, agents, and scripts should see the same global project/task/run/port state.
  - Mutating operations such as start, stop, restart, force-stop, registry writes, and reconcile must be serialized by locks.
  - Launchdeck should model Project, Task, Run, and Port as product objects.
  - State must combine run status, ownership, and port status.
  - Launchdeck stops only owned process trees by default and does not kill by port.
  - External processes are inspectable but not automatically stoppable.
  - Stale state requires reconcile before dangerous operations.
  - Output should include conclusion, evidence, and safe next actions.
  - `.launchdeck.yml` is the safety contract for lifecycle control.
  - Automatic discovery proposes configuration but does not authorize execution.
  - `doctor` is a safety/readiness gate.
  - Observation includes snapshots, watch/follow, and event stream concepts.
  - Running and ready are distinct states.
  - Failure categories must map to safe recovery paths.
- pending_requirement_points:
  - Project registration and naming model.
  - Duplicate project name handling.
  - Path move and missing-path recovery.
  - Global alias rules.
  - Registry ownership and project identity model.
- evidence_used:
  - Existing consumed discussion package under `.specify/discussions/launchdeck-tool/`.
  - Project memory and learning index.
  - User-confirmed product direction in the current conversation.
- open_question_delta:
  - Whether whole-machine/multi-user registry sharing must be first-class remains deferred.
  - Whether daemon/service mode is required remains deferred.
- save_trigger: user-triggered-save

## 2026-07-08T15:17:52.6503678+08:00

- event_kind: handoff-generated
- covered_turn_count: 18
- user_input_summary: User continued the discussion through clean/reset boundaries, confirmation semantics, automation, extension boundaries, maturity levels, minimum complete CLI surface, user journeys, product positioning, acceptance stories, official demo, documentation, error codes, future GUI/MCP reuse, compatibility, security, cross-platform validation, and then explicitly requested handoff.
- agent_conclusion: Completed formal handoff assessment and generated one unified draft handoff pair for `sp-specify`. The draft is self-reviewed but still requires user confirmation before becoming handoff-ready.
- handoff_artifacts:
  - `.specify/discussions/launchdeck-cli-control-plane/handoff-assessment.md`
  - `.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.md`
  - `.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.json`
- quality_gate:
  - assessment_status: ready-for-specify
  - handoff_review_status: self-review-passed
  - user_review_required: true
  - user_confirmed_at: none
- recommended_consumer:
  - after_user_confirmation: sp-specify
  - sp-quick: not recommended because the scope spans global registry, process ownership, locks, events, JSON contracts, cleanup safety, security, and cross-platform verification.
- confirmed_decisions:
  - `clean` remains hygiene for regenerable or explicitly managed data; `reset` is destructive and deferred.
  - `--yes` confirms known impact; `--force` only strengthens Launchdeck-owned actions; neither bypasses safety.
  - Automation requires stable JSON, JSON Lines for streams, no prompt hangs, timeouts, idempotent ensure-running semantics, and machine-readable next actions.
  - Extensions and future clients must reuse the same control-plane truth and cannot expand default permissions.
  - Product maturity is L2/L3 centered: global control plane plus reliable cross-platform supervision.
  - The first official demo should use a minimal dependency-light API to prove the core loop.
  - Error codes and next actions are stable product APIs.
  - Compatibility and migrations must fail closed for dangerous mutations when persistent state versions are unsupported.
  - Security requirements include path containment, symlink/junction refusal, no external kills, PID reuse protection, secret redaction, safe aliases, and corrupt-state degradation.
  - Cross-platform-ready requires lifecycle smoke evidence on Windows, macOS, and Linux.
- save_trigger: explicit-handoff-request

## 2026-07-08T15:29:26.6223662+08:00

- event_kind: handoff-confirmed
- covered_turn_count: 1
- user_input_summary: User confirmed the draft handoff.
- agent_conclusion: Marked the Launchdeck Global CLI Control Plane handoff as ready for downstream `sp-specify` consumption.
- handoff_artifacts:
  - `.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.md`
  - `.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.json`
  - `.specify/discussions/launchdeck-cli-control-plane/discussion-state.md`
- quality_gate:
  - status: user_confirmed
  - user_review_required: false
  - user_confirmed_at: 2026-07-08T15:29:26.6223662+08:00
- recommended_consumer: sp-specify
- next_command: sp-specify
- save_trigger: user-handoff-confirmation

## 2026-07-08T16:50:55.6971188+08:00

- event_kind: handoff-consumed
- covered_turn_count: 1
- user_input_summary: User invoked `sp-specify`; the confirmed Launchdeck Global CLI Control Plane handoff was consumed into a formal specification package.
- agent_conclusion: Created and reviewed the planning-ready feature package at `.specify/features/2026-07-08-launchdeck-global-cli-control-plane`, preserved the handoff safety and control-plane invariants, repaired read-only reviewer findings, and set the next command to `/sp.plan`.
- consumed_by_feature_dir: `.specify/features/2026-07-08-launchdeck-global-cli-control-plane`
- generated_artifacts:
  - `.specify/features/2026-07-08-launchdeck-global-cli-control-plane/spec.md`
  - `.specify/features/2026-07-08-launchdeck-global-cli-control-plane/alignment.md`
  - `.specify/features/2026-07-08-launchdeck-global-cli-control-plane/context.md`
  - `.specify/features/2026-07-08-launchdeck-global-cli-control-plane/references.md`
  - `.specify/features/2026-07-08-launchdeck-global-cli-control-plane/checklists/requirements.md`
  - `.specify/features/2026-07-08-launchdeck-global-cli-control-plane/brainstorming/handoff-to-specify.json`
  - `.specify/features/2026-07-08-launchdeck-global-cli-control-plane/workflow-state.md`
- review_result:
  - read_only_reviewer_findings: repaired
  - source_signal_disposition_status: complete
  - must_preserve_coverage_status: complete
- next_command: /sp.plan
- save_trigger: handoff-consumption

## 2026-07-08T14:55:42.0662123+08:00

- event_kind: semantic-checkpoint
- covered_turn_count: 10
- user_input_summary: User asked to continue the product discussion, then requested a checkpoint before continuing. The covered discussion locked registry, naming, transaction, locking, ownership, inspect, status layering, onboarding, multi-project port conflict, and logs/events retention semantics.
- agent_conclusion: Refreshed the active discussion package with the second layer of CLI control-plane decisions. The next useful topic is clean/reset boundary design.
- confirmed_decisions:
  - `projectId` is the stable system identity; `alias` is the user-facing unique reference; `path` is current location and can become missing/moved.
  - `project remove` removes registry membership only and must not delete project files.
  - Global state should split responsibilities across project registry, runtime run index, locks, events, and live OS inspection.
  - State authority order is live OS reality, ownership identity, registry identity, config contract, and cache last.
  - `start`, `stop`, `restart`, `reconcile`, and project registry writes should be transaction-like command flows.
  - A `starting` run record should exist before process spawn so concurrent starts do not duplicate the service.
  - Locking should use registry, project, and task granularity rather than one global exclusive lock for every operation.
  - Stale locks should be recoverable only when PID/start-time evidence is strong enough.
  - Ownership should be proven by multiple signals such as run id, project id, task, PID start time, process tree/group/job evidence, cwd, command, expected ports, injected environment, and runtime record.
  - `inspect` should be a unified diagnostic command for project, task, run, port, PID, and path targets.
  - `status`, `ps`, `ports`, `conflicts`, and `inspect` should have distinct roles.
  - `project scan` only discovers; `project add` registers; neither starts tasks.
  - Multi-project port conflicts should be represented as facts and safe actions, not automatic priority decisions.
  - Logs are task stdout/stderr; events are Launchdeck control-plane actions.
  - Logs and events should be linked by `projectId`, `task`, `runId`, and `txId`.
- pending_requirement_points:
  - Clean/reset boundary.
  - Runtime/global state pruning rules.
  - Exact retention defaults for logs and events.
  - Exact lock timeout defaults and lock file format.
  - Exact JSON payload shapes for inspect/conflicts/events.
- evidence_used:
  - Current discussion package.
  - User-confirmed product direction.
  - Prior consumed `launchdeck-tool` discussion as context.
- open_question_delta:
  - Project identity is no longer a soft unknown at product level.
  - Registry storage path remains a soft unknown.
  - Event/log retention exact defaults remain soft unknowns.
- save_trigger: user-triggered-save
