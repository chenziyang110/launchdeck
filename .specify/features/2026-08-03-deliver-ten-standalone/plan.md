# Implementation Plan: Standalone Sample Project Gallery

**Branch**: `2026-08-03-deliver-ten-standalone` | **Date**: 2026-08-03 | **Spec**: `spec.md`
**Input**: Approved feature contract `spec-contract.json` at `sha256:7b6cf832edcdd1f1dbdb88cd3428d9a68b4091fec21807e528737af7e18d2154`.
**Planning mode**: Heavy/adaptive with two native Codex planning lanes; research was not needed because all implementation-shaping unknowns were resolved by the approved spec and bounded live repository evidence.

## Summary

Ship an offline, npm-packaged gallery of exactly ten real standalone projects. `launchdeck example list` renders the single catalog for humans or schema-versioned automation, and `launchdeck example copy` publishes a selected source tree through same-parent staging plus atomic rename. Samples contain no Launchdeck configuration, dependency, questionnaire, evaluation, scoring, or telemetry; developers copy them and test Launchdeck themselves. Release proof combines exact package inventory and size gates with native and Launchdeck lifecycle matrices for every sample on Windows and Linux.

## Locked Planning Decisions

- The inventory is exactly: `vite-react-habit-tracker`, `nextjs-blog-manager`, `nestjs-url-shortener`, `fastapi-inventory`, `django-events`, `go-webhook-inbox`, `spring-boot-orders`, `aspnet-library-catalog`, `docker-compose-helpdesk`, and `node-python-issue-tracker`.
- Samples are realistic, stack-native, independently runnable/testable source projects. They do not participate in Launchdeck evaluation or scoring and do not ship `.launchdeck.yml`.
- The new command family is list/copy only. Copy never installs, runs, initializes Git, downloads, authors Launchdeck config, or mutates Launchdeck runtime state.
- The catalog is the only inventory authority for CLI, docs, package checks, and matrices.
- Copy is fail-closed: reject unsafe/existing targets before staging, stage in the destination parent, publish once with atomic rename, and clean owned residue on failure.
- The npm package must include all ten sources while staying at or below 5 MiB packed and 20 MiB unpacked; size pressure never justifies silently reducing scope.
- Compatibility claims require every sample on Windows and Linux. macOS evidence is explicitly deferred and must not be implied by unrelated CI.
- Existing example assets and product behavior remain preserved. Implementation occurs only in the clean target worktree; the original dirty workspace remains untouched.
- CLI/TUI work reuses the repository design grammar, `@clack/prompts`, existing output envelopes, no-color behavior, and narrow-terminal support.

## Complete-First Delivery Scope

The complete delivery is one catalog, all ten named source projects, list and safe-copy behavior, npm inclusion/size enforcement, documentation, and the full Windows/Linux native plus Launchdeck lifecycle proof. Waves may order this work, but no wave is a pilot, MVP, optional stack, or deferred delivery slice.

- **Scope denominator**: `CAP-001..CAP-006`, `MP-001..MP-010`, `CA-001..CA-004`, and all `AC-001..AC-012`.
- **Inventory denominator**: ten fixed IDs, stacks, and themes from `spec.md#Confirmed Scope *(mandatory)*`.
- **Outcome denominator**: all twelve entries under `spec-contract.json#/entrypoint_outcome_contract`.
- **Platform denominator**: Windows and Linux for all ten native cells and all ten Launchdeck compatibility cells.
- **Allowed sequencing**: contract/catalog → sample authorship → list/copy → package/docs → matrices → release closeout.
- **Scope reduction rule**: complexity, package pressure, ecosystem friction, or a failing OS cell triggers repair/replanning, never an unapproved skip.

## User-Confirmed Deferral Contract

| Confirmation Source | Exact Excluded Behavior | Residual Risk | Reopen Or Stop Condition | Downstream Artifact |
| --- | --- | --- | --- | --- |
| Approved discussion and `spec.md#User-Confirmed Deferrals` | Native and Launchdeck gallery compatibility claims for macOS | Users must not infer macOS support from existing unrelated `macos-latest` CI | Reopen only on an explicit request plus repeatable macOS matrix design; stop any macOS support wording before that evidence exists | `plan-contract.json#/user_confirmed_deferrals/0` and future tasks/CI |

