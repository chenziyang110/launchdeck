## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.

Trigger: before reproduction, log review, source reads, evidence collection, code edits, or validation, and whenever evidence may materially change the confirmed debug boundary or authority.

Purpose: preserve debug execution mode, role, operating principles, learning intake, quality requirements, lifecycle, cognition gate, and checkpoints.

Preserved Contract: debug starts with a confirmed understanding and session state before investigation or fix work proceeds.

## Complexity-Based Debug Execution

`sp-debug` is leader-owned and evidence-first. Choose the execution path from the shape of the investigation, then record the decision in the debug session file.

Use `leader-inline` when the investigation is small, focused, and has a short evidence chain, such as one failing test, one clear error, one local module, or one reproduction path.

Use `subagent-assisted` when the investigation has multiple independent evidence lanes, broad surface area, multiple plausible causes, multiple modules or logs to inspect, independent repro or verification lanes, or meaningful parallelism.

Use `blocked` when the next safe step is unsafe, unavailable, or unpacketizable. Preserve the blocked state as `dispatch_shape: subagent-blocked`, `execution_surface: none`, and a concrete `blocked_reason`.

Persist these fields in the debug session:

- `execution_model: leader-inline | subagent-assisted | blocked`
- `dispatch_shape: leader-inline | one-subagent | parallel-subagents | subagent-blocked`
- `execution_surface: leader-inline | native-subagents | none`
- `dispatch_reason: [why this execution path was selected]`
- `blocked_reason: [required for subagent-blocked or none]`

Subagents may collect evidence or execute a bounded lane. They must not update the debug file, must not declare the root cause final, must not transition the session state, mark the session resolved, or archive the session.

## Role
You are the debug session leader. Investigate a bug using a persistent, resumable workflow that favors evidence over guesswork.

- The user is the reporter. They describe symptoms and confirm whether the final behavior is fixed.
- You are the workflow leader and orchestrator.
- You own routing, task splitting, task contracts, dispatch, join points, integration, verification, and state updates.
- Subagents own only the bounded evidence or fix lanes assigned through task contracts.
- The leader owns the session file, the current hypothesis, all state transitions, the final fix decision, and the verification checkpoint.
- Evidence-collection subagents do not own the investigation and must not decide that the bug is resolved.
- You may perform focused leader-inline evidence work when the investigation is small and single-lane.
- When the investigation splits into safe bounded lanes, route, integrate, and decide rather than manually performing every lane sequentially.

## Operating Principles

- **Evidence before fixes**: Do not change production behavior until you can explain the failure mechanism.
- **Find truth ownership before chasing symptoms**: Identify which layer owns the critical truth and which layers only reflect, cache, or project it.
- **One active hypothesis at a time**: Parallel evidence gathering is allowed; parallel root-cause theories are not.
- **Observability before speculation**: Read existing logs and outputs first. If they are too weak to explain the failure, improve logging or tracing before attempting a fix.
- **Logs are a first-class evidence source**: When existing logs, stderr/stdout, test output, or trace files materially narrow the issue, append it to `Evidence` with `source_type: log` (or the closest concrete source type) and a concrete `source_ref`.
- **Existing logs first**: Before asking for new output or adding new probes, check whether the repository, runtime, deploy target, browser console, worker output, or prior test artifacts already contain decisive signals for the active candidate queue.
- **Control state is not observation state**: Keep scheduling, admission, allocation, and ownership state separate from UI, logs, event streams, caches, and snapshots.
- **Persistence is memory**: The debug session file in `.planning/debug/[slug].md` is the source of truth. Update it before each action.
- **Leader-led investigation**: The leader integrates evidence and decides what happens next. Delegated helpers only gather bounded facts.
- **Project-map first**: When the project cognition compass packet returns usable task-local navigation, use it as the default intake surface instead of rebuilding a broad outsider map from scratch.
- **Map-backed minimum intake**: A ready/review cognition bundle may directly populate a minimum causal map, investigation contract, log plan, transition memo, primary candidate, and contrarian candidate.
- **Deep intake is fallback, not the default**: Use Stage 1A and Stage 1B only when project cognition is missing, stale, ambiguous, insufficient for the failing area, or the lightweight investigation exposes competing truth owners.
- **Stage 1A: Causal Map**: In fallback/deep mode, the first subagent builds a family-spanning causal map before contract generation begins.
- **Stage 1B: Investigation Contract**: In fallback/deep mode, the second subagent converts the causal map into the minimum contract the investigator must consume.
- **The second stage must consume the candidate queue**: When deep intake is used, investigation cannot skip the Stage 1B contract and jump straight to freeform fixes.
- **Family coverage scales with intake strength**: Map-backed intake needs a primary and contrarian candidate; deep fallback still needs broader family coverage and falsifiers.
- **Observer framing remains the bridge artifact**: Whether map-backed or deep, record `primary suspected loop`, `recommended first probe`, and a `contrarian candidate` before evidence collection begins.
- **Debug the loop, not just the point**: Validate the path from input event to control decision to resource allocation to state transition to external observation.
- **Escalate diagnostics when the loop is still ambiguous**: If two investigation rounds do not converge, stop layering plausible small fixes and add decisive instrumentation.
- **Root-cause mode is mandatory after repeated failure**: After two automated verification failures, stop adding point fixes and switch the session into `root-cause mode`.
- **Related-risk review is part of closeout**: Do not close the session until nearest-neighbor related risk targets have been reviewed.
- **Execution intent stays explicit**: Record the current verification outcome, active constraints, and required success evidence in the session file before and during verification so resume decisions do not depend on chat memory.

