---
name: "sp-specify"
description: "Use when a new or changed feature request needs guided requirement discovery and a planning-ready specification package."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/specify.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A new or changed feature request needs a planning-ready specification package instead of immediate implementation.
- **Primary objective**: Produce a planning-ready specification contract through discovery for raw requests or semantic-delta compilation for a confirmed discussion contract, followed by deterministic completeness and traceability review.
- **Primary outputs**: Canonical agent-only `FEATURE_DIR/spec-contract.json` plus human/project `FEATURE_DIR/spec.md`; `alignment.md`, `context.md`, `references.md`, and a requirements report only when their triggered content has independent value; `workflow-state.md` remains resume state rather than a handoff.
- **Default handoff**: After user review, recommend exactly one next command: `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.
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

Turn a new or changed feature request into a reviewed, planning-ready specification package through a concise collaborative flow: understand context, clarify one high-impact question at a time, compare approaches, confirm the spec shape, write artifacts, self-review, and ask the user to review before planning.

## Context

- Primary inputs: the user's request for discovery mode, or canonical agent-only `handoff-to-specify.json` for compile mode; current repository context, passive memory, and project cognition are loaded only when the contract lacks fresh evidence for a planning-relevant claim.
- Authoritative output: agent-only `spec-contract.json`. `spec.md` is the project-facing rendering; `alignment.md`, `context.md`, `references.md`, and requirements diagnostics are conditional views with independent value. `workflow-state.md` is resume state, not phase handoff truth.
- This command is specification-only. It is not permission to implement code.

## Process

- Create or resume the feature workspace and `workflow-state.md`.
- Before creating a feature workspace, classify arguments as either a normal feature description or a discussion handoff path/JSON path/slug. If no arguments are supplied, use exactly one unconsumed `status: handoff-ready` discussion whose `next_command` is `/sp.specify` or `sp-specify`; if there are zero or multiple candidates, stop and ask for a feature description or specific handoff.
- For a discussion handoff, require canonical JSON `status: handoff-ready`, `planning_gate_status: ready`, `quality_gate.status: user_confirmed`, matching `quality_gate.confirmed_digest` and `review_digest`, zero hard unknowns, zero open conflicts, and complete protected `MP-*`, `CA-###`, evidence, and settled-decision coverage.
- If a discussion workspace contains `specification-input.md` or looks specification-ready but lacks the ready JSON contract, stop with `blocked_by_handoff_integrity` and route back to `sp-discussion` to write or repair `handoff-to-specify.json`; do not reconstruct it from supporting files.
- Derive the feature description from `handoff_goal` plus the implementation target summary. Do not pass the raw handoff path, JSON path, or slug to the create-feature script as the feature description.
- Explore project context only enough to understand ownership, constraints, adjacent surfaces, and source evidence.
- If invoked from `sp-discussion`, read the canonical contract once, reuse its context capsule and decision digest, and inspect supporting discussion files only when a named evidence reference is stale, missing, or contradictory.
- If invoked from `sp-discussion`, keep the source discussion slug from the contract; after `spec-contract.json` is written and self-reviewed, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify discussion mark-consumed '<slug>' --feature-dir '"$FEATURE_DIR"'` or update the equivalent consumption state.
- Extract every upstream capability-like signal from those sources and assign exactly one disposition: `preserved`, `in_scope`, `deferred`, `dropped`, or `clarification_blocker`.
- Ask one high-impact question at a time when the answer can change scope, acceptance, architecture, compatibility, security, data shape, external integration, or downstream planning.
- Decompose ambiguous terms such as capability, real, usable, works, end-to-end, fetch, probe, health, model, endpoint, integration, auth, `new` command, `<tool> new`, create, scaffold, authoring, template creation, authoring workflow, CLI path, TUI path, `能力`, `真实`, and `可用` before compiling the spec.
- Treat create/scaffold/`new` command/authoring workflow wording as an operation-shaped capability signal. If surface minimization changes the entry point, preserve the capability operation through an explicit TUI route, core API, public CLI command, or user-confirmed deferral; do not downgrade it to manual copy docs or static template-only support without confirmation.

## UI Reference Input

- First classify UI applicability independently of whether the user supplied a
  screenshot. New or changed user-visible screens, components, layouts,
  navigation, interaction flows, responsive behavior, visual states, TUI
  layouts, or CLI presentation are UI-bearing work.
- For substantive UI-bearing work, require `ui-brief.md` even when there is no
  external reference. The leader may compile that brief from approved
  `DESIGN.md`, existing product surfaces, and confirmed experience requirements.
  A narrow copy-only or existing-pattern state fix may record why a separate
  brief adds no decision value and use a precise `spec.md#...` design-contract
  reference as `design_contract.ui_brief_ref`; the UI contract is never omitted.
