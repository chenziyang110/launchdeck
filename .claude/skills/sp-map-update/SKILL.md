---
name: "sp-map-update"
description: "Use when a query-backed project cognition baseline already exists and diff-based evidence refresh or user-supplied corrections must update it incrementally."
argument-hint: "Optional changed path, subsystem, or stale cognition area to refresh incrementally"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/map-update.md"
user-invocable: true
---
## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A project cognition baseline exists and repository changes or user supplements must update the runtime without a full rebuild.
- **Primary objective**: Compute impact closure, refresh affected evidence, update claims and conflicts, and update only the affected SQLite runtime records.
- **Primary outputs**: `.specify/project-cognition/status.json`, `.specify/project-cognition/project-cognition.db`, and query/update helper readiness metadata.
- **Default handoff**: Return to the blocked workflow once the affected query scope is green or yellow.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## Blocked Exit Contract

If blocked after safe recovery, read and follow
`.specify/templates/workflow-blocker-template.md` and its JSON schema. Never
return only an error or “ask a human”; preserve state and keep agent-capable
repair agent-owned. Set `human_action_required: true` only for authority,
credentials, protected systems, human decisions/reviews, or physical access.
Tailor steps, expected results, failure paths, evidence, and resume action to
CI, visual review, or product decisions. Never claim completion.

[AGENT] For project-cognition-backed semantic intake, routing, audit, resume, or final-claim gates, read `references/semantic-work-contract.md`.

## Detailed References

Read [Reference index](references/INDEX.md) before applying shared semantic contracts.

- [semantic work contract](references/semantic-work-contract.md)

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

## Objective

Refresh the existing query-backed project cognition baseline incrementally from diff-driven evidence or explicit user corrections.

## Mandatory Subagent Execution

All substantive tasks in ordinary `sp-*` workflows default to and must use subagents.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.

## Process

- Query the current project cognition baseline and determine the affected closure before editing runtime outputs.
- Use the shared semantic intake contract when classifying changed paths or user supplements: build `semantic_intake` from the alias catalog, normalized query, `intent_facets`, `negative_constraints`, and `alias_interpretations`; preserve facet coverage in `concept_decisions` through `covered_facets`, `missing_facets`, and `match_sources`; write `repository_search_terms` derived from project language before source search. Agent-owned semantic normalization is mandatory: raw lexicon ranking and `agent_normalization` are only bootstrap signals, not route decisions. If `agent_normalization.required=true`, every raw candidate is `score=0`, or the prompt is localized, mixed-language, CJK, colloquial, symptom-first, or mixed-language or CJK text, extract embedded project terms and write `semantic_intake` from the alias catalog before selecting or rejecting concepts (raw lexicon ranking is only a bootstrap; action: write_semantic_intake_from_alias_catalog). If `agent_normalization` is omitted, treat it as `required=false`; omission does not make raw lexical ranking authoritative. CJK or mixed CJK/ASCII input still requires agent normalization even when positive raw lexical matches exist because embedded project tokens do not translate the surrounding user language. The agent still owns translation; `agent_normalization` is advisory guidance, not a route decision. Do not search only the raw user words; include component names, state names, file names, command names, UI labels, and route names from candidates, aliases, matched_terms, colloquial_matches, returned paths, `normalized_query`, and `expanded_queries`. Use these project-language search terms before broad repository search. Do not trust top similarity alone when deciding the affected closure.
- Prefer the smallest update that can truthfully restore readiness.
- Treat explicit user corrections and user-supplied scope as first-class routing input; user-supplied scope is authoritative for the touched area unless repository evidence disproves it.
- Dispatch only validated incremental update lanes with bounded affected scope.
- A tiny localized refresh may stay as one bounded lane even when native subagents are available.
- If a safe update lane cannot be packetized or delegated, record `subagent-blocked` with the affected paths and the smallest live-read recovery path; this is a dispatch/runtime blocker, not an excuse to skip the map-update duty.
- Update the affected runtime records that can be proven, and explicitly mark uncertain edges as partial, low-confidence, stale, or known-unknown instead of claiming the update cannot be performed.

## Git Delta Intake

