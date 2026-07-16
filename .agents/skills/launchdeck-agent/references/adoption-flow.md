# Adoption Flow

Use this when the user wants to operate a local project that is not yet clearly Launchdeck-managed.

## Sequence

1. Reuse first: check for `.launchdeck.yml`, then Launchdeck registry and runtime evidence with compact observations such as `launchdeck projects --json --compact`, `launchdeck status --all --json --compact`, `launchdeck ps --all --json --compact`, and `launchdeck ports --json --compact`.
2. If no valid lifecycle model exists, perform read-only discovery using `discovery-rules.md`. Do not run a long-running task before adoption.
3. Classify discovered candidates as `exact`, `strong`, `weak`, or `unknown`.
4. For `exact` or `strong`, create or repair `.launchdeck.yml` only within the user's project and keep the model minimal.
5. For `weak`, `unknown`, or conflicting evidence, propose the lifecycle model and ask for confirmation before writing config.
6. Run `launchdeck doctor --json --compact` after a model exists and before managed execution.
7. Register the project after the model is valid: `launchdeck project add <path> --json --compact`.
8. Start only through Launchdeck after adoption, then summarize target, status, port/URL when known, evidence, and control commands.

## Adoption Gates

- Existing `.launchdeck.yml` is lifecycle authority unless invalid; repair through evidence and `doctor`.
- Registry/runtime state can identify an already adopted project even when the user did not mention Launchdeck.
- Missing secrets or external dependencies block managed start; report the missing requirement and safe next action.
- Multiple plausible launch commands downgrade confidence and require proposal/confirmation.

## What Not To Do

- Do not start a dev server directly while discovering.
- Do not invent a process manager or registry outside Launchdeck.
- Do not write config from README prose alone when manifests/task files conflict.
- Do not add scanner scripts or executable eval harnesses for v0.
