---
name: "sp-tasks"
description: "Use when plan artifacts exist and execution needs dependency-aware tasks, guardrails, and parallelization guidance before implementation."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/tasks.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: Planning artifacts already exist and the remaining gap is concrete execution slicing rather than more design work.
- **Primary objective**: Produce `tasks.md` with dependency ordering, guardrail carry-forward, execution batches, and join points.
- **Primary outputs**: `FEATURE_DIR/task-index.json` as the canonical task graph for standard/heavy or any UI-bearing work plus rendered `tasks.md`; light non-UI leader-direct work may use only `tasks.md`. `handoff-to-tasks.json` is a compact agent transition when compatibility requires it. Worker packets are compiled just in time by `sp-implement`; task-generation lane records exist only when lanes were actually delegated.
- **Default handoff**: /sp.implement for a clean completed task package; /sp.analyze only when a persisted legacy or diagnostic state explicitly records that route; /sp.plan, /sp.clarify, or /sp.deep-research when escalated remediation exposes missing upstream truth.
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

Compile a ready plan contract into the smallest dependency-safe execution graph that preserves scope, boundaries, obligations, verification, and recovery.

## Context

- Primary authority: `plan-contract.json`; `tasks.md` is the project-facing view and `task-index.json` is canonical for standard/heavy and all UI-bearing work.
- Read conditional plan/spec views only through a required ref or stale condition.
- Task generation is artifact-only and does not authorize source/test edits.

## Process

- If `FEATURE_DIR` is not explicit, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify lane resolve --command tasks --ensure-worktree`; honor a materialized worktree and stop on `uncertain`.
- Validate plan revision, target boundary, complete confirmed scope, interfaces, acceptance, `MP-*`, `CA-###`, capability, fidelity, and stop/reopen refs.
- Reject a target that silently falls back to the current repository when another implementation target was confirmed.
- Select `light`, `standard`, or `heavy`; delegate only isolated decomposition lanes whose benefit exceeds handoff cost.
- Build outcome-oriented tasks, dependency edges, safe parallel batches, and explicit join points. Every join point records validation target, command/check, pass condition, and recovery.
- Run deterministic graph review; repair task-layer defects locally and route upstream truth defects to their owner.

## Tiered Contract

- `leader-direct`: id, objective, dependencies, expected path/discovery scope, acceptance, verification.
- `delegated`: add bounded reads/writes, forbidden drift, authoritative refs, done condition, and recovery.
- `parallel/high-risk`: add exact write isolation, task-relevant obligation/fidelity refs, consumer evidence, join point, and stop/reopen conditions.

Exact delegated packet shape lives in `.specify/templates/task-packet-template.json`. `sp-implement` renders and validates only the current packet against live code; do not copy the schema into `tasks.md` or pre-generate all packets.

## Output Contract

- Light non-UI: compact `tasks.md` unless a graph adds real resume value.
- Any UI-bearing work: minimal canonical `task-index.json` plus task-local UI contracts in rendered `tasks.md`.
- Standard/heavy: canonical `task-index.json` plus rendered `tasks.md`.
- Delegated decomposition only: one lane manifest plus lane results.
- Consume every accepted task-generation lane result into a task, edge, batch, join point, guardrail, or explicit blocker/deferral; chat-only lane output is not handoff truth.
- Ready transition: canonical task ref, semantic delta, required refs, blockers/recovery, and exactly one next action.

## Guardrails

- Do not duplicate full upstream contracts, pre-generate every worker packet, or turn task generation into implementation.
- Do not mark a task ready when dependencies, acceptance, required refs, verification, write isolation, or recovery are unresolved.
- Route spec or plan truth defects upstream; repair only task-graph defects locally.

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

## Planning Cognition Policy

Use project cognition as advisory navigation, never as sole proof. For an unchanged phase pass, run at most one `project-cognition compass --intent plan` intake when the canonical context capsule lacks a required facet.

Run or emulate:

```text
C:\Users\11034\.specify\bin\project-cognition.exe compass --intent plan --query=\"$ARGUMENTS\" --format json
```

