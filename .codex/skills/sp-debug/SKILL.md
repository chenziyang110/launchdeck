---
name: "sp-debug"
description: "Use when a bug, regression, failed verification, or unexpected runtime behavior needs a resumable investigation and fix workflow."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/debug.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A defect or failed verification needs structured root-cause investigation instead of ad hoc fixes.
- **Primary objective**: Build a resumable debug session that gathers evidence, identifies root cause, applies a fix, and verifies the result.
- **Primary outputs**: Debug-session state, evidence, verified fix artifacts when justified, and an honest blocked/resolved status.
- **Default handoff**: Stay inside the debug session until resolved or blocked; route back to execution only after the defect contract is satisfied.
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

Drive a resumable debugging workflow that finds the real failure mechanism before any fix is accepted.

## Context

- Primary inputs: the user's report, the active debug-session state, the failing runtime or verification evidence, and the task-local project cognition query bundle with readiness and returned `minimal_live_reads`.
- The debug session file under `.planning/debug/` is the durable state source of truth for this workflow.
- Delegated helpers are evidence collectors, not owners of the overall investigation.
- Debug execution is complexity-based: small focused investigations may stay leader-inline, while broad or independent evidence lanes use one or more subagents.
- Before substantive investigation, present one Debug Understanding Checkpoint covering user-owned problem facts, expected behavior, occurrence conditions, investigation boundary, explicit fix authority, assumptions to correct, and reconfirmation triggers. Technical hypotheses and the evidence sequence belong to the agent. For applicable UI symptoms, append the independent UI Confirmation target baseline and ask for one combined confirmation; record both decisions in the debug session file.
- Treat that as the one initial full checkpoint. If later evidence materially changes the confirmed boundary or authority, use the delta-only Debug Checkpoint Amendment contract after first explaining why the prior confirmation is no longer sufficient.

## Debug Checkpoint Card

Use this exact Markdown table shape for the user-facing Debug Checkpoint. The
row labels may be localized to the reporter's language when practical, but
preserve the canonical row meanings and the
`| Decision to confirm | Current understanding |` structure. This table is for
user-owned facts and authority. Technical hypotheses belong to the agent and
must not be presented as decisions the user has to validate.

Do not reuse the placeholder text as content. Replace every bracketed item with
session-specific facts. Keep the checkpoint plain text for terminal output; do
not use HTML tags or inline line-break markup.

```markdown
## Debug Checkpoint

| Decision to confirm | Current understanding |
| --- | --- |
| Reported problem | [2-4 concrete sentences: the symptom or regression in user-visible terms, where it appears, why it matters, and the nearby issue this session is not debugging] |
| Expected behavior | [what should happen instead, or the explicit unknown that the investigation must resolve] |
| Occurrence conditions | [known environment, inputs, sequence, frequency, reproduction, failing signal, or Unknown: why it matters] |
| Investigation boundary | Include: [behavior, workflow, state loop, environment, or affected area to investigate]. Exclude: [nearby issue, enhancement, or non-goal]. |
| Fix authority | [Diagnose only, or diagnose and fix after evidence proves the failure mechanism; name any mutation or side-effect boundary] |
| Assumptions to correct | [reporter assumptions or uncertain facts that should be corrected before investigation starts; use None when there are no known assumptions] |
| Reconfirmation trigger | [the exact new defect, boundary, authority, compatibility, migration, external side effect, or material risk change that would require a new user decision] |
```

For a visual, interaction, responsive, accessibility, TUI, or CLI presentation
problem, render the independent UI Confirmation card immediately after the
Debug table. Otherwise omit it completely.

This is a conditional, independent UI confirmation card shared by Quick and
Debug. UI applicability includes any user-visible screen, component, layout,
navigation or interaction flow, visual state, responsive behavior, desktop or
mobile surface, accessibility presentation, TUI layout, or CLI presentation.
It does not require an external image.

