# Open Questions: Launchdeck Tool

## Blocking Questions

None for the current discussion direction.

## Confirmed Defaults

- `init` should create an editable `.launchdeck.yml`; automatic scanning can come later.
- `doctor` should be a safety and readiness check, not just YAML parsing.
- `doctor` should be read-only and classify findings as `error`, `warn`, or `info`.
- `tasks` should exist as a safe read-only discovery command.
- `tasks` should show configured capabilities, including risk and long-running behavior, without validating or executing them.
- `run <task>` should respect `longRunning`; short tasks run foreground, managed tasks start under Launchdeck.
- `dev` should be shorthand for `start dev`, and `start/restart` should only apply to managed tasks.
- `ps`, `logs`, and `stop` should be recovery-oriented commands that preserve inspectable runtime state.
- `clean` should default to dry-run.
- `clean` should remain project-local generated-state cleanup, separate from future destructive `reset`.
- Platform-sensitive behavior should live behind runtime adapters rather than command-level ad hoc OS checks.
- Release claims should be verification-level based: `dev-ready`, `platform-smoke-ready`, or `cross-platform-ready`.
- `init` should create an editable `.launchdeck.yml`; scanning/templates are deferred suggestion layers.
- Normal commands should discover the nearest config upward from target cwd; `init` should write to target cwd instead of mutating ancestor configs.
- JSON output should use a stable envelope with `ok`, command-specific payloads, and structured `error.code`; exit codes should stay simple in v1.
- v1 error codes should be stable, actionable, snake_case, and grouped by domain.
- v1 scope should remain local, single-project, CLI-first, explicit-config lifecycle control.
- `platforms` can be reserved in the protocol direction before full v1 implementation.

## Soft Unknowns

1. Distribution runtime
   - Current default: Node CLI distributed through npm.
   - Owner: user/downstream specification.
   - Latest safe resolve phase: before packaging/release decisions.
   - Stop-and-reopen condition: user requires a standalone binary, Homebrew/Scoop distribution, or non-Node runtime as part of the first product boundary.

2. Automatic discovery depth
   - Current default: hand-written `.launchdeck.yml` is enough for the first coherent product; discovery can be layered later.
   - Owner: downstream specification.
   - Latest safe resolve phase: before broad stack-support claim.
   - Stop-and-reopen condition: product success requires zero-config onboarding for the first version.

3. Agent integration form
   - Current default: CLI/protocol first; skill and MCP are downstream consumers.
   - Owner: downstream specification.
   - Latest safe resolve phase: before agent integration work.
   - Stop-and-reopen condition: first release must be agent-only rather than human-and-agent usable.

4. UI or TUI surface
   - Current default: not applicable for the first discussion boundary.
   - Owner: user.
   - Latest safe resolve phase: before any UI-facing scope is added.
   - Stop-and-reopen condition: user asks for a dashboard, terminal UI, editor panel, or visual control surface.

5. Cross-platform packaging depth
   - Current default: runtime behavior must support Windows, macOS, and Linux; packaging channel can be decided later.
   - Owner: user/downstream specification.
   - Latest safe resolve phase: before packaging/release decisions.
   - Stop-and-reopen condition: user requires installer-level distribution, shell completions, native service integration, or standalone binaries in the first product boundary.

6. Platform-specific config overrides
   - Current default: base `.launchdeck.yml` remains portable; platform-specific overrides are reserved in the design but deferred until real project evidence requires implementation.
   - Owner: downstream specification.
   - Latest safe resolve phase: before broad stack-support claim.
   - Stop-and-reopen condition: common cross-platform projects cannot express lifecycle commands without OS-specific branches.

7. Stable error object shape
   - Current default: define stable error categories now; exact JSON object structure can be finalized during specification.
   - Owner: downstream specification.
   - Latest safe resolve phase: before agent integration.
   - Stop-and-reopen condition: downstream agents need reliable error branching and string-only errors are insufficient.

8. Exact doctor check codes
   - Current default: stable check codes are required, but exact names can be finalized during specification.
   - Owner: downstream specification.
   - Latest safe resolve phase: before doctor implementation lock.
   - Stop-and-reopen condition: CLI users or downstream tools need to branch on findings and human message parsing would be required.

9. Verbose task display
   - Current default: default `tasks` output is compact; verbose display can be added later for cwd, env keys, description, and log path.
   - Owner: downstream specification.
   - Latest safe resolve phase: before tasks implementation lock.
   - Stop-and-reopen condition: normal projects cannot understand task behavior from compact output.

10. Multi-instance managed tasks
   - Current default: one running process per task name; duplicate starts fail with `process_already_running`.
   - Owner: downstream specification.
   - Latest safe resolve phase: before execution implementation lock.
   - Stop-and-reopen condition: users need to run multiple instances of the same task with different env, ports, or arguments.

11. `start` default fallback
   - Current default: `launchdeck start` uses `start` when present, otherwise `dev` when present.
   - Owner: downstream specification.
   - Latest safe resolve phase: before execution implementation lock.
   - Stop-and-reopen condition: projects commonly define both `start` and `dev` and users find fallback behavior surprising.

12. Runtime state pruning
   - Current default: `ps`, `logs`, and `stop` should not silently delete runtime state; pruning can be a future explicit command or safe clean target.
   - Owner: downstream specification.
   - Latest safe resolve phase: before runtime implementation lock.
   - Stop-and-reopen condition: stopped/stale records accumulate enough to make normal `ps` output noisy.

