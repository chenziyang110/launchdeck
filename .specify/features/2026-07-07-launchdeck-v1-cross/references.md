# References: Launchdeck v1 Cross-Platform CLI Lifecycle Tool

## Discussion Sources

- `.specify/discussions/launchdeck-tool/handoff-to-specify.md`: user-confirmed requirement contract and must-preserve ledger.
- `.specify/discussions/launchdeck-tool/handoff-to-specify.json`: structured handoff metadata and compatibility fields.
- `.specify/discussions/launchdeck-tool/discussion-log.md`: chronological confirmed decisions and handoff confirmation.
- `.specify/discussions/launchdeck-tool/requirements.md`: detailed product, command, runtime, clean, JSON, error, init, root, and verification contracts.
- `.specify/discussions/launchdeck-tool/technical-options.md`: option comparison, accepted tradeoffs, consequence analysis, and runtime adapter direction.
- `.specify/discussions/launchdeck-tool/project-context.md`: context boundary and verified project facts from discussion.
- `.specify/discussions/launchdeck-tool/open-questions.md`: confirmed defaults and soft unknowns with stop-and-reopen conditions.

## Project Memory

- `.specify/memory/constitution.md`: specification-first delivery, scope discipline, tests, security, reversible delivery, evidence before completion, and no unrequested fallbacks.
- `.specify/memory/project-rules.md`: no additional stable project rules beyond the constitution.
- `.specify/memory/learnings/INDEX.md`: no recorded reusable learning entries at the time of specification.

## Project Cognition

- `project-cognition compass --intent plan --query "Specify Launchdeck v1 as a cross-platform CLI tool..." --format json`
- Readiness: `query_ready`.
- Baseline kind: `greenfield_empty`.
- Minimal live reads recommended: `src/runtime.js`, `src/cli.js`, `test/cli.test.js`.
- Advisory note: project cognition navigates; live files prove current repository facts.

## Repository Evidence

- `package.json`: Node ESM CLI package named `launchdeck`, binary `launchdeck: ./src/cli.js`, scripts `check` and `test`, dependency `yaml`, Node engine `>=20`.
- `README.md`: product framing, quick start, config example, command list, and explicit statement that Launchdeck is a lifecycle control layer rather than a task shortcut layer.
- `.launchdeck.yml`: dogfood config with setup, test, lint, safe clean, and risky clean.
- `src/cli.js`: current CLI command surface, option parsing, JSON output handling, doctor/report flow, start/restart/ps/logs/stop/clean command routes, and help text.
- `src/config.js`: config file discovery, config normalization, risk/ports/env/clean validation, project name defaulting, and sample config generation.
- `src/runtime.js`: runtime path management, state read/write/refresh, managed start, foreground run, stop, log tail, clean target resolution, inside-project assertion, PID liveness, and Windows/POSIX stop behavior.
- `test/cli.test.js`: current CLI smoke for doctor, foreground run, managed dev, duplicate start, ps, logs, stop, clean, init, config exists, and missing task.

## Source Sweep Status

- source_files_read: complete
- source_signal_disposition_status: complete
- handoff_integrity: passed after compatibility metadata normalization
