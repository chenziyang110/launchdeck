# Requirements: Launchdeck Tool

## Target Need

Launchdeck should be a universal local project lifecycle control tool. It gives developers and coding agents one reliable interface for understanding, running, testing, stopping, logging, and safely cleaning software projects, regardless of stack.

Launchdeck must also be cross-platform. Windows, macOS, and Linux are first-class targets, not later compatibility work.

## Users

- Coding agents managing local projects without fragile shell guessing.
- Developers who work across many stacks and want one lifecycle interface.
- Teams that want project runbooks encoded as machine-readable project contracts.
- Future integrations such as skills, MCP servers, editor agents, and automation runners.

## Recommended Product Boundary

The recommended first coherent product boundary is CLI-first local lifecycle control:

- A project declares lifecycle behavior in `.launchdeck.yml`.
- Launchdeck validates that contract with `doctor`.
- Launchdeck runs short-lived tasks through named lifecycle commands.
- Launchdeck manages long-running tasks so they can be inspected, logged, restarted, and stopped.
- Launchdeck separates safe cleanup from risky cleanup.
- Launchdeck outputs human-readable text and agent-readable JSON.

This boundary is broad enough to be a real product and small enough to validate locally without cloud, GUI, or marketplace assumptions.

## In Scope

- Config protocol for stack-agnostic lifecycle declarations.
- CLI task execution for common lifecycle verbs.
- Managed process registry for long-running commands.
- Log file ownership and log tailing.
- Safe vs risky cleanup declarations.
- Local project root safety checks.
- JSON output suitable for agents.
- Dogfood usage inside the Launchdeck repository.
- Cross-platform lifecycle semantics for Windows, macOS, and Linux.

## Out of Scope

- GUI control panel.
- MCP server as the core product.
- Agent skill as the core product.
- Cloud orchestration or remote environment management.
- Template marketplace.
- Automatic framework detection as a requirement for the first coherent tool.
- CI/CD replacement.
- Database reset semantics unless explicitly configured and risk-gated later.
- Platform-specific behavior that makes one OS the real target and others best-effort.

## Success Signals

- A coding agent can run `doctor`, run configured tasks, start a dev process, inspect `ps`, read logs, stop the process, and clean safe targets without guessing project-specific shell commands.
- A human can read `.launchdeck.yml` and understand which commands are authoritative and which actions are risky.
- Cleanup cannot escape the project root and cannot silently delete risky targets.
- Long-running commands leave enough state to recover after the agent loses chat context.
- JSON output exposes task, process, log, status, and error fields in a stable shape.
- The same `.launchdeck.yml` works across operating systems unless the project explicitly declares platform-specific commands.
- Managed processes can be started, inspected, logged, and stopped predictably on Windows, macOS, and Linux.
- Clean path safety works across drive letters, path separators, case sensitivity differences, and symlink-sensitive project-root checks.

## Non-Goals To Preserve

- Do not reduce Launchdeck to a thin alias runner.
- Do not make the agent skill the product center.
- Do not treat destructive cleanup as a normal command.
- Do not require every project to use one package manager, language, or build system.
- Do not require automatic discovery before the hand-written protocol proves useful.
- Do not make cross-platform support depend on agent-specific workaround logic.

## Cross-Platform Requirements

Launchdeck must define behavior at the product level before platform-specific implementation details are chosen:

- Process management: long-running tasks must be tracked and stoppable on Windows, macOS, and Linux.
- Shell execution: command execution must be explicit about shell behavior and avoid hidden assumptions that only work on one OS.
- Path safety: task cwd, logs, runtime state, and clean targets must resolve inside the project boundary in a platform-correct way.
- Config portability: the default `.launchdeck.yml` should be portable; platform-specific overrides may exist later, but the base protocol should not force them for common cases.
- Runtime state: `.launchdeck/runtime/state.json` and logs must use stable, documented paths.
- Agent output: JSON fields and error semantics must be stable across platforms.
- Verification: release readiness requires at least one validation path on Windows, macOS, and Linux.

## Cross-Platform Contract

The product contract should be platform-neutral even when implementation uses platform-specific adapters:

- Same user-facing verbs: `doctor`, `run`, `dev`, `start`, `restart`, `ps`, `logs`, `stop`, and `clean` must mean the same thing on every supported OS.
- Same config intent: `.launchdeck.yml` should describe lifecycle intent, not OS-specific shell trivia.
- Same state model: process records must expose task name, command, cwd, PID or platform process handle, ports, log path, started time, stopped time, and status in a stable JSON shape.
- Same safety boundary: cleanup and log/runtime paths must be constrained to the project boundary on every OS.
- Same failure vocabulary: command missing, cwd missing, process already running, process not found, clean path unsafe, and config invalid should produce stable error categories later, even if human wording differs.
- Same recovery story: after an agent loses context, `doctor`, `ps`, `logs`, and `stop` should be enough to recover operational control.

Platform-specific behavior is allowed behind the contract:

- Windows may use `cmd.exe`, PowerShell-aware conventions, `taskkill`, drive-letter path checks, and Windows process APIs where needed.
- macOS and Linux may use POSIX process groups, signals, shell conventions, and symlink-aware realpath checks where needed.
- Projects may eventually declare platform-specific command overrides, but that should extend the base protocol rather than replace it.

