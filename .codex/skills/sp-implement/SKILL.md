---
name: "sp-implement"
description: "Use when tasks.md exists and the planned work should be executed through the tracked implementation workflow."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/implement.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: `tasks.md` is ready and the feature should move from planning into tracked execution batches.
- **Primary objective**: Execute the ready batches while preserving tracker state, subagent contracts, verification discipline, and resumability.
- **Primary outputs**: Verified code, test, and documentation changes plus compact execution state, one task lifecycle record per executed task, conditional drift/repair records, and `implementation-handoff.json` for mandatory system review.
- **Default handoff**: Continue with the next ready batch, route blockers into /sp-debug, or after technical closeout hand the integrated product to /sp.review and stop.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

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

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Advance the current feature through tracked implementation batches while keeping execution state, subagent work, verification evidence, and recovery paths explicit.

## Context

- Primary inputs: canonical `task-index.json` or the light leader-direct task list, current execution state, the current task's required refs, and live repository evidence for the touched area. The full plan/spec package is fallback evidence, not default intake.
- The leader owns tracker truth, execution strategy, join points, blocker handling, and final validation.
- Delegated workers own bounded implementation lanes only; they do not own the overall implementation state.
- One validation-epoch ledger is shared across Implement and Review and bound to
  source fingerprints. The combined workflow may consume at most three
  heavyweight epochs; do not reset the count at phase handoff or resume.


## Codex Project Cognition Advisory Gate

