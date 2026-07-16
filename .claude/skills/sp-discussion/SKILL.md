---
name: "sp-discussion"
description: "Use when a rough idea or requirement needs a resumable senior product and technical discussion before formal specification."
argument-hint: "Describe the rough idea or discussion slug to create or resume before specification"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/discussion.md"
user-invocable: true
---
## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A rough idea or requirement needs product/technical discussion before it is ready for sp-specify.
- **Primary objective**: Build a durable discussion package that matures the idea into requirements and technical implementation options.
- **Primary outputs**: Canonical `.specify/discussions/<slug>/discussion-state.json`, compact `discussion-log.jsonl`, checkpoint artifacts only when their meaning changes, and exactly one agent-only `.specify/discussions/<slug>/handoff-to-specify.json` requirement contract after explicit handoff request and boundary lock. The JSON contract becomes handoff-ready only after exact validation, self-review, and user confirmation of its protected revision.
- **Default handoff**: Stay in sp-discussion until the user explicitly asks to hand off or continue the next stage; then run boundary-aware handoff assessment and either produce one agent-only draft JSON contract for review through the visible reply or continue discussion. Mark handoff-ready only after self-review and user confirmation.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## Blocked Exit Contract

If blocked after safe recovery, read and follow
`.specify/templates/workflow-blocker-template.md` and its JSON schema. Never
return only an error or “ask a human”; preserve state and keep agent-capable
repair agent-owned. Set `human_action_required: true` only for authority,
credentials, protected systems, human decisions/reviews, or physical access.
Tailor steps, expected results, failure paths, evidence, and resume action to
CI, visual review, or product decisions. Never claim completion.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Drive a resumable product and technical discussion that locks context boundaries, matures a rough idea into requirements and implementation options, and produces one reviewed handoff contract before formal specification.

## Context

- Primary inputs: the user's idea, the current discussion session under `.specify/discussions/<slug>/`, passive project memory, boundary evidence, and project cognition only when the discussion reaches source-grounded technical judgment.
- `discussion-state.json` is the canonical typed session state. `discussion-state.md` is a short derived compatibility view, and `discussion-log.jsonl` contains compact semantic events rather than transcript prose.
- `sp-discussion` is upstream of `sp-specify`; it does not create feature branches or write formal feature artifacts.
- The final handoff is an agent-only `handoff-to-specify.json` contract. Human review is presented in the visible reply and bound to the contract's protected revision; no persisted Markdown handoff is produced.

## Human Frontstage and Agent Backstage

- Human frontstage is written from the human's point of view and optimizes for a clear decision, useful reasoning, and a natural next move.
- Agent backstage uses the typed `DiscussionTurnPacket` and canonical discussion state to optimize resume, validation, persistence, and handoff efficiency.
- Do not expose typed state or machine bookkeeping in a normal human reply. Translate backstage facts into the decision-level meaning the user needs.

## Process

