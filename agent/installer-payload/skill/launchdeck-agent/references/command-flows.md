# Command Flows

All lifecycle mutation goes through the shared Launchdeck Kernel. Prefer MCP operations; use compact CLI JSON only through the pre-dispatch fallback boundary.

The public Agent-facing service flow is `up`, `status --all`, `logs <task>`, and `down`. Internally these map to the same managed lifecycle authority as start/status/logs/stop. Do not weaken the flow to a default `logs` call when the task is known; task-specific logs are part of the evidence.

## Observe First

1. Call `capabilities.get`.
2. Resolve the explicit configured project and declared task.
3. Use `task.status`, `task.list`, `project.inspect`, `task.logs.read`, or `task.events.read` as narrowly required.
4. Send at most one of `task.start`, `task.stop`, `task.restart`, or `task.run` after observation.

If MCP fails before dispatch or omits the required safe operation, verify `launchdeck capabilities --json --compact`, repeat the equivalent bounded CLI observation, then send one compatible CLI mutation. Never fall back after a mutation request may have been sent.

## Start, Dev, Run

1. Resolve the target from `.launchdeck.yml`, registry, or user request.
2. Check existing managed runs and declared ports.
3. If a matching Launchdeck-owned run exists, report it with project/task, status, port/URL when known, logs/events pointers, and stop/restart handles. Do not start another run.
4. If no matching run exists and the configured task is currently low risk, call `task.start` for a managed service or `task.run` for a finite task.
5. If a declared port is occupied, route to `recovery-playbooks.md` before mutation.

For the Flask demo acceptance flow, the installed Agent-authored config names the managed task `start`. The required observation sequence is `up`, `status --all`, `logs start`, webpage reachability proof, and `down`. Logs evidence must include task `start`, a log path, and non-empty Flask process output.

## Build, Test, And Checks

Use `task.run` only for a declared task that the Kernel currently classifies as low risk. If the command is undeclared or medium/high/unknown risk, report the refusal or use read-only adoption inspection; never invent a raw command.

## Restart

1. Inspect the target and use `operation.reconcile` only for an existing operation whose evidence needs reconciliation.
2. Require Launchdeck ownership for any existing process affected by restart.
3. Call `task.restart` once.
4. If ownership is absent or uncertain, do not mutate; route to recovery.

## Stop

- Stop requires Launchdeck ownership proof and one `task.stop` call.
- A stop refusal or failure ends the public Agent mutation path. Collect bounded evidence and report the result.
- Unknown or external owners stay inspect-only.

## Logs And Events

- Logs: use `task.logs.read` with a bounded limit/cursor.
- Events: use `task.events.read` with a bounded limit/window/cursor.
- Treat logs and events as evidence for diagnosis, recovery, and user summaries. Do not clean them as part of routine lifecycle operation.

## Output Contract

When using CLI fallback, prefer `--json --compact` for bounded Agent reads and mutations. A successful, no-op, dry-run, or explicitly declined operation exits 0. Typed refusals, failed rollback, partial, indeterminate, or command execution failures exit 1. Human output and JSON must describe the same normalized outcome, target, scope, build identity, effect certainty, and next action.
