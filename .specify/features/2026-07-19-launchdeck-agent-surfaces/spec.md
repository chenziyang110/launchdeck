# Feature Specification: Launchdeck Agent Surfaces

**Feature Branch**: `2026-07-19-launchdeck-agent-surfaces`  
**Created**: 2026-07-19  
**Status**: Planning ready  
**Input**: Confirmed discussion contract at `.specify/discussions/agent-surfaces-skill-mcp-plugin/handoff-to-specify.json`

## Overview

### Feature Goal

Expose Launchdeck's existing daemonless local lifecycle control plane through one reusable Application Kernel, a backward-compatible CLI adapter, a typed local stdio MCP adapter, one canonical Agent Skill, and independently generated Codex and Claude Plugin packages. Every surface must share the same state, ownership, risk, compatibility, recovery, and result semantics.

### Intended Users and Value

- **Primary users**: coding agents operating local projects and developers who inspect or take over those operations through the standalone CLI.
- **Problem**: duplicating orchestration or safety behavior across CLI, MCP, Skills, and Plugins would create duplicate services, unsafe process control, incompatible shared state, and untraceable recovery.
- **Confirmed outcome**: users can express lifecycle intent through their Agent host, receive a typed and evidence-backed result, and safely continue from CLI even after the host or Plugin exits, updates, or is uninstalled.

## Confirmed Scope

### In Scope

- One Application Kernel and Operation Registry owns declared operations, execution, policy, compatibility, locking, ownership, recovery, and normalized results.
- Every operation explicitly resolves project and host scope before accessing shared state.
- Every mutation uses a Kernel-issued operation ID, input digest, durable journal record, effects certainty, provenance, and safe recovery behavior.
- Existing CLI commands route through the Kernel while preserving `schemaVersion: 1`; a capabilities operation reports the actual runtime contract.
- Local stdio MCP exposes typed capabilities, diagnosis, bounded observation, low-risk lifecycle mutations, reconciliation, and digest-bound safe clean for already configured projects.
- Adoption inspection is read-only; it neither writes configuration nor starts a task.
- One canonical `launchdeck-agent` Skill routes intent to MCP first and falls back to CLI only when the safe fallback state machine permits it.
- A compatibility manifest generates separate Codex and Claude Plugin artifacts containing the canonical Skill and a prebuilt single-file ESM MCP runtime.
- Plugin install, update, disable, and uninstall preserve managed-service lifetime and all shared state.
- Verification covers operation semantics, adapter equivalence, real stdio framing, mutation faults, Skill tool sequences, both real hosts, update/uninstall, and every claimed operating system.

### Out of Scope

- Automatic adoption or configuration writes in this release.
- Medium, high, or destructive public MCP execution.
- Force-stop, project removal, risky clean, reset, arbitrary shell/env/cwd/force inputs, model-authored approval fields, permanent follow calls, or external-process termination.
- Remote Streamable HTTP MCP, OAuth, hooks, MCP UI, GUI/TUI, production or remote service management.
- Native executable packaging and enterprise managed-policy implementation.
- An absolute exactly-once promise.

### Deferred Or Future Scope

- `adoption.apply` may be reopened only with a separately reviewed Kernel plan-digest and confirmation contract.
- Medium-risk MCP execution may be reopened only after target hosts prove reliable human elicitation and digest-bound execution-time revalidation.
- Remote MCP, policy distribution, hooks, UI, and native packaging each require a later specification and their own readiness evidence.

## Experience Requirements

- Users express lifecycle intent without selecting raw process-control commands.
- Agents observe before mutation and report a matching existing run rather than duplicating it.
- Failures identify project, task, executing surface and runtime, outcome, resource state, effects certainty, evidence, refusal reason, and safe next action.
- A host or Plugin lifecycle change never unexpectedly stops a managed service or deletes recovery evidence.
- No substantive visual, TUI, GUI, layout, or new design-system direction is included. CLI and MCP work is behavioral and protocol-oriented and reuses current presentation conventions.

## UI Reference Processing

- `ui_applicable`: false
- `ui_work_type`: none
- `real_entry_points`: launchdeck CLI; launchdeck-agent Skill; local stdio MCP; Codex Plugin; Claude Plugin
- `ui_reference_processing_status`: not-applicable
- `ui_reference_lane_mode`: none
- `ui_fidelity_mode`: none
- `visual_review_requirement`: not-needed
- **Stand-down reason**: the confirmed discussion contract marks the design system not applicable and excludes UI/TUI work; user-visible requirements concern command/protocol semantics, safety, evidence, and lifecycle behavior rather than a new presentation direction.

