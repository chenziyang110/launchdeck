# Handoff To Specify: Launchdeck Agent Skill Suite

- handoff_kind: discussion_requirement_contract
- discussion_slug: launchdeck-agent-skill-suite
- handoff_goal: Specify a v0 `launchdeck-agent` skill package that lets coding agents safely discover, adopt, operate, recover, observe, and clean local software projects through Launchdeck.
- status: handoff-ready
- created_at: 2026-07-09T16:29:56+08:00
- recommended_consumer: sp-specify

## Handoff Reviewer Guide

This handoff has been reviewed and confirmed as `handoff-ready`; use this guide to verify whether it still accurately captures the intended product direction if it is later repaired or re-reviewed.

Review first: Handoff Goal, Context Boundary, Implementation Target, Source Evidence, Blocking Unknowns, Downstream Instructions, Must-Preserve Ledger, and Consequence Obligations.

Approve only if the goal matches the user's intent, the target project is correct, no hard unknowns remain, the soft unknowns are safe to resolve during specification, and the Must-Preserve Ledger covers the decisions that would cause product or safety drift if lost.

Request changes if the target or evidence boundary is wrong, a safety rule is too weak, a non-goal is missing, the handoff asks downstream work to bypass Launchdeck, or the Markdown and JSON disagree on protected facts.

Do not over-review exact implementation filenames, final wording inside every reference file, or executable eval fixture mechanics unless they change the product boundary. Those are spec-stage details.

## Agent Requirement Contract

### Target Need

Agents should be able to respond to natural user requests such as "start this project", "run the dev server", "restart this service", "port 8888 is occupied", "show logs", or "clean build cache" by routing through Launchdeck instead of directly spawning commands or killing processes.

The v0 skill should help agents discover or reuse project lifecycle knowledge, persist it through `.launchdeck.yml` and Launchdeck registry state, operate via Launchdeck CLI commands, and avoid duplicate local services, port conflicts, stale state, and unsafe cleanup.

### Constraints

- Launchdeck is the execution authority.
- `.launchdeck.yml` is the lifecycle authority.
- The v0 deliverable is one `launchdeck-agent` skill package with references, not six public skills.
- Users should not need to name Launchdeck or choose a skill.
- Start, restart, stop, force-stop, inspect, logs, ports, reconcile, and clean behavior must use Launchdeck commands.
- Start/dev/run must observe existing state and declared ports before mutation.
- Stop/restart/force-stop require Launchdeck ownership proof.
- Unknown or external port occupants are inspect-only.
- Clean defaults to safe clean; risky clean requires explicit confirmation; reset is out of automatic scope.
- The skill must prefer `--json --compact` for agent-internal Launchdeck calls.
- The skill must not become a replacement process manager or bypass Launchdeck's safety model.

### Success Criteria

- An agent can enter an unknown local project, discover lifecycle candidates, create or propose `.launchdeck.yml`, run doctor, register the project, start exactly one managed service, inspect ports, read logs, stop the owned service, and recover stale state.
- A repeated start request reports the existing Launchdeck-managed run instead of starting a duplicate.
- A second agent or terminal sees the same Launchdeck state.
- External or unknown port occupants are inspected and reported, not killed.
- Stop/restart/force-stop happen only with Launchdeck ownership proof.
- Clean runs safe targets only by default and preserves logs/events, env/secrets, source/config files, databases, and user data.
- Skill evals prove correct trigger, non-trigger, behavior/safety, and compact-output behavior.

### Design Direction

Ship v0 as:

```text
launchdeck-agent/
  SKILL.md
  references/
    intent-routing.md
    adoption-flow.md
    discovery-rules.md
    command-flows.md
    recovery-playbooks.md
    clean-safety.md
    eval-prompts.md
```

`SKILL.md` should be short: trigger-rich frontmatter, route selection, and global safety rules. Detailed rules belong in references and should be loaded only when relevant.

### Optimal Solution Approach

Use a router skill with progressive disclosure. This preserves natural-intent routing while keeping runtime context small. It also avoids competing public skill descriptions before trigger behavior has been proven.

Do not add scripts in v0 unless evals show repeated discovery failures. If a script is later added, it must be read-only and emit candidate lifecycle facts only.

