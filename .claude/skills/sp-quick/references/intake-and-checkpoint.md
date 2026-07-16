## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.

Trigger: before quick-task execution, broad reads, delegation, or validation commands, and whenever a material discovery may invalidate the confirmed quick boundary.

Purpose: preserve required context, understanding checkpoint, quick checkpoint, scope gate, escalation triggers, and consequence boundary.

Preserved Contract: quick work starts only after bounded scope, checkpoint confirmation, and escalation checks are satisfied.

## Required Context Inputs

## Project Cognition Advisory Gate

This command should treat the project cognition runtime as an advisory navigation index, not a mandatory pre-source gate.

### Advisory Rule

Use project cognition when available to find likely owners, affected paths,
risks, verification routes, and minimal live reads. Do not treat map output as
evidence by itself. Technical claims must be backed by live code, tests,
scripts, configuration, or authoritative docs.

### Required Project Cognition Compass

Default project cognition intake is `project-cognition compass --intent <intent> --query="$ARGUMENTS" --format json`.

Consume the packet in this order:

1. Read top-level `epistemic_contract` first. Require `graph_role=route_candidate_only`, `fact_source_of_truth=live_repository`, `live_verification_required=true`, `graph_only_claims_allowed=false`, and `unverified_claim_action=withhold`.
2. Read top-level `minimal_live_reads` and use those files as the bounded first live evidence route.
3. Then use lane-level `first_pass_paths` for reasons, evidence hints, verification hints, follow-up surfaces, and `before_fix_claim` checks.
4. Read lane-level `claim_refs` only as compact route candidates. `route_confidence` is scoped by `confidence_scope=route_candidate`; inspect each claim's `state`, `freshness`, and `stale` marker, and require live verification before using it as repository truth.
5. Treat `coverage_diagnostics` as confidence and closeout signals, never as route candidates.
6. Treat `expansion_ref` as a normal continuation path. Run `project-cognition expand --id <id> --section claim_evidence --format json` when an active claim needs its bounded `source_path`/`span` evidence; use other sections only when coverage state or live evidence requires more map detail. Advanced `project-cognition query` may also return top-level `claim_signals` with bounded evidence refs.
7. Do not infer final edit scope from `minimal_live_reads`, `first_pass_paths`, `claim_refs`, `claim_signals`, or `claim_evidence`.

Compass applies graph claims only as a bounded rerank after repository-backed route eligibility is established. `match_score` remains the eligibility score; lane `claim_ranking.adjustment` may only move an already-matched candidate by `+1` for fresh `supported`/`verified_in_graph_generation`, `-1` for stale, or `-2` for contradicted. Claims cannot create candidates and cannot replace live verification. When `coverage_diagnostics` contains `stale_claim_signal` or `contradicted_claim_signal`, treat the packet as `usable_with_review`, follow `reconcile_claims_with_minimal_live_reads`, and complete the lane-specific refresh or reconciliation action against the live repository.

For a selected stale or contradicted claim, open only the returned claim-specific bounded live reads. If those reads are decisive, provide only reconciliation intent: workflow, stable `claim_id`, reason, and evidence with repository-relative `source_path`, bounded line `span`, and `supporting` or `contradicting` role, plus optional claim-specific verification. Run `project-cognition claim-reconcile prepare --input <intent.json> --format json`. The runtime owns the contract version, active generation, expected state and revision, UTC observation and expiry, source kind, file hashes, repository snapshot, IDs, and prepared packet path; do not author or edit those integrity fields. Execute the returned `apply_argv` exactly; it invokes `project-cognition claim-reconcile apply --input <prepared_packet_path> --format json`. A generic workflow verification is insufficient. On `result_state=ready`, rerun Compass once and use the new packet only for routing; on partial or blocked output, withhold the claim and follow `recommended_next_action`.

The `epistemic_contract` cannot authorize source changes and cannot prove current behavior. Carry `epistemic_contract` into downstream state, withhold unverified claims, and let contradictory live evidence override the route candidate.

