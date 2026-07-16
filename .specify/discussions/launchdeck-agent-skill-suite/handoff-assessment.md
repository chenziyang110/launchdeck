# Handoff Assessment: Launchdeck Agent Skill Suite

- assessed_at: 2026-07-09T16:29:56+08:00
- decision_status: ready-for-specify
- required_next_action: write-unified-handoff
- discussion_slug: launchdeck-agent-skill-suite
- recommended_consumer: sp-specify

## Verdict

The discussion is ready for `sp-specify` as one coherent requirement boundary: create a v0 `launchdeck-agent` skill package that lets coding agents route natural local project lifecycle intent through Launchdeck.

The scope is mature enough because the discussion has locked the product goal, implementation target, non-goals, safety model, v0 package shape, routing behavior, adoption flow, discovery rules, command flows, recovery playbooks, clean safety boundaries, and eval prompts.

## Assessment Dimensions

| Dimension | Status | Rationale |
| --- | --- | --- |
| Feature coherence | ready | The scope is one skill package with bundled references, not a mixed CLI/MCP/GUI effort. |
| Implementation target clarity | ready | Target project is `F:/github/launchdeck`; likely target surface is project-local skill content under `.codex/skills/launchdeck-agent/`. |
| Current repository role | ready | Current repo is the Launchdeck CLI product and future agent skill integration surface. |
| Reference source clarity | ready | Requirements, technical options, project context, open questions, and live evidence all point to the same v0 direction. |
| Planning shape | ready | Downstream should specify one package and reference files, not implementation phases or separate public skills. |
| Validation shape | ready | Eval groups and success signals are defined: trigger, non-trigger, behavior/safety, and compact-output cases. |
| Risk profile | ready with constraints | Lifecycle and destructive-operation risks are identified and carried as must-preserve safety obligations. |

## Blocking Unknowns

No hard unknowns block `sp-specify`.

Soft unknowns remain and should be carried into the spec, not reopened in discussion:

- Exact install path and packaging convention for project-local skill distribution.
- Whether high-confidence `.launchdeck.yml` authoring is fully automatic or proposal-first in every environment.
- Whether v0 supports monorepos beyond a single current project root.
- Exact threshold for promoting reference subflows into separate public skills after evals.

## Source Basis

- `requirements.md`: product requirements, non-goals, success signals, and v0 skill-package requirements.
- `technical-options.md`: selected v0 package shape, router skeleton, reference responsibilities, safety flows, and eval contract.
- `project-context.md`: verified Launchdeck CLI foundation and current repository boundary.
- `open-questions.md`: remaining soft unknowns and resolved defaults.
- Live evidence: `README.md`, `src/cli.js`, `src/runtime.js`, and `test/cli.test.js` confirm Launchdeck already provides the CLI foundation for registry, lifecycle commands, inspect/reconcile, logs/events, clean, ownership proof, and compact JSON.

## Required Next Action

Write one unified draft handoff pair:

- `.specify/discussions/launchdeck-agent-skill-suite/handoff-to-specify.md`
- `.specify/discussions/launchdeck-agent-skill-suite/handoff-to-specify.json`

The pair must remain draft/user-review until the user confirms it as handoff-ready.