Additional commands, remote gallery updates, automatic install/run, more samples, and evaluation/scoring are confirmed out of scope rather than hidden delivery slices. Any attempt to add them requires a new product decision.

## Must-Preserve Carry-Forward

| MP ID | Type | Planning Obligation | Plan Location | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- |
| MP-001 | product boundary | Keep gallery non-evaluative and non-scoring | Summary; Constitution | Any sample or command participates in Launchdeck assessment |
| MP-002 | scope | Deliver the exact ten projects | Complete-First Scope; Project Structure | Any ID/stack/theme is removed, merged, replaced, or added |
| MP-003 | purity | Keep sample sources free of Launchdeck config/dependencies/artifacts | Constitution; validation gates | Any source/copy/tarball purity mismatch |
| MP-004 | command surface | Add only `example list` and `example copy` | Interface map; contracts | Install/run/update/delete behavior is proposed |
| MP-005 | interaction | Preserve explicit scripting plus searchable TTY selection | UI Brief; Operational Design | Prompt appears in JSON/non-TTY or no-match/cancel is hidden |
| MP-006 | safety | Atomic copy, no overwrite/merge, complete rollback | Operational Design; data model | Partial target/staging or fallback non-atomic publication |
| MP-007 | packaging | Exact npm snapshot and 5/20 MiB gates | Validation; package interface | Tarball drift or budget breach |
| MP-008 | platform | Require Windows/Linux and make no macOS claim | Deferral; validation matrix | A required OS cell is skipped or macOS is implied |
| MP-009 | realism | Use realistic native projects and external Launchdeck lifecycle proof | Scenario Profile; quickstart | Launchdeck-only wrappers/configs enter sample source |
| MP-010 | boundary | Work only in clean target worktree | Target Boundary | Product changes appear in original dirty workspace |

## Capability Preservation Plan

| Capability Operation | Upstream Source | Selected Entry Point | Owning Surface | Required Implementation | Acceptance Proof | Reopen Or Conflict Condition |
| --- | --- | --- | --- | --- | --- | --- |
| CAP-001 author-gallery-catalog | `spec-contract.json#/capability_operations/0` | private loader + packaged data | `src/examples/catalog.js`, gallery catalog | Exact-ten schema, unique IDs/ports, confined real sources | catalog/source contract tests | Parallel inventory or scoring metadata appears |
| CAP-002 deliver-standalone-samples | `/capability_operations/1` | copied source trees | `examples/sample-projects/*` | Native manifests/locks/licenses/seeds/tests/health/persistence | static purity plus native matrices | Any sample is fake, wrapper-only, or deferred |
| CAP-003 verify-launchdeck-compatibility | `/capability_operations/2` | external validation fixture | test/scripts and isolated temp copies | Candidate config outside source; doctor/build/test/start/health/stop | 10 × 2 OS Launchdeck cells | Config leaks into source or a cell is skipped |
| CAP-004 list-examples | `/capability_operations/3` | public CLI | `launchdeck example list` | Human and schemaVersion 1 JSON/compact from one catalog | output/width/non-TTY tests | Human and machine inventories diverge |
| CAP-005 copy-example-safely | `/capability_operations/4` | public CLI + TTY selector | `launchdeck example copy` | Explicit ID/default destination, selector, staging, atomic rename | twelve-outcome and fault matrix | Overwrite, network, install, or residue appears |
| CAP-006 publish-and-gate-gallery | `/capability_operations/5` | npm package and CI | package allowlist/checks/workflow | Exact tar inventory/digests/size plus Windows/Linux matrices | actual `npm pack`, native and Launchdeck evidence | Scope is reduced to make a gate pass |

## Implementation Target Boundary

