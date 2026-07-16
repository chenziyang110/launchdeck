---
id: "2026-07-09"
slug: "agent-installer-cli"
title: "Add Launchdeck agent skill installer CLI"
status: resolved
trigger: "$sp-quick 做 after deciding Launchdeck needs an installer for skills across agent tools and paths"
understanding_confirmed: true
execution_model: subagent-mandatory
dispatch_shape: one-subagent
execution_surface: native-subagents
created: "2026-07-09"
updated: "2026-07-09"
---

## Discussion Handoff Source
<!-- agent-fill:discussion_handoff_source -->

handoff_consumer: none
source_discussion_slug: none
source_handoff_md: none
source_handoff_json: none
source_files_read: []
locked_direction: []
must_preserve: []
reopen_conditions: []
quick_task_candidate:
  bounded_scope:
    - Add a small Launchdeck CLI surface for agent skill installation and path discovery.
    - Use .agents/skills/launchdeck-agent as the canonical source package.
    - Support safe copy/install behavior for known local agent host targets without deleting files.
    - Cover read-only dry-run/doctor behavior and overwrite protection with tests.
  excluded_scope:
    - No MCP server implementation or MCP config mutation.
    - No remote marketplace/search/publish feature.
    - No lifecycle run/start/stop runtime behavior changes.
    - No background services or demo process mutation.
  validation_route:
    - Add targeted CLI/unit tests for path discovery, dry-run, install, and conflict handling.
    - Run the smallest relevant test command first, then broader project checks if feasible.
    - Run project cognition closeout update for changed CLI/docs/test surfaces.

## Current Focus
<!-- agent-fill:current_focus -->

goal: "Add a bounded cross-agent skill installer command surface to Launchdeck CLI."
current_focus: "Resolved: v0 Launchdeck agent installer CLI implemented, leader-reviewed, validated, and project cognition refreshed."
next_action: "Use SUMMARY.md for review or continue with a follow-up feature such as more adapters or install packaging."

## Execution Intent
<!-- agent-fill:execution_intent -->

intent_outcome: "Users can run Launchdeck CLI to discover where the launchdeck-agent skill would be installed, verify the canonical skill package, and install/sync it safely into a chosen local agent host target."
intent_constraints:
  - "Canonical source remains .agents/skills/launchdeck-agent."
  - "Host-specific directories are install/sync targets, not product source."
  - "Installer must be cross-platform JavaScript, not PowerShell-only."
  - "Installer must not delete target files and must not overwrite divergent existing skills unless explicitly forced."
  - "Default behavior should be concise and machine-readable with --json/--compact where current CLI patterns support it."
success_evidence:
  - "CLI exposes agent path/doctor/install behavior in the existing command style."
  - "Tests prove dry-run, successful copy, already-installed, and conflict/refuse-overwrite cases."
  - "Docs describe project/user scope and known agent host destinations without implying marketplace support."
cognition_facts:
  selected_capability: "launchdeck-agent canonical skill source and agent host sync convention"
  minimal_reads:
    - ".planning/quick/2026-07-09-agent-skill-canonical-path"
    - ".agents/README.md"
    - ".agents/skills/launchdeck-agent/SKILL.md"
  validation_route: "live CLI/test evidence plus project cognition closeout"
  known_risk: "Project cognition is usable but still only partial for installer scope; live CLI/test inspection must decide final edit locations."

## Understanding Checkpoint
<!-- agent-fill:understanding_checkpoint -->