Quick uses this card for an implementation proposal: the user confirms the
intended experience before implementation.
Debug uses this card for a target baseline: the reporter confirms what the
affected experience should be.
The card must not pre-approve a speculative fix or root-cause theory.

Render this card only when every row can be grounded in an approved project
design direction, an inspectable current product surface, or supplied source
material. `design_system.status: bootstrap` is structurally valid but is not an
approved visual direction. For a new or high-visibility direction, first route
to `sp-design`/`spx-design` and obtain an inspectable visual artifact. For
multi-surface or acceptance-heavy UI, route to `sp-specify`/`spx-specify`.
Do not render an incomplete UI Confirmation as if it were approval-ready.

Preserve original references rather than replacing them with prose. For each
reference, state its reference intent, such as preserve, adapt, or inspiration.
Name the real content and image sources that will be exercised; placeholder-only
content is not an adequate acceptance basis.

```markdown
## UI Confirmation

| Decision to confirm | UI proposal or target baseline |
| --- | --- |
| Confirmation purpose | [Quick implementation proposal, or Debug target baseline; name the affected UI surface] |
| User and primary job | [who uses this surface, the situation they are in, and the single job the experience must help them complete] |
| Design basis and source material | [approved DESIGN.md direction, inspectable current entry point, original references with reference intent, and real content or image sources] |
| Target experience | [visual, content, and interaction thesis plus the signature element or recognizable behavior to preserve or introduce] |
| Structure and visible change | [information hierarchy, layout, component placement, copy, and visible before-to-after change] |
| Interaction, states, and adaptation | [primary interaction, loading/empty/error/success/disabled/focus states, responsive or window adaptation, keyboard and accessibility behavior] |
| Design boundaries | Must preserve: [non-negotiable patterns or behavior]. May adapt: [implementation-flexible details]. Must not: [visual, content, or interaction regressions]. |
| Acceptance evidence | [real entry point, representative viewport/window and state matrix, structure snapshot, visual capture, runtime diagnostics, and visual comparison or explicit human review] |
```

Do not add a second reply prompt here. When this card follows a Quick or Debug
checkpoint, a single confirmation covers both the main checkpoint and this UI
decision; a correction may target only the UI rows.

After the applicable table or tables, add a compact agent investigation summary
for awareness, not as a request to approve a hypothesis. It may state the first
evidence action, fix gate, and progress signal. Those details remain agent-owned
and must not become approval rows or a premature root-cause claim.

Reply with `confirm`/`确认` to approve the checkpoint and, when present, the UI
target baseline in one response. Reply with `revise: scope ...`/`修改：范围 ...`,
`revise: UI ...`/`修改：UI ...`, or another precise correction to revise only
that decision.


## Codex Project Cognition Advisory Gate

