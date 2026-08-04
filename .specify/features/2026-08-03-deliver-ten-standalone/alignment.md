# Specification Alignment Report: Standalone Sample Project Gallery

**Feature Branch**: `2026-08-03-deliver-ten-standalone`  
**Created**: 2026-08-03  
**Status**: Aligned for planning; consumer-pointer transition pending

## Current Understanding

Deliver exactly ten realistic, standalone sample source projects in the npm package, plus deterministic list/copy access. The projects are neutral test subjects: developers may use Launchdeck to configure and operate copied instances, but samples contain no Launchdeck config, answers, scoring or evaluation. Planning owns product work only in the clean feature worktree.

## Confirmed Facts

- The approved handoff is `handoff-ready` for `sp-specify` with digest `e7e620fe1f707a44a1ad5a8cdeb62732114d146467f00a34b6da6ff233dadb26`, zero hard unknowns and zero conflicts.
- The exact ten IDs/stacks/themes, canonical root, list/copy-only boundary, sample purity, atomic copy rule, npm budgets and Windows/Linux matrix are user-confirmed.
- Live code uses Node >=20 ESM, `LaunchdeckError`, schemaVersion 1 output envelopes, TTY-gated `@clack/prompts`, and no-color/narrow terminal rules.
- The current npm files allowlist excludes examples; current CI covers Windows/macOS/Linux root verification but package checks are Ubuntu-only.
- Existing examples are separately documented and must be preserved.

## Low-Risk Assumptions

- The catalog may choose concrete unique default ports during planning because the approved contract fixes uniqueness and overridability, not specific numbers.
- Existing `@clack/prompts` and output helpers are sufficient until implementation evidence proves otherwise; no new runtime dependency is planned.
- Compatibility proof may use temporary configuration fixtures outside shipped sample roots because this preserves both Launchdeck validation and sample purity.
- Any existing destination, including an empty directory, is rejected as the cross-platform atomic-publication default. This strengthens the approved nonempty-target protection and avoids overwrite/race semantics; reopen if empty-target acceptance is desired.

## Open Questions

No product or planning-critical semantic question remains. One mechanical workflow issue remains: the runtime cannot bind a discussion consumer whose feature directory is outside the source project root.

## Semantic Term Decisions

**Term: real project with source**
- Possible meanings: toy fixture; scored benchmark; standalone application.
- Selected meaning: small but functional standalone application with native install/test/run behavior, deterministic data and a page or API.
- Excluded meanings: Launchdeck-specific fixture, answer key, benchmark or evaluation participant.
- User confirmation: approved discussion digest.

**Term: Launchdeck compatible**
- Selected meaning: an isolated copied instance can receive a reviewable project config and complete applicable setup/build/test/start/health/stop behavior.
- Excluded meaning: shipping `.launchdeck.yml` or Launchdeck wrappers inside the sample.
- User confirmation: approved discussion clarification.

**Term: copy**
- Selected meaning: local package-to-filesystem source-tree publication.
- Excluded meanings: clipboard operation, network download, install, build, run, Git init or config authoring.
- User confirmation: approved discussion scope.

## Upstream Intent Disposition

| Signal | Source | Disposition | Artifact Location | Confirmation | Reopen Trigger |
| --- | --- | --- | --- | --- | --- |
| broad/popular project types | user discussion / MP-002 | preserved | spec confirmed scope | yes | changing exact ten |
| Launchdeck config/lifecycle testing | user discussion / MP-009 | preserved via external fixture | FR-008, AC-003/009 | yes | moving proof into sample |
| developer self-testing, no score | user correction / MP-001/003 | preserved | overview, FR-003 | yes | any evaluation behavior |
| list and copy npm access | approved handoff MP-004/005 | in scope | FR-009..015 | yes | new command behavior |
| package and cross-platform gates | MP-007/008 | in scope | FR-016..019 | yes | threshold or OS change |

## Deferred Or Dropped Intent

- macOS native matrix -> no approved evidence commitment -> confirmed deferral -> reopen with explicit user request and repeatable lane.
- Remote download/update, automatic install/run/config, scoring/evaluation and additional sample commands -> explicitly out of scope -> reopen only through a new product decision.
- A smaller MVP inventory -> rejected because it narrows the confirmed exact ten -> reopen only if the user changes scope.

