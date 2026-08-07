# Feature Specification: Standalone Sample Project Gallery

**Feature Branch**: `2026-08-03-deliver-ten-standalone`  
**Created**: 2026-08-03  
**Status**: Specification complete; workflow transition pending consumer binding  
**Input**: Approved `sp-discussion` contract digest `e7e620fe1f707a44a1ad5a8cdeb62732114d146467f00a34b6da6ff233dadb26`.

## Overview *(mandatory)*

### Feature Goal

Ship a package-distributed gallery of ten realistic, standalone source projects that developers can copy anywhere and use as honest Launchdeck test subjects. The gallery proves that Launchdeck can be exercised across popular project shapes without embedding Launchdeck configuration, scoring, answers, or evaluation behavior in the samples.

### Intended Users and Value

- **Primary users / roles**: developers evaluating Launchdeck locally; Launchdeck maintainers validating cross-stack behavior.
- **Problem or opportunity**: the current package has no broad, portable set of real source projects that a user can copy and test without cloning the repository or adopting Launchdeck-specific fixtures.
- **Confirmed product outcome**: npm users can list and safely copy one of ten exact samples; each copied project remains a real standalone application and is independently proven compatible with the intended Launchdeck config and lifecycle path.

## Confirmed Scope *(mandatory)*

### In Scope

The canonical root is `examples/sample-projects`, containing exactly:

1. `vite-react-habit-tracker` — Vite + React — habit tracking.
2. `nextjs-blog-manager` — Next.js — blog management.
3. `nestjs-url-shortener` — NestJS — URL shortening.
4. `fastapi-inventory` — FastAPI — inventory.
5. `django-events` — Django — events.
6. `go-webhook-inbox` — Go — webhook inbox.
7. `spring-boot-orders` — Spring Boot — orders.
8. `aspnet-library-catalog` — ASP.NET Core — library catalog.
9. `docker-compose-helpdesk` — Docker Compose — helpdesk.
10. `node-python-issue-tracker` — Node.js + Python monorepo — issue tracking.

Also in scope: one minimal catalog; independent MIT licensing; stable/LTS toolchains; locked dependencies; deterministic seed data; stack-natural local persistence; native tests; a real page or API; unique overridable ports; external Launchdeck compatibility verification; `launchdeck example list`; `launchdeck example copy [<id>] [<destination>]`; atomic copy safety; npm inclusion; tarball snapshot and size gates; Windows and Linux native CI.

### Out of Scope

- Samples must not contain `.launchdeck.yml`, Launchdeck dependencies, generated answers, scoring, evaluation, telemetry, or Launchdeck-only wrappers.
- Copy must not install, build, run, configure, initialize Git, contact the network, or update a sample.
- No `example install/run/start/stop/update/score/evaluate` surface is introduced.
- Sample dependencies are not part of the root install or workspace.
- Existing example assets are not replaced or deleted.
- No macOS compatibility claim is made.
- Unrelated CLI, Agent, MCP, runtime, registry, or lifecycle behavior is unchanged.

### Deferred Or Future Scope

- macOS native CI and compatibility evidence are deferred. Reopen only with explicit user confirmation and a repeatable macOS evidence lane.
- Additional samples or new example subcommands require a new scope decision; the ten-project inventory is not an implicit extensibility promise.

## Experience Requirements

- **Design-system source**: `DESIGN.md@sha256:2c0d7b74b07d861e123a8c5619b0165907d1b32151b384b4aa2e87a7ea54f2aa`.
- **Design-system status**: ready; reuse the existing Launchdeck CLI/TUI grammar and `@clack/prompts`.
- **Required platforms**: Windows and Linux terminals; human, no-color, non-TTY, `--json`, and `--compact` modes.
- **Experience commitments**: keyboard-first searchable selector, explicit destination preview, typed cancellation, scan-friendly catalog, one-object JSON output, and a receipt only after atomic publication.
- **Design risks**: prompt leakage into automation, hidden no-match/cancel states, unreadable narrow output, color-only status, or wording that implies install/run/evaluation.

## UI Reference Processing

- `ui_applicable: true`
- `ui_work_type: feature-extension`
- `real_entry_points: launchdeck example list; launchdeck example copy [<id>] [<destination>]`
- `ui_reference_processing_status: not-applicable` — no external UI reference was supplied.
- `ui_reference_lane_mode: none`
- `ui_fidelity_mode: none`
- `ui_reference_notes: none`
- `ui_brief: ui-brief.md`
- `ui_target: none`
- `visual_review_requirement: agent-visual-comparison` using representative terminal captures.
- `ownership_classification: project-owned`
- `inline_fallback_reason: none`

