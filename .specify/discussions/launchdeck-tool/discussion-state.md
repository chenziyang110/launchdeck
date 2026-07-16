# Discussion State: Launchdeck Tool

## Current Command

- active_command: sp-discussion
- state_surface: discussion-state
- status: completed
- slug: launchdeck-tool
- updated_at: 2026-07-07T10:51:43.9189243+08:00
- closed_at: none
- archived_at: none

## Phase Mode

- phase_mode: discussion-only
- summary: The discussion has shifted from a skill suite idea to building Launchdeck as a universal local project lifecycle control tool. The current repository is the implementation target unless the user overrides that boundary.

## Session Routing

- current_stage: consumed-by-specify
- current_topic: universal project lifecycle control tool
- frontstage_reply_contract: unified
- visible_reply_mode: standard
- backstage_state_visibility: summarized
- question_pack_mode: none
- decision_advancement_mode: recommendation-first
- primary_question: none
- optional_followups: []
- recommendation_required_for_choices: true
- blocker_reason: none
- readiness_note: Formal handoff assessment completed. Unified handoff Markdown/JSON pair passed self-review and has been confirmed by the user for downstream consumption.
- ui_discussion_status: not_applicable

## Advisor Contract

- truth_pass_status: complete
- verified_project_facts:
  - The current project root is `F:/github/launchdeck`.
  - `package.json` defines a Node ESM CLI package named `launchdeck` with bin `launchdeck: ./src/cli.js`, scripts `check` and `test`, dependency `yaml`, and Node engine `>=20`.
  - `README.md` frames Launchdeck as a universal lifecycle control tool using `.launchdeck.yml`.
  - `.launchdeck.yml` dogfoods setup, test, lint, safe clean, and risky clean declarations.
  - `src/cli.js` currently exposes init, doctor, lifecycle task aliases, run, dev/start/restart, ps, logs, stop, and clean.
  - `src/runtime.js` manages `.launchdeck/logs`, `.launchdeck/runtime/state.json`, detached long-running tasks, PID refresh, stop, log tail, and inside-project clean path checks.
  - `src/config.js` loads Launchdeck config files upward from cwd and normalizes task, env, port, risk, and clean declarations.
- open_assumptions:
  - Node remains the first implementation runtime unless the user requests a different distribution/runtime strategy.
  - The first product boundary remains local project lifecycle control, not cloud orchestration.
  - Agent integration remains a consumer layer over the CLI/protocol, not the core product itself.
- evidence_checked:
  - `.specify/memory/project-rules.md`
  - `.specify/memory/learnings/INDEX.md`
  - `.specify/project-cognition/status.json`
  - `project-cognition compass --intent discussion --query "we first build this tool" --format json`
  - `package.json`
  - `README.md`
  - `.launchdeck.yml`
  - `src/cli.js`
  - `src/runtime.js`
  - `src/config.js`
- advice_confidence: high
- discussion_compass_status: current
- current_decision_frame: Build Launchdeck as a CLI-first lifecycle control tool for any local software project, with agent integrations as downstream adapters.
- confirmed_decisions:
  - Product is a universal tool, not only an agent skill.
  - Core domain is project lifecycle control: discover/configure, run, test, stop, logs, clean, and safe state handling.
  - Current repository is the target implementation boundary by default.
  - Cross-platform support is a core product requirement, not a later nice-to-have.
  - Cross-platform behavior should be a platform-neutral product contract backed by OS-specific runtime adapters.
  - `.launchdeck.yml v1` should stay small, explicit, readable, and stable; automatic discovery should propose config later rather than replace the protocol.
  - CLI first-run defaults are confirmed: editable init, safety-focused doctor, read-only tasks, dry-run clean, and deferred platform override implementation.
  - `doctor` should remain read-only and classify findings as error, warn, or info with stable codes.
  - `tasks` should remain read-only and list configured capabilities with risk, managed/command type, ports, and command text.
  - Execution semantics should be driven by `longRunning`; `run` respects metadata, while `dev`, `start`, and `restart` operate on managed tasks.
  - `ps`, `logs`, and `stop` should preserve inspectable runtime state and help users recover control of managed processes.
  - `clean` should remain conservative project-local generated-state cleanup, default to dry-run, and stay separate from future destructive reset behavior.
  - Platform-sensitive runtime behavior should be isolated behind adapters for path, shell, process, executable lookup, cleanup, and logs.
  - Release claims should be verification-level based, with cross-platform-ready requiring lifecycle smoke evidence on Windows, macOS, and Linux.
  - `init` should create an explicit editable `.launchdeck.yml`; scan/template inference should remain advisory and deferred.
  - Normal commands should discover nearest config upward from target cwd; `init` should write to target cwd and avoid ancestor overwrite.
  - JSON output should be a stable compatibility surface; v1 exit codes should stay simple while preserving foreground child exit codes.
  - v1 error codes should be stable, actionable, snake_case, and grouped by user-action domain.
  - v1 scope should remain local, single-project, CLI-first, explicit-config lifecycle control.
  - Pre-handoff readiness preview: no hard blockers remain for a formal `sp-specify` handoff if the user explicitly requests it.