## Packaging Default

The recommended default is: make runtime behavior cross-platform before requiring installer-level distribution.

This means npm-based Node CLI distribution can remain acceptable for the first coherent tool, as long as the command behavior itself is validated on Windows, macOS, and Linux. Standalone binaries, Homebrew, Scoop, winget, apt, or shell completions can be considered later packaging surfaces rather than first-boundary requirements.

## `.launchdeck.yml` v1 Contract

The first protocol should stay small, readable, and stable. The recommended v1 contract is:

```yaml
version: 1
project:
  name: example-app
tasks:
  setup:
    command: npm install
    risk: medium
  build:
    command: npm run build
  test:
    command: npm test
  dev:
    command: npm run dev -- --host 127.0.0.1
    longRunning: true
    ports: [5173]
    risk: medium
clean:
  safe:
    - dist
    - node_modules/.vite
  risky:
    - node_modules
```

### Task Model

Each task should support:

- `command`: required command string.
- `cwd`: optional path relative to the project root.
- `env`: optional environment variables.
- `description`: optional human-readable note.
- `risk`: `low`, `medium`, `high`, or `destructive`.
- `longRunning`: whether Launchdeck manages the process after start.
- `ports`: expected local ports for long-running tasks.
- `log`: optional project-local log path.

Short string task values should remain valid shorthand:

```yaml
tasks:
  build: npm run build
```

### Lifecycle Verbs

Launchdeck should reserve these conventional task names:

- `setup`
- `build`
- `package`
- `dev`
- `start`
- `test`
- `lint`
- `typecheck`

Projects may define additional names and run them through `launchdeck run <task>`.

### Long-Running Task Contract

For tasks with `longRunning: true`, Launchdeck must:

- start the process without blocking the calling agent forever
- record task name, command, cwd, PID or process handle, ports, log path, start time, and status
- prevent duplicate starts for the same task unless restart semantics are explicit
- expose status through `ps`
- expose output through `logs`
- stop the managed process through `stop`
- tolerate stale state when the process exited outside Launchdeck

### Cleanup Contract

Cleanup must be explicit:

- `clean.safe` can be removed with `clean --safe`.
- `clean.risky` requires a stronger confirmation path such as `clean --all --yes`.
- Launchdeck must refuse to clean the project root.
- Launchdeck must refuse clean paths that escape the project root.
- Future destructive operations should use `risk: destructive` or a separate explicit reset contract, not hide under safe cleanup.

### Platform Overrides

The base protocol should be portable by default. Platform-specific overrides may be added when necessary, but should not be required for common projects.

Recommended deferred shape:

```yaml
tasks:
  dev:
    command: npm run dev
    platforms:
      windows:
        command: npm run dev:win
      linux:
        command: npm run dev:linux
      macos:
        command: npm run dev:mac
```

The first version can reserve this design direction without requiring full implementation immediately.

### Agent-Readable Output Contract

Every command that an agent may call should eventually support `--json` with:

- `ok`: boolean
- `status` or `code`: command result
- `error`: stable error object or string on failure
- `task`: task name when relevant
- `process`: managed process object when relevant
- `processes`: process list for `ps`
- `logPath` and `content` for `logs`
- `targets` or `removed` for `clean`

Human text can evolve, but JSON field meaning should stay stable.

### Error Vocabulary

The first stable error categories should include:

- `config_not_found`
- `config_invalid`
- `task_not_found`
- `cwd_missing`
- `cwd_outside_project`
- `command_not_found`
- `process_already_running`
- `process_not_found`
- `log_not_found`
- `clean_path_outside_project`
- `clean_refuses_project_root`
- `confirmation_required`

## CLI First-Run Experience

The first product experience should be a direct CLI flow for a normal developer, independent of agent-specific usage.

Recommended confirmed flow:

```bash
launchdeck init
launchdeck doctor
launchdeck tasks
launchdeck run build
launchdeck dev
launchdeck ps
launchdeck logs dev
launchdeck stop dev
launchdeck clean
launchdeck clean --safe
```

Confirmed command semantics:

- `init`: creates an editable `.launchdeck.yml`. It may later offer scanning, but v1 should not depend on perfect automatic inference.
- `doctor`: checks whether Launchdeck can safely understand and operate the project contract. It should validate config shape, task cwd, command availability where feasible, clean path safety, and long-running task metadata.
- `tasks`: lists configured tasks and their key metadata without executing anything.
- `run <task>`: runs any configured short task and returns the task exit code.
- lifecycle aliases such as `build`, `test`, `lint`, and `typecheck`: convenience aliases for configured tasks.
- `dev`: starts the configured `dev` task as a managed long-running process.
- `start [task]`: starts a configured long-running task, defaulting to `start` when present or `dev` when not.
- `ps`: lists managed processes known to Launchdeck.
- `logs <task>`: reads managed task logs.
- `stop [task]`: stops one managed task or all running managed tasks.
- `clean`: defaults to dry-run and should show what would be removed.
- `clean --safe`: removes only configured safe targets.
- `clean --all --yes`: removes safe and risky targets and must require explicit confirmation.

Product rule: dangerous or ambiguous operations should default to inspection, not mutation. `clean` defaulting to dry-run is a core trust behavior.

## `doctor` Contract

`doctor` should answer one product question: "Can Launchdeck safely understand and operate this project?"

