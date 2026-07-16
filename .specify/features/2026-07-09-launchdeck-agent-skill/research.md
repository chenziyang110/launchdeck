# Research: Launchdeck Agent Skill

**Date**: 2026-07-09  
**Input**: Spec package for `.agents/skills/launchdeck-agent/`

## Summary

The implementation should create a plain Markdown skill package, not a new Launchdeck runtime feature. Existing repository evidence shows the CLI already exposes the lifecycle, observation, ownership, recovery, log/event, clean, and compact JSON surfaces the skill needs. The main design risk is prompt/skill behavior: undertriggering natural lifecycle requests, overtriggering near-miss prompts, or accidentally telling agents to bypass Launchdeck safety.

## Decisions

### Skill Package Location

- **Recommendation**: Use `.agents/skills/launchdeck-agent/`.
- **Rationale**: Existing project-local skills live under `.codex/skills/<skill>/SKILL.md` and optional `references/`. No `.agents/skills` directory or local `agents/openai.yaml` requirement was found.
- **Alternatives Considered**:
  - `.agents/skills/launchdeck-agent/`: Not present in this repository.
  - A plugin package: Deferred because v0 is a project-local skill package.
- **Source Confidence**: verified

### Skill Shape

- **Recommendation**: Use one trigger-rich root `SKILL.md` plus focused reference files.
- **Rationale**: `skill-creator` recommends progressive disclosure. The spec also rejects six public skills for v0 because competing descriptions would make routing harder.
- **Alternatives Considered**:
  - One long skill body: Higher context cost and harder safety review.
  - Six public skills: Deferred until trigger behavior is proven.
- **Source Confidence**: verified

### Execution Authority

- **Recommendation**: All lifecycle operations in the skill should route through Launchdeck commands.
- **Rationale**: README and CLI help expose `doctor`, `project add`, `status --all`, `ps`, `ports`, `conflicts`, `inspect`, `reconcile`, `start`, `restart`, `stop`, `force-stop`, `logs`, `events`, and `clean`. Runtime code and tests show ownership proof, idempotent registry behavior, external port inspection, and safe clean already exist.
- **Alternatives Considered**:
  - Skill-level shell recipes for PID/port management: Rejected because they would bypass Launchdeck ownership proof.
- **Source Confidence**: verified

### Discovery Method

- **Recommendation**: V0 uses prose rules with confidence labels: `exact`, `strong`, `weak`, and `unknown`.
- **Rationale**: The user-confirmed handoff defers deterministic scanner scripts until evals prove prose discovery is unreliable.
- **Alternatives Considered**:
  - Scanner script bundled in v0: Rejected as premature and outside confirmed scope.
- **Source Confidence**: verified

### Validation Method

- **Recommendation**: Validate via static artifact checks and prompt/eval review, not CLI runtime tests.
- **Rationale**: This feature changes skill guidance, not Launchdeck CLI behavior. Existing CLI tests already cover the runtime surfaces the skill references.
- **Alternatives Considered**:
  - Add Node tests: Not needed unless implementation changes source/runtime code, which is forbidden here.
  - Full skill benchmark loop now: Useful later, but v0 planning requires eval prompt artifacts first.
- **Source Confidence**: verified

### Data Model And Contracts

- **Recommendation**: Do not create `data-model.md` or `contracts/` for this feature.
- **Rationale**: The feature adds Markdown instruction files. It does not introduce persistent application entities, database tables, wire protocols, external APIs, or cross-service contracts.
- **Alternatives Considered**:
  - Model agent route states as data entities: Rejected because route states are instruction semantics, not application data.
- **Source Confidence**: verified

## Standard Stack

- Markdown skill package: root `SKILL.md` plus `references/`.
- Launchdeck CLI: current command surface from `node src/cli.js --help`.
- Existing repository tests: evidence for compact JSON, global runtime visibility, ownership gates, and clean safety.

## Don't Hand-Roll

- Process control: use Launchdeck `start`, `stop`, `restart`, `force-stop`, `reconcile`.
- Port inspection: use Launchdeck `ports`, `conflicts`, `inspect port:<port>`, or `inspect-port`.
- Logs and event evidence: use Launchdeck `logs` and `events`.
- Cleanup: use Launchdeck `clean`, `clean --safe`, or confirmed `clean --all --yes`.
- Trigger/behavior validation: use eval prompts before adding scanner scripts.

## Common Pitfalls

- A passive skill description can undertrigger when the user says "start this project" without naming Launchdeck.
- Broad lifecycle words can overtrigger ordinary code-edit or documentation tasks.
- Raw PID/port commands feel convenient but violate the ownership model.
- Weak evidence discovery can accidentally mutate `.launchdeck.yml`; weak/conflicting evidence must remain proposal-only or confirmation-gated.
- Root skill bodies can become too long; detailed rules belong in references.
- Compact JSON should not be dumped directly to users by default; summarize conclusion, evidence, and safe next action.

## Assumptions Log

- `.agents/skills/launchdeck-agent/` will be picked up by the local skill loader because existing project-local skills use that convention.
- No metadata file beyond `SKILL.md` is required. If implementation discovers a local installer rule, add the minimal required metadata and record it.
- Eval prompt files are enough for v0; executable eval fixtures stay deferred.

## Validation Notes

- Check that all required files exist under `.agents/skills/launchdeck-agent/`.
- Check root `SKILL.md` frontmatter includes `name` and a trigger-rich English/Chinese `description`.
- Check root body routes to references instead of embedding every subflow.
- Check command names against `node src/cli.js --help`.
- Check references do not contain instructions to kill unknown/external processes by PID or port.
- Check eval prompts satisfy SC-001 through SC-005.

## Environment / Dependency Notes

- Node.js `>=20` and existing Launchdeck CLI are repository facts, but this feature does not add runtime dependencies.
- Cross-platform skill prose should avoid OS-specific process commands.
- No dev server should be started for this feature.

## Sources

- `.specify/features/2026-07-09-launchdeck-agent-skill/spec.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/alignment.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/context.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/references.md`
- `.specify/features/2026-07-09-launchdeck-agent-skill/brainstorming/handoff-to-specify.json`
- `.codex/skills/skill-creator/SKILL.md`
- `README.md`
- `src/cli.js`
- `test/cli-contract.test.js`
- `test/cli-control-plane-contract.test.js`
- `test/global-runtime.test.js`
- `test/clean-safety.test.js`