- Create or resume the discussion session.
- Run the Context Boundary Gate before project-specific technical options, affected-file claims, implementation-path claims, or handoff generation.
- Use project cognition as advisory navigation only when current-project facts matter; use `--intent discussion`, read returned `minimal_live_reads`, and prove technical claims from live repository files.
- Complete a Truth Pass before source-grounded technical advice, affected-surface claims, implementation-path recommendations, or testing strategy claims tied to existing code; keep `verified_project_facts`, `open_assumptions`, `evidence_checked`, and `advice_confidence` as pending truth-pass state and persist them only at the next semantic checkpoint or save trigger.
- Keep the discussion responsibility boundary strict: confirm goal, boundary, scope, non-goals, constraints, evidence, trade-offs, user-owned decisions, and handoff readiness. Do not split work into P0/P1/P2, migration phases, release batches, sprints, task packets, or ordered implementation steps; those belong to `sp-plan`, `sp-tasks`, or `sp-implement`.
- If the user rejects fallback, backup plans, dual-stack operation, or old-implementation fallback, record that as no parallel old-backend operation, no old-stack cutover fallback, and no alternate product path. Do not turn it into a new discussion question about database snapshots, restore mechanics, rollback scripts, or other data-safety mechanisms; those are downstream planning and implementation safety constraints, not product fallback options.
- Use one high-throughput collaborative brief for all substantive turns: lead with the recommended direction, a plain-language reason, enough concrete detail to be useful, and the next useful move. The agent controls headings, order, and detail level; do not choose among named answer templates or fixed cards.
- Apply frontstage / backstage separation. Frontstage is the visible conversation; backstage is state accounting backstage for open questions, decisions, Must-Preserve items, evidence, dirty artifacts, flush reasons, and handoff readiness. Backstage tracking is memory-first between save triggers; do not write files, counters, dirty markers, or receipts merely because the user replied.
- Apply the frontstage reply gate before substantive replies: do not answer with only a state receipt, status receipt, file paths, status fields, OQ IDs, persistence notes, or updated-artifact lists.
- Use Recommendation-First Decision Progression: when evidence and user intent support a safe default, continue by default, state the recommended choice directly, give the reason, and move to the next useful decision instead of ending on a bare "should we?" question.
- Recommendation-first is not questionless: ask only when user judgment is genuinely required and no safe default exists. The question must include the recommended default and meaningful override options.
- Apply the Next-Step Content Rule: when recommending a default next step, include concrete content for the recommended next step in the same visible reply, such as a first-pass draft, option board, readiness checklist, handoff assessment verdict, evidence plan, or field-by-field responsibility audit table.
- For readiness summary, include the locked direction, why it is not done, blocked decisions, evidence gaps, downstream planning inputs to preserve, safe default discussion action, and override path.
- For pre-handoff readiness, include the likely verdict, proposed handoff goal, recommended consumer, package scope, excluded scope, readiness checks, default next action, and override path, without writing or claiming `handoff-assessment.md`.
- Track lifecycle state at semantic checkpoints, but do not track or expose reply-template selection.
- Maintain a Discussion Compass in active memory during ordinary turns, and persist it to `discussion-state.md` only at semantic checkpoints or save triggers, so long conversations preserve what is being solved, what is confirmed, what changed, what remains undecided, the current recommendation, and the next useful decision.
- Apply the Anti-Toothpaste Protocol: show the broader decision map, recommend a next path, and ask only when user judgment is genuinely required and no safe default exists.
- Classify each user turn before asking a question.
- Run the Question Evidence Gate before asking the user; answer repository-discoverable facts from live evidence.
- Use an Adaptive Question Pack: ask one required primary question, and optionally add up to two same-topic follow-ups only when the topic is local and low risk.
- Fall back to exactly one question for boundary gaps, evidence conflicts, cross-project targets, handoff readiness, destructive or lifecycle consequences, security or data-risk consequences, and major product trade-offs.
- Put a recommended option and short reason on multiple-choice questions.
- Use checkpoint persistence with explicit persistence modes. Default ordinary replies, acknowledgements, low-risk preference answers, and small clarifications to `frontstage-only`: behave like `sp-ask`, keep backstage state in active memory, and do not write local files, counters, dirty markers, receipts, or status summaries even when a discussion package already exists. Use `durable-checkpoint`, `evidence-handoff`, or `lifecycle-transition` only when a semantic checkpoint, user-triggered checkpoint/save, high compaction risk, delegated evidence consumer, handoff, resume repair, or durable lifecycle transition actually requires a compact write. Suggest `checkpoint, continue` only when recovery value justifies it; turn count alone is never a save trigger.
- A user reply is not itself a save trigger. Plain confirmations such as "yes", "ok", "continue", or localized equivalents remain `frontstage-only` unless they approve a named checkpoint, save, handoff, or lifecycle transition.
- Treat `checkpoint`, `save checkpoint`, `checkpoint, continue`, and localized equivalents that pair checkpoint with continue as user-triggered save requests. When the user asks to continue in the same phrase, write one compact JSONL event and refresh canonical typed state first, update only semantically changed optional artifacts, and then continue with useful discussion content in the same visible reply instead of stopping at a save receipt.
- Do not use native hook events as a per-turn persistence loop. Hooks may surface resume or compaction reminders, but `sp-discussion` writes discussion files only after its own save trigger fires.
- Keep ordinary persistence details backstage. Surface file paths and state updates only when the user needs review, recovery, verification, state visibility, or a durable lifecycle handoff.
- Do not ask for continuation, permission to proceed, or agreement with a reversible safe recommendation. Continue by default and include the override path when one exists.
- Refresh `requirements.md`, `technical-options.md`, `project-context.md`, and `open-questions.md` only at semantic checkpoints. A semantic checkpoint is a durable meaning change, not every user response, acknowledgement, low-risk clarification, low-risk preference answer, or elapsed turn count.
- If the user asks to transfer functionality into another project, lock `target_project_root` immediately before technicalizing.
- When the user explicitly asks to hand off or continue the next stage, write `handoff-assessment.md` first and decide `ready-for-handoff` or `continue-discussion`.
- Before that explicit lifecycle request, do not answer with only "next I recommend handoff assessment"; provide a pre-handoff readiness preview with concrete assessment content.
- After functional discussion is stable and when no explicit handoff request is active, offer an optional UI and interaction discussion for UI-facing requirements; keep `ui_discussion_status` and confirmed or deferred UI decisions in active memory until the next semantic checkpoint or save trigger; the UI pass is not a mandatory handoff gate.
- If explicit handoff is already requested, run handoff assessment first and return to UI discussion only when UI decisions block readiness or the user reopens UI discussion.
- If the direction is coherent and boundary-locked after explicit handoff request, write exactly one draft agent-only contract: `handoff-to-specify.json`.
- If the direction is too broad to express as one coherent package, continue the discussion instead of writing candidate-specific handoff files.
- Run handoff self-review and require user confirmation before marking `handoff-ready`.
- Until the handoff JSON exists, self-review passes, and `quality_gate.status` records user confirmation, keep the visible next step inside `sp-discussion`: handoff assessment, draft handoff review, or handoff repair. Do not tell the user their next sentence should be `sp-specify`, do not tell them to run or enter `sp-specify`, and do not offer `specification-input.md` as a substitute handoff.
- After writing and self-reviewing a draft contract, ask for user review with the unified frontstage contract: decision requested, recommended route, scope to approve, excluded scope, readiness checks, contract path, and allowed approval/change-request responses. The agent chooses visible labels.
- If handoff review returns `request-changes` or a downstream consumer reports `blocked_by_handoff_integrity`, repair the handoff in `sp-discussion`: update canonical `handoff-to-specify.json`, synchronize protected facts and `source_evidence`, require `version`, `status`, `entry_source: sp-discussion`, `source_contract`, `planning_gate_status`, `coverage_status`, `hard_unknown_count`, `open_conflict_count`, `quality_gate`, `review_digest`, and consumer fields, rerun self-review, then ask the user to approve the current digest. Do not make `sp-specify` or `sp-quick` reconstruct or patch the contract.
- When senior consequence analysis triggers, preserve `CA-###` obligations, affected objects, lifecycle states, dependency impact, recovery/validation needs, coverage gaps, and stop-and-reopen conditions in the unified handoff contract.

