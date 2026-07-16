# Technical Options: Launchdeck CLI Control Plane

## Recommendation

Use a single user-scoped control-plane namespace with global registry, runtime index, locks, logs, and events. Keep the public product CLI-only and daemonless first; add a daemon later only if watch/event/dashboard needs cannot be met by files, locks, and foreground commands.

## Option A: State And Lock Based Single Instance

This is the recommended option.

Behavior enabled:

- all CLI invocations share one registry and runtime index
- mutating commands acquire global locks
- watchers read the same state and event log
- no install-time service is required
- cross-platform adoption stays simpler

Trade-offs:

- watch/follow must poll or tail local files
- concurrent writes need careful lock semantics
- very high-frequency eventing may be limited

Requirement-level constraints:

- lock start/stop/restart/registry-write/reconcile/clean-state mutations
- allow many readers
- define stale lock recovery
- define atomic write behavior for registry and runtime index

## Option B: Always-On Daemon

Behavior enabled:

- one live coordinator process owns all mutations
- real-time event push is easier
- future UI/TUI/MCP can attach to the daemon

Trade-offs:

- installation and lifecycle complexity increase
- Windows/macOS/Linux service behavior differs
- permission boundaries become harder
- first CLI product may become harder to validate

Recommended handling:

- defer daemon mode until the CLI control-plane semantics are proven
- keep the data model daemon-compatible

## Option C: Per-Project State Only

Behavior enabled:

- simple implementation
- each project remains isolated

Trade-offs:

- does not solve the user's global visibility pain
- cannot reliably prevent duplicate starts across agents and terminals
- port conflict explanations remain fragmented

Recommendation:

- reject as the product center; keep project-local state as a component, not the whole model

## Control-Plane Data Model Decision

Recommended structure:

- `registry/projects.json` for registered project identity and aliases
- `runtime/runs.json` for Launchdeck-owned run index
- `locks/` for registry, project, and task locks
- `events/events.jsonl` for append-only control-plane events
- live process/port inspection for current reality

This keeps each state surface explainable. It also prevents caches or stale run records from becoming more authoritative than the operating system.

## Command Transaction Decision

Recommended direction: every state-changing lifecycle command should have a transaction id and leave an event trail.

For example:

- `start` writes `starting` before spawning
- `stop` writes `stopping` before graceful termination
- `restart` creates a new run id after stopping the old owned run
- `reconcile` changes Launchdeck state only and does not kill processes

This provides recovery evidence when a command is interrupted or partially fails.

## Locking Decision

Recommended direction: use granular locks rather than one global lock for all operations.

- registry lock serializes project registry mutations
- project lock serializes project-level maintenance and cleanup
- task lock serializes start/stop/restart for one `project:task`

This permits different projects to run concurrently while preventing duplicate starts for the same task.

## Ownership Decision

Recommended direction: ownership should be evidence-scored, not binary from one signal.

Evidence may include:

- run id
- project id
- task
- PID and process start time
- process tree/group/job evidence
- cwd and command
- expected ports
- injected environment variables
- runtime record

Product result states should include `verified-owned`, `probable-owned`, `stale-owned`, `external`, and `unknown`.

## Diagnostic Command Decision

Recommended direction: `inspect` is the unified explanation command. Listing commands discover facts; `inspect` explains evidence and safe actions for one target.

Command role split:

- `status`: summary dashboard
- `ps`: Launchdeck-owned runs
- `ports`: port observations
- `conflicts`: blocking issues
- `inspect`: evidence, ownership, safe actions, blocked actions

## Onboarding Decision

Recommended direction: `project scan` discovers and `project add` registers. Neither should start tasks or claim ownership of running processes.

Bulk add can be deferred or guarded by dry-run/confirmation because scan confidence and alias conflicts can otherwise make onboarding unsafe.

## Port Conflict Decision

Recommended direction: conflicts are not priority choices. Launchdeck should report declared duplicates, owned running conflicts, external conflicts, unknown-owner conflicts, partial multi-port conflicts, and stale-state conflicts separately.

