---
name: "sp-accept"
description: "Use when mandatory system review is approved and a human needs to understand and personally accept the reviewed feature without relying on old chat context."
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

- **When to use**: `review-state.json` is fresh and approved, `implementation-summary.md` exists for the reviewed fingerprint, and a human should be guided through product acceptance before integration or delivery.
- **Primary objective**: Restore the human's context, prepare the reviewed product safely, guide the human through end-to-end verification of every new or changed requirement, persist observed results, and produce an explicit accepted, rejected, or blocked verdict.
- **Primary outputs**: A fresh, schema-valid `human-acceptance.json` whose frozen Human Acceptance Universe has zero uncovered required obligations, a verified runtime identity, zero-context orientation, ordered human-performed scenarios, step results, evidence, findings, resume cursor, and overall human verdict.
- **Default handoff**: On pass, continue to integration or delivery; every failed observation first goes to the Review Leader for diagnosis, repair, independent revalidation, or a proven upstream-truth handoff. Human-only access remains blocked in Acceptance with an exact guide.
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
- Require fresh `review-state.json` with `status: approved`, every mandatory scenario passed, no blocking finding, and a reviewed fingerprint matching current implementation/configuration evidence. Require the Review-to-Accept handoff's `human_acceptance_obligations`, `human_acceptance_scenarios`, non-empty `reviewed_runtime_targets`, and matching runtime-target digest.
- Transition from the validated `review` stage into `accept` through CLI-owned `workflow-runtime.json` before any acceptance-owned write; this file is the required phase lock.
- Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify accept prepare --feature-dir '<feature-dir>' --format json`. This creates the deterministic state skeleton after Review closeout or reports that the existing guide is stale/conflicting.
- Read the reviewed `implementation-summary.md`, `human-acceptance.json`, frozen Human Acceptance Universe, and real user entrypoint. Each new or changed requirement selected for human verification must retain a stable obligation/scenario mapping; require zero uncovered required obligations and reject deleted, downgraded, unmapped, or source-drifted items. Use Review/code/test evidence only to prepare accurate instructions; do not ask the human to understand it.
- `accept prepare` materializes `runtime_targets` as an exact immutable projection of Review's approved `source`, `build`, `deployment`, or `device` targets and binds scenarios to matching official entrypoints. Do not invent or edit target identity, artifact, deployment, version, configuration, snapshot, ready evidence, linked Review scenarios, `identity_evidence_ref`, or `identity_evidence_sha256`; preserve both identity-evidence fields read-only with the Review target digest. Safely start or health-check that exact target, wait for readiness, prepare or reset isolated acceptance data through documented reversible paths, and open the exact start. Fill only `acceptance_status`, `acceptance_ready_evidence`, and `agent_actions`; do not use production data, deploy without authority, or perform irreversible external effects.
- Validate acceptance-owned rich resume/evidence state with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify hook validate-state --command accept --feature-dir '<feature-dir>' --format json`.

## Zero-Context Reset

Before asking the human to do anything, give them a compact reset:

- what was added or changed;
- what user problem it solves;
- which new or changed requirement journeys they will personally verify;
- prerequisites and exact starting entrypoint;
- what is intentionally outside this acceptance.

Use product words and concrete labels. Do not assume they remember the feature name, branch, commands, architecture, prior decisions, or the last conversation.

## Guided Conversation

- Do not repeat System Review. Reuse its startup, wiring, automated, diagnostics, and broad regression proof; the human acceptance scenarios cover the frozen requirement delta and genuinely human-observable end-to-end outcomes.
- Lead one scenario and one step at a time. Do not present the entire procedure as homework unless the human explicitly asks for a printable checklist.
- For the current step, state the exact click path or command, explain placeholders, state the expected visible result, and state the safe failure branch.
- End with one tiny response request such as “回复 `看到了`；如果没有，发当前画面或报错文本（不要发密钥）”.
- Human performs the real end-to-end actions. The Agent maintains the prepared session, interprets the human's natural reply, and records a structured confirmation bound to the runtime-generated `confirmation_id`, Review-approved runtime target, and reviewed snapshot without changing its meaning. It then updates the step/scenario result and cursor. The final decision uses its separate confirmation id. Agent preparation, automation, or inspection never counts as human PASS and cannot author a receipt without an actual human reply.
- On resume, restate only the accepted context and the exact current step. A fresh Review repair cycle resets every scenario, so rerun the full frozen universe and preserve no earlier PASS.

## Verdict Rules