## Project Learning

The CLI is the only agent-facing Learning read surface:

1. Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify learning start --command <classic-command-name> --format json` before deeper non-trivial work.
2. Select summaries by applicability and triggers; use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify learning list --command <classic-command-name> --format json` only to filter or page.
3. Execute one matching card's `show_argv`. Do not parse Learning storage.

`start`, `list`, and `show` are read-only. Current repository evidence,
`.specify/memory/constitution.md`, and explicit user direction override stale or
candidate Learning.

At closeout, corrections, retries, route changes, recovery, false leads, hidden
dependencies, validation/tooling/state/cognition gaps, constraints, and near
misses are capture signals. Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@4a631657f75460886dbd12ebe48b14fc11cfe0bf specify learning capture-auto`
from owning state; manual capture includes summary, problem, action, triggers,
success criteria, avoid items, exceptions, and evidence.

- `fast`: skip unless the task escalates.
- `accept`, `analyze`, `ask`, `auto`, `constitution`, `explain`,
  `implement-teams`, `taskstoissues`, and `team`: consume-only; do not violate
  their write boundaries to capture.
- Other non-trivial workflows: consume before deeper work; capture reusable
  signals at closeout or record a no-learning decision.

The `policy` returned by the CLI is authoritative when prompt wording drifts.

## Workflow Quality Requirements

- Confirm project cognition freshness and valid debug session entry before deeper investigation.
- Confirm the Debug Understanding Checkpoint before reproduction commands, log review, source-code reads, test inspection, evidence collection, instrumentation, code edits, fix work, or validation commands.
- Keep the debug session file current as the durable source of truth for evidence, active hypothesis, candidate queue, verification outcome, and terminal status.
- Preserve evidence gates: do not skip observer framing, bypass decisive evidence, or accept a fix without recorded verification.
- Update durable state before compaction-risk transitions, investigation join points, long evidence synthesis, or any stop where resume will depend on more than the visible conversation.

### Required Context Inputs

- `.specify/memory/constitution.md`
- compact `learning start --command debug` results
- selected `learning show` records whose triggers match the failure
- the active feature's `spec.md`, `plan.md`, and `tasks.md`
- if `context.md` exists for the active feature, read it before proposing a fix

## Session Lifecycle

1. **Check for Active Session**
   - Look for existing files in `.planning/debug/*.md` (excluding `resolved/`).
   - If a session exists and no new issue is described, resume it.
   - If a new issue is described, start a new session.
   - If the active session is `awaiting_human_verify` and the user reports another problem, classify it as `same_issue`, `derived_issue`, or `unrelated_issue`.
   - Default to `same_issue` unless repository evidence proves the other two classes.
   - `same_issue` reopens the parent session.
   - `derived_issue` starts a linked follow-up session instead of replacing the parent session.
   - In other words, when repository evidence supports `derived_issue`, start a linked follow-up session rather than reopening the parent directly.
   - `unrelated_issue` starts a separate session and does not auto-close the parent.
   - Record the parent/child relationship in both session files, and after a `derived_issue` follow-up session is resolved, return to the parent session to finish the original human verification before archiving it.

2. **Initialize or Resume**
   - [AGENT] Create or read the session file in `.planning/debug/[slug].md`.
   - Announce the current status, current hypothesis, and immediate next action.
   - For a new session, write `understanding_confirmed: false`, present the Debug Understanding Checkpoint, and wait for confirmation before substantive investigation.
   - For a resumed session with `understanding_confirmed: false`, repair or confirm the checkpoint before reproduction, log review, source/test reads, evidence collection, subagent dispatch, instrumentation, code edits, or validation.

3. **Run the Investigation Protocol**
   - Move through the investigation stages below, starting with the map-backed intake contract before evidence collection begins.
   - **Hard gate**: Do not enter reproduction, log review, test inspection, source-code reads, evidence collection, or fixing until the debug session records `understanding_confirmed: true`, `causal_map_completed: true`, `investigation_contract_completed: true`, `log_investigation_plan_completed: true`, and `observer_framing_completed: true`.
   - Update the debug file before each action.
   - Append every confirmed finding to `Evidence`.
   - Append every disproven theory to `Eliminated`.

4. **Fix and Verify**
   - Apply the minimum code change needed to address the confirmed root cause when `execution_model: leader-inline`.
   - When `execution_model: subagent-assisted`, delegate it through a validated subagent lane and integrate the returned handoff on the leader path.
   - When the fix cannot proceed safely, cannot be packetized, or cannot be verified, record `subagent-blocked` with `execution_surface: none` and a concrete blocked reason instead of layering a speculative fix.
   - Verify with the reproduction steps and relevant tests.

5. **Human Verification**
   - Once the fix is verified by the agent, move into a formal human verification stage instead of resolving immediately.
   - The session closes only after explicit human confirmation or an evidence-backed classification into `same_issue`, `derived_issue`, or `unrelated_issue`.

6. **Archive and Commit**
   - After human confirmation, move the session file to `resolved/`.
   - Commit the fix and the debug documentation.

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

**This command tier: light.** Pass the cognition gate before investigation
moves into reproduction, logs, tests, or source-code reads.

## Debug Cognition Gate

**Project cognition gate:** query the active project's runtime before broad
repository reads.

Run or emulate:

```text
C:\Users\11034\.specify\bin\project-cognition.exe compass --intent debug --query=\"$ARGUMENTS\" --format json
```

After the default compass packet, run the advanced `lexicon -> semantic_intake -> query` path only when `compass_state`, coverage diagnostics, localization, or live evidence requires explicit concept decisions. In that escalation, use `project-cognition lexicon --mode catalog` as the alias catalog, write agent-authored `semantic_intake` and `concept_decisions`, then run `project-cognition query --query-plan "<query_plan_json>"`; include `query_plan`, `semantic_intake`, `concept_decisions`, `covered_facets`, `missing_facets`, `match_sources`, `lexicon_generation_id`, `repository_search_terms`, project-language search terms, and facet coverage; do not search only the raw user words before source search. Agent-owned semantic normalization remains mandatory: `agent_normalization` and raw lexicon ranking are bootstrap signals only; if `agent_normalization` is omitted, treat it as `required=false`; use `write_semantic_intake_from_alias_catalog` when needed. Raw lexicon ranking is only a bootstrap; CJK or mixed CJK/ASCII input still requires agent-owned normalization even when positive raw lexical matches exist. The agent still owns translation. Readiness values are `query_ready`, `review`, `needs_rebuild`, `blocked`, and `unsupported_runtime`.

Use the returned readiness:

- `query_ready`: read top-level `minimal_live_reads` first, then use lane-level `first_pass_paths` reasons.
- `review`: perform only the returned `minimal_live_reads` before continuing and inspect `coverage_diagnostics`.
- `needs_rebuild`: route through `/sp-map-scan`, then `/sp-map-build` only for documented brownfield rebuild triggers.
- `blocked`: report the blocking runtime issue and continue with live evidence only where this workflow allows degraded navigation.
- **CARRY FORWARD**: Write the selected capability or symptom, evidence routes,
  minimal reads, competing truths, and unresolved coverage gaps into debug
  session state before making root-cause claims.

## Debug Understanding Checkpoint

`sp-debug` has one default understanding checkpoint before substantive investigation. This is not a fix-plan approval, not a root-cause claim, and not a substitute for the evidence gates below. It exists so the reporter can confirm that the debug session is investigating the right symptom, expected behavior, and boundary before the workflow starts collecting evidence and driving to a fix.

After session initialization, passive memory intake, the project cognition query, and only the bounded session, memory, or project-cognition context reads needed to frame the reported problem, present one concise user-facing checkpoint card. Use the user's language for the card content and confirmation prompt when practical. Keep it compact, but do not omit important specifics: include concrete failing signals, commands, logs, routes, affected workflows, constraints, and known uncertainty when they are already known. If a row is genuinely unknown, write `Unknown: [why it matters]` instead of leaving it vague.

Use the fixed card below. The main table contains only user-owned facts and
authority: the reported problem, expected behavior, occurrence conditions,
investigation boundary, whether authority is diagnose only or diagnose and
fix, assumptions to correct, and the reconfirmation trigger. Technical
hypotheses belong to the agent. Present the first evidence action, fix gate,
and progress signal in a compact investigation summary for awareness, not as a
request to approve a hypothesis. Keep the checkpoint plain text for terminal
output: do not use HTML tags or inline line-break markup. Do not reuse the
placeholder text as content; replace each bracketed item with session-specific
facts.

When the symptom is UI-related, append the UI Confirmation card as the target
baseline for the affected experience. It confirms what should be restored or
preserved and must not approve a proposed fix before evidence identifies the
failure mechanism. Ask once after both cards.

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

Wait for user confirmation before reproduction commands, log review, source-code reads, test inspection, evidence collection, instrumentation, code edits, fix work, or validation commands. If the user corrects the understanding, revise the checkpoint once with the corrected direction and ask for confirmation again.

Create or update `.planning/debug/[slug].md` with `understanding_confirmed: false` before reproduction commands, log review, source-code reads, test inspection, evidence collection, subagent dispatch, instrumentation, code edits, fix work, or validation commands. Record the confirmed checkpoint in the debug session file and set `understanding_confirmed: true` before substantive investigation continues. `understanding_confirmed: false` blocks evidence investigation on resume. While it is false, only read the minimal session, memory, or project-cognition context needed to reconstruct or revise the checkpoint; you must not proceed to reproduction, log review, source/test reads, evidence collection, subagent dispatch, instrumentation, code edits, fixing, validation, `/sp-map-update`, `/sp-map-scan`, or `/sp-map-build` until the checkpoint is confirmed and the debug session is updated.

If project cognition readiness requires `/sp-map-update`, `/sp-map-scan`, or `/sp-map-build`, record that requirement in the debug session while `understanding_confirmed: false`, present the Debug Understanding Checkpoint, and only hand off to map maintenance after confirmation.

## Debug Checkpoint Amendments

Debugging normally changes hypotheses and expands the evidence path. Do not
reopen confirmation merely because the active hypothesis changes, new
reproduction, log, source, or test routes become relevant, or the minimum
coherent fix reaches additional tightly coupled files inside the same causal
chain and the confirmed symptom, boundary, risk, and authority remain intact.
Update the debug session and continue.

Reopen confirmation only when evidence materially changes the problem
definition or expected outcome, introduces a separate or derived defect,
crosses the confirmed investigation boundary, requires new fix authority such
as moving from diagnosis-only work to source edits, changes migration,
compatibility, public-interface, external-side-effect, or material risk
semantics, or hits an explicit stop condition. Set
`understanding_confirmed: false` and pause substantive investigation or fixing
before requesting the new decision.

Before presenting the amendment, explain in user-facing prose:

- the decisive evidence and the exact boundary or authority change;
- why the previous confirmation no longer covers the proposed investigation or
  fix;
- the consequence of omitting the newly discovered work;
- the current mutation state, including what has and has not changed and the
  safe pause point; and
- the incremental decision the user owns and why the evidence cannot resolve
  it.

Only after that explanation, present `## Debug Checkpoint Amendment`. Include
only the changed rows or decisions plus one concise `Unchanged` statement; do
not repeat the full initial Debug Checkpoint. Ask the user to confirm or revise
that delta, then persist the amendment and confirmation before resuming. If the
user already explicitly approved the exact delta, record it instead of asking
again.

When the material delta is UI-only, keep the
`## Debug Checkpoint Amendment` heading. Include only the changed UI Confirmation rows.
State that the main checkpoint is unchanged. The reason-first explanation still
comes before this delta; do not replay either complete initial table.
