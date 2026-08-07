# Workflow State: Standalone Sample Project Gallery

## Current Command

- active_command: sp-specify
- status: completed

## Phase Mode

- phase_mode: planning-only
- summary: Specification package validated, discussion consumed, prior blocker resolved, and the specify runtime stage completed at revision 4.

## Stage State

- current_stage: artifact-review
- current_domain: none
- next_action: destination owner executes the runtime-recorded transition to plan when /sp.plan is invoked.
- blocker_reason: none
- approach_comparison_status: selected
- section_approval_status: approved
- final_handoff_decision: /sp.plan

## Review State

- last_user_reviewed_artifact_state: approved
- canonical_contract_ref: spec-contract.json
- canonical_contract_revision: sha256:7b6cf832edcdd1f1dbdb88cd3428d9a68b4091fec21807e528737af7e18d2154
- semantic_delta: none

## Semantic Audit State

- semantic_audit_status: not-needed
- semantic_audit_input_path: none
- semantic_audit_output_path: none
- semantic_audit_resume_status: fresh
- semantic_audit_resume_validation: not-run
- semantic_audit_route_fingerprint: none
- semantic_audit_generated_resume_smoke: not-applicable
- semantic_audit_stale_reasons: none
- active_claim_type: none
- selected_candidate_ids: none
- claim_readiness_status: not-evaluated
- claim_authorization_refs: approved discussion digest
- claim_verification_refs: spec-contract acceptance closure and deterministic spec validation

## Unknown Handling

- hard_unknown_count: 0
- soft_unknown_count: 0
- next_unknown_to_resolve: none
- design-system carry-forward: existing project CLI/TUI system
- design_system_status: ready
- design_risk_level: medium

## UI Reference Processing

- ui_reference_processing_status: not-applicable
- ui_reference_lane_mode: none
- ui_fidelity_mode: none
- ui_reference_notes: none
- ui_brief: ui-brief.md
- ui_target: none
- ui_reference_ownership: project-owned
- visual_verification_requirement: agent-visual-comparison
- required_evidence: 60/120-column, no-color, keyboard/no-match/cancel, JSON/compact, destination conflict and rollback captures

## Reopen Contract

- reopen_source: specify
- reopen_target: specify
- reopen_reason: only if target worktree location changes, approved inventory/scope changes, or reviewer/validator finds a semantic contract defect

## Analyze Gate

- gate_status: not-run
- gate_cycle: 0
- highest_invalid_stage: none
- blocker_bundle: empty
- blocker_attribution_values: none
- artifact_fingerprint_basis:
  - spec.md: runtime-managed final hash pending
  - context.md: runtime-managed final hash pending
  - plan.md: not created
  - tasks.md: not created

## Learning Signals

- route_reason: sp-auto accepted the single reversible worktree-path recommendation, routed the target repair to sp-discussion, then returned to the confirmed sp-specify consumer.
- blocked_reason: none; runtime-owned consumer binding succeeded at the internal Git-ignored worktree path.

## Learning Triggers

- cognition_gap: target worktree cognition database is missing/stale; live repository evidence is authoritative.
- tooling_trap: discussion consumers are constrained under the discussion source project root even when product work uses an approved external worktree.
- reusable_constraint: entrypoint outcome audits require explicit Learning dispositions plus exact acceptance and CA refs.

## False Starts

- Attempted `discussion bind-consumer` directly to `F:/github/launchdeck-worktrees/sample-project-gallery/.specify/features/2026-08-03-deliver-ten-standalone`; runtime rejected the path before mutation.
- Attempted runtime-owned requirements checklist generation; the v0.5.4 target baseline lacks `.specify/templates/artifacts/checklist.md`, so no direct-write workaround was used.
- Did not bypass either guard with manual compatibility/checklist writes, copies, symlinks or source-truth edits.

## Hidden Dependencies

- Formal compile completion depends on a runtime-owned compatibility pointer under the consumer feature directory.
- The v0.5.4 clean worktree lacks a local `.specify/bin/specify-runtime.exe`; workflow commands use the source repository runtime while setting the clean worktree as cwd.
- Actual package verification must inspect a tarball, not only `npm pack --dry-run`.

## Reusable Constraints

- Canonical artifacts are read and patched only through leased `specify-runtime artifact` operations.
- Product source/tests remain untouched during `sp-specify`.
- Explicit CLI IDs serve automation; interactive selection is TTY-only.
- Sample roots stay free of Launchdeck artifacts and evaluation behavior.
- Cross-platform claims require live Windows/Linux evidence and no skip-based success.

## Embedded Implement Review

- current_task_id: none
- current_task_lifecycle_ref: none
- review_status: not-triggered
- review_trigger: none
- latest_review_or_repair_ref: none
- workflow_state_write_allowlist: current task/review and next-action fields only during implementation
- workflow_state_protected_fields: all specification truth, evidence, transition, gate and reopen fields

## Canonical Phase Contract

- contract_ref: spec-contract.json
- contract_revision: sha256:7b6cf832edcdd1f1dbdb88cd3428d9a68b4091fec21807e528737af7e18d2154
- transition_status: complete

## Allowed Artifact Writes

- `spec-contract.json`
- `spec.md`
- `alignment.md`
- `context.md`
- `ui-brief.md`
- `workflow-state.md`
- deterministic requirements checklist and runtime-owned compatibility transition

## Forbidden Actions

- Edit product source, tests or package/CI files.
- Create plan, tasks or implementation artifacts.
- Modify the original dirty workspace product files.
- Manually write/copy the canonical discussion compatibility handoff.
- Claim planning transition complete before binding and consumed-state validation.

## Authoritative Files

- Canonical product contract: `spec-contract.json`.
- Human views: `spec.md`, `alignment.md`, `context.md`, `ui-brief.md`.
- Upstream truth: approved source discussion contract digest `e7e620fe1f707a44a1ad5a8cdeb62732114d146467f00a34b6da6ff233dadb26`.
- Bound compatibility pointer: `brainstorming/handoff-to-specify.json`.
- Live facts: current repository code, package, CI, tests and DESIGN.md; project cognition is not authoritative while stale.

## Next Command

- `/sp.plan`
