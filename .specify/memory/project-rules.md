# Project Rules

Shared defaults that later `sp-xxx` workflows should follow across specification,
planning, implementation, debugging, and quick-task execution.

Promote only stable project rules here. Keep one-off observations in passive
candidate learning files until recurrence or explicit confirmation proves they
belong in this shared rule layer.

---

## Agent Asset Layout

- Project-owned agent skills live under `.agents/skills/<skill-name>/`.
- Host-specific directories such as `.codex/skills` are generated or synced targets, not canonical product source.
- For Launchdeck's own lifecycle skill, edit `.agents/skills/launchdeck-agent/` first and then sync to host adapters only when needed.