- Treat `DESIGN.md` with `design_system.status: bootstrap` as not ready for a
  new direction. Route product-wide or high-visibility design decisions to
  `sp-design`; do not inherit its generic starter tokens as product intent.
- Detect screenshots, HTML/CSS mockups, Tailwind/shadcn/React/Vue/Svelte snippets, Figma exports, reference URLs, existing product pages, or matching-language such as "make it like this", "basically the same", "copy this layout", or "use this as the design".
- When UI reference input exists, ask for the fidelity mode unless the user already stated it:
  - `approximate` by default: preserve layout, density, hierarchy, visual rhythm, component structure, and primary interactions.
  - `high`: require visual comparison and deviation notes.
  - `inspiration`: extract principles only and avoid similar-looking output.
- Use `choose_ui_reference_lane_dispatch(command_name="specify", snapshot, workload_shape)` before dispatching UI reference work.
- Record `lane_mode: ui-reference-artifact`, `dispatch_shape`, `execution_surface`, `workflow_status`, `blocked_reason`, and whether inline fallback was user approved.
- The `sp-specify` leader must not directly parse UI references and write the UI contract when UI reference input is present. The leader dispatches and validates the lane.
- The writable UI reference lane may write only `ui-reference-notes.md`, `ui-brief.md`, and optional `ui-target.html` inside the active `FEATURE_DIR`.
- Do not treat this as a read-only evidence lane; source code, tests, app styling, component implementation, package managers, builds, and app servers remain forbidden.
- In discovery mode, present materially different approaches when they change behavior, boundary, compatibility, or acceptance proof. In compile mode, inherit the confirmed approach and emit only its semantic delta.
- Do not repeat user review for an unchanged confirmed discussion contract. Ask again only when specification compilation changes scope, behavior, risk acceptance, target boundary, or another user-owned decision.
- When entered through `sp-auto` with `auto_default_recommendation: true`, automatically accept a single safe recommended approach or section-shape option instead of stopping only for a `1`/`2`/`3` reply; do not use this to confirm scope reduction, dropped upstream signals, out-of-scope conflicts, or unresolved planning-critical ambiguity.
- Write `spec-contract.json` first, render project-facing artifacts from it, then self-review for placeholders, contradictions, ambiguous requirements, silent scope narrowing, dropped upstream signals, out-of-scope conflicts, missing acceptance proof, and unconfirmed product minimization.
- Ask the user only about a non-empty `semantic_delta` or unresolved user-owned decision before recommending exactly one next command: `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.

## Output Contract

- Write or update canonical `spec-contract.json` using `.specify/templates/spec-contract-template.json`, then render `spec.md`. Write `alignment.md`, `context.md`, `references.md`, and requirements diagnostics only when their triggered content cannot be represented by a stable reference in the contract.
- When compatibility requires `brainstorming/handoff-to-specify.json`, generate it as a pointer-only agent transition with `source_contract`, `review_digest`, `semantic_delta`, `required_refs`, blockers, and next action; do not copy the requirement contract.
- When UI reference input exists, require `ui-reference-notes.md`; for every
  substantive concrete UI surface, require `ui-brief.md` whether or not a
  reference was supplied; create `ui-target.html` only when a disposable visual target materially reduces ambiguity.
- For `approximate` and `high` UI reference fidelity, activate `Reference-Implementation`, populate `Fidelity Requirements`, persist canonical Reference-Implementation `required_evidence`, and record UI-specific labels only as aliases/mapping notes.
- `alignment.md` must record `Semantic Term Decisions`, `Upstream Intent Disposition`, and `Out-Of-Scope Conflicts` when relevant.
- Do not recommend `/sp.plan` while a capability-like upstream signal lacks disposition, an ambiguous high-impact term lacks confirmation, or an out-of-scope conflict lacks user confirmation.
- Report what was confirmed, what remains open, what was deferred or dropped, and the single valid next command.

## Guardrails

- Do not edit source code, tests, or implementation files from `sp-specify`.
- Do not treat the discussion handoff summary as complete when discussion source files exist.
- Do not silently narrow user scope, redefine broad capability terms, or convert the request into a smaller delivery without user confirmation.
- Do not require legacy brainstorming journals, stage manifests, lock JSON files, or replay artifacts for normal `sp-specify` completion.
- Do not treat this summary block as the workflow itself; the detailed contract below remains authoritative.

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

## Planning Cognition Policy

Use project cognition as advisory navigation, never as sole proof. For an unchanged phase pass, run at most one `C:\Users\11034\.specify\bin\project-cognition.exe compass --intent plan` intake when the canonical context capsule lacks a required facet.

Run or emulate:

```text
C:\Users\11034\.specify\bin\project-cognition.exe compass --intent plan '--query="$ARGUMENTS"' --format json
```

- Read and carry `epistemic_contract` in the phase context capsule. Require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`. The contract cannot authorize source changes and cannot prove current behavior.
- Graph claims are indexed assertions. Even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth; graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`. Use related graph claims to narrow live reads, then prove or reject them from bounded repository evidence.
- Reuse the returned `compass_state`, `minimal_live_reads`, `first_pass_paths`, lane `claim_refs`, `coverage_diagnostics`, and `expansion_ref` as the phase context capsule. Treat `route_confidence` only within `confidence_scope=route_candidate`; use top-level advanced-query `claim_signals` or `C:\Users\11034\.specify\bin\project-cognition.exe expand --section claim_evidence` for bounded `source_path`/`span` evidence. These signals require live verification and cannot prove current repository truth. Read only the minimum live evidence needed for the active claim and let contradictory live evidence override the route candidate.
- Interpret `claim_ranking` only as a bounded rerank of candidates already eligible through `match_score`; claims cannot create candidates and cannot replace live verification. Fresh supported or graph-generation-verified claims add at most `+1`, while stale and contradicted claims subtract `-1` and `-2`. On `stale_claim_signal` or `contradicted_claim_signal`, preserve `usable_with_review`, follow `reconcile_claims_with_minimal_live_reads`, and complete the lane action against live repository evidence.
- When claim-specific bounded reads settle a stale or contradicted route, provide only reconciliation intent: workflow, stable `claim_id`, reason, repository-relative `source_path`, bounded line `span`, `supporting` or `contradicting` role, and optional claim-specific verification. Run `C:\Users\11034\.specify\bin\project-cognition.exe claim-reconcile prepare --input <intent.json> --format json`; the runtime owns all integrity fields and the prepared packet path. Execute the returned `apply_argv` exactly (`C:\Users\11034\.specify\bin\project-cognition.exe claim-reconcile apply --input <prepared_packet_path> --format json`). Generic verification cannot re-promote a graph claim. If reconciliation is ready, rerun Compass once for the planning route; otherwise withhold the claim.
- `fresh`, `stale`, `possibly_stale`, `needs_update`, and `partial_refresh` are planning advisories. Follow returned `minimal_live_reads` and prove the active claim from live evidence; do not stop solely because the index is stale.
- Rebuild only for an unusable/missing baseline or explicit rebuild condition. Do not turn ordinary planning into map maintenance.
- Artifact-only specification, planning, and task generation do not mark project cognition dirty. A cognition follow-up is required only after actual source/runtime truth changes.
- For UI-bearing work, use the same intake to locate likely real entry points,
  token/theme/component owners, reusable patterns, required states, responsive
  behavior, visual/accessibility tests, and design assets. Verify selected paths
  live, then carry only the compact routes needed by downstream task packets.

[AGENT] For project-cognition-backed semantic intake, routing, audit, resume, or final-claim gates, read `references/semantic-work-contract.md`.

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

## Main Flow

1. Resolve discussion handoff intake before feature creation; require canonical agent-only `handoff-to-specify.json`, verify `handoff-ready`, `quality_gate.status: user_confirmed`, and `planning_gate_status: ready`, derive the feature description, and do not pass the raw contract path as the feature description. Do not use `specification-input.md`, `discussion-state.md`, or other discussion source files as a substitute.
2. Verify the installed command surface with `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify --help`, then run `.specify/scripts/powershell/create-new-feature.ps1 "$ARGUMENTS"` from the repo root as the generated create-feature script; generated projects resolve this to `.specify/scripts/bash/create-new-feature.sh "$ARGUMENTS"` or `.specify/scripts/powershell/create-new-feature.ps1 "$ARGUMENTS"`. If the feature-creation script exits non-zero, stop with its evidence; do not call `specify lane register` or invent a feature-creation CLI command. After it returns `FEATURE_DIR`, enter or resume `specify` through the deterministic workflow runtime before writing any feature artifact.
3. Explore project context with project cognition as advisory navigation, then prove current facts from live files and record source evidence.
4. Select discovery mode for a raw request or compile mode for a confirmed discussion contract. In compile mode, compute `semantic_delta`, ask only about a planning-critical delta, and do not repeat user review when `semantic_delta` is empty.
5. Decompose semantic terms into explicit decisions and capability operations in `spec-contract.json`. Build `acceptance_coverage` as one stable `requirement_ref`/`acceptance_ref` pair per row: cover every `scope.in` and `capability_operations` JSON Pointer, map every acceptance criterion exactly once, and never use one criterion as the closure proof for multiple independent requirements. Present two or three approaches only when behavior, boundary, compatibility, or acceptance proof changes.
6. Preserve the discussion contract by reference. Read discussion source files only when a named evidence reference is stale, missing, or contradictory; carry its existing decision digest instead of rebuilding it.
7. For UI-facing work—with or without supplied screenshots—read selected
   `DESIGN.md` and live UI evidence; compile `Experience Requirements`,
   design-system readiness (`design_system_status`, `design_risk_level`), and a
   feature `ui-brief.md` plus the complete current `design_contract` for
   substantive UI changes. Separately record work type, surface type, platform,
   subject, audience, single job, visual/content/interaction theses, signature,
   approved visual ref, reference intents, real content/image plans, and the
   structure/visual/runtime evidence triad. Treat a bootstrap or
   missing required system as a strong blocker and a non-blocking adoption gap
   as a soft risk. When raw UI references exist, additionally use
   `choose_ui_reference_lane_dispatch`, `ui-reference-artifact`, and
   `Reference-Implementation` fidelity evidence.
8. Write `spec-contract.json`, render or update specification-owned project-facing artifacts, and run deterministic completeness, traceability, and contradiction checks. Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify hook validate-artifacts --command specify --feature-dir '<feature-dir>' --format json` and fail closed if the specification package is incomplete. Request user review only for non-empty semantic delta or a real unresolved decision, then recommend exactly one next command: `/sp.plan`, `/sp.clarify`, or `/sp.deep-research`.