**Crucial First Step**: You MUST use project cognition compass first: run `C:\Users\11034\.specify\bin\project-cognition.exe compass --intent debug --query=\"$ARGUMENTS\" --format json` before any investigation or fixes. Read and carry `epistemic_contract`; require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`. The contract cannot authorize source changes and cannot prove current behavior; contradictory live evidence overrides the route candidate. Graph claims are indexed assertions; even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth. Graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`; bounded live evidence and the separate workflow final-claim gate remain required. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`; treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates. Treat `expansion_ref` as a normal continuation path and run `project-cognition expand --id <id> --section <section> --format json` only when coverage state or live evidence requires more map detail. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. When `compass_state=needs_semantic_intake`, write `semantic_intake` from project vocabulary and rerun compass with `--semantic-intake-file`, or use the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed. Preserve advanced routing through `C:\Users\11034\.specify\bin\project-cognition.exe query --intent debug --query-plan \"<query_plan_json>\" --format json` for precision cases.
- Read and carry `epistemic_contract`; require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`. The contract cannot authorize source changes and cannot prove current behavior; contradictory live evidence overrides the route candidate. Graph claims are indexed assertions; even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth. Graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`; bounded live evidence and the separate workflow final-claim gate remain required.
- Interpret returned readiness: `query_ready` reads top-level `minimal_live_reads` first and then lane-level `first_pass_paths`; `review` permits only returned `minimal_live_reads` plus `coverage_diagnostics`; `needs_rebuild` treats map output as advisory, continues with live repository evidence, and recommends `{{invoke:map-scan}}`, then `{{invoke:map-build}}` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside a `greenfield_empty` baseline, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`; `blocked` reports the runtime issue as advisory map state and continues with live repository evidence; `unsupported_runtime` continues with live evidence and records that compass intake was unavailable. If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements instead of treating absent graph paths as `needs_rebuild`. If the user's actual request is to fix cognition runtime state, report the blocked state and follow the same map-update-first routing policy.
- Use `map-update` for ordinary existing-baseline gaps. If `baseline_kind=greenfield_empty`, do not recommend map-scan -> map-build solely because the graph has no paths; continue with workflow artifacts and live requirements. Use `map-scan -> map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`.
- Treat the project cognition compass packet as advisory navigation for brownfield context; do not fall back to chat memory or ad hoc repository instincts when compass-backed runtime coverage should guide the route.
- Treat this as advisory navigation, not a hard gate; continue with live repository evidence when the bundle is weak, stale, or missing, and use map maintenance only when it is actually useful.
- Mutation closeout is separate from entry routing: entry stale may continue, but workflow-owned mutation closeout is not an external map-maintenance handoff. If the workflow changes source/runtime truth-owning surfaces, shared surfaces, command/route/contract boundaries, verification entry points, runtime assumptions, or other project-related behavior surfaces, final state must run inline project cognition update from changed paths, affected surfaces, and verification evidence.
- Inline project cognition update uses `project-cognition delta append` followed by `project-cognition update --delta-session "$DELTA_SESSION_ID" --reason workflow-finalize --format json` when a delta session exists, or `project-cognition update --payload-file ".specify/project-cognition/updates/<update-id>.json" --reason workflow-finalize --format json` when no delta session exists.
- The payload-file path must include changed_paths, behavior_surfaces, generated_surfaces, state_contracts, verification, known_unknowns, and confidence_notes so the update is equivalent to `sp-map-update`, not just a path stamp; `verification_evidence` and `generated_surface_notes` are accepted compatibility aliases.
- Use `known_unknowns` only for blockers that make the cognition update unsafe to trust. If unrelated dirty or untracked working-tree paths were excluded by explicit workflow-owned paths, record that as `confidence_notes` or `boundary.initial_dirty_paths`, not as blocking `known_unknowns`.
- clean closeout keys on `result_state`, not `update_id`, `last_update_id`, or freshness alone. Treat `ready` and `no_op` as clean, `partial_refresh` as recorded but not fully clean, `needs_rebuild` as a map-scan/map-build route, `blocked` as blocked, and `recorded` as legacy recorded-only output that is never clean completion.
- Use `project-cognition mark-dirty --reason "<reason>" --format json` only when inline update cannot complete. Dirty only when inline update cannot complete.
- `sp-map-update` is for manual/external maintenance and follow-up repair after user edits, interrupted workflows, or explicit operator map-maintenance requests. It is not routine cleanup for changes this workflow just made.
- A project-cognition compass intake is not complete when it returns JSON. It is complete only when readiness drives routing, `minimal_live_reads` constrains inspection, lane-level `first_pass_paths` reasons are considered, and relevant facts are carried into the next workflow artifact or execution state.
- Carry forward the selected capability or symptom, evidence routes, minimal reads, competing truths, and unresolved coverage gaps into debug session state before root-cause claims.

## Process

- Recover or initialize the debug session and current hypothesis.
- Gather evidence through the current investigation strategy.
- For consequence-sensitive failures, trace affected objects, dependency loops, control/observation states, adjacent risk targets, and any `CA-###` stop-and-reopen conditions before accepting a fix.
- Apply a fix only after the failure mechanism is understood well enough to justify it.
- Verify the result and update the session state before any resolution claim.