Graph claims are indexed assertions. Their lifecycle is `candidate`, `supported`, `verified_in_graph_generation`, `contradicted`, or `stale`; even `verified_in_graph_generation` is only an active graph-generation state, not current repository truth. Graph claims cannot authorize source changes and cannot set workflow `claim_ready=true`; open bounded live evidence and run matching workflow claim-specific verification before any final claim.

Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`. Compass-specific advice is in `compass_state` and `recommended_next_action`.

- `query_ready`: read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons before expanding.
- `review`: inspect the returned `minimal_live_reads` before expanding and carry review notes from `coverage_diagnostics`.
- `needs_rebuild`: reserve `/sp-map-scan -> /sp-map-build` for documented brownfield rebuild triggers.
- `blocked`: report the runtime state clearly; continue with live evidence only when this workflow allows degraded advisory navigation.
- `unsupported_runtime`: continue with live evidence and record that compass intake was unavailable.

When `compass_state=needs_semantic_intake`, the agent writes `semantic_intake` from project vocabulary and reruns compass with `--semantic-intake-file`, or uses the advanced `lexicon -> semantic_intake -> query` path when explicit concept decisions are needed.

### Advanced Routing

Advanced routing remains available as `project-cognition lexicon --mode catalog`, agent-authored `semantic_intake` and `concept_decisions`, then `project-cognition query --query-plan`. Use it when the first compass packet is too draft-like, a workflow needs explicit concept decisions, or coverage cannot be resolved from the default packet.

The advanced `lexicon -> semantic_intake -> query` path retrieves the schema v5 `alias_index`-backed alias catalog, helps agents normalize user input into project vocabulary, records `alias_interpretations`, selects task-relevant `selected_concepts`, records unsafe or irrelevant `rejected_concepts`, writes per-concept `concept_decisions`, carries `lexicon_generation_id` and `candidate_universe_version`, and then runs `project-cognition query --query-plan`. The current query contract is `claim_retrieval_contract_version=2` and `candidate_universe_version=2`. Never parse missing or non-current versions as legacy input; rerun lexicon or compass with the current binary and repair the install if needed. Schema v5 is current-only. The current runtime does not migrate schema v4 or older databases and does not archive or replace them. Remove the incompatible project-cognition.db explicitly, then run `sp-map-scan -> sp-map-build` with the current binary. When writing the recommendation in plain text, use: run sp-map-scan -> sp-map-build.

If `project-cognition query` reports query-plan diagnostics, carry forward its `warnings`, `repair_hints`, normalized `query_plan`, structured `errors`, and `expected_shape` instead of reducing them to a raw parser exception.

### Agent-Owned Semantic Normalization

Agent-owned semantic normalization is mandatory for the advanced path. The raw lexicon ranking and `agent_normalization` are only bootstrap signals for retrieving the alias catalog and candidate universe; they are not route decisions. Raw lexicon ranking is only a bootstrap. Treat `agent_normalization.required=true` as a non-intelligent CLI reminder to write `semantic_intake` from the alias catalog (action: write_semantic_intake_from_alias_catalog). If `agent_normalization` is omitted, `omitted => required=false`: treat it as `required=false`; omission does not make raw lexical ranking authoritative. If raw `concept_candidates` are all `score=0`, or the prompt is localized, mixed-language, CJK, colloquial, symptom-first, or mixed-language or CJK text, do not stop at the raw score. CJK or mixed CJK/ASCII input still requires agent normalization even when positive raw lexical matches exist because embedded project tokens do not translate the surrounding user language. Extract embedded project terms such as command names, UI labels, file stems, state names, adapter names, and skill or package identifiers from the user's wording and the alias catalog. The agent still owns translation; `agent_normalization` is advisory guidance, not a route decision. Put those translated terms into `normalized_query`, `alias_interpretations`, `intent_facets`, `expanded_queries`, and `repository_search_terms`, then select or reject concepts by facet coverage.

Use this canonical query-plan skeleton when shaping `<query_plan_json>`. Keep `alias_interpretations` as an array of objects, not strings:

```json
{
  "raw_query": "$ARGUMENTS",
  "candidate_universe_version": 2,
  "semantic_intake": {
    "workflow_intent": "<active workflow intent>",
    "normalized_query": "<project-language interpretation>",
    "intent_facets": ["<facet the selected concept must cover>"],
    "negative_constraints": ["<scope boundary not to treat as route truth>"],
    "alias_interpretations": [
      {"alias": "<user term>", "meaning": "<project term>", "confidence": "medium"}
    ],
    "open_semantic_questions": []
  },
  "selected_concepts": ["<concept id from lexicon payload>"],
  "rejected_concepts": ["<considered concept id>"],
  "concept_decisions": [
    {
      "concept_id": "<concept id>",
      "decision": "selected",
      "selection_reason": "<facet-coverage rationale>",
      "covered_facets": ["<covered facet>"],
      "missing_facets": [],
      "match_sources": ["alias", "semantic_intake"],
      "confidence": "medium",
      "risk": ""
    }
  ],
  "lexicon_generation_id": "<lexicon_generation_id from lexicon payload>",
  "expanded_queries": ["<normalized project-language query>"],
  "repository_search_terms": ["<project-local term to search before raw wording>"],
  "paths": ["<justified path hint>"]
}
```

### Project-Language Search Terms

Before any source search, turn the user's wording into project-language search terms derived from the alias catalog, `semantic_intake`, selected candidates, and returned route metadata. Write these as `repository_search_terms` in the query plan or workflow notes. Include component names, state names, file names, command names, UI labels, and route names when the lexicon or candidate payload exposes them.

Do not search only the raw user words. If the user's phrase has no direct code match, use `normalized_query`, `alias_interpretations`, candidate titles, candidate aliases, `matched_terms`, `colloquial_matches`, returned paths, and `expanded_queries` to form the first search set. Use these project-language search terms before broad repository search; only widen after the translated terms and returned `minimal_live_reads` fail to identify the owner.

### Concept Selection

`concept_candidates` are not a flat keyword list. Treat them as structured project concept candidates with ownership, route, alias, `matched_terms`, `colloquial_matches`, domain, disambiguation, and confidence signals. Select concepts that match the user's intent and the workflow objective, reject concepts that are unrelated or unsafe to assume, and preserve the `selection_reason` and `concept_decisions` so downstream artifacts can understand why the query was bounded that way. Each `concept_decisions` entry should record `covered_facets`, `missing_facets`, `match_sources`, confidence, and risk. Candidate selection must satisfy facet coverage for the active workflow; do not trust top similarity alone, whether the match came from lexical overlap, vector similarity, aliases, paths, or graph-neighbor expansion.

When candidate concepts conflict, are too broad, or remain unknown, follow the returned compass state instead of guessing. Do not bypass `route_pack`, `minimal_live_reads`, or `first_pass_paths` by expanding into broad repository reads merely because a candidate concept looks interesting.

### Fixed Bundle Consumption

Every workflow must consume the readiness and task-local bundle returned by the project cognition compass packet explicitly required by its command contract. Treat the compass packet as the task-local project navigation bundle. Treat raw graph JSON artifacts as obsolete runtime surfaces. Do not replace bundle consumption with broad freeform repository rereads when the runtime already covers the touched area.

### Query Completion

A project-cognition compass intake is not complete when it returns JSON. It is complete only when readiness drives routing, minimal_live_reads constrains inspection, lane-level `first_pass_paths` reasons are considered, and relevant facts are carried into the next workflow artifact or execution state.

Extract and carry forward the selected concepts, rejected concepts, `selection_reason`, `semantic_intake`, `normalized_query`, `intent_facets`, `negative_constraints`, `concept_decisions`, `covered_facets`, `missing_facets`, `match_sources`, `lexicon_generation_id`, matched capability or symptom, affected nodes and subgraph, `route_pack`, `minimal_live_reads`, `first_pass_paths`, `coverage_diagnostics`, missing coverage, evidence traces, verification routes, ambiguity, conflicts, and weak coverage.

### Command Tier Depth

Tier determines how deeply the workflow must continue through the returned bundle
and minimal live reads after the minimum gate, not whether it may skip cognition-runtime consumption.

- `trivial`: minimum required artifact set only
- `light`: minimum artifact set plus relevant routing or playbook artifacts
- `heavy`: minimum artifact set plus all relevant collaboration, propagation, and verification artifacts

### Freshness

Treat runtime freshness as map-quality diagnostics:

- `fresh` -> use the returned task-local bundle as an advisory first pass navigation aid
- `missing` -> if cognition freshness is `missing`, continue with live repository evidence and recommend `/sp-map-scan`, then `/sp-map-build` only as brownfield external baseline maintenance
- `stale` -> if cognition freshness is `stale`, treat map output as advisory and continue with live repository evidence; recommend `/sp-map-update` only as external/manual maintenance when the user asks for map maintenance or before a separate map-maintenance pass
- `stale` with changed paths missing from `path_index` -> warn and continue with live repository evidence; recommend `/sp-map-update` first for ordinary existing-baseline gaps.
  Use `/sp-map-scan -> /sp-map-build` only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows outside baseline-kind exceptions described below, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`
