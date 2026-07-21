# Adoption Flow

Use this for bounded, read-only inspection of a local project that is not clearly Launchdeck-managed. First-release Agent adoption never writes or starts.

## Sequence

1. Call `capabilities.get`, then use `project.list` and bounded project inspection to look for an existing configured project.
2. If no valid lifecycle model exists, call `adoption.inspect` with bounded depth/file limits. Do not run a task.
3. Classify discovered candidates as `exact`, `strong`, `weak`, or `unknown`.
4. Return a proposed lifecycle model and evidence summary only.
5. Tell the user that configuration, registration, and start require a separate manual or future specified workflow. Do not chain them from inspection.

## Adoption Gates

- Existing valid `.launchdeck.yml` plus registry resolution is lifecycle authority; an invalid or unregistered project remains inspection-only.
- Registry/runtime state can identify an already adopted project even when the user did not mention Launchdeck.
- Missing secrets or external dependencies remain reported requirements, never synthesized inputs.
- Multiple plausible launch commands downgrade confidence and remain proposals.

## What Not To Do

- Do not start a dev server directly while discovering.
- Do not write or repair `.launchdeck.yml`, register the project, or call a lifecycle mutation from adoption inspection.
- Do not turn user confirmation into adoption execution authority.
- Do not invent a process manager or registry outside Launchdeck.
- Do not write config from README prose alone when manifests/task files conflict.
- Do not add scanner scripts or executable eval harnesses for v0.
