---
name: "sp-quick"
description: "Use when a task is small but non-trivial and needs lightweight tracked planning, validation, or resumable execution outside the full workflow."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/quick.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: The task is too large or risky for `sp-fast` but does not justify the full `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify -> plan -> tasks -> implement` flow.
- **Primary objective**: Keep the task resumable and tracked while applying only the minimum planning, research, and validation depth it needs.
- **Primary outputs**: `.planning/quick/<id>-<slug>/STATUS.md`, quick-task summary artifacts, and the scoped implementation changes for the task.
- **Default handoff**: Resume the quick task until resolved, or escalate to /sp.specify if the scope grows into multi-capability or acceptance-criteria-heavy work.
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

Execute a small, ad-hoc task through a lightweight planning and validation path without entering the full `specify -> plan -> tasks` workflow.

This command will skip the full feature-spec workflow while preserving lightweight planning and verification.

Use this for work that is too large for `sp-fast` but still too small or too well understood to justify a full spec flow: small bug fixes, small features, focused UX adjustments, template tweaks, or narrow CLI behavior changes.

Before the lightweight path starts substantive execution, make the agent's understanding visible in one initial full checkpoint so the user can confirm or correct the direction. Later material changes use the delta-only amendment contract instead of repeating that checkpoint.

## Context

- Primary inputs: the user's request, quick-task workspace state, CLI-selected Learning, the task-local project cognition query bundle with readiness and returned `minimal_live_reads`, and the smallest workflow-local state files needed for the touched area.
- The leader owns `STATUS.md`, lane selection, join points, validation, and final summary state.
- Quick mode is the resumable middle lane between `sp-fast` and the full specification workflow.
- Continue in quick only when any `CA-###` consequence obligations are bounded in `STATUS.md` with affected objects, lifecycle states, dependency impact, recovery/validation proof, coverage gaps, and stop-and-reopen conditions.
- Before substantive execution, present one Understanding Checkpoint using the fixed Quick Checkpoint card below. Keep the approval surface to user-owned outcome, visible result, scope, recommended approach, assumptions and risks, completion evidence, and reconfirmation triggers. Technical execution belongs to the agent. For applicable UI work, append the independent UI Confirmation card and ask for one combined confirmation; record both decisions in quick `STATUS.md`.

## Quick Checkpoint Card

Use this exact Markdown table shape for the user-facing Quick Checkpoint. The
row labels may be localized to the user's language when practical, but preserve
the canonical row meanings and the
`| Decision to confirm | Current understanding |` structure. This table is for
user-owned decisions. Technical execution belongs to the agent; freeform prose,
bullet-only confirmations, or partial field lists are not sufficient.

Do not reuse the placeholder text as content. Replace every bracketed item with
task-specific facts. Keep the checkpoint plain text for terminal output; do not
use HTML tags or inline line-break markup.

```markdown
## Quick Checkpoint

| Decision to confirm | Current understanding |
| --- | --- |
| Request and outcome | [2-4 concrete sentences: the request or problem in the user's terms, where it appears, why it matters, and the outcome this quick task should deliver] |
| User-visible result | [what the user will see, do, or rely on differently when the work is complete] |
| Scope | Include: [behaviors, areas, or workflows that are part of this task]. Exclude: [nearby non-goals or behavior that must remain unchanged]. |
| Recommended approach | [the user-relevant approach and any meaningful product trade-off; omit implementation sequencing and internal file choreography] |
| Assumptions and risks | [facts being assumed, known uncertainty, compatibility or migration risk, and the consequence if an assumption is wrong] |
| Completion evidence | [observable acceptance result plus the tests, real entry point, or other evidence the user can rely on] |
| Reconfirmation trigger | [the exact product, scope, authority, compatibility, migration, or risk change that would require a new user decision] |
```

For UI-related work, render the independent UI Confirmation card immediately
after the Quick table. Otherwise omit it completely.

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

After the applicable table or tables, the agent may add a short technical
summary for awareness, not as a request to approve technical details. It may
name likely affected surfaces, the first execution action, and the verification
route, but those are agent-owned and must not become additional approval rows.

Reply with `confirm`/`确认` to approve the checkpoint and, when present, the UI
proposal in one response. Reply with `revise: scope ...`/`修改：范围 ...`,
`revise: UI ...`/`修改：UI ...`, or another precise correction to revise only
that decision.

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

1. Accept only bounded quick work; otherwise route to `$sp-specify`, `$sp-debug`, or the appropriate upstream workflow.
2. Create or resume `.planning/quick/<id>-<slug>/STATUS.md`, confirm the Understanding Checkpoint, and keep `understanding_confirmed: false` blocking substantive work until confirmed.
3. Consume eligible discussion handoff or quick-task context without widening scope; record consequence boundary and escalation decision.
4. Use `choose_subagent_dispatch(command_name="quick", snapshot, workload_shape)` and packetized `WorkerTaskPacket` or equivalent contracts for substantive lanes.
5. Execute the quick task, update STATUS.md at phase transitions, validate changed surfaces, write `SUMMARY.md`, and close as resolved or blocked with truthful coverage.

