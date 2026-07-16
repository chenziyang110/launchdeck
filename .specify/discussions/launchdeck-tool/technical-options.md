# Technical Options: Launchdeck Tool

## Recommendation

Use the CLI-first lifecycle control path as the product direction. The current repository already has a Node CLI package, config loader, process runtime, and dogfood config. That makes the shortest credible path a real local tool rather than a document-only skill.

Cross-platform behavior is part of this recommendation. Windows, macOS, and Linux support must shape the CLI contract from the start rather than becoming an adapter layer later.

## Option A: CLI-First Lifecycle Control

This is the recommended option.

Product behavior enabled:

- Users and agents run one command surface across projects.
- `.launchdeck.yml` stays the source of truth.
- Long-running tasks are tracked by Launchdeck.
- Logs and cleanup are controlled by project-local state.

Evidence-backed facts:

- `package.json` exposes a Node CLI bin named `launchdeck`.
- `src/cli.js` already defines init, doctor, run, lifecycle aliases, dev/start/restart, ps, logs, stop, and clean commands.
- `src/runtime.js` already records managed process state and log paths under `.launchdeck`.
- `src/config.js` already normalizes config, task risk, ports, env, cwd, and clean targets.
- Existing runtime code already branches between Windows `taskkill` and POSIX signal behavior for process termination, but broader platform validation remains open.

Trade-offs:

- Fastest path to a real tool.
- Node runtime is convenient for npm distribution but not as self-contained as a compiled binary.
- Shell command execution remains stack-agnostic but requires careful quoting and cross-platform behavior.
- Cross-platform correctness adds test and design pressure around path resolution, process-tree termination, shell quoting, executable lookup, and platform-specific command availability.

Validation expectations:

- CLI command contract tests.
- Cross-platform process start/stop checks.
- Config parsing and path-safety tests.
- Agent-readable JSON shape checks.
- Windows, macOS, and Linux validation for cwd resolution, logs, state files, cleanup safety, JSON output, and process lifecycle behavior.

## Option B: Protocol/Core Library First

Product behavior enabled:

- A stable internal engine could later power CLI, MCP, GUI, and editor integrations.
- Adapters could share the same config validation and runtime model.

Evidence-backed facts:

- Current source is already separated into `config.js`, `runtime.js`, and `cli.js`, which gives a natural starting boundary.

Trade-offs:

- Cleaner architecture for future integrations.
- Slower to feel like a finished product if it delays CLI polish.
- Risk of over-abstracting before real project usage proves the protocol.

Recommended handling:

- Preserve a clean internal boundary, but do not make library packaging the visible product center yet.

## Option C: Agent/MCP First

Product behavior enabled:

- Agents get structured tools immediately.
- Future skill and MCP integrations could call Launchdeck without shell parsing.

Evidence-backed facts:

- The current product need came from agent project management pain.
- No MCP server or skill package exists in the current repository yet.

Trade-offs:

- High agent value, but weak standalone product validation.
- Premature integration can hide gaps in the core lifecycle protocol.
- Tooling would still need a local lifecycle engine underneath.

Recommended handling:

- Treat MCP and skills as downstream consumers after the CLI/protocol behavior is stable.

## Cross-Platform Architecture Choice

Recommended direction: keep the public lifecycle contract platform-neutral and isolate OS-specific behavior behind a runtime/platform boundary.

### Option X: Ad Hoc Cross-Platform Checks

Product behavior enabled:

- The CLI can keep moving quickly by using small `process.platform` checks where needed.

Trade-offs:

- Fast initially.
- Risk grows as process, shell, path, log, and cleanup behavior spread across the codebase.
- Harder to prove consistent behavior to agents.

Recommendation:

- Accept only for tiny local checks, not as the primary cross-platform strategy.

### Option Y: Platform Adapter Boundary

This is the recommended option.

Product behavior enabled:

- Launchdeck presents one lifecycle contract while delegating OS-specific process, shell, path, and executable lookup behavior to platform adapters.
- Tests can assert the same product contract against different platform behavior surfaces.
- Future packaging or native integration decisions remain independent from the protocol.

Trade-offs:

- Slightly more structure than direct shell calls.
- Better long-term safety for stop, clean, logs, and agent-readable output.

Requirement-level boundary:

- Product-level commands stay in the CLI/core layer.
- OS-specific details live behind process, shell, path, and filesystem safety capabilities.
- JSON output is owned by the product contract, not by a platform adapter.