- changed_recommendations:
  - Moved from skill-suite-first to tool-first with skill/MCP as integration layers.
- next_discussion_paths:
  - Lock the first coherent product boundary.
  - Preserve consequence obligations for process, cleanup, logs, config, and agent-readable output.
  - Preserve cross-platform behavior requirements across Windows, macOS, and Linux.
  - Preserve `.launchdeck.yml v1`, long-running task, cleanup, platform override, JSON output, and error vocabulary contracts.
  - Preserve CLI first-run experience and safety defaults.
  - Preserve `doctor` severity model and read-only behavior.
  - Preserve `tasks` read-only inventory behavior and predictable ordering.
  - Preserve execution command semantics, exit code behavior, and duplicate managed process rules.
  - Preserve managed runtime recovery semantics for ps/logs/stop.
  - Preserve clean safety model and clean/reset separation.
  - Preserve cross-platform runtime adapter boundary and validation expectations.
  - Preserve verification matrix and release claim levels.
  - Preserve init as conservative config creation, not command execution or authoritative inference.
  - Preserve deterministic project root, task cwd, runtime state, and monorepo-lite semantics.
  - Preserve global JSON envelope, structured errors, partial failure semantics, and exit code stance.
  - Preserve v1 error code vocabulary and stability rules.
  - Preserve v1 scope boundary and deferred surfaces.
  - Preserve pre-handoff readiness: likely recommended consumer is `sp-specify`, not `sp-quick`, because the feature spans CLI command semantics, runtime behavior, safety, cross-platform verification, and compatibility contracts.
  - When requested, run handoff assessment before drafting a handoff pair.

## Context Boundary

- context_boundary_status: locked
- current_project_root: F:/github/launchdeck
- current_project_roles:
  - role: implementation target
    scope: Launchdeck CLI, protocol docs, examples, schema, and local lifecycle runtime.
    evidence_source: live repository reads on 2026-07-06.
    notes: Current repository is treated as the product implementation target unless the user overrides it.
- target_project_root: F:/github/launchdeck
- target_project_roles:
  - role: implementation target
    scope: Same as current project.
    evidence_source: active workspace and live repository reads.
    notes: No separate external target is currently in scope.
- reference_sources:
  - prior user discussion about project lifecycle skill/tool direction
  - existing Launchdeck README and v0.1 protocol draft
- external_systems: []
- boundary_blockers: []
- path_status: target-read-confirmed
- boundary_confidence: high

## Evidence Navigation

- latest_cognition_intent: discussion
- latest_cognition_readiness: query_ready
- latest_minimal_live_reads: []
- latest_live_evidence:
  - package.json
  - README.md
  - .launchdeck.yml
  - src/cli.js
  - src/runtime.js
  - src/config.js
- cognition_authority_rule: project cognition navigates; live repository evidence proves
- truth_pass_authority_rule: verify current-project facts with live evidence before technical advice
- unresolved_evidence_conflicts: []

## Senior Consequence Analysis

