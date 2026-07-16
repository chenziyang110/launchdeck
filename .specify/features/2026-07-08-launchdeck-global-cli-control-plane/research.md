# Research: Launchdeck Global CLI Control Plane

## Research Scope

This file records implementation-shaping decisions for the CLI-only global control plane. Evidence is local repository evidence plus project memory; no external implementation source is treated as authoritative for this plan.

## Evidence Sources

- `F:/github/launchdeck/src/global-runtime.js`
- `F:/github/launchdeck/src/runtime.js`
- `F:/github/launchdeck/src/cli.js`
- `F:/github/launchdeck/src/config.js`
- `F:/github/launchdeck/src/output.js`
- `F:/github/launchdeck/src/errors.js`
- `F:/github/launchdeck/src/adapters/process.js`
- `F:/github/launchdeck/src/adapters/path.js`
- `F:/github/launchdeck/test/global-runtime.test.js`
- `F:/github/launchdeck/package.json`
- `F:/github/launchdeck/.specify/memory/learnings/windows-node-managed-test-eperm.md`
- `F:/github/launchdeck/.specify/memory/learnings/launchdeck-git-root-closeout-scope.md`

## Decisions

### R1. Keep the feature daemonless and file-backed

**Decision**: Implement a user-scoped file-backed control plane under `LAUNCHDECK_HOME`; do not add a daemon, service, database, or network listener in this feature.

**Rationale**: The spec explicitly scopes the feature as CLI-first and daemonless. The current implementation already uses local files for global registry and project-local runtime state. File-backed state is enough to prove the product loop: register projects, start, inspect, stop, restart, and clean.

**Confidence**: Verified from spec and repository.

**Consequences**:
- File locks and atomic writes become mandatory for safety.
- Long-lived commands such as `logs --follow` must be implemented as controlled CLI processes, not as hidden services.
- Future daemon or GUI work must reuse this state model.

### R2. Introduce a small control-plane module layer

**Decision**: Add `src/control-plane/` modules for state, locks, events, runs, ownership, inspect, and actions while keeping `src/cli.js`, `src/runtime.js`, and adapters as existing boundaries.

**Rationale**: Current global behavior is concentrated in `src/global-runtime.js` and `src/cli.js`. The new feature adds locks, transaction events, ownership confidence, unified inspect, and migration. Keeping those rules in the router would make testing and review brittle.

**Confidence**: Verified from live code reads; design judgment applied.

**Consequences**:
- Existing exports from `src/global-runtime.js` should remain as compatibility facade functions during migration.
- Unit tests can target control-plane modules directly.
- CLI contract tests can stay focused on user-visible behavior.

### R3. Migrate registry storage to a versioned layout

**Decision**: Read current `LAUNCHDECK_HOME/projects.json` for compatibility, but write the new v2 layout under `LAUNCHDECK_HOME/registry/projects.json` after safe registry mutation.

**Rationale**: The current registry stores only project records. The planned control plane needs clear separation between registry, runtime runs, locks, events, and logs.

**Confidence**: Current file path verified; migration layout is a planning decision.

**Consequences**:
- Migration tests must cover current v1 registry reads.
- Unsupported newer state versions must fail closed.
- The old file must not be deleted automatically during the first migration unless explicitly contracted later.

### R4. Use conservative lock files with owner metadata

**Decision**: Use lock files created with exclusive creation semantics, store lock owner metadata, use bounded wait, and recover stale locks only after conservative proof.

**Rationale**: A daemonless control plane still needs cross-process serialization. Node's standard filesystem primitives are sufficient for a first implementation, and this keeps the dependency surface small.

**Confidence**: Design assumption based on Node standard library; must be validated by focused tests on Windows and POSIX.

**Consequences**:
- Lock metadata includes pid, command, cwd, createdAt, expiresAt, and lock name.
- If PID/start-time proof is not available, stale recovery must prefer blocking with next actions over unsafe takeover.
- Lock acquisition must not span the entire lifetime of a managed child process.

### R5. Treat ownership as evidence, not a boolean