## Must-Preserve Discussion Inputs

- **Source**: `F:/github/launchdeck/.specify/discussions/discussion/handoff-to-specify.json`
- **Approved digest**: `e7e620fe1f707a44a1ad5a8cdeb62732114d146467f00a34b6da6ff233dadb26`
- **Coverage Status**: complete; all MP and CA refs are mapped.
- **Planning Gate Status**: upstream handoff-ready; formal consumer binding remains blocked only by the runtime cross-worktree path guard.

### Mapped Must-Preserve Items

- `MP-001`: non-evaluation product boundary -> overview, out-of-scope, FR-003.
- `MP-002`: exact ten projects -> confirmed scope and FR-001.
- `MP-003`: sample purity -> FR-003 and AC-002.
- `MP-004`: list/copy only -> FR-009 and out-of-scope.
- `MP-005`: interaction modes -> FR-010 through FR-012.
- `MP-006`: filesystem safety -> FR-013 through FR-015.
- `MP-007`: npm snapshot and size -> FR-016 through FR-018.
- `MP-008`: Windows/Linux, no macOS claim -> NFR-006 and deferral.
- `MP-009`: realistic projects and Launchdeck compatibility -> FR-004 through FR-008.
- `MP-010`: clean target worktree and untouched dirty workspace -> boundary constraints.

### Discussion Conflicts

No product conflict remains. The only workflow conflict is mechanical: `discussion bind-consumer` currently rejects a feature directory outside the source project root.

## Scenarios and Usage Paths *(mandatory)*

### Primary Scenario - Copy A Real Sample

A developer installs Launchdeck from npm, runs `launchdeck example list`, chooses a representative stack, and copies it to a local directory without cloning this repository.

**Usage Path**:
1. The developer lists the catalog in a terminal or JSON automation.
2. They run `launchdeck example copy <id> [destination]`, or omit the ID only in a TTY and select through search.
3. Launchdeck validates the destination, stages the source in the same parent filesystem, atomically publishes it, and prints a receipt.
4. The developer enters the copied project and follows its native README; when testing Launchdeck, configuration is authored outside the distributed sample content.

**Acceptance Signals**:
- The copied tree matches the packaged source exactly and contains no Launchdeck artifact.
- Success is reported only after rename; cancellation or failure leaves no target or staging residue.

### Secondary Scenario - Verify Cross-Stack Launchdeck Compatibility

A maintainer runs the release matrix against isolated copies of all ten samples.

**Usage Path**:
1. CI installs each project through its native locked toolchain and runs native tests.
2. An external fixture produces a reviewable candidate `.launchdeck.yml` in the temporary copy.
3. Launchdeck validates and executes the applicable setup/build/test/start/health/stop path.
4. Cleanup proves no owned process or generated runtime residue survives.

**Acceptance Signals**:
- All ten stacks pass on both Windows and Linux without skipped samples or Launchdeck-only wrappers.
- Evidence is compatibility proof, never a score or sample-side evaluation.

### Edge Cases and Failure Paths

- Unknown ID: typed, actionable failure listing or pointing to valid IDs; no mutation.
- Missing ID in JSON/non-TTY: `command_usage_error`; never prompt.
- Search has no matches: explicit empty state; retain query and allow edit or cancel.
- Cancel: typed cancelled outcome; no destination or staging path.
- Existing path, including an empty directory: reject before staging.
- Wrong-type destination parent, permission failure, copy failure, or rename failure: actionable typed error and cleanup.
- Source catalog/package mismatch, tarball size breach, OS-specific sample failure, or skipped matrix entry: block release.
- Port already occupied during verification: use the documented override; do not weaken lifecycle proof.

## Capability Decomposition *(mandatory)*

### Capability Map