## Output Contract

- Keep the debug session state, current hypothesis, evidence, and verification outcome explicit.
- Produce a verified fix only when the evidence supports it.
- Report blocked or unresolved states honestly when the investigation cannot yet close.

## Guardrails

- No speculative fixes before evidence supports the failure mechanism.
- No final resolution without fresh verification evidence.
- No subagent may take ownership of the debug session state.
- No subagent-assisted work may continue without a safe lane; blocked debug execution records `subagent-blocked`, `execution_surface: none`, and a concrete blocked reason.

## Senior Consequence Analysis Gate

Run this gate whenever the request, artifact set, defect, or planned change can affect lifecycle operations, running objects, concurrent work, destructive behavior, shared state, downstream consumers, compatibility, security-sensitive behavior, or multiple plausible product behaviors.

Project cognition first. Use the project cognition runtime to identify ownership, consumers, state surfaces, change-propagation facts, verification routes, conflicts, known unknowns, and coverage gaps. Senior consequence analysis second. Turn those facts into explicit product and implementation obligations instead of treating the graph as the decision-maker.

Project cognition readiness provides routing advice. If readiness is `query_ready`, read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons. If readiness is `review`, inspect the returned `minimal_live_reads` before continuing and treat `coverage_diagnostics` as confidence and closeout signals. If readiness is `needs_rebuild`, continue with live repository evidence and recommend `$sp-map-scan -> $sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`. If readiness is `blocked`, report the blocked state and continue with live repository evidence unless the user's actual request is to fix cognition runtime state. If readiness is `unsupported_runtime`, continue with live evidence and record that compass intake was unavailable. If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements; do not recommend map-scan -> map-build solely because the graph has no paths. Carry relevant project cognition facts, returned `minimal_live_reads`, inference notes, and coverage gaps into the workflow's artifacts or durable state, but back consequence claims with live code, tests, scripts, configuration, or authoritative docs. Mutation closeout is separate from entry routing: entry stale may continue, but that does not allow source/runtime mutation workflows to defer closeout. Workflow-owned mutation closeout is not an external map-maintenance handoff; after changing project-related files or behavior, the workflow must run inline project cognition update from its changed paths, affected surfaces, and verification evidence, with `project-cognition mark-dirty` only as fallback when inline update cannot complete. `sp-map-update` is for manual/external maintenance and follow-up repair; it is external map maintenance, not routine closeout for this workflow's own changes. In shared routing summaries, sp-map-update is for manual/external maintenance and ordinary existing-baseline gaps.

Required output when the gate triggers:

- **Affected Object Map**: name each object, record, worker, queue, artifact, command, API, file surface, user-visible state, or downstream consumer that can be affected.
- **State-Behavior Matrix**: describe behavior for each important lifecycle state, including created, queued, running, paused, failed, cancelled, completed, resumed, archived, missing, stale, or partially refreshed states when relevant.
- **Dependency Impact Table**: map direct dependencies, indirect consumers, shared state, compatibility surfaces, validation routes, and adjacent workflows that can break if semantics change.
- **Recovery And Validation Contract**: state rollback, retry, idempotency, cleanup, migration, observability, and validation evidence required before handoff or completion.
- **Coverage Gaps**: list what project cognition or live evidence cannot prove, who must resolve each gap, the latest safe resolve phase, the stop-and-reopen condition, and the routing decision: current workflow may continue with an assumption, must ask the user, must route to clarification or deep research, or must request map maintenance.
- **Consequence Obligations**: assign stable `CA-###` IDs to every obligation that must survive downstream handoff, task generation, worker packets, verification, or debug closeout. Each `CA-###` must include claim, affected objects, owner workflow, latest resolve phase, status, and stop-and-reopen condition.

Stand down only for docs-only wording changes, trivial isolated fixes, or local refactors that cannot affect lifecycle operations, running state, destructive operations, shared state, downstream consumers, compatibility, security, or multiple behavior choices. Record the no-trigger reason or stand-down reason in the workflow's durable artifact or closeout before skipping the required outputs.

