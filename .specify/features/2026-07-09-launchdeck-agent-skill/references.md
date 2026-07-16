# References: Launchdeck Agent Skill

## Discussion Sources

- `.specify/discussions/launchdeck-agent-skill-suite/handoff-to-specify.md`: user-confirmed requirement contract, Must-Preserve ledger, CA obligations, and target boundary.
- `.specify/discussions/launchdeck-agent-skill-suite/handoff-to-specify.json`: machine-readable handoff mirror.
- `.specify/discussions/launchdeck-agent-skill-suite/requirements.md`: product requirements, non-goals, success signals, routing, adoption, discovery, command, recovery, clean, eval, and package requirements.
- `.specify/discussions/launchdeck-agent-skill-suite/technical-options.md`: selected one-router package, reference responsibilities, script stance, and draft skill content.
- `.specify/discussions/launchdeck-agent-skill-suite/project-context.md`: verified foundation and product implication.
- `.specify/discussions/launchdeck-agent-skill-suite/open-questions.md`: soft unknowns and resolved defaults.
- `.specify/discussions/launchdeck-agent-skill-suite/discussion-log.md`: timestamped decisions from rough idea through handoff-ready confirmation.

## Repository Sources

- `package.json`: Launchdeck is a Node.js ESM CLI with `launchdeck` bin and `node --test` verification.
- `README.md`: documents the control plane, registry, command reference, safety model, compact JSON, and examples.
- `src/cli.js`: exposes lifecycle, registry, observation, recovery, clean, JSON, and compact command surface.
- `test/cli-contract.test.js`: verifies compact output and JSON envelope behavior.
- `test/cli-control-plane-contract.test.js`: verifies public error codes and compact next actions.
- `test/global-runtime.test.js`: verifies global registry, ports, external ownership inspection, duplicate-start idempotency, and run identity.
- `test/clean-safety.test.js`: verifies clean dry-run, safe-only clean, risky confirmation, and unsafe target refusal.

## Local Skill Convention Evidence

- `.codex/skills/` contains existing project-local skills.
- Existing skills use `SKILL.md` and optional `references/`.
- `.agents/skills/` was not found.
- No `agents/openai.yaml` or `openai.yaml` metadata file was found under existing `.codex/skills`.

## Project Cognition

Project cognition compass was run during specification intake and again during planning intake. Planning intake returned `readiness=review`, `compass_state=usable_with_review`, and minimal live reads: `package.json`, `src/runtime.js`, and `.planning/quick/2026-07-08-global-runtime-supervisor/STATUS.md`.

The project cognition state is advisory only. Live repository reads above are authoritative for current claims.
