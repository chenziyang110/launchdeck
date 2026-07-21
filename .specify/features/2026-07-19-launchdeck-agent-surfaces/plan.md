# Implementation Plan: Launchdeck Agent Surfaces

**Branch**: `2026-07-19-launchdeck-agent-surfaces`  
**Date**: 2026-07-20  
**Specification**: `spec.md`  
**Canonical plan contract**: `plan-contract.json`  
**Status**: Planning ready; no implementation performed

## Summary

Launchdeck will expose one local lifecycle control plane through four adapters/distributions: the backward-compatible CLI, a canonical Agent Skill, a typed local stdio MCP server, and separately generated Codex and Claude Plugins. A new Application Kernel and Operation Registry become the only operation/policy authority while the existing registry, run index, runtime state, locks, ownership, events, logs, and process/port adapters remain resource truth.

Every mutation receives a Kernel-issued operation ID and reaches a durable journal `prepared` state before effects. CLI and MCP then share scope, current-risk, ownership, compatibility, locking, recovery, and normalized result semantics. The Plugins bundle one relocatable Node 20 ESM runtime, share one build identity and canonical Skill, use host-specific manifests, and never own managed-task or shared-state lifetime.

## Locked Planning Decisions

1. One Operation Registry and Application Kernel serve CLI, MCP, Skill routing validation, capabilities, and Plugin builds; no second service/state/policy authority is allowed.
2. CLI schemaVersion 1 stays backward compatible. Agent protocol, catalog, journal, state, Skill, and host formats are independently versioned.
3. First-release public MCP is local stdio, configured-project-only, and executes only Kernel-evaluated low-risk mutations.
4. Exactly 18 public operations are exposed; deferred/dropped or broader CLI-only behavior never leaks into MCP, Skill fallback, capabilities, or host manifests.
5. The Agent result has exactly nine top-level fields and separates operation outcome from resource lifecycle status and effect certainty.
6. Every mutation is journaled before effects. Same-ID/same-digest recovers original work; mismatch/missing ID refuses; uncertain work is reconciled and never replayed across surfaces.
7. Safe clean accepts only a current Kernel plan digest, recomputes under locks, and returns `plan_digest_mismatch` before deletion on drift.
8. One canonical `launchdeck-agent` Skill is MCP-first, observe-before-mutate, and can use CLI fallback only before mutation dispatch when MCP transport or the safe operation is unavailable.
9. Codex and Claude Plugins are separate generated artifacts from one compatibility manifest, prebuilt runtime, canonical Skill, and build identity.
10. Plugin/host/MCP exit, update, disable, and uninstall never stop managed tasks or migrate/delete shared state.
11. Host and platform readiness is an exact evidence matrix, never a package-wide inferred boolean.
12. UI/TUI/GUI and visual design are not applicable to this behavioral/protocol feature.

## Complete-First Delivery Scope

- **Scope authority**: `spec-contract.json`, `spec.md`, `alignment.md`, `context.md`, and `plan-contract.json`.
- **Delivery rule**: Task and implement all CAP-001..CAP-013 and AC-001..AC-016. Execution phases order dependencies; they are not delivery deferrals.
- **Complexity rule**: Heavy architecture is handled through contracts, ordered extraction, fault tests, and exact evidence—not by inventing an MVP/P0/v2 reduction.
- **Priority labels**: Any P1/P2/P3 labels created by `sp-tasks` only order work.
- **Adaptive execution**: Planning used four accepted native lanes for research, state, contracts, and validation. `planning/lane-manifest.json` is the durable record.

## User-Confirmed Deferral Contract