- `accepted`: the Human Acceptance Universe has zero uncovered required obligations, every required scenario is explicitly `pass` with structured human confirmation against a ready Review-approved `runtime_targets` record bound to the approved reviewed snapshot, no finding is open, `overall.verdict` is `pass`, and the separately confirmed human decision is `accept`.
- `rejected`: at least one observed required behavior fails and the finding records expected, observed, evidence, and repair route.
- `blocked`: the next required observation cannot be performed; preserve the cursor and provide a self-contained Human Action Guide when the boundary is genuinely human-owned.
- Automated tests, agent visual inspection, implementation closeout, or silence from the human never substitute for human PASS.

## Output Contract

- Keep `human-acceptance.json` schema-valid, fresh against the approved Review fingerprint and implementation evidence, and sufficient to resume from the exact current step.
- Preserve the frozen `human_acceptance_obligations`, `human_acceptance_scenarios`, coverage ledger, reviewed target digest, and immutable target identity fields; Acceptance may record only session readiness/actions, progress, human confirmations, and observations, and must not shrink or reinterpret authoritative scope.
- The visible reply restores only the context needed now, gives one current action and expected result, and asks for one minimal human observation.
- Final output records accepted, rejected, or blocked honestly and names the exact next workflow without invoking it.
- After the successful `accept closeout` `next_argv` commits terminal workflow closeout, `human-acceptance.json`, its immutable terminal snapshot, and the completed runtime are read-only. Changed implementation scope starts a new feature workflow; never rewrite the terminal verdict to draft or stale.

## Guardrails

- Allowed: `FEATURE_DIR/human-acceptance.json` and acceptance-owned `workflow-state.md` fields.
- Acceptance must not write production source, tests, `spec.md`, planning/task artifacts, implementation lifecycle records, commits, pushes, deployments, production data, or silent cross-workflow fixes. It may perform only the safe reversible local/sandbox runtime and isolated-fixture preparation described above.
- Accept does not diagnose. Every failed observation first goes to the Review Leader. Record raw expected/observed evidence and, before the handoff, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify accept route-repair --feature-dir '<feature-dir>' --finding-id '<finding-id>' --route '<review-route>' --expected-revision '<revision>' --evidence '<sanitized-evidence>' --format json`; do not use it for `human-action`. The result invalidates the prior acceptance and Review verdict, preserves the failed cursor as the first retest point, and returns `repair_handoff_command`, `owning_stage_command`, and `acceptance_return_argv`. Invoke the returned Review handoff separately and stop. Review creates a new cycle, owns diagnosis, uses a read-only diagnostic packet when needed, then owns an independent Fix, independent revalidation, and any later handoff for a proven upstream truth gap. After repair, Review must complete fresh cycle-specific evidence and Acceptance must rerun the entire frozen Human Acceptance Universe with no preserved PASS. A separately stated new-scope request belongs to a later feature workflow and must not rewrite or bypass the failed acceptance route.
- The CLI alone owns `repair_resume`, the append-only `repair_history`, and resolution of Review-routed findings. Never hand-mark one `resolved`: acceptance closeout requires an unbroken route-repair history whose latest cycle matches the current approved Review.

## Blocked Exit Contract

If blocked after safe recovery, read and follow
`.specify/templates/workflow-blocker-template.md` and its JSON schema. Never
return only an error or “ask a human”; preserve state and keep agent-capable
repair agent-owned. Set `human_action_required: true` only for authority,
credentials, protected systems, human decisions/reviews, or physical access.
Tailor steps, expected results, failure paths, evidence, and resume action to
CI, visual review, or product decisions. Never claim completion.

For a feature runtime blocker, do not invent `resume_argv` or overwrite an
existing blocker. The CLI returns a read-only `show_argv` and structured
`resolution_action`; `next_argv` stays empty while evidence is missing. After
the criteria are proven, attach sanitized evidence using the action's declared
input and execute its base argv. It restores the same owner and keeps the full
blocker audit.

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

For a feature-bearing `specify -> plan -> tasks -> implement -> review -> accept` stage,
the CLI owns phase order in `FEATURE_DIR/workflow-runtime.json`. Do not author
or advance `workflow-runtime.json` by hand. `workflow-state.md` remains the rich
workflow-owned evidence and resume surface for Learning, clarification,
research, analysis, and profile-specific details; the phase runtime must not overwrite
or parse it as its revision authority.

- After `FEATURE_DIR` is known, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify workflow show --feature-dir '<feature-dir>' --format json`. If state is missing at the first feature stage, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify workflow enter --command specify --feature-dir '<feature-dir>' --format json`.
- On entry to `plan`, `tasks`, `implement`, `review`, or `accept`, use the current revision with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify workflow transition --to '<this-stage>' --feature-dir '<feature-dir>' --expected-revision '<revision>' --format json` before writing that stage's artifacts. The command validates the completed source-stage artifacts and refuses skips, stale revisions, or incomplete handoffs with exit `10`.
- After the owning stage finishes its artifact closeout, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify workflow complete-stage --feature-dir '<feature-dir>' --expected-revision '<revision>' --format json`. The runtime validates the stage artifacts, records non-terminal `status: completed`, and returns the one legal transition argv; do not edit phase state manually.
- The destination command owns the returned transition. A completed stage recommends the next command but must not execute `workflow transition` to that next stage in the same invocation.
- Use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify workflow next --feature-dir '<feature-dir>' --format json` for the compact next action. While a stage is active its `next_argv` completes that stage; after completion it transitions to the successor. Execute only structured argv and do not reconstruct flags from prose.
- When fresh evidence invalidates an earlier required stage, preserve the stale
  artifacts for audit and reopen the highest invalid stage with
  `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify workflow reopen --to '<specify|plan|tasks|implement|review>' --feature-dir '<feature-dir>' --expected-revision '<revision>' --reason '<compact-reason>' --evidence '<sanitized-evidence>' --invalidated-artifacts '<artifact>' --format json`.
  Repeat `--evidence` and `--invalidated-artifacts` as needed. The CLI permits
  a strict backward move or reactivation of the same completed non-accept stage,
  including `implement` and `review`; an active same-stage owner simply continues. Honor any
  persisted blocker before retrying. Failed acceptance uses
  `accept route-repair`, never generic reopen. Every non-human-access acceptance
  failure first reopens Review; the Review Leader diagnoses it, dispatches an
  independent Fix and revalidation cycle, and may reopen an upstream truth
  owner only after proving that correct implementation is impossible under the
  current requirement, design, or architecture truth. After any repair, rerun
  the full frozen Human Acceptance Universe; preserve no stale human PASS.
