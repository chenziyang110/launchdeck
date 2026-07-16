## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.

# Quick Reference Index

- [semantic-work-contract.md](semantic-work-contract.md): Trigger: when project-cognition-backed semantic intake, routing, permission, audit, resume, or final-claim rules affect the quick workflow.
- [intake-and-checkpoint.md](intake-and-checkpoint.md): Trigger: before quick-task execution, broad reads, delegation, or validation commands.
- [workspace-state.md](workspace-state.md): Trigger: when creating, resuming, recovering, closing, or archiving a quick-task workspace.
- [handoff-consumption.md](handoff-consumption.md): Trigger: when sp-quick starts from discussion or task handoff material.
- [packetized-work.md](packetized-work.md): Trigger: before quick-task implementation, subagent dispatch, join points, or recovery work.
- [validation-and-closeout.md](validation-and-closeout.md): Trigger: before final summary, coverage claim, map update, or resolved/blocked state.