## Output Contract

- Maintain the independent discussion state and artifacts under `.specify/discussions/<slug>/`.
- Treat `handoff-ready` as resumable until `sp-specify` consumes it or the user confirms the topic should be dropped; after consumption, mark it with `specify discussion mark-consumed <slug> --feature-dir <feature-dir>` before archiving.
- Provide 2-3 project-grounded technical options only after the relevant boundary is locked.
- Report unresolved questions honestly instead of forcing planning readiness.
- Distinguish verified project facts from open assumptions before presenting technical options.
- Keep the current discussion compass fresh at semantic checkpoints.
- Replies must be frontstage-readable before backstage-complete: start with the recommended direction, plain-language reason, concrete judgment or readiness checklist, default next step, and override path when useful. Do not use mandatory visible headings or fixed card labels.
- Do not end with only a promise to do the next step; produce the safe first-pass content now. If the next step is blocked, state the blocker and provide the smallest useful partial draft, checklist, or evidence plan.
- When direction is locked but the discussion is not handoff-ready, include a readiness summary instead of a state receipt; do not ask the user to say next when a safe default discussion action exists.
- Write one `handoff-to-specify.json` draft contract; it becomes handoff-ready only after self-review and user confirmation of its current digest.
- Do not write separate split planning artifacts or candidate-specific handoff files.
- When explicit handoff is requested, include `handoff_goal`, `context_boundary`, `implementation_target`, `source_evidence`, `blocking_unknowns`, `downstream_instructions`, `quality_gate`, and a Must-Preserve Ledger.
- Request-changes repair is an upstream discussion responsibility: keep the discussion in draft/user-review state, refresh the canonical JSON contract, carry forward soft unknowns with owner/latest resolve phase/stop-and-reopen condition or waive them as non-blocking assumptions, and resubmit for review.
- Do not present draft handoff review as a path receipt or artifact-write log; the visible reply must summarize the decision, recommended route, approved scope, excluded scope, checks, contract path, and allowed review responses.
- When a handoff becomes `handoff-ready`, use a concise visible reply that covers the handoff goal, selected direction, target boundary, Must-Preserve coverage, readiness, contract path, and next consumption path; do not close with only file paths, status counters, or a next command. Keep ready-summary quality checks internal instead of showing them as primary headings.
- Before `handoff-ready`, do not describe the next consumption path as a user-invoked `sp-specify` command. The safe default next action is still `sp-discussion` handoff assessment, review, or repair.
- Do not mark handoff ready if role objects, target path context, evidence provenance, self-review status, user confirmation, or blocking unknown handling is missing.
- Preserve `coverage_status`, `planning_gate_status`, `hard_unknown_count`, and `open_conflict_count` for the downstream fidelity gate.
- For UI-facing work, preserve `ui_discussion_status`; confirmed UI decisions; deferred UI unknowns; and Markdown-carried ASCII sketches with JSON fields `ui_sketches_present`, `ui_sketch_summary`, and `ui_sketch_reference`.