### Option Z: Native Binary First

Product behavior enabled:

- Potentially simpler installation and more control over process behavior.

Trade-offs:

- Larger early scope.
- May distract from proving the lifecycle protocol.
- Does not remove the need to design cross-platform semantics.

Recommendation:

- Defer as packaging strategy. Do not make native binary distribution a prerequisite for the first coherent product unless the user explicitly changes the boundary.

## Protocol Shape Choice

Recommended direction: keep `.launchdeck.yml v1` explicit and hand-written, with a small reserved task model and deferred platform override shape.

### Option 1: Minimal Explicit Protocol

This is the recommended option.

Product behavior enabled:

- Humans can read the project lifecycle contract.
- Agents can call stable lifecycle verbs without guessing project commands.
- The first implementation can validate real behavior quickly.

Trade-offs:

- Users must write or accept generated config.
- Automatic discovery is deferred.
- Platform override support may start as reserved schema before full implementation.

Why this fits:

- The product's trust layer comes from explicit command, risk, process, log, and cleanup metadata.
- It avoids pretending every stack can be inferred perfectly on day one.

### Option 2: Auto-Discovery First

Product behavior enabled:

- Better first-run convenience for common stacks.
- Users may not need to hand-write `.launchdeck.yml`.

Trade-offs:

- More complex before the contract is proven.
- Discovery mistakes are dangerous when commands start processes or clean files.
- Cross-platform inference can become brittle.

Recommended handling:

- Defer to a later layer that proposes config, then lets the explicit protocol remain source of truth.

### Option 3: Task-Runner Compatible Protocol

Product behavior enabled:

- Easier migration from `make`, `just`, `Taskfile`, npm scripts, or package manager scripts.

Trade-offs:

- Risk of becoming a task shortcut wrapper.
- May dilute process/log/cleanup semantics.

Recommended handling:

- Support import/adapters later, but preserve Launchdeck's lifecycle control model as the product contract.

## Senior Consequence Analysis

### Affected Object Map

- `.launchdeck.yml` project contract.
- CLI commands and JSON output.
- Long-running child processes.
- `.launchdeck/runtime/state.json`.
- `.launchdeck/logs/*.log`.
- Safe and risky clean target paths.
- Project root boundary checks.
- Downstream agent consumers that rely on command output and state.
- Platform-specific process, shell, path, and executable lookup behavior.

### State-Behavior Matrix

- created: `init` creates a starter contract and should not overwrite without force.
- configured: `doctor` validates commands, cwd, executable presence, and clean paths.
- running: `dev` or `start` creates process state and log output.
- stale: `ps` refreshes process status from PID liveness.
- stopped: `stop` updates state and terminates the process tree where possible.
- missing: `logs` reports absent logs without crashing.
- risky: `clean --all` requires explicit confirmation semantics.
- safe-clean: `clean --safe` removes only configured safe paths inside the project root.
- platform-overridden: when platform overrides exist, Launchdeck resolves the active platform before command execution while preserving the same task identity and JSON output shape.
- config-invalid: invalid task, risk, cwd, port, clean, or platform override fields fail before execution.

### Dependency Impact

- Config schema changes affect examples, docs, CLI parsing, tests, and future agent integrations.
- Runtime state shape changes affect `ps`, `logs`, `stop`, restart behavior, and future MCP tools.
- Cleanup semantics affect trust and safety; mistakes can delete user data.
- JSON output changes affect downstream agents and automation.
- Process handling differs by operating system and needs explicit validation.
- Platform assumptions can leak through shell commands, executable lookup, path casing, drive letters, symlinks, and process-tree semantics.
- Packaging choices affect installation and distribution, but must not redefine lifecycle behavior.

### Recovery And Validation Contract

- Process operations should be idempotent where possible.
- State refresh should recover from missing, stale, or invalid state files.
- Stop should tolerate already-exited processes.
- Clean should refuse paths outside the project root and refuse the project root itself.
- Logs should remain readable even after process exit.
- JSON output should remain parseable on success and error.

### Coverage Gaps