- Read and carry `epistemic_contract` in the phase context capsule. Require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`. The contract cannot authorize source changes and cannot prove current behavior.
- Graph claims are indexed assertions. Even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth; graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`. Use related graph claims to narrow live reads, then prove or reject them from bounded repository evidence.
- Reuse the returned `compass_state`, `minimal_live_reads`, `first_pass_paths`, lane `claim_refs`, `coverage_diagnostics`, and `expansion_ref` as the phase context capsule. Treat `route_confidence` only within `confidence_scope=route_candidate`; use top-level advanced-query `claim_signals` or `project-cognition expand --section claim_evidence` for bounded `source_path`/`span` evidence. These signals require live verification and cannot prove current repository truth. Read only the minimum live evidence needed for the active claim and let contradictory live evidence override the route candidate.
- Interpret `claim_ranking` only as a bounded rerank of candidates already eligible through `match_score`; claims cannot create candidates and cannot replace live verification. Fresh supported or graph-generation-verified claims add at most `+1`, while stale and contradicted claims subtract `-1` and `-2`. On `stale_claim_signal` or `contradicted_claim_signal`, preserve `usable_with_review`, follow `reconcile_claims_with_minimal_live_reads`, and complete the lane action against live repository evidence.
- When claim-specific bounded reads settle a stale or contradicted route, provide only reconciliation intent: workflow, stable `claim_id`, reason, repository-relative `source_path`, bounded line `span`, `supporting` or `contradicting` role, and optional claim-specific verification. Run `project-cognition claim-reconcile prepare --input <intent.json> --format json`; the runtime owns all integrity fields and the prepared packet path. Execute the returned `apply_argv` exactly (`project-cognition claim-reconcile apply --input <prepared_packet_path> --format json`). Generic verification cannot re-promote a graph claim. If reconciliation is ready, rerun Compass once for the planning route; otherwise withhold the claim.
- `fresh`, `stale`, `possibly_stale`, `needs_update`, and `partial_refresh` are planning advisories. Follow returned `minimal_live_reads` and prove the active claim from live evidence; do not stop solely because the index is stale.
- Rebuild only for an unusable/missing baseline or explicit rebuild condition. Do not turn ordinary planning into map maintenance.
- Artifact-only specification, planning, and task generation do not mark project cognition dirty. A cognition follow-up is required only after actual source/runtime truth changes.
- For UI-bearing work, use the same intake to locate likely real entry points,
  token/theme/component owners, reusable patterns, required states, responsive
  behavior, visual/accessibility tests, and design assets. Verify selected paths
  live, then carry only the compact routes needed by downstream task packets.

[AGENT] For project-cognition-backed semantic intake, routing, audit, resume, or final-claim gates, read `references/semantic-work-contract.md`.

## Adaptive Artifact-Phase Execution

This partial governs artifact-producing adaptive phases such as `sp-design`, `sp-plan`, and `sp-tasks`. `sp-implement` has its own task-level adaptive controller; debug, map, PRD, and other workflows keep their command-specific execution contracts.

Select the execution mode before dispatch:

- `light`: low-risk, single-lane artifact work that is safe for leader-inline synthesis.
- `standard`: bounded planning or task-generation work where native subagents should be used when available.
- `heavy`: safety-critical, cross-boundary, high-risk, or hard-to-packetize work that requires safe native delegation before synthesis continues.

Record the adaptive decision fields exactly:

- `execution_model: adaptive`
- `execution_mode: light | standard | heavy`
- `workflow_status: ready | blocked`
- `dispatch_shape: leader-inline | one-subagent | parallel-subagents | subagent-blocked`
- `execution_surface: leader-inline | native-subagents | none`
- `capability_degraded: false | true`
- `blocked_reason: required when blocked`

Use `choose_subagent_dispatch(command_name="plan" | "tasks", snapshot, workload_shape)` as the shared policy contract. Derive `workload_shape.lightweight_safe` from workload shape and risk keys; do not invent a separate template-only boolean.

Dispatch rules:

