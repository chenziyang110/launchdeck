# Research: Launchdeck v1 Cross-Platform CLI Lifecycle Tool

## Research Scope

This research validates implementation choices for a cross-platform local CLI that runs foreground commands, manages long-running processes, records runtime state/logs, and deletes configured cleanup targets safely. The goal is not to compare product directions again; the product direction is already locked in `spec.md` and `alignment.md`.

## Decisions

### R-001: Keep Node.js ESM as the v1 runtime

**Decision**: Continue with the current Node.js `>=20` ESM CLI package and the existing `yaml` dependency.

**Rationale**: The repository already has `src/cli.js`, `src/config.js`, `src/runtime.js`, `src/errors.js`, `node:test` coverage, and `package.json` bin wiring. Replatforming would add risk without improving the v1 lifecycle contract.

**Rejected alternatives**:

- Rust or Go rewrite: better standalone binary story later, but would delay the protocol/runtime behavior that needs validation first.
- Shell-script implementation: weaker structured JSON/error handling and harder cross-platform process behavior.

**Plan impact**: `/sp.tasks` should extend the current Node modules and only add internal adapter modules where platform ownership becomes clearer.

### R-002: Use Node child process primitives behind a runtime adapter

**Decision**: Use Node's `child_process.spawn` for foreground and managed execution, with all shell/platform options hidden behind runtime adapter functions.

**Rationale**: Launchdeck v1 stores user-authored commands as shell strings. Node spawn can run commands asynchronously and supports options such as `cwd`, environment, stdio, `shell`, and Windows-specific window behavior. The risk is not the primitive itself; the risk is leaking platform differences into CLI semantics.

**Plan impact**:

- `run <task>` uses foreground spawn and preserves child exit code.
- Managed tasks use adapter-owned spawn, log redirection, process identifier capture, and liveness checks.
- CLI command code must call product-level runtime APIs, not embed OS-specific process behavior.

### R-003: Use platform-specific stop strategies behind one stop contract

**Decision**: Use an adapter contract for process-tree termination. Windows should initially use `taskkill` for process-tree stop; POSIX should terminate the process group when the managed process was started in a controllable group, with fallback status reporting.

**Rationale**: Stopping process trees is one of the main product promises. A single PID kill can leave child servers behind. Windows and POSIX differ enough that pretending there is one primitive would create false confidence.

**Plan impact**:

- Stop must verify or refresh liveness after attempting termination.
- Stop failure must produce `stop_failed` or `partial_failure`, not optimistic success.
- OS smoke is required before cross-platform-ready claims.

### R-004: Treat runtime state as durable recovery evidence

**Decision**: Keep `.launchdeck/runtime/state.json` and `.launchdeck/logs/` under the project root, and preserve records during inspection commands.

**Rationale**: The user problem is not only starting a project; it is knowing what was started, where logs are, and how to stop it. Deleting stale records during `ps`, `logs`, or `stop` would remove evidence needed for recovery.

**Plan impact**:

- `ps` refreshes status and writes `lastRefresh`/status changes without deleting records.
- Invalid state JSON should be reported as `runtime_state_invalid`.
- Logs remain readable after process exit until explicit cleanup.

### R-005: Use canonical containment for cleanup safety

**Decision**: Clean planning must canonicalize paths where possible and refuse project root, out-of-root targets, empty targets, and ambiguous targets before deletion.

**Rationale**: Cleanup is safety-critical. Relative path checks and string-prefix checks can fail around symlinks, junctions, casing, path separators, and missing paths. Node filesystem APIs provide realpath and removal primitives, but Launchdeck must define the safety policy.

**Plan impact**:

- Clean should first build a complete target plan, then delete only approved targets.
- Existing targets use canonical containment checks.
- Missing targets are skipped, but their intended resolved path must still be under the project root.
- Risky targets require `--all --yes`.

### R-006: Define shared JSON and error contracts before command expansion

**Decision**: Add a shared command envelope and v1 error vocabulary before implementing more command behavior.

**Rationale**: JSON and errors are future automation surfaces. If each command emits a slightly different shape, agent/MCP/CI integrations later will inherit accidental incompatibility.

**Plan impact**:

- Success JSON includes `ok: true`; failure JSON includes `ok: false` and `error`.
- Commands include `command`, `status`, `projectRoot`, and `configPath` when applicable.
- Partial failures use `status: "partial"` and `error.code: "partial_failure"`.

### R-007: Gate release claims by evidence level

**Decision**: Use three claim levels: `dev-ready`, `platform-ready`, and `cross-platform-ready`.

**Rationale**: Cross-platform support is central, but implementation will usually be built on one OS first. Naming the evidence level prevents trust damage from overclaiming.

**Plan impact**:

- One named OS smoke allows `dev-ready`.
- A named OS-specific run allows `platform-ready` for that OS.
- Windows, macOS, and Linux smoke evidence is required for `cross-platform-ready`.

## Current Repository Evidence

- `package.json` exposes `launchdeck` as a Node CLI and requires Node `>=20`.
- `src/config.js` already normalizes config, task metadata, ports, risk levels, logs, and clean targets.
- `src/cli.js` already contains command routing for init, doctor, run/start/restart, ps/logs/stop, and clean, but needs contract hardening and a `tasks` command.
- `src/runtime.js` already manages state/log paths, child execution, stop, logs, and clean, but needs adapter boundaries, stale/unknown states, stronger stop verification, invalid-state reporting, and canonical cleanup proof.
- `test/cli.test.js` and `test/config.test.js` provide a base for CLI/config behavior but need expanded failure, JSON, cleanup, stale-state, and OS smoke coverage.

## Official Sources Consulted

- Node.js child process API: https://nodejs.org/api/child_process.html
- Node.js filesystem API: https://nodejs.org/api/fs.html
- Node.js process API: https://nodejs.org/api/process.html
- Microsoft `taskkill` command reference: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill
- GitHub Actions hosted runners reference: https://docs.github.com/en/actions/reference/github-hosted-runners-reference

## Open Research Assumptions For Task Phase

- The exact POSIX process-group spawn/stop implementation should be proven in implementation tests, not only documented.
- Windows process-tree termination should be proven with a real child-process smoke on Windows.
- Symlink and junction cleanup tests should be platform-aware because Windows junction behavior differs from POSIX symlinks.
- CI provider choice can be GitHub Actions or equivalent, as long as it produces Windows, macOS, and Linux smoke evidence.
