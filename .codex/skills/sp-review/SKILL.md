---
name: "sp-review"
description: "Use when sp-implement has completed and the integrated product must be started, exercised, repaired, and proven usable from real entrypoints before human acceptance."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/review.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: `implementation-handoff.json` exists, the deterministic workflow runtime is ready to transition from `implement` to `review`, and the integrated product needs system-level verification and repair.
- **Primary objective**: Review the implemented software as an operable product, find broken startup, interaction, registration, and end-to-end wiring, repair understood in-scope defects, and revalidate the exact affected paths.
- **Primary outputs**: A fresh approved `review-state.json`, integrated evidence under `review-evidence/`, resolved or routed findings, and a final implementation summary plus Review-to-Accept handoff bound to the reviewed implementation fingerprint and runtime identity basis.
- **Default handoff**: Continue the Leader-owned Review Universe through independent audit, Fix, join, and revalidation waves while the shared validation-epoch budget remains; approve only from fresh integrated proof, block when the third epoch fails, hand only proven truth gaps upstream, then hand human product acceptance to /sp.accept and stop.
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

Prove that the integrated implementation is an operable product from its official real entrypoints, repair bounded implementation defects, and preserve enough evidence to resume or make the final review claim honestly.


## Codex Project Cognition Advisory Gate

**Crucial First Step**: You MUST use project cognition compass first: run `C:\Users\11034\.specify\bin\project-cognition.exe compass --intent implement '--query="$ARGUMENTS"' --format json` before any system review, repair, or revalidation actions. Read and carry `epistemic_contract`; require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`. The contract cannot authorize source changes and cannot prove current behavior; contradictory live evidence overrides the route candidate. Graph claims are indexed assertions; even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth. Graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`; bounded live evidence and the separate workflow final-claim gate remain required. Read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons, `verification_hints`, `followup_surfaces`, and `before_fix_claim`; treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates. Treat `expansion_ref` as a normal continuation path and run `C:\Users\11034\.specify\bin\project-cognition.exe expand --id '<id>' --section '<section>' --format json` only when coverage state or live evidence requires more map detail. Do not infer final edit scope from `minimal_live_reads` or `first_pass_paths`. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. When `compass_state=needs_semantic_intake`, write `semantic_intake` from project vocabulary and rerun compass with `--semantic-intake-file`, or use the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed. Preserve advanced routing through `C:\Users\11034\.specify\bin\project-cognition.exe query --intent implement --query-plan '"<query_plan_json>"' --format json` for precision cases.
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
- Carry forward the selected user journeys, official entrypoints, affected runtime surfaces, minimal live reads, validation routes, and evidence gaps into `review-state.json` or the just-in-time review packet.

## Process

## Intake And Runtime Ownership

- Resolve exactly one feature and inspect `workflow show` before mutation. Transition from completed `implement` to `review` with the runtime-returned revision; do not hand-edit `workflow-runtime.json`.
- Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify review prepare --feature-dir '<feature-dir>' --expected-revision '<revision>' --format json`. Treat `implementation-handoff.json` as the implementation-to-review source contract and `review-state.json` as Review's resumable truth. When `accept route-repair` reopens Review, preparation creates a new cycle bound to the prior approved Review digest and routed acceptance finding; never edit or reapprove the old cycle.
- The Leader owns `review-state.json`, the official runtime instances, ports, test data, finding lifecycle, repair acceptance, and final verdict.
- Continue the validation-epoch ledger shared across Implement and Review. Do
  not reset it on Review entry, resume, or repair-cycle creation. The combined
  flow permits at most three heavyweight epochs bound to source fingerprints.
- The canonical ledger is
  `implementation-review/validation-runs.json`. Before Review work run
  `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify implement validation-status --feature-dir '<feature-dir>' --format json`.
  Before the Leader starts a delivery scenario wave, run
  `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify implement validation-start --feature-dir '<feature-dir>' --stage review --purpose delivery --command '''<cmd>''' '[--command' '''<cmd2>''' ']' '[--task-id' 'T001]' '[--task-id' 'T002]' '[--fingerprint' '<sha>]' --format json`;
  omit `--fingerprint` to bind the current implementation snapshot. Afterward run
  `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify implement validation-finish --feature-dir '<feature-dir>' --run-id '<Vn>' --status '<passed|failed>' --evidence-ref '<ref>' '[--evidence-ref' '<ref2>]' --summary '''<text>''' --format json`.
  Use the runtime-returned ids and budget; never hand-edit the file.
- On resume, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify review resume-audit --feature-dir '<feature-dir>' --format json` when available. Continue from the exact scenario/finding cursor and invalidate evidence whose implementation fingerprint, source revision, or Review cycle is stale. Repair-cycle evidence belongs under `review-evidence/cycle-<n>/` and packet/results under `review-results/cycle-<n>/`; an earlier cycle cannot close the current one.