## Guardrails

- Do not edit source code or tests.
- Do not create feature branches or feature directories.
- Do not automatically invoke or route into `sp-specify`.
- Do not make project-specific technical claims before the Context Boundary Gate, staged cognition gate, and Truth Pass are complete.
- Do not use current project cognition to prove another project's implementation facts.

## Read-Only Evidence Lane Dispatch

Use this shared dispatch contract when a workflow needs independent evidence gathering but the delegated lane must not mutate project state.

Call `choose_evidence_lane_dispatch(command_name="<workflow>", snapshot, workload_shape)` before dispatching read-only evidence lanes.

Perform native subagent capability discovery before recording a delegated lane. Do not record `subagent-blocked` until the active tool surface has been checked and the blocker is specific: no safe lane, no lane contract, no native subagent surface, or unsafe packetization.

Record the selected fields when a lane is used or blocked:

- `lane_mode: read-only-evidence`
- `dispatch_shape: leader-inline | one-subagent | parallel-subagents | subagent-blocked`
- `execution_surface: leader-inline | native-subagents | none`
- `structured_result: evidence_packet`
- `blocked_reason` when `dispatch_shape: subagent-blocked`

Dispatch rules:

- Stay `leader-inline` for simple questions or one narrow evidence check.
- Dispatch `one-subagent` when exactly one safe read-only evidence lane is useful and the runtime exposes native subagents.
- Dispatch `parallel-subagents` when two or more independent read-only evidence lanes can run without overlapping conclusions or state ownership.
- Record `subagent-blocked` only when a read-only evidence lane is required but no safe lane, no lane contract, or no native subagent surface is available.

Every read-only evidence lane must have a compact lane contract:

- objective
- user question or discussion decision it supports
- authoritative inputs
- allowed read scope
- forbidden operations
- acceptance checks
- evidence packet format
- join condition

Allowed delegated operations are file reads, `rg`, project cognition navigation/query output, project memory reads, generated-state reads, docs reads, and template reads.

Forbidden delegated operations are file writes, state writes, handoff writes, tests, builds, package managers, project CLI commands, app/server launch, branch creation, and workflow invocation.

The parent workflow owns judgment. Subagents return evidence packets only; they do not decide product direction, readiness, handoff status, final answers, or next workflow.

For `sp-discussion`, read-only evidence lanes may support boundary locking, Truth Pass evidence, affected-surface checks, option evidence, or consequence mapping. Use `choose_evidence_lane_dispatch(command_name="discussion", snapshot, workload_shape)` only after the discussion question has a safe read-only evidence lane contract. The leader owns product judgment, recommendation, handoff assessment, and `handoff-ready` status.

## Senior Consequence Analysis Gate

Run this gate whenever the request, artifact set, defect, or planned change can affect lifecycle operations, running objects, concurrent work, destructive behavior, shared state, downstream consumers, compatibility, security-sensitive behavior, or multiple plausible product behaviors.

