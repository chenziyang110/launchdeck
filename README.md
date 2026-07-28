# Launchdeck

[![CI](https://github.com/chenziyang110/launchdeck/actions/workflows/ci.yml/badge.svg)](https://github.com/chenziyang110/launchdeck/actions/workflows/ci.yml)

Launchdeck is a CLI-first, user-scoped global control plane for local project services. It discovers `.launchdeck.yml` by searching upward from the current directory for project-local commands, then uses a user-level registry for cross-project visibility.

The base feature is daemonless. Launchdeck keeps one authoritative control-plane namespace for the current user, with shared state, locks, logs, events, and live OS inspection.

## Install

Launchdeck requires Node.js 20 or newer. npm registry publication is a separate release step; the supported v0.3.0 package can be installed directly from its immutable GitHub tag.

Install the CLI globally:

```bash
npm install --global github:chenziyang110/launchdeck#v0.3.0
launchdeck --help
launchdeck agent setup --host codex --component runtime,skill,mcp --scope user --yes --json
launchdeck agent status --host codex --scope user --json
```

Or install it into another project:

```bash
npm install --save-dev github:chenziyang110/launchdeck#v0.3.0
npx launchdeck --help
npx launchdeck agent setup --host codex --component runtime,skill,mcp --scope project --project . --yes --json
npx launchdeck agent status --host codex --scope project --project . --json
```

Run the project-local form from the consuming project. A Launchdeck source checkout does not need to add Launchdeck as its own dependency; use `node src/cli.js ...` there. Host trust or reload may still be required after setup, so confirm readiness with `agent status` or `agent doctor` for the same host, scope, and build.

To work from a source checkout instead:

```bash
git clone https://github.com/chenziyang110/launchdeck.git
cd launchdeck
npm ci
npm install --global .
launchdeck --help
```

## What v0.2 Covers

- `init` creates a project-local `.launchdeck.yml`.
- `doctor` inspects config and reports stable findings.
- `tasks` lists configured tasks without running them.
- `run <task>` executes a task in the foreground unless `longRunning: true` makes it managed.
- `setup`, `build`, `package`, `test`, `lint`, and `typecheck` are aliases for `run <same-name>`.
- `dev` is shorthand for `start dev`.
- `project add`, `project remove`, `project scan`, `project repair`, and `projects` manage the user-level registry.
- `start`, `stop`, `force-stop`, `restart`, and `reconcile` manage Launchdeck-owned runs.
- `status --all`, `ps --all`, `ports`, `conflicts`, `inspect`, and `inspect-port` provide global visibility.
- `logs` and `events` support bounded reads and `--follow` JSON Lines streaming.
- `clean`, `clean --safe`, and `clean --all --yes` handle safe hygiene only.
- `agent paths`, `agent doctor`, and `agent install` expose the local Launchdeck agent skill installer.
- `agent setup`, `agent status`, `agent update`, `agent repair`, and `agent uninstall` manage receipt-owned runtime, Skill, MCP, launcher, and host configuration artifacts.
- Codex, Claude Code, GitHub Copilot, and Visual Studio adapters use an exact compatibility matrix and evidence-cell claim boundary instead of broad host-readiness claims.
- `--json` emits a stable machine-readable envelope with `schemaVersion` and `next` actions.
- `--json --compact` emits a shorter machine-readable envelope for agents and scripts that need lower-token status checks.

## Unified Lifecycle And Agent Boundary

Launchdeck uses one lifecycle model across the CLI, MCP, and installed Agent surfaces. The CLI is the human and automation entrypoint, MCP exposes the bounded Agent operation catalog, and the installed `launchdeck-agent` Skill decides when to use MCP first or a compatible CLI JSON fallback. All mutation still flows through the shared Kernel and the same ownership, compatibility, lock, journal, and recovery rules.

The installer and installed Agent have separate responsibilities:

- The installer installs or repairs Launchdeck-owned runtime, Skill, MCP, launcher, host config, and receipt artifacts. It never authors a project `.launchdeck.yml`.
- The installed Agent may author one missing project `.launchdeck.yml` only after an explicit config-authoring request, bounded project inspection, and preservation of any existing config.
- Host approval, host trust prompts, extension reloads, and runtime readiness are separate layers. Installing files does not prove the host has approved, trusted, reloaded, or launched the MCP runtime unless exact evidence says so.
- Project scope is the default for setup/install planning. User scope is explicit and must be selected with `--scope user`; it is not silently inferred from home-directory access.

Host support is evidence-cell based. A claim applies only to the exact host, host version, component, scope, platform, build identity, and scenario recorded for that cell. The current evidence index deliberately withholds broad real-host readiness claims for the current candidate; deterministic fixtures prove fixture behavior, not unverified real hosts or operating systems.

## Quick Demo

The official demo lives in `examples/demo-api/`. It is checked in, uses a fixture server, and can be exercised from the repository root.

Use an isolated home so the demo does not change your normal registry:

```powershell
$env:LAUNCHDECK_HOME = "$PWD\\.tmp\\demo-api-launchdeck-home"
```

1. Register the demo.

```powershell
node src/cli.js project add examples/demo-api --alias demo --json
node src/cli.js projects --json
```

2. Start the managed API.

```powershell
node src/cli.js start demo:dev --json
```

3. Inspect the run and its ports.

```powershell
node src/cli.js inspect task:demo:dev --json
node src/cli.js inspect port:8888 --json
node src/cli.js status --all --json
node src/cli.js ps --all --json
node src/cli.js ports --json
node src/cli.js conflicts --json
```

4. Read logs and events, then follow logs as JSON Lines.

```powershell
node src/cli.js logs demo:dev --json
node src/cli.js events demo --json
node src/cli.js logs demo:dev --follow --json
```

`logs --follow --json` is a foreground stream. Press `Ctrl+C` when you have seen enough lines.

5. Reconcile stale state by asking the demo fixture to exit outside Launchdeck's stop path.

```powershell
curl.exe http://127.0.0.1:8888/_demo/exit
node src/cli.js reconcile demo --json
node src/cli.js stop demo:dev --json
```

6. Clean safely from the demo project directory.

```powershell
Push-Location examples/demo-api
node ../../src/cli.js clean --safe --json
Pop-Location
```

The demo server also exposes a controlled exit endpoint so stale state recovery can be exercised without killing unmanaged processes.

## Agent-Authored Flask Flow

The Agent-first Flask acceptance path uses `demos/flask-server/` as a fresh copied project. The installer setup step installs the Agent surface and must leave `.launchdeck.yml` absent. A deterministic installed-Agent fixture process, standing in for a real host conversation, reads the installed `launchdeck-agent` Skill, inspects the copied Flask project, calls production MCP stdio `capabilities.get`, and authors the reviewable `.launchdeck.yml`. This fixture is intentionally not described as an LLM or interactive host; real-host/OS claims require separate evidence cells.

After the config exists, the accepted public webpage flow is:

```text
launchdeck up --json
launchdeck status --all --json
launchdeck logs start --json
launchdeck down --json
```

Expected evidence is a healthy managed Flask process, `status --all` visibility, `logs start` returning `task`, `logPath`, and non-empty Flask process log content, an HTTP request reaching the webpage, and `down` cleanup in a `finally` path.

## Concepts

- The registry is user-scoped and stores stable `projectId` values plus unique aliases.
- The run index tracks Launchdeck-owned runs across registered projects.
- Ownership proof is required for stop, restart, and force-stop. Port or PID alone is not enough.
- `inspect` is the unified read-only view for projects, tasks, runs, ports, PIDs, and conflicts.
- `clean` is hygiene only. Destructive `reset` is separate and deferred.
- Structured refusals include `next` actions that explain safe follow-up commands.

## Config

Launchdeck reads one of these files, in upward search order from the current directory:

- `.launchdeck.yml`
- `.launchdeck.yaml`
- `launchdeck.yml`
- `launchdeck.yaml`

The directory that contains the discovered file becomes `projectRoot`.

`project.name` is optional. If you omit it, Launchdeck falls back to the project root directory name.

### Minimal shape

```yaml
version: 1
tasks:
  build:
    command: npm run build
```

### Full v1 shape

```yaml
version: 1
project:
  name: example-app
tasks:
  setup:
    command: npm install
    description: Install dependencies
    risk: medium
  build:
    command: npm run build
    description: Build production assets
    risk: medium
  test:
    command: npm test
    description: Run the test suite
  dev:
    command: node scripts/server.js --port 8888
    cwd: .
    env:
      PORT: "8888"
    description: Start the development server
    risk: low
    longRunning: true
    ports: [8888]
    log: .launchdeck/logs/dev.log
clean:
  safe:
    - dist
    - { path: .cache, description: Cached build output }
  risky:
    - node_modules
```

### Task fields

- `command` is required and stays a shell string.
- `cwd` is project-relative and must remain inside the project root.
- `env` adds environment variables to the task process.
- `description` is human-readable metadata.
- `risk` is one of `low`, `medium`, `high`, or `destructive`. The default is `medium`.
- `longRunning: true` marks a task as managed instead of foreground.
- `ports` records the ports a managed task claims.
- `log` sets a project-relative log path. If omitted, Launchdeck uses `.launchdeck/logs/<task>.log`.

### Clean targets

- `clean.safe` and `clean.risky` accept strings or objects with `path` and optional `description`.
- `clean` is a dry-run preview by default.
- `clean --safe` removes only safe targets.
- `clean --all --yes` removes safe and risky targets.
- The runtime planner, not the schema, decides whether a target is acceptable. It can refuse the project root, out-of-root paths, empty targets, or ambiguous targets.

## Command Reference

| Command | Behavior |
| --- | --- |
| `launchdeck init [--force]` | Writes `.launchdeck.yml` in the current directory and refuses existing target or ancestor configs unless `--force` is set. |
| `launchdeck doctor [--json]` | Reads the config and reports `ok`, `warn`, or `error` findings without mutating state. |
| `launchdeck tasks [--json]` | Lists the normalized task inventory; human output shows `foreground` or `managed` plus risk, ports, and command, while JSON includes the full normalized task metadata. |
| `launchdeck run <task> [--json]` | Runs a configured task. Foreground tasks stream output and return the child exit code. Managed tasks are started and recorded. |
| `launchdeck setup, build, package, test, lint, or typecheck [--json]` | Alias for `launchdeck run <same-name>`. |
| `launchdeck dev [--json]` | Alias for `launchdeck start dev`. |
| `launchdeck project add [path] [--alias alias] [--name name] [--json]` | Registers a project in the global registry. Re-adding the same root updates the existing entry instead of creating a duplicate. |
| `launchdeck project repair <name, id, or path> [--path path] [--config path] [--alias alias] [--json]` | Repairs registry metadata without changing project identity. |
| `launchdeck project remove <name, id, or path> [--json]` | Removes a registry entry only. Project files, runtime files, and logs are not deleted. Removal refuses active owned runs. |
| `launchdeck project scan <dir> [--json]` | Explicitly scans a supplied directory for Launchdeck configs, skipping generated or heavy directories such as `node_modules`, `.git`, and `.launchdeck`, then registers matches idempotently. |
| `launchdeck projects [--json]` | Lists globally registered projects. |
| `launchdeck status --all [--json]` | Summarizes registered projects, managed process state, declared ports, conflicts, and registry errors in one global view. |
| `launchdeck ps [--all] [--json]` | Refreshes managed state and lists running, stopped, stale, or unknown records. `--all` aggregates registered projects. |
| `launchdeck ports [--json]` | Lists declared managed ports for registered projects with current process and ownership status. |
| `launchdeck conflicts [--json]` | Lists declared-port conflicts across registered projects, including externally occupied declared ports and Launchdeck ownership conflicts, without stopping anything. |
| `launchdeck inspect <target> [--json]` | Unifies inspection for `project:<alias, id, or path>`, `task:<project:task>`, `run:<runId>`, `port:<port>`, `pid:<pid>`, and `conflict:<id>`. |
| `launchdeck inspect-port <port> [--json]` | Compatibility wrapper for `launchdeck inspect port:<port>`. |
| `launchdeck start [task or project:task] [--json]` | Starts a managed task. Without a task, it uses `start` when configured, otherwise `dev`. Declared ports are checked before spawning. |
| `launchdeck up [task or project:task] [--json]` | Accepted Agent-facing alias for managed start. Without a task, it uses `start` when configured, otherwise `dev`. |
| `launchdeck stop [task or project:task] [--force-owned] [--json]` | Stops one managed task or all currently running managed tasks when no task is given. `--force-owned` only strengthens termination for verified-owned runs. |
| `launchdeck down [task or project:task] [--json]` | Accepted Agent-facing alias for managed stop. It follows the same Launchdeck-owned process boundary as `stop`. |
| `launchdeck force-stop <project:task> [--json]` | Explicit force command for verified-owned process trees. |
| `launchdeck restart [task or project:task] [--json]` | Stops then starts a managed task. Partial failures stay inspectable. Global `project:task` targets use the registry. |
| `launchdeck reconcile [project[:task]] [--json]` | Refreshes stale Launchdeck state against live OS observations without killing unmanaged processes. |
| `launchdeck logs [task or project:task] [--lines 80] [--follow] [--json]` | Reads task logs. With `--follow --json`, it streams JSON Lines instead of a single JSON object. |
| `launchdeck events [target] [--lines 80] [--follow] [--json]` | Reads structured event history. With `--follow --json`, it streams JSON Lines. |
| `launchdeck clean [--safe] [--all --yes] [--json]` | Plans cleanup targets, previews by default, and requires confirmation for risky cleanup. |
| `launchdeck agent paths [--json]` | Lists the canonical `launchdeck-agent` skill source plus known project and user skill target directories. |
| `launchdeck agent doctor [--json]` | Validates the canonical skill package and conservative adapter matrix without writing files. |
| `launchdeck agent install --agent <id> [--scope project\|user] [--dry-run] [--force] [--target dir] [--json]` | Copies `.agents/skills/launchdeck-agent` into one selected local agent host target. Defaults to project scope; user scope must be explicit. |
| `launchdeck agent setup --host <id> --component <name> --scope project\|user [--project path] [--dry-run] [--yes] [--json]` | Plans and, after explicit approval, installs the selected receipt-owned Agent components for an exact scope and host. |
| `launchdeck agent status [--host <id>] [--scope project\|user] [--project path] [--json]` | Reports receipt ownership, build identity, drift, host approval/reload state, and runtime readiness without mutation. |
| `launchdeck agent doctor [--host <id>] [--scope project\|user] [--project path] [--json]` | Applies the failing health gate to the same read-only installation evidence reported by status. |
| `launchdeck agent update [--host <id>] [--scope project\|user] [--project path] [--dry-run] [--yes] [--json]` | Creates and verifies a new immutable build receipt while retaining the previous recoverable build. |
| `launchdeck agent repair [--host <id>] [--scope project\|user] [--project path] [--force] [--dry-run] [--yes] [--json]` | Recreates only proven receipt-owned missing or divergent targets; unrelated content remains outside the repair boundary. |
| `launchdeck agent uninstall [--host <id>] [--scope project\|user] [--project path] [--dry-run] [--yes] [--json]` | Removes only revalidated receipt-owned targets and preserves user-authored or unrelated content. |

## Observability Streams

- `logs --follow --json` emits JSON Lines with `schemaVersion`, `type`, `runId`, `line`, and `timestamp`.
- `events --follow --json` emits JSON Lines with `schemaVersion`, `eventId`, `transactionId`, `timestamp`, `level`, `type`, `projectId`, `alias`, `task`, `runId`, `message`, `data`, and `next`.
- Both follow modes are visible CLI processes, not hidden background watchers.

## Global Control Plane

`launchdeck project add` writes a user-level registry so commands can report across projects without needing to run from each project directory. `launchdeck project remove <target>` removes only the registry entry. `launchdeck project scan <dir>` is explicit and bounded; it skips generated or heavy directories and does not crawl the whole machine. Set `LAUNCHDECK_HOME` to override the registry location, which is useful for tests or isolated workspaces.

The registry stores project identity and config paths. Project-local `.launchdeck/runtime/state.json` remains a compatibility and recovery source, not the global source of truth.

Launchdeck does not kill unknown external processes. If a declared port is already occupied before a managed task starts, Launchdeck returns `port_conflict` and suggests `inspect` instead of spawning a duplicate service.

`project remove` refuses active Launchdeck-owned runs and never deletes project files, runtime files, or logs. `reconcile` repairs stale state and explains unresolved evidence; it does not terminate unmanaged listeners.

## Agent Skill Installer

Launchdeck owns the canonical agent skill at `.agents/skills/launchdeck-agent`. Host-specific skill folders are generated or synced targets.

The table below documents target paths, not an aggregate support guarantee. A host/version/component/scope row is supported only when the compatibility matrix and evidence index contain a current matching cell.

| Agent ID | Project target | User target |
| --- | --- | --- |
| `codex` | `.agents/skills` | `~/.agents/skills` |
| `claude-code` | `.claude/skills` | `~/.claude/skills` |
| `github-copilot` | `.github/skills` | `~/.copilot/skills` |
| `visual-studio` | `.github/skills` when supported | no confirmed native user Skill target |

`launchdeck agent install` copies the skill directory into `<target>/launchdeck-agent`. It does not delete target files, and it refuses divergent existing targets unless `--force` is supplied. Use `--dry-run` to preview planned writes. Use `--target <dir>` only when you want an explicit skill-root override, such as an isolated test or manual sync destination.

`agent paths`, `agent install`, `agent setup`, `agent status`, and `agent doctor` return structured entrypoint identity for the package CLI module, stable MCP launcher, and pinned runtime, including existence, scope, and build identity. Setup/update/repair/uninstall also report exact host evidence boundaries: detected host/version, selected component, target path, digest, receipt ownership, and any host approval/reload/readiness state. A pending host approval or required reload is not the same as runtime readiness. Immutable build receipts pin the launcher and MCP runtime to a verified build identity; update creates a new receipt instead of mutating the meaning of an old one.

## Agent And Plugin Surfaces

The canonical Skill resolves one entrypoint deterministically: available Launchdeck MCP, global `launchdeck`, project-local `node_modules/.bin/launchdeck`, then `src/cli.js` only in a verified Launchdeck source checkout. It reuses the handshake winner for the request. Before any mutation dispatch, MCP unavailability may fall back to compatible CLI JSON for capabilities, project listing, and read-only config discovery. Once a mutation may have been dispatched, it recovers by operation ID or a bounded correlation query; it never switches entrypoints or repeats the mutation on another surface.

Adoption inspection remains read-only. MCP `adoption.inspect` is used only for a registered/resolved target; an unregistered missing-config project is inspected through the Agent's bounded workspace read surface because the CLI adoption command also requires an existing config. When a user explicitly asks to create a project-adapted `.launchdeck.yml`, the Skill may write one missing config for exact or strong candidates and validate it with `launchdeck doctor`. It preserves any existing config and never registers, starts, stops, restarts, cleans, or controls processes as a config-authoring side effect.

Build the separate Codex and Claude artifacts with:

```bash
npm run agent:build
```

Each artifact bundles a Node 20 ESM MCP runtime, a generated copy of the canonical Skill, host-specific discovery metadata, `compatibility.json`, and integrity information. Plugin installation changes only the plugin package; Launchdeck's user state home and configured project remain the control-plane authorities.

The public Agent catalog is intentionally narrower than the CLI. It supports only declared configured-project operations, bounded observations, low-risk task lifecycle actions, digest-bound safe clean, and recovery queries. It does not expose raw commands, caller-selected environments or working directories, force operations, risky clean, adoption apply, remote control, or permanent log following.

`agent/evidence/index.json` is the claim boundary for host evidence. It records the exact build, host version, operating system, and scenario for each cell; an older candidate never proves the current candidate, and a failed, blocked, or unexecuted cell stays visible. The current index deliberately makes no general host-release label: Windows Codex lifecycle, Claude fixture routing, cross-host lifecycle, and native macOS coverage still have recorded gaps.

## JSON And Errors

Commands that support `--json` emit a stable envelope. Success responses use `ok: true`; refusals and failures use `ok: false` with a stable code, message, details object, and `next` actions.

Process exit behavior is intentionally narrow: successful, no-op, dry-run, and explicit interactive decline outcomes exit 0; typed refusals, failed rollback, partial, indeterminate, or command execution failures exit 1. Human output and JSON output describe the same normalized outcome, scope, build, effect certainty, and safe next action.

Add `--compact` with `--json` when the caller needs the smallest practical response. Compact output preserves the command result, failure code/message/details, process identifiers, ports, concise `next` actions, and bounded log content, but omits duplicated `data` mirrors and verbose compatibility fields. Plain `--json` remains the full backward-compatible contract. Follow streams such as `logs --follow --json` and `events --follow --json` remain JSON Lines.

### Success envelope

```json
{
  "ok": true,
  "schemaVersion": 1,
  "command": "status",
  "data": {},
  "next": []
}
```

### Failure envelope

```json
{
  "ok": false,
  "schemaVersion": 1,
  "command": "start",
  "code": "port_conflict",
  "message": "Declared port is already occupied.",
  "details": {},
  "next": []
}
```

### Notes

- Structured refusals should always carry `next` actions when a safe follow-up exists.
- Follow streams use JSON Lines, not a single JSON object.
- During transition, some responses may mirror legacy top-level fields, but the contract keys above are the stable surface.

## Safety

- Launchdeck never kills a process it cannot prove it owns.
- `stop`, `restart`, and `force-stop` require verified Launchdeck ownership. Port or PID evidence alone is not enough.
- External processes are inspect-only by default.
- `clean` is hygiene only. It does not stop services, remove registry entries, or delete project roots, unknown files, or paths outside the project root.
- `clean --safe` preserves running evidence, latest failed evidence, and failure-linked logs and events needed to explain status.
- Destructive `reset` is not shipped as part of this release. It remains a separate feature boundary.

## Evidence Claims

The repository records evidence one exact cell at a time. A cell applies only to its build identity, host version, platform, installation scope, runtime, and scenario. Consult `agent/evidence/index.json` before describing any host behavior; do not turn a passing standalone or older-candidate cell into a claim about a different host, platform, or current candidate.

## Development

Run `npm run check`, `npm test`, and `npm run smoke` before opening a pull request. The test suite is intentionally serialized because lifecycle tests create and inspect real child processes and ports.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the GitHub Flow, branch naming, Conventional Commits, review gates, and release process. Security reports follow [SECURITY.md](SECURITY.md).

## Examples

- `examples/demo-api/` - official Launchdeck control-plane demo with a checked-in fixture server, safe clean targets, logs, events, and stale-recovery support.
- `examples/hands-on-demo/` - dependency-free hands-on demo covering JSON task, managed process, logs, and clean flows.
- `examples/node-vite.launchdeck.yml`
- `examples/python-fastapi.launchdeck.yml`
