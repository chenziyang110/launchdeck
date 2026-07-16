# Project Context: Launchdeck CLI Control Plane

## Context Boundary

The active project at `F:/github/launchdeck` is the implementation target. This discussion extends the already consumed `launchdeck-tool` discussion/handoff rather than replacing it.

## Source Context

The earlier `launchdeck-tool` discussion and handoff defined v1 as a CLI-first local single-project lifecycle tool. The current discussion expands the product shape toward a CLI-only global control plane that can supervise many registered local projects from one user-scoped state namespace.

## Verified Discussion Facts

- The prior `launchdeck-tool` handoff was consumed by `.specify/features/2026-07-07-launchdeck-v1-cross`.
- The current user direction is CLI-only, not GUI/TUI first.
- The user wants global visibility of running project services, ports, and precise stop/restart actions.
- The user explicitly cares about avoiding duplicate service starts and avoiding mistaken process kills.
- The user confirmed the single-instance direction.

## Evidence Checked

- `.specify/memory/project-rules.md`
- `.specify/memory/learnings/INDEX.md`
- `.specify/discussions/launchdeck-tool/discussion-state.md`
- `.specify/discussions/launchdeck-tool/discussion-log.md`
- `.specify/discussions/launchdeck-tool/requirements.md`
- `.specify/discussions/launchdeck-tool/technical-options.md`
- `.specify/discussions/launchdeck-tool/project-context.md`
- `.specify/discussions/launchdeck-tool/open-questions.md`

## Open Assumptions

- Default scope is one OS user on one machine.
- CLI remains the first complete product surface.
- Daemon mode is not required for the current design pass.
- External process killing is out of scope unless the user explicitly reopens that safety boundary.

## Advice Confidence

High for product-level direction.

Medium for implementation-specific details until a later truth pass verifies current CLI/runtime surfaces and tests.