- **Source project root**: `F:\github\launchdeck` supplies the approved spec, design system, and live repository evidence; its pre-existing dirty changes are user-owned and remain untouched.
- **Implementation target root**: `F:\github\launchdeck\.tmp\worktrees\sample-project-gallery`, branch `2026-08-03-deliver-ten-standalone`.
- **Target roles**: Launchdeck CLI and package are the distribution surface; `examples/sample-projects` owns independent sample sources; external fixtures/CI own compatibility evidence.
- **Target paths**: `src/examples/*`, the narrow CLI/output/error integration points, `examples/sample-projects/*`, focused tests/fixtures, package files, README/help, and `.github/workflows/ci.yml`.
- **Planning-only boundary**: this stage may modify only Spec Kit planning/tooling artifacts. Product source and tests remain unchanged until implementation is separately authorized.
- **Evidence status**: approved canonical spec plus bounded live reads of package, CLI, output, errors, prompts, tests, README, design, and CI. Project cognition was stale/not ready and is advisory, not claimed as proof.
- **Stop condition**: stop/reopen if implementation must leave the target worktree, overwrite user changes, modify existing sample assets as the canonical gallery, or cross an unapproved external repository/service boundary.

## Reference Fidelity Inputs

### Reference Object

- Existing Launchdeck CLI parsing/dispatch, schemaVersion 1 output envelope, typed error normalization, `@clack/prompts` keyboard interaction, package allowlist, and lifecycle command behavior are the reference implementation.
- Canonical anchors: `src/cli.js`, `src/output.js`, `src/errors.js`, `src/agent/lifecycle-prompter.js`, `package.json`, `README.md`, `DESIGN.md`, and their focused contract tests.

### Behavior-Level Fidelity Inventory

- **RF-001 Preserved**: one machine-readable object, existing `--json`/`--compact`/`--no-color` semantics, and no prompt leakage.
- **RF-002 Preserved**: keyboard-first selector behavior with explicit no-match and typed cancel states; visual styling may adapt only within existing design tokens.
- **RF-003 Preserved**: central CLI router/error/output ownership; focused `src/examples/*` modules add behavior without a parallel command framework.
- **RF-004 Preserved**: package allowlist remains explicit and root install remains non-workspace; gallery inclusion is additive.
- **RF-005 Adapted**: existing lifecycle fixtures inform external compatibility proof, but candidate `.launchdeck.yml` is created only in isolated copies.
- **RF-006 Deferred**: macOS behavior has no fidelity claim in this feature, per the five-field deferral contract.

## Scenario Profile Inputs

### Active Profile

- **Profile**: cross-platform standalone source gallery with a CLI/TUI copy surface.
- **Routing reason**: exact multi-ecosystem source inventory, external package boundary, interactive and automation consumers, filesystem publication, and material lifecycle outcomes.
- **Source**: `spec.md`, `spec-contract.json`, `ui-brief.md`, `plan-contract.json#/scenario_profile`, and both accepted planning handoffs.

### Profile-Driven Implementation Constraints

- Keep sample content stack-native and free of Launchdeck-specific files or wrappers.
- Treat exact ten × Windows/Linux as a closed validation denominator; every matrix cell must report a result.
- Validate both native lifecycle and externally configured Launchdeck lifecycle in isolated copies with bounded health polling and guaranteed stop/cleanup.
- Treat list/copy as offline local operations; dependency installation is a later validation phase, not command behavior.
- Use `fastapi-inventory` as the representative quickstart while retaining the all-ten matrix as release proof.
- Capture machine receipts, HTTP/API health, logs/status on failure, port release, and source-purity evidence.

## Design System Adoption

- **Source and status**: `DESIGN.md@sha256:2c0d7b74b07d861e123a8c5619b0165907d1b32151b384b4aa2e87a7ea54f2aa`; ready.
- **Token strategy**: reuse existing semantic terminal roles, spacing, symbols, color/no-color handling, and width-aware formatting; add no gallery-only color system.
- **Component policy**: reuse CLI output envelopes and `@clack/prompts`; extend only with a focused catalog-row renderer and searchable sample selector.
- **Platform adaptation**: identical behavior contract on Windows/Linux, with path rendering and terminal capability adaptation delegated to existing patterns.
- **Accessibility**: keyboard-only operation, visible focus/selection, no color-only meaning, readable 60-column layout, and no animation dependence.
- **Evidence**: human snapshots at narrow/normal widths, no-color capture, TTY keyboard flows, and single-object JSON/compact contracts.
- **Forbidden drift**: bespoke full-screen TUI, hidden no-match/cancel, prompt in automation, decorative text in JSON, or wording that implies install/run/evaluation.