If the gate triggers and the current workflow cannot preserve the required outputs, stop and route to the workflow that can. Do not mark ready, resolved, handoff-ready, planning-ready, or complete while triggered consequence obligations remain unresolved, unmapped, or unsupported by validation evidence.

[AGENT] For project-cognition-backed semantic intake, routing, audit, resume, or final-claim gates, read `references/semantic-work-contract.md`.

## Main Flow

1. Choose `leader-inline`, `subagent-assisted`, or `blocked` based on investigation size, safety, and packetizability; keep the leader responsible for session state and root-cause decisions.
2. Create or resume the debug session, read required context, run the Debug Cognition Gate, and confirm the Debug Understanding Checkpoint before reproduction, logs, source reads, code edits, or validation.
3. Build the causal map, investigation contract, log plan, observer framing, and first evidence path; do not form a final root cause before reproduction and evidence.
4. Investigate one active hypothesis at a time, record eliminated alternatives, confirm root cause, and reject surface-only fixes.
5. Apply the minimum safe fix through the selected execution model, verify with reproduction and tests, review related risks, update the debug file, and close only as resolved or blocked.

## Detailed References

Read [Reference index](references/INDEX.md) before applying detailed contracts.

- [intake and debug checkpoint](references/intake-and-debug-checkpoint.md)
- [reproduction and evidence](references/reproduction-and-evidence.md)
- [hypothesis and root cause](references/hypothesis-and-root-cause.md)
- [fix gate](references/fix-gate.md)
- [regression validation and closeout](references/regression-validation-and-closeout.md)
- [debug state](references/debug-state.md)

## Codex Leader Gate

When running `sp-debug` in Codex, you are the **leader**, not a freeform debugger.

**Crucial First Step**: You MUST use project cognition compass first: run `C:\Users\11034\.specify\bin\project-cognition.exe compass --intent debug --query=\"$ARGUMENTS\" --format json` before any investigation or fixes. Read and carry `epistemic_contract`; require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`. The contract cannot authorize source changes and cannot prove current behavior; contradictory live evidence overrides the route candidate. Graph claims are indexed assertions; even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth. Graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`; bounded live evidence and the separate workflow final-claim gate remain required. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`; treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates. Treat `expansion_ref` as a normal continuation path and run `project-cognition expand --id <id> --section <section> --format json` only when coverage state or live evidence requires more map detail. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. When `compass_state=needs_semantic_intake`, write `semantic_intake` from project vocabulary and rerun compass with `--semantic-intake-file`, or use the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed. Preserve advanced routing through `C:\Users\11034\.specify\bin\project-cognition.exe query --intent debug --query-plan \"<query_plan_json>\" --format json` for precision cases.

Before applying fixes or running investigation actions:
- Read the current debug session state and choose `execution_model: leader-inline | subagent-assisted | blocked` from the investigation shape.
- Use `leader-inline` for a small focused investigation with one short evidence chain.
- Use `subagent-assisted` when there are two or more independent evidence-gathering lanes, broad surface area, or meaningful parallelism.
- If the next step is unsafe, unavailable, or unpacketizable, record `subagent-blocked`, `execution_surface: none`, and a concrete `blocked_reason` before stopping.
- Rejoin only at the current investigation join point, then integrate returned results on the leader path.


## Codex Deep Debug Intake Dispatch

When running `sp-debug` in Codex, use the project cognition compass packet as the default intake source. If the **Gathering** stage can build `map-backed-minimum-intake`, continue directly into evidence investigation with the primary candidate, contrarian candidate, transition memo, and log plan already recorded.

If project cognition is missing, ambiguous, stale, or insufficient for the failing area, Gathering may return an `await_input` containing a `think_subagent_prompt`. This prompt is a self-contained deep fallback reasoning task for a fresh subagent.