## System Review Loop

1. Compile the Review Universe and use independent coverage discovery to reconcile authoritative obligations with actual consumer and runtime surfaces.
2. Open the next Leader-owned validation epoch, start each official entrypoint,
   then run a read-only Review/Audit wave whose workers inspect assigned coverage
   slices and return evidence/findings without edits. All commands, scenarios,
   and captures against that fingerprint share the one epoch.
3. The Leader joins all audit packets, rejects stale or incomplete results, resolves coverage gaps, and freezes the accepted finding set.
4. Run a separate Fix wave for accepted findings only when another validation
   epoch remains. Fix workers receive isolated write scopes, run cheap task
   checks, return test impact, and may change implementation/tests but never
   upstream truth or execute heavyweight gates.
5. Join and inspect every repair, then open the next remaining epoch, restart the
   real product, and run an independent revalidation wave. The repair author must
   not verify its own finding.
6. Continue only while budget remains. A source change invalidates prior proof
   and requires another epoch for approval. Never retry a failed command against
   the unchanged fingerprint. The third failed epoch blocks with exact evidence
   and recovery criteria; never start a fourth validation epoch.

UI-bearing scenarios require real-entrypoint `structure_snapshot`, `visual_capture`, and `runtime_diagnostics` evidence with `evidence_scope: integrated`. Group the viewport/state matrix by integrated surface and source fingerprint; do not run the full viewport/state capture loop per Txx. Validate interaction, navigation, loading, empty, error, permission, persistence/reload, responsive, keyboard/focus, console, network, and runtime states when applicable. Automated behavior checks remain distinct from visual and interaction acceptance.

## Delegation

- The Leader orchestrates subagents across the Review/Audit wave, Fix wave, and independent revalidation wave; direct execution is reserved for compact, tightly coupled steps.
- Audit workers are read-only. Fix workers receive finding-bound, non-overlapping write scopes. Revalidation workers are read-only and independent from the repair author.
- Compile each `SystemReviewPacket` just in time from current state and live code. Never dispatch a raw checklist or the entire feature package.
- Serialize paths sharing one browser session, database state, service instance, port, or write set. Integrate worker results before accepting a repair.
- A worker result is evidence only. A worker cannot declare coverage complete or the whole system approved; the Leader owns all joins, zero-uncovered coverage, repair acceptance, and the final verdict after an integrated restart and required regression.
- Workers do not open validation epochs. The Leader may coordinate read-only
  observation slices inside one already-open epoch, but must not let scenario,
  worker, or Txx boundaries multiply heavyweight runs.

## Output Contract

- Keep `review-state.json` fresh and schema-valid with scenario results, findings, repair/revalidation evidence, cursor, blockers, and next action.
- Store evidence under `review-evidence/` and reference it compactly from state; do not paste large logs or screenshots into agent state.
- Before the handoff, verify that `human_acceptance_obligations` and `human_acceptance_scenarios` still cover the frozen Human Acceptance Universe for every new or changed requirement with zero uncovered required obligations. Create `reviewed_runtime_targets` covering every required human scenario, with immutable official entrypoint, environment/instance/configuration, final snapshot, applicable artifact/deployment/version identity, linked Review scenarios, and existing fresh ready evidence. For each target, write the exact runtime identity JSON projection under `review-evidence/` and, for repair cycle 2+, under `review-evidence/cycle-<n>/`; record its feature-relative `identity_evidence_ref` and byte-exact `identity_evidence_sha256`. A `build` or `deployment` target also requires an existing feature-relative product/build `artifact_ref`, created before the final fingerprint, included in the implementation snapshot, outside `review-evidence/`, `review-results/`, and every other snapshot-excluded path, whose current bytes match `artifact_sha256`. Bind the exact target list with `final.runtime_targets_sha256`. Accept receives these targets, preserves both identity-evidence fields read-only, and may add only session readiness/actions.
- After the final integrated restart, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify review validate --feature-dir '<feature-dir>' --format json`, bind its `current_fingerprint` to `final.reviewed_snapshot_sha256`, and only then set Review `status: approved`. Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify review closeout --feature-dir '<feature-dir>' --format json` only after all required scenarios pass, all required evidence is integrated and fresh, and blocking findings are zero.
- On successful Review closeout, update Review-owned rich state truthfully, execute the returned revision-bound `workflow complete-stage` argv separately, hand off to `$sp-accept`, and stop. The Review-to-Accept handoff carries obligations, human scenarios, immutable reviewed targets, and their digest; it does not prefill human PASS. After an acceptance repair, Acceptance reruns every frozen scenario and preserves no old PASS. Do not enter acceptance in this invocation.