- CA-GAP-001: Cross-platform process tree behavior needs more validation beyond the current Windows smoke path. Owner: downstream implementation. Latest resolve phase: before release claim. Stop-and-reopen condition: process stop leaves child processes running.
- CA-GAP-002: Command quoting and shell behavior need stack examples across npm, Python, Go, Rust, Make, and Docker Compose. Owner: downstream implementation. Latest resolve phase: before declaring broad stack support. Stop-and-reopen condition: common project commands fail because Launchdeck shells them incorrectly.
- CA-GAP-003: JSON output stability needs explicit compatibility tests. Owner: downstream implementation. Latest resolve phase: before agent integration. Stop-and-reopen condition: agents need to parse unstable or ambiguous output.
- CA-GAP-004: Cross-platform behavior needs a verification matrix for Windows, macOS, and Linux. Owner: downstream implementation. Latest resolve phase: before broad release claim. Stop-and-reopen condition: lifecycle behavior works on one OS but not another.

### Consequence Obligations

- CA-001: Cleanup must never silently become destructive. Owner workflow: downstream implementation. Latest resolve phase: before release claim. Status: pending.
- CA-002: Long-running processes must be inspectable and stoppable through Launchdeck. Owner workflow: downstream implementation. Latest resolve phase: before release claim. Status: pending.
- CA-003: Agent-readable output must preserve structured status, error, process, log, and clean target fields. Owner workflow: downstream implementation. Latest resolve phase: before agent integration. Status: pending.
- CA-004: The config protocol must remain stack-agnostic and local-project scoped. Owner workflow: downstream specification/planning. Latest resolve phase: before implementation scope lock. Status: pending.
- CA-005: Runtime state and logs must be observable, recoverable from stale state, and safe to clean. Owner workflow: downstream implementation. Latest resolve phase: before release claim. Status: pending.
- CA-006: Windows, macOS, and Linux must be first-class supported platforms for lifecycle behavior. Owner workflow: downstream specification and implementation. Latest resolve phase: before release claim. Status: pending.
- CA-007: OS-specific behavior must be isolated behind a product-preserving runtime boundary rather than leaking into agent-facing semantics. Owner workflow: downstream specification and implementation. Latest resolve phase: before architecture lock. Status: pending.
- CA-008: `.launchdeck.yml v1` must remain small, explicit, readable, and stable enough for agents to rely on. Owner workflow: downstream specification and implementation. Latest resolve phase: before config schema changes. Status: pending.
- CA-009: JSON output and error categories must be treated as compatibility surfaces for agents. Owner workflow: downstream specification and implementation. Latest resolve phase: before agent integration. Status: pending.
- CA-010: The CLI first-run flow must prioritize inspection and recoverability before mutation. Owner workflow: downstream specification and implementation. Latest resolve phase: before CLI UX lock. Status: pending.

## CLI Experience Decisions

Confirmed direction: Launchdeck should first feel like a usable CLI product for developers, not like an agent-only backend.

### First-Run Shape

Recommended sequence:

1. `launchdeck init`
2. `launchdeck doctor`
3. `launchdeck tasks`
4. run or start a task
5. inspect `ps` and `logs`
6. stop managed processes
7. clean with dry-run first

This is not an implementation plan; it is the user experience contract that downstream planning should preserve.

### Command Naming Rationale

- Keep `run <task>` as the universal executor because it maps cleanly to arbitrary configured tasks.
- Keep direct aliases such as `build`, `test`, `lint`, and `typecheck` because they are faster for common workflows.
- Keep `dev` as a special convenience because local development servers are common and long-running.
- Keep `start [task]` for any long-running task that is not necessarily named `dev`.
- Add or preserve `tasks` because a user needs a safe discovery command before running anything.

### Safety Defaults

- `clean` without flags should be dry-run.
- Risky cleanup should require explicit confirmation.
- Missing config, missing task, unsafe clean path, and already-running process should be clear CLI failures, not silent no-ops.
- `doctor` and `tasks` should be safe read-only commands.

## `doctor` Decision

Confirmed direction: `doctor` is a safety and readiness check for the Launchdeck contract, not only YAML parsing.

### Recommended Severity Split

- `error`: execution would be unsafe or impossible.
- `warn`: execution may work, but the user should know about risk, missing metadata, or portability gaps.
- `info`: Launchdeck's interpretation of the project.

### Product Rationale

This makes `doctor` the command a developer runs before trusting Launchdeck. It should reveal whether the project is ready, risky, or blocked without mutating the project.

### Compatibility Implication

`doctor --json` should be treated as a compatibility surface. Downstream code should not need to parse human wording to understand whether a finding blocks execution.