- **CAP-001 Author gallery catalog**: manage the exact ten IDs and minimal metadata as one non-evaluative fact source. Supports all scenarios; enabling. **Test strategy**: schema, exact-set, unique-path and all-consumer derivation contract tests.
- **CAP-002 Deliver standalone samples**: provide realistic, native projects with independent licensing, locks, seeds, persistence, tests and observable behavior. Supports both scenarios; core. **Test strategy**: per-stack isolated locked install, native test, seed repeatability, health and cleanup matrix.
- **CAP-003 Verify Launchdeck compatibility**: exercise config authoring and lifecycle only in isolated copies and external fixtures. Supports the verification scenario; validation-oriented. **Test strategy**: temporary-config doctor plus setup/build/test/start/health/stop receipts for every sample and OS.
- **CAP-004 List examples**: expose the catalog through existing human and JSON contracts. Supports discovery; core. **Test strategy**: human width/no-color snapshots and schemaVersion 1 JSON/compact single-object assertions.
- **CAP-005 Copy example safely**: select or identify one sample and publish it atomically without side effects. Supports the primary scenario; core. **Test strategy**: outcome matrix, traversal/type checks and copy/rename/cancel fault-injection residue assertions.
- **CAP-006 Publish and gate gallery**: include source in npm and enforce snapshot, size and Windows/Linux matrices. Supports trustworthy distribution; enabling and validation-oriented. **Test strategy**: actual npm tarball inventory, content digest, 5/20 MiB thresholds and no-skip CI contract.

### Capability Relationships

- CAP-001 is the sole metadata input to CAP-004, CAP-005 and CAP-006.
- CAP-002 supplies immutable source trees; CAP-003 may mutate only temporary copies.
- CAP-005 must finish validation and staging before publication.
- CAP-006 cannot pass unless CAP-002 and CAP-003 pass for all ten entries on both required operating systems.

### Capability Preservation Ledger

| Upstream Signal | Source | Selected Entry Point | Implementation Obligation | Acceptance Proof | Narrowing Confirmation |
| --- | --- | --- | --- | --- | --- |
| provide source projects | MP-001/002/003/009 | packaged catalog and source trees | ten real standalone applications, not fixtures or scores | AC-001/002/007/008 | approved digest |
| verify Launchdeck lifecycle | MP-009 | external acceptance fixture | config validation plus applicable setup/build/test/start/health/stop | AC-003/009 | approved digest |
| list examples | MP-004/005 | `launchdeck example list` | human and JSON views from one catalog | AC-004/010 | approved digest |
| copy examples | MP-004/005/006 | `launchdeck example copy` | explicit and TTY modes with atomic rollback | AC-005/011 | approved digest |
| distribute examples | MP-007/008 | npm tarball and CI gates | exact package snapshot, size budgets, Windows/Linux matrices | AC-006/012 | approved digest |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The gallery MUST contain exactly the ten approved IDs under `examples/sample-projects`; planners MUST NOT substitute, combine or drop an entry.
- **FR-002**: A single catalog MUST map each ID to title, stack, theme, requirements, ports and source path; no score, quality rank or hidden answer field is permitted.
- **FR-003**: Every sample MUST be standalone, independently MIT licensed, Launchdeck-neutral, and free of `.launchdeck.yml`, Launchdeck dependencies, generated answers, evaluation and telemetry.
- **FR-004**: Every sample MUST use stable/LTS tooling, committed lock data where its ecosystem supports it, and commands that work from an isolated copy.
- **FR-005**: Every sample MUST expose deterministic seeded behavior through a real page or API and use stack-natural local persistence without committed runtime databases.
- **FR-006**: Every sample MUST include native tests and a native README containing install, test, run, port override and cleanup instructions only.
- **FR-007**: Every sample MUST declare a unique default port and a documented environment or native mechanism to override it.
- **FR-008**: External verification fixtures MUST prove an accurate candidate Launchdeck configuration and the applicable setup/build/test/start/health/stop path without adding proof files to source roots.
- **FR-009**: The CLI MUST provide only `example list` and `example copy [<id>] [<destination>]` for this feature.
- **FR-010**: `example list` MUST derive all output from the catalog and preserve the existing human, JSON, compact and no-color contracts.
- **FR-011**: `example copy` with an explicit ID MUST never prompt; an omitted ID MAY open a searchable single-select only when stdin and stdout are interactive TTYs.
- **FR-012**: JSON or non-TTY copy without an ID MUST return a typed usage error; cancellation, unknown ID and no-match states MUST be explicit and actionable.
- **FR-013**: The default destination MUST be `./<id>`; any existing destination path MUST be rejected before copying.
- **FR-014**: Copy MUST stage under the resolved destination parent on the same filesystem and publish only by atomic rename after complete copy.
- **FR-015**: Cancellation, copy failure and rename failure MUST leave both final destination and staging residue absent; success MUST report ID and resolved destination.
- **FR-016**: The npm files allowlist and package tests MUST include the catalog and all ten source trees while excluding dependencies, build output, runtime databases and temporary config.
- **FR-017**: CI MUST compare repository source, copied output and actual npm tarball inventories and content digests; mismatch MUST block release.
- **FR-018**: Actual npm packing MUST fail when packed size exceeds 5 MiB or unpacked size exceeds 20 MiB; scope reduction requires reopening the approved contract.
- **FR-019**: Windows and Linux MUST each execute all ten native and Launchdeck compatibility cells with no skip-based success.
- **FR-020**: Existing examples outside the canonical sample-project root MUST remain intact unless a concrete conflict is reopened with the user.