**When you receive a think_subagent_prompt:**
- Spawn a subagent with the exact prompt text via `spawn_agent`.
- The think subagent does NOT read source code and does NOT run commands — it is a pure reasoning agent.
- Use `wait_agent` to wait for the think subagent's result.
- The result is hybrid: free-text analysis followed by `---` and a YAML block.
- Parse the YAML block after `---` and populate these fields in the debug state:
  - `causal_map` (symptom_anchor, closed_loop_path, break_edges, bypass_paths, family_coverage, candidates, adjacent_risk_targets, dimension_scan, candidate_board)
- Ensure Stage 1A covers at least 3 families and every family includes a falsifier.
- These Stage 1A candidates are still the observer-framing alternative cause candidates; do not collapse them into one family too early.
- Set `causal_map_completed` to `True`.
- Then continue the debug session — the next GatheringNode run will request the contract planner stage.
- If Gathering returns `contract_subagent_prompt`, use it for the contract-planner subagent and feed its result back into `observer_framing`, `transition_memo`, `investigation_contract`, and top-level `log_investigation_plan`.
- Treat the causal-map output as Stage 1A and the contract-planner output as Stage 1B. Investigation starts only after both stages are complete, unless map-backed minimum intake already completed those fields.
- Stage 1B must still produce a primary suspected loop, a contrarian candidate, and a recommended first probe before investigation begins.
- Do NOT skip the think subagent once the runtime requested deep fallback. Context isolation is the purpose of that step.

**Hard rule:** During `investigating`, the leader must not let subagents mutate the debug file, declare the root cause final, or advance the session state.

## Codex Investigation Routing Contract

When running `sp-debug` in Codex, treat `investigating` as a complexity-based leader decision.
- Execution model: `leader-inline | subagent-assisted | blocked`.
- Dispatch shape: `leader-inline`, `one-subagent`, `parallel-subagents`, or `subagent-blocked`.
- Execution surface: `leader-inline`, `native-subagents`, or `none`.
- Subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Integration-native join point: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Fallback path: No managed-team or leader-inline fallback for `sp-debug`; choose `leader-inline` up front for a small focused investigation, or record `subagent-blocked` with `execution_surface: none` when the next safe step cannot proceed.
- Small focused investigation -> `leader-inline`.
- One safe isolated evidence lane -> `one-subagent` when the current runtime supports it safely.
- Two or more independent evidence lanes -> `parallel-subagents` when the current runtime supports it safely.
- Unsafe, unavailable, or unpacketizable next step -> `subagent-blocked` with `execution_surface: none` and `blocked_reason`.
- Suitable subagent tasks include running targeted tests or repro commands, collecting logs and exit codes, searching for error text, tracing isolated code paths, and gathering evidence after diagnostic logging has been added.
- Read `diagnostic_profile` from the debug session before choosing subagent lanes.
- Subagents must return facts, command results, and observations; they must not update the debug file, declare the root cause final, or transition the session state.
- Keep fixing, verification, `awaiting_human_verify`, and final session resolution on the leader path.

## Codex Subagent Dispatch Contract

- Execution model: `subagents-first`
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`
- Delegation surface contract: preserve the native dispatch, fallback, worker result contract, and handoff path below.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Managed-team fallback: No managed-team or leader-inline fallback for `sp-debug`; choose `leader-inline` up front for a small focused investigation, or record `subagent-blocked` with `execution_surface: none` when the next safe step cannot proceed.
- Leader-inline fallback: record the reason before local execution.
- Worker result contract: Fact-only evidence payload: hypothesis tested, commands run, files inspected, observations, confidence, blocker.
- Result contract: Fact-only evidence payload: hypothesis tested, commands run, files inspected, observations, confidence, blocker.
- Result handoff path: .specify/teams/state/results/<request-id>.json

## Codex Subagent Result Contract

- Worker result contract: preserve the shared `WorkerTaskResult` semantics even when the runtime calls lanes subagents.
- Preferred result contract: Fact-only evidence payload: hypothesis tested, commands run, files inspected, observations, confidence, blocker.
- Result file handoff path: .specify/teams/state/results/<request-id>.json
- Runtime-managed result paths require a dispatch request id; compute the path with `specify result path --command debug --request-id <request-id>` and report final completion through the active runtime-managed result channel for that request id.
- `specify result path` emits JSON and does not accept `--format`; do not append `--format`.
- Normalize subagent-reported statuses like `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, and `NEEDS_CONTEXT` into the shared `WorkerTaskResult` contract before the leader accepts the handoff.
- Keep `reported_status` when normalization occurs so runtime-specific subagent language can be reconciled with canonical orchestration state.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Treat `DONE_WITH_CONCERNS` as completed work plus follow-up concerns, not as silent success.
- Treat `NEEDS_CONTEXT` as a blocked handoff that must carry the missing context or failed assumption explicitly.