## Feature UI Brief Adoption

- **UI brief**: `ui-brief.md`; UI work is applicable to the CLI/TUI list and omitted-ID copy selector.
- **Single job**: let a developer discover one real sample and copy it to a known destination with clear no-effect failure states.
- **Entry points**: `launchdeck example list` and `launchdeck example copy [id] [destination]`.
- **Experience thesis**: compact, scan-friendly, keyboard-first, deterministic, and honest about what was copied; the destination preview/receipt is the signature element.
- **Fidelity mode**: no external visual target; behavior-level fidelity to the current repository design system.
- **Required states**: list success, explicit selection, search active, no match, cancellation, invalid/missing ID, destination conflict, package/source invalid, copy failure, publish failure, and post-rename success.
- **Must preserve**: exact catalog data, automation silence, one JSON object, typed outcomes, narrow/no-color usability, and receipt only after publication.
- **May adapt**: labels, row wrapping, and helper prose within existing grammar.
- **Must not**: install/run/network, overwrite prompts, score/evaluate samples, infer ID from paths/environment, or show non-catalog choices.
- **Verification**: structural CLI tests plus TTY captures; no pixel-level approval artifact is required.

## Technical Context

**Language/Version**: Launchdeck JavaScript ESM on Node.js `>=20`; samples use their stack-native current LTS-compatible JavaScript/TypeScript, Python, Go, Java, C#, and Docker Compose toolchains.  
**Primary Dependencies**: existing `yaml`, `@clack/prompts`, and Node filesystem/path/process primitives; each sample owns only its native dependencies and lock file.  
**Storage**: catalog and project-local sample files; sample persistence is stack-native and exercised only in isolated copies; no new Launchdeck runtime persistence.  
**Testing**: Node test runner and existing CLI fixtures, actual npm tarball checks, plus native npm/Python/Go/JVM/.NET/Compose suites.  
**Target Platform**: Windows and Linux terminals/CI; macOS support claim deferred.  
**Project Type**: npm-distributed CLI plus a multi-ecosystem standalone source gallery.  
**Performance Goals**: local offline list/copy; bounded health polling; packed package `<=5 MiB`, unpacked `<=20 MiB`.  
**Constraints**: exact ten projects, no sample dependencies in root install, no network/install/run during copy, atomic no-overwrite publication, deterministic seeds/ports, one JSON object.  
**Scale/Scope**: 10 catalog rows, 10 native project sources, 12 entrypoint outcomes, 20 native OS/sample cells, and 20 Launchdeck compatibility cells.

## Implementation Constitution

### Architecture Invariants

- One validated catalog owns IDs, metadata, source paths, docs/package inventory, and matrix enumeration.
- `src/cli.js` remains dispatch authority; `src/output.js` and `src/errors.js` remain machine-envelope/error authorities; focused `src/examples/*` modules own gallery logic.
- Source trees are independent products, not Launchdeck fixtures. Launchdeck config and runtime state exist only in external isolated validation copies.
- Copy moves through selected → preflight → same-parent staging → destination recheck → atomic rename; success is impossible before rename.
- Existing destination paths are immutable from this feature. No merge, overwrite, force mode, or non-atomic publication fallback.

### Boundary Ownership

- Catalog validation: `src/examples/catalog.js`.
- Human/machine list projection: `src/examples/list.js` plus existing output layer.
- Selection, destination safety, staging, locking, cleanup, and receipts: `src/examples/copy.js`.
- Public grammar and result routing: central CLI/output/error surfaces.
- Sample business code: each directory below `examples/sample-projects`; compatibility config belongs to test fixtures only.
- Package/release truth: actual `npm pack` inventory and catalog/source/copy/tarball digest comparison.