## Must-Preserve Discussion Inputs

- **Source**: `.specify/discussions/agent-surfaces-skill-mcp-plugin/handoff-to-specify.json`
- **Review digest**: `a2a870b1209c26068d8fb337fa1774018a09bc148148ea57343f47686adb04e6`
- **Coverage status**: complete
- **Planning gate**: ready
- **Quality gate**: user-confirmed
- **Hard unknowns / open conflicts**: 0 / 0

### Mapped Must-Preserve Items

| ID | Protected claim | Preservation in this specification |
| --- | --- | --- |
| `MP-001` | One authoritative control plane | Application Kernel is the only execution, state, safety, and recovery authority. |
| `MP-002` | Current Launchdeck repository is the target and behavior authority | All planning and implementation stay under `F:/github/launchdeck`. |
| `MP-003` | Configured-project, low-risk, local stdio MCP; one Skill; two generated Plugins | Scope, capability ledger, and acceptance proof retain this exact first-release boundary. |
| `MP-004` | CLI and Agent protocols version independently | CLI `schemaVersion: 1` is preserved; Agent result uses `protocolVersion`. |
| `MP-005` | One canonical intent-driven Skill with safe fallback | `CAP-011`, `FR-018`, and `AC-012` define selection, refusal, and fallback behavior. |
| `MP-006` | Plugin lifecycle is independent from service and shared-state lifetime | `FR-021`, `AC-002`, `AC-010`, and host lifecycle scenarios enforce it. |
| `MP-007` | Journaled, evidence-based recovery; no automatic retry of uncertainty | `FR-007` through `FR-010`, `AC-006`, and `AC-007` preserve it. |
| `MP-008` | Readiness claims remain evidence-scoped | `FR-024`, `AC-014`, and `AC-015` define layered evidence gates. |

There are no discussion conflicts. Any downstream proposal that creates another state/safety authority, broadens first-release MCP risk, makes Plugin lifecycle own services, or weakens evidence-scoped readiness must stop and reopen the confirmed discussion contract.

## Scenarios and Usage Paths

### Primary Scenario — Agent Starts or Reuses a Configured Local Service

1. A user asks Codex or Claude to run a configured local project task.
2. The canonical Skill resolves intent and calls capabilities and bounded observation before mutation.
3. The MCP adapter resolves the project explicitly and submits `task.start` to the Kernel.
4. The Kernel evaluates current task risk, project scope, compatibility, lock state, ownership, and existing run evidence.
5. If the task is not running, the Kernel journals and starts it. If a matching owned run already exists, the Kernel returns that run with `reusedExistingRun=true`.
6. The Agent reports the operation outcome, live resource status, effects certainty, provenance, evidence, and safe next actions.

**Acceptance signals**:

- One matching run exists after repeated start requests.
- Unknown or external ownership never authorizes mutation.
- CLI and MCP report semantically equivalent normalized results.

### Secondary Scenario — CLI Takes Over After Host or Plugin Exit

1. A Plugin-started service is running under shared `LAUNCHDECK_HOME` state.
2. The Agent host exits, or the Plugin is disabled, updated, or uninstalled.
3. The service remains alive, and registry, journal, logs, and events remain intact.
4. Standalone CLI capabilities and inspection identify the exact runtime, run, PID, port, state home, and compatibility state.
5. The CLI safely stops the service through the same Kernel when ownership and compatibility checks pass.

**Acceptance signals**:

- Host/MCP exit does not stop the service.
- Uninstall does not remove shared state or recovery evidence.
- A compatible newer Plugin or standalone CLI can inspect and manage the older run without duplication.

### Recovery Scenario — Mutation Transport Fails

1. A low-risk mutation is journaled and begins.
2. The MCP transport or host fails before the caller receives a definitive result.
3. The Skill does not invoke CLI fallback or replay the mutation.
4. If the caller received the operation ID, it uses `operation.get` or `operation.reconcile`. If the response carrying the ID was lost, it performs a bounded `operation.list` query by project, task, operation name, time window, and journal state.
5. One unique journal candidate may be inspected/reconciled by ID. Zero or multiple candidates stop with a typed no-match/ambiguous result and never authorize a new attempt.
6. The Kernel returns the known original result, reconciles from live evidence, or reports `indeterminate` with possible/unknown effects and a safe manual path.