- Start from Git, not memory: first run `C:\Users\11034\.specify\bin\project-cognition.exe changes --format json` unless the caller supplied a narrower explicit changed-path list or commit range. For explicit paths, pass each path with `--changed-path`; for a commit range, pass `--since <base> --head <head>`.
- Consume `next_action`, `changes[].path`, `ignored_paths`, `unknown_paths`, `baseline_commit`, and `head_commit` from the `changes` payload before querying or patching the runtime. Feed `changes[].path` into the update payload's `changed_paths`; keep `ignored_paths` out of update records, known unknowns, `minimal_live_reads`, graph evidence, and route indexes.
- Filter changed paths through `.cognitionignore` before querying or patching the runtime. The `changes` helper performs the first filter pass; if the agent adds user-supplied paths later, re-check root `.cognitionignore` and `.specify/project-cognition/.cognitionignore`. Both use gitignore-compatible syntax.
- User-supplied changed paths that match `.cognitionignore` are scope notes, not update targets. Report them as ignored unless a later `!` rule re-includes the path or the user explicitly changes the ignore rule.
- Treat user-supplied changed paths, behavior surfaces, and corrections as authoritative scope hints unless repository evidence contradicts them.
- Query `project-cognition.db` for each changed path before deciding update scope.
- For every changed path, look up current owner, consumers, lifecycle/state surfaces, shared mutable state, destructive-operation edges, generated-surface propagation, verification routes, conflicts, stale claims, and known unknowns.
- Expand the update closure through owners, downstream consumers, state surfaces, workflow artifacts, generated surfaces, and verification routes that project cognition already knows.
- Consume `affected_graph_claims` from structured update output. Changed paths must mark only graph claims linked through affected nodes or claim evidence as `stale`, preserve their prior state in the transition history, and leave unrelated claims unchanged.

Every changed path must be accounted for as one of: updated, provisionally adopted, ignored with reason, partial with `minimal_live_reads`, blocked with recovery condition, or requiring full rebuild for a reserved rebuild reason.

Ignored `.cognitionignore` paths are reported in ignored-path accounting only. `sp-map-update` must not write `.cognitionignore`-excluded paths into update records, known unknowns, `minimal_live_reads`, graph evidence, or route indexes.

## Update-By-Default Rule

- Ordinary uncertainty is not an update failure.
- If the affected closure cannot be fully proven, still update the records that can be proven and record the rest as `partial_refresh`, low-confidence claims, conflicts, stale claims, `known_unknowns`, and `minimal_live_reads`.
- `sp-map-update` must not route to `sp-map-scan -> sp-map-build` merely because the closure is wider than expected, some consumers are ambiguous, or extra live reads are needed.
- Rebuild is reserved for missing baseline, unusable DB/status/schema, explicit rebuild request, or repository architecture replacement so broad that the baseline identity is invalid.

## Existing-Baseline Gap Policy

When a usable active generation exists, existing-baseline ordinary gaps are `sp-map-update`
work and must not route to `/sp-map-scan`, then `/sp-map-build` for ordinary path gaps,
path count, unrelated top-level count, core-surface status, weak ownership,
missing `path_index` coverage, or unadoptable-ratio heuristics.

Use `review`, `partial_refresh`, low-confidence claims, conflicts, stale claims,
known unknowns, and `minimal_live_reads` to preserve imperfect but useful
maintenance state.

`/sp-map-scan -> /sp-map-build` is allowed after an existing baseline
only for missing or unusable runtime, zero active-generation `path_index` rows,
schema failure, `explicit_rebuild_requested`, or `baseline_identity_invalid`.

## Incremental Rule