## Codex Structured Question Preference

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
- If the native tool is unavailable in the current runtime or the tool call fails, ask one concise missing-information question in plain text during observer framing before entering reproduction work.
- In `debug`, use this preference for:
  - missing-information questions during map-backed intake
  - deep Stage 1A/1B fallback when project cognition is insufficient
- Native tool target: `request_user_input` if the current Codex runtime exposes it
- Question count: 1-3 short questions per call
- Option count: 2-3 options per question
- Required question fields: `header`, `id`, `question`, `options`
- Option fields: `label`, `description`
- Put the recommended option first and suffix its label with `(Recommended)` when that distinction matters.
- Use this native surface for one bounded clarification or selection step; if it is unavailable or too narrow for the needed interaction, fall back immediately to the template's textual question format.

## Codex Subagent Evidence Collection

When running `sp-debug` in Codex, choose leader-inline or subagent-assisted evidence collection from the investigation shape.
- Execution model: `leader-inline | subagent-assisted | blocked`.
- Dispatch shape: `leader-inline`, `one-subagent`, `parallel-subagents`, or `subagent-blocked`.
- Execution surface: `leader-inline`, `native-subagents`, or `none`.
- Small focused investigation -> `leader-inline`.
- One safe isolated evidence lane -> `one-subagent` when the current runtime supports it safely.
- Two or more independent evidence lanes -> `parallel-subagents` when the current runtime supports it safely.
- Unsafe, unavailable, or unpacketizable next step -> `subagent-blocked` with `execution_surface: none` and `blocked_reason`.
- If there are two or more independent evidence-gathering lanes, dispatch subagents through `spawn_agent` instead of doing manual sequential investigation.
- Suitable subagent tasks include running targeted tests or repro commands, collecting logs and exit codes, searching for error text, tracing isolated code paths, and gathering evidence after diagnostic logging has been added.
- Read `diagnostic_profile` from the debug session before choosing subagent lanes.
- The leader **MUST** update the debug file's `Current Focus` before dispatching subagents and treat subagent work as evidence collection for the current hypothesis.
- The think-subagent output is an investigation contract, not advisory prose.
- The investigating stage must consume the candidate queue and primary candidate before freeform fixes begin.
- After two automated verification failures, switch the session into root-cause mode and stop layering point fixes.
- Do not close the session until nearest-neighbor related risk targets have been reviewed.
- Subagents must return facts, command results, and observations; they must not update the debug file, declare the root cause final, or transition the session state.
- Wait for every subagent's structured handoff before accepting the join point or changing the investigation stage.
- Wait for every delegated lane's structured handoff before accepting the join point or changing the investigation stage.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the evidence lane is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Use `wait_agent` only after the current investigation fan-out reaches its join point.
- Use `close_agent` after integrating finished subagent results.
- Do not resolve the session directly from successful automated verification. Successful automated verification must hand off into formal human verification.
- If human feedback reports another problem, classify it as `same_issue`, `derived_issue`, or `unrelated_issue`.
- Default to `same_issue` unless strong evidence proves the other classes.
- Keep fixing, agent verification, `awaiting_human_verify`, and final session resolution on the leader path.