### Stop-And-Reopen Conditions

Reopen the `doctor` contract if:

- warnings become so noisy users ignore them
- common projects produce false errors
- `doctor` starts mutating project state
- JSON checks lack stable codes
- cross-platform differences produce different severity for the same project contract without a clear reason

### Added Consequence Obligation

- CA-011: `doctor` must remain read-only and classify findings with stable severity and codes. Owner workflow: downstream specification and implementation. Latest resolve phase: before doctor implementation lock. Status: pending.

## `tasks` Decision

Confirmed direction: `tasks` is a read-only inventory command for configured capabilities.

### Product Rationale

`tasks` gives users a safe next step after `doctor`. It answers "what can I run?" without executing anything. This is important for trust because a user should be able to inspect risk, command type, ports, and command text before launching a process or running a high-risk command.

### Recommended Output

Human output should be compact and table-like. JSON output should preserve full task metadata needed by future tools and automation.

### Relationship To `doctor`

- `doctor` validates safety and readiness.
- `tasks` lists configured capabilities.
- `tasks` may show invalid-looking commands because validation belongs to `doctor`.
- Users should be able to run `doctor` then `tasks` without any mutation.

### Stop-And-Reopen Conditions

Reopen the `tasks` contract if:

- output hides task risk
- output hides whether a task is long-running
- custom task ordering becomes unpredictable
- human output becomes too noisy for normal projects
- JSON omits fields needed to run or inspect a task

### Added Consequence Obligation

- CA-012: `tasks` must remain read-only and expose risk, managed/command type, ports, and command text before execution. Owner workflow: downstream specification and implementation. Latest resolve phase: before tasks implementation lock. Status: pending.

## Execution Command Decision

Confirmed direction: execution semantics are driven by `longRunning`, not by command spelling alone.

### Recommended Semantics

- `run <task>` is universal and respects task metadata.
- lifecycle aliases behave like `run <same-name>`.
- `dev` is shorthand for `start dev`.
- `start [task]` only starts managed long-running tasks.
- `restart [task]` only restarts managed long-running tasks.

### Product Rationale

This keeps the CLI learnable without making behavior magical. A user can inspect `tasks`, see whether something is `command` or `managed`, and then predict what `run`, `start`, or `restart` will do.

### Risk Avoidance

- Do not silently background a short task through `start`.
- Do not silently foreground a `dev` task when the user expected process management.
- Do not start duplicate managed tasks unless restart is explicitly requested.
- Do not hide partial restart failures; users must be able to recover with `ps` and `logs`.

### Stop-And-Reopen Conditions

Reopen the execution contract if:

- common users expect `run dev` and `dev` to differ in surprising ways
- duplicate process handling blocks legitimate multi-instance workflows
- `start` fallback from `start` to `dev` causes ambiguity
- lifecycle aliases become inconsistent with `run`
- restart cannot preserve inspectable state on partial failure

### Added Consequence Obligation

- CA-013: Execution commands must respect `longRunning`, avoid implicit duplicate starts, preserve child exit codes for foreground tasks, and keep managed state inspectable after start/restart failures. Owner workflow: downstream specification and implementation. Latest resolve phase: before execution implementation lock. Status: pending.

## Managed Runtime Command Decision

Confirmed direction: `ps`, `logs`, and `stop` are recovery commands, not just convenience wrappers.

### Product Rationale

The main pain Launchdeck solves is losing control of local project operations. Once a dev server or background task is started, a user needs to answer:

- what did Launchdeck start?
- is it still running?
- where are the logs?
- how do I stop it?
- what happened if it already died?

`ps`, `logs`, and `stop` must make those answers available without manual process hunting.

### Recommended Semantics

- `ps` refreshes liveness and shows known managed records.
- `logs` shows logs even after the process stops.
- `stop` is idempotent and preserves diagnostic state.
- Runtime state is not silently deleted by ordinary inspection commands.

### Risk Avoidance

- Do not hide stale state by deleting it automatically.
- Do not require a process to be running before showing logs.
- Do not claim stop success when platform stop behavior is unsupported or failed.
- Do not lose log paths during cleanup or state refresh.

### Stop-And-Reopen Conditions

Reopen the managed runtime contract if:

- users cannot recover after an interrupted agent/terminal session
- stale processes disappear from visibility
- stop behavior differs sharply across platforms without explicit status
- logs cannot be read after process exit
- state corruption causes crashes instead of recoverable diagnostics

