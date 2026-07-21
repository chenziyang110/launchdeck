## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.


# Review Reference Index

Preserved Contract: system Review owns real-entrypoint scenarios, bounded repair, integrated evidence, fresh fingerprints, and the final pre-acceptance verdict.

- [system-scenario-contract.md](system-scenario-contract.md): Trigger before starting or resuming any system-review scenario.
- [subagent-review-contract.md](subagent-review-contract.md): Trigger before dispatching a review or repair lane and before accepting its result.
- [repair-and-revalidation.md](repair-and-revalidation.md): Trigger when a scenario fails, wiring is incomplete, or a finding reopens.
- [final-claim-and-handoff.md](final-claim-and-handoff.md): Trigger before an approved verdict, runtime closeout, or handoff to human acceptance.
