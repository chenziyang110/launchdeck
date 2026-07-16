# Launchdeck Product Discovery

## Opportunity

Modern coding agents can write code, but they still manage projects through fragile shell guesses: install, build, run, test, inspect logs, stop servers, and clean caches all vary by stack. The opportunity is to create a universal project lifecycle control tool that gives agents and humans a consistent, safe interface across any software project.

Launchdeck should be the control plane, not only an agent skill. The agent-facing skill, MCP server, and editor integrations become thin adapters over the same lifecycle protocol and CLI.

## Target Users

- Coding agents that need reliable project operations without ad hoc shell spelunking.
- Developers who want one local control interface across many stacks.
- Teams that want project-specific runbooks encoded in a machine-readable way.
- Tool builders who need process, log, and task state exposed as structured data.

## PM Ideas

1. Lifecycle contract file: `.launchdeck.yml` declares setup, build, package, dev, start, test, stop, logs, and clean behavior.
2. Risk-aware command model: tasks declare `low`, `medium`, `high`, or `destructive` risk so agents know what can run automatically.
3. Stack discovery engine: detect npm, pnpm, Python, Go, Rust, Docker Compose, Make, Just, and Taskfile conventions.
4. Agent-readable output: every command supports JSON status, errors, paths, ports, and next suggested action.
5. Template gallery: starter lifecycle profiles for common stacks and monorepos.

## Designer Ideas

1. First-run wizard: ask a few direct questions and produce `.launchdeck.yml`.
2. Project health dashboard: show configured tasks, current processes, logs, ports, stale state, and safe cleanup targets.
3. Risk language that feels operational: clear prompts for risky cleanup, dependency reinstall, database reset, and destructive actions.
4. Log views optimized for agents and humans: tail, search, highlight errors, and expose recent command boundaries.
5. Onboarding report: after `doctor`, show what Launchdeck understood and what is missing.

## Engineer Ideas

1. Managed process registry: record PID, command, cwd, env, ports, log file, start time, and status for long-running tasks.
2. Cross-platform process tree stop: stop shell children reliably on Windows, macOS, and Linux.
3. Safe path deletion: clean only configured paths inside the project root unless explicitly confirmed.
4. Pluggable task adapters: normalize package scripts, Make targets, Docker Compose services, and language-specific tools.
5. MCP-compatible API surface: keep CLI output and internal objects ready for later MCP tools.

## Prioritized v0.1 Ideas

1. `.launchdeck.yml` lifecycle protocol
   - Reasoning: This is the product's foundation. Without a shared contract, every agent remains stuck guessing.
   - Assumptions to test: Users will accept hand-written config if examples are clear; a minimal schema can cover many project types.

2. Core CLI task runner
   - Reasoning: A real tool is easier to validate than a skill document. The CLI becomes the stable surface for agents.
   - Assumptions to test: `launchdeck build`, `launchdeck test`, and `launchdeck dev` feel easier than reading project docs.

3. Managed long-running processes
   - Reasoning: Agents frequently start dev servers and lose track of how to stop or inspect them.
   - Assumptions to test: PID, port, and log tracking solve enough pain before more advanced orchestration exists.

4. Safe cleanup model
   - Reasoning: Cache cleanup is useful but risky. The product needs early trust boundaries.
   - Assumptions to test: Teams can separate safe cleanup paths from risky reset paths in config.

5. `doctor` and JSON output
   - Reasoning: Agents need a fast way to understand whether the lifecycle contract is usable.
   - Assumptions to test: Structured checks expose enough information for agents to recover from missing or invalid config.

## v0.1 Boundary

In scope:

- Hand-written `.launchdeck.yml`
- `init`, `doctor`, `run`, common lifecycle aliases
- Managed `dev/start`, `ps`, `logs`, `stop`
- Safe and risky clean target separation
- JSON output for agent integration
- Node-based cross-platform CLI

Out of scope:

- GUI
- MCP server
- Automatic stack detection
- Remote environments
- CI orchestration
- Template marketplace
- Database reset workflows

## Validation Plan

Test Launchdeck against three real projects:

- A Vite/Next-style Node app
- A FastAPI/Django-style Python API
- A mixed project with Docker Compose or Make

For each project, verify that an agent can run:

```bash
launchdeck doctor --json
launchdeck setup
launchdeck build
launchdeck test
launchdeck dev
launchdeck ps --json
launchdeck logs dev
launchdeck stop dev
launchdeck clean --safe
```