**Current-Task Navigation Repair**: Reuse the current task's required refs and live touched-area evidence. Only when a required ref is stale, missing, or contradicted by live code, run at most one `C:\Users\11034\.specify\bin\project-cognition.exe compass --intent implement '--query="$ARGUMENTS"' --format json` before any implementation actions. Read and carry `epistemic_contract`; require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`. The contract cannot authorize source changes and cannot prove current behavior; contradictory live evidence overrides the route candidate. Graph claims are indexed assertions; even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth. Graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`; bounded live evidence and the separate workflow final-claim gate remain required. Use `compass_state`, `minimal_live_reads`, `first_pass_paths`, `coverage_diagnostics`, and `expansion_ref` only to repair current-task context; they do not replace live proof or authorize broader implementation scope.
- Read and carry `epistemic_contract`; require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`. The contract cannot authorize source changes and cannot prove current behavior; contradictory live evidence overrides the route candidate. Graph claims are indexed assertions; even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth. Graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`; bounded live evidence and the separate workflow final-claim gate remain required.
- Route every Compass packet by `recommended_next_action.action_id`, never by readiness alone. `query_ready` reads top-level `minimal_live_reads` first and then lane-level `first_pass_paths`; `review` permits only returned `minimal_live_reads` plus `coverage_diagnostics`; `needs_rebuild` may carry a resumable non-rebuild action such as `complete_scan_packets`, which must be preserved. Only `action_id=project_cognition.rebuild` may consume `rebuild_reasons[]` and the canonical Classic steps in `recommended_next_action.workflow_routes.classic.steps`; `action_id=project_cognition.repair_status` must run its returned `argv`. `blocked` reports the runtime issue as advisory map state and continues with live repository evidence unless the user's request is to repair cognition; `unsupported_runtime` continues with live evidence and records that compass intake was unavailable. If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements instead of inferring rebuild from absent graph paths.
- Use `map-update` for ordinary existing-baseline gaps. If `baseline_kind=greenfield_empty`, do not recommend map-scan -> map-build solely because the graph has no paths; continue with workflow artifacts and live requirements. Use `map-scan -> map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`.
- Treat the project cognition compass packet as advisory navigation for brownfield context; do not fall back to chat memory or ad hoc repository instincts when compass-backed runtime coverage should guide the route.
- Treat this as advisory navigation, not a hard gate; continue with live repository evidence when the bundle is weak, stale, or missing, and use map maintenance only when it is actually useful.
- Mutation closeout is separate from entry routing: entry stale may continue, but workflow-owned mutation closeout is not an external map-maintenance handoff. If the workflow changes source/runtime truth-owning surfaces, shared surfaces, command/route/contract boundaries, verification entry points, runtime assumptions, or other project-related behavior surfaces, final state must run inline project cognition update from changed paths, affected surfaces, and verification evidence.
- Inline project cognition update uses `C:\Users\11034\.specify\bin\project-cognition.exe delta append --help` followed by `C:\Users\11034\.specify\bin\project-cognition.exe update --delta-session '"$DELTA_SESSION_ID"' --reason workflow-finalize --format json` when a delta session exists, or `C:\Users\11034\.specify\bin\project-cognition.exe update --payload-file '".specify/project-cognition/updates/<update-id>.json"' --reason workflow-finalize --format json` when no delta session exists.
- The payload-file path must include changed_paths, behavior_surfaces, generated_surfaces, state_contracts, verification, known_unknowns, and confidence_notes so the update is equivalent to `sp-map-update`, not just a path stamp; `verification_evidence` and `generated_surface_notes` are accepted compatibility aliases.
- Use `known_unknowns` only for blockers that make the cognition update unsafe to trust. If unrelated dirty or untracked working-tree paths were excluded by explicit workflow-owned paths, record that as `confidence_notes` or `boundary.initial_dirty_paths`, not as blocking `known_unknowns`.
- clean closeout keys on `result_state`, not `update_id`, `last_update_id`, or freshness alone. Treat `ready` and `no_op` as clean, `partial_refresh` as recorded but not fully clean, `needs_rebuild` as a map-scan/map-build route, `blocked` as blocked, and `recorded` as legacy recorded-only output that is never clean completion.
- Use `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty --reason '"<reason>"' --format json` only when inline update cannot complete. Dirty only when inline update cannot complete.
- `sp-map-update` is for manual/external maintenance and follow-up repair after user edits, interrupted workflows, or explicit operator map-maintenance requests. It is not routine cleanup for changes this workflow just made.
- A project-cognition compass intake is not complete when it returns JSON. It is complete only when readiness drives routing, `minimal_live_reads` constrains inspection, lane-level `first_pass_paths` reasons are considered, and relevant facts are carried into the next workflow artifact or execution state.
- Carry forward only the current task's selected capability, minimal live reads, boundary constraints, required references, validation route, and evidence gaps into its lifecycle record or just-in-time `WorkerTaskPacket`.

## Process

- Recover compact execution state, validate the task-graph revision, and identify the current ready batch.
- If the feature lane is not explicit, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify lane resolve --command implement --ensure-worktree`; use the returned execution context/materialized worktree and stop on `uncertain`.
- Read `FEATURE_DIR/workflow-state.md` when present. If its canonical `next_command` still points to `/sp.analyze`, stop and honor that pending diagnostic gate rather than self-authorizing implementation from chat memory.
- On resume, audit terminal-looking tracker/task state before trusting completion; checked tasks are claims until validation, handoff, join point, and consumer evidence prove them. When `real_entrypoint_evidence` is required, synthetic-only consumer proof is not sufficient.
- Carry every `CA-###` consequence obligation from packets into dispatch, implementation evidence, result acceptance, tracker open gaps, and stop-and-reopen routing.
- Choose leader-direct or delegated execution. Compile and validate a WorkerTaskPacket just in time only for delegated work; do not require packets for leader-direct tasks.
- Integrate worker results into one task lifecycle record with cheap task checks,
  test impact, shared validation-epoch refs, review verdict, blockers, and
  recovery; keep execution truth current without duplicating task briefs,
  review packages, and ledgers. A worker must not run a heavyweight test, full
  build, server startup, E2E journey, or browser capture per Txx. The Leader
  groups those gates into a validation epoch for the current change-set.