**Acceptance signals**:

- The same operation ID never creates a second execution.
- A mismatched input digest or missing retained recovery record is refused.
- Indeterminate foreground work is never automatically rerun.

### Installation Scenario — Skill and Plugin Drift Is Diagnosed Non-Destructively

1. Installation or doctor inspects the current `$HOME/.agents/skills/launchdeck-agent`, legacy `~/.codex/skills/launchdeck-agent`, and applicable Plugin-bundled copy.
2. It compares canonical content-manifest digests and build identities.
3. Identical duplicates are reported with deterministic precedence and optional user-controlled cleanup guidance.
4. Divergent duplicates are preserved and reported; no path is overwritten or deleted until the user explicitly selects a migration.

**Acceptance signals**:

- Divergent user content survives installation and doctor.
- The active runtime/Skill build mismatch is visible and blocks unsafe writes.
- Plugin installation needs Node.js 20+ but no global CLI, `npx`, or install script.

### Edge Cases and Failure Paths

- Missing, ambiguous, unregistered, or out-of-scope project context returns a typed refusal; Plugin installation directory is never an implicit project.
- Package, Agent protocol, CLI envelope, config, registry, journal, Skill, schema, or manifest incompatibility permits bounded diagnosis where safe and fails writes closed.
- Medium or higher current configured risk is refused even when the MCP annotation is read-only or the host pre-approves the call.
- A stale clean preview never authorizes deletion; execution must recompute and match the current digest.
- Logs and events require bounds or cursors and cannot keep an MCP call open indefinitely.
- Any non-protocol stdout from the MCP runtime is a protocol failure; diagnostics use stderr or Launchdeck state.
- Update/uninstall must not migrate or delete shared state implicitly.

## Capability Decomposition

| Capability | Purpose | Disposition | Primary proof |
| --- | --- | --- | --- |
| `CAP-001` Kernel registry and result contract | One operation and semantic authority | In scope | `AC-001`, `AC-011` |
| `CAP-002` Project/scope resolver | Prevent wrong-directory and cross-project actions | In scope | `AC-009` |
| `CAP-003` Risk/ownership/compatibility policy | Make every mutation deterministic and fail-closed | In scope | `AC-004`, `AC-005`, `AC-011` |
| `CAP-004` Journal and recovery | Prevent blind replay and make uncertainty inspectable | In scope | `AC-006`, `AC-007` |
| `CAP-005` CLI compatibility adapter | Preserve existing automation while sharing Kernel behavior | In scope | `AC-001` |
| `CAP-006` Typed stdio MCP adapter | Make declared operations Agent-usable and host-portable | In scope | `AC-014` |
| `CAP-007` Diagnosis and bounded observation | Observe state without arbitrary reads or permanent calls | In scope | `AC-009`, `AC-014` |
| `CAP-008` Low-risk lifecycle mutation | Safely start, stop, restart, and run configured tasks | In scope | `AC-002`–`AC-005` |
| `CAP-009` Reconcile and safe clean | Recover known work and bind deletion to fresh evidence | In scope | `AC-006`–`AC-008` |
| `CAP-010` Adoption inspection | Discover changes without applying or starting | In scope | `AC-016` |
| `CAP-011` Canonical Skill | Route intent and preserve refusal/uncertainty semantics | In scope | `AC-012`, `AC-013` |
| `CAP-012` Compatibility manifest and Plugins | Generate host-correct artifacts with one build identity | In scope | `AC-010`, `AC-011`, `AC-015` |
| `CAP-013` Verification matrix | Bind readiness to exact tested surfaces | In scope | `AC-014`, `AC-015` |

All in-scope capabilities belong to one coherent feature boundary. They share one Kernel, one state home, one compatibility model, and one release-evidence matrix; splitting them into separate specifications would permit unsafe semantic drift.

### Capability Preservation Ledger

