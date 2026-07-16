# Compact JSON Output Summary

## Outcome

Added an opt-in compact JSON mode for the Launchdeck CLI. Callers can now use
`--json --compact` to receive a shorter machine-readable response while plain
`--json` remains the backward-compatible envelope.

## Changed Code Paths

- modified: `src/cli.js`
- modified: `src/output.js`
- modified: `test/cli-contract.test.js`
- modified: `test/cli-control-plane-contract.test.js`
- modified: `README.md`
- added: `.planning/quick/2026-07-09-compact-json-output/STATUS.md`
- added: `.planning/quick/2026-07-09-compact-json-output/SUMMARY.md`

## Changed Behavior Surfaces

- CLI global option parsing now recognizes `--compact`.
- JSON writer applies compact serialization when `io.launchdeckJson.compact` is true.
- Compact success output keeps `ok`, `schemaVersion`, `command`, `status`, key task/process/port fields, concise counts, and bounded output text.
- Compact failure output keeps stable error `code`, `message`, `details`, and concise `next` actions with `cmd` and `risk`.
- Existing plain `--json` output is unchanged.
- JSON Lines follow streams remain unchanged.

## Verification Evidence

- `npm run check` passed.
- `node --test test/cli-control-plane-contract.test.js test/cli-contract.test.js` passed: 25 tests.
- `npm test` passed: 141 tests.
- Demo read-only smoke with `LAUNCHDECK_HOME=F:\github\launchdeck\.tmp\feel-demo-home`:
  - `node src/cli.js inspect task:demo:dev --json --compact` returned compact task/port/ownership summary.
  - `node ..\..\src\cli.js clean --all --json --compact` from `examples/demo-api` returned compact `confirmation_required` refusal with safe next action.
  - `ps --all --json` vs `ps --all --json --compact` measured 18,235 chars vs 734 chars for the current demo registry snapshot.

## Coverage Notes

- Verified implementation, parser, output contract tests, real CLI smoke, and README behavior documentation.
- No runtime state contract or process supervision behavior was changed.
- The live demo service was not stopped by this task. The read-only `ps`/`inspect` smoke observed the current demo run as stale/stopped and port 8888 as free.

## Project Cognition Refresh

- Inline project-cognition update ran with update id `upd-20260709T072817.646824900Z`.
- Result state: `partial_refresh`.
- Returned minimal live reads:
  - `.planning/quick/2026-07-09-compact-json-output/STATUS.md`
  - `.planning/quick/2026-07-09-compact-json-output/SUMMARY.md`
  - `README.md`
  - `src/cli.js`
  - `src/output.js`
  - `test/cli-contract.test.js`
  - `test/cli-control-plane-contract.test.js`
