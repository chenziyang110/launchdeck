# Quick Task: Hands-On Example

status: resolved
created: 2026-07-07
skill: sp-quick
understanding_confirmed: true
confirmed_at: 2026-07-07

## User Request

`能做一个example嘛？让用户能直接上手感受？`

## Project Cognition

- command: `C:\Users\11034\.specify\bin\project-cognition.exe compass --intent implement --query "能做一个example嘛？让用户能直接上手感受？" --format json`
- readiness: `query_ready`
- compass_state: `needs_semantic_intake`
- baseline_kind: `greenfield_empty`
- minimal_live_reads: none
- semantic intake normalization: create a small hands-on Launchdeck demo example that lets a user run lifecycle commands immediately.

## Understanding Checkpoint

### Issue

The repo currently has config examples, but not a self-contained demo project a new user can enter and run to feel Launchdeck's lifecycle flow end to end.

### Target Outcome

Add one hands-on example under `examples/` that works as a disposable local project and demonstrates:

- `doctor`
- `tasks`
- foreground `run build`
- failing foreground command with stable JSON error
- managed `start/ps/logs/stop`
- `clean` dry-run
- `clean --safe`
- `clean --all` confirmation refusal

### Boundaries

- Keep this as an example/demo only.
- Do not change core CLI behavior unless the example exposes a real defect.
- Do not add external dependencies.
- Do not require internet access to run the example.
- Do not claim cross-platform-ready from this example alone.
- Do not introduce GUI/TUI/MCP/agent/daemon/remote/cloud/reset behavior.

### Known Facts / Assumptions

- Launchdeck v1 already supports the needed commands.
- Current README links only config snippets in `examples/`.
- A demo using small Node scripts is the most portable path because the project already requires Node >=20.
- The example should be safe to clean and self-contained.

### Affected Surfaces

- `examples/`
- `README.md`
- Optional: a small validation command in the quick task summary, not product code.

### Implementation Plan

1. Add `examples/hands-on-demo/` with `.launchdeck.yml` and tiny scripts for build, fail, and dev.
2. Add a short demo README inside that folder with copy-paste commands using `node ../../src/cli.js`.
3. Link the demo from the root README examples section.
4. Validate by running the demo commands from the example directory and then `npm test`.

### Next Action

Dispatch one bounded implementation lane for the example files.

### Validation Evidence

- Parse the example `.launchdeck.yml`.
- Run the demo commands through the real CLI.
- Run `npm test`.

### Stop Condition

Stop and escalate if the demo requires changing v1 CLI behavior, external dependencies, or a broader product/tutorial system.

## Execution

- dispatch_shape: one-subagent
- execution_surface: native-subagents
- worker: subagent 019f3c39-fadf-7e83-b5f6-48c126642444 dispatched
- worker_result: success
- joined_at: 2026-07-07T19:04:46.8726246+08:00

## Results

- summary: `.planning/quick/2026-07-07-hands-on-example/SUMMARY.md`
- changed_files:
  - `README.md`
  - `examples/hands-on-demo/.launchdeck.yml`
  - `examples/hands-on-demo/README.md`
  - `examples/hands-on-demo/scripts/build.js`
  - `examples/hands-on-demo/scripts/dev.js`
  - `examples/hands-on-demo/scripts/fail.js`
- validation:
  - `node --check examples/hands-on-demo/scripts/build.js`: passed
  - `node --check examples/hands-on-demo/scripts/dev.js`: passed
  - `node --check examples/hands-on-demo/scripts/fail.js`: passed
  - YAML parse for `examples/hands-on-demo/.launchdeck.yml`: passed
  - Real CLI demo smoke: passed
  - `npm run check`: passed
  - `npm test`: passed, 53/53
  - `project-cognition update`: passed, `upd-20260707T110546.563799500Z`
- not_checked:
  - GitHub Actions was not run for this quick task.
- terminal_state: resolved
