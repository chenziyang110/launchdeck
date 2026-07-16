# Handoff Assessment: Launchdeck CLI Control Plane

## Decision

- decision_status: ready-for-specify
- decided_at: 2026-07-08T15:17:52.6503678+08:00
- recommended_consumer: sp-specify
- assessment_result: Write one unified handoff package for formal specification.

## Rationale

The discussion has a coherent product boundary: Launchdeck Global CLI Control Plane. The target is the current Launchdeck repository at `F:/github/launchdeck`. The direction is no longer exploratory; it defines a user-scoped, CLI-first control plane for registering multiple local projects, observing global running state, inspecting port/process ownership, preventing duplicate service starts, and safely stopping/restarting only Launchdeck-owned tasks.

The package is too broad for `sp-quick` because it affects global state, process lifecycle, ownership proofs, lock semantics, event/log retention, cleanup safety, JSON compatibility, non-interactive behavior, security, documentation, demo, and cross-platform verification.

## Assessment Dimensions

- feature_coherence: ready
- implementation_target_clarity: ready
- current_repository_role: implementation target
- reference_source_clarity: ready
- planning_shape: unified product feature with multiple capability areas
- validation_shape: end-to-end demo stories plus cross-platform lifecycle smoke
- risk_profile: high enough to require formal specification before implementation

## Scope For Handoff

Include:

- user-scoped global control-plane model
- project registry and identity model
- global runtime run index
- locks and command transaction semantics
- status/ps/ports/conflicts/inspect command roles
- ownership proof and no-external-kill safety
- project scan/add/remove/repair onboarding
- duplicate-start prevention
- safe lifecycle operations for owned tasks
- logs/events linkage and retention
- clean/reset boundary
- confirmation, force, and non-interactive behavior
- JSON envelope, error codes, and next actions
- official demo and documentation structure
- compatibility, security, and cross-platform readiness requirements

Exclude:

- daemon/service mode
- GUI/TUI/MCP/editor implementation
- external process kill
- destructive reset implementation
- plugin marketplace
- workspace orchestration
- whole-machine/multi-user shared registry
- Docker volume/container ownership

## Blocking Unknowns

No hard blockers.

Soft unknowns are carried forward for downstream specification: exact retention defaults, lock timeout defaults, inspect JSON shape details, registry storage path, JSON schema versioning, and cross-platform process-tree proof strategy.

## Required Next Action

Draft one unified handoff pair:

- `.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.md`
- `.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.json`

The draft must remain user-review state until the user confirms it as handoff-ready.