## Guardrails

- `sp-review` is not permission to change approved product scope or upstream truth. Every approved-scope defect stays in Review regardless of repair size, including missing code, task omission, and unknown root cause; use a diagnostic packet before a Fix packet when needed.
- Review remains the stage owner through diagnosis, repair, and revalidation. Only a proven requirement truth, design truth, or architecture truth gap may produce an upstream handoff; missing code is not an upstream truth gap.
- Keep the existing event-triggered task review embedded in `sp-implement`; do not duplicate its task lifecycle ledger here.
- Do not claim success because the build passes, tasks are checked, files exist, or a worker says PASS.
- Do not let a passive testing skill, worker, resume, or completion claim start an
  extra epoch. Review must consume only the remaining shared budget.
- Do not push, deploy, modify protected systems, use real customer data, or perform external writes without explicit authority. Use isolated test data and the shared blocker contract for genuine external boundaries.

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

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` to resolve one implemented feature and inspect repository status. Initial Review transitions from validated `implement`; an acceptance repair arrives through CLI-owned `accept route-repair` with `review` already active. Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify review prepare --feature-dir '<feature-dir>' --expected-revision '<revision>' --format json`; stop when the implementation handoff, fingerprint, prior approved Review digest, routed acceptance finding, or revision is missing, stale, or ambiguous. Acceptance repair must create the next immutable Review cycle rather than editing or reapproving the old cycle.
2. Read `implementation-handoff.json`, current `review-state.json`, required acceptance refs, official entrypoints, and only the live source needed for the current scenario. Continue the validation-epoch ledger shared across Implement and Review; do not reset its consumed count on phase entry, resume, worker dispatch, or Review cycle creation. Treat this as the mandatory system review after implementation; retain the embedded task review inside `sp-implement` as a separate task-level control.
3. Compile the bounded Review Universe from authoritative acceptance obligations, official entrypoints, changed consumer surfaces, runtime-discovered controls and registrations, and affected regression paths. Use independent coverage discovery so the handoff scenario matrix is a minimum rather than a blind spot; the Leader owns the zero-uncovered reconciliation. Before executing a heavyweight command or real scenario, open the next Leader-owned validation epoch against the current source fingerprint. The combined Implement/Review workflow permits at most three; scenario slices within that epoch share it rather than incrementing the count.
4. Start the software from every applicable official real entrypoint and wait for its declared ready signal. The Leader orchestrates subagents through an independent read-only Review/Audit wave: compile just-in-time audit `SystemReviewPacket`s with disjoint coverage slices, join every result, reconcile duplicate or missing findings, and forbid audit workers from editing product code or declaring coverage complete. In an acceptance repair cycle, assign the routed observation to an accepted read-only diagnostic Review worker and store all new scenario evidence under `review-evidence/cycle-<n>/` and all packet/results under `review-results/cycle-<n>/`; evidence from an earlier cycle cannot close the new one.
5. Exercise real actions and observable results inside that epoch. Trace button, link, menu, form, command, route, handler, provider, factory, service, persistence or external dependency, and user feedback wiring where applicable. For UI scenarios capture integrated `structure_snapshot`, `visual_capture`, and `runtime_diagnostics` evidence from the real entrypoint once per applicable surface/fingerprint. Do not run the full viewport/state capture loop per Txx.
6. After the audit join, run an independent Fix wave only when a validation epoch remains. The Leader sends bounded Fix workers one or more accepted findings with authoritative expected behavior, isolated write scopes, forbidden truth artifacts, and exact regression obligations. Fix workers run cheap task checks and report test impact; they do not independently start heavyweight verification. Every approved-scope defect stays inside Review regardless of repair size: missing code, a task omission, incomplete tests, broken wiring, and an unknown root cause are not reasons to exit. Use a read-only diagnostic packet for an unknown root cause; Review remains the stage owner and then dispatches the repair itself. If the failed epoch consumed the final slot, preserve the findings and block without an unprovable repair.
7. Join and inspect every repair result, then, only when budget remains, open the next validation epoch, restart the integrated product, and run an independent revalidation wave. A repair author must not verify its own finding; the Leader or a different read-only subagent reruns the exact failed journey, dependent scenarios, and credible regression set against the post-repair fingerprint. That bounded set attributes finding-level revalidation only: after any Fix, approval still requires every required Review scenario and all required evidence against the single final reviewed snapshot in that same epoch. No pre-Fix scenario evidence can satisfy approval. Record the complete accepted Fix-set digest plus an exact byte-bound full-matrix evidence manifest in the final revalidation; partial, missing, extra, or relabeled scenario evidence also blocks approval. The third failed epoch blocks with exact evidence and resume criteria; never start a fourth. Cycle 1 uses the same path, cycle-id, and byte-digest gates as later cycles.
8. Only a proven upstream truth gap may stop Review: requirement truth that is missing or contradictory, design truth that is missing or contradictory, or architecture truth that must change before any correct implementation is possible. Missing code is not an upstream truth gap. After all packets joined and the Review Universe reports zero uncovered obligations and surfaces, create at least one `reviewed_runtime_targets` record for every required Human Acceptance scenario. Bind each target to its official entrypoint, final reviewed snapshot, exact environment/instance/configuration identity, applicable artifact/deployment/version identity, linked Review scenarios, and existing fresh ready-evidence refs. For every target, write an exact identity JSON projection under `review-evidence/` (`review-evidence/cycle-<n>/` in repair cycle 2+) and record its feature-relative `identity_evidence_ref` plus the SHA-256 of its current bytes as `identity_evidence_sha256`. This valid JSON has top-level `version` equal to `1`, `status` equal to `"ready"`, and a `target` object containing exactly `id`, `mode`, `entrypoint_id`, `environment_ref`, `instance_ref`, `configuration_ref`, `reviewed_snapshot_sha256`, `artifact_ref`, `artifact_sha256`, `deployment_id`, `observed_version`, `review_scenario_ids`, and `ready_evidence_refs`, with every value copied exactly from the reviewed target. For `build` and `deployment`, require `artifact_ref` to point to an existing feature-relative product/build file created before the final fingerprint, included in the implementation snapshot, and outside `review-evidence/`, `review-results/`, and every other snapshot-excluded path; `artifact_sha256` must match its current bytes. Compute the final target digest only after these fields are bound. Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify review validate --feature-dir '<feature-dir>' --format json`, bind its current fingerprint, and approve only with fresh cycle-specific integrated evidence and zero blocking findings. Validate the frozen Human Acceptance Universe against the delivered new or changed requirement set. The Review-to-Accept handoff contains the obligations, scenarios, approved runtime targets, identity-evidence fields, and digest; Accept preserves the two identity-evidence fields read-only, may add only session readiness/actions, and never prefills human PASS. Then run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify review closeout --feature-dir '<feature-dir>' --format json`, execute its returned `workflow complete-stage` argv separately, recommend `$sp-accept`, and stop. After an acceptance repair, every human scenario is reset and must be rerun; Review must not preserve a stale human PASS.

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

