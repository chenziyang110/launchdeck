# Quick Task Status: Global Runtime Supervisor

status: complete
understanding_confirmed: true
created_at: 2026-07-08
workflow: /sp.quick
owner: leader

## User Request

Implement the next quick slice for Launchdeck as a cross-project runtime supervisor so users can see running project services, understand port ownership, avoid duplicate starts, and stop/restart only the services Launchdeck can prove it owns.

## Project Cognition Intake

- command: `project-cognition compass --intent implement`
- readiness: `query_ready`
- compass_state: `usable_with_review`
- recommended_next_action: `use_compass_minimal_live_reads`
- minimal_live_reads:
  - `src/runtime.js`
  - `src/cli.js`
  - `test/cli.test.js`

## Understanding Checkpoint

Presented to user and confirmed with: "确认执行".

- Issue: Launchdeck v1 manages the current project lifecycle, but does not yet provide global visibility into running project services, port ownership, or owned-only restart/stop behavior across registered projects.
- Target outcome: Add a minimal CLI slice for global runtime supervision: project registration, global process visibility, port visibility, single-port inspection, and owned-only restart/stop semantics.
- Boundaries: no GUI, no daemon, no whole-machine project discovery, no default killing of unknown external processes, no Docker/container orchestration.
- Known facts / assumptions: existing v1 has project-local runtime state/logs/managed process basics; project cognition selected `src/runtime.js`, `src/cli.js`, and `test/cli.test.js` as first-pass live reads.
- Affected surfaces: CLI command parsing/help, runtime state model, process/port inspection adapter, tests, and user-facing docs/examples where command behavior changes.
- Implementation plan: capture expected behavior with failing tests first, then implement the smallest code changes that satisfy the tested behavior.
- Next action: wait for user confirmation before source inspection and implementation.
- Validation evidence: relevant CLI/runtime tests first, then `npm test` or the smallest complete project check.
- Stop condition: escalate to `/sp.specify` if this requires a daemon, privileged system integration, broad command protocol redesign, or a large cross-platform process-management rewrite.

## Scope Boundary

Planned quick slice: project/global runtime visibility and owned-only process control.

Excluded from this quick task:
- GUI/dashboard.
- daemon/background service.
- killing unknown external processes by default.
- automatic whole-machine project discovery.
- Docker/container orchestration.

## Consequence Analysis

Triggered because this affects lifecycle commands, process state, port ownership, shared runtime files, and destructive stop behavior.

### Affected Object Map

- CLI commands: `project`, `projects`, `ps`, `ports`, `inspect-port`, `stop`, `restart`, and help output.
- Runtime records: project-local `.launchdeck/runtime/state.json` and any new user/global registry state.
- Running process records: managed task pid, command, cwd, ports, state, log file, and started timestamp.
- Port ownership records: declared task ports, actual listeners, ownership confidence, and conflict status.
- Stop/restart behavior: graceful stop, force-owned stop, restart sequencing, stale record handling.
- Downstream consumers: humans and agents consuming text or JSON CLI output.
- Tests/docs: `test/cli.test.js` and user-facing command documentation.

### State-Behavior Matrix

- created: registered project exists but has no running managed process; global views should show project metadata, not fake running state.
- running: managed processes appear in `ps --all`; declared/observed ports are shown with Launchdeck ownership when identity matches.
- failed: failed starts remain diagnosable through state/logs; global views should not present them as healthy listeners.
- completed: short-running tasks are not treated as active services.
- missing: missing project paths or runtime files are reported as stale/missing, not auto-removed silently.
- stale: stale pid/state records are refreshed or marked stale before destructive actions.
- partially refreshed: uncertain process/port ownership blocks automatic stop/restart.
- external/unknown: unknown port owners are explainable but not killed by default.

### Dependency Impact Table

- Direct dependencies: Node fs/path/os/child_process/net adapters and existing runtime state helpers.
- Indirect consumers: existing lifecycle aliases, JSON output contracts, examples, docs, and agent-readable status.
- Shared state: local project `.launchdeck` files plus a user-level project registry if introduced.
- Compatibility surfaces: existing commands must keep current single-project behavior unless explicitly extended.
- Validation routes: CLI unit tests, runtime tests, managed process tests, and full `npm test`.
- Adjacent workflows: future `$sp-specify` global supervisor spec, future GUI/MCP integrations.

### Recovery And Validation Contract

- Rollback: changes must be confined to CLI/runtime helpers, tests, and docs so the quick slice can be reverted cleanly.
- Retry/idempotency: `project add` must be repeatable for the same path/name without duplicate registry entries.
- Cleanup: tests must remove temp runtime/global registry files and stop managed processes they start.
- Observability: conflicts must include actionable project/task/port/pid context when available.
- Safety: automatic destructive actions may target only Launchdeck-owned process records with matching identity.
- Validation evidence: failing tests before production code, then targeted tests and final project test command.