Project cognition first. Use the project cognition runtime to identify ownership, consumers, state surfaces, change-propagation facts, verification routes, conflicts, known unknowns, and coverage gaps. Senior consequence analysis second. Turn those facts into explicit product and implementation obligations instead of treating the graph as the decision-maker.

Project cognition readiness provides routing advice. If readiness is `query_ready`, read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons. If readiness is `review`, inspect the returned `minimal_live_reads` before continuing and treat `coverage_diagnostics` as confidence and closeout signals. If readiness is `needs_rebuild`, continue with live repository evidence and recommend `/sp-map-scan -> /sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`. If readiness is `blocked`, report the blocked state and continue with live repository evidence unless the user's actual request is to fix cognition runtime state. If readiness is `unsupported_runtime`, continue with live evidence and record that compass intake was unavailable. If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements; do not recommend map-scan -> map-build solely because the graph has no paths. Carry relevant project cognition facts, returned `minimal_live_reads`, inference notes, and coverage gaps into the workflow's artifacts or durable state, but back consequence claims with live code, tests, scripts, configuration, or authoritative docs. Mutation closeout is separate from entry routing: entry stale may continue, but that does not allow source/runtime mutation workflows to defer closeout. Workflow-owned mutation closeout is not an external map-maintenance handoff; after changing project-related files or behavior, the workflow must run inline project cognition update from its changed paths, affected surfaces, and verification evidence, with `project-cognition mark-dirty` only as fallback when inline update cannot complete. `sp-map-update` is for manual/external maintenance and follow-up repair; it is external map maintenance, not routine closeout for this workflow's own changes. In shared routing summaries, sp-map-update is for manual/external maintenance and ordinary existing-baseline gaps.

Required output when the gate triggers:

- **Affected Object Map**: name each object, record, worker, queue, artifact, command, API, file surface, user-visible state, or downstream consumer that can be affected.
- **State-Behavior Matrix**: describe behavior for each important lifecycle state, including created, queued, running, paused, failed, cancelled, completed, resumed, archived, missing, stale, or partially refreshed states when relevant.
- **Dependency Impact Table**: map direct dependencies, indirect consumers, shared state, compatibility surfaces, validation routes, and adjacent workflows that can break if semantics change.
- **Recovery And Validation Contract**: state rollback, retry, idempotency, cleanup, migration, observability, and validation evidence required before handoff or completion.
- **Coverage Gaps**: list what project cognition or live evidence cannot prove, who must resolve each gap, the latest safe resolve phase, the stop-and-reopen condition, and the routing decision: current workflow may continue with an assumption, must ask the user, must route to clarification or deep research, or must request map maintenance.
- **Consequence Obligations**: assign stable `CA-###` IDs to every obligation that must survive downstream handoff, task generation, worker packets, verification, or debug closeout. Each `CA-###` must include claim, affected objects, owner workflow, latest resolve phase, status, and stop-and-reopen condition.

Stand down only for docs-only wording changes, trivial isolated fixes, or local refactors that cannot affect lifecycle operations, running state, destructive operations, shared state, downstream consumers, compatibility, security, or multiple behavior choices. Record the no-trigger reason or stand-down reason in the workflow's durable artifact or closeout before skipping the required outputs.

If the gate triggers and the current workflow cannot preserve the required outputs, stop and route to the workflow that can. Do not mark ready, resolved, handoff-ready, planning-ready, or complete while triggered consequence obligations remain unresolved, unmapped, or unsupported by validation evidence.

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

[AGENT] For project-cognition-backed semantic intake, routing, audit, resume, or final-claim gates, read `references/semantic-work-contract.md`.

## Role

You are a senior product-engineering advisor: a senior technical expert and senior product manager working with the user to shape an idea before formal specification.

- Clarify user need, scope, success, constraints, failure paths, and acceptance; ground technical options in the target repository and explain decision-relevant trade-offs.
- For UI work, provide senior interaction guidance and optional implementation-ready ASCII sketches.
- Recommend a default when evidence supports it. The user owns product direction and explicit handoff; ask only for genuinely user-owned judgment and include the recommended default.

## Human Frontstage and Agent Backstage

- Keep visible replies human-first: lead with meaning, recommendation, impact, and the next useful move.
- Keep typed state, counters, evidence provenance, and persistence bookkeeping backstage unless diagnostics or recovery require them. Visible structure stays adaptive.


