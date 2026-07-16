# Planning Context: Launchdeck v1 Cross-Platform CLI Lifecycle Tool

**Feature Branch**: `2026-07-07-launchdeck-v1-cross`  
**Created**: 2026-07-07  
**Status**: Ready for user review  
**Derived From**: `spec.md`, `alignment.md`, discussion handoff, discussion source files, project memory, project cognition compass, and targeted repository evidence.

## Planning Context

- The target product is Launchdeck v1: a CLI-first, local, single-project lifecycle control tool driven by explicit `.launchdeck.yml`.
- The planning boundary is not a GUI, MCP server, agent package, discovery engine, marketplace, orchestrator, daemon, cloud runner, plugin system, or reset tool.
- The package is ready for `/sp.plan` if the user accepts the artifact review summary; all remaining unknowns are soft downstream detail decisions with stop-and-reopen triggers.
- The main planning challenge is preserving safety and compatibility across command semantics, managed process state, cleanup behavior, JSON output, error codes, and cross-platform validation.

## Relevant Repository Context

- `package.json` defines a Node ESM CLI package named `launchdeck`, binary `launchdeck: ./src/cli.js`, Node engine `>=20`, dependency `yaml`, and scripts `check` and `test`.
- `README.md` already frames Launchdeck as a universal lifecycle control tool using `.launchdeck.yml`.
- `.launchdeck.yml` dogfoods setup, test, lint, safe clean, and risky clean declarations.
- `src/cli.js` currently exposes init, doctor, lifecycle aliases, run, dev/start/restart, ps, logs, stop, clean, JSON handling, and help text.
- `src/config.js` currently discovers config upward and normalizes tasks, env, ports, risk, cwd, clean targets, and starter config.
- `src/runtime.js` currently manages `.launchdeck/logs`, `.launchdeck/runtime/state.json`, managed process start, PID liveness refresh, stop, log tailing, and clean target resolution.
- `test/cli.test.js` currently exercises doctor, foreground run, managed dev start, duplicate start, ps, logs, stop, clean dry-run, clean safe, risky confirmation, init, config exists, and missing task.

## Existing Patterns And Reuse Notes

- The existing CLI, config, runtime, and errors modules are natural ownership surfaces for planning. The spec does not require immediate module rewrites, but planning should preserve a clean product boundary between CLI semantics and platform-sensitive runtime behavior.
- The current implementation already has Windows/POSIX stop branches. Planning must not treat that as full cross-platform readiness; it is a starting point requiring platform evidence.
- The project uses artifact-first workflows under `.specify/`; this spec is a planning artifact and does not mutate source/runtime behavior.

## Integration Boundaries

- Config file is the user-authored protocol boundary.
- CLI command names and options are the human and automation entry points.
- JSON output and error codes are compatibility boundaries for scripts, future agent integrations, CI, and editor wrappers.
- Runtime state and logs are project-local shared state surfaces.
- Clean target deletion is a destructive filesystem trust boundary.
- Platform adapters are the boundary between product semantics and OS-specific process/path/shell/filesystem behavior.

## Product Boundary Constraints

- v1 is local and single-project.
- v1 keeps hand-written config as the source of truth.
- v1 may reserve future platform overrides but does not need full discovery/template behavior.
- v1 must keep `clean` separate from destructive `reset`.
- v1 must name release claim levels honestly.

## Affected Object Map

| Obligation ID | Object / State Surface | Owner | Consumers | Evidence | Coverage Gap |
| --- | --- | --- | --- | --- | --- |
| CA-001 | Clean target declarations and filesystem paths | CLI/runtime clean | Developers, scripts, future agents | requirements.md, runtime.js | Symlink/junction semantics need implementation-level proof. |
| CA-002 | Managed child processes | Runtime process adapter | Developers, ps/logs/stop, future agents | requirements.md, runtime.js, cli.test.js | Cross-platform process-tree stop requires OS smoke. |
| CA-003 | JSON output | CLI output layer | Automation, CI, future integrations | requirements.md, cli.js | Command-specific schemas need lock. |
| CA-004 | `.launchdeck.yml` | Config loader/protocol docs | Developers, CLI, future integrations | requirements.md, config.js | Future schema evolution deferred. |
| CA-005 | `.launchdeck/runtime/state.json` and `.launchdeck/logs` | Runtime | ps/logs/stop/clean | runtime.js, requirements.md | Pruning strategy deferred. |
| CA-006 | Windows/macOS/Linux behavior | Runtime adapters and verification | All users | technical-options.md | Evidence required on each OS. |
| CA-009 | Error vocabulary | CLI/errors/docs | Automation and support | requirements.md | Final code names need implementation lock. |
| CA-017 | Release claim levels | Verification/release docs | Users and maintainers | requirements.md | CI provider and smoke artifact format are soft unknowns. |

## Consequence Notes

