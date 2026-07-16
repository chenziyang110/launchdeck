# Recovery Playbooks

Use recovery when state is inconsistent, a port is occupied, a duplicate start is possible, or stop/restart failed.

## Occupant Classes

- Same task: the port/process belongs to the requested Launchdeck project/task.
- Other Launchdeck task: Launchdeck owns it, but it is a different project/task.
- External known process: Launchdeck can identify the occupant but does not own it.
- Unknown process: Launchdeck cannot identify enough ownership evidence.
- Stale record: Launchdeck state says something exists but inspection shows it is gone or mismatched.

## Port Or Conflict Recovery

1. Observe with `launchdeck ports --json --compact`, `launchdeck conflicts --json --compact`, and `launchdeck inspect port:<port> --json --compact` or `launchdeck inspect-port <port> --json --compact`.
2. Classify the occupant.
3. Same task: report the existing run and avoid duplicate start.
4. Other Launchdeck task: report the owner and ask whether to stop/restart that Launchdeck-owned target before proceeding.
5. External known process or unknown process: inspect-only. Report owner/status if known and safe user options; do not authorize raw OS process control.
6. Stale record: run `launchdeck reconcile [project[:task]] --json --compact`, then re-observe before mutation.

## Duplicate-Start Risk

- A matching project/task in `status --all` or `ps --all` means report existing control handles.
- Declared port occupied by the same task means reuse/report, not duplicate.
- Declared port occupied by a different owner blocks start until the user chooses a safe path.

## Stop Failed

1. Gather evidence: `launchdeck inspect <target> --json --compact`, `launchdeck logs <target> --lines 80 --json --compact`, and `launchdeck events <target> --lines 80 --json --compact`.
2. Run `launchdeck reconcile [project[:task]] --json --compact` if state may be stale.
3. Retry normal stop only when Launchdeck ownership remains verified.
4. Use `launchdeck force-stop <project:task> --json --compact` only for Launchdeck-owned targets with normal stop failure or stuck evidence.
5. If ownership is lost or external, stop and report evidence plus safe next actions.

## User Summary

Include classification, evidence commands used, whether Launchdeck ownership exists, what action was taken or refused, and the safest next action.