It should be read-only. It must not install dependencies, start processes, stop processes, delete files, or modify `.launchdeck.yml`.

### Severity Model

`doctor` should classify findings as:

- `error`: Launchdeck should not execute the affected lifecycle behavior until fixed.
- `warn`: Launchdeck can continue, but the user should understand the risk or incomplete metadata.
- `info`: useful facts about how Launchdeck understands the project.

The overall result should be:

- `ok`: no errors or warnings
- `warn`: warnings exist but no errors
- `error`: at least one error exists

### Error Findings

These should be `error` because they make execution unsafe or impossible:

- config file cannot be found
- config file cannot be parsed
- unsupported config `version`
- `tasks` is missing or empty
- task command is missing or empty
- task `cwd` escapes the project root
- task `cwd` does not exist
- task `ports` has invalid values
- task `risk` is invalid
- task `log` path escapes the project root
- `clean.safe` or `clean.risky` is not an array
- any clean target escapes the project root
- any clean target resolves to the project root

### Warning Findings

These should be `warn` because Launchdeck can still operate, but the user should know:

- command executable is not found on PATH
- long-running task has no `ports`
- task uses `risk: high` or `risk: destructive`
- clean section is absent
- `clean.safe` is empty
- duplicate ports are used by multiple long-running tasks
- managed runtime state references a process that is already stopped
- platform-sensitive shell syntax exists without platform-specific override support once that feature is implemented

### Info Findings

These should be `info`:

- project root
- config path
- project name
- configured task names
- long-running task names
- expected ports
- safe clean targets
- risky clean targets
- runtime state path
- logs path

### JSON Shape

`doctor --json` should expose stable machine-readable fields:

```json
{
  "ok": true,
  "status": "ok",
  "project": { "name": "example-app" },
  "projectRoot": "/path/to/project",
  "configPath": "/path/to/project/.launchdeck.yml",
  "checks": [
    {
      "name": "task:dev",
      "severity": "info",
      "status": "ok",
      "code": "task_configured",
      "message": "npm run dev",
      "task": "dev"
    }
  ]
}
```

Human text can be compact, but JSON should preserve stable `severity`, `status`, and `code` fields.

## `tasks` Contract

`tasks` should answer one product question: "What can Launchdeck do in this project?"

It should be read-only. It must not execute task commands, inspect dependency installation deeply, start processes, stop processes, delete files, or modify `.launchdeck.yml`.

### Default Display

The default human output should be a compact inventory of configured tasks:

```text
TASK       TYPE      RISK    PORTS      COMMAND
setup      command   medium  -          npm install
build      command   low     -          npm run build
dev        managed   medium  5173       npm run dev -- --host 127.0.0.1
```

Recommended columns:

- `TASK`: configured task name
- `TYPE`: `command` for short-running tasks, `managed` for `longRunning: true`
- `RISK`: task risk
- `PORTS`: expected ports or `-`
- `COMMAND`: configured command

Optional verbose output can later include `cwd`, `env` keys, description, and log path.

### Ordering

Tasks should sort in a predictable order:

1. reserved lifecycle names in this order: `setup`, `build`, `package`, `dev`, `start`, `test`, `lint`, `typecheck`
2. all custom task names alphabetically

This keeps common project actions easy to scan while preserving arbitrary task support.

### JSON Shape

`tasks --json` should expose:

```json
{
  "ok": true,
  "project": { "name": "example-app" },
  "projectRoot": "/path/to/project",
  "configPath": "/path/to/project/.launchdeck.yml",
  "tasks": [
    {
      "name": "dev",
      "command": "npm run dev -- --host 127.0.0.1",
      "cwd": ".",
      "type": "managed",
      "longRunning": true,
      "risk": "medium",
      "ports": [5173],
      "description": null,
      "log": null
    }
  ]
}
```

### Product Behavior

- `tasks` should not replace `doctor`; it does not need to prove commands exist.
- `tasks` should surface risk and long-running behavior before execution.
- `tasks` should include tasks even if they are risky or likely invalid; `doctor` owns validation.
- Missing config is a normal CLI failure with `config_not_found`.
- Invalid config is a normal CLI failure with `config_invalid`.
- Hidden or disabled tasks are out of scope for the first boundary.

## Execution Command Contract

Execution commands should have predictable behavior based on task metadata. The command name should not secretly change task type.

### Task Type Rule

Task execution mode is determined by `longRunning`:

- `longRunning: false` or omitted means a short-running command task.
- `longRunning: true` means a managed long-running task.

This rule preserves `.launchdeck.yml` as the source of truth.

### `run <task>`

`run <task>` is the universal executor for any configured task.

Behavior:

- If the task is short-running, Launchdeck runs it in the foreground, streams output, waits for completion, and returns the child exit code.
- If the task is long-running, Launchdeck starts it as a managed process, records runtime state, writes logs, and returns after launch.
- If the task is already running and managed, Launchdeck should fail with `process_already_running` unless the user explicitly requested restart behavior.
- If the task does not exist, Launchdeck should fail with `task_not_found`.
- If the task cwd is missing or unsafe, Launchdeck should fail before execution.

Product rule: `run` respects metadata. It should not ignore `longRunning`, and it should not require users to remember separate commands for every task type.

### Lifecycle Aliases

