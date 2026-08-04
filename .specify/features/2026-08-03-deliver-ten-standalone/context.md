# Planning Context: Standalone Sample Project Gallery

**Feature Branch**: `2026-08-03-deliver-ten-standalone`  
**Created**: 2026-08-03  
**Status**: Specification aligned; transition pointer pending  
**Derived From**: approved discussion digest, `spec-contract.json`, `spec.md`, `alignment.md`, live repository evidence and `DESIGN.md`

## Planning Context

- Plan an additive ten-project gallery, CLI list/copy surfaces, package distribution and cross-platform verification. Do not edit product source in the original dirty workspace.
- Product semantics are closed; `semantic_delta` is empty. Preserve all MP/CA refs and the exact one-pair acceptance coverage.
- The next workflow is `/sp.plan` after the runtime-owned discussion compatibility pointer can be bound.

## Relevant Repository Context

- `src/cli.js:111-271` owns dispatch and errors; `3988-4347` owns argv/help. The new `example` family must integrate there without changing unrelated command behavior.
- `src/output.js:8-129` owns schemaVersion 1 success/failure/compact envelopes and single-object JSON.
- `src/errors.js:1-111` owns public error normalization.
- `src/agent/lifecycle-prompter.js:15-77` is the current searchable prompt/cancellation precedent.
- `package.json` uses a files allowlist that currently excludes examples; `prepack` and `package:check` are existing distribution hooks.
- `.github/workflows/ci.yml` has Windows/macOS/Linux root verification but only Ubuntu package checks; the new gallery needs explicit Windows/Linux sample lanes.
- Existing sample assets remain under `examples/demo-api`, `examples/hands-on-demo` and two standalone config examples.

## Existing Patterns And Reuse Notes

- Reuse `LaunchdeckError` aliases so invalid syntax normalizes to `command_usage_error`; add stable example-specific codes only where callers need to distinguish unknown ID, conflict, cancellation or filesystem failure.
- Reuse `createSuccessEnvelope`, `createFailureEnvelope` and compact output. JSON/non-TTY paths must bypass prompts.
- Reuse the existing `@clack/prompts` autocomplete/select cancellation grammar rather than adding a prompt dependency.
- Reuse receipt-like human output, no-color detection, terminal-width wrapping and existing visual test capture style.
- Reuse actual `npm pack` verification, but extend it from dry-run metadata to tarball inventory, digest and hard size assertions.
- Compatibility fixtures may follow the current copied-project acceptance precedent described in README, while remaining outside shipped sample roots.

## Integration Boundaries

- Inputs: packaged gallery catalog, sample ID, optional destination, TTY state, JSON/compact/no-color flags and destination filesystem.
- Outputs: human catalog/receipt or one JSON envelope; on successful copy, one published source tree.
- Trust boundaries: package-owned source path must be resolved from catalog, never caller-supplied traversal; destination and parent object types, symlinks/reparse points and existence must be checked.
- Filesystem lifecycle: validate -> same-parent staging -> recursive copy -> atomic rename -> receipt; any failure -> cleanup -> typed outcome.
- Sample runtime boundary: native dependency install/build/run occurs only in isolated CI cells or after the user enters a copied project, never as a copy side effect.
- Launchdeck compatibility boundary: temporary config and runtime state belong to isolated copies and external test fixtures.

## Product Boundary Constraints

- Exact ten projects and list/copy-only command surface.
- No sample config, dependency on Launchdeck, evaluation, score, answer, telemetry, network service or secret.
- Root install must not install sample dependencies or make them workspaces.
- Packed <=5 MiB; unpacked <=20 MiB.
- Windows and Linux are required; macOS is unclaimed.
- Existing examples and unrelated CLI/Agent/MCP/runtime behavior are preserved.
- Product changes only in the approved clean feature worktree.

## Affected Object Map

| Obligation | Object / State Surface | Owner | Consumers | Live Evidence | Coverage Gap |
| --- | --- | --- | --- | --- | --- |
| CA-001 | npm tarball inventory and size | package scripts/tests | npm users, release CI | package.json; repository-contract tests | none |
| CA-002 | each sample native and Launchdeck lifecycle | sample + CI lane | developers, maintainers | CI workflow; README acceptance precedent | implementation pending |
| CA-003 | destination, staging and publication state | example copy operation | CLI humans/automation | installer copy precedent; CLI outcome contracts | new fault injection needed |
| CA-004 | catalog/source/copied/tarball equality | catalog + package gates | list, copy, docs, npm | current files allowlist/package tests | new snapshot gate needed |

## Consequence Notes

- `CA-001`: if size fails, first remove generated, vendored, binary or unnecessary weight; scope reduction requires upstream reopen.
- `CA-002`: OS/sample failure must be repaired; skip, wrapper or test removal is not an acceptable resolution.
- `CA-003`: partial copy or staging residue is release-blocking; cleanup evidence covers copy, rename and cancellation.
- `CA-004`: any mismatch among repository source, catalog, copied result or npm tarball blocks release.
- Every adapted CLI outcome is linked to AC-010/011 and CA-003/004 in the canonical entrypoint outcome contract.

## Dependency Impact Table