- consequence_gate_status: triggered
- trigger_reason: Tool semantics affect lifecycle operations, long-running processes, cleanup/deletion behavior, shared runtime state, compatibility, and downstream agent consumers.
- stand_down_reason: none
- active_consequence_obligations:
  - CA-001: Launchdeck must not make destructive cleanup implicit.
  - CA-002: Long-running processes must be inspectable and stoppable through Launchdeck state.
  - CA-003: Agent-readable output must preserve enough structure for recovery and diagnosis.
  - CA-004: The config protocol must remain stack-agnostic and local-project scoped.
  - CA-005: Runtime state and logs must be observable and safe to clean.
  - CA-006: Windows, macOS, and Linux must be first-class supported platforms for lifecycle behavior.
  - CA-007: OS-specific behavior must be isolated behind a product-preserving runtime boundary.
  - CA-008: `.launchdeck.yml v1` must remain small, explicit, readable, and stable enough for agents to rely on.
  - CA-009: JSON output and error categories must be treated as compatibility surfaces for agents.
  - CA-010: The CLI first-run flow must prioritize inspection and recoverability before mutation.
  - CA-011: `doctor` must remain read-only and classify findings with stable severity and codes.
  - CA-012: `tasks` must remain read-only and expose risk, managed/command type, ports, and command text before execution.
  - CA-013: Execution commands must respect `longRunning`, avoid implicit duplicate starts, preserve child exit codes for foreground tasks, and keep managed state inspectable after start/restart failures.
  - CA-014: Managed runtime commands must preserve inspectable state and logs across running, stopped, stale, missing-log, and stop-failed cases.
  - CA-015: `clean` must default to dry-run, separate safe and risky targets, refuse project-root/out-of-root deletion, and remain distinct from destructive reset behavior.
  - CA-016: Platform-sensitive behavior must be isolated behind runtime adapters for path, shell, process, executable lookup, cleanup, and logs, with validation evidence on Windows, macOS, and Linux before cross-platform release claims.
  - CA-017: Release claims must name the verification level achieved, and cross-platform readiness requires lifecycle smoke evidence on Windows, macOS, and Linux.
  - CA-018: `init` must create an explicit editable config without executing project commands, must not silently overwrite existing configs, and must keep scan/template inference advisory.
  - CA-019: Target cwd, config discovery, project root, task cwd, and runtime state location must be deterministic and visible, with `init` protected from accidental ancestor overwrite.
  - CA-020: JSON output must use a stable envelope and error object, while exit codes remain simple and preserve child process exit codes for foreground tasks.
  - CA-021: v1 error codes must be stable, actionable, snake_case, and grouped by user-action domain; `internal_error` should be rare and treated as a classification gap.
  - CA-022: v1 scope must remain local, single-project, CLI-first, explicit-config lifecycle control; deferred integrations and orchestration must not dilute the core lifecycle contracts.
- coverage_gap_count: 5

## Handoff

- handoff_assessment_status: ready-for-specify
- handoff_assessment_path: .specify/discussions/launchdeck-tool/handoff-assessment.md
- handoff_assessment_decided_at: 2026-07-06T19:00:15.2357122+08:00
- handoff_scope_shape: unified
- handoff_review_status: user-confirmed
- handoff_quality_gate: ready
- handoff_to_specify: .specify/discussions/launchdeck-tool/handoff-to-specify.md
- handoff_to_specify_json: .specify/discussions/launchdeck-tool/handoff-to-specify.json
- handoff_kind: discussion_requirement_contract
- handoff_goal: Specify Launchdeck v1 as a cross-platform CLI tool that can initialize, inspect, run, manage, log, stop, and safely clean local software projects through an explicit `.launchdeck.yml` lifecycle protocol.
- consumer_eligibility: sp-specify=ready; sp-quick=not-recommended
- recommended_consumer: sp-specify
- quick_task_candidate_status: requires-spec-first
- quality_gate_status: user_confirmed
- user_review_required: false
- user_confirmed_at: 2026-07-07T10:51:43.9189243+08:00
- handoff_requested_by_user: true
- handoff_requested_at: 2026-07-06T19:00:15.2357122+08:00
- handoff_confirmed_at: 2026-07-07T10:51:43.9189243+08:00
- handoff_consumption_status: consumed
- consumed_by_feature_dir: F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross
- consumed_at: 2026-07-07T10:51:43.9189243+08:00
- consumption_mark_method: manual-fallback-specify-discussion-command-unavailable
- next_command: none