### Forbidden Implementation Drift

- Parallel catalog copies in docs/tests, generic remote template downloader, root npm workspaces, Launchdeck-only sample wrappers, embedded `.launchdeck.yml`, generated evaluation artifacts, automatic install/run, arbitrary path resolution from raw IDs, or silent matrix skips.
- Reusing unrelated `agent_*` errors for gallery semantics or allowing new codes to normalize to `internal_error`.
- Shell-based recursive copy/delete where Node-owned confined filesystem primitives and ownership checks are required.

### Required Implementation References

- `spec-contract.json`, `plan-contract.json`, `contracts/example-cli-contract.md`, `data-model.md`, `quickstart.md`, and both accepted lane handoffs.
- `src/cli.js`, `src/output.js`, `src/errors.js`, `src/agent/lifecycle-prompter.js`, `package.json`, `DESIGN.md`, existing package/CLI tests, and `.github/workflows/ci.yml`.

### Review Focus

- Prove exact-ten/catalog authority, all twelve outcome decisions, recoverable-state security, atomic cleanup, package equality/size, root dependency isolation, and every Windows/Linux cell.
- Reject any change that makes samples participate in Launchdeck evaluation, implies macOS support, touches the original dirty workspace, or reports completion with skipped/indeterminate evidence.

## Operational Consequence Design

| Obligation ID | State Machine / Ordering Decision | Concurrency And Idempotency | Recovery Path | Validation Evidence |
| --- | --- | --- | --- | --- |
| CA-001 | Build full gallery, then measure real tarball | Package gate serializes inventory/digest/size evidence | Remove generated/vendor/binary weight; reopen before reducing scope | actual `npm pack --json`, exact inventory, 5/20 MiB assertions |
| CA-002 | Every sample/OS cell reaches terminal pass/fail | Matrix enumerates catalog × Windows/Linux; lifecycle inside a cell is serial | Repair project/platform; no skip, wrapper, or weakened test | 20 native and 20 Launchdeck cell receipts |
| CA-003 | Validate/select before mutation; stage then single rename | Target-specific lock, destination recheck, fresh staging identity; retry never overwrites | Cancel/input/conflict has no staging; copy/rename failure cleans owned residue; uncertainty blocks release | all 12 outcomes, injected copy/rename/cleanup/collision faults, residue assertions |
| CA-004 | Catalog, repository, copied tree, and tarball form one equality chain | Catalog is sole inventory owner; digests are deterministic | Block release until exact equality is restored | schema/source snapshots, copy digest, tar inventory digest |

Public error decisions are additive and fixed for tasks: `command_usage_error`; `example_catalog_invalid`; `example_not_found`; `example_selection_cancelled`; `example_destination_exists`; `example_source_invalid`; `example_copy_failed`; and `example_publish_failed`. Success and in-session no-match states do not emit error envelopes. The complete per-outcome ownership, retention, retry, cancellation, security, cleanup, validation, and reopen contract is `plan-contract.json#/operational_consequence_decisions`.

## Dispatch Compilation Hints

### Boundary Owner

- Catalog/CLI contract lane owns public grammar, catalog authority, result schema, and error map.
- Sample lanes own only their exact source directories and native contracts.
- Atomic-copy lane owns confined filesystem publication and fault recovery.
- Packaging/validation lane owns tarball truth and cross-platform evidence.

### Required Packet References

- Every packet: `spec-contract.json`, `plan-contract.json`, its relevant MP/CA/AC refs, and concrete allowed/forbidden paths.
- CLI/copy packets: `contracts/example-cli-contract.md`, `data-model.md`, architecture handoff, `src/cli.js`, `src/output.js`, `src/errors.js`.
- Sample/validation packets: exact catalog row, validation handoff, `quickstart.md`, and stack-native verification command.

### Packet Validation Gates

- Wave 1: focused catalog, public error, output, and purity contracts.
- Wave 2: native build/test/health per authored sample.
- Wave 3: all twelve CLI outcomes and filesystem fault matrix.
- Wave 4: real npm tar inventory/digest/size and docs consistency.
- Wave 5: catalog-derived Windows/Linux native and Launchdeck matrices.
- Wave 6: `npm run check`, `npm test`, `npm audit`, package/npx smoke, and full AC/MP/CA denominator review.

