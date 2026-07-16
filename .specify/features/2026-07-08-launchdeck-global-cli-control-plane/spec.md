# Feature Specification: Launchdeck Global CLI Control Plane

**Feature Branch**: `2026-07-08-launchdeck-global-cli-control-plane`  
**Created**: 2026-07-08  
**Status**: Ready for planning review  
**Input**: Confirmed `sp-discussion` handoff for `launchdeck-cli-control-plane`

## Overview

### Feature Goal

Launchdeck must become a user-scoped global CLI control plane for local project services. A user should be able to register multiple local projects, see which services are running, see which ports are occupied and by whom, prevent duplicate starts, and safely stop or restart only the services Launchdeck can prove it owns.

This feature upgrades Launchdeck from a local lifecycle runner plus early global visibility slice into a coherent control plane. The CLI remains the first complete product surface. Future GUI, TUI, MCP, editor, or web clients are deferred presentation clients over the same state, events, logs, ownership model, and safety semantics.

### Intended Users and Value

- **Primary users / roles**: developers running many local projects, agents/scripts that automate local project lifecycle operations, and maintainers validating Launchdeck behavior.
- **Problem or opportunity**: users lose track of which project service owns a port, agents accidentally start duplicate instances, and manual process killing risks stopping the wrong process.
- **Confirmed product outcome**: one user-scoped CLI namespace explains registered projects, tasks, runs, ports, conflicts, logs, events, stale state, and safe next actions.

## Confirmed Scope

### In Scope

- A user-scoped global project registry with stable `projectId`, unique `alias`, display name, project path, and config path.
- Explicit onboarding and repair commands: `project add`, `project scan`, `project remove`, `project repair`, and `projects`.
- A global runtime run index for Launchdeck-owned project task runs.
- Registry, project, and task locks with stale-lock recovery that avoids PID-reuse mistakes.
- Transaction-like mutations for start, stop, restart, reconcile, project registration changes, and managed cleanup.
- Duplicate-start prevention for the same `project:task`.
- Ownership proof for stop, restart, force-stop, and conflict resolution.
- Global observe and diagnose commands: `status`, `ps`, `ports`, `conflicts`, `inspect`, `logs`, and `events`.
- A unified `inspect` command for project alias, `project:task`, run id, port, PID, and project path targets.
- Distinct running, ready, failed, stale, external, unknown, and conflict states.
- Logs and events linked by `projectId`, task, `runId`, and transaction id.
- Safe clean behavior that removes only declared, generated, stale, retention-expired, or Launchdeck-owned hygiene data.
- Confirmation, force, non-interactive, timeout, JSON, JSON Lines, exit-code, and structured next-action behavior.
- Official demo, documentation, security requirements, compatibility requirements, and cross-platform validation.

### Out of Scope

- Always-running daemon or OS service implementation.
- GUI, TUI, MCP, editor, or local web dashboard implementation.
- Killing external processes by PID or port by default.
- Destructive reset implementation.
- Auto-restart policy.
- Plugin marketplace.
- Workspace orchestration.
- Whole-machine or multi-OS-user shared registry.
- Docker volume/container ownership.

### Deferred Or Future Scope

- Daemon/service transport, reopened only if foreground watch/follow and local state/event files cannot satisfy observation needs.
- Whole-machine or multi-user state, reopened only if users need one shared Launchdeck namespace across OS users.
- External process force kill, reopened only with an explicit danger contract and security review.
- Destructive `reset`, reopened as a separate feature with stronger configuration and confirmation.
- Exact lock timeout and stale-lock recovery defaults, resolved during planning without changing the safety model.
- Exact log/event retention days or run counts, resolved during planning without deleting required diagnosis evidence.
- Exact JSON schema versioning mechanism, reopened when multiple durable clients need compatibility negotiation beyond the first stable envelope.
- Final field names for `inspect --json`, resolved during planning without removing target, status, ownership confidence, evidence, safe actions, or blocked actions.
- Official demo implementation details, resolved during planning and implementation while preserving the required proof journey.

## Must-Preserve Discussion Inputs

- **Source**: `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.md`
- **Coverage Status**: sufficient-for-specify
- **Planning Gate Status**: ready

### Mapped Must-Preserve Items

