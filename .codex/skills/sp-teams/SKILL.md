---
name: "sp-teams"
description: "Use when you need the Codex-only `sp-teams` runtime surface from the official product entry point."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/team.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: You need the official Codex team/runtime surface instead of an agent-specific alias or extension-internal command.
- **Primary objective**: Route the operator to `sp-teams` and validate the supported runtime boundary.
- **Primary outputs**: Runtime entrypoint guidance and environment validation only.
- **Default handoff**: `sp-teams` or the generated `sp-teams` skill surface.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## Blocked Exit Contract

If blocked after safe recovery, read and follow
`.specify/templates/workflow-blocker-template.md` and its JSON schema. Never
return only an error or “ask a human”; preserve state and keep agent-capable
repair agent-owned. Set `human_action_required: true` only for authority,
credentials, protected systems, human decisions/reviews, or physical access.
Tailor steps, expected results, failure paths, evidence, and resume action to
CI, visual review, or product decisions. Never claim completion.

# Codex Team Runtime

## Objective

Point the user at the supported Codex team/runtime surface and keep unsupported runtime aliases or backdoors out of the primary workflow.

## Context

- This surface is Codex-only.
- It exists to route users to the official `sp-teams` product entry point rather than to internal runtime plumbing.
- The runtime still requires a tmux-capable environment and the generated Codex team assets.

## Process

- Present the official runtime surface and its first-release boundary.
- Validate that the required runtime prerequisites exist.
- Redirect users away from unsupported or deprecated entry points.

## Output Contract

- Provide runtime entrypoint guidance and validation expectations only.
- Keep the supported operator-facing command surface unambiguous.

## Guardrails

- Do not surface this guidance through non-Codex integrations.
- Do not teach internal or deprecated aliases as the supported product surface.
- Do not imply the runtime works without the required environment prerequisites.

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

Official product surface:

```text
sp-teams
```

Generated skill name: `sp-teams`

First-release boundary:

1. Codex-only
2. Requires a tmux-capable environment
3. Existing-project upgrades are optional and non-blocking

Validation:

1. Run `sp-teams`
2. Confirm `tmux` is available
3. Confirm `.specify/teams/runtime.json` exists
4. Do not treat legacy aliases as the supported product surface for this repository

## Audience

This guidance belongs to the Codex-only team/runtime surface. Do not surface these instructions through other agent integrations or treat non-Codex runtimes as the intended audience.

Agent automation should prefer the `specify-teams-mcp` MCP facade when it is configured. Keep `sp-teams` as the human/operator CLI and parity fallback surface.