## Out-Of-Scope Conflicts

| Upstream Signal | Source | Spec Disposition | Reason | User Confirmation | Reopen Trigger |
| --- | --- | --- | --- | --- | --- |
| write `.launchdeck.yml` | early discussion wording | narrowed to temporary copied instances | later correction requires neutral distributed source | approved digest | user requests shipped config |
| compile/run/stop | early discussion wording | compatibility proof, not copy side effect | copy must remain safe and offline | approved digest | user requests automation |
| various project types | early broad wording | exact ten approved entries | handoff locks inventory | approved digest | inventory change |
| evaluation/score | inferred test-suite framing | out of scope | user explicitly rejected participation in scoring | approved digest | new evaluation product decision |

## Discussion Decision Digest

### Locked Direction

- Ten offline, packaged, standalone projects plus catalog/list/copy; source: approved handoff; rationale: credible self-testing without repository clone; mapping: `spec.md#confirmed-scope`.
- External compatibility proof; source: MP-003/009; rationale: keep samples neutral while proving Launchdeck value; mapping: FR-008 and AC-003/009.

### Rejected Alternatives

- Scored benchmark, Launchdeck-configured fixtures, remote gallery, automatic install/run, smaller inventory; reopen only through explicit user scope change.

### Accepted Tradeoffs

- Larger tarball and heavier dual-platform CI are accepted; CA-001 and CA-002 prevent solving cost or failures by reducing scope or skipping evidence.

### Experience Commitments

- Existing CLI/TUI grammar, explicit automation ID, searchable TTY selector, typed cancellation, no-color/narrow width, destination preview and post-rename receipt; mapping: `ui-brief.md`.

### Review Criteria Carry-Forward

- Exact inventory, sample purity, real native behavior, external Launchdeck lifecycle proof, atomic rollback, package equality and no skip-based CI success.

### Must Not Dilute

- Do not convert applications into stubs, move Launchdeck artifacts into sample roots, omit a required stack or OS, or claim evaluation/macOS support.

## Design System Readiness

- `design_system_status: ready`
- `design_risk_level: medium`
- `DESIGN.md source: sha256:2c0d7b74b07d861e123a8c5619b0165907d1b32151b384b4aa2e87a7ea54f2aa`
- Blocker: none. Soft risks are automation prompt leakage, hidden cancel/no-match states, narrow output and color-only signals.

## UI Brief Carry-Forward

- `ui_reference_processing_status: not-applicable`
- `ui_reference_lane_mode: none`
- `ui_fidelity_mode: none`
- `ui_reference_notes: none`
- `ui_brief: ui-brief.md`
- `ui_target: none`
- `ownership_classification: project-owned`
- `Reference-Implementation activated: false`
- Required evidence: 60/120-column human captures, no-color states, keyboard/no-match/cancel tests, JSON/compact single-object snapshots, destination conflict and rollback receipts.

## Must-Preserve Coverage

- Coverage Status: complete
- Planning Gate Status: handoff-ready
- Hard Unknown Count: 0
- Open Conflict Count: 0

`MP-001..MP-010` are mapped in `spec.md#must-preserve-discussion-inputs` and protected by `spec-contract.json#/must_preserve_refs`. Any inventory reduction, sample contamination, command expansion, unsafe copy, package-gate weakening, OS skip or edit outside the approved clean worktree requires stop-and-reopen.

## Consequence Completeness

- Gate status: ready
- Resolved obligations: `CA-001` package size, `CA-002` OS/sample failure, `CA-003` copy rollback, `CA-004` source/package equality.
- Entrypoint inventory: 12 reachable material results, each exactly once adapted with acceptance and CA refs; recoverable user-input states include explicit interaction contracts.
- Unresolved planning blockers: none.
- Workflow-only blocker: cross-worktree consumer binding.
- Required next workflow after transition repair: `/sp.plan`.

## Readiness Decision

**Decision**: Aligned: ready for plan.

**Reason**: scope, semantics, capabilities, acceptance closure, entrypoint outcomes, design evidence, MP obligations and CA obligations are complete with empty `semantic_delta`. Planning must not begin until the runtime-owned discussion compatibility pointer is bound or the target path is explicitly realigned; this is a transition-integrity requirement rather than a specification ambiguity.
