# Recovery Playbooks

Use recovery when state is inconsistent, a port is occupied, a duplicate start is possible, or stop/restart failed.

Recovery never changes immutable build identity. Setup/update/repair/uninstall records are receipt-bound; reconciliation observes and classifies live evidence for an operation, but it does not silently repoint a launcher, broaden ownership, or repeat a possible-effect mutation.

## Lost Response Boundary

- If the mutation operation ID is known, call `operation.get`; call `operation.reconcile` only when current evidence is required.
- If the ID is lost, make one `operation.list` call with exact project, operation, task when applicable, states, a positive window no greater than 15 minutes, and limit no greater than 20.
- A unique candidate may be fetched or reconciled. Zero or multiple candidates stop unresolved.
- Never invoke the original mutation again and never cross to CLI after possible dispatch.

If the operation belongs to an installer/update/repair/uninstall flow, report the receipt/build identity, target component, scope, host/version evidence, and effect certainty. `failed-and-rolled-back`, `partial`, and `indeterminate` are terminal evidence states unless the user starts a new explicit repair/update request.

## Occupant Classes

- Same task: the port/process belongs to the requested Launchdeck project/task.
- Other Launchdeck task: Launchdeck owns it, but it is a different project/task.
- External known process: Launchdeck can identify the occupant but does not own it.
- Unknown process: Launchdeck cannot identify enough ownership evidence.
- Stale record: Launchdeck state says something exists but inspection shows it is gone or mismatched.

## Port Or Conflict Recovery

1. Observe with bounded task/project status and inspection operations.
2. Classify the occupant.
3. Same task: report the existing run and avoid duplicate start.
4. Other Launchdeck task: report the owner and ask whether to stop/restart that Launchdeck-owned target before proceeding.
5. External known process or unknown process: inspect-only. Report owner/status if known and safe user options; do not authorize raw OS process control.
6. Stale operation evidence: reconcile the existing operation record, then re-observe before any new request.

## Duplicate-Start Risk

- A matching project/task in `status --all` or `ps --all` means report existing control handles.
- Declared port occupied by the same task means reuse/report, not duplicate.
- Declared port occupied by a different owner blocks start until the user chooses a safe path.

## Stop Failed

1. Gather bounded project/task inspection, logs, and events evidence.
2. Reconcile only an existing operation record when its state is uncertain.
3. Do not retry the stop automatically and do not escalate to a stronger process-control route.
4. Report the failure, ownership evidence, and safe user-controlled next actions.

## User Summary

Include classification, evidence commands used, whether Launchdeck ownership exists, what action was taken or refused, and the safest next action.

When summarizing recovery, separate process ownership from host readiness. Launchdeck ownership can justify a stop/restart of a managed task; it does not prove host approval, extension reload, or MCP readiness for an installed Agent host.
