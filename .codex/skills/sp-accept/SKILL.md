---
name: "sp-accept"
description: "Use when implementation closeout is complete and a human needs to understand and personally accept the finished feature without relying on old chat context."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/accept.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: `implementation-summary.md` exists, technical closeout passed, and a human should be guided through product acceptance before integration or delivery.
- **Primary objective**: Restore the human's context, lead one exact product scenario and step at a time, persist observed results, and produce an explicit accepted, rejected, or blocked verdict.
- **Primary outputs**: A fresh, schema-valid `human-acceptance.json` with zero-context orientation, ordered scenarios, step results, evidence, findings, resume cursor, and overall human verdict.
- **Default handoff**: On pass, continue to integration or delivery; on a product defect return to /sp.implement or /sp.debug; on missing or changed requirements return to /sp.clarify or /sp.specify.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Guide a contextless human through accepting completed product behavior and keep the conversation resumable from `FEATURE_DIR/human-acceptance.json`.

## Process

## Intake and Freshness

- Resolve the feature with `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` or lane state; stop on an uncertain or ambiguous lane.
- Transition from the validated `implement` stage into `accept` through the deterministic workflow runtime before any acceptance-owned write.
- Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify accept prepare --feature-dir <feature-dir> --format json`. This creates the deterministic state skeleton after implementation closeout or reports that the existing guide is stale/conflicting.
- Read `implementation-summary.md`, `human-acceptance.json`, the relevant acceptance requirements, and the real user entrypoint. Use code/test evidence only to prepare accurate instructions; do not ask the human to understand it.
- Validate runtime-owned phase state with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify hook validate-state --command accept --feature-dir <feature-dir> --format json`.

## Zero-Context Reset

Before asking the human to do anything, give them a compact reset:

- what was added or changed;
- what user problem it solves;
- what they will personally verify;
- prerequisites and exact starting entrypoint;
- what is intentionally outside this acceptance.

Use product words and concrete labels. Do not assume they remember the feature name, branch, commands, architecture, prior decisions, or the last conversation.

## Guided Conversation

- Lead one scenario and one step at a time. Do not present the entire procedure as homework unless the human explicitly asks for a printable checklist.
- For the current step, state the exact click path or command, explain placeholders, state the expected visible result, and state the safe failure branch.
- End with one tiny response request such as “回复 `看到了`；如果没有，发当前画面或报错文本（不要发密钥）”.
- Interpret the human's natural reply, update the current step result/evidence and scenario verdict, move the cursor, then present the next step.
- On resume, restate only the accepted context and the exact current step; do not replay completed steps unless implementation evidence changed.

## Verdict Rules

- `accepted`: every required scenario is explicitly `pass`, `overall.verdict` is `pass`, and the human has made the final acceptance decision.
- `rejected`: at least one observed required behavior fails and the finding records expected, observed, evidence, and repair route.
- `blocked`: the next required observation cannot be performed; preserve the cursor and provide a self-contained Human Action Guide when the boundary is genuinely human-owned.
- Automated tests, agent visual inspection, implementation closeout, or silence from the human never substitute for human PASS.

## Output Contract

- Keep `human-acceptance.json` schema-valid, fresh against implementation evidence, and sufficient to resume from the exact current step.
- The visible reply restores only the context needed now, gives one current action and expected result, and asks for one minimal human observation.
- Final output records accepted, rejected, or blocked honestly and names the exact next workflow without invoking it.

## Guardrails

- Allowed: `FEATURE_DIR/human-acceptance.json` and acceptance-owned `workflow-state.md` fields.
- Forbidden: production source, tests, `spec.md`, planning/task artifacts, implementation lifecycle records, commits, pushes, deployments, external writes, and silent cross-workflow fixes.
- Every failure route is handoff-and-stop. Preserve the acceptance finding and exact resume point so the repair workflow can return to the failed scenario instead of restarting the whole feature.

## Blocked Exit Contract

If blocked after safe recovery, read and follow
`.specify/templates/workflow-blocker-template.md` and its JSON schema. Never
return only an error or “ask a human”; preserve state and keep agent-capable
repair agent-owned. Set `human_action_required: true` only for authority,
credentials, protected systems, human decisions/reviews, or physical access.
Tailor steps, expected results, failure paths, evidence, and resume action to
CI, visual review, or product decisions. Never claim completion.

## Agent Phase Handoff

Phase handoff is an agent-only control surface. Human-facing explanation belongs in the visible reply or in project documents that have independent review value; it must not be duplicated into a handoff.

- The previous phase's canonical JSON contract is the next phase's primary input.
- Use the compact transition shape from `.specify/templates/agent-phase-transition-schema.json`: `status`, `source_ref`, `semantic_delta`, `required_refs`, `blockers`, `next_action`, and recovery only when blocked.
- Carry the minimum sufficient context: include a fact only when omitting it could change the next action, lose a requirement or obligation, force rediscovery, weaken verification, or prevent safe recovery.
- Preserve decisions, acceptance criteria, evidence provenance, `MP-*`, `CA-###`, and stop/reopen conditions by stable reference. Do not copy their full bodies into every downstream artifact.
- Protected `MP-*` and `CA-###` obligations must not drop between phases. A downstream phase may resolve or reopen them, but may not silently omit them.
- Carry the locked implementation-target reference. A cross-project transition must not silently point to the current repository when the confirmed target differs.
- Consume project rules and Learning through `learning start --command <classic-command-name> -> list -> show`; run selected `show_argv` only. Constitution remains at `.specify/memory/constitution.md`; never parse Learning storage.
- Capture at owning closeout only when the lesson would change a future action; prefer `learning capture-auto`.
- A rendered Markdown view is never an agent handoff authority. Do not require Markdown/JSON companion agreement.
- Revalidate upstream truth only when its revision changed, evidence became stale, live repository facts contradict it, or the current phase discovers a scope, boundary, feasibility, or risk change.
- If `semantic_delta` is empty, do not repeat upstream questions, approach selection, or user confirmation.