### Non-Functional Requirements

- **NFR-001 Reliability**: sample tests, seed results, health checks and cleanup must be deterministic and repeatable.
- **NFR-002 Safety**: destination traversal, symlink/reparse behavior and wrong-type filesystem objects must be validated at the copy boundary.
- **NFR-003 Accessibility**: all selector and receipt states must be keyboard-operable, text-distinguishable without color and readable at narrow terminal widths.
- **NFR-004 Automation**: JSON mode emits one schemaVersion 1 object and no prompt, spinner or decorative stdout.
- **NFR-005 Performance**: catalog listing must not install or inspect sample dependency trees; copying performs one local staged tree copy and actual package size remains within 5/20 MiB budgets.
- **NFR-006 Portability**: Windows and Linux are supported evidence targets; macOS remains explicitly unclaimed.
- **NFR-007 Maintainability**: inventory consumers derive from the catalog and avoid duplicate hand-maintained sample lists.
- **NFR-008 Observability**: every CLI outcome exposes stable status/code, sample ID when known, resolved destination when safe, actionable next step and cleanup result; CI retains per-sample native and Launchdeck lifecycle receipts.
- **NFR-009 Supportability**: failure evidence identifies sample, OS, lifecycle phase and command class without leaking secrets or requiring sample-side telemetry.

### Boundary Constraints

- Product implementation belongs only in the clean feature worktree `F:/github/launchdeck/.tmp/worktrees/sample-project-gallery`; the original dirty workspace is an evidence and discussion source, not a product edit target.
- Node.js remains `>=20` ESM. Reuse existing `@clack/prompts`, `LaunchdeckError` and output envelope patterns unless live evidence proves a gap.
- Sample toolchains may be required in CI, but sample dependency installation stays isolated from the repository root.
- macOS, network-backed services, cloud databases and external credentials are outside the accepted proof boundary.

## Acceptance Proof *(mandatory)*

### Acceptance Signals

- `AC-001` through `AC-012` in `spec-contract.json` provide exact one-to-one closure for all six in-scope requirements and six capability operations.
- The positive proof is an exact ten-project inventory, native and Launchdeck lifecycle success, safe copy receipts, actual tarball inclusion and dual-platform CI.
- The negative proof is equally required: no sample-side Launchdeck config/evaluation, no automation prompts, no partial copy residue, no skipped OS/sample cell, no package drift, and no macOS claim.

### Measurable Success Criteria

- **SC-001**: 10 of 10 approved sample IDs exist, pass native tests and expose deterministic behavior on Windows and Linux.
- **SC-002**: 10 of 10 isolated copies pass the declared Launchdeck config and lifecycle acceptance path, followed by clean stop.
- **SC-003**: All enumerated `example list/copy` outcomes have exactly one disposition, stable observable behavior, acceptance refs and CA refs.
- **SC-004**: Actual npm tarball contains all and only allowed gallery files, with packed <=5 MiB and unpacked <=20 MiB.
- **SC-005**: Every induced copy or rename failure leaves zero destination and staging residue.

## Decision Capture *(mandatory)*

### Discussion Decision Digest

- **Selected Direction**: ship a broad, exact ten-project source gallery plus list/copy distribution; users test Launchdeck themselves against real projects.
- **Rejected Alternatives**: scored evaluation suite; Launchdeck-configured fixtures; remote gallery/download command; automatic install/run; smaller MVP inventory. Reopen only through an explicit user scope decision.
- **Accepted Tradeoffs**: larger npm package and heavier dual-platform CI are accepted in exchange for offline availability and credible cross-stack evidence.
- **Experience Commitments**: existing Launchdeck CLI/TUI grammar, explicit automation mode, searchable TTY selection, destination preview, typed states, no-color/narrow-width support and success receipt.
- **Review Criteria Carry-Forward**: exact inventory, sample purity, honest lifecycle proof, package source equality, atomic rollback and no scope-reducing OS skips.
- **Must Not Dilute**: samples are real independent projects; all ten stacks and both required operating systems remain mandatory.

