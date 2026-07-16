# Project Agent Sources

`.agents` is the canonical project-level source for Launchdeck agent assets.

## Layout

- `.agents/skills/` contains skill source packages owned by this repository.
- `.agents/skills/launchdeck-agent/` is the canonical source for the Launchdeck agent skill.
- `.agents/mcp/` is reserved for future project-owned MCP configuration or server assets.
- Host-specific directories such as `.codex/` are generated or synced targets, not product source.

## Host Sync

Prefer `launchdeck agent paths`, `launchdeck agent doctor`, and `launchdeck agent install` for cross-platform user-facing installs.

Use `.agents/scripts/validate-skills.ps1` to check the canonical skill source.

Use `.agents/scripts/sync-skills.ps1` only as a repository-local PowerShell helper to preview or copy project skills into a host target such as `.codex/skills`. The script defaults to check mode and does not delete generated host files.
