# Implementation Plan: Launchdeck Agent Skill

**Branch**: `2026-07-09-launchdeck-agent-skill` | **Date**: 2026-07-09 | **Spec**: `spec.md`  
**Input**: Feature specification from `.specify/features/2026-07-09-launchdeck-agent-skill/spec.md`

## Summary

Create a v0 project-local `launchdeck-agent` skill package under `.agents/skills/launchdeck-agent/`. The root `SKILL.md` will be a trigger-rich, short router that detects local project lifecycle intent and routes agents into focused reference files for adoption, discovery, command execution, recovery, observability, and cleanup. The implementation is documentation/skill-package work only: Launchdeck CLI/runtime behavior is already present and remains the execution authority.

## Locked Planning Decisions

- V0 ships one public skill package named `launchdeck-agent`, not six public subskills.
- Users express natural local lifecycle intent; agents route internally without requiring the user to name Launchdeck or the skill.
- Launchdeck CLI is the only execution authority for lifecycle mutation.
- `.launchdeck.yml`, the registry, runtime state, logs, and events are the lifecycle knowledge surfaces to reuse.
- Observe before mutate for start, restart, stop, force-stop, recovery, and clean.
- Port or PID evidence alone never authorizes stopping a process.
- Unknown or external processes are inspect-only.
- Clean defaults to safe hygiene; risky clean requires explicit confirmation; reset is out of automatic scope.
- Agent-internal Launchdeck reads should use `--json --compact` where the command supports it.
- V0 discovery covers Node, Python, Docker Compose, and Make/Just/Taskfile.
- Scanner scripts, executable eval fixtures, monorepo-first behavior, public subskill split, MCP, GUI, and product installer are deferred.

## Must-Preserve Carry-Forward

| MP ID | Type | Planning Obligation | Plan Location | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- |
| MP-001 | goal | Deliver a v0 `launchdeck-agent` skill package. | Summary, Project Structure | Target becomes CLI/MCP/GUI instead of a skill package. |
| MP-002 | decision | Keep one router skill with bundled references. | Implementation Constitution | Multiple public skills are proposed for v0. |
| MP-003 | decision | Trigger from natural local lifecycle intent. | Scenario Profile Inputs, Capability Plan | User must name Launchdeck or the skill. |
| MP-004 | decision | Launchdeck remains execution authority. | Architecture Invariants | Skill starts/kills processes directly. |
| MP-005 | decision | `.launchdeck.yml` and persisted registry/runtime state are lifecycle authority. | Boundary Ownership | Skill becomes a one-off command runner. |
| MP-006 | decision | Observe before mutate. | Operational Consequence Design | Mutation paths skip status/inspect/ports/reconcile. |
| MP-007 | decision | Stop/restart/force-stop require ownership proof. | Operational Consequence Design | Port/PID alone authorizes stop. |
| MP-008 | non-goal | Unknown/external processes are inspect-only. | Recovery Path | Skill auto-kills unmanaged listeners. |
| MP-009 | decision | Keep safe clean, risky clean, and reset separate. | Clean Safety Target | Clean deletes secrets/data/reset state. |
| MP-010 | decision | Use compact JSON for agent loops. | Technical Context, Validation | Required command lacks compact posture. |
| MP-011 | scope | Cover Node, Python, Docker Compose, Make, Just, and Taskfile discovery first. | Discovery Target | V0 must cover a different ecosystem first. |
| MP-012 | tradeoff | Defer scanner scripts until evals prove prose failure. | Forbidden Drift | Implementation adds deterministic scanners without user confirmation. |
| MP-013 | reference | Include eval prompts for trigger, non-trigger, behavior safety, and compact output. | Validation Strategy | Verification ignores behavior safety. |
| MP-014 | decision | Use `.agents/skills/launchdeck-agent/` unless local installer evidence contradicts it. | Target Boundary | `.codex/skills` is invalid for local installation. |

## Capability Preservation Plan