| Capability | Confirmation source | Exact excluded behavior | Residual risk | Reopen or stop condition | Downstream artifact |
| --- | --- | --- | --- | --- | --- |
| CAP-014 | Discussion confirmed digest | First-release `adoption.apply`, automatic project/user configuration writes, registration, or implicit task start | Adoption remains inspection/manual only | Reopen specification if apply/writes become required | `tasks.md` implements only `adoption.inspect` plus zero-write negatives |
| CAP-015 | Discussion confirmed digest | First-release public MCP medium-risk execution | Medium-risk tasks remain outside Agent fallback and use existing CLI policy only | Reopen after a target host proves portable human elicitation and scope changes | `tasks.md` proves public MCP low-risk-only refusal |
| CAP-016 | Discussion confirmed digest | Remote MCP/OAuth, hooks, MCP UI, GUI/TUI, native executable packaging, enterprise policy, production/remote service control | Local stdio still requires Node 20+ and host integration | New specification before any listed surface or claim | Tasks/release evidence contain no implementation/readiness claim for these surfaces |

## Must-Preserve Carry-Forward

| MP ID | Planning obligation | Plan location | Reopen condition |
| --- | --- | --- | --- |
| MP-001 | One authoritative local lifecycle control plane | Kernel/Registry architecture | Any surface becomes an independent authority |
| MP-002 | `F:/github/launchdeck` is implementation and behavior authority | Target boundary and source structure | Implementation moves repositories/package authority |
| MP-003 | Configured-project, low-risk, local stdio MCP; one Skill; two host artifacts | Public surface and packaging | Deferred risk/adoption/remote/UI/native/enterprise scope becomes mandatory |
| MP-004 | CLI compatibility and Agent protocol remain separate | CLI adapter and result contract | Agent semantics require breaking CLI schemaVersion 1 |
| MP-005 | One canonical intent-driven, reference-based, MCP-first safe Skill | Skill/installer workstream | Users select low-level tools or copies drift silently |
| MP-006 | Plugin lifecycle is independent from managed service/shared state | Packaging and lifecycle tests | Plugin lifecycle can stop services or remove state |
| MP-007 | Mutation recovery is journal/evidence-based; no uncertain replay | Journal state machine and fault suite | Transport failure can replay through another surface |
| MP-008 | Readiness is exact by surface/host/OS/update/uninstall/recovery | Evidence matrix | Any broad claim lacks exact passing cells |

## Capability Preservation Plan

| Capabilities | Disposition and entry point | Owning implementation | Acceptance proof |
| --- | --- | --- | --- |
| CAP-001..CAP-004 | In scope through shared Kernel, project/policy pipeline, and journal/recovery | `src/kernel/`, `src/control-plane/operation-journal.js` | Registry/result/state/fault/recovery contract suites |
| CAP-005 | In scope through public CLI -> Kernel mapping | `src/adapters/cli-operation-map.js`, `src/cli.js`, `src/output.js` | schemaVersion 1 fixtures and CLI/MCP semantic equivalence |
| CAP-006..CAP-010 | In scope through exactly 18 MCP operations and Kernel handlers | `src/mcp/`, operation schemas, task/operation/clean/adoption handlers | Real stdio, scope/risk/ownership, recovery, clean, zero-write adoption cases |
| CAP-011 | In scope through canonical Skill and installer/doctor | `.agents/skills/launchdeck-agent/`, `src/agent-installer.js` | Ordered tool traces, forbidden-call cases, duplicate digest matrix |
| CAP-012 | In scope through one compatibility model and two generated artifacts | `agent/`, `scripts/build-agent-plugins.js` | Isolated bundle and separate Codex/Claude host/lifecycle cells |
| CAP-013 | In scope through layered verification/evidence registry | `test/`, `scripts/`, `agent/evidence/` | Exact operation/CLI/MCP/Skill/host/update/uninstall/OS cells |
| CAP-014..CAP-016 | User-confirmed deferrals | Five-field table above | Exclusion tests and stop/reopen gates |
| CAP-017..CAP-020 | Dropped from public Agent surface | Registry/schema/Skill/manifest exclusions | Forbidden input/operation tests, inspect-only external ownership, no exactly-once/remote claims |