| Upstream signal | Selected entry point | Disposition | First-release obligation or exclusion | Confirmation / reopen |
| --- | --- | --- | --- | --- |
| Configured-project lifecycle | Kernel + CLI/MCP adapters | In scope | Declared tasks only; current low-risk policy; ownership and project scope required | Confirmed digest |
| Read-only adoption inspection | `adoption.inspect` | In scope | Return a plan only; never write or start | Confirmed digest |
| Adoption apply | Future `adoption.apply` | Deferred | Requires reviewed digest, confirmation evidence, revalidation, and no implicit start | Reopen if required now |
| Medium-risk execution | Future capability-negotiated operation | Deferred | Requires reliable host elicitation and digest-bound confirmation | Reopen after host proof and scope change |
| Remote MCP / OAuth / hooks / UI / native / enterprise | Separate future specifications | Deferred | No implementation or readiness implication now | Reopen per surface |
| High/destructive MCP and raw shell controls | No public entry point | Dropped | Tool schemas exclude the operation and forgeable inputs | New reviewed safety contract required |
| External-process termination | No public entry point | Dropped | Inspect-only without Launchdeck ownership proof | Ownership contract must be reopened |
| Production or remote service management | No first-release entry point | Dropped | The local control plane cannot target production or remote managed services | New trust/auth/policy/evidence contract required |
| Universal exactly-once | No product promise | Dropped | Use idempotency, recovery, and explicit indeterminate effects | Reopen only for a provable restricted class |

No capability has been narrowed to documentation-only or static templates. Deferred and dropped rows retain their source, reason, confirmation digest, and reopen condition in `spec-contract.json` and `alignment.md`.

## Requirements

### Kernel, State, and Policy

- **FR-001**: The Application Kernel must be the only public execution path for CLI and MCP lifecycle operations.
- **FR-002**: The Operation Registry must declare each operation's identity, input contract, result contract, mutability, risk handling, ownership requirements, scope requirements, compatibility requirements, and validation cases.
- **FR-003**: CLI help/mapping, MCP tools/schemas, and compatibility data must be generated from or validated against shared operation definitions so drift fails verification.
- **FR-004**: CLI, MCP, and Plugin runtimes must use the same `LAUNCHDECK_HOME`, registry, run index, locks, logs, events, runtime state, and operation journal.
- **FR-005**: Every operation must resolve `projectRef`, explicit `projectRoot`, host project root, and registered user-scope project precedence; missing, ambiguous, and scope-violation results must be distinct.
- **FR-006**: Every mutation must re-evaluate current configured risk, Launchdeck ownership, project scope, version compatibility, and relevant locks immediately before execution.

### Journal, Effects, and Recovery

- **FR-007**: The Kernel must issue one immutable operation ID for each new mutation and persist it in `prepared` state with operation name, input digest, project/task refs, effects certainty, result reference, timestamps, and runtime provenance in a versioned journal under `LAUNCHDECK_HOME` before any side effect.
- **FR-008**: Journal states must distinguish `prepared`, `running`, `succeeded`, `failed`, `refused`, `indeterminate`, and `reconciled`.
- **FR-009**: A known operation ID plus the same input digest must return or recover the original operation without re-execution; a different digest must be refused. If a failed response prevents the caller from observing the ID, bounded `operation.list` correlation by project, task, operation name, creation window, and journal state must return zero, one, or ambiguous candidates without starting work.
- **FR-010**: A supplied recovery operation ID with no retained record must return `operation_record_missing_or_expired` and must not start new work.
- **FR-011**: `prepared`, `running`, and `indeterminate` records must not be age-pruned. Terminal full records default to 30 days of retention; configuration may change the terminal window but cannot prune unresolved evidence.
- **FR-012**: A transport failure must produce either a recovered definitive outcome or an explicit `indeterminate` outcome. Recovery may use a known ID or one unique bounded journal correlation result; zero or ambiguous correlation cannot authorize retry. No Skill, CLI, or MCP surface may automatically retry or replay uncertain mutation.
- **FR-013**: Product language and results must distinguish resource-aware idempotency from universal exactly-once execution.

### Agent Operation Result

The Agent protocol result has the following exact top-level fields. A CLI adapter may render or nest this data inside the existing CLI envelope but must preserve current public field meanings.

| Field | Required semantics |
| --- | --- |
| `protocolVersion` | Agent protocol version, independent from package and CLI schema version |
| `operation` | `id`, `name`, `inputDigest`, and `journalStatus` |
| `outcome` | `kind`, `code`, `message`, and `reusedExistingRun`; `kind` is `succeeded`, `failed`, `partial`, `refused`, or `indeterminate` |
| `resource` | `kind`, `id`, `status`, `projectRef`, `taskRef`, and `runId`; lifecycle status is independent from operation outcome |
| `effects` | `certainty`, `changed`, and `evidenceRefs`; certainty is `none`, `confirmed`, `possible`, or `unknown` |
| `safety` | Current `risk`, policy `decision`, `ownership`, and `projectScope` evidence |
| `error` | Nullable typed `code`, `message`, and structured `details` |
| `nextActions` | Bounded safe actions; never model-authored confirmation or arbitrary shell instructions |
| `provenance` | `surface`, `host`, `runtimeKind`, `runtimeVersion`, `runtimePath`, `stateHome`, `buildIdentity`, `agentProtocolVersion`, and `cliSchemaVersion` when applicable |