### Task-Level Quality Floor

- Use test-first behavior slices, one clear owner per path, no direct scope reduction, no silent skip, no product edits outside the clean target worktree, and no completion claim without fresh command evidence. Integration order is recorded in `plan-contract.json#/implementation_sequence`; parallel lane boundaries are in `/dispatch_hints`.

## Alignment Inputs

### Canonical References

- Approved spec package: `spec.md`, `spec-contract.json`, `alignment.md`, `context.md`, and `ui-brief.md`.
- Approved discussion digest: `e7e620fe1f707a44a1ad5a8cdeb62732114d146467f00a34b6da6ff233dadb26`.
- Repository truth: `DESIGN.md`, package/CLI/output/error/prompt sources, tests, README, and CI.
- Planning evidence: accepted architecture-interface and validation-scenarios handoffs plus the independent contract/data-model/quickstart artifacts.

### Input Risks From Alignment

- Package breadth and matrix cost are accepted tradeoffs, not reasons to reduce inventory.
- Existing error normalization requires additive registered gallery codes.
- Root dependencies must be installed before CLI-spawn verification; absence of `node_modules` in the read-only planning environment is not product evidence.
- Docker runner capability must be an explicit prerequisite/failure, never a silent pass.
- Stale project cognition is advisory; implementation must reopen if bounded live ownership evidence conflicts with this plan.

## Research Inputs

### Status

Research is **not needed**. No unresolved implementation-shaping question remained after canonical spec intake and bounded live repository inspection, so `research.md` is intentionally absent.

### Standard Stack

- Use the existing Node.js ESM CLI/output/error/prompt architecture and Node 20 filesystem primitives. Each sample uses its own stack-native package manager, lockfile, test runner, persistence pattern, and health endpoint.

### Don't Hand-Roll

- Reuse `@clack/prompts`, existing output envelopes, `LaunchdeckError`, `fs.cp`/`mkdtemp`/`rename`/`rm`, native package managers, and existing lifecycle CLI rather than introducing a second prompt, output, downloader, process manager, or copy framework.

### Common Pitfalls

- Parallel inventories, raw-ID path interpolation, symlink/junction escape, destination overwrite, cross-device staging, fallback copy after rename failure, masked cleanup errors, root workspace coupling, package-source drift, sleeps instead of bounded health polling, and skipped matrix cells.

### Assumptions To Validate

- Select LTS-compatible sample dependency versions and lock them during implementation.
- Verify Docker Compose availability in the chosen Linux/Windows validation design or fail the prerequisite explicitly.
- Run product tests after `npm ci`; if behavior then contradicts the bounded live evidence, reopen the affected architecture decision.

### Environment / Dependency Notes

- Copy remains offline. Validation installation may use ecosystem caches only in isolated install phases. Ports come from the catalog and must accept per-worker overrides. Every lifecycle uses try/finally stop and cleanup.

## Constitution Check

**Constitution version**: 1.3.0. **Pre-design gate**: PASS. **Post-design re-check**: PASS.

- Contract-first: exact catalog schema, public CLI grammar, stable error codes, twelve outcomes, and schemaVersion 1 machine output are independently recorded before implementation.
- Boundary safety: the clean target worktree is explicit; original user changes, existing example assets, external repositories, sample source purity, destination confinement, and runtime-state isolation are protected.
- Determinism and recovery: catalog/ports/seeds are deterministic; copy publication is atomic and rollback evidence is mandatory.
- Cross-platform honesty: Windows/Linux are complete denominators; macOS is a named user-confirmed deferral; no silent skip is permitted.
- Verification before completion: focused contracts, actual package evidence, native/Launchdeck matrices, security-sensitive path tests, audit, and release smoke are mandatory.
- Planning integrity: canonical artifacts were changed through runtime leases; native lane results used the approved runtime result channel; no product source/test change is authorized in this stage.

