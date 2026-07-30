# Changelog

All notable changes to Launchdeck are documented in this file. This project follows [Semantic Versioning](https://semver.org/).

## [0.5.3] - 2026-07-30

### Added

- Added exact Windows project-scope Skill and MCP compatibility evidence for Codex CLI `0.146.0`.

### Fixed

- Allowed receipt-owned Codex MCP upgrades when unrelated TOML content changed after installation, while preserving that unrelated content.
- Kept MCP ownership validation scoped to the exact prior managed entry instead of treating the entire Codex configuration file as the ownership boundary.

### Security

- Continued to require exact host version, platform, component, and scope evidence; nearby Codex versions are not inferred as supported.
- Refused upgrades when the managed MCP command, arguments, environment, build identity, or ownership marker differs from the receipt-bound entry.

## [0.5.2] - 2026-07-30

### Fixed

- Provisioned the exact build-bound runtime artifact even when the stable launcher bytes were already unchanged from an earlier release.
- Preserved the Runtime verification dependency through mixed Runtime, Skill, and MCP setup transaction normalization.
- Prevented valid Codex project installations from rolling back with `agent_launcher_path_invalid` during an upgrade or installation into an additional project.

### Security

- Limited no-op Runtime verification fallback to an existing, digest-verified artifact for the exact approved build; PATH lookup and unpinned latest-version fallback remain disallowed.

## [0.5.1] - 2026-07-30

### Changed

- Routed Agent targets without maintained full-integration evidence through the safe Skill installer and made the CLI help and README report that capability boundary accurately.

### Fixed

- Made repeated `agent setup` additive so a new Agent target can be installed without dropping targets owned by the current receipt.
- Preserved receipt-owned Runtime, Skill, and MCP targets in the successor receipt during incremental setup.
- Registered planned no-op Host targets for exact lock-time revalidation, preventing `agent_plan_precondition_missing` after a valid additive plan.
- Prevented valid new targets from being rejected as `agent_receipt_target_unresolved` solely because an earlier receipt already existed.

### Security

- Kept retained targets bound to their exact target ID, path, scope, component, ownership boundary, and live digest; forged target paths remain refused.

## [0.5.0] - 2026-07-29

### Added

- Agent-first searchable multi-select across all 76 catalog targets before component and scope selection.
- Explicit Runtime, Skill, MCP, and CLI capability records for every Agent target, including support state, installability, and valid scopes.

### Changed

- Limited component choices to the safe installable intersection of all selected Agent targets.
- Replaced ambiguous Full integration and Skill-only labels with concrete capability summaries in the setup wizard and help output.
- Kept CLI fallback visible as informational project-local availability instead of presenting it as an installer component.

### Fixed

- Returned `agent_component_selection_required` when non-interactive setup omits the component selection.
- Preserved the refusal-owned null build identity instead of allowing request input to invalidate the result envelope.
- Treated an empty interactive Agent selection as a successful cancellation before planning or writes.

### Security

- Prevented unsupported component combinations from being offered for mixed Agent selections while preserving existing ownership and collision checks.

## [0.4.0] - 2026-07-29

### Added

- Searchable multi-select installation for 76 Agent targets derived from the pinned Skills catalog, with clear Full integration and Skill-only labels.
- Project and user destination resolution for catalog Agents, including supported host-specific environment overrides.
- End-to-end coverage for first install, receipt persistence, idempotent setup, and receipt-owned uninstall of Skill-only targets.

### Changed

- Made component selection determine whether setup offers the broad searchable Skill catalog or the four full runtime/MCP adapters.
- Kept detected Agents at the top of search results and deduplicated shared Skill destinations before planning writes.

### Fixed

- Preserved safe cancellation as a successful `cancelled` outcome without invoking planning or installation services.
- Surfaced structured refusal codes and reasons in terminal output instead of masking project-trust failures.
- Returned canonical durable effect evidence for catalog installations so the first successful write commits its receipt instead of becoming indeterminate.
- Included evaluated no-op targets in setup results so idempotent status remains visible.

### Security

- Refused divergent catalog targets unless exact receipt ownership and live digest evidence match.
- Prevented catalog uninstall from removing targets without matching receipt ownership.
- Preserved exact project trust boundaries without inheriting trust from parent directories.

## [0.3.1] - 2026-07-28

### Added

- Interactive Agent setup with keyboard multi-select for hosts and components, selectable scope, and explicit final approval.

### Fixed

- Kept immutable GitHub installation examples synchronized with the package version.

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

[0.5.1]: https://github.com/chenziyang110/launchdeck/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/chenziyang110/launchdeck/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/chenziyang110/launchdeck/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/chenziyang110/launchdeck/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/chenziyang110/launchdeck/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/chenziyang110/launchdeck/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/chenziyang110/launchdeck/releases/tag/v0.1.0
