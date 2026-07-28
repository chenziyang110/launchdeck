# Command Flows

All lifecycle mutation goes through the shared Launchdeck Kernel. Select and pin the entrypoint through `entrypoint-discovery.md`; use compact CLI JSON only through the pre-dispatch fallback boundary.

The public Agent-facing service flow is `up`, `status --all`, `logs <task>`, and `down`. Internally these map to the same managed lifecycle authority as start/status/logs/stop. Do not weaken the flow to a default `logs` call when the task is known; task-specific logs are part of the evidence.

## Observe First

1. Call `capabilities.get`.
2. Resolve the explicit configured project and declared task.
3. Use `task.status`, `task.list`, `project.inspect`, `task.logs.read`, or `task.events.read` as narrowly required.
4. Send at most one of `task.start`, `task.stop`, `task.restart`, or `task.run` after observation.

For an explicit configure-validate-launch combined intent, the successful config write and read-only validation are earlier independent effects. Re-run `capabilities.get`, observe the exact task again, then allow exactly one low-risk lifecycle mutation. After success, status, task-specific logs, and readiness checks are bounded observations rather than additional mutations.

If MCP fails before dispatch or omits the required safe operation, verify the pinned CLI with `launchdeck capabilities --json --compact`, repeat the equivalent bounded CLI observation, then send one compatible CLI mutation. Reuse the same exact CLI entrypoint; never fall back or switch entrypoints after a mutation may have been dispatched.

## Start, Dev, Run

1. Resolve an explicit task first. For bare `up`/`start`, use `project.defaultTask`, then an existing `start`, then an existing `dev`, then the sole managed long-running task. If more than one managed candidate remains, stop and report `availableTasks`.
2. Check existing managed runs and declared ports.
3. If a matching Launchdeck-owned run exists, report it with project/task, status, port/URL when known, logs/events pointers, and stop/restart handles. Do not start another run.
4. If no matching run exists and the configured task is currently low risk, call `task.start` for a managed service or `task.run` for a finite task.
5. If a declared port is occupied, route to `recovery-playbooks.md` before mutation.

## Effect Certainty And Input Correction

The public CLI `effect` field is a pre-dispatch assessment; Kernel `agentResult.effects` remains the Kernel effect authority. A deterministic task input refusal may be corrected at most once only when the response proves all three values: `certainty: none`, `changed: false`, and `dispatch: not_dispatched`. The corrected task must come from `availableTasks` and must honor `project.defaultTask` when present (for example, replace a guessed `dev` with the available `start` or configured default).

For `certainty: unknown`, `certainty: possible`, a missing dispatch proof, or any response that may have been dispatched, never replay or repeat the mutation. Use the known operation ID with `operation.get`/`operation.reconcile`, or make one bounded `operation.list` correlation before reconciliation. Zero or ambiguous correlation remains unresolved and must not trigger a replay.

In the combined-intent route, a start refusal proven not dispatched ends the route as partial completion when config was authored. Preserve the config, report lifecycle not started, and do not consume the general deterministic input-correction allowance because the combined route already selected an exact authored task.

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
