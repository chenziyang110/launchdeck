# Command Flows

All lifecycle mutation goes through Launchdeck. Use compact JSON for agent-internal reads where supported, then summarize for the user.

## Observe First

For start/dev/run/build/test/restart/stop/force-stop:

- `launchdeck status --all --json --compact`
- `launchdeck ps --all --json --compact`
- `launchdeck ports --json --compact`
- `launchdeck inspect <target> --json --compact` when a task, project, or port is relevant
- `launchdeck conflicts --json --compact` when ports or duplicate starts are suspected

## Start, Dev, Run

1. Resolve the target from `.launchdeck.yml`, registry, or user request.
2. Check existing managed runs and declared ports.
3. If a matching Launchdeck-owned run exists, report it with project/task, status, port/URL when known, logs/events pointers, and stop/restart handles. Do not start another run.
4. If no matching run exists and adoption is valid, use one of:
   - `launchdeck start [task|project:task] --json --compact`
   - `launchdeck dev --json --compact`
   - `launchdeck run <task> --json --compact`
5. If a declared port is occupied, route to `recovery-playbooks.md` before mutation.

## Build, Test, And Checks

Use declared Launchdeck tasks for finite lifecycle commands:

- `launchdeck build --json --compact`
- `launchdeck test --json --compact`
- `launchdeck lint --json --compact`
- `launchdeck typecheck --json --compact`
- `launchdeck setup --json --compact`
- `launchdeck package --json --compact`

If the command is not declared, use adoption/discovery first rather than inventing a raw command.

## Restart

1. Inspect the target and reconcile stale state if needed: `launchdeck reconcile [project[:task]] --json --compact`.
2. Require Launchdeck ownership for any existing process affected by restart.
3. Use `launchdeck restart [task|project:task] --json --compact`.
4. If ownership is absent or uncertain, do not mutate; route to recovery.

## Stop And Force-Stop

- Stop requires Launchdeck ownership proof: `launchdeck stop [task|project:task] --json --compact`.
- Use `launchdeck stop [task|project:task] --force-owned --json --compact` only when the target is still Launchdeck-owned and the stronger owned-stop path is appropriate.
- Force-stop requires a Launchdeck-owned target plus normal stop failure or stuck-process evidence: `launchdeck force-stop <project:task> --json --compact`.
- Unknown or external owners stay inspect-only.

## Logs And Events

- Logs: `launchdeck logs [task|project:task] --lines 80 --json --compact`.
- Events: `launchdeck events [target] --lines 80 --json --compact`.
- Treat logs and events as evidence for diagnosis, recovery, and user summaries. Do not clean them as part of routine lifecycle operation.