| Capability Operation | Upstream Source | Selected Entry Point | Owning Surface | Required Implementation | Acceptance Proof | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- | --- | --- |
| Route lifecycle intent | spec.md FR-003 to FR-006 | `SKILL.md` frontmatter and body | `.agents/skills/launchdeck-agent/SKILL.md` | Pushy bilingual trigger description plus concise route table. | Should-trigger and should-not-trigger eval prompts. | Trigger language routes non-lifecycle code edits or misses obvious lifecycle requests. |
| Adopt unknown project | spec.md FR-007 to FR-014 | `references/adoption-flow.md` | Skill package reference | Read existing config/registry first, discover read-only evidence, classify confidence, write or propose config, run doctor, register, then start. | Adoption evals for exact, strong, weak, and conflicting evidence. | Weak/conflicting evidence mutates config automatically. |
| Discover commands | spec.md FR-009 to FR-012 | `references/discovery-rules.md` | Skill package reference | Framework evidence rules for Node, Python, Docker Compose, Make, Just, and Taskfile. | Discovery eval coverage in `eval-prompts.md`. | Discovery relies on README prose ahead of manifests/task files. |
| Operate managed lifecycle | spec.md FR-017 to FR-021 | `references/command-flows.md` | Skill package reference | Start/dev/run/restart/stop/force-stop/status/ps/logs/events flows through Launchdeck only. | Existing-run reuse, restart, stop, and force-stop evals. | Raw shell backgrounding or raw kill appears. |
| Recover conflicts/stale state | spec.md FR-022 to FR-025 | `references/recovery-playbooks.md` | Skill package reference | Classify occupant and route stale state through `reconcile` before mutation. | Port conflict and stale-state evals. | Unknown or external occupants are killed automatically. |
| Clean safely | spec.md FR-026 to FR-028 | `references/clean-safety.md` | Skill package reference | Default `clean --safe`, require explicit confirmation for risky targets, decline reset as separate destructive request. | Safe clean, risky clean, and reset refusal evals. | Clean implies stop or reset. |
| Validate skill behavior | spec.md FR-029 to FR-030 | `references/eval-prompts.md` | Skill package reference | Prompt catalog with expected decisions and safety assertions. | SC-001 through SC-005. | Evals only check wording, not behavior. |

## Implementation Target Boundary

- **Current project root**: `F:/github/launchdeck`
- **Current project roles**: owning repository for Launchdeck CLI and project-local skill packages.
- **Target project root**: `F:/github/launchdeck`
- **Target project roles**: same repository, skill package only.
- **Target paths/modules**:
  - `.agents/skills/launchdeck-agent/SKILL.md`
  - `.agents/skills/launchdeck-agent/references/intent-routing.md`
  - `.agents/skills/launchdeck-agent/references/adoption-flow.md`
  - `.agents/skills/launchdeck-agent/references/discovery-rules.md`
  - `.agents/skills/launchdeck-agent/references/command-flows.md`
  - `.agents/skills/launchdeck-agent/references/recovery-playbooks.md`
  - `.agents/skills/launchdeck-agent/references/clean-safety.md`
  - `.agents/skills/launchdeck-agent/references/eval-prompts.md`
- **Target evidence status**: Verified by live reads: `.codex/skills/` exists, existing local skills use `SKILL.md` with optional `references/`, and no local `agents/openai.yaml` requirement was found.
- **Reference sources**: `spec.md`, `alignment.md`, `context.md`, `references.md`, Launchdeck README, CLI help, relevant contract/global-runtime/clean tests, and project-local `skill-creator` guidance.
- **Cognition scope rule**: Project cognition is advisory only. Live repository reads prove the current CLI surface and local skill convention.
- **Stop condition**: Stop and return to `sp-plan` or the user if `.agents/skills/launchdeck-agent/` cannot be used, if the Launchdeck command surface is missing required commands, or if implementation would require runtime behavior changes.

## Reference Fidelity Inputs

No external UI or product reference object applies. The fidelity requirement is behavior-level: preserve the discussion handoff's safety model, command ownership model, natural-intent routing model, and context-minimizing skill structure.

### Behavior-Level Fidelity Inventory