- After safe agent recovery is exhausted, persist the blocker through `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify workflow block --input '<blocker-json-or->' --format json`. Obtain its exact input shape with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify api schema workflow-block-input --format json`; the runtime rejects replacement of an unresolved blocker and returns the human tutorial, a safe read-only `show_argv`, and a structured `data.resolution_action`. While evidence is missing, `next_argv` is intentionally empty.
- When the recorded unblock criteria are proven, append each sanitized evidence item to the runtime-returned `resolution_action.base_argv` using its declared `--resolution-evidence` required input, then execute that argv. This invokes `workflow resolve`, preserves the full prior blocker audit, and reactivates the same stage; do not reconstruct other flags or clear blocker state manually.
- After explicit human acceptance, run the acceptance-owned `accept closeout` command and execute its successful response's `next_argv` verbatim. That revision-bound argv invokes `workflow closeout`; do not reconstruct it from prose or a remembered revision. It validates and snapshots acceptance evidence before marking the feature workflow complete.

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

1. Resolve the exact reviewed feature and require a trusted `implementation-summary.md` plus fresh `review-state.json` with `status: approved`, passing mandatory scenarios, required integrated evidence, no blocking finding, and a matching reviewed fingerprint. Require the Review-to-Accept handoff's `human_acceptance_obligations`, `human_acceptance_scenarios`, non-empty `reviewed_runtime_targets`, and matching runtime-target digest. Transition from `review` to `accept` through the deterministic workflow runtime; it validates Review closeout and stops on exit `10`. Only then prepare or freshness-check `human-acceptance.json` with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify accept prepare --feature-dir '<feature-dir>' --format json`. If Review is absent, failed, blocked, stale, incomplete, or lacks that identity basis, hand back to `$sp-review` and stop.
2. Read the implementation summary and the frozen Human Acceptance Universe. It contains every new or changed requirement selected for human end-to-end verification. Require zero uncovered required obligations and reject deleted, downgraded, unmapped, or source-drifted obligations. Treat the human as returning with no useful memory of the prior conversation.
3. `accept prepare` materializes `runtime_targets` as an exact immutable projection of Review's approved targets (`source`, `build`, `deployment`, or `device`) and binds each scenario to the matching official entrypoint. Do not invent or edit target identity, artifact, deployment, version, configuration, snapshot, ready evidence, linked Review scenarios, `identity_evidence_ref`, or `identity_evidence_sha256`; preserve both identity-evidence fields read-only with the Review target digest. Before asking the human to act, safely start or health-check that exact target, wait for readiness, prepare or reset isolated acceptance test data through documented reversible paths, and open the exact starting point when tooling permits. Acceptance may fill only session fields such as `acceptance_status`, `acceptance_ready_evidence`, and `agent_actions`. Never use production data, deploy without authority, or perform an irreversible external side effect.
4. Explain the outcome, why it matters, the new or changed requirements the human will verify, exclusions, prerequisites, and exact starting point in ordinary product language. Use the frozen `human_acceptance_scenarios`; do not invent a smaller scope. Every step names the exact human action, visible expected result, safe failure branch, and minimal reply/evidence to return. Do not repeat System Review: reuse its startup, wiring, automated, diagnostics, and broad regression proof instead of turning that matrix into human homework.
5. Present a short context reset, then guide only the current step. Human performs the real end-to-end requirement journey; the Agent explains labels and placeholders, maintains the environment, may inspect sanitized diagnostics after an observation, persists the human's actual result and resume cursor, and advances one step at a time. Accept short replies such as “看到了”, “没有”, “通过”, or a screenshot/error; translate each actual reply into a structured human confirmation bound to the runtime-generated `confirmation_id`, runtime target, and reviewed snapshot without changing its meaning. Record the final human decision through the separate decision confirmation. Agent preparation, automation, or inspection never counts as human PASS and cannot author these receipts without an actual human reply.
6. PASS only when every required human acceptance obligation is covered, every required scenario has an explicit structured human pass bound to a ready Review-approved `runtime_targets` record and reviewed snapshot, no finding remains open, and the human makes the final acceptance decision. Record any mismatch as raw expected/observed/evidence without editing production source. Accept does not diagnose. Every failed observation first goes to the Review Leader; Review owns diagnosis, an independent Fix, independent revalidation, and any later proven upstream-truth route. Any repair creates a fresh Review cycle and invalidates every human scenario, so Acceptance reruns the full frozen Human Acceptance Universe beginning at the failed cursor and preserves no old PASS. Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify accept closeout --feature-dir '<feature-dir>' --format json` only after explicit human acceptance, then execute its successful `next_argv` verbatim to commit terminal workflow closeout; never reconstruct the revision-bound command.

## Workflow Boundary

- This is human product acceptance, not the task review embedded in `sp-implement` or the mandatory system proof-and-repair work owned by `sp-review`.
- This workflow may write only `human-acceptance.json` and the acceptance-owned fields of `workflow-state.md`. It must not edit production source, tests, specs, plans, tasks, or implementation lifecycle records.
- Safe reversible acceptance-session operations are allowed: start or stop an approved local/sandbox target, check readiness, open the reviewed start location, and prepare or reset isolated test fixtures through documented commands. Preserve Review's immutable target identity and record only acceptance-session readiness/actions; these operations do not authorize production mutation, deployment, or the human's verdict.
- Technical implementation and system Review can be complete while human acceptance remains pending. Never collapse those statuses.
- If the reviewed fingerprint, Review evidence, runtime-target digest, or implementation summary fingerprint changed, mark acceptance stale and return to `$sp-review` before rebuilding the guide. Never reuse a previous PASS after a repair or against changed implementation evidence.
- Do not dump a long checklist and leave the human alone. Lead one current step, say what success looks like, say what to return if it fails, and preserve the next resume point.

## Failure Routing

- Accept does not diagnose or select an implementation/upstream owner. Record the human's expected result, actual observation, sanitized evidence, runtime identity, and preserved scenario cursor.
- Every failed observation first goes to the Review Leader through `$sp-review`, including an apparent requirement gap, unknown mechanism, clear code defect, missing implementation, regression, or large repair. Review performs diagnosis, dispatching a read-only diagnostic packet when the mechanism is unknown, then owns an independent Fix and independent revalidation in a new Review cycle; only Review may hand off a proven requirement, design, or architecture truth gap to its upstream owner. After repair, rerun every frozen human scenario; do not preserve a prior PASS.
- Environment, permission, protected service, or physical-device access blocks the next step: preserve the cursor and use the shared Human Action Guide contract without creating a repair route.
- A separately stated new-scope request is not an acceptance-failure classification. Record it outside the failed scenario for a later feature workflow; do not use it to bypass Review or rewrite the frozen Human Acceptance Universe.
- The human cannot decide yet: keep `status: in_progress` or `blocked`; do not manufacture a verdict.

## Completion Reply

On acceptance, summarize in the human's language:

- what they personally verified;
- which scenarios passed and any intentionally unrun optional scenarios;
- residual risk or exclusions;
- where the durable acceptance record lives;
- the exact next delivery or integration action, without invoking it automatically.