- Continue automatically until the feature is complete or blocked by a real blocker.

## Output Contract

- Produce verified implementation changes plus updated compact execution state for the active feature.
- Keep one task lifecycle record per executed task aligned with what actually happened. Additional review or repair records are event-triggered rather than mandatory for every batch.
- Report blockers, retries, and completion honestly rather than inferring success from partial progress.
- On successful technical closeout, create the deterministic `implementation-handoff.json` from accepted task lifecycle evidence, actual changed paths, official real entrypoints, required system-review scenarios, and the validation-epoch ledger with its consumed count and remaining budget. Revalidate it against the live Spec, Plan, and Tasks, then carry their exact complete `acceptance_refs` denominator, `acceptance_denominator_sha256`, and frozen Human Acceptance Universe (`human_acceptance_obligations`, `human_acceptance_scenarios`, and `human_acceptance_contract_sha256`) forward unchanged; never omit an item, downgrade `required`, reconstruct the contract from prose, or reset the epoch count. Implement must not create, infer, or prefill `reviewed_runtime_targets`; only Review creates those targets from final integrated evidence. Update owned rich `workflow-state.md` evidence/resume fields truthfully, then run the workflow runtime `complete-stage` command with the current revision. It records `implement/completed` only in CLI-owned `workflow-runtime.json`; it does not update rich state fields. Hand off to `$sp-review`. This is the mandatory post-implement stage; do not set rich state to `active_command: sp-review` early, execute the returned transition, or continue into Review in the same invocation.
- For any blocked, approval-gated, timeout-gated, or nonzero-verification exit, include an **Actionable Blocker Resolution** section instead of a bare blocked summary. It must name each blocker, `owner: agent | user | maintainer | external-system`, `exact_next_action`, `approval_question` when human approval is the next step, artifact or log evidence, `unblock_criteria`, and whether the rest of implementation can continue.
- Do not leave the user to infer whether to handle the blocker. Say whether the blocker is mandatory for completion, optional cleanup, external baseline maintenance, or a follow-up risk, and name the next command or approval decision when one is known.
- Preserve any `MP-*` obligations carried in task packets, implementation state, or result handoff expectations.
- Worker result handoffs must include must-preserve evidence when packet obligations require it.
- If implementation discovers a conflict with an `MP-*` obligation, return a blocked result instead of silently changing the protected discussion decision.

## Guardrails

- Do not dispatch from raw task text alone; compile and validate the packet first.
- Do not bypass tracker truth, result handoffs, or verification gates.
- Do not let a passive testing skill, worker, join, resume, task transition, or
  completion claim start an extra validation epoch. A third failed epoch blocks
  with exact evidence and resume criteria; never start a fourth.
- Do not declare completion because tasks look checked off if the implementation contract is not actually satisfied.
- Do not treat the later system Review as a dumping ground. Complete known entrypoint and consumer wiring during implementation; Review is an independent integrated proof-and-repair gate.

## Senior Consequence Analysis Gate

Run this gate whenever the request, artifact set, defect, or planned change can affect lifecycle operations, running objects, concurrent work, destructive behavior, shared state, downstream consumers, compatibility, security-sensitive behavior, or multiple plausible product behaviors.

Also trigger it for a new or changed entry point over an existing operation, a direct/background/headless/system entry point, or a changed consumer or interaction owner. Build the result inventory from current result/error definitions, existing consumers, state transitions, tests, and UI/window/request/retry owners. Reusing an executor proves operation reuse; it does not prove that the new consumer preserves every terminal, recoverable, partial, cancelled, or user-input-required outcome.

Project cognition first. Use the project cognition runtime to identify ownership, consumers, state surfaces, change-propagation facts, verification routes, conflicts, known unknowns, and coverage gaps. Senior consequence analysis second. Turn those facts into explicit product and implementation obligations instead of treating the graph as the decision-maker.

