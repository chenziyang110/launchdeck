# Cross-Platform Lifecycle Smoke Evidence

This template records local smoke evidence for the Launchdeck lifecycle control plane. A single run is current-platform evidence only. Do not claim cross-platform-ready until Windows, macOS, and Linux evidence are all recorded and reviewed.

## Command

Run from the repository root:

```bash
node scripts/smoke-lifecycle.js --mode quick
```

Use full mode when collecting release evidence:

```bash
node scripts/smoke-lifecycle.js --mode full --json
```

The smoke script copies `examples/demo-api` to a temporary workspace, sets an isolated `LAUNCHDECK_HOME`, and exercises the CLI-only lifecycle path: `project add`, `start`, duplicate `start`, `status`, `inspect`, `restart`, `stop`, `reconcile`, and `clean --safe`. Full mode also checks `projects`, `ps`, `ports`, `conflicts`, `logs`, `events`, and registry removal.

## Safety Limits

- The script produces local smoke evidence only.
- It does not use privileged hooks, services, daemons, GUI/TUI/MCP surfaces, or editor integrations.
- It stops only `demo:dev` through Launchdeck while using the script-created `LAUNCHDECK_HOME`.
- It deletes only the script-created temporary workspace unless `--keep` is supplied.
- It does not kill by port or arbitrary PID.
- If port `8888` is already held by an external process, the run should fail closed and the result should be recorded as blocked or failed, not forced.

## Evidence Record

| Field | Value |
| --- | --- |
| Date/time |  |
| Operator |  |
| Git commit |  |
| Platform |  |
| OS version |  |
| CPU architecture |  |
| Node version |  |
| Command |  |
| Mode | quick / full |
| Result | passed / failed / blocked |
| Evidence file or pasted output |  |
| Temporary workspace removed | yes / no |
| Cleanup stop attempted | yes / no |
| Residual demo process check | none found / describe |
| Limitations |  |

## Required Platform Rows

| Platform | Command | Result | Evidence location | Notes |
| --- | --- | --- | --- | --- |
| Windows | `node scripts/smoke-lifecycle.js --mode full --json` |  |  |  |
| macOS | `node scripts/smoke-lifecycle.js --mode full --json` |  |  |  |
| Linux | `node scripts/smoke-lifecycle.js --mode full --json` |  |  |  |

## Interpreting Results

- `passed`: The local CLI lifecycle smoke completed and cleanup removed the temporary workspace.
- `failed`: A command returned unexpected output, unexpected exit status, or cleanup could not complete.
- `blocked`: The environment prevented a meaningful run, for example Node is missing, dependencies are not installed, or port `8888` is externally occupied.

## Release Claim Rule

Cross-platform-ready remains blocked until all three platform rows have passing evidence from this script or an equivalent CLI-only smoke with isolated `LAUNCHDECK_HOME`. One passing platform proves only that platform.