- `MP-001` goal: feature remains the Launchdeck Global CLI Control Plane, not a loose command bundle. Preserved by this title, scope, scenarios, and acceptance model.
- `MP-002` scope: default scope is one OS user on one local machine. Preserved in state and registry requirements.
- `MP-003` decision: single instance means one authoritative state/control namespace, not necessarily a daemon. Preserved in architecture requirements.
- `MP-004` decision: project identity uses `projectId`, unique `alias`, and repairable path. Preserved in registry requirements.
- `MP-005` decision: registry, runtime index, locks, events, and OS inspection are distinct authority layers. Preserved in data model requirements.
- `MP-006` scenario: duplicate `project:task` start must not create a second instance. Preserved in lifecycle scenarios and functional requirements.
- `MP-007` decision: stop/restart requires ownership proof; port or PID alone is insufficient. Preserved in safety invariants.
- `MP-008` non-goal: Launchdeck is not a default external process killer. Preserved in out-of-scope and inspect-only external behavior.
- `MP-009` decision: `inspect` is the unified evidence and safe-action explanation command. Preserved in observe/diagnose requirements.
- `MP-010` decision: `clean` is hygiene and `reset` is separate/destructive/deferred. Preserved in maintain requirements.
- `MP-011` decision: confirmation and force flags cannot bypass ownership, path, version, or external safety. Preserved in permission requirements.
- `MP-012` decision: JSON, error codes, next actions, and JSON Lines are compatibility surfaces. Preserved in automation requirements.
- `MP-013` tradeoff: future clients are deferred but reuse the same control-plane truth. Preserved in overview and extension boundary.
- `MP-014` decision: persistent state compatibility fails closed for dangerous mutations. Preserved in compatibility requirements.
- `MP-015` decision: security fails closed for path escape, symlink/junction escape, PID reuse, env leakage, corrupt state, and unsafe names. Preserved in security requirements.
- `MP-016` scenario: official demo proves duplicate start, port ownership, inspect, restart/stop, stale recovery, logs/events, and clean. Preserved in demo acceptance.
- `MP-017` decision: cross-platform-ready requires lifecycle smoke on Windows, macOS, and Linux. Preserved in release criteria.

### Discussion Conflicts

No open conflicts block specification. Remaining unknowns are soft defaults for storage path, retention, timeout, JSON field spelling, JSON schema versioning, official demo implementation, daemon transport, and cross-platform proof details.

## Product Model

### Core Objects

- **Project**: a registered local code directory with `projectId`, unique `alias`, display name, current path, and config path.
- **Task**: a named lifecycle action from `.launchdeck.yml`, including kind, command, cwd, risk, long-running flag, declared ports, readiness, stop behavior, and clean declarations.
- **Run**: one Launchdeck-owned execution instance of a task, including run id, project id, task, root PID, process evidence, status, readiness, ports, log references, timestamps, and last error.
- **Port**: an observed TCP port plus declared task ownership, actual listener evidence, conflict state, and safe actions.
- **Lock**: concurrency control record for registry, project, or task mutation, including owner metadata and stale recovery evidence.
- **Event**: append-only control-plane record for actions, state transitions, failures, repairs, and safety refusals.
- **Log**: stdout/stderr task output, preferably per-run, linked to project, task, run id, and transaction id.

### Authority Layers

Launchdeck must not collapse all truth into one stale file. It must keep the following layers distinct:

1. Live OS process and port reality.
2. Launchdeck ownership identity and run evidence.
3. Global project registry identity and aliases.
4. Project `.launchdeck.yml` safety contract.
5. Runtime index, event log, and rebuildable caches.

## Scenarios and Usage Paths

### Primary Scenario - Register, Start Once, Observe Globally

A user registers a project and starts a long-running task. Another terminal or automation client asks for global status and sees the same task, run, port, readiness, and log/event references.

**Usage Path**:
1. User runs `launchdeck project add <path> --alias api`.
2. User runs `launchdeck start api:dev`.
3. User runs `launchdeck status --all`, `launchdeck ps --all`, and `launchdeck ports`.

**Acceptance Signals**:
- Registry contains one project identity with stable `projectId` and unique alias.
- The started task has exactly one active Launchdeck-owned run.
- Global status reports project, task, run status, readiness state, declared ports, and safe next actions.
- Re-running `launchdeck start api:dev` returns `already_running` or equivalent successful idempotent result without spawning a second service.