- `support_drift` -> warn and continue with live repository evidence; recommend resolving or intentionally ignoring support-surface drift
- `partial_refresh` -> warn that refresh data was recorded but readiness did not pass; continue with live repository evidence
- `possibly_stale` -> inspect the returned affected scope when useful, then continue with live repository evidence

Preserve the distinction between the machine freshness field and public state
guidance: `freshness` records map quality, while `recommended_next_action` is a
map-maintenance recommendation.

### Greenfield Empty Baseline

If `baseline_kind=greenfield_empty`, continue with workflow artifacts and live requirements. Do not recommend map-scan -> map-build solely because the graph has no paths.

### Mutation Closeout Rule

Entry-time stale or weak cognition is still an advisory navigation concern unless the user explicitly requested map maintenance. A workflow may continue from live evidence when entry guidance allows it. That entry routing rule does not waive closeout ownership.

### Inline Project Cognition Update

Workflow-owned mutation closeout is not an external map-maintenance handoff and is not external map maintenance. It is the workflow-local form of `/sp-map-update`. If this workflow changed project-related source, runtime, templates, generated assets, config, tests, state contracts, shared surfaces, or behavior-bearing docs, closeout MUST run inline project cognition update for the workflow-owned changed paths and affected surfaces before claiming clean completion.