Direct lifecycle aliases such as `build`, `test`, `lint`, and `typecheck` should behave like `run <same-name>`.

Examples:

- `launchdeck build` is equivalent to `launchdeck run build`.
- `launchdeck test` is equivalent to `launchdeck run test`.

If a lifecycle alias points to a long-running task, it should follow the same managed-task behavior as `run`.

### `dev`

`dev` is convenience shorthand for starting the configured `dev` task as a managed task.

Recommended behavior:

- `launchdeck dev` is equivalent to `launchdeck start dev`.
- It requires a configured `dev` task.
- The `dev` task should be `longRunning: true`.
- If `dev` exists but is not long-running, Launchdeck should fail with a clear error such as `task_not_managed`, with guidance to either use `launchdeck run dev` or mark the task `longRunning: true`.

This prevents `dev` from accidentally becoming a foreground command when the user expects a managed development server.

### `start [task]`

`start` is for managed long-running tasks.

Recommended behavior:

- `launchdeck start` starts `start` when a `start` task exists.
- If no `start` task exists, `launchdeck start` falls back to `dev` when `dev` exists.
- `launchdeck start <task>` starts the named managed task.
- If the selected task is not long-running, Launchdeck should fail with `task_not_managed`.
- If the selected task is already running, Launchdeck should fail with `process_already_running`.

### `restart [task]`

`restart` should mean stop then start for a managed task.

Recommended behavior:

- `launchdeck restart` resolves the same default task as `start`.
- `launchdeck restart <task>` restarts the named managed task.
- If the task is running, Launchdeck stops it and starts it again.
- If stale state says it was running but the process has exited, Launchdeck should refresh state and start it.
- If the task is not managed, Launchdeck should fail with `task_not_managed`.
- If stop succeeds but start fails, Launchdeck should report the partial failure clearly and leave state inspectable through `ps` and `logs`.

### Exit Code Contract

- Successful short-running task returns the child exit code.
- Failed short-running task returns the child exit code.
- Successful managed start returns `0` after state and log setup.
- Duplicate managed start returns non-zero with `process_already_running`.
- Missing task returns non-zero with `task_not_found`.
- Non-managed task passed to `start`, `dev`, or `restart` returns non-zero with `task_not_managed`.
- Invalid config or unsafe cwd returns non-zero before command execution.

### Output Contract

Human output should explain what happened in one or two lines. JSON output should include:

- `ok`
- `task`
- `mode`: `command` or `managed`
- `code` and `signal` for foreground commands
- `process` for managed starts/restarts
- `error` for failures

The CLI should not claim a managed task is running until runtime state and log path have been created.

## Managed Runtime Recovery Contract

Managed runtime commands should answer one product question: "How do I regain control of what Launchdeck started?"

The runtime state is Launchdeck's operational ledger. It should be project-local, inspectable, and recoverable from stale entries.

### Runtime State Model

Each managed process record should preserve:

- task name
- command
- cwd
- PID or platform process handle
- expected ports
- log path
- started time
- stopped time when known
- status: `running`, `stopped`, `stale`, or `unknown`
- last refresh time when available

The state file should live under `.launchdeck/runtime/state.json`. Logs should live under `.launchdeck/logs/` by default unless task `log` overrides the path.

### `ps`

`ps` should list Launchdeck-managed process records.

Recommended behavior:

- refresh PID liveness before output
- show running and stopped/stale records, not only currently running processes
- make stale state visible instead of silently deleting it
- include task name, PID, status, ports, log path, and started time
- support JSON output with stable fields

Human output should make the current state obvious:

```text
TASK   PID    STATUS   PORTS   LOG
dev    12345  running  5173    .launchdeck/logs/dev.log
api    98765  stopped  8000    .launchdeck/logs/api.log
```

### `logs <task>`

`logs` should locate output for a managed task.

Recommended behavior:

- default task can be `dev` only when no task is provided and `dev` is configured or has a known log
- if log exists, print recent lines by default
- support `--lines`
- if the process is stopped but logs exist, still show logs
- if logs are missing, return a clear `log_not_found` style result without crashing
- JSON output should include task name, log path, whether the log exists, and content

`logs` should not require the process to still be running.

### `stop [task]`

`stop` should be idempotent and recovery-oriented.

Recommended behavior:

- `stop <task>` stops one managed task.
- `stop` without a task stops all currently running managed tasks.
- if task state exists but process is already stopped, mark it stopped and report that no running process remained
- if no state exists for the task, return a clear `process_not_found` or no-op style result depending on whether a task was explicitly requested
- refresh state before attempting stop
- record stopped time when stop is attempted or confirmed
- preserve log path and process record for later diagnosis

### Deletion Of Runtime State

Runtime state should not be silently erased by `ps`, `logs`, or `stop`. Cleanup of `.launchdeck/runtime` should happen through configured safe clean targets or a future explicit runtime-prune command.

This preserves debuggability when processes fail or when a user needs to understand what happened earlier.

### Recovery-Oriented Failures

Managed runtime commands should favor inspectable failure:

- stale PID: mark status and report it
- stop failed: report failure but keep state
- missing log: report missing log path
- invalid state file: preserve or quarantine if possible, then report `runtime_state_invalid`
- unsupported platform stop behavior: report `platform_stop_unsupported` rather than pretending success