- Behavior 1 preserved: natural lifecycle request -> Launchdeck route without user naming Launchdeck.
- Behavior 2 preserved: unknown project -> read-only discovery -> evidence-gated config creation/proposal -> doctor -> registry add -> managed start.
- Behavior 3 preserved: repeated start -> report existing managed run instead of duplicate start.
- Behavior 4 preserved: occupied port -> inspect/classify/reconcile, no unmanaged kill.
- Behavior 5 preserved: stop/restart/force-stop -> verified Launchdeck ownership.
- Behavior 6 preserved: clean -> safe by default, risky confirmed, reset declined.

## Scenario Profile Inputs

### Active Profile

- **Standard Delivery with Lifecycle Safety Constraints**.
- Source artifacts: `spec.md`, `alignment.md`, `context.md`, and `brainstorming/handoff-to-specify.json`.
- This profile imposes safety and progressive-disclosure obligations, not reference-fidelity obligations to an external product.

### Profile-Driven Implementation Constraints

- The root skill must stay short and route details to references.
- Trigger description must include English and Chinese lifecycle phrases and near-miss exclusions.
- Every lifecycle mutation flow must first observe Launchdeck state.
- Ownership proof is a hard gate for stop, restart, and force-stop.
- Agent-internal command examples should prefer `--json --compact`; user-facing responses should summarize conclusion, evidence, and next action.
- Validation must prove both positive routing and negative non-routing.

## Technical Context

**Language/Version**: Markdown skill package for a Node.js ESM CLI project on Node.js `>=20`.  
**Primary Dependencies**: None added. Reuse Launchdeck CLI commands and local skill package conventions.  
**Storage**: Skill files in `.agents/skills/launchdeck-agent/`; no new runtime storage.  
**Testing**: Static artifact checks plus eval prompt review. Existing CLI tests are evidence for command behavior; this plan does not require new CLI tests.  
**Target Platform**: Cross-platform local development environments supported by Launchdeck; skill prose must not assume Windows-only or Unix-only process commands.  
**Project Type**: CLI project plus local skill package.  
**Performance Goals**: Minimize agent context by progressive disclosure and compact JSON guidance.  
**Constraints**: No source/runtime/test changes in this feature; no new dependencies; no direct OS process mutation instructions.  
**Scale/Scope**: One root skill plus seven reference files.

## Implementation Constitution

### Architecture Invariants

- `launchdeck-agent` is an agent behavior layer, not a new process manager.
- Launchdeck CLI commands remain the only lifecycle mutation mechanism.
- `.launchdeck.yml` remains the project lifecycle model authority.
- Registry/runtime/logs/events remain evidence surfaces for repeated and cross-agent operation.
- Reference files own detailed subflows; `SKILL.md` owns triggering, routing, and safety gates.

### Boundary Ownership

- Skill package boundary: `.agents/skills/launchdeck-agent/`.
- Runtime/process boundary: existing Launchdeck CLI and runtime modules.
- Discovery authority: project files and Launchdeck config, with confidence labels.
- Safety authority: Launchdeck ownership proof and `reconcile` before mutation when state is stale.

### Forbidden Implementation Drift

- Do not edit `src/`, `test/`, `package.json`, or runtime behavior for this feature.
- Do not add shell recipes that directly kill by PID or port.
- Do not instruct agents to background long-lived commands outside Launchdeck.
- Do not create scanner scripts in v0 unless implementation returns to the user with eval evidence and explicit confirmation.
- Do not collapse safe clean, risky clean, and reset into one path.
- Do not make six public skills for v0.

### Required Implementation References

- `.specify/features/2026-07-09-launchdeck-agent-skill/spec.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/alignment.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/context.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/research.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/quickstart.md`
- `README.md`
- `src/cli.js` help output
- `.codex/skills/skill-creator/SKILL.md`

### Review Focus

- Root skill trigger description is neither too narrow nor too broad.
- Reference routing is progressive and does not force all details into context.
- Command names match current Launchdeck help.
- No reference instructs raw process killing for unknown or external owners.
- Eval prompts cover trigger, non-trigger, safety behavior, and compact output.

