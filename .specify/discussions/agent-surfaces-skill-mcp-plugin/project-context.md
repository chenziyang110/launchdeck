# Project Context And Truth Pass

## Locked Boundary

- Current and target repository: `F:/github/launchdeck`.
- Repository role: implementation target and source of truth for current CLI, control-plane, Skill, installer, documentation, and tests.
- External systems in scope: local operating-system process/port/filesystem surfaces, MCP host protocol behavior, and Codex/Claude Plugin hosts.
- No external implementation repository is in scope.

## Verified Project Facts

- `package.json` exposes a Node.js 20+ ESM CLI package and currently ships `src/`, `schema/`, and `.agents/skills/launchdeck-agent/`.
- `.agents/skills/launchdeck-agent/` already contains one reference-driven canonical Skill with adoption, discovery, lifecycle, recovery, clean-safety, and eval guidance.
- `src/agent-installer.js` installs that Skill for Codex, Claude Code, GitHub Copilot, and Visual Studio at project/user scopes.
- `src/output.js` implements stable success/failure/partial JSON envelopes, compact agent output, public error codes, and safe next actions.
- `src/global-runtime.js`, `src/runtime.js`, and `src/control-plane/*` export reusable registry, run, ownership, lock, inspect, log, event, and process primitives.
- `src/cli.js` still owns significant argument parsing plus application orchestration; a durable MCP adapter should not duplicate those private handlers.
- There is no MCP server or Plugin package in the repository today.
- Existing cross-platform smoke explicitly excludes MCP and editor/Plugin surfaces.
- Targeted installer, CLI envelope, and control-plane contract verification passed 33 tests during the discussion truth pass.
- Task `risk` is normalized and displayed, but current repository search did not show a single Kernel execution gate enforcing it across `run/start`.
- The current Codex project Skill location `.agents/skills` matches current official guidance; the installer user target `~/.codex/skills` needs compatibility/migration review against current `$HOME/.agents/skills` guidance.

## Evidence Confidence

Advice confidence is high for the current repository shape and selected architecture. Project cognition was unavailable because the graph store was missing, so all project-specific claims above were grounded in bounded live repository reads and targeted tests rather than cognition assertions.

## Authoritative External Evidence

- Current Codex official documentation for Skills, Plugins, and MCP capabilities.
- Current Claude Code official documentation for Skills, Plugins, and MCP bundling.
- Model Context Protocol specification for stdio/Streamable HTTP, tools, output schema, annotations, and elicitation.