Project cognition readiness provides navigation state; route recovery by `recommended_next_action.action_id`. If readiness is `query_ready`, read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons. If readiness is `review`, inspect the returned `minimal_live_reads` before continuing and treat `coverage_diagnostics` as confidence and closeout signals. If readiness is `needs_rebuild`, preserve resumable non-rebuild actions such as `complete_scan_packets`; only `action_id=project_cognition.rebuild` may consume `rebuild_reasons[]` and `recommended_next_action.workflow_routes.classic.steps` as a rebuild handoff. That rebuild route remains reserved for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`. If readiness is `blocked`, report the blocked state and continue with live repository evidence unless the user's actual request is to fix cognition runtime state. If readiness is `unsupported_runtime`, continue with live evidence and record that compass intake was unavailable. If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements; do not recommend map-scan -> map-build solely because the graph has no paths. Carry relevant project cognition facts, returned `minimal_live_reads`, inference notes, and coverage gaps into the workflow's artifacts or durable state, but back consequence claims with live code, tests, scripts, configuration, or authoritative docs. Mutation closeout is separate from entry routing: entry stale may continue, but that does not allow source/runtime mutation workflows to defer closeout. Workflow-owned mutation closeout is not an external map-maintenance handoff; after changing project-related files or behavior, the workflow must run inline project cognition update from its changed paths, affected surfaces, and verification evidence, with `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty` only as fallback when inline update cannot complete. `sp-map-update` is for manual/external maintenance and follow-up repair; it is external map maintenance, not routine closeout for this workflow's own changes. In shared routing summaries, sp-map-update is for manual/external maintenance and ordinary existing-baseline gaps.

Required output when the gate triggers:

- **Affected Object Map**: name each object, record, worker, queue, artifact, command, API, file surface, user-visible state, or downstream consumer that can be affected.
- **State-Behavior Matrix**: describe behavior for each important lifecycle state, including created, queued, running, paused, failed, cancelled, completed, resumed, archived, missing, stale, or partially refreshed states when relevant.
- **Dependency Impact Table**: map direct dependencies, indirect consumers, shared state, compatibility surfaces, validation routes, and adjacent workflows that can break if semantics change.
- **Recovery And Validation Contract**: state rollback, retry, idempotency, cleanup, migration, observability, and validation evidence required before handoff or completion.
- **Coverage Gaps**: list what project cognition or live evidence cannot prove, who must resolve each gap, the latest safe resolve phase, the stop-and-reopen condition, and the routing decision: current workflow may continue with an assumption, must ask the user, must route to clarification or deep research, or must request map maintenance.
- **Consequence Obligations**: assign stable `CA-###` IDs to every obligation that must survive downstream handoff, task generation, worker packets, verification, or debug closeout. Each `CA-###` must include claim, affected objects, owner workflow, latest resolve phase, status, and stop-and-reopen condition.
- **Entrypoint Outcome Contract**: when the entry-point trigger applies, persist `entrypoint_outcome_contract` in `spec-contract.json`. Keep live-evidence-backed result inventory separate from product dispositions, and map every preserved or adapted outcome to acceptance refs and `CA-###` consequence refs. Plan and Tasks consume those CA refs through the existing consequence chain; do not create a parallel outcome ledger downstream.

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

[AGENT] For project-cognition-backed semantic intake, routing, audit, resume, or final-claim gates, read `references/semantic-work-contract.md`.