## Implementation Target Boundary

- **Current and target root**: `F:/github/launchdeck`.
- **Current behavior authority**: live repository files and tests. Project cognition is route-only and currently lacks `project-cognition.db`; this is a non-blocking advisory, not evidence.
- **Existing truth owners**: `src/control-plane/state.js`, `runs.js`, `locks.js`, `ownership.js`, `events.js`; `src/runtime.js`; process/path adapters; config/schema.
- **New ownership**: Kernel owns operation/policy/recovery semantics; the journal owns operation progress/effect evidence only.
- **Reference-only evidence**: official MCP, Codex, Claude, esbuild, Node, and node-semver sources recorded in `research.md`.
- **Stop condition**: If implementation requires a second state authority or cannot preserve the existing truth owners, return to specification.

## Scenario Profile Inputs

### Active Profile

- **Standard Delivery with senior operational-consequence gate**, because the feature crosses shared durable state, process ownership, concurrency, destructive-clean boundaries, transport uncertainty, and host lifecycle.
- Source: `spec-contract.json#/consequence_analysis` and `plan-contract.json#/consequence_gate`.

### Profile-Driven Constraints

- Persist prepared before effects; record possible/unknown effects honestly.
- Revalidate target, policy, ownership, compatibility, locks, and digest at execution time.
- Unknown/external ownership is inspect-only.
- Package/host lifetime cannot own resource/state lifetime.
- Every readiness statement names exact evidence dimensions.
- All 50 CA obligations remain mapped through tasks and acceptance.

## Design System and UI Brief

Not applicable. This feature changes CLI behavior, Agent protocol, Skill routing, stdio transport, packaging, and validation. It introduces no visual layout, GUI, TUI, MCP UI, component system, image, viewport, or fidelity requirement. Existing CLI presentation compatibility remains mandatory.

## Technical Context

**Language/version**: JavaScript ESM on Node.js `>=20`  
**Runtime dependencies**: existing `yaml`; pinned `@modelcontextprotocol/sdk` v1.x, exact SDK-compatible Zod, and bundled `node-semver`  
**Build dependency**: esbuild for one Node 20 ESM runtime; no external npm imports in shipped bundle  
**Storage**: project `.launchdeck/runtime/state.json`; shared `LAUNCHDECK_HOME` registry/run/locks/logs/events plus new `runtime/operations/v1` journal  
**Testing**: Node `--test`, repository check/smoke/package checks, contract/equivalence/fault/stdio/Skill/artifact/host harnesses  
**Targets**: Windows, macOS, Linux; standalone CLI/MCP; Codex and Claude Code  
**Project type**: single npm CLI/control-plane package with generated Plugin artifacts  
**Performance constraints**: bounded observation, 15-minute/20-result public operation correlation, no permanent follow, no long journal lock around OS effects  
**Scale**: user-scoped local projects/tasks and small durable JSON/JSONL state; no remote/production management

## Implementation Constitution

### Architecture Invariants

- Operation Registry declares operations; Application Kernel is the only query/execute/recover authority.
- Existing control-plane/runtime modules remain resource truth. Journal records link them and cannot become a parallel run registry.
- Every adapter consumes one normalized Kernel result. CLI maps it into schemaVersion 1; MCP returns the Agent contract.
- Public tool inputs are closed and never accept command, shell, env, cwd, force, yes, confirmation, approval token, arbitrary path, or caller-owned project root.
- Public mutation requires a configured project, effective low risk, compatible components, required verified ownership, acquired locks, and fresh clean digest when applicable.
- Plugin roots are relocatable executable-code packages only; state and project scope come from Launchdeck authorities.

### Boundary Ownership