Safe resolution actions depend on ownership:

- owned conflict: user may stop/restart the owner task
- external conflict: inspect only
- unknown conflict: inspect/reconcile
- declared duplicate: edit config or run one at a time

## Logs And Events Decision

Recommended direction: logs should be per-run and events should be append-only. Logs are task output; events are Launchdeck behavior.

Retention must preserve:

- current running run logs
- latest failed run logs
- logs tied to stop/start failures
- enough events to explain recent status and conflicts

## Clean And Reset Decision

Recommended direction: keep `clean` non-destructive and separate from `reset`.

`clean` may remove safe/generated or Launchdeck-owned retention data. It must not stop services, remove projects from the registry, delete unknown files, delete current running evidence, or perform destructive database/container reset operations.

Future `reset` must be separate, explicitly configured, and strongly confirmed.

## Automation And Future Client Decision

Recommended direction: treat CLI JSON as the first draft of the future control-plane API.

Human output can evolve; JSON and JSON Lines should carry stable state, ownership, readiness, evidence, safe actions, blocked actions, errors, and next actions. GUI/TUI/MCP clients should reuse that semantic model rather than maintaining second state.

## Security And Compatibility Decision

Recommended direction: fail closed for unsafe paths, unknown ownership, unsupported state versions, corrupt state, and platform limitations.

Persistent data should be versioned. Unknown newer state should block dangerous mutations and permit only degraded safe inspection when possible.

## Specification Packaging Decision

Recommended downstream consumer: `sp-specify`.

Reason: the scope spans global registry, runtime state, locks, event streams, process ownership, cleanup safety, JSON compatibility, security, documentation, demo, and cross-platform verification. This is one coherent product feature, but it is too broad for a quick task.

## Consequence Obligations

- CA-CP-001: Global state must be single-authoritative per default user scope.
- CA-CP-002: Mutating lifecycle operations must be globally serialized.
- CA-CP-003: Stop/restart authority must require Launchdeck ownership proof.
- CA-CP-004: External processes must remain inspect-only by default.
- CA-CP-005: Stale and uncertain state must route to reconcile/inspect before dangerous actions.
- CA-CP-006: Output must expose reason and safe next actions.
- CA-CP-007: Ready/running/failed/stale/external/conflict states must stay distinct.
- CA-CP-008: Project identity must use stable IDs and unique aliases; paths are repairable locations, not sole identity.
- CA-CP-009: Registry, runtime, locks, events, live inspection, and caches must remain distinct authority layers.
- CA-CP-010: Lifecycle mutations must leave state and event evidence on both success and failure.
- CA-CP-011: Lock stale recovery must avoid PID-reuse mistakes.
- CA-CP-012: Inspect must expose evidence, ownership confidence, safe actions, and blocked actions.
- CA-CP-013: Logs and events must preserve enough diagnosis while avoiding secret exposure and unbounded growth.
- CA-CP-014: Clean must remain hygiene and reset must remain separate.
- CA-CP-015: Confirmation/force flags must not bypass ownership, path, or version safety.
- CA-CP-016: Automation must have stable JSON, non-interactive behavior, timeouts, idempotency, and next actions.
- CA-CP-017: Future GUI/TUI/MCP/editor clients must reuse the same control-plane truth.
- CA-CP-018: Persistent state compatibility must fail closed for dangerous mutations.
- CA-CP-019: Security threat-model requirements must be preserved across spec, implementation, tests, and docs.
- CA-CP-020: Cross-platform readiness requires lifecycle smoke evidence on Windows, macOS, and Linux.

## Stop-And-Reopen Conditions

Reopen this option set if:

- users require whole-machine shared state across OS users in the first product shape
- foreground watch/follow cannot meet observation needs without a daemon
- lock-based coordination proves unreliable across supported platforms
- external process management becomes a core product requirement
- project alias or path repair semantics make common usage ambiguous
- event/log retention cannot support debugging without unbounded local growth
