# Quick Summary: Agent Installer CLI

Status: resolved

## Outcome

Launchdeck now exposes a bounded `launchdeck agent` command surface for the canonical `.agents/skills/launchdeck-agent` skill package.

The CLI can list known local host targets, validate the canonical package and adapter matrix, and safely install the skill into one selected target. It does not implement MCP, marketplace, remote search, publish, or update behavior.

## Changed Code Paths

Added:

- `src/agent-installer.js`
- `test/agent-installer.test.js`
- `.planning/quick/2026-07-09-agent-installer-cli/SUMMARY.md`
- `.planning/quick/2026-07-09-agent-installer-cli/worker-results/lane-001.json`

Updated:

- `src/cli.js`
- `src/errors.js`
- `src/output.js`
- `test/cli-contract.test.js`
- `README.md`
- `.agents/README.md`
- `package.json`
- `.planning/quick/2026-07-09-agent-installer-cli/STATUS.md`
- `.specify/project-cognition/updates/sp-quick-closeout.json`

## Changed Behavior Surfaces

- CLI: added `launchdeck agent paths`, `launchdeck agent doctor`, and `launchdeck agent install`.
- Agent installer module: defines the conservative adapter matrix and safe copy planner.
- JSON envelopes: compact output preserves installer intent and result summaries without verbose per-file absolute copy paths.
- Public errors: added installer-specific codes for unsupported adapters, invalid source packages, and divergent targets.
- Docs: README documents command usage, project/user scope, target matrix, dry-run, force, and no-delete semantics.
- Project agent docs: `.agents/README.md` now points users to the cross-platform CLI and keeps the PowerShell script as a repo-local helper.
- Tests/check script: package syntax checks now include the new source and test files.

## Verification Evidence

- `node --test test/agent-installer.test.js` passed: 7 tests covering paths, doctor, dry-run, compact install summary, install, idempotency, conflict refusal, forced overwrite, extra-file preservation, and non-directory target refusal.
- `npm run check` passed.
- `node src/cli.js agent paths --json --compact` passed and returned the expected canonical source plus 8 scoped targets.
- `node src/cli.js agent doctor --json --compact` passed with 3 checks and 0 errors.
- `node src/cli.js agent install --agent claude-code --target <temp> --dry-run --json --compact` passed and returned compact action counts plus relative files only.
- `npm test` passed: 148 tests.

## Coverage Truth

- Implementation: fixed in this quick task.
- CLI routing/options: fixed in this quick task.
- JSON envelope compacting: fixed and tightened during leader review.
- Docs: fixed in this quick task.
- Tests: fixed in this quick task.
- Lifecycle start/stop/runtime behavior: confirmed not changed by scope and full test suite.
- Real user/home agent directories: not mutated; install tests used explicit temp `--target` directories.
- MCP, marketplace, remote publish/search/update: intentionally not checked or implemented.

## Important Decisions

- Default install scope is `project`; `user` scope requires explicit `--scope user`.
- `--target <dir>` is treated as an explicit skill-root directory, and the skill is installed into `<dir>/launchdeck-agent`.
- Existing divergent targets are refused unless `--force` is supplied.
- `--force` overwrites source-managed files only; it does not delete extra target files.
- A non-directory target path is refused even with `--force`.
- Extra target files count as divergence for no-force safety, but forced sync still preserves them.
- The `codex` project target is `.agents/skills`, which makes the canonical source an already-installed project target when run from this repo.

## Residual Risk

- The adapter matrix is intentionally conservative and may need future expansion as agent host conventions evolve.
- Project cognition closeout is scoped manually because the git top-level is `F:/github` and includes many unrelated sibling paths.

## Project Cognition Refresh

Result: fresh

`project-cognition update --payload-file .specify/project-cognition/updates/sp-quick-closeout.json --reason workflow-finalize --format json` recorded `update_id=upd-20260709T140543.951417000Z` with `result_state=partial_refresh`.

`project-cognition complete-refresh --format json` then returned `fresh`, `query_ready`, and `dirty=false`.
