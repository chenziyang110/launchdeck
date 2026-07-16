## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.

# Map Build Reference Index

- [semantic-work-contract.md](semantic-work-contract.md): Trigger: when project-cognition-backed semantic intake, routing, permission, audit, resume, or final-claim rules affect the map-build workflow.
