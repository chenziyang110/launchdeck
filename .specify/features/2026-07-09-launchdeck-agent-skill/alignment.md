# Alignment: Launchdeck Agent Skill

## Current Understanding

The feature is a v0 skill package for coding agents. It should make natural local lifecycle requests route through Launchdeck so agents can safely discover project commands, persist `.launchdeck.yml`, reuse registry/runtime state, start without duplicates, inspect ports, stop only owned processes, read logs/events, recover stale state, and clean safely.

The feature is specification-only at this stage. Implementation will create skill Markdown files under `.agents/skills/launchdeck-agent/`, not change Launchdeck CLI/runtime code.

## Confirmed Facts

- The source discussion is user-confirmed as handoff-ready.
- The target project root is `F:/github/launchdeck`.
- `.codex/skills/` is the verified local skill package surface.
- Existing skills use `SKILL.md` with optional `references/`.
- No `.agents/skills` directory or required `agents/openai.yaml` metadata was found.
- Launchdeck CLI already exposes the command surfaces needed by the skill: lifecycle commands, registry commands, observation commands, recovery commands, logs/events, clean, and compact JSON.
- Tests cover compact output, global registry visibility, declared ports, external port inspection, duplicate-start idempotency, and clean safety.

## Assumptions

- The implementation should add `agents/openai.yaml` or similar metadata only if a local installer or packaging convention requires it.
- Exact or strong lifecycle evidence can authorize `.launchdeck.yml` creation or repair; weak/conflicting/unknown evidence requires proposal or confirmation.
- V0 local-project behavior is sufficient; monorepo-first behavior is deferred.
- Prose references are acceptable for v0 until eval prompts prove scripts are needed.

## Open Questions

No planning-critical open question blocks `/sp.plan`.

Soft items to preserve:

- Metadata requirements should be verified during implementation.
- Monorepo behavior remains deferred.
- Scanner scripts remain deferred until eval evidence proves need.
- Public subskill split threshold remains a post-v0 eval decision.

## Semantic Term Decisions

| Term | Possible Meanings | Selected Meanings | Excluded Meanings | User Confirmation |
| --- | --- | --- | --- | --- |
| skill suite | many public skills; one router with internal references; external plugin bundle | one `launchdeck-agent` router skill with internal references | six public skills in v0 | confirmed by handoff |
| natural intent | user says skill name; user asks ordinary lifecycle task; any port/process discussion | ordinary local project lifecycle task, even without naming Launchdeck | general education or non-lifecycle coding tasks | confirmed by handoff |
| manage project | replace Launchdeck; orchestrate Launchdeck; production deployment | orchestrate Launchdeck for local lifecycle | production deployment, direct process manager | confirmed by handoff |
| discover | run commands; read evidence; infer from docs only | read-only evidence gathering with confidence labels | long-running command execution before adoption | confirmed by handoff |
| adopt | always write config; propose only; evidence-gated write/proposal | exact/strong evidence may write; weak/conflicting evidence proposes or confirms | automatic write from weak evidence | specified conservative default |
| stop/kill | raw OS kill; Launchdeck stop; force-stop recovery | Launchdeck ownership-gated stop/restart/force-stop | port/PID-based raw kill | confirmed by handoff |
| clean | safe cache removal; risky dependency deletion; reset | safe clean by default; risky requires confirmation; reset separate | reset hidden under clean | confirmed by handoff |
| compact output | hide evidence; use concise machine JSON; user sees raw JSON | `--json --compact` internally and human summary externally | verbose JSON dumps by default | confirmed by handoff |

## Approach Comparison

| Approach | Product Fit | Implementation Risk | User-Visible Tradeoff | Compatibility Impact | Verification Implication |
| --- | --- | --- | --- | --- | --- |
| One monolithic long skill | Simple packaging but high context cost | High risk of blurred safety boundaries | Harder for agents to follow selectively | No extra files, but hard to review | Harder to test subflows independently |
| One router skill with references | Best fit for confirmed v0 | Moderate, reviewable Markdown package | Users see one capability; agents load details only as needed | Matches existing `.codex/skills/<skill>/references` pattern | Evals can target trigger and each subflow |
| Skill plus MCP first | Strong future structure | Premature because behavior contract still forming | More infrastructure before user value | Requires new integration surface | Needs MCP contract and CLI parity tests |

