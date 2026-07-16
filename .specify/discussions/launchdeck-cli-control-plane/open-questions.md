# Open Questions: Launchdeck CLI Control Plane

## Blocking Questions

None for continuing the product discussion.

## Confirmed Defaults

- Single instance means one user-scoped control plane/state namespace.
- No daemon is required for the first product shape.
- Global registry and runtime state should be authoritative for all CLI clients.
- Mutating operations should be globally locked.
- Launchdeck should not start duplicate `project:task` instances by default.
- Launchdeck should stop/restart only owned process trees by default.
- Port or PID alone is not enough stop authority.
- External processes are inspect-only by default.
- Stale state should route to `reconcile`.
- Human output should include conclusion, reason, and safe next action.
- JSON output should remain a compatibility surface.
- Project identity uses stable `projectId`, unique user-facing `alias`, and repairable `path`.
- Global state should separate registry, runtime index, locks, events, and live OS inspection.
- Lifecycle mutations should be transaction-like and leave state/event evidence even on failure.
- Locking should be granular enough for different projects/tasks to proceed concurrently.
- Ownership proof must combine multiple evidence signals.
- `inspect` is the unified evidence and safe-action command.
- `status`, `ps`, `ports`, `conflicts`, and `inspect` have separate roles.
- `project scan` discovers candidates; `project add` registers them.
- Port conflicts report facts and safe actions rather than automatic priority.
- Logs and events are separate streams linked by project/task/run/transaction ids.
- `clean` is non-destructive hygiene; `reset` is separate, deferred, and explicitly configured.
- `--yes` confirms known impact and `--force` only strengthens owned operations.
- Non-interactive commands should return structured failures rather than prompt.
- Future clients reuse the same control-plane truth.
- Unknown persistent state versions block dangerous mutations.
- Security requirements fail closed.
- Cross-platform-ready requires Windows, macOS, and Linux lifecycle smoke evidence.

## Soft Unknowns

1. Whole-machine sharing
   - Default: user-scoped registry.
   - Owner: user/downstream specification.
   - Latest safe resolve phase: before daemon/service or installer work.
   - Stop-and-reopen condition: multiple OS users must share one Launchdeck control plane.

2. Daemon requirement
   - Default: daemonless CLI using state, locks, logs, and events.
   - Owner: downstream specification.
   - Latest safe resolve phase: before watch/event implementation lock.
   - Stop-and-reopen condition: foreground watch/follow and local event files cannot support required observation behavior.

3. External process force kill
   - Default: out of scope and blocked by default.
   - Owner: user/security review.
   - Latest safe resolve phase: before any `--external` or `--pid` force-stop support.
   - Stop-and-reopen condition: users explicitly require Launchdeck to kill external processes and accept a stronger confirmation model.

4. Registry storage path
   - Default: user-scoped Launchdeck home.
   - Owner: downstream specification/implementation.
   - Latest safe resolve phase: before global registry implementation.
   - Stop-and-reopen condition: users need portable/shared registry storage or per-workspace state.

5. Event retention
   - Default: append-only events with later retention/rotation.
   - Owner: downstream specification.
   - Latest safe resolve phase: before `events` implementation.
   - Stop-and-reopen condition: events grow unbounded or cannot support recovery/debugging needs.

6. Log retention defaults
   - Default: preserve current running logs, latest failed run logs, and failure-linked logs; exact day/run count is unresolved.
   - Owner: downstream specification.
   - Latest safe resolve phase: before log cleanup implementation.
   - Stop-and-reopen condition: logs either grow unbounded or cleanup deletes useful diagnostic evidence.

7. Lock timeout defaults
   - Default: locks have owner metadata and stale recovery; exact wait and timeout durations are unresolved.
   - Owner: downstream specification/implementation.
   - Latest safe resolve phase: before lock implementation.
   - Stop-and-reopen condition: normal concurrent agent usage frequently sees false busy/stale lock behavior.

8. Inspect JSON schema
   - Default: include target, status, ownership confidence, evidence, safe actions, and blocked actions.
   - Owner: downstream specification.
   - Latest safe resolve phase: before `inspect --json` implementation.
   - Stop-and-reopen condition: future automation needs to parse inspect decisions and cannot rely on human text.

9. Clean retention defaults
   - Default: preserve running evidence, latest failed evidence, and failure-linked logs/events.
   - Owner: downstream specification.
   - Latest safe resolve phase: before clean/log/event implementation.
   - Stop-and-reopen condition: retention either grows without bound or deletes important diagnosis.

10. Official demo details
   - Default: dependency-light `examples/demo-api` with port 8888 and health endpoint.
   - Owner: downstream specification/implementation.
   - Latest safe resolve phase: before demo implementation.
   - Stop-and-reopen condition: demo cannot reliably run on Windows/macOS/Linux.

11. JSON schema versioning
   - Default: stable envelope first; explicit JSON versioning may be deferred.
   - Owner: downstream specification.
   - Latest safe resolve phase: before public GUI/MCP/agent integration.
   - Stop-and-reopen condition: multiple clients require compatibility negotiation.

12. Cross-platform process-tree proof
   - Default: required before `cross-platform-ready` claim.
   - Owner: downstream implementation.
   - Latest safe resolve phase: before release claim.
   - Stop-and-reopen condition: one OS cannot reliably stop owned process trees without unsafe fallback.
