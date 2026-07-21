## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.

Trigger: before marking a discussion contract ready or when review/consumption reports an integrity blocker.

Purpose: validate and repair the canonical agent-only contract without producing duplicate handoff views.

Preserved Contract: ready status requires a coherent boundary, complete coverage, zero hard unknowns/open conflicts, exact digest confirmation, and at least one eligible consumer.

## Handoff Assessment

After an explicit handoff request, classify the discussion as:

- `continue-discussion`: a product decision, target boundary, hard unknown, conflict, or required evidence is still unresolved;
- `ready-for-contract`: one coherent scope is mature enough to write canonical JSON;
- `blocked`: external/user-owned evidence prevents a safe contract.

Do not create the contract before explicit request and boundary lock.

## Deterministic Self-Review

Use `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@6fbbf08a0b6833bb783ec6b418d567776b197ae4 specify discussion validate-handoff '<slug>' --json`. Validate schema/version, goal/scope, consumer eligibility, context boundary, implementation target, evidence shape, `MP-*`/`CA-###` coverage, planning/coverage gates, unknown/conflict counts, and the protected digest.

Use agent review only for judgment that deterministic validation cannot decide: whether the selected direction matches user intent, whether a soft unknown is genuinely non-blocking, or whether a tradeoff/reopen condition is truthful.

## Human Confirmation

Present the decision, recommended consumer, approved and excluded scope, important protected obligations, unresolved non-blocking assumptions, and current digest in the visible reply. The JSON remains agent-only; do not persist a reviewer guide or Markdown rendering.

Mark ready only after the user confirms the current digest.

## Repair

On handoff request-changes repair or `blocked_by_handoff_integrity`, update canonical JSON, preserve still-valid IDs and evidence refs, recompute `review_digest`, rerun validation, and request confirmation again. Return field-level validation errors or a compact blocker with cause, safe retry, and stop condition when repair cannot complete.

The repair belongs to `sp-discussion`; consumers block instead of patching upstream truth.