- **FR-014**: `outcome.kind` must never be used as the resource lifecycle state, and `resource.status` must never imply transport or operation success.
- **FR-015**: All result fields must be semantically comparable across CLI and MCP even when host formatting differs.

### CLI and MCP Adapters

- **FR-016**: Existing CLI JSON and compact output contracts must remain backward compatible at `schemaVersion: 1` while routing execution through the Kernel.
- **FR-017**: The local stdio MCP runtime must expose typed forms of `capabilities.get`, `system.diagnose`, project/task inspection, `adoption.inspect`, bounded logs/events, low-risk `task.start|stop|restart|run`, bounded `operation.list`, `operation.get|reconcile`, and `clean.plan|applySafe`.
- **FR-018**: MCP inputs may contain declared project/task refs, operation IDs, plan digests, cursors, limits, and bounded operation options only; they must exclude `command`, `shell`, `env`, `cwd`, `force`, `yes`, `confirmed`, `approvalToken`, and arbitrary paths.
- **FR-019**: Logs/events tools must require cursor/window/limit bounds and may not implement permanent follow calls.
- **FR-020**: MCP stdout must contain protocol frames only; diagnostics and incidental task output must use stderr or bounded Launchdeck logs/events.
- **FR-021**: `clean.applySafe` must recompute the plan and refuse when its current digest differs from the supplied preview digest.
- **FR-022**: MCP annotations and host approvals must never replace Kernel risk, ownership, scope, digest, lock, or compatibility decisions.

### Skill, Plugins, and Compatibility

- **FR-023**: The canonical Skill must observe before mutation, select MCP first only for a supported safe operation, and fall back to CLI only when MCP is unavailable or explicitly lacks that safe operation.
- **FR-024**: A business refusal, compatibility refusal, ownership refusal, or uncertain mutation must never trigger CLI fallback; the Skill must report the refusal or reconcile the original operation.
- **FR-025**: Installer and doctor must inspect both current `$HOME/.agents/skills/launchdeck-agent` and legacy `~/.codex/skills/launchdeck-agent` locations and applicable Plugin-bundled copies using canonical content-manifest digests and build identity.
- **FR-026**: Identical duplicate Skills must be reported with deterministic host-preferred precedence and optional user-controlled cleanup guidance; divergent copies must be preserved and require an explicit user-selected migration.
- **FR-027**: New user-level Codex installation must target the current preferred path, be idempotent for identical content, and refuse to overwrite divergent content.
- **FR-028**: One compatibility manifest must bind package, Agent protocol, CLI output, config, registry, journal, Skill, schema, runtime, and host-manifest versions/digests without conflating their axes.
- **FR-029**: Codex and Claude Plugin packages must be generated and validated separately, bundle the prebuilt ESM stdio runtime and canonical Skill, require Node.js 20+, and avoid global CLI, `npx`, and install scripts.
- **FR-030**: Host manifests may contain identity, component paths, metadata, prerequisites, and presentation, but must not duplicate operation, risk, safety, state, or recovery policy.
- **FR-031**: Host/MCP exit, Plugin update, disable, and uninstall must leave managed tasks and shared state unchanged.

### Verification and Readiness

- **FR-032**: Shared operation contract cases must compare normalized operation, outcome, resource, effects, safety, errors, next actions, and provenance rather than raw output snapshots.
- **FR-033**: Fault injection must cover failure before journal write, after journal write, during execution, after side effect but before response, lock conflict, restart, and cross-surface recovery.
- **FR-034**: Skill evaluation must assert actual tool-call sequences, forbidden calls, MCP-first behavior, safe fallback, refusal handling, and uncertainty reconciliation.
- **FR-035**: Real stdio tests must cover initialize, tools/list, tools/call, schema validation, structured output, stdout/stderr separation, interruption, restart, and concurrency.
- **FR-036**: Codex and Claude each require real installation/use traces for routing, MCP launch, project scope, update, disable/uninstall, and shared-state takeover.
- **FR-037**: Readiness labels must be layered by operation contract, CLI, stdio MCP, Skill, host, update/uninstall, recovery, and operating system and may not roll untested evidence upward.
- **FR-038**: `adoption.inspect` must return a bounded proposed configuration plan without writing project or user configuration, registering a project, authorizing `adoption.apply`, or starting a task.