### Secondary Scenario - External Port Conflict

A project declares port `8888`, but an external process already listens there. Launchdeck refuses to start the task and explains the evidence without killing anything.

**Usage Path**:
1. External process occupies port `8888`.
2. User runs `launchdeck start api:dev`.
3. User runs `launchdeck inspect 8888` or `launchdeck inspect port:8888`.

**Acceptance Signals**:
- Start fails before spawning the managed task.
- Error code is stable and domain-oriented, such as `port_conflict`.
- Output distinguishes external listener from Launchdeck-owned task.
- Next actions do not suggest `stop` through Launchdeck unless ownership is proven.

### Secondary Scenario - Owned Restart

A user wants to restart a task that Launchdeck owns. Launchdeck proves ownership, stops the owned process tree, waits for port release, starts a new run, and preserves events for both phases.

**Usage Path**:
1. User runs `launchdeck inspect api:dev`.
2. User runs `launchdeck restart api:dev`.
3. User runs `launchdeck events --json` and `launchdeck logs api:dev`.

**Acceptance Signals**:
- Restart is serialized under the task lock.
- Stop only targets the owned process tree.
- New run id is created after successful stop or after an inspectable partial failure.
- Events record stop intent, stop result, start intent, start result, and failures.

### Secondary Scenario - Stale State Recovery

An owned process exits or is killed outside Launchdeck. Launchdeck detects the stale run and routes dangerous operations through reconcile or inspect.

**Usage Path**:
1. A Launchdeck-owned process disappears outside Launchdeck.
2. User runs `launchdeck status --all`.
3. User runs `launchdeck reconcile api:dev`.

**Acceptance Signals**:
- State is marked stale, not silently removed.
- Stop/restart is blocked or downgraded until ownership evidence is safe.
- Reconcile updates Launchdeck state and writes events without killing processes.

### Secondary Scenario - Safe Clean

A user asks Launchdeck to clean generated data. Launchdeck plans clean targets, refuses unsafe paths, and preserves current running evidence and recent failure evidence.

**Usage Path**:
1. User runs `launchdeck clean --safe`.
2. User optionally runs `launchdeck clean --all --yes` for declared risky hygiene targets.

**Acceptance Signals**:
- Clean does not stop services, remove registry entries, delete project roots, delete unknown files, delete external files, or perform reset behavior.
- Clean refuses path escapes, symlink/junction escapes, project-root deletion, empty targets, and ambiguous targets.
- Current running logs, latest failed run logs, and failure-linked events remain available.

### Edge Cases and Failure Paths

- Ambiguous project alias or target is rejected rather than guessed.
- Missing project path is represented as missing/repairable and does not delete registry state automatically.
- Unsupported newer registry/runtime state allows safe degraded reads where possible but blocks mutations.
- Corrupt registry/runtime files fail closed for dangerous operations.
- Lock owner disappeared or lock is stale: recovery requires PID and start-time evidence where available.
- Platform port inspection cannot identify PID: state is `unknown-owner`; stop/restart remains blocked.
- Non-interactive command that needs confirmation returns structured failure instead of prompting.
- `--force` on external or unknown process ownership remains blocked.
- Clean target crosses project root through symlink/junction or canonicalization: refused.

## Functional Requirements

### Project Registry And Identity

- **FR-001**: Launchdeck must store a user-scoped global registry of registered projects and expose it through `launchdeck projects` with project ids, aliases, names, paths, config paths, and status-affecting warnings where relevant.
- **FR-002**: Each registered project must have a stable `projectId` that does not rely only on display name.
- **FR-003**: Each registered project must have a globally unique user-facing `alias` for CLI targeting.
- **FR-004**: Project path and config path must be repairable locations, not the only identity.
- **FR-005**: `project add` must be idempotent for the same project identity and must not start tasks.
- **FR-006**: `project scan` must be explicit, bounded, and non-mutating except for the requested registration behavior; it must skip heavy/generated folders by default.
- **FR-007**: `project remove` must remove only the registry entry and must not delete project files, runtime files, or logs. It must refuse removal while Launchdeck-owned tasks for that project are running unless a later explicit force contract is specified and the action remains safe.
- **FR-008**: `project repair` must update missing/moved path or config references without changing `projectId` when identity evidence is sufficient.

