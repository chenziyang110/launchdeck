# Quick Summary: Agent Skill Canonical Path

Status: resolved

## Outcome

`launchdeck-agent` is now stored as a project-level skill source under `.agents/skills/launchdeck-agent`.

Host-specific directories such as `.codex/skills` are documented as generated or synced targets, not canonical product source.

## Changed Code Paths

Added or updated:

- `.agents/README.md`
- `.agents/scripts/sync-skills.ps1`
- `.agents/scripts/validate-skills.ps1`
- `.agents/skills/launchdeck-agent/SKILL.md`
- `.agents/skills/launchdeck-agent/references/*.md`
- `.planning/quick/2026-07-09-agent-skill-canonical-path/STATUS.md`
- `.planning/quick/2026-07-09-agent-skill-canonical-path/worker-results/lane-001.json`
- `.specify/project-cognition/updates/sp-quick-closeout.json`

Updated workflow records:

- `.specify/features/2026-07-09-launchdeck-agent-skill/**`

Removed as canonical source:

- the prior Codex-host-specific `launchdeck-agent` skill copy

## Changed Behavior Surfaces

- Project skill source convention: `.agents/skills` is canonical.
- Host adapter convention: `.codex/skills` is a generated or synced target.
- Skill validation: `.agents/scripts/validate-skills.ps1` verifies required files and unsafe process guidance.
- Skill sync: `.agents/scripts/sync-skills.ps1` defaults to check mode and only copies with explicit `-Copy`.

No Launchdeck CLI runtime behavior changed.

## Verification Evidence

- `powershell -NoProfile -ExecutionPolicy Bypass -File .agents/scripts/validate-skills.ps1` passed; checked 8 required skill files.
- `powershell -NoProfile -ExecutionPolicy Bypass -File .agents/scripts/sync-skills.ps1` passed in check mode; no host copy was generated.
- `rg` old-path sweep across `.agents`, this quick task, and the feature package returned no matches.
- A `Test-Path` check confirmed the old Codex-host-specific product copy does not exist.
- Project cognition update recorded `upd-20260709T101713.027503400Z`, then `complete-refresh` returned `fresh`, `query_ready`, and `dirty=false`.

## Unverified Surfaces

- No MCP server behavior was checked or implemented; MCP remains future scope.
- No generated host copy was created because sync was validated in check mode only.

## Residual Risk

If a specific agent host requires a physical skill copy under its own directory, run `.agents/scripts/sync-skills.ps1 -Copy` deliberately from the repository root.

## Project Cognition Refresh

Result: fresh

Project cognition recorded the project-owned `.agents/skills/launchdeck-agent` source paths and the quick-task artifacts. The final `complete-refresh` state is clean. The prior `.specify/features/2026-07-09-launchdeck-agent-skill` records were ignored by cognition rules as workflow artifacts.