### Added Consequence Obligation

- CA-014: Managed runtime commands must preserve inspectable state and logs across running, stopped, stale, missing-log, and stop-failed cases. Owner workflow: downstream specification and implementation. Latest resolve phase: before runtime implementation lock. Status: pending.

## `clean` Decision

Confirmed direction: `clean` is conservative project-local generated-state cleanup, not reset.

### Product Rationale

Users need cleanup, but trust evaporates if the tool deletes too much. `clean` must therefore default to dry-run, separate safe from risky targets, and refuse ambiguous or out-of-project paths.

### Recommended Semantics

- `clean` previews.
- `clean --safe` removes only safe targets.
- `clean --all --yes` removes safe and risky targets.
- missing targets are skipped, not fatal.
- unsafe targets are refused.
- runtime state cleanup is explicit, not automatic.

### Risk Avoidance

- Do not delete the project root.
- Do not delete outside the project root.
- Do not treat reset operations as cleanup.
- Do not hide risky targets behind safe defaults.
- Do not make cleanup depend on current working directory after config root is found.

### Stop-And-Reopen Conditions

Reopen the clean contract if:

- common cleanup needs require deleting outside the project root
- users expect dependency directories to be safe by default
- runtime logs/state become too important to include in safe clean
- future Docker/database reset behavior pressures `clean` to become destructive
- symlink or path canonicalization creates cross-platform safety gaps

### Added Consequence Obligation

- CA-015: `clean` must default to dry-run, separate safe and risky targets, refuse project-root/out-of-root deletion, and remain distinct from destructive reset behavior. Owner workflow: downstream specification and implementation. Latest resolve phase: before clean implementation lock. Status: pending.

## Cross-Platform Runtime Adapter Decision

Confirmed direction: keep CLI command semantics platform-neutral and move OS-specific behavior behind runtime adapters.

### Recommended Adapter Surfaces

- path adapter
- shell adapter
- process adapter
- executable lookup adapter
- filesystem cleanup adapter
- log path/text adapter if needed

### Product Rationale

Launchdeck's promise is that lifecycle commands mean the same thing across projects and operating systems. Without an adapter boundary, platform details leak into command semantics and make the CLI harder to trust.

### Architecture Boundary

The CLI/core layer should own:

- command names
- task selection
- JSON shape
- error vocabulary
- safety policy
- lifecycle semantics

The runtime adapter layer should own:

- how commands run on the current OS
- how managed processes are started/stopped
- how paths are resolved safely
- how executables are looked up
- how filesystem deletion is performed

### Recommended Defaults

- Keep `command` as a shell string in v1.
- Do not invent a custom command DSL yet.
- Use platform-native shell behavior explicitly.
- Warn about portability risks rather than blocking common commands too early.
- Reserve platform overrides for projects that need them.

### Risk Avoidance

- Do not scatter OS checks through product command logic.
- Do not report cross-platform support from Windows-only or POSIX-only evidence.
- Do not treat string path containment as sufficient for destructive clean.
- Do not treat executable lookup as perfect proof of runtime success.
- Do not hide unsupported stop behavior behind a success message.

### Stop-And-Reopen Conditions

Reopen the adapter contract if:

- shell string portability becomes the dominant source of failures
- process-tree stop cannot be made reliable enough with initial mechanisms
- symlink/junction cleanup safety requires a stricter model
- executable lookup produces too many false warnings
- packaging decisions require native process APIs earlier than expected

### Added Consequence Obligation

- CA-016: Platform-sensitive behavior must be isolated behind runtime adapters for path, shell, process, executable lookup, cleanup, and logs, with validation evidence on Windows, macOS, and Linux before cross-platform release claims. Owner workflow: downstream specification and implementation. Latest resolve phase: before runtime architecture lock. Status: pending.

## Verification Matrix Decision

Confirmed direction: release confidence should be claim-based, not vibes-based.

### Recommended Claim Levels

- `dev-ready`: local correctness and lifecycle smoke pass on one development OS.
- `platform-smoke-ready`: lifecycle smoke passes on a named OS.
- `cross-platform-ready`: lifecycle smoke passes on Windows, macOS, and Linux.

### Product Rationale

Launchdeck manages processes and deletes files. It needs stronger verification discipline than a normal alias runner. A cross-platform claim is only credible when the runtime behavior has been exercised on every supported OS family.