- Light mode records `dispatch_shape: leader-inline`, `execution_surface: leader-inline`, `workflow_status: ready`, and `capability_degraded: false`.
- Standard mode uses native subagents when available: one validated lane records `one-subagent`; two or more isolated lanes record `parallel-subagents`.
- Standard mode may degrade to leader-inline only when native subagents are unavailable and no high-risk trigger is present; record `capability_degraded: true`.
- Heavy mode must use native subagents with safely packetized lanes. If native subagents are unavailable, or if the work cannot be packetized safely, record `workflow_status: blocked`, `dispatch_shape: subagent-blocked`, `execution_surface: none`, and `blocked_reason`.

Artifact-writing delegated lanes must use writable, execution-capable native subagents. If the runtime exposes role, sandbox, or permission choices, select a role/sandbox that can write the declared handoff file. Do not dispatch a read-only explorer, reviewer, or diagnostic lane when the lane must write a filesystem handoff; read-only lanes may provide supplemental evidence, but they do not satisfy `one-subagent` or `parallel-subagents` handoff requirements. The lane contract's allowed write scope must include the exact expected handoff path and must forbid unrelated writes unless the command explicitly assigns an additional generated artifact. If a delegated lane returns prose, idle state, or an unwritten handoff, stop or re-dispatch with a writable lane and the valid handoff path.

Delegated lanes still require structured handoffs before synthesis. If delegated lanes were used, consume the one lane manifest and every accepted lane result before final output; do not duplicate the same events into evidence-index and checkpoint logs. If no lanes were delegated, report the delegated-lane field as `none`.

Managed-team fallback is not part of adaptive plan/tasks dispatch. Do not route blocked adaptive planning or task generation to `sp-teams`, managed-team lifecycle language, or a durable team fallback from this command.

