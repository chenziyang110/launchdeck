---
name: "sp-prd"
description: "Use when an older workflow or operator still invokes the deprecated `sp-prd` compatibility entrypoint and must be routed to the canonical `sp-prd-scan -> sp-prd-build` flow."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/prd.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Blocked Exit Contract

If blocked after safe recovery, read and follow
`.specify/templates/workflow-blocker-template.md` and its JSON schema. Never
return only an error or “ask a human”; preserve state and keep agent-capable
repair agent-owned. Set `human_action_required: true` only for authority,
credentials, protected systems, human decisions/reviews, or physical access.
Tailor steps, expected results, failure paths, evidence, and resume action to
CI, visual review, or product decisions. Never claim completion.

# `/sp.prd` Deprecated Compatibility Entrypoint

## Workflow Contract Summary

This summary is routing metadata only. The full workflow contract is the frontmatter plus the sections below.

- `sp-prd` is deprecated.
- `sp-prd` is compatibility-only and is no longer the primary reverse-PRD reconstruction workflow.
- Use `sp-prd-scan` first, then `sp-prd-build`.

## Project Learning

The CLI is the only agent-facing Learning read surface:

1. Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify learning start --command <classic-command-name> --format json` before deeper non-trivial work.
2. Select summaries by applicability and triggers; use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify learning list --command <classic-command-name> --format json` only to filter or page.
3. Execute one matching card's `show_argv`. Do not parse Learning storage.

`start`, `list`, and `show` are read-only. Current repository evidence,
`.specify/memory/constitution.md`, and explicit user direction override stale or
candidate Learning.

At closeout, corrections, retries, route changes, recovery, false leads, hidden
dependencies, validation/tooling/state/cognition gaps, constraints, and near
misses are capture signals. Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify learning capture-auto`
from owning state; manual capture includes summary, problem, action, triggers,
success criteria, avoid items, exceptions, and evidence.

- `fast`: skip unless the task escalates.
- `accept`, `analyze`, `ask`, `auto`, `constitution`, `explain`,
  `implement-teams`, `taskstoissues`, and `team`: consume-only; do not violate
  their write boundaries to capture.
- Other non-trivial workflows: consume before deeper work; capture reusable
  signals at closeout or record a no-learning decision.

The `policy` returned by the CLI is authoritative when prompt wording drifts.

## Objective

Route deprecated `sp-prd` invocations into the canonical reconstruction flow
without preserving the old one-step semantics as a preferred workflow path.

## Migration Path

[AGENT] If an older doc, alias, or operator still calls `sp-prd`, keep the compatibility response brief and route the work through the canonical flow instead:

```text
sp-prd-scan -> sp-prd-build
```

The scan step performs read-only reconstruction and produces the run package. The build step compiles the master pack and exports the PRD suite. Critical claims must meet `L4 Reconstruction-Ready`.

## Process

1. Detect whether the current invocation came through the deprecated `sp-prd`
   compatibility path.
2. Explain that `sp-prd` is compatibility-only and no longer the primary
   reverse-PRD lane.
3. Start with `sp-prd-scan`.
4. Continue to `sp-prd-build` after the reconstruction scan package is ready.

## Output Contract

- Compatibility routing should hand the operator to `sp-prd-scan` first.
- Final artifacts still come from the canonical pair:
  - `.specify/prd-runs/<run-id>/prd-scan.md`
  - `.specify/prd-runs/<run-id>/exports/prd.md`

## Guardrails

- Do not describe `sp-prd` as the preferred workflow.
- Do not keep one-step semantics alive in new guidance.
- Do not skip `sp-prd-scan` and jump straight to `sp-prd-build`.
