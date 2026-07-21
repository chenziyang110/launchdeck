## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.


Trigger: when writing or refreshing planning-ready specification outputs.

Purpose: keep one agent authority while retaining project-facing documents only when they provide independent review value.

Preserved Contract: confirmed scope, acceptance proof, decisions, evidence, fidelity, and consequence obligations remain planning-ready and traceable.

## Artifact Writing Contract

Write `spec-contract.json` first from `.specify/templates/spec-contract-template.json`.

- Store target need, in/out/deferred scope, constraints, objective acceptance criteria, locked decisions, `semantic_delta`, protected obligation refs, context capsule, unresolved items, artifact refs, and the agent phase transition.
- Store `acceptance_coverage` as unique one-pair rows from canonical `scope.in` or `capability_operations` JSON Pointers to canonical `acceptance_criteria` JSON Pointers. Every requirement must appear at least once; every criterion must appear exactly once and therefore cannot close multiple independent requirements.
- Render `spec.md` from the contract as the primary project-facing specification.
- Write `alignment.md` only when semantic mapping, upstream disposition, conflict, deferral, fidelity, or readiness analysis has content that maintainers need to review independently.
- Write `context.md` only when repository placement, reuse, integration, propagation, or boundary evidence cannot be represented adequately by stable refs in the context capsule.
- Write `references.md` only when external or retained references materially shape behavior or proof.
- Produce requirements diagnostics from deterministic validation; persist `checklists/requirements.md` only when compatibility or human review requires it.
- Keep `workflow-state.md` as sparse resume state, not a copy of specification truth.
- When compatibility requires `brainstorming/handoff-to-specify.json`, make it a pointer-only agent transition: `source_contract`, `review_digest`, `semantic_delta`, required refs, blockers, and next action.

Preserve reference fidelity and `CA-###`/`MP-*` obligations by stable ref. Copy a full obligation body only when the next phase cannot safely act from the reference.

## Extension Hooks

After the completion report, check whether `.specify/extensions.yml` exists.

- If it exists, read entries under `hooks.after_specify`.
- If YAML cannot be parsed, skip hook execution guidance silently.
- Filter out hooks where `enabled` is explicitly `false`.
- Treat hooks without `enabled` as enabled.
- Do not evaluate non-empty hook conditions directly; leave condition evaluation to the HookExecutor implementation.
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable.
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation.
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.
