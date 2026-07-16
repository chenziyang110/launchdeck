---
name: "sp-taskstoissues"
description: "Use when tasks.md is ready and you want actionable, dependency-aware GitHub issues generated from it."
argument-hint: "Optional filter or label for GitHub issues"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/taskstoissues.md"
user-invocable: true
---
## Invocation Syntax

- In this integration, invoke workflow skills with `/sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: The task plan is stable enough to project onto GitHub issues instead of staying only in `tasks.md`.
- **Primary objective**: Convert the current task graph into actionable GitHub issues while preserving ordering and dependency intent.
- **Primary outputs**: GitHub issues aligned with the current `tasks.md` structure and design artifact context.
- **Default handoff**: Start implementation from the tracked issues or refresh the issue set after later task-plan changes.
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

Project the current task plan onto GitHub issues without losing execution ordering, dependency intent, or repository targeting accuracy.

## Context

- Primary inputs: `tasks.md`, the active feature context, and the current Git remote.
- This command assumes the repository remote is a GitHub URL and that issue creation is permitted through the configured GitHub surface.
- The issue projection should stay downstream of the planning workflow rather than becoming a parallel source of truth.

## Process

- Resolve the active feature and task artifacts.
- Confirm the repository remote targets GitHub.
- Create issues that mirror the current task graph closely enough to drive follow-on execution.

## Output Contract

- Produce GitHub issues that align with the active task breakdown.
- Preserve execution intent well enough that later implementation work can follow the issue set without losing the original task structure.
- Abort cleanly if the remote or tooling boundary makes issue creation unsafe.

## Guardrails

- Do not create issues for non-GitHub remotes.
- Do not continue if the target repository cannot be matched to the configured remote.
- Do not treat generated issues as permission to ignore later task-plan updates.

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

## Mandatory Subagent Execution

All substantive tasks in ordinary `sp-*` workflows default to and must use subagents.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.


## Outline

1. Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").
1. From the executed script, extract the path to **tasks**.
1. Get the Git remote by running:

```bash
git config --get remote.origin.url
```

> [!CAUTION]
> ONLY PROCEED TO NEXT STEPS IF THE REMOTE IS A GITHUB URL

1. For each task in the list, use the GitHub MCP server to create a new issue in the repository that is representative of the Git remote.

> [!CAUTION]
> UNDER NO CIRCUMSTANCES EVER CREATE ISSUES IN REPOSITORIES THAT DO NOT MATCH THE REMOTE URL

## Claude Code Subagent Capability Discovery

- Execution model: preserve the workflow's existing `subagent-mandatory`, `subagents-first`, `adaptive`, or `subagent-assisted` policy.
- Dispatch shape: preserve the workflow's existing dispatch shape; use `subagent-blocked` only after the discovery step below fails or is unsafe.
- Execution surface: prefer `native-subagents` when the current runtime supports it; use `none` only after recording the unavailable or unsafe surface.
- Native subagent capability discovery: Before recording `subagent-blocked`, check the active tool surface for the integration-native subagent or task-dispatch entrypoint and record the exact missing surface if unavailable.
- Do not record `subagent-blocked` until this capability discovery step is complete and the exact unavailable or unsafe surface is recorded.
- Native subagent dispatch: Dispatch subagents through the integration's native subagent support using the shared prompt contract.
- Join behavior: Use the integration-native join point, then integrate results back on the leader path.
- Preserve this workflow's existing packet, handoff, artifact, and result schema; this section only governs capability discovery before dispatch or blocked-state recording.