## Operational Consequence Design

| Obligation ID | State Machine / Ordering Decision | Concurrency And Idempotency | Recovery Path | Validation Evidence |
| --- | --- | --- | --- | --- |
| CA-AS-001 | Any mutation must route through Launchdeck CLI. | Idempotency delegated to Launchdeck registry/runtime. | If Launchdeck cannot prove ownership, report inspect/reconcile next actions. | Review `command-flows.md` and `recovery-playbooks.md` for no raw kill/start guidance. |
| CA-AS-002 | Unknown project enters adoption before start. | Discovery is read-only until confidence gate passes. | Weak/conflicting evidence produces proposal or confirmation request. | Adoption evals for exact, strong, weak, conflicting evidence. |
| CA-AS-003 | Stop/restart/force-stop require inspect/reconcile then ownership proof. | Repeat stop should target the same Launchdeck-owned task/run. | Unknown/external/stale state blocks or routes through `reconcile`. | Stop/restart/force-stop evals. |
| CA-AS-004 | Start/dev/run observes status, ps, ports, and declared task state before spawn. | Existing matching run returns control handles instead of duplicate start. | Port conflict routes to inspect/classification. | Existing-run reuse and duplicate-start evals. |
| CA-AS-005 | Agent command loop uses compact JSON when supported. | Compact reads reduce repeated context load. | If compact is unsupported for a command, use normal JSON and summarize. | Compact-output evals and command examples. |
| CA-AS-006 | Each subflow has its own reference file. | Agents load only the relevant reference. | If a subflow becomes too large, split only after review. | File existence and routing review. |
| CA-AS-007 | Clean classification precedes action. | Clean does not imply stopping services. | Risky clean requires confirmation; reset is declined as destructive separate request. | Clean eval prompts. |
| CA-AS-008 | Discovery uses common project files and `.launchdeck.yml` authority. | Repeated adoption reuses existing config/registry. | Missing/invalid config routes through doctor and repair/proposal. | Discovery and adoption evals. |
| CA-AS-009 | Natural intent triggers skill without explicit skill name. | Trigger should be stable across English and Chinese phrasing. | Near-miss prompts decline Launchdeck routing. | SC-001 and SC-002 eval groups. |
| CA-AS-010 | Persistent config/registry/runtime evidence is checked before new inference. | Later agents can reuse stable project/task targets. | Missing or stale evidence routes through `status`, `inspect`, `ports`, `reconcile`. | Repeat-run evals and reference review. |

## Dispatch Compilation Hints

### Boundary Owner

- `.agents/skills/launchdeck-agent/` is the only implementation boundary.

### Required Packet References

- Feature spec package: `spec.md`, `alignment.md`, `context.md`, `research.md`, `quickstart.md`, `plan-contract.json`.
- Repository command evidence: `README.md` and `node src/cli.js --help` output.
- Skill methodology evidence: `.codex/skills/skill-creator/SKILL.md`.

### Packet Validation Gates

- Verify every required skill file exists.
- Verify `SKILL.md` frontmatter has `name` and trigger-rich `description`.
- Verify all Launchdeck command names used in references exist in current help/README.
- Verify no reference contains raw kill-by-port/PID instructions for unknown or external owners.
- Verify eval prompt groups satisfy SC-001 through SC-005.

### Task-Level Quality Floor

- Keep implementation as plain Markdown skill package changes.
- Preserve progressive disclosure.
- Preserve lifecycle safety boundaries.
- Keep user-visible outputs concise and evidence-based.

## Alignment Inputs

### Canonical References

- `.specify/features/2026-07-09-launchdeck-agent-skill/spec.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/alignment.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/context.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/references.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/brainstorming/handoff-to-specify.json`
- `.specify/discussions/launchdeck-agent-skill-suite/handoff-to-specify.md`
- `README.md`
- `src/cli.js`

### Input Risks From Alignment

