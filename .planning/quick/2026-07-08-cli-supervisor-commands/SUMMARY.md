# CLI Supervisor Command Surface Summary

## Result

Implemented the next bounded CLI supervisor slice:

- `launchdeck status --all`
- `launchdeck conflicts`
- `launchdeck project remove <name|id|path>`
- `launchdeck project scan <dir>`
- `launchdeck logs project:task`

`launchdeck logs --follow` was not expanded into a long-running watcher in this slice. The CLI now returns `unsupported_option` for `--follow` instead of silently ignoring it.

Also fixed the public error-code contract so `unsupported_option`, `scan_root_not_found`, and `scan_root_invalid` remain stable JSON error codes instead of collapsing to `internal_error`.

## Changed Files

- `src/cli.js`
- `src/global-runtime.js`
- `src/errors.js`
- `test/global-runtime.test.js`
- `test/cli-contract.test.js`
- `README.md`
- `.specify/memory/learnings/INDEX.md`
- `.specify/memory/learnings/launchdeck-git-root-closeout-scope.md`
- `.planning/quick/2026-07-08-cli-supervisor-commands/STATUS.md`
- `.planning/quick/2026-07-08-cli-supervisor-commands/SUMMARY.md`

## RED Evidence

Command:

```bash
node --test test/global-runtime.test.js
```

Result after test-only edits: failed as expected. New assertions for `status --all`, `conflicts`, `project remove`, `project scan`, and `logs project:task` returned CLI status `1` before implementation. One existing `ps --all` case also failed during the full RED run, but passed when rerun alone before production edits, matching the known Windows managed-process timing risk rather than a new command failure.

## GREEN Evidence

Commands:

```bash
node --test test/global-runtime.test.js
npm run check
npm test
```

Results:

- Targeted global runtime tests passed 11/11 after adding explicit `logs --follow` unsupported coverage.
- Syntax check passed.
- Full test suite passed 64/64.

Safety scan:

```bash
rg "node -e .*setInterval|command: .*node -e .*setInterval|setInterval\\(.*\\)" test src examples README.md package.json -n
```

Result: no inline `node -e` long-running commands; remaining `setInterval` usage is in fixture/example script files.

## Notes

- `project remove` only removes the registry entry; it does not delete project files, runtime files, logs, or processes.
- `project scan` is explicit-directory only, bounded by depth/directory/project limits, and skips heavy/generated directories such as `node_modules`, `.git`, and `.launchdeck`.
- `conflicts` reports externally occupied declared ports and Launchdeck ownership conflicts without stopping or killing anything.
- Cross-project logs use registered project/task runtime records, not port inference.
- `logs --follow` is deliberately rejected with `unsupported_option` so the CLI does not start an unbounded watcher in this quick slice.
- Captured a reusable learning for Launchdeck's broad `F:/github` git-root/closeout-plan scope pitfall.

## Project Cognition Refresh

- update_id: `upd-20260708T040642.194681000Z`
- result_state: `partial_refresh`
- readiness: `review`
- note: update was recorded against explicit workflow-owned Launchdeck paths because the git root is `F:/github` and contains unrelated sibling directories.
- note: `.specify/memory/learnings/*` is ignored by project cognition rules, but the learning files were written as project memory.

## Residual Risks

- `logs --follow` still needs a separate design if a robust long-running tail/watch mode is desired.
- Port-listener PID availability depends on the platform adapters; the current tests cover the Windows environment used here and existing fallback behavior.
- Git status is unusual because `F:/github` is the git root and `launchdeck` appears as an untracked directory from that root, so normal tracked-file diff output is not available for this workspace state.
