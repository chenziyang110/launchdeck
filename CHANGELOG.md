# Changelog

All notable changes to Launchdeck are documented in this file. This project follows [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-07-28

### Added

- Deterministic Agent entrypoint discovery across MCP, global CLI, project-local CLI, and verified source checkouts, with one selected entrypoint reused for the request.
- Reviewable config proposal and digest-bound patch commands, including explicit monorepo workspace support and project-root containment checks.
- Bounded status and run-history queries with active, project, task, cursor, and limit filters suitable for Agent consumption.
- Default-task resolution through `project.defaultTask`, the only configured long-running task, or an actionable list of available tasks.

### Changed

- Expanded capability responses with package/build identity, protocol and config versions, supported operations, state scope, executable identity, and risk-policy metadata.
- Made Agent workflows recoverable after proven non-dispatch while preserving the no-replay rule for dispatched or uncertain mutations.
- Allowed one explicitly authorized config-authoring request to inspect, create, validate, and finish without silently starting or registering the project.
- Isolated the complete test suite from real user state on every platform and kept direct CLI tests isolated as well.

### Fixed

- Propagated expected config digests through the CLI so reviewed patches fail closed when the source configuration changes.
- Kept compact JSON output bounded instead of emitting the complete historical process store.
- Synchronized generated installer payloads, compatibility identities, and evidence candidate metadata for the release build.
- Gave the legacy Windows process-tree fallback its own bounded startup budget when the primary PowerShell probe times out.

### Security

- Preserved verified ownership checks, project-root containment, explicit workspace intent, digest-bound config writes, and effect-certainty gates across all new recovery paths.

## [0.2.0] - 2026-07-27

### Added

- Agent-first setup, status, doctor, update, repair, uninstall, and operation-reconciliation lifecycles with explicit approval and typed outcomes.
- Receipt-owned, immutable Agent runtime artifacts with atomic installation, backups, rollback, quarantine, garbage-collection eligibility, and offline pinned launchers.
- Host adapters and exact compatibility evidence for Codex, Claude Code, GitHub Copilot, and Visual Studio, including shared Skill/MCP coexistence checks.
- A packaged installer payload, deterministic prepack build, stable Windows/POSIX launchers, and package-level offline installation verification.
- A closed 18-operation MCP Agent catalog, compact JSON responses, bounded recovery queries, and `up`/`down` Agent-facing CLI aliases.
- Deterministic fixture and end-to-end coverage for multi-host installation, recovery windows, cross-surface managed lifecycle reuse, response loss, Flask config authoring, and packed-package installation.

### Changed

- Unified CLI, MCP, and installed-Skill mutations behind the same ownership, compatibility, lock, journal, and recovery rules.
- Hardened Windows process-tree inspection and termination to wait for verified descendants without depending on localized `taskkill` output.
- Expanded release packaging to include schemas, the canonical Skill, compatibility metadata, and the verified installer payload.

### Fixed

- Removed release-test coupling to archived Spec Kit feature workspaces.
- Kept the evidence index candidate synchronized with the generated compatibility identity while preserving older evidence cells as superseded.
- Improved managed CLI failure diagnostics and stop/restart stability under long serialized test runs.

### Security

- Enforced fail-closed path containment, symlink refusal, receipt ownership, digest-bound preconditions, secret redaction, and non-replayable uncertain mutations throughout Agent installation and recovery.

## [0.1.0] - 2026-07-21

- Initial CLI-first lifecycle control plane, global project registry, managed process ownership, logs/events, safe clean, MCP surface, and local Agent Skill installer.

[0.3.0]: https://github.com/chenziyang110/launchdeck/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/chenziyang110/launchdeck/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/chenziyang110/launchdeck/releases/tag/v0.1.0
