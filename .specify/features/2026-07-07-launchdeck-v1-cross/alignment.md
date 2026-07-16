# Alignment: Launchdeck v1 Cross-Platform CLI Lifecycle Tool

## Current Understanding

Launchdeck v1 should be specified as a real local CLI tool, not as an agent skill wrapper. The core product contract is lifecycle control for arbitrary local software projects through explicit `.launchdeck.yml`: initialize, inspect, run, manage, log, stop, and safely clean.

The accepted v1 boundary is CLI-first, local, single-project, explicit-config, and cross-platform. All agent/MCP/UI/orchestration/discovery surfaces remain downstream or deferred.

## Confirmed Facts

- User confirmed the generated discussion handoff on 2026-07-07.
- Target implementation project is `F:/github/launchdeck`.
- Project memory requires specification-first delivery, scope discipline, test-backed changes, security by default, reversible delivery, evidence before completion, and no unrequested fallbacks.
- Project cognition compass returned `query_ready` and recommended minimal live reads: `src/runtime.js`, `src/cli.js`, and `test/cli.test.js`.
- Live repository evidence confirms a Node ESM CLI package with config, runtime, CLI, docs, dogfood config, and tests already present.

## Assumptions

- Node remains acceptable as the first runtime and packaging path unless later packaging/release work changes that decision.
- The current codebase is a starting implementation surface, but the spec owns product behavior and compatibility.
- No planning-critical ambiguity remains before `/sp.plan`; all recorded unknowns are either implementation-lock or release-lock details.

## Semantic Term Decisions

| Term | Possible Meanings | Selected Meanings | Excluded Meanings | User Confirmation |
| --- | --- | --- | --- | --- |
| universal project lifecycle tool | any project at any scale; local project control; cloud orchestration | Local single-project lifecycle control for arbitrary stacks via explicit config. | Cloud runner, CI/CD replacement, workspace graph orchestrator. | User-confirmed handoff. |
| cross-platform | install everywhere; identical commands; validated lifecycle behavior on Windows/macOS/Linux | Same user-visible lifecycle semantics on Windows, macOS, and Linux with OS-specific adapters and release claim evidence. | Claiming cross-platform from one OS or mocked behavior only. | User confirmed cross-platform as core. |
| manage process | start process only; full inspect/log/stop/recover lifecycle | Managed long-running task records, logs, liveness refresh, stop/restart, stale-state handling. | Detached untracked background process. | Requirements and handoff. |
| safe clean | delete caches; reset project; remove arbitrary paths | Dry-run by default, configured safe/risky targets, project-local containment, explicit risky confirmation. | Destructive reset, database/container volume reset, credential deletion. | Clean decision and handoff. |
| explicit config | user-written file; generated-only file; auto-discovered runtime | `.launchdeck.yml v1` is the source-of-truth protocol, editable and readable. | Opaque inference or automatic discovery as default. | Protocol decision and handoff. |
| agent-readable output | future agent-only API; parseable CLI JSON | Stable JSON envelope, structured errors, process/log/clean fields for automation and future integrations. | Human text parsing as compatibility surface. | JSON/error decision and handoff. |

## Upstream Intent Disposition