Create only specification-stage outputs. Do not create `plan-contract.json`, `plan.md`, research/design-plan artifacts, `tasks.md`, or `task-index.json`; the separately invoked planning and task workflows own them. Do not edit production source, tests, migrations, or runtime configuration.

## Detailed References

Read [Reference index](references/INDEX.md) before applying detailed contracts.

- [discussion handoff validation](references/discussion-handoff-validation.md)
- [semantic traceability](references/semantic-traceability.md)
- [ui reference lane](references/ui-reference-lane.md)
- [artifact package](references/artifact-package.md)
- [question cadence and review](references/question-cadence-and-review.md)
- [self review and quality gates](references/self-review-and-quality-gates.md)

## Codex Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Preserve this workflow's existing packet, handoff, artifact, and result schema; this section only governs capability discovery before dispatch or blocked-state recording.

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
- If the native tool is unavailable in the current runtime or the tool call fails, fall back to the shared open question block structure already defined in this template.
- In `specify`, use this preference for:
  - planning-critical clarification
  - capability split confirmation
  - user-owned semantic delta before planning readiness
- Native tool target: `request_user_input` if the current Codex runtime exposes it
- Question count: 1-3 short questions per call
- Option count: 2-3 options per question
- Required question fields: `header`, `id`, `question`, `options`
- Option fields: `label`, `description`
- Put the recommended option first and suffix its label with `(Recommended)` when that distinction matters.
- Use this native surface for one bounded clarification or selection step; if it is unavailable or too narrow for the needed interaction, fall back immediately to the template's textual question format.