### Locked Decisions

- Catalog root, ten IDs/stacks/themes, list/copy-only command surface, no sample config/evaluation, atomic copy strategy, package budgets and Windows/Linux evidence are locked.
- Existing example assets remain outside the new canonical root and are preserved.
- The current repository design system is sufficient; no external reference or mockup is required.

### User-Confirmed Deferrals

- macOS native proof -> approved discussion -> reopen with explicit request and repeatable CI evidence.
- Additional commands, remote updates, more samples or evaluation -> excluded by approved discussion -> reopen only with a new product decision.

### Canonical References

- `spec-contract.json`, `ui-brief.md`, `alignment.md`, `context.md`.
- Approved handoff digest `e7e620fe1f707a44a1ad5a8cdeb62732114d146467f00a34b6da6ff233dadb26`.
- `DESIGN.md@sha256:2c0d7b74b07d861e123a8c5619b0165907d1b32151b384b4aa2e87a7ea54f2aa`.
- Live contracts: `package.json`, `src/cli.js`, `src/output.js`, `src/errors.js`, current packaging/CLI tests and `.github/workflows/ci.yml`.

## Consequence Analysis

### Lifecycle And State Behavior

- `CA-001`: npm tarball -> oversized -> remove only generated, vendored, binary or unnecessary weight first; block and reopen before reducing sample scope.
- `CA-002`: sample/OS cell -> failed -> repair project or platform path; never skip OS, skip tests or add Launchdeck-only wrappers.
- `CA-003`: destination/staging -> cancelled or filesystem failure -> no published or staging residue; partial copy blocks release.
- `CA-004`: repository/catalog/copied/tarball source -> mismatch -> block release until exact equality is restored.

### Recovery And Validation

- All twelve entrypoint outcomes are inventoried in `entrypoint_outcome_contract`; list outcomes trace to AC-010/CA-004 and copy outcomes to AC-011/CA-003, while root usage traces to both surfaces.
- Recoverable user-input states retain command/search context and require explicit correction or cancellation.
- Filesystem copy and rename failures are terminal command failures after automatic cleanup; the user explicitly re-runs the command.
- Release recovery never weakens exact inventory, OS matrix, purity or package gates.

## Fidelity Requirements

No external visual or behavioral reference implementation was supplied. Fidelity mode is `none`.

### Reference Object

- Existing Launchdeck CLI dispatch, `LaunchdeckError`, schemaVersion 1 output envelope, `@clack/prompts` lifecycle selector and DESIGN.md terminal rules are live compatibility inputs, not a pixel-fidelity target.

### Required Fidelity

- Preserve observable command grammar, JSON cleanliness, TTY activation policy, typed cancellation, narrow/no-color readability and receipt semantics.
- Human layout may adapt to catalog content so long as required states and acceptance evidence in `ui-brief.md` remain intact.

### Reference Behavior Inventory

- `UI-B01` explicit automation path -> preserve.
- `UI-B02` searchable keyboard-first TTY selection -> adapt from current Agent target prompt.
- `UI-B03` typed cancellation and no prompt outside TTY -> preserve.
- `UI-B04` schemaVersion 1 single-object JSON -> preserve.
- `UI-B05` receipt-like success/error state with text labels -> adapt.

## Risks and Gaps *(mandatory)*

### Planning Risks

- Ten ecosystems create CI duration, toolchain caching and OS-specific command risk; planning must sequence a representative vertical slice before parallel sample production.
- Package weight may exceed thresholds; CA-001 forbids silently removing required projects.
- Cross-platform atomic rename, symlink/reparse handling and cleanup need fault-injection design.
- Compatibility fixtures must stay outside shipped sample roots and must not be presented as an evaluation score.
- Existing examples and README inventory must be updated additively without changing their meaning.

### Information Gaps

- No product requirement is unresolved and `semantic_delta` is empty.
- Project cognition is unavailable/stale in the target worktree, so all planning claims must continue to use live repository evidence.
- The formal discussion consumer pointer cannot yet be bound because the runtime restricts consumers to paths under the source repository. This blocks workflow completion, not specification semantics.