## Main Flow

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json` to resolve `FEATURE_DIR` and prerequisites without task writes, then enter `tasks` through the deterministic workflow transition. The CLI owns phase state; keep implementation blocked until this task-generation stage completes.
2. Read `plan-contract.json` first, reuse its context capsule and referenced spec obligations, and open project-facing or live files only for named required references or stale evidence.
3. Preserve complete-first scope and map every `CA-###`, `MP-*`, preserved create/scaffold or other capability operation, reference-fidelity item, and user-observable UI/TUI/CLI/API/runtime path before finalizing `tasks.md`. Every UI-bearing task—not only screenshot-driven work—materializes the exact current object referenced by `.specify/templates/task-index-template.json#/ui_contract_schema_ref` from `.specify/templates/task-packet-template.json#/ui_contract`, then renders Design Quality Coverage plus compact per-task `Scope Boundaries` and `UI Implementation Contract` projections: work/surface/platform types, subject/audience/job, three theses, signature, approved visual ref, task-relevant reference/content/image records, `fidelity_level`, states, must-preserve/adapt/not rules, `required_evidence`, difference inventory, accepted deviations, and real-entrypoint proof under `real_entrypoint_evidence`. Required evidence includes `structure_snapshot`, `visual_capture`, `runtime_diagnostics`, and comparison/human review; synthetic component proof is insufficient.
4. Use `choose_subagent_dispatch(command_name="tasks", snapshot, workload_shape)` only for isolated task-generation lanes. When lanes are delegated, write one `task-generation/lane-manifest.json` plus one result per lane under `task-generation/handoffs/`; do not duplicate the same events into evidence-index and checkpoint logs.
5. Use task-index.json as the canonical task graph for standard/heavy and every UI-bearing task set, then render `tasks.md`; only light non-UI leader-direct work may remain a compact `tasks.md`. Do not pre-generate a full worker packet for every task. Record enough task shape for `sp-implement` to compile delegated packets just in time from the current repository state.
6. Run deterministic task-graph validation for coverage, dependency cycles, write-set safety, acceptance, and verification. Use agent review only when ambiguity or high-risk judgment remains; repair task-layer defects or escalate when upstream truth is missing.
7. Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify hook validate-artifacts --command tasks --feature-dir <feature-dir> --format json`, repair or reopen the owning upstream phase on failure, and hand off directly to `$sp-implement` only after a clean result and `next_command: /sp.implement`.

Do not edit production source or tests, migrations, or runtime configuration. This stage owns only the executable task graph and its task-generation evidence; implementation begins only in a separately invoked `$sp-implement` workflow.

## Detailed References

Read [Reference index](references/INDEX.md) before applying detailed contracts.

- [plan intake](references/plan-intake.md)
- [task generation sequence](references/task-generation-sequence.md)
- [task packet schema](references/task-packet-schema.md)
- [dependencies and parallel safety](references/dependencies-and-parallel-safety.md)
- [must preserve ledger](references/must-preserve-ledger.md)
- [review and repair](references/review-and-repair.md)

## Codex Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Preserve this workflow's existing packet, handoff, artifact, and result schema; this section only governs capability discovery before dispatch or blocked-state recording.

## Project Cognition Freshness Closeout

- This workflow is artifact-only unless the user explicitly requested source/runtime/template/config/test/generated-asset changes; do not call `project-cognition mark-dirty`, `project-cognition complete-refresh`, or `project-cognition validate-build --format json` just because `sp-specify`, `sp-plan`, or `sp-tasks` wrote planning artifacts.
- If this planning workflow makes actual source/runtime/template/config/test/generated-asset changes in the current run, it stops being artifact-only for closeout: run inline project cognition update from the workflow-owned changed paths and affected surfaces.
- Git-baseline freshness only changes after source/runtime/template/config/test/generated-asset changes are recorded; planning-only artifact edits do not require `project-cognition complete-refresh`, and manual override/fallback belongs only to an explicit map-maintenance recovery path.
- Inline project cognition update uses `project-cognition delta append` followed by `project-cognition update --delta-session "$DELTA_SESSION_ID" --reason workflow-finalize --format json` when a delta session exists, or `project-cognition update --payload-file ".specify/project-cognition/updates/<update-id>.json" --reason workflow-finalize --format json` when no delta session exists.
- The payload-file path must include changed_paths, behavior_surfaces, generated_surfaces, state_contracts, verification, known_unknowns, and confidence_notes so the update is equivalent to `sp-map-update`, not just a path stamp; `verification_evidence` and `generated_surface_notes` are accepted compatibility aliases.
- Use `known_unknowns` only for blockers that make the cognition update unsafe to trust. If unrelated dirty or untracked working-tree paths were excluded by explicit workflow-owned paths, record that as `confidence_notes` or `boundary.initial_dirty_paths`, not as blocking `known_unknowns`.
- clean closeout keys on `result_state`, not `update_id`, `last_update_id`, or freshness alone. Treat `ready` and `no_op` as clean, `partial_refresh` as recorded but not fully clean, `needs_rebuild` as a map-scan/map-build route, `blocked` as blocked, and `recorded` as legacy recorded-only output that is never clean completion.
- Use `project-cognition mark-dirty --reason "<reason>" --format json` only when inline update cannot complete.
- `sp-map-update` is for manual/external maintenance and follow-up repair, not routine cleanup for changes this workflow just made; run `/sp-map-scan` followed by `/sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`.

## Codex Adaptive Dispatch

When running `sp-tasks` in Codex, apply the adaptive dispatch decision recorded by `choose_subagent_dispatch`.
- Light mode records `dispatch_shape: leader-inline` and `execution_surface: leader-inline`; do not spawn task-generation lanes for light work.
- Standard mode uses `spawn_agent` for bounded lanes when `dispatch_shape` is `one-subagent` or `parallel-subagents`.
- Standard native-unavailable degradation records `execution_surface: leader-inline` and `capability_degraded: true` only when no high-risk trigger is present.
- Heavy or safety-critical blocked work records `dispatch_shape: subagent-blocked` and `execution_surface: none` with `blocked_reason`.
- Launch all independent lanes in the current `parallel-subagents` wave before waiting.
- Suggested bounded lanes include story and phase decomposition, dependency graph analysis, and write-set or parallel-safety analysis.
- Use `wait_agent` only at the documented join points before writing `tasks.md` and before emitting canonical parallel batches and join points.
- Use `close_agent` after integrating finished subagent results.