## Main Flow

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` to resolve the task-bearing feature context, then read canonical `task-index.json` or the light leader-direct task list, compact execution state, and current branch/worktree status. Load the current task plus its required refs; do not ingest the full upstream package when revisions are unchanged.
2. Validate the task-graph revision and current ready batch. Compile delegated WorkerTaskPackets just in time from live code. Group behavior-changing Txx items into one coherent change-set, establish its RED/baseline through the Leader-owned validation-epoch contract, and do not claim completion from chat narration.
3. Use `choose_subagent_dispatch(command_name="implement", snapshot, workload_shape)` for safe worker lanes, use the current integration's native subagent lifecycle where available, and keep leader ownership of tracker state.
4. Execute the current task or ready batch, update tracker fields, resolve blockers through bounded repair, and route unknown root cause to `$sp-debug`.
5. Run event-triggered review for repository drift, parallel joins, write-scope drift, validation failure, worker concerns, obligation conflicts, or sequential change-window limits. Maintain one task lifecycle record containing packet/ref, result, cheap task checks, shared validation-epoch refs, review verdict, and recovery; report completion only when changed paths, validation evidence, review status, and mutation closeout are complete.
6. Persist one validation-epoch ledger shared across Implement and Review. The
   combined workflow permits at most three heavyweight epochs against explicit
   source fingerprints: an optional change-set RED/baseline, Implement
   convergence, and integrated Review/final revalidation. A failed epoch may be
   repaired only when a later epoch remains; the third failed epoch blocks, and
   no agent may reset the ledger or ever start a fourth. Per-Txx workers run only
   cheap task checks and return test impact; the Leader owns every heavyweight
   test, build, startup, E2E, and real-entrypoint epoch.
7. For UI work, preserve task-local design inputs, states, changed surfaces, and
   capture requirements, but do not run the full viewport/state capture loop per
   Txx. Group the matrix by integrated surface and capture typed
   `structure_snapshot`, `visual_capture`, and `runtime_diagnostics` evidence
   with `evidence_scope: integrated` in a Leader-owned epoch. Bind the applicable
   shared evidence refs into each task lifecycle's `ui_verification`; this is
   evidence reuse, not permission to recapture or rerun the matrix per task. Unavailable
   objective comparison remains `pending-human-review`, never an implicit pass.
   Route an invalid, bootstrap, or missing design source to `sp-design` instead
   of inventing one.
8. After successful technical closeout, require the `implementation_summary` and `implementation_handoff` response fields for the preliminary `implementation-summary.md` and deterministic `implementation-handoff.json`, including the unchanged validation-epoch ledger and remaining budget. The summary must explain what changed, how to verify it, and what differs from the previous version using the recorded `git diff --stat` and `git diff --name-status` baseline. Complete only the `implement` stage, recommend `$sp-review`, and stop. The embedded event-triggered task review remains part of implementation, while `sp-review` spends the remaining shared epoch budget to prove startup, user journeys, interaction, and integrated wiring from real entrypoints. Do not invoke Review inline or claim that task completion equals a usable reviewed product.

### Inline Project Cognition Update

Workflow-owned mutation closeout is not an external map-maintenance handoff and is not external map maintenance. It is the workflow-local form of `$sp-map-update`. If this workflow changed project-related source, runtime, templates, generated assets, config, tests, state contracts, shared surfaces, or behavior-bearing docs, closeout MUST run inline project cognition update for the workflow-owned changed paths and affected surfaces before claiming clean completion.

Call the planner first:

```text
C:\Users\11034\.specify\bin\project-cognition.exe closeout-plan --workflow '"$ACTIVE_WORKFLOW"' --format json
```

When `DELTA_SESSION_ID` exists, pass it into the planner:

```text
C:\Users\11034\.specify\bin\project-cognition.exe closeout-plan --workflow '"$ACTIVE_WORKFLOW"' --delta-session '"$DELTA_SESSION_ID"' --format json
```

Consume `workflow_canonical`, `update_mode`, `payload_draft`, `required_agent_fields`, `unknown_paths`, `unknown_path_dispositions`, `delta_append_draft`, display-only `delta_append_command`, `update_argv`, display-only `update_command`, and `recommended_next_command`.

Before running `update`, fill the fields listed in `required_agent_fields` from live evidence from this workflow. Supported agent-owned evidence fields include:

- `verification`
- `behavior_surfaces`
- `generated_surfaces`
- `state_contracts`
- `known_unknowns`
- `confidence_notes`
- `user_decisions`
- `boundary`

If a field appears in `required_agent_fields`, provide live-evidence-backed content for it. Fields not listed by `required_agent_fields`, such as `known_unknowns` and `boundary`, are populated only when live evidence supports them; do not invent them to satisfy the shape.
Use `known_unknowns` only for blockers that make the cognition update unsafe to trust. If the working tree contains unrelated dirty/untracked paths and the workflow uses explicit workflow-owned paths, record that as `confidence_notes` or `boundary.initial_dirty_paths`, not as a blocking `known_unknowns` item.

For each `unknown_path_dispositions[]` item, set `agent_disposition` to exactly one allowed value:

- `adoptable`: verified new path inside this workflow-owned scope; it may be recorded in changed/scope paths and verified adoptable paths do not become blocking `known_unknowns`.
- `review_only`: path informed review but is not adopted into changed coverage.
- `ignored`: path remains excluded and must not enter payloads, records, route indexes, evidence, aliases, or minimal live reads.
- `blocking_known_unknown`: record it as a known unknown and report partial or blocked cognition closeout.

`agent_disposition=adoptable` is an agent accounting decision, not proof that runtime indexing already succeeded. Runtime adoption still requires a usable active project-cognition DB, at least one passing verification evidence item, and no blocking `known_unknowns`. After `update_argv` runs, inspect `result_state`, `adopted_paths`, `review_paths`, `minimal_live_reads`, and `partial_refresh_reasons`; do not explain a remaining `partial_refresh` as "path_index missing" until those fields show which adoption gate failed.

If `update_mode=delta_session`, complete `delta_append_draft.argv_prefix` with agent-owned repeatable flags such as `--behavior-surface`, `--generated-surface`, `--verification`, and accepted `--known-unknown` values from `delta_append_draft.argv_placeholders`. Then append the delta event and run `update_argv`. `delta_append_command` and `update_command` are display-only placeholders, not execution strings.

If `update_mode=payload_file`, write the completed `payload_draft` to the planner's `payload_path`. Then run `update_argv`. `update_command` is a display-only placeholder, not an execution string.

Completed payload drafts preserve the planner-owned `changed_paths` and `scope_paths` and add agent-owned evidence fields before recording.

Structured `update` invalidates related claims and returns their stable IDs in `affected_graph_claims`. This is separate from update readiness: generic workflow verification and `result_state=ready` must not re-promote stale or contradicted graph claims. Only when this workflow already has decisive claim-specific bounded live evidence for an exact returned claim ID may it submit semantic reconciliation intent and run:

```text
C:\Users\11034\.specify\bin\project-cognition.exe claim-reconcile prepare --input '<intent.json>' --format json
C:\Users\11034\.specify\bin\project-cognition.exe claim-reconcile apply --input '<prepared_packet_path>' --format json
```

Provide only reconciliation intent: workflow, stable `claim_id`, reason, and evidence containing repository-relative `source_path`, bounded line `span`, and `supporting` or `contradicting` role. Add verification only when it is claim-specific. The runtime owns the contract version, active generation, expected state and revision, UTC observation and expiry, source kind, content hashes, repository snapshot, IDs, and prepared packet path. Do not author or edit those integrity fields; execute the returned `apply_argv` exactly. If no such evidence exists, leave the claim stale. If reconciliation returns ready, rerun Compass once so later routing consumes the current evidence basis; partial or blocked reconciliation remains withheld and follows `recommended_next_action`.

For compatibility with worker handoffs and delta packets, the runtime also accepts `verification_evidence` as an alias for `verification` and `generated_surface_notes` as an alias for `generated_surfaces`. Verification evidence may be an array of objects (`command`, `result`, `artifact`) or an array of command-result strings, but clean closeout still requires passing verification evidence; failed verification cannot produce a clean `ready` closeout.

Clean closeout keys on `result_state`, not `status=ok`, `update_id`, `last_update_id`, or freshness alone:

- `ready` or `no_op`: project cognition closeout may be clean when ordinary verification also passed.
- `partial_refresh`: useful update data was written, but the final workflow state must report partial cognition closeout, `partial_refresh_reasons`, and the returned `minimal_live_reads`. If `partial_refresh_reasons` includes `missing_passing_verification_result`, repair the payload or delta evidence and rerun `update_argv` before final closeout; do not route that to `sp-map-update`. If verified workflow-owned paths still remain in `review_paths` after the update, report implementation completion separately from project-cognition maintenance and name `$sp-map-update` as follow-up repair.
- `needs_rebuild`: report the exact rebuild condition and route to `$sp-map-scan`, then `$sp-map-build`.
- `blocked`: report the runtime or validation blocker and the exact recovery command.
- `recorded`: legacy recorded-only output; treat it as partial or blocked, never as clean completion.

Never run the `complete-refresh` or `clear-dirty` helper after `result_state=partial_refresh`, `needs_rebuild`, `blocked`, or legacy `recorded`; those helpers are only for states that the runtime and validation prove ready.

Dirty fallback command shape: `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty --reason '"<reason>"' --format json`.
Use `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty --reason '"workflow-closeout-failed"' --format json` only when inline update cannot complete: when the planner or update command is unavailable, cannot record useful update data, cannot identify workflow-owned scope, or cannot be trusted because verification/workflow completion is not trustworthy. Dirty only when inline update cannot complete.

sp-map-update is for manual/external maintenance and follow-up repair. `$sp-map-update` remains the external/manual workflow for user edits, interrupted workflow repair, explicit map maintenance, and follow-up repair. It is not routine cleanup for changes this workflow just made. If `sp-map-update` already ran `C:\Users\11034\.specify\bin\project-cognition.exe update --reason map-update` for the same changed paths, do not run a second `workflow-finalize` closeout update for those paths.

## Detailed References

Read [Reference index](references/INDEX.md) before applying detailed contracts.

- [task intake and tracker](references/task-intake-and-tracker.md)
- [red first and validation](references/red-first-and-validation.md)
- [subagent worker contract](references/subagent-worker-contract.md)
- [join point review](references/join-point-review.md)
- [safe repair loop](references/safe-repair-loop.md)
- [final reconciliation and closeout](references/branch-review-and-closeout.md)

## Codex Leader Gate

When running `sp-implement` in Codex, you are the leader and own route selection, execution-state truth, acceptance, and recovery.

**Current-Task Navigation Repair**: Reuse the current task's required refs and live touched-area evidence. Only when a required ref is stale, missing, or contradicted by live code, run at most one `C:\Users\11034\.specify\bin\project-cognition.exe compass --intent implement '--query="$ARGUMENTS"' --format json` before any implementation actions. Read and carry `epistemic_contract`; require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`. The contract cannot authorize source changes and cannot prove current behavior; contradictory live evidence overrides the route candidate. Graph claims are indexed assertions; even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth. Graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`; bounded live evidence and the separate workflow final-claim gate remain required. Use `compass_state`, `minimal_live_reads`, `first_pass_paths`, `coverage_diagnostics`, and `expansion_ref` only to repair current-task context; they do not replace live proof or authorize broader implementation scope.

Before implementation actions:
- Read canonical `task-index.json` or the light direct task list, compact execution state, and the current task's required refs.
- **Resume Audit**: If the tracker is `resolved`, all tasks appear checked, or the previous session exit is unknown, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify implement resume-audit --feature-dir '"$FEATURE_DIR"' --format json` before trusting completion.
- Treat completed task markers as claims until changed paths, validation, required consumer evidence, review status, and mutation closeout prove them.
- Choose `leader-direct` for a small or tightly coupled ready task when delegation adds no quality or critical-path benefit and no high-risk trigger calls for an independent lane.
- Choose `one-subagent` for one independent bounded task and `parallel-subagents` only for validated lanes with isolated write sets and an explicit join point.
- Compile and validate a `WorkerTaskPacket` just in time only for delegated work; leader-direct work does not require one.
- If dispatch fails, record the event and re-evaluate route safety. Use leader-direct only if the task independently qualifies; otherwise repair the packet/surface or block truthfully.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Require consumer evidence when a worker creates a reusable UI, route, provider, registry, factory, config, API, or test surface; a created but not wired file is not complete.
- When a packet requires `real_entrypoint_evidence`, require `consumer_evidence` with `kind: real_entrypoint`, `entrypoint`, `producer`, `transformer`, `consumer`, `boundary_or_executor`, and `validation`; synthetic-only component, reducer, helper, or hand-built state evidence is not enough.
- The leader must not edit a delegated lane's write scope while that subagent is active.
- On technical blockers, attempt the smallest safe autonomous recovery or specialist lane before asking for manual intervention.

