## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.


# Plan Reference Index

- [semantic-work-contract.md](semantic-work-contract.md): Trigger: when project-cognition-backed semantic intake, routing, permission, audit, resume, or final-claim rules affect the planning workflow.
- [spec-package-intake.md](spec-package-intake.md): Trigger: before any design artifact synthesis or planning lane dispatch.
- [research-and-design-lanes.md](research-and-design-lanes.md): Trigger: when gathering research, preserving complete-first scope, adopting design inputs, or shaping capability plans.
- [data-model-contracts-and-quickstart.md](data-model-contracts-and-quickstart.md): Trigger: when generating conditional design artifacts and validation scenarios.
- [constitution-risk-and-complexity.md](constitution-risk-and-complexity.md): Trigger: when constitution checks, risk classification, complexity tracking, or alignment risks shape the plan.
- [subagent-dispatch.md](subagent-dispatch.md): Trigger: before delegating research, data-model, contract, or quickstart planning lanes.
- [plan-contract-fields.md](plan-contract-fields.md): Trigger: when writing plan.md, research.md, plan-contract.json, workflow-state.md, or the completion report.
