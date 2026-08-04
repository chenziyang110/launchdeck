# Quickstart Validation

## Purpose

Prove one representative end-to-end path with `fastapi-inventory`: discover it through the packaged catalog, copy it without side effects, run its native behavior, then validate Launchdeck lifecycle from an external temporary fixture. This scenario is representative evidence, not a substitute for the mandatory ten-sample Windows/Linux matrix.

## Preconditions

- Build/install the Launchdeck root dependencies under Node.js >=20.
- Provide the stable Python toolchain and lock-aware installer declared by `fastapi-inventory`.
- Use a new temporary parent on the local filesystem; ensure both the destination and any staging prefix are absent.
- Reserve an overridable local port and use a dedicated temporary `LAUNCHDECK_HOME`.
- Run on Windows or Linux. Do not infer or claim macOS compatibility.

## Scenario

1. Run `launchdeck example list --json`; assert one schemaVersion 1 object and an exact `fastapi-inventory` row from the ten-entry catalog.
2. Run `launchdeck example copy fastapi-inventory <temp>/fastapi-inventory --json`; assert no prompt and a success receipt only after atomic rename.
3. Compare the copied inventory/content digest with the packaged source; confirm license, lock data, deterministic seed, tests, API, port override, and absence of Launchdeck artifacts/evaluation content.
4. In the copy only, install locked native dependencies, run native tests, start with the reserved port, poll the documented health/API endpoint with bounded retries, stop, and prove process/port/runtime-file cleanup.
5. Through an external fixture, author a reviewable candidate `.launchdeck.yml` in that temporary copy. Run Launchdeck doctor, applicable setup/build/test, start, health/status/log evidence, and stop in `finally`.
6. Confirm the original packaged sample remains unchanged and Launchdeck-neutral; archive only sanitized receipts/logs.

## Expected Results

- List and copy each emit exactly one schemaVersion 1 JSON envelope with no prompt, spinner, ANSI decoration, install, run, Git, config, or network side effect.
- The copied tree exactly matches the packaged source and has no staging residue.
- Native locked install/test/start/health/stop succeeds with deterministic seeded behavior and releases the port.
- Launchdeck validates the temporary configuration, owns the started process, reports health, and stops/cleans it without touching the source sample.
- Evidence records sample ID, OS, commands/phases, exit statuses, port, health, cleanup, and source/copy/tarball digests; it contains no score.

## Failure and Recovery

- Unknown ID or non-TTY missing ID: make no filesystem change and retry explicitly with a valid ID.
- Existing destination or unsafe parent/type/symlink/reparse path: reject before staging; choose a new safe path.
- Copy or rename failure: verify both final destination and owned staging path are absent, retain the typed error and cleanup result, then explicitly retry.
- Native install/test/health failure: collect phase-specific logs, stop any owned process, clean the temporary copy, and repair that sample; never skip the cell.
- Port conflict: stop the conflicting test-owned process or select the documented override, then rerun from a fresh copy.
- Launchdeck failure: collect doctor/tasks/status/log evidence, stop/reconcile only the isolated copy, and reopen the lifecycle task if the approved config cannot express the project accurately.
- Package size or digest failure: remove only forbidden/generated/unnecessary weight or repair drift; reopen before reducing the ten-project scope.

## Verification Evidence

- Structure: exact catalog row, copied inventory, license/lock/seed/test/API checklist, source/copy/tarball digests.
- Runtime: native and Launchdeck phase receipts, health response, process ownership, port release, cleanup and no-residue checks.
- CLI/TUI: JSON single-object snapshots plus separate human 60/120-column, no-color, selector, no-match, cancel, conflict, success, copy-failure and rename-failure captures.
- Required expansion: repeat native and Launchdeck lifecycle for all ten entries on `windows-latest` and `ubuntu-latest`; any skipped or failed cell blocks completion.