## `clean` Contract

`clean` should answer one product question: "What project-local generated state can Launchdeck safely remove?"

It should be conservative by default. `clean` is for configured caches, build outputs, logs, and runtime state that the project explicitly marks removable. It should not become a broad reset command.

### Command Semantics

- `launchdeck clean`: dry-run only; show what would be removed.
- `launchdeck clean --safe`: remove only `clean.safe` targets.
- `launchdeck clean --all --yes`: remove both `clean.safe` and `clean.risky` targets.
- `launchdeck clean --all` without confirmation should fail with `confirmation_required`.
- `launchdeck clean --json`: dry-run JSON output.

### Safety Rules

`clean` must:

- resolve every target relative to the project root
- refuse any path that escapes the project root
- refuse the project root itself
- refuse empty or ambiguous paths
- preserve enough output for users to know what was removed, skipped, or refused
- support missing targets as non-fatal skipped entries
- avoid following cleanup declarations into unrelated projects unless explicitly configured and still inside the project boundary

### Clean Target Classes

- `clean.safe`: generated paths considered safe to remove during normal cleanup.
- `clean.risky`: paths that may be expensive or disruptive to recreate, such as dependency directories.

Examples:

```yaml
clean:
  safe:
    - dist
    - .turbo
    - .pytest_cache
    - .launchdeck/logs
    - .launchdeck/runtime
  risky:
    - node_modules
    - .venv
```

### Runtime State Cleanup

`.launchdeck/logs` and `.launchdeck/runtime` may be configured as safe clean targets, but Launchdeck should not silently erase them from `ps`, `logs`, or `stop`.

Cleaning runtime state is user-visible cleanup, not automatic state refresh.

### `clean` vs `reset`

`clean` should not absorb destructive reset behavior.

Out of scope for `clean`:

- database reset
- deleting source-controlled files
- removing credentials or environment files
- reinstalling dependencies
- dropping containers or volumes unless explicitly modeled later
- project reinitialization

A future `reset` command may model destructive restoration workflows, but it should have a separate contract, stronger confirmation, and clearer risk language.

### JSON Shape

`clean --json` should expose:

```json
{
  "ok": true,
  "dryRun": true,
  "mode": "safe",
  "targets": [
    {
      "path": "dist",
      "absolutePath": "/project/dist",
      "class": "safe",
      "exists": true,
      "action": "would_remove"
    }
  ]
}
```

`clean --safe --json` and `clean --all --yes --json` should expose removed/skipped/refused entries with stable action fields.

## Cross-Platform Runtime Adapter Contract

Launchdeck's public CLI contract should be platform-neutral. Platform-specific behavior belongs behind runtime adapters.

### Adapter Responsibilities

The runtime layer should isolate these platform-sensitive capabilities:

- platform detection
- project path resolution
- project-boundary safety checks
- executable lookup
- shell command execution
- foreground task execution
- managed process start
- process liveness refresh
- process tree stop
- filesystem removal for clean targets
- log file path handling
- newline and text encoding tolerance where relevant

The product-level CLI should call these capabilities instead of scattering `process.platform` checks through command logic.

### Path Adapter

Path behavior must handle:

- Windows drive letters
- path separators
- case sensitivity differences
- symlinks, junctions, and realpath checks
- project-root containment
- relative `cwd`, `log`, and clean paths

Product rule: syntactic containment is not enough for destructive operations. Cleanup should use canonical path checks so a target cannot escape through symlinks or junctions.

### Shell Adapter

v1 should keep `command` as a shell string, but shell behavior must be explicit:

- Windows may use the platform default shell unless a later config field overrides it.
- macOS/Linux may use POSIX shell behavior unless a later config field overrides it.
- Launchdeck should not pretend a shell string is fully portable.
- `doctor` may warn when command syntax looks platform-sensitive.
- platform-specific command overrides can be added later when needed.

Deferred possible shape:

```yaml
tasks:
  build:
    command: npm run build
    shell: default
```

Do not add a custom command DSL in the first boundary unless real usage proves shell strings are insufficient.

### Process Adapter

Managed process behavior must support:

- detached or otherwise non-blocking start
- process identity recording
- liveness refresh
- process tree stop where supported
- graceful fallback when process-tree stop is unavailable
- clear status when permission or platform limitations prevent stopping

Recommended platform direction:

- Windows: use a process-tree stop mechanism such as `taskkill /T` initially, with room for a stronger job-object/native strategy later.
- macOS/Linux: start managed tasks in a process group where possible, then stop the process group with signals; fall back to single PID when necessary.

Product rule: never report successful stop if the adapter cannot verify or attempt the stop path.

### Executable Lookup Adapter

Executable lookup is advisory for `doctor`.

It should account for:

- Windows `.cmd`, `.bat`, `.exe`, and package manager shims
- POSIX executable lookup
- shell built-ins that may not exist as standalone executables
- commands invoked through package managers, such as `npm`, `pnpm`, `python`, `go`, `cargo`, `make`, or `docker`

Product rule: missing executable lookup should usually be a warning, not an error, unless the task cannot possibly execute.

### Clean Filesystem Adapter

Clean removal should:

- resolve targets inside the project root
- canonicalize when destructive behavior is involved
- remove files and directories recursively only after safety checks
- report skipped missing targets
- report refused unsafe targets
- tolerate platform-specific filesystem errors with stable action/status output

