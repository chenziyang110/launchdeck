# launchdeck Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-07-09

## Active Technologies

- Bootstrap context only; run specify -> plan to capture active technologies

## Project Structure

```text
.specify/
features/
```

## Commands

specify check
specify --help

## Code Style

General: Follow existing repository conventions and refresh this file after the first plan.

## Recent Changes

- Initial Spec Kit Plus scaffolding

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

<!-- SPEC-KIT:BEGIN -->
## Spec Kit Plus Managed Rules

- `[AGENT]` marks an action the AI must explicitly execute.
- `[AGENT]` is independent from `[P]`.

## Always-On Context

- Project cognition and Project Learning are always available, even without an active `sp-*` workflow.
- When existing-system truth matters, use project cognition before broad source inspection and use its results to narrow live reads.
- Run `specify learning start --command <workflow> --format json` before non-trivial decisions that depend on local conventions, constraints, or past lessons; expand only selected matching Learning through `show_argv`.

## Workflow Recommendations

- Do not auto-enter an `sp-*` workflow unless the user invokes it.
- Recommend `sp-discussion` for open-ended requirement exploration, `sp-specify` for formal alignment, `sp-deep-research` for feasibility proof, and `sp-debug` for root-cause diagnosis.
- If the user invokes an `sp-*` workflow, follow that workflow's own contract.

## Command Surface Rules

- Treat live `specify --help` output as the authoritative CLI surface.
- Before suggesting or running a `specify <subcommand>` invocation, verify that help exposes it.
- Do not invent unsupported CLI names such as `specify create-feature`.
- Feature creation uses the generated create-feature script at `.specify/scripts/bash/create-new-feature.sh` or `.specify/scripts/powershell/create-new-feature.ps1`; default feature workspace names use `YYYY-MM-DD-<slug>`.

## Durable State

- When resuming generated work, prefer durable workflow state and explicit feature paths over branch name or chat memory.
- For `sp-discussion`, default ordinary replies and acknowledgements to frontstage-only deferred persistence: do not write discussion files, counters, dirty markers, receipts, or status summaries for every user reply; flush only at semantic checkpoints, user-triggered checkpoints/saves, compaction risk, or lifecycle transitions. After several unsaved turns, mention the unsaved turn count and suggest `checkpoint, continue`; the prompt does not write files by itself.
- Keep project cognition freshness truthful after changes to architecture, ownership, workflow names, integration contracts, or verification entry points.
- Store reusable lessons through Project Learning, not only in chat or task artifacts.

- Preserve content outside this managed block.
<!-- SPEC-KIT:END -->