### Scope

In scope:

- `launchdeck-agent/SKILL.md`
- `references/intent-routing.md`
- `references/adoption-flow.md`
- `references/discovery-rules.md`
- `references/command-flows.md`
- `references/recovery-playbooks.md`
- `references/clean-safety.md`
- `references/eval-prompts.md`
- Documentation or README note only if needed to explain local usage.

Out of scope:

- GUI.
- MCP server.
- Separate public onboarding/operation/recovery/cleanup skills.
- Direct OS process killing.
- Production deployment management.
- Destructive reset automation.
- Replacing Launchdeck CLI behavior.

Deferred:

- Deterministic scanner scripts.
- Executable eval fixtures.
- Monorepo-first behavior beyond current-project root defaults.
- Ecosystem expansion beyond Node, Python, Docker Compose, and Make/Just/Taskfile.
- Splitting reference subflows into separate skills.

## Consumer Eligibility

- sp-specify: ready after user confirms this draft handoff.
- sp-quick: blocked; this is broader than a quick implementation because it defines a new skill package with multiple safety references and eval contracts.

Recommended consumer: `sp-specify`.

## Quick Task Candidate

- requires_spec_first: true
- reason: The work shapes an agent-facing safety contract and skill package. It should be specified before implementation.
- bounded_quick_scope: none
- excluded_quick_scope: creating the skill package directly without a formal spec
- expected_changed_surfaces: `.codex/skills/launchdeck-agent/` or equivalent skill package path, plus optional docs
- validation_route: skill trigger evals, behavior/safety evals, and review against Launchdeck CLI safety assumptions
- consequence_model: lifecycle operations, running processes, port ownership, stale state, cleanup, and downstream agent behavior

## Context Boundary

- current_project_root: `F:/github/launchdeck`
- target_project_root: `F:/github/launchdeck`
- path_status: target-read-confirmed
- boundary_confidence: high
- external_systems: none
- reference_projects: none

Current project roles:

- role: implementation target
  scope: Launchdeck CLI product and future agent skill integration surface.
  evidence_source: active workspace and live reads.
  notes: The skill package should live in this repository's skill surface unless `sp-specify` verifies a different local convention.

Target project roles:

- role: implementation target
  scope: Same as current project.
  evidence_source: active workspace.
  notes: No external target project is in scope.

## Implementation Target

Likely target paths:

- `.codex/skills/launchdeck-agent/SKILL.md`
- `.codex/skills/launchdeck-agent/references/intent-routing.md`
- `.codex/skills/launchdeck-agent/references/adoption-flow.md`
- `.codex/skills/launchdeck-agent/references/discovery-rules.md`
- `.codex/skills/launchdeck-agent/references/command-flows.md`
- `.codex/skills/launchdeck-agent/references/recovery-playbooks.md`
- `.codex/skills/launchdeck-agent/references/clean-safety.md`
- `.codex/skills/launchdeck-agent/references/eval-prompts.md`

Target paths still to verify:

- Whether this repository wants project-local skills under `.codex/skills/`, `.agents/skills/`, or another package/export path.
- Whether a metadata file such as `agents/openai.yaml` is required for this local skill convention.

Target project cognition status:

- Existing discussion evidence used project cognition as navigation and live repository files as proof.
- Current project cognition cannot prove another project's implementation facts; no external target project is in scope.

## Source Evidence

- `requirements.md`: goal, product requirements, non-goals, success signals, routing, adoption, discovery, command, recovery, clean, eval, and package requirements.
- `technical-options.md`: selected v0 router package shape, actual `SKILL.md` draft, reference responsibilities, script stance, and flow contracts.
- `project-context.md`: Launchdeck existing foundation and boundary.
- `open-questions.md`: soft unknowns and resolved defaults.
- `README.md`: Launchdeck is a user-scoped global control plane with registry, logs, events, live OS inspection, ownership proof, inspect-only external processes, safe clean, and compact JSON.
- `src/cli.js`: exposes `--compact`, lifecycle commands, `ports`, `inspect`, `logs`, `events`, `reconcile`, `stop`, `force-stop`, and `clean`.
- `src/runtime.js`: manages runtime paths, process records, declared ports, logs, clean targets, ownership proof, and stop safety.
- `test/cli.test.js`: verifies local lifecycle flow including doctor, build, test, dev duplicate-start idempotency, ps, logs, stop, and clean.