## Pre-Analysis Protocol

- Before drafting or asking clarification questions, identify the target need, scope boundary, key constraints, acceptance proof, known unknowns, and safest next step.
- Keep guided requirement discovery concise and avoid reviving the deprecated fixed heavy discovery lifecycle.
- Treat `final-handoff-decision` as a compatibility readiness check name only; do not restore the legacy staged handoff flow.
- In compile mode, reuse the confirmed discussion contract's context capsule and decision digest. Run one bounded `C:\Users\11034\.specify\bin\project-cognition.exe compass --intent plan '--query="$ARGUMENTS"' --format json` intake only when a planning facet is absent or outdated; preserve `C:\Users\11034\.specify\bin\project-cognition.exe query --intent plan --query-plan '"<query_plan_json>"' --format json` as a precision escalation for an explicit unresolved concept.
- Read top-level `minimal_live_reads` first and open live files only for the named gap. Do not build a second broad repository summary or infer final scope from first-pass paths.
- After `FEATURE_DIR` is known, use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify workflow show --feature-dir '<feature-dir>' --format json`; when state is missing, run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify workflow enter --command specify --feature-dir '<feature-dir>' --format json`. The deterministic runtime owns only `workflow-runtime.json`; create or resume rich `workflow-state.md` from the installed template for specification evidence and Learning, and never use it to skip runtime stages. Do not implement code, edit source files, edit tests, or run implementation-oriented fix loops from `sp-specify`.
- Write canonical `spec-contract.json` first. Render `spec.md`; write `alignment.md`, `context.md`, `references.md`, or diagnostics only when the triggered content has independent project-review value and cannot be represented by a stable ref.
- Clarify only planning-critical ambiguity. Recommend `/sp.clarify` or `/sp.deep-research` only when the unresolved item belongs there.
- Preserve this as an internal understand-before-acting pass; do not replace the one-question-at-a-time requirement discovery flow with a broad analysis report.