### Non-Functional Requirements

- **Security**: Kernel input validation and policy enforcement remain authoritative even when host metadata is incorrect or permissive.
- **Reliability**: Duplicate starts, uncertain mutations, and cross-version takeover must be deterministic, journaled, and testable.
- **Observability**: Every mutation exposes operation ID, effects certainty, provenance, evidence refs, and safe next actions.
- **Compatibility**: Existing CLI consumers remain supported while newer Agent protocol and Plugin components fail incompatible writes closed.
- **Portability**: The first release supports Node.js 20+ and makes separate operating-system claims only after the complete relevant surface passes there.

## Acceptance Proof

### Required Evidence

1. Kernel operation-contract cases for every declared operation, including refusal and indeterminate branches.
2. CLI regression fixtures proving `schemaVersion: 1` and current compact/JSON behavior remain compatible.
3. CLI/MCP semantic-equivalence tests using normalized fields instead of formatting snapshots.
4. Real stdio protocol-client tests with stdout purity, stderr diagnostics, interruption, restart, and concurrency.
5. Mutation fault-injection tests proving journal recovery and no cross-surface replay.
6. Skill evaluation traces proving safe MCP-first routing, guarded fallback, and forbidden raw calls.
7. Separate real Codex and Claude host smokes for install, launch, routing, scope, update, disable/uninstall, and cross-version takeover that preserves run ID, PID, port, state home, and safe stop from a compatible newer Plugin or standalone CLI.
8. Surface/host/OS readiness matrix that names every passed, failed, blocked, and unsupported cell.

### Measurable Success Criteria

- **SC-001**: Repeated start of a matching owned task results in exactly one live run and returns `reusedExistingRun=true` on reuse.
- **SC-002**: Every mutation test case emits one Kernel-issued operation ID and a retrievable journal record before claiming a definitive effect.
- **SC-003**: Every injected uncertain transport failure produces no automatic second execution and ends in recovered or explicit `indeterminate` state.
- **SC-004**: Every public MCP mutation rejects current medium/high/destructive risk and every forbidden raw-control input.
- **SC-005**: Every safe-clean execution either matches a freshly recomputed digest or refuses without deletion.
- **SC-006**: Plugin exit/update/disable/uninstall preserves service liveness and shared state in all claimed host/OS cells.
- **SC-007**: No host-ready or cross-platform-ready label exists without the exact corresponding real-host and platform evidence.
- **SC-008**: `adoption.inspect` leaves project files, user configuration, registry state, and task/run state byte-for-byte or semantically unchanged and produces no start operation.

## Decision Capture

### Discussion Decision Digest

- **Selected direction**: one Application Kernel with thin CLI/MCP adapters; one canonical Skill; one npm runtime; separate generated Codex and Claude Plugins; local stdio and low-risk configured-project MCP only.
- **Rejected alternatives**: permanent CLI-spawning MCP, CLI depending on MCP, separate state/safety implementations, one universal host manifest, remote-first or Plugin-only control plane, broad raw CLI parity, and automatic adoption or medium-plus first-release execution.
- **Accepted tradeoffs**: Node.js 20+ remains required; MCP is narrower than CLI; hosts package separately; indeterminate recovery replaces a universal exactly-once promise; adoption stays inspect-only.
- **Experience commitments**: intent-driven use, observe-before-mutate, evidence-rich failures, and Plugin lifecycle independence.
- **Must not dilute**: ownership proof, dynamic Kernel risk, project scope, operation journal/effects certainty, managed-task lifetime independence, refusal/uncertainty fallback rules, and evidence-scoped readiness.

### Specify-Owned Decisions

- Agent Result exact top-level fields and core subfields are fixed in the Agent Operation Result section.
- Journal default is 30 days for terminal full records; unresolved/indeterminate records do not age-prune, and missing recovery IDs refuse without execution.
- Codex Skill migration is digest-based, current-path-preferred, and non-destructive for identical and divergent duplicates.
- These decisions elaborate upstream `SU-003`, `SU-004`, and `SU-005` within the confirmed boundary; they do not change scope, risk acceptance, target, or deferral and therefore produce no semantic delta.