- `src/kernel/operation-registry.js`: declaration/catalog truth.
- `src/kernel/application-kernel.js`: operation pipeline and sole mutation entry.
- `src/kernel/project-context.js`, `policy.js`, `compatibility.js`: derived execution gates.
- `src/control-plane/operation-journal.js`: operation record/transition/recovery persistence.
- Existing control-plane/runtime/adapters: registry/run/process/port/ownership/event/log truth.
- `src/adapters/cli-operation-map.js` and `src/mcp/stdio-server.js`: presentation/transport only.
- `.agents/skills/launchdeck-agent`: canonical routing instructions.
- `agent/compatibility-manifest.json` and `scripts/build-agent-plugins.js`: build identity and host rendering.

### Forbidden Implementation Drift

- No MCP-specific backend, registry, journal, policy, state home, or CLI subprocess orchestration as the primary path.
- No adapter-side risk/ownership/confirmation/fallback decision.
- No exactly-once claim, uncertain retry, or reconciliation that invokes the original handler.
- No broad operation search, arbitrary log path, permanent follow, raw shell/process controls, or public risky clean.
- No automatic overwrite/delete of divergent Skill content.
- No host manifest containing operation, policy, state, journal, fallback, or authorization logic.
- No release-ready rollup from generator, direct handler, existing CLI, or one-host/one-OS evidence.

### Required Implementation References

