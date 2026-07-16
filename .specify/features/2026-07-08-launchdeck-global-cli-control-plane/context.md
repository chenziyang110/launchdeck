# Planning Context: Launchdeck Global CLI Control Plane

**Feature Branch**: `2026-07-08-launchdeck-global-cli-control-plane`  
**Created**: 2026-07-08  
**Status**: Ready for planning review  
**Derived From**: `spec.md`, `alignment.md`, confirmed discussion handoff, discussion source files, project cognition compass, and live repository reads

## Planning Context

This feature should be planned as one product layer: a user-scoped global CLI control plane for local project services. Planning should not split it into unrelated command patches unless those patches are explicitly sequenced under the same control-plane architecture and acceptance proof.

The first implementation shape should remain daemonless and CLI-first. The core truth is shared state, locks, logs, events, and live OS inspection. Daemon/service mode and GUI/TUI/MCP/editor clients are future presentation or coordination options, not prerequisites for this feature.

## Source File Sweep

### Discussion And Handoff Sources Read

- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/discussion-state.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/discussion-log.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/requirements.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/technical-options.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/project-context.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/open-questions.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/handoff-assessment.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.json`

### Project Cognition And Memory Sources Read

- `F:/github/launchdeck/.specify/memory/constitution.md`
- `F:/github/launchdeck/.specify/memory/project-rules.md`
- `F:/github/launchdeck/.specify/memory/learnings/INDEX.md`
- `F:/github/launchdeck/.specify/templates/workflow-state-template.md`
- `F:/github/launchdeck/.planning/quick/2026-07-08-global-runtime-supervisor/STATUS.md`
- `F:/github/launchdeck/.planning/quick/2026-07-08-global-runtime-supervisor/SUMMARY.md`

### Live Repository Evidence Read

- `F:/github/launchdeck/package.json`
- `F:/github/launchdeck/README.md`
- `F:/github/launchdeck/src/cli.js`
- `F:/github/launchdeck/src/global-runtime.js`
- `F:/github/launchdeck/src/runtime.js`
- `F:/github/launchdeck/src/adapters/process.js`
- `F:/github/launchdeck/src/output.js`
- `F:/github/launchdeck/src/errors.js`
- `F:/github/launchdeck/test/global-runtime.test.js`

## Relevant Repository Context

- Runtime language is JavaScript ESM on Node.js `>=20`.
- The package binary is `launchdeck` at `src/cli.js`.
- Project checks are `npm run check` and `npm test`.
- `yaml` is the only package dependency currently listed.
- Current persistent state includes project-local `.launchdeck/runtime/state.json` and `.launchdeck/logs/`.
- Current global state uses a user-level Launchdeck registry path, with `LAUNCHDECK_HOME` override support for isolated tests.

## Existing Patterns And Reuse Notes

- `src/cli.js` is the CLI command router and already handles human and JSON output paths.
- `src/output.js` provides JSON success, failure, and partial envelopes.
- `src/errors.js` centralizes public error codes and aliases.
- `src/runtime.js` owns project-local managed process state, logs, clean planning/execution, and process stop behavior.
- `src/global-runtime.js` owns the current global registry, global process listing, declared-port inspection, conflicts, project scan, and declared-port preflight.
- `src/adapters/process.js` isolates process spawning, process tree stop, liveness, and port listener inspection.
- `test/global-runtime.test.js` is the current evidence for the quick-slice global runtime behavior.

The existing implementation is useful scaffolding, but it is not the complete feature. Planning should explicitly identify deltas rather than assuming the current quick slice already satisfies the control-plane specification.

## Current Implementation Facts

- Existing global registry commands include `project add`, `project remove`, `project scan`, and `projects`.
- Existing global observation commands include `status --all`, `conflicts`, `ps --all`, `ports`, and `inspect-port <port>`.
- Existing lifecycle commands support `project:task` targets for global start, stop, restart, and logs.
- Existing start behavior preflights declared port conflicts and refuses externally occupied declared ports before spawning.
- Existing tests verify idempotent project add, global process aggregation, declared port reporting, external port inspection, external port conflict refusal, global status, conflict reporting, registry-only remove, explicit scan, global logs, and explicit `logs --follow` refusal.
- Existing README documents the v1 global runtime registry and release claim labels.

## Known Gaps Against This Feature

- Project identity currently appears name/path centered in some surfaces; this feature requires stable `projectId` plus unique alias and repairable path.
- `project remove` currently has registry-only behavior; this feature requires refusal while Launchdeck-owned tasks for that project are running unless a later explicit force contract is defined.
- A complete global runtime run index is not yet specified as distinct from project-local runtime state.
- Registry, project, and task lock semantics are not yet formalized.
- Transaction ids and append-only control-plane events are not yet complete product APIs.
- Unified `inspect` is not yet the complete diagnostic surface; `inspect-port` is only a compatibility slice.
- Ownership proof currently needs strengthening beyond liveness and declared-port correlation.
- Ready state and readiness checks need complete product semantics.
- Log/event retention and secret redaction policies need planning.
- Persistent state versioning and fail-closed migration behavior need explicit design.
- Official demo and cross-platform lifecycle smoke matrix need planning.

## Integration Boundaries

- `.launchdeck.yml` remains the project safety contract for tasks, ports, readiness, stop behavior, and clean targets.
- OS process table and port inspection are evidence sources, not authority by themselves.
- Filesystem state is local, user-scoped, and must be path-safe.
- CLI JSON, error codes, next actions, JSON Lines, event records, and state versions are compatibility surfaces.
- Future presentation clients must reuse the same control-plane state and action semantics.

## Product Boundary Constraints

- Do not require a daemon for the base feature.
- Do not include GUI/TUI/MCP/editor implementation in this feature.
- Do not add default external process kill.
- Do not merge `clean` and destructive `reset`.
- Do not make whole-machine or multi-user registry sharing a base requirement.
- Do not claim cross-platform-ready from local Windows-only evidence.

## Affected Object Map

| Obligation ID | Object / State Surface | Consumers | Evidence | Coverage Gap |
| --- | --- | --- | --- | --- |
| CA-CP-001 | Global registry and namespace | CLI, future clients | `src/global-runtime.js`, README | Alias and repair model |
| CA-CP-002 | Locks and runtime mutations | CLI, tests | Discussion sources | Lock implementation plan |
| CA-CP-003 | Ownership proof | Stop/restart/force-stop | `src/runtime.js`, `src/adapters/process.js` | Evidence scoring |
| CA-CP-004 | External processes | Ports/conflicts/inspect | `test/global-runtime.test.js` | Unified inspect wording/actions |
| CA-CP-005 | Stale state | Reconcile/status/inspect | `src/runtime.js` refresh behavior | Reconcile command design |
| CA-CP-006 | Human/JSON output | Users, scripts | `src/output.js`, `src/errors.js` | Structured `next` model |
| CA-CP-007 | Status vocabulary | Automation | Discussion requirements | Complete state taxonomy |
| CA-CP-008 | Project identity | CLI targeting | Registry implementation | Unique alias and repair |
| CA-CP-009 | Authority layers | Planner/implementer | Technical options | Separation in state design |
| CA-CP-010 | Event trail | Debug/recovery | Discussion requirements | Append-only events |
| CA-CP-011 | Stale locks | Concurrent agents/terminals | Technical options | PID reuse proof strategy |
| CA-CP-012 | Inspect | Users/automation | Existing `inspect-port` | Unified target model |
| CA-CP-013 | Logs/events retention | Debug/recovery | README/runtime logs | Retention/redaction policy |
| CA-CP-014 | Clean/reset | Users/tests | `src/runtime.js`, README | Running/failure evidence preservation |
| CA-CP-015 | Confirmation/force | CLI safety | README/current options | Hard-boundary enforcement |
| CA-CP-016 | Automation | Scripts/future clients | `src/output.js` | `next`, timeout, JSONL details |
| CA-CP-017 | Future clients | GUI/TUI/MCP/editor later | Discussion handoff | Shared semantic model |
| CA-CP-018 | State compatibility | Upgrades | Current version constants | Fail-closed migration behavior |
| CA-CP-019 | Security | All mutating commands | Path/process adapters | Complete threat-model tests |
| CA-CP-020 | Cross-platform evidence | Release claims | README release claims | Windows/macOS/Linux smoke matrix |

## Locked Decisions Carry-Forward

- Feature remains Launchdeck Global CLI Control Plane.
- Scope is user-scoped local machine by default.
- Single instance means one authoritative state/control namespace, not necessarily a daemon.
- Project identity is stable ID plus unique alias plus repairable path.
- Registry, runtime index, locks, events, logs, and OS inspection are distinct authority layers.
- Duplicate start of the same `project:task` must not spawn a second instance.
- Stop/restart requires ownership proof; port or PID alone is insufficient.
- External processes are inspect-only by default.
- `inspect` is the unified evidence and safe-action command.
- `clean` is hygiene; `reset` is separate and deferred.
- `--yes` and `--force` cannot bypass hard safety boundaries.
- JSON, error codes, JSON Lines, next actions, event records, and state versions are compatibility surfaces.
- Security and persistent-state uncertainty fail closed.
- Cross-platform-ready requires smoke evidence on Windows, macOS, and Linux.

## Soft Unknowns For Planning

- User-scoped registry storage path and migration from the current location.
- Exact lock wait timeout, stale-lock timeout, and metadata format.
- Event/log retention policy and redaction boundaries.
- Exact `inspect --json` field names.
- JSON schema versioning timeline.
- Official demo project details, likely `examples/demo-api` on port `8888`.
- Cross-platform process-tree proof strategy.

## Verification Entry Points

Planning should preserve or expand these verification routes:

- `npm run check`
- `npm test`
- targeted CLI/global runtime tests, especially `test/global-runtime.test.js`
- lifecycle smoke on Windows, macOS, and Linux before any cross-platform-ready release claim
- official demo script or documentation journey proving register, start once, duplicate-start refusal, inspect, status, restart/stop, stale recovery, logs/events, and clean

## Planning Readiness

Ready for `/sp.plan`.

The plan should define implementation phases, state shape, command/API deltas, tests, docs/demo work, safety gates, and release evidence. It should not reopen the product boundary unless a deferred item becomes mandatory or a safety invariant conflicts with feasible implementation.
