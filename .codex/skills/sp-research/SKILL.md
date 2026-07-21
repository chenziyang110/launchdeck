---
name: "sp-research"
description: "Use when a user invokes `sp-research` but the intended Spec Kit workflow is the pre-plan `sp-deep-research` feasibility gate."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/research.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



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

# `/sp.research` Compatibility Alias

## Workflow Contract Summary

- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## Project Learning

The CLI is the only agent-facing Learning read surface:

1. Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify learning start --command '<classic-command-name>' --format json` before deeper non-trivial work.
2. Select summaries by applicability and triggers; use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify learning list --command '<classic-command-name>' --format json` only to filter or page.
3. Execute one matching card's `show_argv`. Do not parse Learning storage.

After minimal live inspection identifies a reused operation or changed entry point, rerun targeted recall with current code, tests, and task/contract evidence, for example `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify learning list --command '<classic-command-name>' --context 'operation_owner=<owner>' --context 'consumer_owner=<consumer>' --context 'outcome=<result-family>' --format json`. Do not derive these facets from archived specifications. An exact operation-owner match may surface a cross-command candidate even when the new consumer differs; treat it as a candidate, expand one `show_argv`, verify it against live evidence, and do not auto-apply it.

When the entrypoint outcome audit is triggered, persist the live facets as `learning_context`, the contextual invocation as `learning_search_refs`, and returned refs as `learning_candidate_refs`. Record exactly one `applied`, `not_applicable`, or `deferred` item in `learning_dispositions` for every candidate. Do not silently ignore a candidate: applied Learning traces to requirement/consequence refs, not-applicable needs current evidence, and deferred needs an explicit deferral ref.

`start`, `list`, and `show` are read-only. Current repository evidence,
`.specify/memory/constitution.md`, and explicit user direction override stale or
candidate Learning.

At closeout, corrections, retries, route changes, recovery, false leads, hidden
dependencies, validation/tooling/state/cognition gaps, constraints, and near
misses are capture signals. Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify learning capture-auto`
from owning state; manual capture includes summary, problem, action, triggers,
success criteria, avoid items, exceptions, and evidence.

- `fast`: skip unless the task escalates.
- `accept`, `analyze`, `ask`, `auto`, `constitution`, `explain`,
  `implement-teams`, `taskstoissues`, and `team`: consume-only; do not violate
  their write boundaries to capture.
- Other non-trivial workflows: consume before deeper work; capture reusable
  signals at closeout or record a no-learning decision.

The `policy` returned by the CLI is authoritative when prompt wording drifts.

## Mandatory Subagent Execution

All substantive tasks in ordinary `sp-*` workflows default to and must use subagents.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.


## Objective

[AGENT] Treat `sp-research` as a compatibility alias for `sp-deep-research`.
Route immediately to the canonical deep-research workflow without creating a separate workflow lane or artifact set.

## Context

- `sp-research` exists only for compatibility with users who name research as a Spec Kit command.
- The canonical workflow is `sp-deep-research`.
- Canonical outputs belong to `sp-deep-research`: `FEATURE_DIR/deep-research.md`, optional `FEATURE_DIR/research-spikes/`, and `workflow-state.md`.

## Process

- Preserve the user's original request and arguments: `$ARGUMENTS`.
- Immediately continue with `/sp.deep-research` / `sp-deep-research`.
- Do not create or persist a separate `sp-research` workflow state.

## Output Contract

- Do not write separate `sp-research` artifacts.
- If a workflow state is written, it must use `active_command: sp-deep-research`.
- If deep research is not needed, let the canonical `sp-deep-research` command write its lightweight not-needed handoff.

## Guardrails

- If this command was invoked for generic web research rather than a planning-ready spec feasibility gate, route to the passive external/web research skill instead of writing Spec Kit feature artifacts.
- Do not treat `sp-research` as a replacement for `sp-plan` or any implementation workflow.

## Codex Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, confirm the current runtime exposes `spawn_agent`, `wait_agent`, and `close_agent`; if they are not visible, use the active tool discovery mechanism for multi-agent or subagent tools first.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch bounded subagents through `spawn_agent`.
- Join behavior: Rejoin with `wait_agent`, integrate, then `close_agent`.
- Preserve this workflow's existing packet, handoff, artifact, and result schema; this section only governs capability discovery before dispatch or blocked-state recording.