## Consequence Analysis

The Senior Consequence Analysis Gate is triggered because this feature changes lifecycle operations, running services, shared state, compatibility, destructive-clean safety, multiple hosts, and security-sensitive mutation behavior.

### Affected Object and State Summary

| Objects | Important states | Required behavior | Protected obligations |
| --- | --- | --- | --- |
| Kernel, registry, CLI/MCP adapters | requested, authorized, refused, running, succeeded, failed, indeterminate, reconciled | One policy/result authority across surfaces | `CA-001`, `CA-002`, `CA-007`, `CA-008`, `CA-010`, `CA-016`, `CA-017`, `CA-024`, `CA-025`, `CA-041` |
| Project, task, run, PID, port, ownership | missing, configured, stopped, running, failed, unknown/external owner, stale | Explicit scope; reuse matching run; inspect-only unknown/external | `CA-003`, `CA-004`, `CA-009`, `CA-014`, `CA-020`, `CA-021`, `CA-031` |
| Journal, operation ID, input/plan digest | prepared, running, terminal, indeterminate, reconciled, expired | Recover known work; refuse mismatch/expiry; never replay uncertainty | `CA-005`, `CA-011`, `CA-013`, `CA-026`–`CA-029`, `CA-042`–`CA-044` |
| Skill, runtime, schemas, manifests, Plugins | absent, installed, duplicate, divergent, compatible, incompatible, updated, disabled, uninstalled | One build identity; non-destructive drift handling; service/state survival | `CA-012`, `CA-015`, `CA-022`, `CA-023`, `CA-032`–`CA-035`, `CA-037`, `CA-038`, `CA-047`, `CA-048` |
| Stdio, logs/events, eval and release evidence | valid, invalid, passed, failed, blocked, unsupported | Bounded/protocol-pure behavior and exact evidence-scoped claims | `CA-006`, `CA-036`, `CA-039`, `CA-040`, `CA-045`, `CA-046`, `CA-049`, `CA-050` |
| Future confirmation/adoption plans | deferred, prepared, confirmed, stale, revalidated | Preserve future safe contract without exposing it now | `CA-018`, `CA-019`, `CA-030` |

Every `CA-001` through `CA-050` is retained in `spec-contract.json.consequence_obligation_refs`; full claims, owners, latest resolve phases, and stop/reopen conditions remain authoritative in the source handoff.

### Recovery and Validation Contract

- Locks, operation IDs, and digests provide resource-aware idempotency and recovery, not a universal exactly-once promise.
- A transport failure must resolve from journal and live evidence or remain explicitly indeterminate.
- Rollback and cleanup never terminate unknown/external processes and never treat Plugin uninstall as state cleanup.
- Compatibility migration is versioned; diagnosis remains available where safe, while incompatible writes fail closed.
- Validation must cover positive behavior, refusal behavior, interruption/restart, concurrency, cross-version takeover, update/uninstall, and recovery.

## Risks and Gaps

### Planning Risks

- Extracting orchestration from CLI-private handlers may expose hidden compatibility coupling; planning must map every current handler and output consumer before moving behavior.
- Package, protocol, state, Skill, and manifest versions can drift unless one compatibility manifest and capabilities check bind them.
- Real host path substitution and bundle launch details differ between Codex and Claude and cannot be generalized from manifest mocks.
- Journal retention and recovery must not allow unresolved evidence to disappear or a missing record to become a new execution.

### Non-Blocking Coverage Gaps

- **SU-001**: reliable portable Codex form elicitation remains deferred until medium-risk MCP is reconsidered.
- **SU-002**: exact bundled MCP path substitution and manifest fields require separate real Codex and Claude verification before each host-ready claim.
- **CG-001**: final Kernel, MCP adapter/bundle, host Plugin source/generation, and operation/schema paths are plan-owned placement decisions; reopen if placement requires a second state authority or incompatible package boundary.
- **CG-002**: project cognition is advisory and was unavailable/stale during the upstream truth pass; planning must continue from bounded live evidence and stop if it contradicts the retained contract.

There are no planning-critical open questions. The canonical contract has no semantic delta from the user-confirmed discussion scope, and the mandatory independent artifact re-review passed after its two agent-owned findings were repaired.