## Detailed References

Read [Reference index](references/INDEX.md) before applying detailed contracts.

- [intake and checkpoint](references/intake-and-checkpoint.md)
- [workspace state](references/workspace-state.md)
- [handoff consumption](references/handoff-consumption.md)
- [packetized work](references/packetized-work.md)
- [validation and closeout](references/validation-and-closeout.md)

## Codex Project Cognition Advisory Gate

**Crucial First Step**: You MUST use project cognition compass first: run `C:\Users\11034\.specify\bin\project-cognition.exe compass --intent implement --query=\"$ARGUMENTS\" --format json` before repository analysis or implementation. Read and carry `epistemic_contract`; require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`. The contract cannot authorize source changes and cannot prove current behavior; contradictory live evidence overrides the route candidate. Graph claims are indexed assertions; even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth. Graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`; bounded live evidence and the separate workflow final-claim gate remain required. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`; treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates. Treat `expansion_ref` as a normal continuation path and run `project-cognition expand --id <id> --section <section> --format json` only when coverage state or live evidence requires more map detail. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. When `compass_state=needs_semantic_intake`, write `semantic_intake` from project vocabulary and rerun compass with `--semantic-intake-file`, or use the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed. Preserve advanced routing through `C:\Users\11034\.specify\bin\project-cognition.exe query --intent implement --query-plan \"<query_plan_json>\" --format json` for precision cases.
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
- Carry forward the selected capability, minimal reads, validation route, and known risk into quick-task `STATUS.md` before implementation proceeds.

## Codex Leader Gate

When running `sp-quick` in Codex, you are the **leader**, not the concrete implementer.

**Crucial First Step**: You MUST use project cognition compass first: run `C:\Users\11034\.specify\bin\project-cognition.exe compass --intent implement --query=\"$ARGUMENTS\" --format json` before repository analysis or implementation. Read and carry `epistemic_contract`; require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`. The contract cannot authorize source changes and cannot prove current behavior; contradictory live evidence overrides the route candidate. Graph claims are indexed assertions; even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth. Graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`; bounded live evidence and the separate workflow final-claim gate remain required. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`; treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates. Treat `expansion_ref` as a normal continuation path and run `project-cognition expand --id <id> --section <section> --format json` only when coverage state or live evidence requires more map detail. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. When `compass_state=needs_semantic_intake`, write `semantic_intake` from project vocabulary and rerun compass with `--semantic-intake-file`, or use the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed. Preserve advanced routing through `C:\Users\11034\.specify\bin\project-cognition.exe query --intent implement --query-plan \"<query_plan_json>\" --format json` for precision cases.

Before code edits, test edits, or implementation commands:
- Read `.specify/memory/constitution.md` first if it exists.
- Read `STATUS.md` for the active quick-task workspace, or create it if this quick task is new.
- If `understanding_confirmed` is not `true`, present the Understanding Checkpoint and wait for user confirmation before implementation work.
- The user-facing checkpoint must use the fixed Quick Checkpoint Markdown table with `| Decision to confirm | Current understanding |` and rows for `Request and outcome`, `User-visible result`, `Scope`, `Recommended approach`, `Assumptions and risks`, `Completion evidence`, and `Reconfirmation trigger`; technical execution stays agent-owned, and prose bullets or partial field lists are not sufficient. For applicable UI work, append the independent UI Confirmation card and ask once for both decisions.
- Do not proceed to code edits, broad repository analysis, delegation, or validation commands until `understanding_confirmed: true` is recorded in `STATUS.md`.
- Before choosing the next lane, read `STATUS.md` and any quick-task summary artifacts so resume truth comes from durable state instead of chat narration.
- After understanding is confirmed, define the smallest safe delegated lane or ready batch, and choose the dispatch shape for that batch.
- Dispatch `one-subagent` when one validated `WorkerTaskPacket` or equivalent execution contract preserves quality.
- Dispatch `parallel-subagents` when two or more safe subagent lanes would materially improve throughput.
- Use the current runtime's `native-subagents` path before considering any fallback path.
- If that bar is not met, keep the lane on the leader path until the missing context, constraints, validation target, or handoff expectations are explicit.
- Use the current integration's join point to integrate returned results before choosing the next action.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Use `managed-team` only when durable team state is needed beyond one in-session subagent burst.
- Use `subagent-blocked` only when subagent dispatch and the managed team workflow are both unavailable or unsafe.
- When `subagent-blocked` is used, you **MUST** write the concrete blocker reason into `STATUS.md` before escalating or stopping locally.

**Hard rule:** The leader must keep scope control, strategy selection, join-point handling, validation, summary ownership, and `STATUS.md` accuracy while subagent execution is active.

