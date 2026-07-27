# Changelog

All notable changes to Launchdeck are documented in this file. This project follows [Semantic Versioning](https://semver.org/).

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

[0.2.0]: https://github.com/chenziyang110/launchdeck/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/chenziyang110/launchdeck/releases/tag/v0.1.0