## Blocking Unknowns

Hard unknowns: none.

Soft unknowns:

- SU-001: Exact skill install/export path. Owner: downstream specification. Latest resolve phase: `sp-specify`. Stop and reopen if the repository has no valid local skill packaging convention.
- SU-002: Whether `.launchdeck.yml` creation is automatic for high-confidence candidates or proposal-first by default. Owner: downstream specification. Latest resolve phase: `sp-specify`. Stop and reopen if this changes safety posture.
- SU-003: Monorepo support in v0. Owner: downstream specification. Latest resolve phase: `sp-specify`. Stop and reopen if v0 must manage multiple launchable apps in one repo.
- SU-004: Near-miss trigger aggressiveness for phrases like "preview this app". Owner: downstream specification. Latest resolve phase: `sp-specify`. Stop and reopen if trigger behavior conflicts with non-lifecycle tasks.
- SU-005: Threshold for promoting reference subflows into separate skills. Owner: downstream or future eval review. Latest resolve phase: post-v0 eval review. Stop and reopen if v0 must ship multiple public skills immediately.

## Downstream Instructions

Settled decisions:

- Build one v0 router skill named `launchdeck-agent`.
- Keep `SKILL.md` short and reference-driven.
- Use natural-language description as the primary trigger surface.
- Treat Launchdeck as the only execution and mutation authority.
- Prefer `--json --compact` for agent-internal Launchdeck commands.
- Refuse direct process killing for unknown/external owners.
- Keep clean, risky clean, and reset separate.

Assumptions to preserve:

- V0 targets local filesystem projects and current workspace behavior first.
- Existing Launchdeck CLI surfaces are sufficient foundation for the skill package.
- Details should be references first, scripts later only if evals prove the need.

Capability map:

- intent routing: natural-language lifecycle detection and decline rules.
- adoption: unknown project onboarding and `.launchdeck.yml` creation/repair.
- discovery: ecosystem evidence and confidence labels.
- operation: start, dev, run, restart, stop, force-stop, status, ps, ports, inspect, logs, and events.
- recovery: port conflict, stale record, stop failed, duplicate-start risk, and missing evidence.
- clean: safe clean, risky clean, and reset boundaries.
- eval: trigger, non-trigger, behavior/safety, and compact-output prompts.

Planning constraints:

- Do not implement separate public skills unless specification revises the v0 package boundary.
- Do not add mutating scripts in v0.
- Do not let README prose alone authorize long-running command start.
- Do not let port or PID alone authorize stop.
- Do not include a hidden reset path under clean.

Reopen conditions:

- Launchdeck CLI lacks a command that a required skill flow depends on.
- Local skill packaging convention contradicts the assumed target path.
- Eval design cannot verify unsafe kill prevention or duplicate-start prevention.
- User changes v0 from local CLI skill package to GUI/MCP/product installer.

## Discussion Decision Digest

Locked direction:

- One `launchdeck-agent` router skill with bundled references.
- Natural user intent should route internally; users should not choose skills.
- First-run discovery persists lifecycle knowledge; repeat runs reuse it.
- Launchdeck remains execution authority.

Rejected alternatives:

- Six public skills for v0.
- Direct agent-managed process killing.
- GUI/MCP-first.
- Clean-as-reset.
- Automatic destructive cleanup.

Accepted tradeoffs:

- V0 may be less automated in weak-confidence discovery cases to preserve safety.
- V0 keeps references instead of separate public skills to tune trigger behavior first.
- V0 defers scanner scripts until eval failures prove they are needed.

Must not dilute:

- Observe before mutate.
- Ownership proof before stop/restart/force-stop.
- Inspect-only for unknown/external processes.
- Safe clean only by default.
- Compact JSON for agent loops.

## UI Discussion

- ui_discussion_status: not_applicable
- confirmed UI decisions: none
- deferred UI decisions: none
- ui_sketches_present: false

## Senior Consequence Analysis

Consequence gate status: triggered.

