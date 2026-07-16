---
name: "sp-integrate"
description: "Use when one or more independent feature lanes have completed implementation and need a dedicated closeout workflow before mainline integration."
argument-hint: "Optional feature lane or closeout focus for integration readiness"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/integrate.md"
user-invocable: true
---
## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: One or more isolated feature lanes are implementation-complete and need lane-level closeout, readiness checks, and integration sequencing before merge.
- **Primary objective**: Discover completed lanes, run integration prechecks, surface drift or overlap risk, and close the lane cleanly without hiding lane state behind ad hoc merge steps.
- **Primary outputs**: Integration readiness results, lane completion state updates, and explicit closeout guidance for one or more completed lanes.
- **Default handoff**: Mainline merge or PR follow-through after readiness is confirmed; do not route back into `sp-implement` as a substitute for closeout.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## Blocked Exit Contract

If blocked after safe recovery, read and follow
`.specify/templates/workflow-blocker-template.md` and its JSON schema. Never
return only an error or “ask a human”; preserve state and keep agent-capable
repair agent-owned. Set `human_action_required: true` only for authority,
credentials, protected systems, human decisions/reviews, or physical access.
Tailor steps, expected results, failure paths, evidence, and resume action to
CI, visual review, or product decisions. Never claim completion.

## Objective

Use `sp-integrate` to discover completed lanes, run integration prechecks,
surface drift or overlap risk, and close the lane cleanly.

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

## Context

- Primary inputs: completed lane state, verification evidence, lane closeout metadata, and the smallest relevant project cognition query bundle or handbook guidance for merge-sensitive shared surfaces.
- This workflow is a dedicated closeout lane after implementation, not a substitute for `sp-implement`.

## Process

1. Discover candidate completed lanes and their readiness state.
2. Check shared-surface overlap, merge sequencing risk, and required closeout evidence.
3. Surface any unresolved integration blockers instead of hiding them behind a generic "done" status.
4. Produce explicit closeout guidance for merge or PR follow-through.
5. For every UI-bearing lane, treat isolated screenshots as input only. After
   the integrated tree exists, run the real entry points and recapture the
   required viewport/state matrix with typed structure, visual, and runtime
   evidence. Update lifecycle `evidence_scope: integrated` and
   `integration_base_ref`, compare against the approved direction and task
   contracts, repair drift, and recapture. The close helper must remain blocked
   while only task-scope evidence exists or human review is unresolved.

## Output Contract

- Integration readiness result for each candidate lane.
- Explicit blocked reasons when closeout cannot proceed safely.
- Recommended next merge or PR follow-through step when readiness is confirmed.

## Guardrails

- Do not fold this workflow into `sp-implement`.
- Do not guess merge order when conflicts or overlap are unclear.
- Treat completed lane state and verification evidence as prerequisites to closeout.