### Adapter Test Expectations

The adapter contract should be tested at two levels:

- contract tests that simulate or isolate platform behavior where possible
- smoke tests on Windows, macOS, and Linux for process start/stop, path safety, executable lookup, logs, and clean

Release readiness should not claim cross-platform support until runtime adapter behavior has evidence on all supported OS families.

## Verification Matrix Contract

Launchdeck should define release confidence through explicit verification levels.

### Verification Levels

Level 1: local correctness

- syntax/type-level checks for CLI source
- unit tests for config parsing, path safety, clean target resolution, and error payloads
- CLI command contract tests using temporary projects
- JSON output parseability checks

Level 2: lifecycle smoke

- initialize or use a temporary `.launchdeck.yml`
- run `doctor`
- list `tasks`
- run a foreground task and verify exit code behavior
- start a managed task
- inspect `ps`
- read `logs`
- stop the managed task
- run `clean` dry-run
- run `clean --safe`
- verify risky clean requires explicit confirmation

Level 3: cross-platform runtime evidence

- run the lifecycle smoke on Windows
- run the lifecycle smoke on macOS
- run the lifecycle smoke on Linux
- verify process start/stop semantics on each OS
- verify path containment and cleanup safety on each OS
- verify executable lookup warning behavior on each OS
- verify logs and runtime state paths on each OS

### Minimum Release Claims

Use these claim levels:

- `dev-ready`: local correctness and lifecycle smoke pass on at least one development OS.
- `platform-smoke-ready`: lifecycle smoke passes on a named OS.
- `cross-platform-ready`: lifecycle smoke passes on Windows, macOS, and Linux.

Product rule: do not call Launchdeck cross-platform ready until Level 3 has passed on all three OS families.

### Required Smoke Project

The smoke project should be intentionally small and stack-neutral:

```yaml
version: 1
project:
  name: smoke
tasks:
  build:
    command: node scripts/build.js
  test:
    command: node scripts/test.js
  dev:
    command: node scripts/dev.js
    longRunning: true
    ports: [43210]
clean:
  safe:
    - cache
  risky:
    - danger
```

This keeps platform validation focused on Launchdeck behavior rather than framework-specific behavior.

### Verification Evidence To Preserve

Verification output should record:

- OS name and version
- Node/runtime version
- Launchdeck version or commit
- command executed
- exit code
- relevant JSON output
- whether managed process stop was verified
- any skipped or unsupported checks

This evidence should be enough for a maintainer to distinguish "not tested" from "tested and failed" from "tested and passed."

## `init` Contract

`init` should answer one product question: "How do I create the lifecycle contract for this project?"

It should create an editable `.launchdeck.yml` that users can inspect and revise.

### Default Behavior

Recommended v1 default:

- `launchdeck init` creates `.launchdeck.yml` in the project root.
- If a Launchdeck config already exists, `init` fails with `config_exists`.
- `launchdeck init --force` may overwrite the default target config, but should be explicit.
- Generated config should be readable, small, and conservative.
- Generated config should include comments only if they are helpful and not noisy.
- `init` should not install dependencies, run project commands, start processes, or clean files.

### Starter Config

The starter config should include common lifecycle placeholders:

```yaml
version: 1
project:
  name: my-project
tasks:
  setup:
    command: npm install
    risk: medium
  build:
    command: npm run build
  test:
    command: npm test
  dev:
    command: npm run dev -- --host 127.0.0.1
    longRunning: true
    ports: [5173]
    risk: medium
clean:
  safe:
    - dist
    - node_modules/.vite
  risky:
    - node_modules
```

The exact starter may become stack-aware later, but the first version should be useful even without scan confidence.

### Scan And Suggestion Layer

Automatic discovery should be suggestion-oriented:

- detect package files and scripts
- propose likely tasks
- write a config only after the user can inspect or accept the proposal
- avoid pretending uncertain inference is authoritative

Potential future commands:

- `launchdeck init --scan`
- `launchdeck doctor --suggest`
- `launchdeck init --template node-vite`

These are deferred until the explicit protocol proves useful.

### Project Root Selection

`init` should be clear about where it writes:

- default target is current working directory
- future `--cwd <path>` may target another directory
- parent-directory config discovery should not cause `init` to overwrite a parent config accidentally

Product rule: `init` creates or updates the current target project's contract; it should not mutate an ancestor project just because a config was found upward.

### JSON Shape

`init --json` should expose:

```json
{
  "ok": true,
  "configPath": "/project/.launchdeck.yml",
  "created": true,
  "overwritten": false
}
```

On existing config:

```json
{
  "ok": false,
  "error": {
    "code": "config_exists",
    "message": "Config already exists.",
    "details": {
      "configPath": "/project/.launchdeck.yml"
    }
  }
}
```

## Project Root And `--cwd` Contract

Every Launchdeck command should make the target project explicit and predictable.

### Target Directory

Recommended rule:

- default target directory is the process current working directory
- future/global `--cwd <path>` sets the target directory for the command
- command behavior should be the same whether the user `cd`s into a project or passes `--cwd`

### Config Discovery

For normal commands, Launchdeck should search upward from the target directory for config files:

- `.launchdeck.yml`
- `.launchdeck.yaml`
- `launchdeck.yml`
- `launchdeck.yaml`