13. Stop failure representation
   - Current default: stop failures must preserve state and report inspectable failure; exact JSON shape can be finalized during specification.
   - Owner: downstream specification.
   - Latest safe resolve phase: before runtime implementation lock.
   - Stop-and-reopen condition: users cannot distinguish already-stopped, unsupported-platform, permission-denied, and failed-stop cases.

14. Symlink cleanup semantics
   - Current default: clean targets must stay inside the project boundary; exact symlink canonicalization rules should be finalized during specification.
   - Owner: downstream specification.
   - Latest safe resolve phase: before clean implementation lock.
   - Stop-and-reopen condition: a clean target is inside the project syntactically but resolves outside through symlinks or junctions.

15. Future reset command
   - Current default: destructive reset behavior is out of scope for `clean` and should require a separate contract later.
   - Owner: user/downstream specification.
   - Latest safe resolve phase: before any reset-like behavior is added.
   - Stop-and-reopen condition: users need database/container/volume/dependency reset as part of the first product boundary.

16. Shell portability strategy
   - Current default: keep `command` as a shell string in v1, use platform-native shell behavior, and warn about portability risks.
   - Owner: downstream specification.
   - Latest safe resolve phase: before runtime architecture lock.
   - Stop-and-reopen condition: common cross-platform projects cannot express commands safely without a structured command model.

17. Native process strategy
   - Current default: use practical platform mechanisms first, such as Windows `taskkill /T` and POSIX process groups, while preserving adapter boundaries.
   - Owner: downstream implementation.
   - Latest safe resolve phase: before runtime implementation lock.
   - Stop-and-reopen condition: initial mechanisms cannot reliably stop process trees on supported OS families.

18. CI platform provider
   - Current default: verification requires Windows, macOS, and Linux evidence, but the exact CI provider or local test setup can be decided during planning.
   - Owner: downstream planning/implementation.
   - Latest safe resolve phase: before release workflow lock.
   - Stop-and-reopen condition: project cannot obtain reliable macOS, Windows, or Linux execution environments.

19. Smoke project language
   - Current default: use Node scripts for the first stack-neutral smoke project because Launchdeck itself is currently a Node CLI.
   - Owner: downstream specification.
   - Latest safe resolve phase: before smoke test implementation lock.
   - Stop-and-reopen condition: Node-based smoke hides shell/process behavior needed by non-Node projects.

20. Starter config stack bias
   - Current default: starter config can be npm-shaped initially, but should stay obviously editable and not claim scan confidence.
   - Owner: downstream specification.
   - Latest safe resolve phase: before init implementation lock.
   - Stop-and-reopen condition: npm-shaped starter undermines the universal-project positioning.

21. Init project root targeting
   - Current default: `init` writes to the explicit target cwd, not an ancestor config discovered upward.
   - Owner: downstream specification.
   - Latest safe resolve phase: before init implementation lock.
   - Stop-and-reopen condition: users need monorepo-aware init behavior in the first boundary.

22. Monorepo orchestration
   - Current default: first boundary supports monorepos through task `cwd` and nearest config discovery, not workspace graph orchestration.
   - Owner: user/downstream specification.
   - Latest safe resolve phase: before root-resolution implementation lock.
   - Stop-and-reopen condition: target users need one Launchdeck command to run tasks across multiple packages/apps.

23. Absolute task cwd
   - Current default: task cwd should stay inside project root; absolute cwd outside project root is deferred.
   - Owner: downstream specification.
   - Latest safe resolve phase: before task execution implementation lock.
   - Stop-and-reopen condition: common safe workflows require commands to run outside the project root.

24. JSON schema versioning
   - Current default: stable fields and documented error codes are enough for v1; explicit JSON schema versioning can be deferred.
   - Owner: downstream specification.
   - Latest safe resolve phase: before public integrations depend on JSON output.
   - Stop-and-reopen condition: multiple external consumers need compatibility negotiation.

25. Distinct process exit code mapping
   - Current default: use `0`, child exit code, and `1` for Launchdeck-level failures; precise reason lives in JSON.
   - Owner: downstream specification.
   - Latest safe resolve phase: before CLI output compatibility lock.
   - Stop-and-reopen condition: CI or scripting users need distinct non-zero process codes without parsing JSON.

26. Error code final names
   - Current default: the proposed v1 vocabulary is stable enough for specification, but exact final names can be reviewed before implementation lock.
   - Owner: downstream specification.
   - Latest safe resolve phase: before CLI error compatibility lock.
   - Stop-and-reopen condition: implementation discovers common failures that do not fit the vocabulary without falling back to `internal_error`.

27. Error documentation format
   - Current default: document codes in README/reference docs; generated JSON schema can come later.
   - Owner: downstream specification/documentation.
   - Latest safe resolve phase: before public release.
   - Stop-and-reopen condition: users need machine-readable error documentation for tooling.

28. v1 beachhead users
   - Current default: developers using a local CLI are the v1 user frame; agent/MCP users are deferred consumers.
   - Owner: user/downstream specification.
   - Latest safe resolve phase: before v1 requirements lock.
   - Stop-and-reopen condition: the first target audience must be agent-only or CI-only rather than direct CLI users.

29. v1 automatic discovery pressure
   - Current default: automatic discovery is deferred; explicit config is acceptable for v1.
   - Owner: user/downstream specification.
   - Latest safe resolve phase: before v1 requirements lock.
   - Stop-and-reopen condition: users will not adopt v1 without scan-generated config.