## Deterministic Workflow Runtime

For a feature-bearing `specify -> plan -> tasks -> implement -> accept` stage,
the CLI owns phase order and `workflow-state.md`. Do not author or advance
`workflow-state.md` by hand.

- After `FEATURE_DIR` is known, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify workflow show --feature-dir <feature-dir> --format json`. If state is missing at the first feature stage, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify workflow enter --command specify --feature-dir <feature-dir> --format json`.
- On entry to `plan`, `tasks`, `implement`, or `accept`, use the current revision with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify workflow transition --to <this-stage> --feature-dir <feature-dir> --expected-revision <revision> --format json` before writing that stage's artifacts. The command validates the completed source-stage artifacts and refuses skips, stale revisions, or incomplete handoffs with exit `10`.
- The destination command owns the transition. A completed stage recommends the next command but must not execute `workflow transition` to that next stage in the same invocation.
- Use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify workflow next --feature-dir <feature-dir> --format json` for the compact next action. Execute only its structured `next_argv`; do not reconstruct flags from prose.
- After safe agent recovery is exhausted, persist the blocker through `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify workflow block --input <blocker-json-or-> --format json`. Obtain its exact input shape with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify api schema workflow-block-input --format json`; preserve the returned resume argv and human tutorial.
- After explicit human acceptance and the acceptance-owned closeout both succeed, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify workflow closeout --feature-dir <feature-dir> --expected-revision <revision> --format json`. It validates acceptance artifacts before marking the feature workflow complete.

For every blocked exit, including a pre-feature discussion that cannot use the
feature runtime yet, follow
`.specify/templates/workflow-blocker-template.md` and its schema. Report the
exact cause, sanitized evidence, attempted recovery and result, affected scope,
smallest next action, observable unblock criteria, and exact resume point. Keep
agent-capable repair agent-owned. When authority, credentials, a protected
system, physical access, or human judgment is genuinely required, add the full
Human Action Guide: goal, prerequisites, safety notes, numbered exact actions,
expected result and safe failure branch for every action, independent
verification, sanitized evidence to return, and the exact resume command.

## Main Flow

1. Resolve the exact completed feature and require a trusted `implementation-summary.md`. Transition from `implement` to `accept` through the deterministic workflow runtime; it validates technical closeout and stops on exit `10`. Only then prepare or freshness-check `human-acceptance.json` with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify accept prepare --feature-dir <feature-dir> --format json`. If implementation closeout is missing or untrusted, hand back to `$sp-implement` and stop.
2. Read the implementation summary, spec acceptance, task outcomes, and only the live entrypoint evidence needed to explain the shipped behavior. Treat the human as returning with no useful memory of the prior conversation.
3. Build the acceptance state from `.specify/templates/human-acceptance-state-template.json` and schema. Explain the outcome, why it matters, user-visible changes, exclusions, prerequisites, and exact starting point in ordinary product language. Do not make the human inspect diffs, source, test logs, or planning artifacts.
4. Create the smallest complete ordered scenario set that proves the user-visible value. Every step names the exact action, visible expected result, safe failure branch, and the minimal reply/evidence to return. Validate the state before starting.
5. Present a short context reset, then guide only the current step. Wait for the human's observed result, persist it and the resume cursor, and advance one step at a time. Accept short replies such as “看到了”, “没有”, “通过”, or a screenshot/error; translate them into the structured state yourself.
6. PASS only when every required scenario has an explicit human pass. Record a mismatch as a finding with expected/observed/evidence and route it without editing production source in this workflow. Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify accept closeout --feature-dir <feature-dir> --format json` only after explicit human acceptance.

## Workflow Boundary

- This is human product acceptance, not the internal code review already embedded in `sp-implement`.
- This workflow may write only `human-acceptance.json` and the acceptance-owned fields of `workflow-state.md`. It must not edit production source, tests, specs, plans, tasks, or implementation lifecycle records.
- A technical implementation can be complete while human acceptance remains pending. Never collapse those two statuses.
- If the implementation summary fingerprint changed, mark acceptance stale, rebuild the guide from current evidence, and restart only the affected scenarios. Never reuse a previous PASS against changed implementation evidence.
- Do not dump a long checklist and leave the human alone. Lead one current step, say what success looks like, say what to return if it fails, and preserve the next resume point.

## Failure Routing

- Observed product behavior differs from the approved requirement and the cause is unknown: record evidence, hand to `$sp-debug`, and stop.
- The repair is clear and requirements are still correct: record evidence, hand to `$sp-implement`, and stop.
- The human expects behavior absent from or contradictory to the approved requirement: route to `$sp-clarify` for an existing feature or `$sp-specify` for new scope, and stop.
- Environment, permission, protected service, or physical-device access blocks the next step: preserve the cursor and use the shared Human Action Guide contract.
- The human cannot decide yet: keep `status: in_progress` or `blocked`; do not manufacture a verdict.

## Completion Reply

On acceptance, summarize in the human's language:

- what they personally verified;
- which scenarios passed and any intentionally unrun optional scenarios;
- residual risk or exclusions;
- where the durable acceptance record lives;
- the exact next delivery or integration action, without invoking it automatically.