Call the planner first:

```text
project-cognition closeout-plan --workflow "$ACTIVE_WORKFLOW" --format json
```

When `DELTA_SESSION_ID` exists, pass it into the planner:

```text
project-cognition closeout-plan --workflow "$ACTIVE_WORKFLOW" --delta-session "$DELTA_SESSION_ID" --format json
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
project-cognition claim-reconcile prepare --input <intent.json> --format json
project-cognition claim-reconcile apply --input <prepared_packet_path> --format json
```

Provide only reconciliation intent: workflow, stable `claim_id`, reason, and evidence containing repository-relative `source_path`, bounded line `span`, and `supporting` or `contradicting` role. Add verification only when it is claim-specific. The runtime owns the contract version, active generation, expected state and revision, UTC observation and expiry, source kind, content hashes, repository snapshot, IDs, and prepared packet path. Do not author or edit those integrity fields; execute the returned `apply_argv` exactly. If no such evidence exists, leave the claim stale. If reconciliation returns ready, rerun Compass once so later routing consumes the current evidence basis; partial or blocked reconciliation remains withheld and follows `recommended_next_action`.

For compatibility with worker handoffs and delta packets, the runtime also accepts `verification_evidence` as an alias for `verification` and `generated_surface_notes` as an alias for `generated_surfaces`. Verification evidence may be an array of objects (`command`, `result`, `artifact`) or an array of command-result strings, but clean closeout still requires passing verification evidence; failed verification cannot produce a clean `ready` closeout.

Clean closeout keys on `result_state`, not `status=ok`, `update_id`, `last_update_id`, or freshness alone:

- `ready` or `no_op`: project cognition closeout may be clean when ordinary verification also passed.
- `partial_refresh`: useful update data was written, but the final workflow state must report partial cognition closeout, `partial_refresh_reasons`, and the returned `minimal_live_reads`. If `partial_refresh_reasons` includes `missing_passing_verification_result`, repair the payload or delta evidence and rerun `update_argv` before final closeout; do not route that to `sp-map-update`. If verified workflow-owned paths still remain in `review_paths` after the update, report implementation completion separately from project-cognition maintenance and name `/sp-map-update` as follow-up repair.
- `needs_rebuild`: report the exact rebuild condition and route to `/sp-map-scan`, then `/sp-map-build`.
- `blocked`: report the runtime or validation blocker and the exact recovery command.
- `recorded`: legacy recorded-only output; treat it as partial or blocked, never as clean completion.

Never run the `complete-refresh` or `clear-dirty` helper after `result_state=partial_refresh`, `needs_rebuild`, `blocked`, or legacy `recorded`; those helpers are only for states that the runtime and validation prove ready.

Dirty fallback command shape: `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty --reason \"<reason>\" --format json`.
Use `C:\Users\11034\.specify\bin\project-cognition.exe mark-dirty --reason \"workflow-closeout-failed\" --format json` only when inline update cannot complete: when the planner or update command is unavailable, cannot record useful update data, cannot identify workflow-owned scope, or cannot be trusted because verification/workflow completion is not trustworthy. Dirty only when inline update cannot complete.

sp-map-update is for manual/external maintenance and follow-up repair. `/sp-map-update` remains the external/manual workflow for user edits, interrupted workflow repair, explicit map maintenance, and follow-up repair. It is not routine cleanup for changes this workflow just made. If `sp-map-update` already ran `project-cognition update --reason map-update` for the same changed paths, do not run a second `workflow-finalize` closeout update for those paths.

### Primary Read Restriction

Do not treat handbook-first or layered project-map files as evidence. If
query-returned coverage is insufficient, inspect live repository surfaces
directly and recommend `sp-map-update` for ordinary existing-baseline gaps,
localized stale cognition refresh, weak localized coverage after a usable
baseline, or external/manual changed-path map maintenance. Use `sp-map-scan -> sp-map-build`
only for brownfield first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation
`path_index` rows outside `greenfield_empty`, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid`.

The completion claim must be backed by live code, tests, scripts, configuration, or authoritative docs. Project cognition can support route selection but cannot be the sole evidence for completion.

Do not call `project-cognition mark-dirty` unless the active workflow explicitly requires a durable dirty-state record.

**Project cognition gate:** query the active project's runtime before broad
repository reads.

Run or emulate:

```text
C:\Users\11034\.specify\bin\project-cognition.exe compass --intent implement --query=\"$ARGUMENTS\" --format json
```

After the default compass packet, run the advanced `lexicon -> semantic_intake -> query` path only when `compass_state`, coverage diagnostics, localization, or live evidence requires explicit concept decisions. In that escalation, use `project-cognition lexicon --mode catalog` as the alias catalog, write agent-authored `semantic_intake` and `concept_decisions`, then run `project-cognition query --query-plan "<query_plan_json>"`; include `query_plan`, `semantic_intake`, `concept_decisions`, `covered_facets`, `missing_facets`, `match_sources`, `lexicon_generation_id`, `repository_search_terms`, project-language search terms, and facet coverage; do not search only the raw user words before source search. Agent-owned semantic normalization remains mandatory: `agent_normalization` and raw lexicon ranking are bootstrap signals only; if `agent_normalization` is omitted, treat it as `required=false`; use `write_semantic_intake_from_alias_catalog` when needed. Raw lexicon ranking is only a bootstrap; CJK or mixed CJK/ASCII input still requires agent-owned normalization even when positive raw lexical matches exist. The agent still owns translation. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`.

Use the returned readiness only to prepare the Understanding Checkpoint and
write early quick-task state:

- `query_ready`: read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons.
- `review`: perform only the returned `minimal_live_reads` before continuing and inspect `coverage_diagnostics`.
- `needs_rebuild`: route through `/sp-map-scan`, then `/sp-map-build` only for documented brownfield rebuild triggers: first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation path_index rows, missing or invalid alias_index, explicit_rebuild_requested, or baseline_identity_invalid.
- `blocked`: report the blocking runtime issue and continue with live evidence only where this workflow allows degraded navigation.
- **CARRY FORWARD**: Write the selected capability, minimal reads, validation route,
  and known risk into quick-task `STATUS.md` before implementation
  proceeds.