checkpoint:
  issue: "We have a canonical launchdeck-agent skill under .agents/skills, but users still need a product-level way to install or sync that skill into the agent tool they actually use. A PowerShell sync script is useful for this repo, but it is not a cross-platform Launchdeck CLI capability. This task is not asking to build MCP, a marketplace, or change project start/stop/runtime management."
  issue_detail: "The installer should make the path problem explicit: show known destinations, verify the canonical skill package, and copy it safely into selected host directories without treating host folders as source of truth."
  expected_or_target: "Add a v0 `launchdeck agent` CLI surface for paths/doctor/install that manages the Launchdeck agent skill package from .agents/skills/launchdeck-agent."
  known_facts:
    - ".agents/skills/launchdeck-agent is the project-owned canonical skill source."
    - "Host-specific directories such as .codex/skills are generated or synced targets."
    - "Prior discussion identified a skill installer as the missing bridge between CLI product and agent adoption."
    - "Project cognition returned query_ready/usable_with_review and pointed to .agents README, the canonical SKILL.md, and the previous quick task."
  unknowns_or_risks:
    - "Exact adapter path matrix must be encoded conservatively and documented as known local targets, not universal truth for every future agent."
    - "User-scope installs write under a home directory, so tests should isolate paths and CLI should require explicit --scope user."
    - "If current CLI parser/output conventions conflict with the planned command names, implementation should follow existing style while preserving the capability."
  will_change:
    - "src CLI command routing and a small installer/helper module if the repo structure supports it."
    - "test coverage for the new agent installer behavior."
    - "README or .agents docs for using the installer."
    - ".planning/quick/2026-07-09-agent-installer-cli artifacts."
  will_not_change:
    - "Launchdeck lifecycle run/start/stop/force-stop semantics."
    - ".launchdeck runtime state or demo services."
    - "MCP server behavior or remote registry publishing."
    - "Canonical skill source path under .agents/skills/launchdeck-agent."
  in_scope:
    - "`launchdeck agent paths` or equivalent read-only path discovery."
    - "`launchdeck agent doctor` or equivalent validation of canonical skill source and supported target availability."
    - "`launchdeck agent install --agent <known-host> --scope project|user` with dry-run and force/overwrite protection."
    - "Concise JSON/compact output for agent-friendly consumption where current CLI conventions allow it."
  out_of_scope:
    - "Auto-installing into every detected tool without user-selected target."
    - "Remote search/install/update/publish like a full skill registry."
    - "Writing MCP configs or agent global config files beyond copying the skill directory."
  affected_surfaces:
    - "Launchdeck CLI command surface."
    - "Filesystem copy/install semantics."
    - "Agent skill packaging docs."
    - "Tests and project cognition index."
  execution_approach: "one native subagent executor completed lane-001; leader owns scope, integration, validation, and STATUS.md."
  implementation_plan:
    - "Inspect existing CLI routing, option parsing, output, and test patterns."
    - "Add focused tests for agent path discovery, dry-run plan, successful install into a temp target, already-installed no-op, and divergent target conflict."
    - "Implement a small adapter registry plus safe recursive copy planner using Node standard library."
    - "Wire the CLI subcommands in the existing style with concise JSON/compact output."
    - "Update docs, run targeted and broader validation, then refresh project cognition and write SUMMARY.md."
  next_action: "After user confirmation, inspect src/test command patterns and dispatch one bounded implementation worker."
  validation_evidence:
    - "Targeted Node test file for agent installer behavior."
    - "Existing npm test/check commands as feasible after targeted tests pass."
    - "Manual dry-run command against the repository without mutating host directories."
    - "Project cognition closeout result for changed paths."
  stop_condition: "If implementation requires broad agent-host configuration policy, remote registry semantics, destructive target cleanup, or unresolved user-scope path decisions beyond a conservative known-target matrix, stop and escalate to sp-specify."
  done_or_progress_signal: "resolved with leader review, tests, check, full suite, manual CLI verification, and project cognition complete-refresh"
  user_corrections: []

## Execution
<!-- agent-fill:execution -->

active_lane: "lane-001-agent-installer-cli"
join_point: "closed"
blockers: []
blocked_dispatch:
  status: none
  reason: ""