- [system scenario contract](references/system-scenario-contract.md)
- [subagent review contract](references/subagent-review-contract.md)
- [repair and revalidation](references/repair-and-revalidation.md)
- [final claim and handoff](references/final-claim-and-handoff.md)

## Codex Subagent Dispatch Contract

- Execution model: `subagents-first`
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`
- Delegation surface contract: preserve the native dispatch, fallback, worker result contract, and handoff path below.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`. The Leader joins every Review, Fix, and independent revalidation result before the final verdict.
- Managed-team fallback: The Review Leader must preserve separate audit, Fix, and independent revalidation waves. If no native subagent surface exists, record the coverage blocker rather than silently claiming zero uncovered.
- Leader-inline fallback: record the reason before local execution.
- Worker result contract: Three-wave Review result contract: read-only Review observations and findings, bounded Fix changed files and validation, then independent revalidation evidence; every result is joined by the Leader.
- Result contract: Three-wave Review result contract: read-only Review observations and findings, bounded Fix changed files and validation, then independent revalidation evidence; every result is joined by the Leader.
- Result handoff path: FEATURE_DIR/review-results/<lane-id>.json

## Codex Subagent Result Contract

- Worker result contract: preserve the shared `WorkerTaskResult` semantics even when the runtime calls lanes subagents.
- Preferred result contract: Three-wave Review result contract: read-only Review observations and findings, bounded Fix changed files and validation, then independent revalidation evidence; every result is joined by the Leader.
- Result file handoff path: FEATURE_DIR/review-results/<lane-id>.json
- For filesystem handoffs, use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify result path --help` with the concrete workflow identifiers such as `--feature-dir`/`--task-id`, `--workspace`/`--lane-id`, or `--session-slug`/`--lane-id`.
- The result-path command emits JSON and does not accept `--format`; do not append `--format`.
- Normalize subagent-reported statuses like `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, and `NEEDS_CONTEXT` into the shared `WorkerTaskResult` contract before the leader accepts the handoff.
- Keep `reported_status` when normalization occurs so runtime-specific subagent language can be reconciled with canonical orchestration state.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Treat `DONE_WITH_CONCERNS` as completed work plus follow-up concerns, not as silent success.
- Treat `NEEDS_CONTEXT` as a blocked handoff that must carry the missing context or failed assumption explicitly.