**Decision**: Model ownership as `verified-owned`, `probable-owned`, `stale-owned`, `external`, or `unknown`.

**Rationale**: Current stop safety mostly relies on Launchdeck state and declared-port checks. Cross-platform process inspection can be partial, so stop behavior needs a confidence model to avoid external kills.

**Confidence**: Verified gap in current implementation; confidence-state design chosen for safety.

**Consequences**:
- Stop and force-stop require `verified-owned`.
- `probable-owned` can be inspected and reconciled but should not be force-stopped by default.
- `external` and `unknown` return next actions instead of terminating.

### R6. Add run metadata to managed child environments

**Decision**: Add non-secret environment markers to managed child processes: project id, task name, run id, and Launchdeck home path.

**Rationale**: Runtime state alone cannot prove that a live PID still belongs to the Launchdeck run that originally spawned it. Environment markers strengthen future observations and post-crash recovery where the platform exposes them.

**Confidence**: Design assumption; process-adapter visibility varies by platform.

**Consequences**:
- Environment markers must not include secrets.
- Process adapters should use these markers when available, but stop must remain fail-closed if unavailable.
- Tests should verify markers are passed to fixture scripts without relying on platform-specific env inspection.

### R7. Make readiness separate from running

**Decision**: Add lifecycle status transitions that distinguish `starting`, `running`, `ready`, `failed`, `stopping`, `stopped`, `stale`, and `stop_failed`.

**Rationale**: The user's core pain includes failed restarts and port conflicts after an agent starts multiple instances. A PID being alive is not the same as a service being usable.

**Confidence**: Verified from spec; current runtime has a smaller status set.

**Consequences**:
- If task readiness is configured, use it.
- If readiness is not configured but ports exist, port listener observation can provide a default readiness signal.
- If neither exists, process-alive is the minimum signal and should be labeled clearly.

### R8. Evolve JSON output centrally

**Decision**: Extend `src/output.js` to produce a versioned envelope with `ok`, `command`, `schemaVersion`, `data`, `next`, and structured error fields while preserving legacy top-level fields during transition.

**Rationale**: Current JSON output is already centralized enough to evolve. The new CLI needs predictable machine-readable responses for blocked actions, conflicts, inspect results, and JSONL streams.

**Confidence**: Verified from `src/output.js` and CLI call sites.

**Consequences**:
- New command payloads live under `data`.
- Existing top-level fields can be mirrored for compatibility until a later explicit schema cleanup.
- Every refusal should include `next` actions.

### R9. Use fixture scripts for managed process tests and demos

**Decision**: Managed-process tests and demos must use checked-in fixture scripts, not inline `node -e "setInterval"` commands.

**Rationale**: The user explicitly objected to inline long-running `node -e` examples. Existing tests already have fixture scripts and project memory documents Windows cleanup behavior.

**Confidence**: Verified from user instruction, tests, and project memory.

**Consequences**:
- Official demo should live under `examples/demo-api` or an equivalent checked-in fixture.
- Test helpers should start predictable scripts that expose health/port behavior.
- Windows EPERM cleanup issues should be rerun once before being treated as product regression.

## Alternatives Considered

### Always-running daemon

Rejected for this feature because the user and spec chose CLI-first daemonless scope. A daemon may be future work, but it must reuse the control-plane state and contracts.

### Keep all global logic in `src/global-runtime.js`

Rejected because locks, run indexes, events, ownership proof, and inspect contracts are independent concerns with different tests and failure modes.

### Kill by port/PID with confirmation

Rejected because it undermines the core safety invariant. Confirming an unsafe target is not the same as proving Launchdeck ownership.

### Single flat registry file forever

Rejected because runtime state, locks, and events have different retention and mutation semantics than project registration.

## Open Validation Items For Implementation

- Validate exact process evidence available on Windows, macOS, and Linux.
- Choose numeric defaults for lock wait and stale lock age after small empirical tests.
- Choose event/log retention defaults and document them.
- Confirm JSON envelope compatibility against existing CLI contract tests.
- Verify migration from current `projects.json` to v2 layout with isolated `LAUNCHDECK_HOME`.