The directory containing the found config becomes the project root.

This applies to:

- `doctor`
- `tasks`
- `run`
- lifecycle aliases
- `dev`
- `start`
- `restart`
- `ps`
- `logs`
- `stop`
- `clean`

### `init` Exception

`init` should not behave like normal upward config discovery.

Recommended rule:

- `launchdeck init` writes `.launchdeck.yml` in the target directory
- `launchdeck init --cwd <path>` writes `.launchdeck.yml` in `<path>`
- if a config already exists in the target directory, fail unless `--force`
- if a config exists only in an ancestor directory, do not overwrite it
- optionally warn that an ancestor config exists, but keep the write target local

Product reason: `init` creates a contract for the target project. It should not accidentally mutate a parent project or monorepo root.

### Runtime State Location

Runtime state and logs should be stored under the discovered project root:

- `.launchdeck/runtime/state.json`
- `.launchdeck/logs/`

They should not be stored under the invocation directory when a config was found in an ancestor.

### Task `cwd`

Task `cwd` is relative to the project root, not the invocation directory.

Rules:

- omitted `cwd` means project root
- relative `cwd` resolves from project root
- absolute `cwd` should be allowed only if it stays inside project root, unless a future explicit external-workdir feature is added
- unsafe `cwd` should fail before command execution

### Monorepo Defaults

The first boundary should keep monorepo behavior simple:

- each config controls one project root
- package/app subdirectories can set task `cwd`
- nested `.launchdeck.yml` files may represent nested projects
- normal upward discovery picks the nearest config from target cwd
- no workspace graph or multi-project orchestration in the first boundary

Examples:

```yaml
tasks:
  web-dev:
    cwd: apps/web
    command: npm run dev
    longRunning: true
    ports: [5173]
```

### `--cwd` JSON Evidence

JSON output for commands should include `projectRoot` and `configPath` where relevant so users can verify what project was operated.

## Global JSON And Exit Code Contract

Launchdeck should have one consistent machine-readable output model.

Human output may evolve for clarity. JSON output is a compatibility surface.

### Global JSON Envelope

Every command that supports `--json` should return a JSON object.

Success envelope:

```json
{
  "ok": true,
  "command": "doctor",
  "status": "ok"
}
```

Failure envelope:

```json
{
  "ok": false,
  "command": "run",
  "error": {
    "code": "task_not_found",
    "message": "Task 'build' is not configured.",
    "details": {
      "task": "build"
    }
  }
}
```

Recommended shared fields:

- `ok`: boolean
- `command`: Launchdeck command invoked
- `status`: command-specific status when relevant
- `projectRoot`: target project root when config was resolved
- `configPath`: config path when config was resolved
- `error`: structured error object on failure

Command-specific payloads may add fields such as `task`, `tasks`, `process`, `processes`, `checks`, `targets`, `removed`, `content`, `code`, and `signal`.

### Error Object

The error object should include:

- `code`: stable machine-readable string
- `message`: human-readable message
- `details`: optional structured object

Error `code` is the compatibility anchor. Human `message` may improve over time.

### Exit Code Rules

Global rules:

- CLI command success returns `0`.
- CLI usage/config/safety failure returns non-zero.
- Foreground task execution returns the child process exit code.
- Managed task start success returns `0` once state and log paths are created.
- Managed duplicate start returns non-zero.
- `doctor` returns `0` for `ok` and `warn`, non-zero for `error`.
- `clean` dry-run success returns `0`.
- `clean --all` without confirmation returns non-zero.

Recommended non-zero default:

- use `1` for Launchdeck-level failures unless preserving a child process exit code
- do not invent many process exit codes in v1; use JSON `error.code` for precise branching

### Partial Success

Some commands may produce partial success:

- `restart` stops a task but fails to start it
- `stop` stops some tasks but fails others
- `clean` removes some targets and refuses others

Recommended JSON pattern:

```json
{
  "ok": false,
  "status": "partial",
  "results": [],
  "error": {
    "code": "partial_failure",
    "message": "Some operations failed."
  }
}
```

Human output should clearly name what succeeded and what failed.

### Stability Rules

- Adding fields is allowed.
- Removing or renaming JSON fields requires a versioned compatibility decision.
- Human text is not a stable API.
- Error codes and command-specific `status` values should be documented.
- JSON output should be valid even on failure.
- Non-JSON error output should be concise and include the error code.

## v1 Error Code Vocabulary

Launchdeck error codes should be stable, machine-readable, and actionable. Use `snake_case`.

Product rule: error codes describe what failed, not how the implementation failed internally.

### Naming Rules

- Use lowercase `snake_case`.
- Prefer domain-oriented names: `config_*`, `task_*`, `process_*`, `clean_*`, `runtime_*`, `platform_*`.
- Keep codes stable once public.
- Add new codes when a caller can take a different action.
- Do not expose raw Node.js, shell, or OS exception names as the primary code.
- Human `message` can change; `code` should not change casually.

### Config And Arguments

Required v1 codes:

- `unknown_command`: command name is not recognized
- `invalid_arguments`: CLI arguments are malformed or incomplete
- `config_not_found`: no Launchdeck config is discoverable for the command
- `config_exists`: `init` target already has a config and overwrite was not explicit
- `config_invalid`: config exists but is invalid or cannot be parsed
- `unsupported_config_version`: config version is not supported