| Signal | Source | Disposition | Artifact Location | User Confirmed | Reopen Trigger |
| --- | --- | --- | --- | --- | --- |
| universal lifecycle control tool | handoff goal, requirements.md | preserved | spec.md Overview | yes | Product reframed as skill-only or task-runner-only. |
| local single-project v1 | handoff scope, requirements.md | preserved | spec.md Confirmed Scope | yes | Need workspace graph orchestration in v1. |
| cross-platform Windows/macOS/Linux | user discussion, handoff, requirements.md | in_scope | spec.md NFRs and Acceptance Proof | yes | Any platform is demoted from first-class support. |
| `.launchdeck.yml v1` explicit protocol | requirements.md, handoff | in_scope | spec.md FR-001 through FR-010 | yes | Auto-discovery replaces explicit config. |
| `init` creates config | requirements.md#init-contract | in_scope | spec.md FR-011 through FR-013 | yes | Onboarding must be scan/template-first. |
| `doctor` read-only readiness | requirements.md#doctor-contract | in_scope | spec.md FR-014 through FR-016 | yes | Doctor mutates or lacks stable findings. |
| `tasks` read-only inventory | requirements.md#tasks-contract | in_scope | spec.md FR-017 through FR-019 | yes | Tasks executes or hides risk/type metadata. |
| `run <task>` universal executor | requirements.md#execution-command-contract | in_scope | spec.md FR-020 through FR-022 | yes | Execution semantics no longer follow metadata. |
| `longRunning` managed execution | requirements.md | in_scope | spec.md FR-021 through FR-026 | yes | Managed state inferred opaquely. |
| `dev`, `start`, `restart` managed commands | requirements.md | in_scope | spec.md FR-023 through FR-026 | yes | Multi-instance support becomes v1 requirement. |
| `ps`, `logs`, `stop` recovery | requirements.md#managed-runtime-recovery-contract | in_scope | spec.md FR-027 through FR-034 | yes | Inspection commands delete state or logs. |
| clean dry-run/safe/all | requirements.md#clean-contract | in_scope | spec.md FR-035 through FR-041 | yes | Clean becomes reset-like or out-of-root. |
| JSON envelope and stable errors | requirements.md, technical-options.md | in_scope | spec.md FR-042 through FR-051 | yes | Human text becomes only parseable surface. |
| error code vocabulary | requirements.md#v1-error-code-vocabulary | in_scope | spec.md Error and JSON requirements | yes | Common failures fall into `internal_error`. |
| runtime adapter boundary | technical-options.md | preserved | spec.md NFRs, context.md Integration Boundaries | yes | Platform checks spread and change semantics. |
| release claim levels | requirements.md#verification-matrix-contract | in_scope | spec.md Acceptance Proof | yes | Cross-platform-ready claimed without all-OS smoke. |
| `init --scan` | handoff deferred scope | deferred | spec.md Deferred Or Future Scope | yes | Zero-config onboarding required for v1 adoption. |
| `init --template <name>` | handoff deferred scope | deferred | spec.md Deferred Or Future Scope | yes | Starter config pressure requires templates. |
| `doctor --suggest` | handoff deferred scope | deferred | spec.md Deferred Or Future Scope | yes | Validation without guidance blocks adoption. |
| platform override implementation | handoff deferred scope | deferred | spec.md Deferred Or Future Scope | yes | Common projects cannot express commands portably. |
| GUI/TUI | handoff out-of-scope | deferred | spec.md Out of Scope | yes | User asks for dashboard or terminal UI. |
| MCP/agent skill | handoff out-of-scope/deferred | deferred | spec.md Out of Scope and Deferred | yes | CLI/protocol stable and integration requested. |
| monorepo orchestration | handoff out-of-scope | deferred | spec.md Out of Scope | yes | Target users need multi-package fan-out. |
| destructive reset | clean discussion | deferred | spec.md Out of Scope | yes | Reset behavior is explicitly requested as separate contract. |
| native installers | handoff out-of-scope/deferred | deferred | spec.md Deferred | yes | Packaging/release requires standalone distribution. |
| multi-instance managed tasks | open-questions.md | deferred | spec.md Out of Scope | yes | Users need same task with different args/env/ports. |

## Out-Of-Scope Conflicts

No unresolved conflicts. The apparent broad "any project" language is preserved as stack-agnostic local project support, while cloud/remote/orchestration surfaces are user-confirmed out of v1.

## Discussion Decision Digest

### Locked Direction

- CLI-first lifecycle control is selected.
- `.launchdeck.yml v1` is the source-of-truth protocol.
- Cross-platform lifecycle behavior is core.
- JSON/errors are compatibility surfaces.
- Runtime state/logs are recovery surfaces.

### Rejected Alternatives

| Alternative | Rejection Reason | Source | Reopen Condition |
| --- | --- | --- | --- |
| Skill-only product | Tool is the core; skill is a later integration layer. | discussion-log.md, handoff | User changes product back to agent-only. |
| Agent/MCP-first | Would couple core lifecycle behavior to a consumer layer. | technical-options.md | CLI/protocol stable and integration requested. |
| Auto-discovery-first | Discovery mistakes are dangerous for process start and clean behavior. | technical-options.md | Explicit config blocks adoption. |
| Native binary first | Larger early scope and does not remove semantic design needs. | technical-options.md | Node runtime cannot satisfy process/platform requirements. |
| Task-runner compatible protocol | May dilute process/log/cleanup semantics. | technical-options.md | Ecosystem compatibility becomes a v1 requirement. |

### Accepted Tradeoffs

- Hand-written config first: safer than confident but wrong inference.
- Node CLI first: practical for the existing repo, with packaging decisions deferred.
- Shell string commands in v1: stack-agnostic, but requires platform adapter boundaries and warnings.
- Cross-platform claim discipline: slower release confidence, but protects trust.

### Experience Commitments

- Primary CLI path: `init`, `doctor`, `tasks`, `run`, managed `dev/start`, `ps`, `logs`, `stop`, `clean`, `clean --safe`.
- User-visible defaults favor inspection before mutation.
- No UI/TUI shell in v1.

### Review Criteria Carried Forward

- Preserve target project root.
- Preserve v1 scope.
- Preserve deferred surfaces.
- Preserve Must-Preserve Ledger and consequence obligations.
- Return to discussion if scope changes back to skill-first, cleanup becomes reset, cross-platform support is demoted, explicit config is dropped, JSON/error compatibility is dropped, or target project root changes.

### Must Not Dilute