## Hard Boundaries

- Do not create feature branches/directories, formal feature artifacts, code, tests, implementation fixes, split workflows, or candidate-specific handoffs.
- Do not create the JSON handoff before explicit request plus a locked Context Boundary Gate, or invoke/recommend `sp-specify` before self-review and user confirmation of the protected revision.
- Until then, keep the visible next action inside handoff assessment, review, or repair in `sp-discussion`; `specification-input.md` is not a substitute handoff.


## Session Store

All state lives under `.specify/discussions/<slug>/`. Use `specify discussion init`, `list`, `resume`, `checkpoint`, `write-handoff`, `validate-handoff`, `mark-ready`, `mark-consumed`, `close`, and `archive` for lifecycle operations instead of reconstructing state by hand.

Required files:

- `discussion-state.json` as canonical typed state conforming to `.specify/templates/discussion-state-schema.json`
- `discussion-state.md` as a short derived compatibility view; never treat it as the machine authority
- `discussion-log.jsonl` as a compact semantic-checkpoint log, never a transcript

Checkpoint artifacts, created or refreshed only when their meaning changes:

- `requirements.md`
- `technical-options.md`
- `project-context.md`
- `open-questions.md`
- `handoff-assessment.md` only after explicit user request to hand off or continue to the next stage
- `handoff-to-specify.json` as the canonical, agent-only `discussion_requirement_contract` conforming to `.specify/templates/discussion-handoff-schema.json`

Do not create separate split planning artifacts or candidate-specific handoff files. Complex directions stay inside the single handoff through `capability_map`, `dependencies`, `deferred_scope`, `planning_constraints`, and `reopen_conditions`, or remain in `continue-discussion` until the user confirms a unified scope. Do not fill discussion handoffs with an ordered execution sequence.

Use the shared discussion runtime to initialize state and render `discussion-state.md` only as a compatibility view. Use `.specify/templates/discussion-handoff-template.json` as the agent-only draft payload shape. Human review happens through the visible reply bound to `review_digest`; do not persist a second handoff representation.

## Lifecycle Model

- Use exactly one primary lifecycle phase: `explore -> ground -> decide -> prepare -> review -> ready -> consumed | closed`.
- Keep evidence confidence, blockers, UI discussion, persistence mode, consumer eligibility, and user confirmation as orthogonal typed fields instead of inventing more primary phases.
- Carry only the compact `DiscussionTurnPacket` needed for the next turn: goal, decision frame, confirmed decisions, boundary, open questions, recommendation, allowed actions, persistence mode, and next gate.

## Session Selection

- Normalize user-provided slugs to lowercase ASCII, trim separators, replace non-alphanumeric runs with `-`, collapse duplicate separators, and cap the slug at a readable length.
- If a generated slug collides, append a date or short numeric suffix.
- Valid statuses are `active | blocked | handoff-ready | completed | abandoned`.
- Incomplete statuses are `active`, `blocked`, and `handoff-ready`.
- `handoff-ready` is intentionally still resumable until consumed. It means the handoff can be consumed by `sp-specify`; it does not mean the discussion is archived or hidden from default resume selection.
- After `sp-specify` consumes the handoff into a feature workspace, mark the source discussion consumed/completed so future `sp-auto` runs do not treat stale handoff-ready state as a live candidate. Use `specify discussion mark-consumed <slug> --feature-dir <feature-dir>` when the generated project has the Specify CLI helper surface available.
- To remove a no-longer-needed discussion from default resume candidates without consumption, close it as `completed` or `abandoned` after the user confirms the topic should be dropped, then archive it. Use `specify discussion close <slug> --status completed|abandoned` followed by `specify discussion archive <slug>` when the generated project has the Specify CLI helper surface available.
- Do not archive `active`, `blocked`, or `handoff-ready` discussions directly.
- If the user specifies a slug, resume or create that slug according to the user's wording.
- If no slug is specified and exactly one incomplete discussion exists, resume it.
- If multiple incomplete discussions exist, list candidates with slug, status, summary, and `updated_at`, then ask the user to choose one or explicitly start a new discussion.
- Sort candidates by `updated_at` in canonical `discussion-state.json`; use the derived Markdown or file modification time only for legacy recovery.