Treat task-relevant coverage as insufficient when the touched area still lacks
ownership, placement, workflow, integration, or verification guidance before
choosing the quick-task lane shape.

## Discussion Handoff Intake

Apply [handoff consumption](handoff-consumption.md) once. Use canonical `SOURCE_CONTRACT` plus `SOURCE_DISCUSSION_SLUG`; do not duplicate its parsing, source sweep, or eligibility checks here.

When the confirmed contract introduces no quick-stage `semantic_delta`, bind the Understanding Checkpoint to its `review_digest` and continue without repeated user confirmation. Otherwise use the checkpoint rules below for the changed decision only.

## Understanding Checkpoint

`sp-quick` has one default understanding checkpoint before substantive execution. This is not a full spec, not a `sp-plan` substitute, and not a detailed task-plan approval. It exists so the user can confirm that the quick-task direction is correct before the workflow runs to completion.

After the constitution gate, quick workspace initialization, project cognition query, and any bounded `minimal_live_reads`, present one concise user-facing checkpoint card. Use the user's language for the card content and confirmation prompt when practical. Keep it compact, but do not omit important specifics: include concrete files, commands, workflows, constraints, validation evidence, and known uncertainty when they are already known. If a row is genuinely unknown, write `Unknown: [why it matters]` instead of leaving it vague.

Use the exact card below. The main table contains only user-owned decisions:
request and outcome, user-visible result, scope, recommended approach,
assumptions and risks, completion evidence, and the reconfirmation trigger.
Technical execution belongs to the agent. Put affected surfaces, implementation
sequencing, and the next command in a short technical summary for awareness,
not as a request to approve technical details. Keep the checkpoint plain text
for terminal output: do not use HTML tags or inline line-break markup. Do not
reuse the placeholder text as content; replace each bracketed item with
task-specific facts.

When the task affects a user-visible UI surface, append the UI Confirmation
card from the fixed partial. It is a design proposal for this bounded
implementation, not a replacement for an approved project design direction.
Ask once after both cards; the user may confirm both or revise only scope, UI,
or another named decision.

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

Wait for user confirmation before code edits, broad repository analysis, delegation, implementation commands, or validation commands. If the user corrects the understanding, revise the checkpoint once with the corrected direction and ask for confirmation again.

Create or update `STATUS.md` with `understanding_confirmed: false` before any map maintenance handoff, broad repository analysis, delegation, implementation command, or validation command. Record the confirmed checkpoint in `STATUS.md`. `understanding_confirmed: false` blocks substantive execution on resume. While it is false, only read the minimal context needed to reconstruct or revise the checkpoint; you must not proceed to code edits, broad repository analysis, delegation, validation commands, `/sp-map-update`, `/sp-map-scan`, or `/sp-map-build` until the checkpoint is confirmed and `STATUS.md` is updated.

## Quick Checkpoint Amendments

The confirmed checkpoint remains valid while repository evidence only adds
files, call sites, tests, or implementation details needed to deliver the same
confirmed outcome within the confirmed boundary, risk, and authority. Update
`STATUS.md` and continue; do not reopen confirmation for that ordinary causal
closure.

Reopen confirmation only when new evidence materially changes the confirmed
problem or outcome, an included or excluded boundary, user-visible behavior,
risk, authority, migration or compatibility obligations, an independent
capability, or an explicit stop condition. Set `understanding_confirmed: false`
and pause substantive work before requesting the new decision.

Before presenting the amendment, explain in user-facing prose:

- the new evidence and the exact trigger;
- why the previous confirmation no longer covers the proposed work;
- the consequence of omitting the newly discovered work;
- the current mutation state, including what has and has not changed and the
  safe pause point; and
- the incremental decision the user owns and why repository evidence cannot
  resolve it.