## Codex Subagent Dispatch Contract

- Execution model: `adaptive`
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`
- Delegation surface contract: preserve the native dispatch, fallback, worker result contract, and handoff path below.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Managed-team fallback: No in-command team fallback for `sp-implement`; if subagents cannot proceed safely, stay on the leader path and record why.
- Leader-direct route: valid for a small or tightly coupled task when it independently passes the workflow safety gate; record the selected route in the current lifecycle record.
- Worker result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result handoff path: .specify/teams/state/results/<request-id>.json

## Codex Subagent Result Contract

- Worker result contract: preserve the shared `WorkerTaskResult` semantics even when the runtime calls lanes subagents.
- Preferred result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result file handoff path: .specify/teams/state/results/<request-id>.json
- Runtime-managed result paths require a dispatch request id; compute the path with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify result path --command implement --request-id '<request-id>'` and report final completion through the active runtime-managed result channel for that request id.
- `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify result path --help` documents a JSON-only command; do not append `--format`.
- Normalize subagent-reported statuses like `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, and `NEEDS_CONTEXT` into the shared `WorkerTaskResult` contract before the leader accepts the handoff.
- Keep `reported_status` when normalization occurs so runtime-specific subagent language can be reconciled with canonical orchestration state.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Treat `DONE_WITH_CONCERNS` as completed work plus follow-up concerns, not as silent success.
- Treat `NEEDS_CONTEXT` as a blocked handoff that must carry the missing context or failed assumption explicitly.

## Codex Adaptive Execution

When running `sp-implement` in Codex, choose the lightest safe route for the current ready task.

**Route Scenarios**:
1. **Leader-direct**: one small or tightly coupled task, no useful parallel lane, bounded write scope, and no high-risk review trigger.
2. **One delegated lane**: one independent bounded task whose specialist focus or context isolation materially improves quality. Compile one packet just in time, then use `one-subagent`.
3. **Parallel delegated lanes**: multiple ready tasks with exact isolated write sets and a defined join validation. Compile only the selected packets, then use `parallel-subagents`.
4. **Durable team state**: use `managed-team` only when coordination must outlive one in-session wave.
5. **Blocked**: if the selected safe route is unavailable and leader-direct is not independently safe, record the blocker and recovery instead of forcing execution.

For delegated waves:
- Use Codex's `native-subagents` lifecycle when available.
- Fixed runtime budget: `max_parallel_subagents = 4`.
- Use `spawn_agent` for at most four validated isolated lanes, `wait_agent` at the explicit join, and `close_agent` after results are integrated.
- Launch the selected parallel wave before waiting; never merge lanes with overlapping writes merely to fill capacity.
- Re-check route safety after drift, dispatch failure, and every join. Run event-triggered review when the recorded review triggers fire.
- Continue automatically from the smallest ready task until the confirmed scope is complete or genuinely blocked.