- `sp-map-update` is the normal maintenance entrypoint after baseline build.
- It must accept both diff-driven and user-supplement-driven updates.
- It must update the query-backed cognition runtime incrementally.
- It must treat `.specify/project-cognition/status.json` plus `.specify/project-cognition/project-cognition.db` as the runtime truth source for post-update readiness.
- It must not silently escalate to a full rebuild without recording why.
- Generic workflow verification or `result_state=ready` may refresh path coverage but must not re-promote stale or contradicted graph claims. After update returns `affected_graph_claims`, re-promotion is allowed only for an exact stable claim ID backed by decisive claim-specific bounded live evidence. Provide only reconciliation intent: workflow, stable `claim_id`, reason, repository-relative `source_path`, bounded line `span`, `supporting` or `contradicting` role, and optional claim-specific verification. Run `project-cognition claim-reconcile prepare --input <intent.json> --format json`; the runtime owns every integrity field and the prepared packet path. Execute the returned `apply_argv` exactly (`project-cognition claim-reconcile apply --input <prepared_packet_path> --format json`). Leave claims without this evidence stale. On ready, rerun Compass once; on partial or blocked output, preserve the stale/contradicted route and follow `recommended_next_action`.
- When changed paths are missing from `path_index`, classify them before escalating: adoptable paths get provisional `path_index` and `alias_index` coverage, uncertain paths return `review` with `minimal_live_reads`, and existing-baseline ordinary gaps stay in `sp-map-update`.
- Provisional adoption must write valid graph records: an adoption `evidence` row, a `path_index` row with `relation="provisional_path"` and graph confidence `weak` or `partial`, and alias rows for the adopted node title, path material, workflow/source terms, and behavior surfaces so future `project-cognition compass` and alias-catalog routing can rediscover the adopted path.
- It must prefer metadata-only or single-slice updates when those are sufficient.
- After recording updates, re-evaluate runtime readiness through the shared freshness contract.
- Before `validate-build` or `complete-refresh`, build a payload or delta session and call:

```text
project-cognition update --payload-file ".specify/project-cognition/updates/<map-update-id>.json" --reason map-update --format json
```

Use the returned `result_state` as the completion gate, not `status=ok` alone. `ready` plus passing `validate-build` may call `complete-refresh`; `no_op` may call `record-refresh` when only freshness metadata needs to be updated; `partial_refresh` must preserve review data and must not call `complete-refresh`; `needs_rebuild` must route to `/sp-map-scan`, then `/sp-map-build`; `blocked` must report the blocker and recovery condition.

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

- After applying update records, run `C:\Users\11034\.specify\bin\project-cognition.exe validate-build --format json`.
- `sp-map-update` must not call `complete-refresh` when `result_state` is `partial_refresh`, `needs_rebuild`, or `blocked`; those states are useful recorded outcomes, not fresh completed baselines.
- If the update helper returns `needs_rebuild`, `sp-map-update` must not call `complete-refresh`; report the concrete first/missing/unusable baseline, schema failure, schema v1 or old broad-schema rebuild-required readiness, zero active-generation `path_index` rows, missing or invalid `alias_index`, `explicit_rebuild_requested`, or `baseline_identity_invalid` condition and route to `/sp-map-scan`, then `/sp-map-build`.
- If `validate-build` reports `identity_reconciliation=blocked` but the blocked set is bounded and path-led, `sp-map-update` must run a focused identity-repair pass before offering rebuild. Treat missing or unexpected `coverage_path` identities, renamed paths, deleted paths, ignored paths, stale DB path rows, and path-derived evidence identities as map-update repair work when they can be explained from git delta, file existence, `.cognitionignore`, existing merge records, or explicit row decisions.
- During the identity-repair pass, classify every blocked identity as one of: adopted with provisional path/evidence, merged to a canonical path, rejected with an explicit row decision, ignored by boundary rules, stale/deleted, or still blocked with a concrete reason. Then rerun `C:\Users\11034\.specify\bin\project-cognition.exe validate-build --format json`.
- Do not ask the user to choose between focused identity repair and full rebuild when the repair set is bounded and no reserved rebuild reason is present; perform the focused repair first and escalate only if the repair cannot safely explain the identities or validation later reports a reserved rebuild condition.
- If `validate-build` is blocked after update recording, report `partial_refresh` and preserve the validation errors instead of claiming the runtime is fresh.
- If the re-evaluated runtime is `fresh` with `readiness=ready`, finalize the successful refresh through `C:\Users\11034\.specify\bin\project-cognition.exe complete-refresh --format json` so cognition freshness metadata cannot remain stale.
- If the update helper returns `ready` and `validate-build` passes, but the shared freshness check still sees the same refreshed source paths only because those source changes are not committed yet, report the incremental update as recorded and baseline-finalization pending. Do not tell the user to run `/sp-map-scan` or `/sp-map-build` merely because refreshed source changes are not committed yet.
- After those source changes are committed, update the git-baseline freshness metadata with `C:\Users\11034\.specify\bin\project-cognition.exe record-refresh --reason \"map-update\" --format json` or `C:\Users\11034\.specify\bin\project-cognition.exe complete-refresh --format json` without rerunning `/sp-map-scan` or `/sp-map-build`, unless validation reports `needs_rebuild`, the baseline is unusable, or the affected closure cannot be bounded safely.
- Do not report refresh completion when the runtime remains blocked.
- A recorded refresh is not automatically a ready refresh: `partial_refresh` means update metadata was written but readiness still failed.