### Coverage Gaps

- Cross-platform listener inspection details may vary; owner: implementation pass; latest safe phase: before final validation; route: continue with tests and platform adapter boundary.
- User-level registry location must be chosen; owner: implementation pass; latest safe phase: before code write; route: use existing config/runtime style and environment override for tests.
- External-process takeover semantics are intentionally unresolved; owner: future spec; latest safe phase: before adding takeover command; route: excluded from quick task.
- Full GUI/multi-project dashboard requirements are intentionally unresolved; owner: future spec; route: excluded from quick task.

### Consequence Obligations

- CA-001: Launchdeck must not automatically stop or restart unknown external processes. Affected objects: stop/restart/port conflict handling. Owner workflow: /sp.quick. Latest resolve phase: implementation. Status: active. Stop-and-reopen condition: any command can kill a process without Launchdeck ownership evidence.
- CA-002: Global views must distinguish managed, stale, missing, and external/unknown state instead of collapsing them into running. Affected objects: `ps --all`, `ports`, `inspect-port`. Owner workflow: /sp.quick. Latest resolve phase: validation. Status: active. Stop-and-reopen condition: output cannot explain stale or ambiguous ownership.
- CA-003: Registry writes must be idempotent and test-isolated. Affected objects: project registry and tests. Owner workflow: /sp.quick. Latest resolve phase: validation. Status: active. Stop-and-reopen condition: repeated `project add` creates duplicates or tests mutate real user registry.
- CA-004: Existing single-project lifecycle commands must remain compatible. Affected objects: current `run`, lifecycle aliases, `stop`, `restart`, `ps`, `logs`, `clean`. Owner workflow: /sp.quick. Latest resolve phase: validation. Status: active. Stop-and-reopen condition: existing tests or documented command behavior regresses.

## Dispatch

shape: one-subagent
surface: native-subagents
request: quick-global-runtime-supervisor-explore-001

### Subagent Result

- status: DONE
- agent: `019f3f82-911d-79a3-9eba-f30f0d4d4571`
- summary: Read-only exploration confirmed the first implementation surfaces are `src/cli.js`, `src/runtime.js` or a sibling runtime module, `src/adapters/process.js`, and CLI tests. No global registry or port inspection helper exists yet. Primary safety risks are PID reuse, treating liveness as ownership, and Windows `taskkill /T /F` impact when runtime state is stale or ambiguous.
- accepted guidance:
  - Add failing CLI tests first.
  - Keep project-local runtime state authoritative.
  - Add OS-specific port inspection below the process adapter boundary.
  - Do not treat observed listener liveness as ownership proof.
  - Keep external-process takeover out of this quick task.

## Validation Plan

1. Add failing CLI/runtime tests for project registry and global runtime/port visibility.
2. Implement the smallest code path needed to pass those tests.
3. Run targeted tests during iteration.
4. Run `npm test` before completion.

## RED State

- command: `node --test test/global-runtime.test.js`
- result: failed as expected
- evidence:
  - `project add`, `projects`, `ports`, and `inspect-port` are unknown or unsupported.
  - `ps --all` has no global registry aggregation path.
  - `start dev` does not preflight declared port conflicts and can start a duplicate process; on Windows this left a test-owned process alive long enough to trigger temp cleanup `EPERM`.
- consequence obligations reinforced:
  - CA-001 requires port conflict preflight before spawning managed tasks.
  - CA-004 requires existing lifecycle behavior to remain compatible while adding this preflight.

## GREEN State

- command: `node --test test/global-runtime.test.js`
- result: passed
- evidence:
  - `project add` and `projects` use an isolated idempotent registry via `LAUNCHDECK_HOME`.
  - `ps --all` aggregates managed processes from registered projects.
  - `ports` reports declared managed ports and Launchdeck-managed running state.
  - `inspect-port` reports external listeners without claiming ownership.
  - `start dev` refuses an externally occupied declared port before spawning a managed process.
  - Managed-process tests use fixture scripts (`node scripts/*.js`) instead of inline `node -e "setInterval(...)"` commands.
  - Simple `node ...` managed commands launch without the shell, avoiding Windows `cmd.exe` process-tree stop failures.

## Final Verification

- `node --test test/global-runtime.test.js`: passed 5/5 after replacing inline `node -e` test commands.
- `node --test test/managed-cli.test.js test/cli.test.js test/global-runtime.test.js test/runtime-state.test.js`: passed 22/22.
- `npm run check`: passed.
- `npm test`: passed 58/58.

## Project Cognition Closeout

- update_id: `upd-20260708T025823.045257900Z`
- result_state: `partial_refresh`
- readiness: `review`
- note: cognition requires review for updated behavior/test paths. Source and test validation is complete for this quick task.

## Summary

See `SUMMARY.md`.
