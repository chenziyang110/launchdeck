# Summary: Hands-On Example

Completed: 2026-07-07T19:04:46.8726246+08:00

## What Changed

- Added a dependency-free demo project at `examples/hands-on-demo/`.
- Added demo tasks:
  - `build`: writes `dist/demo.txt`.
  - `fail`: exits with status `7` to show `task_command_failed`.
  - `dev`: starts a managed local process with runtime state and logs.
- Added `examples/hands-on-demo/README.md` with copy-paste commands using `node ../../src/cli.js`.
- Linked the demo from the root `README.md` examples list.

## Verified

- Parsed `examples/hands-on-demo/.launchdeck.yml`.
- Syntax-checked all demo scripts.
- Ran a real CLI smoke from `examples/hands-on-demo` covering:
  - `doctor --json`
  - `tasks --json`
  - `run build --json`
  - `run fail --json`
  - `start dev --json`
  - `ps --json`
  - `logs dev --json`
  - `stop dev --json`
  - `clean --json`
  - `clean --safe --json`
  - `clean --all --json`
- Ran `npm run check`.
- Ran `npm test`, 53/53 passing.
- Ran `project-cognition update`, recorded as `upd-20260707T110546.563799500Z`.
- Confirmed generated demo folders were cleaned after validation:
  - `examples/hands-on-demo/dist`
  - `examples/hands-on-demo/.launchdeck`
  - `examples/hands-on-demo/demo-cache`

## Notes

- The managed log contract records the Launchdeck command header. The demo smoke checks `command: node scripts/dev.js` rather than child stdout heartbeat text.
- No core CLI, tests, package metadata, schema, or CI files were changed.

## Not Checked

- GitHub Actions was not run for this quick task.
- Cross-platform-ready was not claimed.