Trigger reason: Agent skills affect lifecycle operations, running processes, port conflict handling, shared Launchdeck state, cleanup safety, and downstream agent behavior.

Affected Object Map:

| Object | Impact |
| --- | --- |
| `launchdeck-agent/SKILL.md` | Natural-language trigger and safety router. |
| reference files | Detailed agent behavior for lifecycle flows. |
| `.launchdeck.yml` | Lifecycle authority produced or reused by adoption. |
| Launchdeck registry | Global project identity and cross-agent visibility. |
| runtime state/logs/events | Evidence for status, recovery, and cleanup safety. |
| managed process records | Ownership and duplicate-start prevention. |
| declared ports | Conflict detection and recovery routing. |
| clean targets | Safe/risky/destructive cleanup boundary. |

State-Behavior Matrix:

| State | Required behavior |
| --- | --- |
| missing config | read-only discovery before mutation. |
| adopted project | observe before start/restart/stop/clean. |
| running matching task | report existing run, do not duplicate. |
| external port occupant | inspect-only, no kill. |
| stale record | reconcile before mutation. |
| stop failed | preserve evidence; force-stop only if Launchdeck-owned. |
| missing logs | use events fallback; do not restart/clean solely for logs. |
| risky clean request | require explicit confirmation. |
| reset request | decline automatic reset and require separate destructive review. |

Dependency Impact Table:

| Dependency | Impact |
| --- | --- |
| Launchdeck CLI command surface | Skill must use existing commands and compact JSON. |
| Launchdeck ownership proof | Required for stop/restart/force-stop. |
| Launchdeck registry | Required for cross-agent project visibility. |
| `.launchdeck.yml` schema | Skill adoption must align with supported config fields. |
| Skill trigger metadata | Description quality controls natural-intent entry. |
| Eval prompts | Must prove behavior changes versus baseline agent behavior. |

Recovery And Validation Contract:

- Validate trigger and non-trigger prompts.
- Validate adoption behavior for unknown projects.
- Validate duplicate-start prevention.
- Validate inspect-only behavior for external/unknown ports.
- Validate ownership-gated stop/restart/force-stop.
- Validate stale reconcile before mutation.
- Validate safe clean, risky clean confirmation, and reset refusal.
- Validate compact JSON command posture and concise user summaries.

Coverage Gaps:

- Exact local skill packaging path remains soft and must be verified in `sp-specify`.
- Executable eval fixture format is deferred.
- Monorepo behavior is deferred unless `sp-specify` chooses to include it.

Consequence Obligations:

- CA-AS-001: Skills must treat Launchdeck as the execution authority and must not independently kill unknown processes.
- CA-AS-002: Skills must discover and classify lifecycle commands before running or proposing managed configuration.
- CA-AS-003: Skills must require Launchdeck ownership proof before stop/restart/force-stop decisions.
- CA-AS-004: Skills must prefer inspect/reconcile/status evidence before starting a service that may already exist.
- CA-AS-005: Skills must preserve agent-readable output and use compact JSON when context budget matters.
- CA-AS-006: Skills must distinguish read-only discovery, config proposal, config adoption, operation, recovery, and cleanup.
- CA-AS-007: Skills must preserve user control over risky cleanup and destructive operations.
- CA-AS-008: Skills must support arbitrary local project stacks by detecting common project files while keeping `.launchdeck.yml` explicit as authority.
- CA-AS-009: Skill invocation must be intent-routed from natural user requests, not dependent on users naming the correct skill.
- CA-AS-010: Learned lifecycle knowledge must persist as Launchdeck config/registry state so later runs do not repeat expensive or risky discovery.

## Must-Preserve Ledger