Only after that explanation, present `## Quick Checkpoint Amendment`. Include
only the changed rows or decisions plus one concise `Unchanged` statement; do
not repeat the full initial Quick Checkpoint. Ask the user to confirm or revise
that delta, then persist the amendment and confirmation before resuming. If the
user already explicitly approved the exact delta in the message that supplied
it, record that approval instead of requesting a duplicate confirmation.

When the material delta is UI-only, keep the
`## Quick Checkpoint Amendment` heading. Include only the changed UI Confirmation rows.
State that the main checkpoint is unchanged. The reason-first explanation still
comes before this delta; do not replay either complete initial table.

## Workflow Quality Requirements

- Confirm project cognition freshness and valid quick-task entry before deeper execution.
- Keep `STATUS.md` current as the durable quick-task source of truth for scope, lane state, blockers, verification, and terminal status.
- Validate each `WorkerTaskPacket` or equivalent execution contract before dispatch and require a structured handoff before accepting delegated work.
- Update durable state before compaction-risk transitions, join points, delegated fan-out, or any stop where resume will depend on more than the visible conversation.
- Read `.specify/memory/constitution.md` as governance, then use the Learning CLI summary intake before broader quick-task context. Expand only selected matching records with `learning show`.
- Learning Reflex: before final closeout, run `learning capture-auto` from `STATUS.md` when a reusable signal exists; do not edit Learning storage files directly.

## Scope Gate

Use `sp-quick` when all of these are true:
- The task is bounded and clearly described.
- The work is small but non-trivial.
- A lightweight plan is useful, but a full spec package would be overhead.
- Use this path when you want to skip the full `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify -> plan -> tasks -> implement` workflow for a bounded task.
- The task does not require a new long-lived feature spec under `.specify/features/<feature>/`.

If the task is trivial and local:
- Use `/sp-fast`.

If the task changes architecture, introduces broad product decisions, or needs a durable feature specification:
- Use `/sp-specify`.

If the task is a bug fix or regression but the root cause is still unknown:
- Use `/sp-debug` instead of treating `sp-quick` as a symptom-fix lane.

## Escalation Triggers

Upgrade to `/sp-specify` immediately if:
- The Senior Consequence Analysis Gate triggers and the work needs user-level lifecycle decisions, broad compatibility handling, multi-capability scope, destructive policy, shared-state semantics, downstream consumer negotiation, or acceptance criteria that cannot fit one bounded quick task.
- The task changes architecture or introduces cross-cutting behavior across multiple modules, workflows, or shared surfaces.
- The task touches a change-propagation hotspot, a truth-owning shared surface, or an area whose known unknowns make lightweight planning unsafe.
- The request now spans multiple independent capabilities, release tracks, or user journeys that no longer fit one bounded quick-task workspace.
- The work needs a new durable spec package, a long-lived feature boundary, or planning artifacts intended to survive beyond the quick task.
- The change has rollout, migration, compatibility, or neighboring-workflow impact that must be locked before implementation.
- The expected behavior cannot be stated with concrete acceptance criteria without first doing feature-level requirement alignment.
- The work started as a bug fix, but root-cause analysis is still unresolved, competing causes are still plausible, or the next safe step is diagnostic investigation rather than a bounded repair. In that case, route to `/sp-debug`.

## Quick Consequence Boundary

Continue in quick only when the consequence model is bounded: affected objects are few, lifecycle choices are local, dependency impact is limited, recovery is obvious, validation can run inside the quick-task loop, and every `CA-###` obligation can be recorded in `STATUS.md`.

- If the gate stands down, record the stand-down reason in `STATUS.md`.
- If the gate triggers but remains bounded, record affected objects, state behavior, dependency impact, recovery and validation, project cognition evidence, coverage gaps, and escalation decision before dispatch.
- If consequence analysis reveals user-level lifecycle decisions, broad compatibility handling, multi-capability scope, destructive policy, shared-state semantics, or downstream consumer negotiation, upgrade to `/sp-specify` immediately.
- If the task is a defect and the dependency loop is unknown, use `/sp-debug` rather than resolving consequence semantics inside `sp-quick`.
