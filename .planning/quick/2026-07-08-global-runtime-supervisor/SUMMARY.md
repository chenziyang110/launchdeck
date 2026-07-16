# Quick Task Summary: Global Runtime Supervisor

status: complete
completed_at: 2026-07-08

## Changed

- Added a global runtime registry in `src/global-runtime.js`.
- Added `launchdeck project add`, `launchdeck projects`, `launchdeck ps --all`, `launchdeck ports`, and `launchdeck inspect-port <port>`.
- Added `project:task` target support for global `start`, `stop`, and `restart`.
- Added declared-port preflight before managed task startup so an externally occupied port returns `port_conflict` before spawning.
- Added cross-platform port listener inspection helpers to `src/adapters/process.js`.
- Improved Windows managed process reliability by launching simple `node ...` commands directly instead of through the shell.
- Added public error codes for global registry and port conflict behavior.
- Updated README command docs and global runtime registry guidance.
- Added `test/global-runtime.test.js` for registry, global process view, port view, external port inspection, and duplicate-service prevention.
- Managed-process tests use project fixture scripts (`node scripts/*.js`) instead of inline `node -e "setInterval(...)"` commands.
- Windows temp fixture cleanup retries transient `EPERM` after managed processes stop.

## Verified

- `node --test test/global-runtime.test.js`: passed 5/5.
- `node --test test/managed-cli.test.js test/cli.test.js test/global-runtime.test.js test/runtime-state.test.js`: passed 22/22.
- `npm run check`: passed, including `src/adapters/process.js` and `src/global-runtime.js`.
- `npm test`: passed 58/58.

## Surface Conclusions

- CLI global registry commands: fixed in this quick task.
- Global `ps --all` process visibility: fixed in this quick task.
- Global `ports` and `inspect-port` visibility: fixed in this quick task.
- Startup duplicate-service prevention for declared occupied ports: fixed in this quick task.
- Existing single-project lifecycle behavior: confirmed correct by existing CLI/runtime tests.
- External process takeover/kill-by-port: not checked in this pass because it is intentionally out of scope.
- GUI/dashboard: not checked in this pass because it is intentionally out of scope.
- Cross-platform CI matrix: not checked in this pass; local Windows tests passed.

## Project Cognition Closeout

- Latest update recorded: `upd-20260708T025823.045257900Z`.
- Result state: `partial_refresh`.
- Note: cognition requires review for the updated behavior/test paths. Source and test validation is complete for this quick task.