- Trigger behavior can over-route near-miss prompts; mitigate with lifecycle intent plus local project/service context and negative evals.
- Prose-only discovery may be inconsistent; mitigate with explicit confidence rules and defer scripts until evals prove need.
- Metadata requirements beyond `SKILL.md` are not proven; inspect local conventions during implementation and add metadata only if required.

## Research Inputs

### Standard Stack

- Project-local skill package: `.codex/skills/<skill>/SKILL.md` plus `references/`.
- Launchdeck CLI: current command surface verified by `node src/cli.js --help`.
- Skill writing: use progressive disclosure from `skill-creator`.

### Don't Hand-Roll

- Do not hand-roll process management, port killing, runtime registry, log tailing, or clean behavior in skill prose. Use Launchdeck commands.
- Do not hand-roll scanner scripts in v0. Use prose discovery rules and eval prompts first.

### Common Pitfalls

- Trigger descriptions that are too passive undertrigger natural user intent.
- Long root skill bodies consume context and blur safety boundaries.
- Port/PID evidence can look actionable but is not ownership proof.
- Clean requests can accidentally become destructive reset requests unless classified first.

### Assumptions To Validate

- `.agents/skills/launchdeck-agent/` is sufficient for local use.
- No `agents/openai.yaml` metadata is required in this repository.
- Eval prompts are enough for v0; scripts remain deferred.

### Environment / Dependency Notes

- No new npm dependency.
- No dev server or managed process demo is required for this planning feature.
- Cross-platform wording must use Launchdeck abstractions rather than OS-specific commands.

## Constitution Check

- Specification-first delivery: passed. `spec.md`, `alignment.md`, `context.md`, and this plan exist before implementation.
- Simplicity and scope discipline: passed. One skill package, no runtime changes, no new dependencies.
- Test-backed changes: documentation/skill package change uses static artifact checks and eval prompt validation; no CLI behavior change requires runtime tests.
- Security by default: passed. Ownership proof and safe clean gates are explicit.
- Reviewable/reversible delivery: passed. Target files are isolated under `.agents/skills/launchdeck-agent/`.
- Evidence before completion: passed for planning with live CLI help, README, tests, skill convention reads, and JSON validation.
- No unrequested fallbacks: passed. Deferred areas stay deferred unless user confirms.

## Project Structure

### Documentation (this feature)

```text
.specify/features/2026-07-09-launchdeck-agent-skill/
├── plan.md
├── research.md
├── quickstart.md
├── plan-contract.json
└── workflow-state.md
```

`data-model.md` is not required because this feature does not introduce persistent application entities or state transitions beyond Markdown skill guidance. `contracts/` is not required because this feature introduces no external API, protocol, or cross-service interface.

### Source Code (repository root)

```text
.codex/
└── skills/
    └── launchdeck-agent/
        ├── SKILL.md
        └── references/
            ├── intent-routing.md
            ├── adoption-flow.md
            ├── discovery-rules.md
            ├── command-flows.md
            ├── recovery-playbooks.md
            ├── clean-safety.md
            └── eval-prompts.md
```

**Structure Decision**: Add one project-local skill package under the existing `.codex/skills/` convention. Do not edit CLI source or tests.

## Decision Preservation Check

- One router skill -> represented in Project Structure and Implementation Constitution.
- Natural intent -> represented in Scenario Profile Inputs and `intent-routing.md` target.
- Launchdeck authority -> represented in Architecture Invariants and Operational Consequence Design.
- Ownership proof -> represented in CA-AS-003 and recovery target.
- Compact output -> represented in Technical Context and eval strategy.
- Scanner scripts deferred -> represented in Forbidden Implementation Drift.
- Eval prompt coverage -> represented in Capability Preservation Plan and Validation Strategy.

## Research Adoption Check

- Local skill convention -> target path and file layout.
- Skill-creator progressive disclosure -> short `SKILL.md` plus reference files.
- Current CLI help -> command-flow examples and validation gate.
- Existing global runtime/clean tests -> safety model is planned as skill guidance, not reimplemented.
- Git-root learning -> final closeout must use feature-owned paths, not broad `F:/github` git status.

## Complexity Tracking

No constitution violations are introduced.