### Runtime Index, Locks, And Transactions

- **FR-009**: Launchdeck must maintain a global runtime index of Launchdeck-owned runs across registered projects.
- **FR-010**: Registry, project, and task mutations must acquire the correct lock before writing shared state.
- **FR-011**: Mutations for the same `project:task` must serialize to prevent duplicate starts.
- **FR-012**: Different projects or different tasks may proceed concurrently when their locks do not conflict.
- **FR-013**: Each lifecycle mutation must create a transaction id and append event records on success, failure, and safety refusal.
- **FR-014**: `start` must write an in-progress or starting record before spawn when needed to block concurrent duplicate starts.
- **FR-015**: Stale lock recovery must check owner metadata and PID/start-time evidence where the platform exposes it.
- **FR-016**: Interrupted or failed commands must leave inspectable state rather than disappearing.

### Lifecycle Operation Safety

- **FR-017**: `start` and `dev` must be idempotent for an already running owned `project:task`.
- **FR-018**: `restart` must perform stop-owned, wait-for-release, then start-new-run semantics.
- **FR-019**: `stop`, `restart`, and `force-stop` must require sufficient Launchdeck ownership proof.
- **FR-020**: Port or PID evidence alone must not authorize stop or restart.
- **FR-021**: External and unknown processes must be inspect-only by default.
- **FR-022**: `force-stop` may strengthen only Launchdeck-owned process-tree termination; it must not grant ownership.
- **FR-023**: Ready state must be tracked separately from running state.
- **FR-024**: First-ready signals must include port listening, HTTP GET status, and process-stays-alive timeout.
- **FR-025**: Failure categories must include config error, command error, port conflict, ready timeout, process exit, state stale, lock timeout, unsupported platform, and unsafe target.

### Observe And Diagnose

- **FR-026**: `status` must provide global and project-level summaries without hiding conflicts, stale state, or errors.
- **FR-027**: `ps` must focus on Launchdeck-owned run/process records.
- **FR-028**: `ports` must show declared and observed local port state, including owned, external, stale, conflict, and unknown ownership.
- **FR-029**: `conflicts` must explain blocking issues and affected tasks without mutating lifecycle state.
- **FR-030**: `inspect` must accept project alias, `project:task`, run id, port, PID, and project path targets.
- **FR-031**: `inspect` output must include target normalization, evidence, ownership confidence, status, safe actions, blocked actions, and next actions.
- **FR-032**: Existing `inspect-port` behavior may remain as compatibility, but the complete product target is unified `inspect`.
- **FR-033**: Observation commands must not mutate lifecycle state except for explicitly safe read-time refreshes.

### Logs, Events, And Retention

- **FR-034**: Logs must capture task stdout/stderr and be traceable by project id, task, run id, and transaction id where possible.
- **FR-035**: Events must be append-only JSON Lines for control-plane actions and state transitions.
- **FR-036**: `logs` and `events` must support machine-readable output; follow/watch streams must use JSON Lines.
- **FR-037**: Retention must not delete current running run logs, latest failed run logs, stop/start failure evidence, or events needed to explain recent status.
- **FR-038**: Retention must avoid unbounded growth through explicit, safe, explainable policies.
- **FR-039**: Logs and events must avoid leaking environment values or secrets.

### Clean, Reset Boundary, And Maintenance

- **FR-040**: `clean` must be a hygiene command for declared or Launchdeck-owned generated/stale/retention-expired data.
- **FR-041**: `clean` must not stop running services, remove registry entries, kill processes, delete project roots, delete unknown files, or delete paths outside the project root.
- **FR-042**: `clean` must preserve running evidence, latest failed evidence, and failure-linked logs/events.
- **FR-043**: Destructive `reset` must remain deferred and separate from `clean`.
- **FR-044**: `reconcile` must repair Launchdeck state from live reality without killing processes.

### Automation And Compatibility

- **FR-045**: JSON output must use a stable envelope with `ok`, `code` or domain status, `message`, `data`, and `next` semantics.
- **FR-046**: Error codes must be stable, domain-oriented, and actionable.
- **FR-047**: Next actions must include action kind, target, command, risk, and confirmation needs.
- **FR-048**: JSON Lines streams must be used for watch, follow, and events output.
- **FR-049**: Non-interactive mode must never hang on prompts.
- **FR-050**: Timeouts must exist for locks, ready checks, stop/restart flows, watch, and follow.
- **FR-051**: Persistent state files must be versioned.
- **FR-052**: Unknown newer state versions may permit safe degraded reads but must block dangerous mutations.