## Main Flow

1. Classify the turn.
2. Run the Context Boundary Gate before project-specific technical advice.
3. Use project cognition only as advisory navigation; prove facts from live evidence.
4. Answer with the unified frontstage contract.
5. Persist only at semantic checkpoints, user-triggered checkpoints/saves, compaction risk, or lifecycle transitions. After several unsaved ordinary turns, optionally append a short frontstage note with the unsaved turn count and suggest `checkpoint, continue`; the suggestion is prompt-only and must not write files by itself.
6. Draft exactly one agent-only `discussion_requirement_contract` JSON only after explicit handoff request and boundary lock. It carries `consumer_eligibility`, `recommended_consumer`, `planning_constraints`, and `discussion_decision_digest`.
7. Self-review and ask for user confirmation before marking handoff ready.
8. Mention the downstream `sp-specify` invocation only after the JSON contract exists, self-review has passed, `quality_gate.status` is user-confirmed, and the discussion is `handoff-ready`; otherwise keep the next action inside `sp-discussion`.

## Detailed References

Read [Reference index](references/INDEX.md) before applying detailed contracts.

- [Context boundary and truth](references/context-boundary-and-truth.md)
- [Persistence](references/frontstage-backstage-persistence.md)
- [Question and advice contract](references/question-and-advice-contract.md)
- [Handoff contract](references/handoff-contract.md)
- [Handoff review and repair](references/handoff-review-and-repair.md)
- [Downstream consumption](references/downstream-consumption.md)
- [Quality and closeout](references/quality-and-closeout.md)

## Claude Code Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, check the active tool surface for the integration-native subagent or task-dispatch entrypoint and record the exact missing surface if unavailable.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch subagents through the integration's native subagent support using the shared prompt contract.
- Join behavior: Use the integration-native join point, then integrate results back on the leader path.
- Preserve this workflow's existing packet, handoff, artifact, and result schema; this section only governs capability discovery before dispatch or blocked-state recording.

## Claude Code Structured Question Preference

- If this command was routed by `sp-auto` with `auto_default_recommendation: true`, evaluate the automatic recommended/default continuation gate before any question path.
- When that gate has one safe recommended/default answer, you must auto-resolve the question or confirmation, record the accepted recommendation in the workflow state or summary, continue the workflow, and do not invoke the native structured question tool only to ask for that approval.
- If the automatic gate is not safe, write the blocker and self-unblock recommendation before using the normal question path.
- If the runtime's native structured question tool is available for the current turn and the `sp-auto` automatic gate did not resolve the question, you must use it.
- Do not render the textual fallback block when the native tool is available.
- Do not self-authorize textual fallback because the question seems simple, short, or easy to phrase manually.
- Treat the template's textual question format as fallback-only guidance; use it to shape the question content, but do not render the textual block unless the native tool is unavailable in the current runtime or the tool call fails.
- Keep native-tool availability, runtime mode, and fallback mechanics backstage. Do not tell the user that a structured question tool is unavailable, that the current runtime/mode lacks a tool, or that a fallback is being used; ask the user-facing question directly when a question is genuinely required.
- Ask only the minimum number of questions required by this workflow's existing contract.
- Keep the user-visible question text in the user's current language and keep option labels short.
- Do not emit both a native tool question and the textual fallback block in the same turn. The user should see the active question exactly once.
- If the native tool is unavailable in the current runtime or the tool call fails, ask one concise plain-text product or technical question and continue with the discussion state update.
- In `discussion`, use this preference for:
  - one high-impact product or technical clarification
  - resume selection when multiple incomplete discussions exist
  - explicit handoff request and boundary confirmation before drafting agent-only `handoff-to-specify.json`
  - user confirmation before marking the handoff ready for `sp-specify`
- Native tool target: `AskUserQuestion`
- When this native tool target is listed for the integration and the runtime does not signal otherwise, assume it is available by default in normal interactive sessions.
- Question count: 1-4 questions per call
- Option count: 2-4 options per question
- Required question fields: `question`, `header`, `options`, `multiSelect`
- Option fields: `label`, `description`, `preview (optional)`
- Use `multiSelect: false` unless the workflow explicitly needs multiple selections.
- Use `metadata` only when tracking or analytics context adds value; otherwise keep the call minimal.