## Codex Quick Execution Routing

When running `sp-quick` in Codex, do not start execution routing until `STATUS.md` exists and `understanding_confirmed: true` is recorded.
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`.
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`.
- Understanding checkpoint: before dispatch, render the fixed Quick Checkpoint Markdown table with `| Decision to confirm | Current understanding |` and user-owned rows for request/outcome, visible result, scope, recommended approach, assumptions/risks, completion evidence, and reconfirmation trigger. Append the UI Confirmation proposal when applicable and use one combined confirmation.
- Subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Integration-native join point: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Fallback path: Use the managed team workflow when subagents are unavailable, low-confidence, or unsuitable.
- Once the first lane is chosen, dispatch it before continuing any leader-inline deep-dive analysis of the repository.
- If multiple safe subagent lanes exist and they materially improve throughput, dispatch them in parallel.
- Keep `.planning/quick/<id>-<slug>/STATUS.md` as the leader-owned source of truth.
- Before compaction-risk transitions or join points, update `STATUS.md` and any summary artifacts needed for clean resume.
- Subagents may return evidence, patches, and verification output, but they must not become the authority for resume state; the leader updates `STATUS.md` before and after each join point.
- Decision order for Codex `sp-quick`: safe packetized subagents -> `managed-team` when durable state is needed -> `subagent-blocked` with reason.
- Prefer subagent execution only when a validated `WorkerTaskPacket` or equivalent execution contract preserves quality.
- Re-check strategy after every join point and continue automatically until the quick task is complete or blocked.

## Codex Subagent Dispatch Contract

- Execution model: `subagents-first`
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`
- Delegation surface contract: preserve the native dispatch, fallback, worker result contract, and handoff path below.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Managed-team fallback: Use the managed team workflow when subagents are unavailable, low-confidence, or unsuitable.
- Leader-inline fallback: record the reason before local execution.
- Worker result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result handoff path: .specify/teams/state/results/<request-id>.json

## Codex Subagent Result Contract

- Worker result contract: preserve the shared `WorkerTaskResult` semantics even when the runtime calls lanes subagents.
- Preferred result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result file handoff path: .specify/teams/state/results/<request-id>.json
- Runtime-managed result paths require a dispatch request id; compute the path with `specify result path --command quick --request-id <request-id>` and report final completion through the active runtime-managed result channel for that request id.
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
- If the native tool is unavailable in the current runtime or the tool call fails, use the template's existing concise plain-text clarification or quick-task selection wording.
- In `quick`, use this preference for:
  - lightweight clarification when `--discuss` is active
  - resume selection when multiple unfinished quick tasks exist
- Native tool target: `request_user_input` if the current Codex runtime exposes it
- Question count: 1-3 short questions per call
- Option count: 2-3 options per question
- Required question fields: `header`, `id`, `question`, `options`
- Option fields: `label`, `description`
- Put the recommended option first and suffix its label with `(Recommended)` when that distinction matters.
- Use this native surface for one bounded clarification or selection step; if it is unavailable or too narrow for the needed interaction, fall back immediately to the template's textual question format.

## Codex Quick-Task Subagent Execution

When running `sp-quick` in Codex, start execution routing only after `STATUS.md` exists and `understanding_confirmed: true` is recorded.
- Understanding checkpoint: before dispatch, render the fixed Quick Checkpoint Markdown table with `| Decision to confirm | Current understanding |` and user-owned rows for request/outcome, visible result, scope, recommended approach, assumptions/risks, completion evidence, and reconfirmation trigger. Append the UI Confirmation proposal when applicable and use one combined confirmation.
- Dispatch `one-subagent` or `parallel-subagents` only after the Understanding Checkpoint is confirmed.
- Use `subagent-blocked` only after native subagents and the managed-team path are unavailable or unsafe, and record the blocker reason in `STATUS.md`.
- Use `spawn_agent` for bounded lanes such as focused repository analysis, targeted implementation, regression test updates, or validation command runs.
- Once the first lane is chosen, dispatch it before continuing any leader-inline deep-dive analysis of the repository.
- If multiple safe subagent lanes exist and they materially improve throughput, dispatch them in parallel.
- Use `wait_agent` only at the documented join point for the current quick-task batch.
- Use `close_agent` after integrating finished subagent results.
- Keep `.planning/quick/<id>-<slug>/STATUS.md` as the leader-owned source of truth.
- Subagents may return evidence, patches, and verification output, but they must not become the authority for resume state; the leader updates `STATUS.md` before and after each join point.
- Decision order for Codex `sp-quick`: safe packetized subagents -> `managed-team` when durable state is needed -> `subagent-blocked` with reason.
- Prefer subagent execution only when a validated `WorkerTaskPacket` or equivalent execution contract preserves quality.
- Re-check strategy after every join point and continue automatically until the quick task is complete or blocked.