Selected approach: one router skill with references. This preserves user intent, minimizes context, keeps Launchdeck as execution authority, and defers MCP/scripts until behavior is proven.

## Upstream Intent Disposition

| Signal | Source | Disposition | Artifact Location | User Confirmed | Reopen Trigger |
| --- | --- | --- | --- | --- | --- |
| v0 `launchdeck-agent` skill package | handoff MP-001 | in_scope | spec.md FR-001, scope | yes | scope becomes CLI/MCP/GUI |
| one router skill with bundled references | MP-002, technical-options.md | in_scope | spec.md FR-002, Decision Capture | yes | multiple public skills proposed for v0 |
| natural user intent routes internally | MP-003, requirements.md | in_scope | spec.md FR-003, FR-005 | yes | user must name Launchdeck/skill |
| Launchdeck execution authority | MP-004 | preserved | spec.md FR-015-FR-024 | yes | raw launch/kill bypass appears |
| `.launchdeck.yml` lifecycle authority | MP-005 | preserved | spec.md FR-007-FR-014 | yes | skill remains one-off command runner |
| observe before mutate | MP-006 | preserved | spec.md FR-017, FR-019, FR-024 | yes | lifecycle mutation skips evidence |
| ownership proof before stop/restart/force-stop | MP-007 | preserved | spec.md FR-019-FR-021 | yes | port/PID alone authorizes stop |
| unknown/external process inspect-only | MP-008 | preserved | spec.md FR-022-FR-023 | yes | automatic kill is introduced |
| clean/risky/reset separation | MP-009 | preserved | spec.md FR-026-FR-028 | yes | clean deletes secrets/data/reset |
| compact JSON | MP-010 | preserved | spec.md FR-015-FR-016 | yes | compact output unavailable for required flow |
| Node/Python/Docker Compose/Make/Just/Taskfile v0 discovery | MP-011 | in_scope | spec.md FR-011 | yes | v0 must cover a different ecosystem first |
| scripts deferred | MP-012 | deferred | spec.md Deferred Scope | yes | evals prove prose failure |
| eval prompt groups | MP-013 | in_scope | spec.md FR-029-FR-030 | yes | verification ignores behavior safety |
| exact skill package path | MP-014 | preserved | spec.md FR-001, context.md Repository Context | yes | `.codex/skills` is invalid for local install |
| monorepo-first behavior | open-questions.md | deferred | spec.md Deferred Scope | yes | v0 must manage multiple launchable apps |
| separate public subskills | technical-options.md | dropped for v0 | spec.md Out of Scope | yes | post-v0 evals support split |
| GUI/MCP-first | handoff rejected alternatives | dropped for v0 | spec.md Out of Scope | yes | user changes product target |

## Out-Of-Scope Conflicts

- Six separate public skills conflict with the confirmed v0 package boundary and are dropped for v0.
- MCP/GUI-first conflicts with the confirmed CLI-skill package direction and is out of scope.
- Direct OS process killing conflicts with Launchdeck ownership safety and is out of scope.
- Reset-as-clean conflicts with clean safety and is out of scope.

## Must-Preserve Coverage

All 14 `MP-*` items are mapped in `spec.md#Must-Preserve Discussion Inputs` and mirrored in `brainstorming/handoff-to-specify.json`.

All 10 `CA-AS-*` obligations are preserved in `spec.md#Consequence Analysis` and `context.md#Affected Object Map`.

## Source Sweep Status

- Discussion handoff Markdown: read.
- Discussion handoff JSON: read and parsed.
- Discussion log: read.
- Requirements: read.
- Technical options: read.
- Project context: read.
- Open questions: read.
- README: read for CLI behavior and safety surface.
- package.json: read for CLI package context.
- src/cli.js: inspected help and command surface.
- Relevant tests: inspected compact output, global runtime, external port, duplicate-start, and clean safety coverage.

## Readiness Decision

Aligned: ready for plan. User review was confirmed by invoking `$sp-plan` on 2026-07-09.

Rationale:

- No hard unknowns remain.
- No open conflicts remain.
- Source-signal disposition is complete.
- The remaining soft items are either resolved conservatively or deferred with reopen triggers.
- The target package path is verified enough for planning.
- The package can be planned without changing source/runtime behavior.