lanes:
  - id: lane-001-agent-installer-cli
    owner: executor
    write_scope:
      - src/**
      - test/**
      - README.md
      - .agents/**
      - .planning/quick/2026-07-09-agent-installer-cli/**
    result_path: .planning/quick/2026-07-09-agent-installer-cli/worker-results/lane-001.json
    status: completed
retry_attempts: 0
recovery_action: "Resolved; reopen this quick task only if installer CLI regressions or path-policy corrections are requested."
blocker_reason: ""

## Validation
<!-- agent-fill:validation -->

validation_evidence:
  - "node --test test/agent-installer.test.js -> passed: 7 tests"
  - "npm run check -> passed"
  - "node src/cli.js agent paths --json --compact -> passed: canonical source and 8 scoped targets"
  - "node src/cli.js agent doctor --json --compact -> passed: 3 checks, 0 errors"
  - "node src/cli.js agent install --agent claude-code --target <temp> --dry-run --json --compact -> passed: compact action counts plus relative files only"
  - "npm test -> passed: 148 tests"
  - "project-cognition update --payload-file .specify/project-cognition/updates/sp-quick-closeout.json --reason workflow-finalize --format json -> update_id=upd-20260709T140543.951417000Z, partial_refresh recorded"
  - "project-cognition complete-refresh --format json -> fresh, query_ready, dirty=false"
unverified_surfaces:
  - "Real user/home agent directories were not mutated; tests used temp --target directories."
  - "MCP, marketplace, remote publish/search/update were intentionally out of scope."
terminal_status: resolved

## Summary Pointer
<!-- agent-fill:summary_pointer -->

summary_path: ".planning/quick/2026-07-09-agent-installer-cli/SUMMARY.md"
resume_decision: "resolved"
changed_code_paths:
  - "src/agent-installer.js"
  - "src/cli.js"
  - "src/errors.js"
  - "src/output.js"
  - "test/agent-installer.test.js"
  - "test/cli-contract.test.js"
  - "README.md"
  - ".agents/README.md"
  - "package.json"
  - ".planning/quick/2026-07-09-agent-installer-cli/STATUS.md"
  - ".planning/quick/2026-07-09-agent-installer-cli/SUMMARY.md"
  - ".planning/quick/2026-07-09-agent-installer-cli/worker-results/lane-001.json"
  - ".specify/project-cognition/updates/sp-quick-closeout.json"
changed_behavior_surfaces:
  - "CLI command surface: launchdeck agent paths/doctor/install"
  - "Filesystem install planner: safe copy, dry-run, idempotency, conflict refusal, force overwrite without deletion"
  - "Compact JSON envelope fields for agent installer output, tightened to summarize install actions without verbose absolute copy paths"
  - "README command and adapter matrix documentation"
  - ".agents README cross-platform CLI guidance"
  - "Package check script explicit file list"
project_cognition_refresh:
  status: fresh
  evidence:
    - "entry compass readiness=query_ready; compass_state=usable_with_review; baseline_kind=greenfield_empty"
    - "workflow-finalize update_id=upd-20260709T140543.951417000Z result_state=partial_refresh"
    - "complete-refresh returned freshness=fresh readiness=query_ready dirty=false"

## Senior Consequence Analysis
<!-- agent-fill:senior_consequence_analysis -->

affected_objects:
  - "Canonical skill package: .agents/skills/launchdeck-agent/**"
  - "CLI command surface: launchdeck agent paths/doctor/install or existing-style equivalents"
  - "Filesystem targets: project/user agent skill directories"
  - "Downstream consumers: humans and agents using Launchdeck CLI for local skill setup"
state_behavior_matrix:
  - "missing source: doctor/install must fail with actionable error instead of creating partial targets."
  - "missing target: install may create target directories for explicit destination."
  - "existing same target: install should no-op or report already-installed."
  - "existing divergent target: install must refuse unless --force is supplied."
  - "existing non-directory target: install must refuse even with --force."
  - "dry-run: report planned writes without mutation."
  - "unsupported adapter/scope: fail clearly and list supported choices."
  - "partially copied target: recovery should be rerun install with no delete; --force may repair when user explicitly chooses it."
dependency_impact:
  - "Direct dependency: Node fs/path/os utilities and existing CLI option/output helpers."
  - "Indirect consumers: launchdeck-agent skill docs, agent onboarding docs, future MCP/plugin packaging."
  - "Compatibility surface: CLI command names/options and JSON output shape."
  - "Validation route: targeted CLI/unit tests plus docs and project cognition closeout."
recovery_and_validation:
  - "Rollback: revert added CLI/helper/test/doc changes; no runtime state should be changed by tests."
  - "Idempotency: reinstall same skill should be stable and not duplicate data."
  - "Cleanup: tests must use temp directories or dry-run so user host directories are not modified."
  - "Observability: JSON output should include status, source, target, scope, agent, and concise actions/errors."
coverage_gaps:
  - "Exact path conventions for every possible agent tool are not universally stable; v0 will encode only known/conservative adapters and document the matrix."
  - "User-scope installs can affect real home directories; v0 must keep them explicit and test with isolated env/path overrides where possible."
project_cognition_evidence:
  - "compass readiness=query_ready"
  - "minimal_live_reads=.planning/quick/2026-07-09-agent-skill-canonical-path, .agents/README.md, .agents/skills/launchdeck-agent/SKILL.md"
  - "previous quick summary confirms .agents is canonical and .codex is a generated/synced target"
consequence_obligations:
  - id: CA-001
    claim: "Installer must not delete or silently overwrite host skill targets."
    affected_objects: ["filesystem targets", "user/project skill directories"]
    owner_workflow: sp-quick
    latest_resolve_phase: validation
    status: completed
    stop_and_reopen_condition: "Any required destructive cleanup or broad overwrite policy is discovered."
  - id: CA-002
    claim: "User-scope/home-directory writes require explicit scope and isolated tests."
    affected_objects: ["home skill directories", "test fixtures"]
    owner_workflow: sp-quick
    latest_resolve_phase: implementation
    status: completed
    stop_and_reopen_condition: "Current CLI cannot safely separate real home targets from test targets."
  - id: CA-003
    claim: "The adapter matrix must be conservative and documented as known local targets."
    affected_objects: ["CLI help/docs", "agent path registry"]
    owner_workflow: sp-quick
    latest_resolve_phase: closeout
    status: completed
    stop_and_reopen_condition: "Supporting additional agents requires unresolved external policy or host config writes."
escalation_decision: "continue in quick; bounded CLI/file-copy feature with no lifecycle runtime or MCP changes"