## Required Inputs

At minimum, read:

- `.specify/project-cognition/status.json`
- `.specify/project-cognition/project-cognition.db` through the
  `project-cognition` query/update helpers
- changed paths or changed commit range
- user supplement input if provided

Do not read or rewrite raw graph JSON artifacts; they are not runtime truth.

## Output Contract

The canonical outputs for this command are:

- updated `.specify/project-cognition/status.json`
- updated `.specify/project-cognition/project-cognition.db`
- query/update helper readiness metadata
- the post-recording freshness result, including `freshness`, `readiness`, and `recommended_next_action`
- when the post-recording freshness result is ready, a completed cognition refresh finalizer via `C:\Users\11034\.specify\bin\project-cognition.exe complete-refresh --format json`

## Guardrails

- Do not silently escalate to a full rebuild without recording why.
- Do not present full rebuild as an equal next option for bounded identity reconciliation debt; run the focused repair pass first.
- Do not refresh unaffected runtime records just because the touched area is ambiguous; record partial or low-confidence closure for the affected records instead.
- Do not invent closure when changed paths or user supplements do not support the update.
- Do not re-read or rewrite raw graph JSON artifacts; use the query/update helpers and the smallest affected runtime records that can truthfully restore readiness.
- Do not split small localized updates into parallel scan-style lanes just because subagents are available.
- If the affected update lane cannot be safely packetized or delegated, record `subagent-blocked` with affected paths and recovery evidence; do not describe ordinary ambiguous closure as impossible to update.
- Do not write `.cognitionignore`-excluded paths into update records, `known_unknowns`, or `minimal_live_reads`; report ignored paths separately so the operator can revise `.cognitionignore` when the exclusion is wrong.

## Escalation Boundary

- Escalate to `sp-map-scan`, then `sp-map-build` only when no query-backed baseline exists, the current baseline is unusable, DB/status/schema validation fails, zero active-generation `path_index` rows exist, the user explicitly requested a rebuild (`explicit_rebuild_requested`), or the repository architecture changed so broadly that the baseline identity is invalid (`baseline_identity_invalid`).
- Do not escalate merely because the affected closure is uncertain; record the uncertainty as partial/low-confidence update data with `known_unknowns` and `minimal_live_reads`.
- Do not escalate merely because `validate-build` reports bounded path identity reconciliation debt; classify and repair those identities inside `sp-map-update` first.
- Record the exact reason for escalation, including the failed baseline, DB, schema, explicit-request, or architecture-replacement fact.

## Update Duties

`sp-map-update` must:

- compute diff impact closure
- refresh affected evidence
- apply updates as a `patch-in-active-generation` operation against the current
  query-backed baseline unless validation proves a rebuild is required
- invalidate affected graph claims with an auditable transition to `stale`; return their stable IDs in `affected_graph_claims`
- reconcile an affected claim only from claim-specific bounded evidence through `project-cognition claim-reconcile prepare`, then execute its returned `apply_argv` through `project-cognition claim-reconcile apply`; generic verification and `result_state=ready` must not re-promote claims
- detect and repair stale retrieval signals, including obsolete aliases,
  colloquial user phrases, concept routes, and ownership hints
- update or create conflicts
- preserve or revise `selected_concepts` routing evidence when changed paths,
  user supplements, or runtime validation show that prior concept selection
  would now misroute a query
- preserve or revise `rejected_concepts` routing evidence when user corrections
  or repository evidence show that a plausible alias belongs to the wrong
  domain
- update affected runtime records with proven facts, low-confidence claims, conflicts, stale markers, known unknowns, and minimal live reads
- must not re-promote a graph claim from workflow finalization alone
- produce an incremental update record
- verify the shared freshness contract after the update record is written
- run the successful-refresh finalizer when that verification proves the runtime ready

## Claude Code Map Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, check the active tool surface for the integration-native subagent or task-dispatch entrypoint and record the exact missing surface if unavailable.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch subagents through the integration's native subagent support using the shared prompt contract.
- Join behavior: Use the integration-native join point, then integrate results back on the leader path.
- Keep map packet/result schemas from this workflow authoritative; do not substitute implementation `WorkerTaskResult` fields for map scan/build/update packet contracts.