- `spec-contract.json`, `plan-contract.json`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`.
- Existing `src/cli.js`, `src/output.js`, `src/config.js`, `src/global-runtime.js`, `src/runtime.js`, `src/control-plane/`, and `src/agent-installer.js`.
- Existing lifecycle, ownership, clean, CLI contract, state, lock, event, installer, and package tests.

### Review Focus

- Detect any private mutation path outside Kernel and any second state/resource authority.
- Verify schemaVersion 1 and normalized semantics independently.
- Audit lock ordering, prepared-before-effects, crash windows, retention, and no replay.
- Audit stdout purity, trusted/untrusted context separation, component digests, and host path relocation.
- Require exact evidence receipts before every readiness statement.

## Operational Consequence Design

| Obligation IDs | State machine / ordering | Concurrency and idempotency | Recovery | Validation |
| --- | --- | --- | --- | --- |
| CA-001,002,007,008,010,016,017,024,025,041 | Registry -> trusted context -> journal -> locks -> revalidate -> execute once -> normalize -> adapt | Kernel-only mutation and ID/digest serialization | Diagnosis/read-only on mismatch; no adapter replay | Registry/result, risk/compatibility, CLI/MCP equivalence |
| CA-003,004,009,014,020,021,031 | Resolve one configured project -> read run/ports -> locks -> re-read ownership -> reuse/mutate | Repeated/concurrent start reuses one verified run; PID/port alone never authorizes | Unknown/external/conflict stays inspect-only; explicit reconcile | Scope, ownership, start contention, Plugin lifetime |
| CA-005,011,013,026,027,028,029,042,043,044 | Durable prepared -> running under gates -> terminal/indeterminate -> explicit reconcile | Same ID/same digest recovers; mismatch/missing refuses; clean digest recomputed | Known get/reconcile or one bounded correlation; zero/multiple stop | Crash points, retention/index, no replay, clean drift |
| CA-012,015,022,023,032,033,034,035,037,038,047,048 | One build identity -> two policy-free artifacts -> non-destructive install/diagnosis | Compatible old/new components share state; Plugin lifecycle changes component presence only | Divergent Skills preserved; incompatible diagnosis-only; CLI takeover | Skill digest matrix, isolated bundles, update/uninstall/takeover |
| CA-006,036,039,040,045,046,049,050 | Initialize -> list exact tools -> bounded calls -> exact evidence cell | Single stdout writer; high-water cursors; no evidence rollup across dimensions | Protocol restart and failures withhold exact claim | Real stdio, Skill traces, separate Codex/Claude and OS cells |
| CA-018,019,030 | No first-release execution transition; adoption inspection terminates read-only | Future confirmation must bind digest and revalidate all gates | Reopen specification before activation | Medium-risk/adoption exclusions and zero-write test |

## Dispatch Compilation Hints

### Boundary Owner

The Application Kernel is the execution boundary. Packet owners may change adapters or underlying control-plane modules only while keeping all lifecycle mutation reachable through the Kernel catalog.

### Required Packet References

- `plan-contract.json` plus the relevant `contracts/` artifact.
- `data-model.md` for state/journal/lock/recovery work.
- `research.md` for SDK/bundle/host work.
- `quickstart.md` for validation/evidence work.
- The live existing owner and its tests before modifying a boundary.

### Packet Validation Gates

- Contract/schema validation before implementation behavior.
- Targeted Node tests plus `npm run check` and `npm test`.
- Real stdio for MCP claims; deterministic tool traces for Skill claims.
- Isolated artifact plus real-host evidence for Plugin/host claims.
- `git diff` review for accidental policy duplication, unsafe inputs, compatibility breaks, or shared-state lifecycle coupling.

### Task-Level Quality Floor

Every task maps CAP/AC/MP/CA refs, names the owning module, preserves exact public exclusions, has positive/refusal/fault evidence as applicable, and cannot claim a broader readiness dimension than its receipts.

## Research Inputs

### Standard Stack

- MCP SDK v1.x, initially the evidenced 1.29.0 release, with exact compatible Zod.
- esbuild single-file Node 20 ESM bundle and metafile external-import gate.
- `node:crypto` SHA-256 and pinned `node-semver`.
- JSON Schema 2020-12 for operation/result/compatibility contracts.

### Don't Hand-Roll

MCP framing/lifecycle, SemVer parsing, SHA-256, host path-variable emulation, and bundle graph inspection use their standard owners. Checksums are not publisher signatures.

### Pitfalls

Protocol stdout contamination, Plugin cwd used as project, host path conventions mixed, Plugin-local durable state, unresolved runtime assets, old/new process ambiguity, duplicate Skill drift, and readiness overclaim are all explicit negative gates.

### Assumptions to Validate

Codex relative path rebasing, Claude root substitution, no-external bundle, Node resolution, lifecycle independence, and compatible old/new coexistence remain claim-gated. SU-002 is implementation/host verification work, not an architecture blocker.

## Constitution Check

**Result**: Pass; no justified violations.

- Spec-first and empty semantic delta are preserved.
- One shared Kernel reuses established control-plane truth instead of duplicating it.
- Test/fault/evidence design precedes readiness claims.
- Strict inputs, low-risk-only execution, ownership proof, digest-bound clean, fail-closed compatibility, and stdout purity protect the security boundary.
- Incremental CLI cutover, versioned journal, deterministic packages, and non-destructive Skill migration keep changes reviewable/reversible.

## Project Structure

### Feature Artifacts

```text
.specify/features/2026-07-19-launchdeck-agent-surfaces/
├── plan-contract.json
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── agent-operation-result.schema.json
│   ├── agent-operations.schema.json
│   ├── compatibility-manifest.schema.json
│   ├── mcp-stdio.md
│   └── plugin-generation.md
└── planning/
    ├── lane-manifest.json
    └── handoffs/
```

### Planned Source Layout

```text
src/
├── kernel/
│   ├── operation-registry.js
│   ├── application-kernel.js
│   ├── agent-result.js
│   ├── project-context.js
│   ├── policy.js
│   ├── compatibility.js
│   ├── observations.js
│   └── operations/
│       ├── capabilities.js
│       ├── project.js
│       ├── task.js
│       ├── operation.js
│       ├── clean.js
│       └── adoption.js
├── control-plane/
│   └── operation-journal.js
├── adapters/
│   └── cli-operation-map.js
└── mcp/
    └── stdio-server.js

schema/
├── agent-operation-result.schema.json
├── agent-operations.schema.json
└── compatibility-manifest.schema.json

agent/
├── compatibility-manifest.json
├── plugins/
│   ├── codex/
│   └── claude/
└── evidence/