| Obligation | Upstream / Downstream Surface | Impact | Required Handling |
| --- | --- | --- | --- |
| CA-001 | package files allowlist -> npm tarball | new source volume and release threshold | actual pack, metadata threshold, forbidden-file scan |
| CA-002 | toolchain matrix -> sample commands -> Launchdeck lifecycle | ten ecosystems across two OSes | locked installs, native tests, health checks, finally cleanup, no skips |
| CA-003 | catalog path -> destination parent -> staging -> rename | local filesystem mutation | trusted source resolution, same-filesystem staging, fault injection |
| CA-004 | catalog -> list/copy/docs/tests/tarball | one-to-many metadata propagation | derive consumers and compare content hashes |

## Change Propagation Matrix

| Change Surface | Upstream Inputs | Downstream Consumers | Constraint / Risk |
| --- | --- | --- | --- |
| gallery catalog | approved exact ten | CLI list/copy, README, package tests, CI | duplicate inventory or score fields forbidden |
| sample source tree | stack-native contracts | copy output, tarball, lifecycle lanes | locks, seed determinism, no runtime artifacts |
| CLI dispatch/parser/help | existing command grammar | humans, scripts, JSON tests | unknown flags, TTY gating and compact shape |
| copy filesystem service | catalog source + destination | final tree and receipts | traversal, symlink/reparse, residue |
| package allowlist/prepack | catalog/source tree | npm consumers | size and source equality |
| CI workflow | sample requirements | release gate | platform availability, caching and no skip policy |
| README/gallery docs | catalog | developers | gallery-level Launchdeck guidance only; native README purity |

## Locked Decisions Carry-Forward

- Keep all ten IDs/stacks/themes, source root, minimal catalog fields, independent licenses and native READMEs.
- Treat compatibility proof as external to source, not permission to ship config.
- Preserve explicit-ID automation, TTY-only searchable selection, rejection of existing destinations and atomic publication.
- Keep hard npm budgets and Windows/Linux evidence.
- Preserve existing examples and leave macOS unclaimed.

## Discussion Decision Carry-Forward

- **Locked Direction**: offline packaged real-source gallery plus list/copy; plan as one coherent release slice.
- **Rejected Alternatives**: scoring, sample-side config, remote download, automatic install/run and smaller inventory must not reappear without reopen.
- **Accepted Tradeoffs**: package size and CI cost are intentional; CA gates control them.
- **Experience Commitments**: existing CLI grammar, keyboard-first selector, typed cancel/no-match/error, no-color and narrow width.
- **Review Criteria Carry-Forward**: exact inventory, native realism, Launchdeck lifecycle proof, package equality, rollback and no skips.
- **Must Not Dilute**: do not replace real projects with stubs or validation with documentation-only claims.

## Design References and Gaps

- `design_system_requirements`: reuse existing CLI/TUI command, prompt, output, receipt, keyboard and no-color patterns.
- `DESIGN.md`: CLI/TUI rules at lines 130-164; source digest `2c0d7b74b07d861e123a8c5619b0165907d1b32151b384b4aa2e87a7ea54f2aa`.
- Reference gaps: no dedicated example flow exists; adapt the verified Agent lifecycle selector and output tests.
- Platform notes: validate 60/120 columns, Windows and Linux terminals, no-color, JSON and compact modes.

## UI Reference Inputs

- UI reference notes: none; no external source.
- UI brief: `ui-brief.md`.
- Visual target: none.
- Reference ownership: project-owned live CLI patterns.
- Fidelity mode: none.
- Must preserve: automation silence, schemaVersion 1, typed states, narrow/no-color readability.
- May adapt: table widths, prompt helper composition and receipt wording.
- Must not: add second interaction grammar, card-like decoration, color-only status or copy side effects.
- Human review condition: no mandatory human visual approval; read-only agent capture review is required by risk gate.

## Must-Preserve Carry-Forward

- `MP-001..003`: real neutral projects, exact inventory and no evaluation/config contamination.
- `MP-004..006`: list/copy only, explicit versus TTY interaction and atomic filesystem safety.
- `MP-007..009`: npm snapshot/size, Windows/Linux evidence and realistic native plus Launchdeck lifecycle proof.
- `MP-010`: original dirty workspace remains untouched by product edits.
- Stop and reopen on inventory reduction, sample-side Launchdeck artifacts, new command side effects, package threshold weakening, OS skip, macOS claim or target-workspace change.

## Canonical References

- `spec-contract.json` is canonical for scope, acceptance, decisions, design and entrypoint outcomes.
- `spec.md` is the rendered requirements view; `alignment.md` records upstream dispositions; `ui-brief.md` owns CLI/TUI experience.
- Discussion source: `F:/github/launchdeck/.specify/discussions/discussion/handoff-to-specify.json`, digest `e7e620fe1f707a44a1ad5a8cdeb62732114d146467f00a34b6da6ff233dadb26`.
- Live implementation contracts: `package.json`, `src/cli.js`, `src/output.js`, `src/errors.js`, `src/agent/lifecycle-prompter.js`, CI and targeted tests.
- Project cognition is stale/unavailable; live repository reads remain the fact source.

## Outstanding Questions

No product, scope, acceptance or planning-critical question is open. Consumer binding across an external worktree is the sole workflow transition issue and requires a target-path or runtime-policy decision before formal stage completion.

## Deferred / Future Ideas

- macOS native matrix after explicit user confirmation and repeatable evidence.
- More samples, remote catalogs, updates, automatic execution or evaluation only through a new scoped feature.
- A general reusable filesystem-copy service may be extracted during planning only if required by CAP-005 and without broadening the public surface.