| ID | Type | Claim | Source | Downstream Requirement | Level | Owner | Latest Resolve Phase | Status | Stop And Reopen Condition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MP-001 | goal | Create a v0 `launchdeck-agent` skill package for safe local project lifecycle management through Launchdeck. | requirements.md | Spec must define this as the central target need. | hard | downstream-contract | sp-specify | mapped | Reopen if scope becomes CLI/MCP/GUI instead of skill package. |
| MP-002 | decision | V0 ships as one router skill with bundled references, not six public skills. | technical-options.md | Spec must preserve one-package v0 shape. | hard | downstream-contract | sp-specify | mapped | Reopen if multiple public skills are proposed for v0. |
| MP-003 | decision | Users express natural intent; agent routing is internal. | requirements.md | Spec must include natural-language trigger behavior. | hard | downstream-contract | sp-specify | mapped | Reopen if user must name Launchdeck or skill names. |
| MP-004 | decision | Launchdeck is the execution authority. | requirements.md | Spec must forbid direct launch/kill bypasses when Launchdeck can manage the lifecycle. | hard | downstream-contract | sp-specify | mapped | Reopen if skill directly owns processes. |
| MP-005 | decision | `.launchdeck.yml` is lifecycle authority and first-run discovery must persist knowledge. | requirements.md | Spec must require adoption flow and config reuse. | hard | downstream-contract | sp-specify | mapped | Reopen if skill remains one-off command runner. |
| MP-006 | decision | Observe before mutate. | technical-options.md | Spec must require status/ps/ports/inspect or equivalent preflight before lifecycle mutation. | hard | downstream-contract | sp-specify | mapped | Reopen if start/stop/restart flows skip evidence. |
| MP-007 | decision | Stop/restart/force-stop require Launchdeck ownership proof. | requirements.md | Spec must preserve ownership gates. | hard | downstream-contract | sp-specify | mapped | Reopen if port or PID alone authorizes stop. |
| MP-008 | non_goal | Unknown or external processes are inspect-only and must not be killed automatically. | open-questions.md | Spec must include explicit refusal behavior. | hard | downstream-contract | sp-specify | mapped | Reopen if automatic kill is introduced. |
| MP-009 | decision | Safe clean, risky clean, and reset are separate; reset is out of automatic scope. | requirements.md | Spec must preserve cleanup tiers and confirmation rules. | hard | downstream-contract | sp-specify | mapped | Reopen if clean can delete secrets, data, or reset state. |
| MP-010 | decision | Agent-internal Launchdeck calls should prefer `--json --compact`. | requirements.md | Spec must include compact-output command posture. | soft | downstream-contract | sp-specify | mapped | Reopen if compact output is unavailable for required flow. |
| MP-011 | scope | V0 discovery covers Node, Python, Docker Compose, and Make/Just/Taskfile first. | requirements.md | Spec must include these as first-class discovery references. | soft | downstream-contract | sp-specify | mapped | Reopen if v0 must cover a different ecosystem first. |
| MP-012 | tradeoff | V0 defers scripts unless evals show prose discovery is unreliable. | technical-options.md | Spec must not add mutating scripts by default. | soft | downstream-contract | sp-specify | mapped | Reopen if implementation requires a scanner for correctness. |
| MP-013 | reference | Eval prompts must test trigger, non-trigger, behavior/safety, and compact-output behavior. | technical-options.md | Spec must include eval artifacts or acceptance criteria. | hard | downstream-contract | sp-specify | mapped | Reopen if verification ignores behavior safety. |
| MP-014 | blocking_question | Exact skill install/export path must be verified. | handoff-assessment.md | Spec must resolve target package path before implementation. | soft | evidence | sp-specify | deferred | Reopen if no valid local skill path exists. |

## Quality Gate

- status: handoff-ready
- self_reviewed_at: 2026-07-09T16:29:56+08:00
- user_review_required: true
- user_confirmed_at: 2026-07-09T16:40:46+08:00
- blocked_reasons: none
- hard_unknown_count: 0
- open_conflict_count: 0
- coverage_status: handoff-ready-complete-with-soft-unknowns
- planning_gate_status: ready-for-specify

## Handoff Ready

User confirmed this handoff as `handoff-ready` on 2026-07-09T16:40:46+08:00. The selected route is `sp-specify` because the work defines a new skill package with multiple safety contracts and eval requirements.

Approved product direction: one `launchdeck-agent` router skill, references for subflows, Launchdeck-only lifecycle mutation, no unknown process kills, no duplicate starts, safe clean only by default, and compact JSON for agent loops.

If downstream specification finds a protected-fact mismatch, unresolved hard unknown, missing Must-Preserve item, or invalid target packaging path, return to `sp-discussion` for handoff repair instead of silently patching the contract in `sp-specify`.