- `CA-001`: planning must treat delete behavior as safety-critical and require refusal tests for project root/out-of-root paths.
- `CA-002`: planning must include process lifecycle tests and stale-state behavior, not only successful start.
- `CA-003`: planning must include JSON parseability checks for success, error, and partial failure.
- `CA-016`: planning must preserve adapter boundaries for path, shell, process, executable lookup, cleanup, and logs.
- `CA-017`: planning must separate local dev confidence from cross-platform release confidence.

## Dependency Impact Table

| Obligation ID | Upstream / Downstream Surface | Impact | Required Handling |
| --- | --- | --- | --- |
| CA-004 | `.launchdeck.yml` to every command | A config change affects all lifecycle behavior. | Centralize normalization and validation. |
| CA-005 | Runtime state to ps/logs/stop/clean | State deletion or corruption affects recovery. | Preserve records during inspection; cleanup only by explicit clean targets. |
| CA-009 | JSON/error contract to automation | Unstable fields break future consumers. | Define shared envelope and error vocabulary before command expansion. |
| CA-015 | Clean config to filesystem | Bad containment can delete user data. | Canonical containment checks and negative tests. |
| CA-016 | Platform adapters to lifecycle behavior | OS-specific semantics can diverge. | Adapter-owned implementation with product-level tests. |
| CA-017 | Verification evidence to release claims | Overstated cross-platform claims damage trust. | Gate claim wording on OS smoke evidence. |

## Change Propagation Matrix

| Change Surface | Upstream Inputs | Downstream Consumers | Constraint / Risk |
| --- | --- | --- | --- |
| Config schema | `.launchdeck.yml` v1 | all commands, docs, examples | Must remain explicit and stable. |
| Task execution | task metadata | run, aliases, dev/start/restart | `longRunning` must determine behavior. |
| Runtime state | managed process records | ps, logs, stop, clean | Must be inspectable and recoverable. |
| Cleanup | clean.safe/risky | filesystem, logs/runtime state | Must default to preview and refuse unsafe paths. |
| JSON output | all commands | scripts, future agents, CI | Must remain valid and structured on failures. |
| Platform behavior | OS adapters | start/stop/logs/clean/doctor | Must not change public command meaning per OS. |

## Locked Decisions Carry-Forward

- CLI-first product center.
- Explicit `.launchdeck.yml` v1 protocol.
- Read-only `doctor` and `tasks`.
- `longRunning`-driven execution semantics.
- Runtime state/logs as recovery ledger.
- Dry-run clean default and safe/risky split.
- Stable JSON envelope and error vocabulary.
- Cross-platform readiness requires evidence on Windows, macOS, and Linux.

## Discussion Decision Carry-Forward

- **Locked Direction**: CLI-first lifecycle control is the selected direction; planning should not pivot to agent/MCP-first.
- **Rejected Alternatives**: Protocol/core-library-first and agent/MCP-first are deferred; planning may preserve internal boundaries but must keep CLI as the visible v1 product.
- **Accepted Tradeoffs**: Hand-written config first, Node runtime acceptable for initial implementation, shell-string commands retained for v1, platform overrides reserved.
- **Experience Commitments**: The first user flow is `init`, `doctor`, `tasks`, `run`, managed `dev/start`, `ps`, `logs`, `stop`, and clean preview/safe.
- **Review Criteria Carry-Forward**: Preserve v1 scope, cleanup safety, runtime recovery, JSON compatibility, and cross-platform verification.
- **Must Not Dilute**: Do not make Launchdeck a thin alias runner, documentation-only protocol, or agent-only adapter.

## Must-Preserve Carry-Forward

- `MP-001` through `MP-016` are mapped in `spec.md#must-preserve-discussion-inputs` and `alignment.md#must-preserve-coverage`.
- Stop-and-reopen conditions are listed in `alignment.md#outstanding-soft-unknowns`.

## Canonical References

- `.specify/discussions/launchdeck-tool/handoff-to-specify.md`
- `.specify/discussions/launchdeck-tool/handoff-to-specify.json`
- `.specify/discussions/launchdeck-tool/requirements.md`
- `.specify/discussions/launchdeck-tool/technical-options.md`
- `.specify/discussions/launchdeck-tool/open-questions.md`
- `.specify/discussions/launchdeck-tool/project-context.md`
- `.specify/discussions/launchdeck-tool/discussion-log.md`
- `README.md`
- `.launchdeck.yml`
- `src/cli.js`
- `src/config.js`
- `src/runtime.js`
- `test/cli.test.js`

## Outstanding Questions

No planning-critical question blocks `/sp.plan`. Soft unknowns remain around exact JSON schemas, doctor finding codes, partial failure payloads, CI provider, smoke artifact format, symlink cleanup semantics, starter config shape, and public error documentation format.

## Deferred / Future Ideas

- Automatic scan/template onboarding.
- Agent skill and MCP integration.
- UI/TUI dashboard.
- Monorepo orchestration.
- Runtime pruning.
- Native installers.
- Separate destructive reset contract.