### Recommended Validation Surface

- config parser behavior
- CLI error payload behavior
- `doctor` result severity and JSON shape
- `tasks` inventory shape
- foreground task exit code propagation
- managed start and duplicate-start behavior
- `ps` liveness refresh
- `logs` after process start and after process exit
- `stop` idempotency
- clean dry-run, safe clean, risky-confirmation, and unsafe-path refusal
- adapter-specific process/path behavior on Windows, macOS, and Linux

### Risk Avoidance

- Do not use framework-specific projects as the only smoke evidence.
- Do not call warnings acceptable without recording them.
- Do not collapse skipped platform checks into passed checks.
- Do not claim cross-platform readiness from mocked adapter tests alone.

### Added Consequence Obligation

- CA-017: Release claims must name the verification level achieved, and cross-platform readiness requires lifecycle smoke evidence on Windows, macOS, and Linux. Owner workflow: downstream specification, implementation, and release. Latest resolve phase: before release claim. Status: pending.

## `init` Decision

Confirmed direction: `init` creates an editable lifecycle contract; automatic scanning is a suggestion layer, not the source of truth.

### Product Rationale

`init` is the first trust moment. If it guesses too much or overwrites too freely, users will not trust Launchdeck with process and cleanup control. A conservative starter config is better than a confident but wrong inferred config.

### Recommended Defaults

- create `.launchdeck.yml` in the target project root
- fail if config exists
- allow explicit `--force`
- do not execute project commands
- generate a small starter config
- preserve future scan/template options as additive features

### Risk Avoidance

- Do not mutate ancestor configs found through upward search.
- Do not infer destructive clean targets.
- Do not mark risky dependency directories as safe.
- Do not run package manager commands during init.
- Do not hide low scan confidence.

### Stop-And-Reopen Conditions

Reopen the `init` contract if:

- users need zero-config scan before accepting Launchdeck
- generated starter config is too npm-specific for positioning
- parent config discovery creates confusing project-root behavior
- `--force` risks accidental overwrite
- templates become core to first-run success

### Added Consequence Obligation

- CA-018: `init` must create an explicit editable config without executing project commands, must not silently overwrite existing configs, and must keep scan/template inference advisory. Owner workflow: downstream specification and implementation. Latest resolve phase: before init implementation lock. Status: pending.

## Project Root And `--cwd` Decision

Confirmed direction: normal commands discover the nearest config upward from the target cwd; `init` writes to the target cwd and does not mutate ancestor configs.

### Product Rationale

Users need to trust that Launchdeck operates the intended project. This matters in monorepos, nested examples, and editor terminals where the shell may not be at the project root.

### Recommended Semantics

- default target cwd is process cwd
- global `--cwd <path>` selects target cwd
- normal commands search upward for config
- discovered config directory is project root
- task cwd resolves from project root
- runtime state and logs live under project root
- `init` writes to target cwd, not discovered ancestor root

### Monorepo Stance

The first boundary supports monorepos through explicit task `cwd` and nearest-config discovery. It does not include workspace orchestration, multi-root commands, dependency graph execution, or fan-out lifecycle commands.

### Risk Avoidance

- Do not store runtime state under a random invocation directory.
- Do not run task cwd relative to where the user happened to invoke the CLI.
- Do not let `init` overwrite parent configs discovered upward.
- Do not introduce multi-project orchestration before single-project semantics are stable.

### Stop-And-Reopen Conditions

Reopen this contract if:

- nearest-config discovery surprises users in nested project layouts
- monorepo users need multi-package orchestration in the first boundary
- `--cwd` creates confusing interactions with task `cwd`
- absolute task cwd is required for common safe workflows
- nested configs need explicit parent/child relationship semantics

### Added Consequence Obligation

- CA-019: Target cwd, config discovery, project root, task cwd, and runtime state location must be deterministic and visible, with `init` protected from accidental ancestor overwrite. Owner workflow: downstream specification and implementation. Latest resolve phase: before CLI root-resolution implementation lock. Status: pending.

## Global JSON And Exit Code Decision

Confirmed direction: JSON output is a compatibility surface; human output is product copy.

### Product Rationale

Even before considering agents, CLI tools are often consumed by scripts, CI, editor tasks, and future UI wrappers. Stable JSON prevents fragile parsing of human text.

### Recommended Contract

