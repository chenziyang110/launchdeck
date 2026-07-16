# Requirements Checklist: Launchdeck Global CLI Control Plane

## Handoff And Source Integrity

- [x] Exactly one unconsumed `handoff-ready` discussion was selected.
- [x] Handoff Markdown and JSON were read.
- [x] Required discussion sources were read: discussion log, requirements, open questions, technical options, project context, and state.
- [x] Handoff quality gate was confirmed by the user.
- [x] Hard unknown count is 0.
- [x] Open conflict count is 0.

## Scope Integrity

- [x] Specification preserves the Global CLI Control Plane framing.
- [x] Specification remains CLI-first.
- [x] Daemon/service implementation is deferred.
- [x] GUI/TUI/MCP/editor implementation is deferred.
- [x] External process kill is out of scope.
- [x] Destructive reset is separate and deferred.
- [x] Whole-machine or multi-user registry is deferred.

## Must-Preserve Coverage

- [x] MP-001 covered: control-plane framing.
- [x] MP-002 covered: user-scoped local machine default.
- [x] MP-003 covered: single authoritative namespace, not daemon requirement.
- [x] MP-004 covered: stable project ID, alias, repairable path.
- [x] MP-005 covered: authority layer separation.
- [x] MP-006 covered: duplicate-start prevention.
- [x] MP-007 covered: ownership proof for stop/restart.
- [x] MP-008 covered: no default external kill.
- [x] MP-009 covered: unified inspect.
- [x] MP-010 covered: clean/reset separation.
- [x] MP-011 covered: confirmation/force cannot bypass hard safety.
- [x] MP-012 covered: JSON/error/next-action/JSONL compatibility.
- [x] MP-013 covered: future clients reuse same truth.
- [x] MP-014 covered: state compatibility fails closed.
- [x] MP-015 covered: security fails closed.
- [x] MP-016 covered: official demo proves core loop.
- [x] MP-017 covered: cross-platform-ready requires three-OS smoke evidence.

## Source Signal Disposition

- [x] Every upstream capability-like signal has exactly one disposition in `alignment.md`.
- [x] No signal is left as an implicit assumption.
- [x] Deferred signals include reopen conditions or planning ownership.
- [x] Dropped signals are explicitly out of scope and do not leak into requirements.
- [x] There are no clarification blockers.

## Requirements Quality

- [x] Functional requirements are testable.
- [x] User scenarios include success and failure paths.
- [x] Safety invariants are explicit.
- [x] JSON and automation behavior are treated as product contracts.
- [x] Logs/events and clean/reset boundaries are specified.
- [x] Compatibility and migration behavior is specified at product level.
- [x] Cross-platform claim rules are explicit.

## Planning Readiness

- [x] No hard unknown blocks planning.
- [x] Soft unknowns are listed for planning.
- [x] Current implementation facts are separated from desired feature scope.
- [x] Verification entry points are identified.
- [x] Recommended next command is exactly `/sp.plan`.
