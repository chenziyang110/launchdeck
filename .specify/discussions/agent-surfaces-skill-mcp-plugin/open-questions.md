# Open Questions

No hard unknown or open conflict blocks specification.

## Soft Unknowns

- `SU-001`: Current official Codex materials reviewed during discussion did not establish MCP form elicitation as a portable baseline. Owner: downstream evidence/host verification. Latest safe resolution: before enabling medium-risk MCP execution. Reopen condition: first release is required to execute medium-risk tasks.
- `SU-002`: Exact bundled MCP path substitution and manifest fields must be verified independently in real Codex and Claude Plugin hosts. Owner: downstream specification and host verification. Latest safe resolution: before either host-specific Plugin readiness claim. Reopen condition: one host cannot start the bundled runtime without install-time scripts or global CLI.
- `SU-003`: Agent Operation Result field names and individual MCP output schemas need exact specification. Owner: downstream specification. Latest safe resolution: before implementation planning. Reopen condition: CLI compatibility or MCP client schema limitations invalidate the selected outcome/resource separation.
- `SU-004`: Operation-journal storage/retention defaults need exact specification. Owner: downstream specification and planning. Latest safe resolution: before journal implementation. Reopen condition: retention can hide recovery evidence or grow without bound.
- `SU-005`: User-level Codex Skill migration/compatibility behavior between legacy `~/.codex/skills` and current `$HOME/.agents/skills` needs an explicit contract. Owner: downstream specification. Latest safe resolution: before installer changes. Reopen condition: migration could overwrite divergent user content or create ambiguous duplicate Skills.