scripts/
└── build-agent-plugins.js

test/
├── kernel/
├── contracts/
├── mcp/
├── skill/
├── packaging/
└── host/
```

Existing files remain in place and migrate incrementally behind the Kernel; this tree names new ownership, not a rewrite.

## Implementation Sequence

1. **Contract foundation**: schemas, catalog/result/compatibility validators, canonical digest fixtures, Kernel interfaces, and exact 18-operation projection.
2. **Kernel and state**: project/policy/compatibility pipeline, journal/recovery, bounded observations, lifecycle/clean/adoption handlers, and one lock owner.
3. **CLI cutover**: route commands operation-by-operation, preserve text/JSON/compact/exit behavior and broader CLI-only routes.
4. **MCP surface**: SDK stdio adapter, schemas, errors, stdout isolation, real-wire tests, and semantic equivalence.
5. **Skill and installer**: MCP-first state machine, pre-dispatch fallback gate, forbidden routes, current/legacy/Plugin digest diagnosis.
6. **Plugin builds**: compatibility/build identity, isolated runtime, two host renderers, deterministic archives and integrity sidecars.
7. **Evidence**: contract/fault/Skill/bundle/real-host/update/uninstall/takeover/OS matrix and readiness rollup rules.

Each phase keeps the complete delivery scope; a later sequence number does not defer the capability outside this feature.

## Validation Strategy

- **Baseline**: live package help/scripts, currently `npm run check`, `npm test`, `npm run smoke`, `npm run package:check`.
- **Contracts**: registry uniqueness, exact public set, closed/forbidden inputs, result/effects rules, compatibility axes.
- **State/fault**: every journal crash point, atomic writes, same-ID/digest behavior, index rebuild, retention, lost-ID correlation, no replay.
- **Adapters**: schemaVersion 1 fixtures and normalized CLI/MCP semantic comparison.
- **MCP**: real initialize/list/call, errors, stdout/stderr, child output, interruption, restart, concurrent IDs.
- **Skill**: exact calls and forbidden calls, business-refusal stop, uncertainty recovery, duplicate copy behavior.
- **Packaging**: deterministic trees/digests, no external imports/dependencies/scripts/absolute paths/policy-bearing manifests.
- **Hosts/platforms**: separate Codex and Claude install/routing and lifecycle cells on Windows/macOS/Linux, plus cross-host independence.

## Decision Preservation Check

- D-001 shared Kernel -> AD-001/AD-002 and Kernel boundary.
- D-002 CLI/protocol separation -> AD-004/AD-006 and adapter validation.
- D-003 local configured low-risk stdio -> AD-005/AD-007 and public operation schemas.
- D-004 canonical MCP-first Skill -> AD-009 and Skill trace journey.
- D-005 separate generated Plugins -> AD-010/AD-011 and Plugin contract.
- D-006 exact result -> result schema and Kernel normalizer.
- D-007 journal/recovery -> AD-003, data model, and fault journey.
- D-008 non-destructive Skill migration -> installer state model and duplicate matrix.
- D-009 no UI -> explicit not-applicable design section.
- D-010 layered readiness -> AD-013, quickstart evidence matrix.

## Research Adoption Check

- Production MCP SDK v1.x -> dependency and adapter plan.
- Single-file esbuild ESM with no external packages -> runtime/artifact build and isolation gates.
- Host-specific path contracts -> separate renderers and real-host assumptions.
- Plugin cache/data is not project/state -> Kernel scope and shared-state boundaries.
- SHA-256 is integrity, not authenticity -> build identity wording and separate security boundary.
- Existing CLI smoke is not Plugin evidence -> exact evidence cells and no-rollup rule.

## Complexity Tracking

No constitution violations are accepted. The heavy mode reflects confirmed cross-boundary scope; decomposition and verification order manage complexity without creating extra services, shrinking delivery, or inventing deferrals.