### Task Selection And Validation

Required v1 codes:

- `task_required`: command requires a task name but none was provided
- `task_not_found`: named task does not exist
- `task_not_managed`: command requires a long-running managed task but task is not `longRunning: true`
- `task_invalid`: task shape is invalid
- `cwd_missing`: task cwd does not exist
- `cwd_outside_project`: task cwd escapes project root
- `log_path_outside_project`: task log path escapes project root
- `invalid_task_port`: task port is invalid
- `invalid_task_risk`: task risk is invalid

### Foreground Execution

Required v1 codes:

- `command_failed`: foreground task ran and exited non-zero when Launchdeck needs to wrap the failure
- `command_spawn_failed`: Launchdeck could not spawn the configured command
- `command_not_found`: executable lookup indicates the command is unavailable

Foreground task process exit code should still be preserved as the CLI process exit code when possible.

### Managed Runtime

Required v1 codes:

- `process_already_running`: managed task is already running
- `process_not_found`: requested managed process state does not exist
- `process_stop_failed`: Launchdeck attempted stop and failed
- `process_start_failed`: Launchdeck attempted managed start and failed
- `runtime_state_invalid`: runtime state file is missing required shape or cannot be read safely
- `runtime_state_write_failed`: Launchdeck could not write runtime state
- `log_not_found`: requested log is not available

### Clean

Required v1 codes:

- `confirmation_required`: command requires explicit confirmation
- `clean_path_outside_project`: clean target escapes project root
- `clean_refuses_project_root`: clean target resolves to project root
- `clean_target_invalid`: clean target is empty, ambiguous, or invalid
- `clean_failed`: removal failed for one or more targets

### Platform

Required v1 codes:

- `platform_unsupported`: current platform is unsupported for the requested behavior
- `platform_stop_unsupported`: platform adapter cannot stop the process tree safely
- `path_resolution_failed`: platform path adapter could not resolve a path safely

### Partial Failure

Required v1 code:

- `partial_failure`: command had mixed results and the JSON payload contains per-item details

### Internal Fallback

Required v1 code:

- `internal_error`: unexpected Launchdeck failure

`internal_error` should be rare and treated as a bug or missing classification opportunity.

## v1 Scope Boundary

Launchdeck v1 should be a real CLI product with a narrow, reliable boundary.

### v1 Product Statement

Launchdeck v1 is a cross-platform local CLI for explicit single-project lifecycle control through `.launchdeck.yml`.

It should let users:

- create a lifecycle contract
- validate the contract
- inspect available tasks
- run foreground tasks
- start managed long-running tasks
- inspect managed process state
- read managed logs
- stop managed processes
- clean configured generated state safely

### v1 Must Include

Commands:

- `init`
- `doctor`
- `tasks`
- `run <task>`
- lifecycle aliases: `setup`, `build`, `package`, `test`, `lint`, `typecheck`
- `dev`
- `start [task]`
- `restart [task]`
- `ps`
- `logs [task]`
- `stop [task]`
- `clean`
- `clean --safe`
- `clean --all --yes`

Configuration:

- `.launchdeck.yml` / `.launchdeck.yaml` discovery
- `version: 1`
- `project.name`
- `tasks`
- task `command`
- task `cwd`
- task `env`
- task `description`
- task `risk`
- task `longRunning`
- task `ports`
- task `log`
- `clean.safe`
- `clean.risky`

Runtime:

- project-local `.launchdeck/runtime/state.json`
- project-local `.launchdeck/logs/`
- managed process start/stop/refresh
- log tailing
- state recovery for stale/stopped processes

Safety:

- config validation
- task cwd safety
- log path safety
- clean path safety
- project root refusal
- dry-run clean default
- explicit risky clean confirmation

Compatibility:

- JSON output for key commands
- stable error code vocabulary
- simple exit code contract
- cross-platform runtime adapter boundary
- verification matrix with release claim levels

### v1 Explicitly Out Of Scope

- GUI or TUI
- MCP server
- agent skill package
- automatic project discovery as default behavior
- template marketplace
- workspace graph orchestration
- multi-project fan-out commands
- dependency-aware task ordering
- daemon/service mode
- remote execution
- cloud environments
- CI/CD replacement
- database reset
- Docker volume/container reset as built-in behavior
- destructive `reset`
- package manager abstraction
- plugin system
- shell completion generation
- native installer packaging as a product requirement
- multi-instance managed tasks
- config schema migration engine

### Deferred But Reserved

These are likely future directions but should not block v1:

- `init --scan`
- `init --template <name>`
- `doctor --suggest`
- task `platforms` overrides
- richer shell configuration
- runtime state pruning
- standalone binaries
- Homebrew/Scoop/winget packaging
- MCP server
- agent skill integration
- UI/TUI dashboard
- monorepo orchestration

### v1 Readiness Bar

v1 should not be considered ready unless:

- local command flow passes
- `doctor`, `tasks`, execution, runtime, logs, stop, and clean contracts are implemented
- error JSON is stable for required v1 failures
- clean safety is verified
- managed process lifecycle is verified
- verification claim level is named honestly

If only one OS is validated, the product can be `platform-smoke-ready` for that OS, but not `cross-platform-ready`.