## Semantic Traceability Guidance

- Preserve the concise `sp-specify` flow: explore project context, ask one high-impact question at a time, compare two or three approaches, write artifacts, self-review, and ask for user review.
- When `sp-specify` comes from `sp-discussion`, compile canonical `spec-contract.json` from the confirmed requirement contract and preserve its decision digest by reference.
- Read supporting discussion files only when a named evidence reference is stale, missing, or contradictory; record only the refs actually needed in the compact context capsule.
- Compute `semantic_delta`; when it is empty and deterministic review passes, do not repeat upstream questions or user confirmation.
- Decompose semantic terms before narrowing scope and keep unconfirmed narrowing out of planning-ready state.
- Downstream stages must reopen upstream intent explicitly instead of silently reinterpreting it.

## Project Cognition Freshness Closeout

- This workflow is artifact-only unless the user explicitly requested source/runtime/template/config/test/generated-asset changes; do not call `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty --help`, `C:\Users\11034\.specify\bin\project-cognition.exe complete-refresh --help`, or `C:\Users\11034\.specify\bin\project-cognition.exe validate-build --format json` just because `sp-specify`, `sp-plan`, or `sp-tasks` wrote planning artifacts.
- If this planning workflow makes actual source/runtime/template/config/test/generated-asset changes in the current run, it stops being artifact-only for closeout: run inline project cognition update from the workflow-owned changed paths and affected surfaces.
- Git-baseline freshness only changes after source/runtime/template/config/test/generated-asset changes are recorded; planning-only artifact edits do not require `project-cognition complete-refresh`, and manual override/fallback belongs only to an explicit map-maintenance recovery path.
- Inline project cognition update uses `C:\Users\11034\.specify\bin\project-cognition.exe delta append --help` followed by `C:\Users\11034\.specify\bin\project-cognition.exe update --delta-session '"$DELTA_SESSION_ID"' --reason workflow-finalize --format json` when a delta session exists, or `C:\Users\11034\.specify\bin\project-cognition.exe update --payload-file '".specify/project-cognition/updates/<update-id>.json"' --reason workflow-finalize --format json` when no delta session exists.
- The payload-file path must include changed_paths, behavior_surfaces, generated_surfaces, state_contracts, verification, known_unknowns, and confidence_notes so the update is equivalent to `sp-map-update`, not just a path stamp; `verification_evidence` and `generated_surface_notes` are accepted compatibility aliases.
- Use `known_unknowns` only for blockers that make the cognition update unsafe to trust. If unrelated dirty or untracked working-tree paths were excluded by explicit workflow-owned paths, record that as `confidence_notes` or `boundary.initial_dirty_paths`, not as blocking `known_unknowns`.
- clean closeout keys on `result_state`, not `update_id`, `last_update_id`, or freshness alone. Treat `ready` and `no_op` as clean, `partial_refresh` as recorded but not fully clean, `needs_rebuild` as a map-scan/map-build route, `blocked` as blocked, and `recorded` as legacy recorded-only output that is never clean completion.
- Use `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty --reason '"<reason>"' --format json` only when inline update cannot complete.
- `sp-map-update` is for manual/external maintenance and follow-up repair, not routine cleanup for changes this workflow just made; run `/sp-map-scan` followed by `/sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`.

## Codex Subagents-First Dispatch

When running `sp-specify` in Codex, use Codex native subagents only for bounded evidence, challenge, and artifact-review lanes that support the current collaborative specification pass.
- Do not let subagents invent scope, semantic-term choices, or upstream signal dispositions outside the leader-owned artifacts.
- Use `spawn_agent` for bounded source-file sweep, repository evidence, semantic-drift challenge, and artifact validation lanes.
- Use join points before section approval, before artifact self-review, and before the user review gate when delegated lanes are active.
- Launch all independent lanes in the current `parallel-subagents` wave before waiting.
- Suggested bounded lanes include discussion source sweep, targeted repository evidence, semantic-term challenge, upstream disposition review, and written artifact validation.
- Keep structured artifact discipline: Codex subagents may return evidence and challenges, but the leader updates `spec.md`, `alignment.md`, `context.md`, `workflow-state.md`, and `brainstorming/handoff-to-specify.json`.
- Use `wait_agent` only at explicit review join points and before final user review.
- Use `close_agent` after integrating finished subagent results.
- Keep the shared workflow language integration-neutral in user-visible output.