### Demo, Documentation, Security, And Cross-Platform Evidence

- **FR-053**: The official demo must prove duplicate start prevention, port ownership, unified inspect, restart/stop, stale recovery, logs/events, and safe clean.
- **FR-054**: Documentation must cover positioning, quick demo, concepts, command reference, `.launchdeck.yml`, JSON/errors, safety, and release claims.
- **FR-055**: Security requirements must fail closed for path escape, symlink/junction escape, PID reuse, environment leakage, corrupt state, unsafe aliases, and unsafe task names.
- **FR-056**: Cross-platform-ready claims must require lifecycle smoke evidence on Windows, macOS, and Linux.

## Safety Invariants

- Launchdeck must not kill external processes by default.
- Launchdeck must not use port or PID alone as stop authority.
- Launchdeck must not let `--yes` or `--force` bypass ownership, path containment, state-version, corrupt-state, or external-process safety.
- Launchdeck must not delete unknown files or project roots through `clean`.
- Launchdeck must not infer ownership from scan/discovery.
- Launchdeck must not claim cross-platform-ready from one-platform evidence.
- Launchdeck must fail closed when state, path, platform, ownership, or compatibility evidence is uncertain.

## Non-Functional Requirements

- **NFR-001 Reliability**: Mutations must be crash-recoverable enough to leave inspectable state and events.
- **NFR-002 Portability**: Core semantics must be implementable on Windows, macOS, and Linux without privileged system hooks.
- **NFR-003 Compatibility**: CLI JSON, error codes, next actions, state versions, and event records are product APIs.
- **NFR-004 Usability**: Human output should follow conclusion, evidence, and safe next action.
- **NFR-005 Performance**: Global status and scan commands must be bounded and explain truncation.
- **NFR-006 Privacy**: Logs/events must avoid storing secret environment values.
- **NFR-007 Testability**: Official acceptance must be reproducible with isolated `LAUNCHDECK_HOME` or equivalent state override.

## Acceptance Proof

The planning and implementation package must preserve these end-to-end proofs:

1. Register a project without starting or modifying project files beyond registry state.
2. Start a demo service once; a second start returns already-running semantics and does not create another instance.
3. Show the running service in `status --all`, `ps --all`, `ports`, and `inspect`.
4. Block a second project from using an owned occupied port while offering safe owner actions.
5. Block startup on an external occupied port and provide inspect/manual next actions without stopping the process.
6. Detect stale state after an externally killed process and recover through `reconcile`.
7. Preserve logs/events linked by project, task, run, and transaction.
8. Clean only safe/generated/stale/retention-expired data and never delete unknown files or running evidence.

## Decision Capture

- **Locked direction**: Launchdeck is a CLI-first local project-service control plane.
- **Rejected alternatives**: task-runner-only framing, process-killer framing, agent-plugin-first framing, daemon-first framing, per-project-only state as product center, and default external kill.
- **Accepted tradeoffs**: user-scoped state before whole-machine state, state+lock coordination before daemon, fail-closed safety, explicit config as authority, and downstream resolution of timeout/retention defaults.
- **Experience commitments**: users can ask Launchdeck before killing a port or starting another service; errors include reason and safe next action; `inspect` explains evidence and blocked actions; official demo proves the core loop.
- **Must not dilute**: ownership proof, clean/reset separation, single control-plane truth, JSON/next-action compatibility, and future clients reusing the same state model.

## Planning Notes

The current repository already has a v0.1 global runtime slice: project registry commands, `status --all`, `ps --all`, `ports`, `conflicts`, `inspect-port`, `project:task` lifecycle targets, and port-conflict preflight. Planning should treat that as evidence and reuse where appropriate, but the complete feature is broader: it requires locks, transaction events, unified `inspect`, alias repair, stronger ownership proof, state version compatibility, retention, watch/follow/events, official demo, documentation, and cross-platform acceptance.

## Readiness Decision

This specification is ready for `/sp.plan`. No hard unknown blocks planning. Soft unknowns must be carried into the plan as design decisions, validation tasks, or bounded implementation defaults.