No constitution violation or exception is requested. Heavy execution reflects the confirmed breadth and consequence surface, not a relaxation of any gate.

## Project Structure

### Documentation (this feature)

```text
.specify/features/2026-08-03-deliver-ten-standalone/
├── spec.md
├── spec-contract.json
├── plan.md
├── plan-contract.json
├── data-model.md
├── quickstart.md
├── contracts/
│   └── example-cli-contract.md
└── planning/
    ├── lane-manifest.json
    └── handoffs/
        ├── architecture-interface.json
        └── validation-scenarios.json
```

`research.md` is intentionally absent. `tasks.md` is produced only by the next workflow.

### Source Code (repository root)

```text
src/
├── cli.js                         # central command routing
├── output.js                      # existing human/JSON envelope owner
├── errors.js                      # existing + additive example error codes
└── examples/
    ├── index.js
    ├── catalog.js
    ├── list.js
    ├── copy.js
    └── selector.js

examples/sample-projects/
├── catalog.json
├── vite-react-habit-tracker/
├── nextjs-blog-manager/
├── nestjs-url-shortener/
├── fastapi-inventory/
├── django-events/
├── go-webhook-inbox/
├── spring-boot-orders/
├── aspnet-library-catalog/
├── docker-compose-helpdesk/
└── node-python-issue-tracker/

test/
├── examples/                      # catalog, purity, copy and package contracts
├── cli*.test.js                   # public grammar/output/error outcomes
├── helpers/                       # isolated copy/lifecycle fixtures
└── packaging/                     # actual tar inventory/digest/size

scripts/                           # catalog-driven native/Launchdeck matrix runners
.github/workflows/ci.yml           # Windows/Linux sample matrices
package.json                       # additive gallery allowlist and gates
README.md                          # catalog-consistent discover/copy guidance
```

**Structure decision**: add one focused `src/examples` feature boundary and one canonical gallery root. Keep central CLI/output/error ownership and keep validation configuration outside sample sources.

## Decision Preservation Check

- Exact ten stacks/themes → locked decisions, complete-first denominator, concrete source tree, catalog validation, and matrix enumeration.
- Real independent projects/no evaluation → summary, sample purity invariants, forbidden drift, package tests.
- List/copy only → capability/interface map and CLI contract; install/run/network are forbidden.
- Searchable TTY plus explicit automation → UI brief, required states, JSON/non-TTY gates.
- Atomic safe copy → data model, CA-003 row, twelve operational decisions, fault matrix.
- Offline npm distribution and 5/20 MiB budgets → package interface, CA-001, actual tar gates.
- Windows/Linux and no macOS claim → complete-first matrix plus five-field deferral contract.
- Existing examples preserved and dirty workspace untouched → target boundary and constitution review.
- All six capabilities remain executable; none is replaced by templates/docs alone → capability preservation ledger.
- Implementation constitution rules flow into dispatch packet refs, gates, quality floor, and stop/reopen conditions.

## Research Adoption Check

- No `research.md` was triggered; `plan-contract.json#/research_status` records `not-needed` with the approved spec and bounded live repository evidence as resolution.
- Architecture lane finding: no existing example command → focused new `src/examples` modules plus central CLI integration.
- Architecture lane finding: unknown codes normalize to `internal_error` → exact additive public error map and contract-first tests.
- Architecture lane finding: npm allowlist omits gallery → actual tar inventory/digest/size gate before allowlist closeout.
- Validation lane finding: no gallery exists yet → catalog/purity contracts and sample authorship precede behavior implementation.
- Validation lane finding: current planning worktree lacks dependencies → implementation verification begins with `npm ci`; planning does not misreport the resulting spawn failure as product failure.
- Validation lane finding: existing macOS CI is unrelated → feature jobs and claims remain Windows/Linux only.

## Complexity Tracking

No constitution violations require justification. Heavy complexity is inherent in the user-confirmed exact-ten, multi-ecosystem, dual-platform scope and is handled by dependency-ordered waves, catalog-derived matrices, focused ownership, and fail-closed gates without reducing delivery.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| None | N/A | N/A |