- Do not turn Launchdeck into a thin command shortcut layer.
- Do not replace managed runtime behavior with untracked background process launching.
- Do not turn safety checks into documentation-only warnings.
- Do not treat cleanup as reset.
- Do not claim cross-platform readiness without platform smoke evidence.

## Must-Preserve Coverage

All `MP-001` through `MP-016` are preserved in `spec.md`. No must-preserve item is dropped or clarification-blocked.

## Senior Consequence Analysis

### Affected Object Map

- CLI commands and human/JSON output.
- `.launchdeck.yml` config files.
- Task declarations and risk metadata.
- Long-running child processes.
- `.launchdeck/runtime/state.json`.
- `.launchdeck/logs/`.
- Safe and risky cleanup paths.
- Platform runtime adapters.
- Downstream scripts, CI, future agents, and future UI/MCP wrappers.

### State-Behavior Matrix

| State | Required Behavior |
| --- | --- |
| no config | `doctor` fails with `config_not_found`; `init` can create config. |
| existing config | `init` fails with `config_exists` unless overwrite is explicit. |
| invalid config | affected execution blocked with stable config/task error. |
| ready config | `doctor` ok/warn, `tasks` lists configured capabilities. |
| foreground running | `run` streams output and preserves child exit code. |
| managed running | state/logs created before claiming start success. |
| duplicate managed start | fail with `process_already_running`. |
| stopped or stale process | remains visible through `ps`, logs remain readable when present. |
| stop failed | report failure and preserve state/logs. |
| missing log | report `log_not_found` without crashing. |
| dry-run clean | preview only. |
| safe clean | remove only safe targets. |
| risky clean without confirmation | fail with `confirmation_required`. |
| unsafe clean target | refuse root/out-of-root/ambiguous target. |
| platform unsupported stop | report platform-specific failure, not false success. |

### Dependency Impact Table

| Surface | Direct Dependencies | Indirect Consumers | Compatibility Risk |
| --- | --- | --- | --- |
| Config schema | config loader, doctor, tasks, run, clean | docs, examples, future integrations | schema drift. |
| Runtime state | start, restart, ps, logs, stop, clean | future agents, support/debug flows | lost recovery evidence. |
| Clean safety | config, path adapter, filesystem adapter | developer files, source tree | destructive deletion. |
| JSON output | every CLI command | scripts, CI, agents | brittle automation. |
| Error codes | error handling, docs, tests | user support and automation | unclassified failures. |
| Platform adapters | process/path/shell/fs/log capabilities | release claims | OS-specific behavior divergence. |

### Recovery And Validation Contract

- Rollback: source/runtime behavior is not changed by this spec. Implementation should keep changes narrowly staged by command surface.
- Retry: foreground task failures preserve child exit; managed start/restart failures report inspectable error state.
- Idempotency: `stop` should be idempotent; `clean` should skip missing targets.
- Cleanup: runtime state/log cleanup must occur only through configured clean targets or future prune.
- Migration: v1 has no schema migration engine; breaking schema changes must be explicit future work.
- Observability: every managed process has a log path and state record.
- Validation: unit checks, CLI JSON parseability, lifecycle smoke, unsafe clean refusal, and OS-specific process/path behavior.

### Coverage Gaps

| Gap | Owner | Latest Resolve Phase | Stop-And-Reopen Condition | Routing |
| --- | --- | --- | --- | --- |
| Exact JSON schemas | plan/implementation | before output compatibility lock | consumers cannot branch reliably | continue with contract. |
| Exact doctor finding codes | plan/implementation | before doctor lock | tools parse human messages | continue with contract. |
| Symlink/junction cleanup semantics | plan/implementation | before clean lock | syntactic-inside path resolves outside | continue with contract. |
| Native process strategy | plan/implementation | before runtime lock | initial stop leaves child processes | continue with adapter contract. |
| CI platform provider | plan/release | before release workflow lock | no reliable all-OS evidence | continue with claim-level contract. |

### Consequence Obligations

`CA-001` through `CA-022` are preserved in `spec.md#consequence-analysis` and `context.md#consequence-notes`.

## Readiness Decision

- coverage_status: complete
- planning_gate_status: ready
- hard_unknown_count: 0
- open_conflict_count: 0
- readiness_decision: Aligned: ready for plan
- single_next_command: `/sp.plan`

## Outstanding Soft Unknowns

- Exact command-specific JSON schemas.
- Exact doctor finding code names.
- Exact verbose `tasks` output.
- Exact partial restart/stop failure payloads.
- Exact corrupt runtime state behavior.
- Exact clean action values.
- Exact symlink/junction canonicalization rules.
- Exact shell override fields.
- Exact native process strategy per platform.
- Exact CI provider or local platform execution setup.
- Exact smoke artifact format.
- Exact starter config shape.
- Exact global `--cwd` syntax and placement.
- Exact public error documentation format.