- all JSON output uses an object envelope
- `ok` is always present
- `error.code` is stable on failure
- command-specific payloads live beside shared fields
- exit code communicates broad success/failure
- JSON communicates precise reason and state

### Exit Code Stance

Keep v1 exit codes simple:

- `0` success
- child exit code for foreground task execution
- `1` for Launchdeck-level failures

Avoid mapping dozens of error codes to process exit codes in v1. That complexity belongs in JSON.

### Risk Avoidance

- Do not make downstream tooling parse human text.
- Do not return malformed JSON on failure.
- Do not hide partial success under `ok: true`.
- Do not return `0` for blocking `doctor` errors.
- Do not use `doctor` warnings as failing exit code by default.

### Stop-And-Reopen Conditions

Reopen the JSON/exit contract if:

- CI users need distinct process exit codes
- command payloads diverge in incompatible ways
- human output becomes the only way to access important state
- partial success cases become common enough to need stronger conventions
- JSON consumers need schema versioning sooner than expected

### Added Consequence Obligation

- CA-020: JSON output must use a stable envelope and error object, while exit codes remain simple and preserve child process exit codes for foreground tasks. Owner workflow: downstream specification and implementation. Latest resolve phase: before CLI output compatibility lock. Status: pending.

## Error Code Vocabulary Decision

Confirmed direction: v1 should define a small stable error vocabulary organized by user-action domain.

### Product Rationale

Error codes are part of the CLI contract. Users, scripts, CI, and future wrappers need to know whether to edit config, choose a different task, stop a process, confirm cleanup, or report a bug.

### Recommended Groups

- config and arguments
- task selection and validation
- foreground execution
- managed runtime
- clean
- platform
- partial failure
- internal fallback

### Stability Rule

Once v1 is public, changing an error code should be treated as a compatibility break. Adding a new code is acceptable when it lets callers take a more precise action.

### Risk Avoidance

- Do not expose raw implementation exceptions as primary error codes.
- Do not overfit codes to Node.js internals.
- Do not create many codes that users cannot act on differently.
- Do not use human messages as stable identifiers.

### Stop-And-Reopen Conditions

Reopen the error vocabulary if:

- common failures collapse into `internal_error`
- users cannot tell whether to edit config, stop a process, or confirm cleanup
- too many codes make documentation noisy
- platform adapters need clearer platform-specific failure categories
- CI users need standardized categories beyond JSON `error.code`

### Added Consequence Obligation

- CA-021: v1 error codes must be stable, actionable, snake_case, and grouped by user-action domain; `internal_error` should be rare and treated as a classification gap. Owner workflow: downstream specification and implementation. Latest resolve phase: before CLI error compatibility lock. Status: pending.

## v1 Scope Decision

Confirmed direction: v1 should be a local single-project CLI with explicit config and reliable lifecycle control.

### Product Rationale

This boundary is big enough to prove Launchdeck is a real tool and small enough to implement with high trust. It avoids turning v1 into a platform, marketplace, automation server, or agent framework before the lifecycle semantics are stable.

### v1 Center Of Gravity

- explicit `.launchdeck.yml`
- CLI-first operation
- single project root
- foreground commands
- managed long-running processes
- logs and state recovery
- safe cleanup
- stable JSON/errors
- cross-platform runtime contract

### Deferred Surface

Defer anything that does not prove local lifecycle control:

- GUI/TUI
- MCP/skill integrations
- automatic discovery as default
- monorepo orchestration
- destructive reset
- remote/cloud execution
- plugin system
- native packaging as requirement

### Risk Avoidance

- Do not hide missing lifecycle semantics behind integrations.
- Do not claim universal support before cross-platform evidence exists.
- Do not let auto-discovery become a substitute for explicit user-visible config.
- Do not expand into reset/orchestration before clean/process semantics are trusted.

### Stop-And-Reopen Conditions

Reopen v1 scope if:

- users reject hand-written config as unacceptable
- single-project lifecycle control is not compelling without automatic scan
- cross-platform runtime support requires native packaging earlier than expected
- monorepo users are the primary beachhead and require orchestration
- safe cleanup cannot be useful without reset-like behavior

### Added Consequence Obligation

- CA-022: v1 scope must remain local, single-project, CLI-first, explicit-config lifecycle control; deferred integrations and orchestration must not dilute the core lifecycle contracts. Owner workflow: downstream specification and planning. Latest resolve phase: before v1 scope lock. Status: pending.
