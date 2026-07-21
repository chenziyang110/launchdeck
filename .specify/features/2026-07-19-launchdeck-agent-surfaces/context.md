# Planning Context: Launchdeck Agent Surfaces

**Feature Branch**: `2026-07-19-launchdeck-agent-surfaces`  
**Created**: 2026-07-19  
**Status**: Planning ready  
**Derived From**: canonical `spec-contract.json`, project-facing `spec.md`, confirmed discussion contract, and retained live repository evidence

## Planning Context

- The boundary is one coherent cross-cutting feature in `F:/github/launchdeck`: shared Application Kernel, backward-compatible CLI, typed local stdio MCP, one canonical Skill, and generated Codex/Claude Plugins.
- The source discussion is user-confirmed, coverage-complete, conflict-free, and planning-eligible at review digest `a2a870b1209c26068d8fb337fa1774018a09bc148148ea57343f47686adb04e6`.
- `semantic_delta` is empty. Planning must not re-litigate the locked direction or broaden/defer/drop capabilities silently.
- Project cognition is navigation-only and was unavailable/stale during the upstream truth pass. Live repository files and targeted tests remain the behavior authority.

## Relevant Repository Context

| Surface | Current evidence ref | Planning relevance |
| --- | --- | --- |
| Product and lifecycle contract | `README.md` | Existing daemonless global control plane, lifecycle commands, ownership safety, JSON contract, and Skill installer |
| Canonical Agent router | `.agents/skills/launchdeck-agent/SKILL.md` | Existing intent and lifecycle safety behavior to evolve without creating competing Skills |
| Cross-host Skill installer | `src/agent-installer.js` | Existing target matrix and conservative install behavior; foundation for duplicate/drift handling |
| CLI entry and application orchestration | `src/cli.js` | Current private orchestration that must move behind the Kernel rather than be duplicated in MCP |
| Public result behavior | `src/output.js` | Existing success/failure/partial envelope, compact output, error semantics, and safe next actions to preserve |
| Shared runtime/state | `src/global-runtime.js`, `src/runtime.js`, `src/control-plane/` | Existing registry, run, lock, ownership, inspect, event, log, and process primitives |
| Current regression routes | `test/agent-installer.test.js`, `test/cli-contract.test.js`, `test/cli-control-plane-contract.test.js` | Thirty-three targeted tests passed during the upstream truth pass |

The final Kernel modules, MCP adapter/bundle, Plugin source/generation directories, and operation/schema paths are plan-owned placement decisions. Planning must prove the chosen owners from bounded live reads and stop if placement requires a second state authority or incompatible package boundary.

## Existing Patterns and Reuse Notes

- Reuse the existing user-scoped registry, run index, locks, ownership proof, events, logs, runtime state, and process/port adapters; do not create Plugin-local substitutes.
- Preserve daemonless task lifetime: a managed task is an operating-system process owned through Launchdeck evidence, not a child whose lifetime is tied to an MCP request.
- Preserve current CLI JSON/compact semantics and map them to the Agent Result rather than replacing them with MCP-shaped output.
- Extend the existing canonical Skill and installer conservatively; do not introduce multiple public lifecycle Skills.
- Use current project/task declarations as the only source for Agent lifecycle inputs; the MCP layer is not a generic shell wrapper.

## Integration Boundaries

| Boundary | Inputs and trust | Required handling |
| --- | --- | --- |
| CLI → Kernel | Parsed existing CLI commands and options | Preserve `schemaVersion: 1`; resolve declared operation; return current envelope with equivalent Agent semantics |
| MCP → Kernel | Typed project/task refs, operation IDs, plan digests, cursors/limits, bounded options | Reject arbitrary shell/env/cwd/force/path/approval inputs; Kernel policy remains authoritative |
| Skill → MCP/CLI | User lifecycle intent and observed capabilities | MCP first only when supported and safe; CLI fallback only for unavailable/unsupported safe transport; never after refusal or uncertainty |
| Kernel → shared state | `LAUNCHDECK_HOME`, registry, run index, locks, journal, logs, events | Version every state contract; fail writes closed on incompatibility; retain bounded diagnosis |
| Kernel → OS process/port | Declared task command and Launchdeck ownership evidence | Reuse matching run; unknown/external is inspect-only; never authorize by port/PID alone |
| Build → Plugins | Runtime bundle, canonical Skill, schemas, compatibility manifest, host manifest | One build identity/digests; generate Codex and Claude artifacts separately; no duplicated safety policy |
| Plugin/host → runtime | Host path variables, Node.js 20+, stdio | Real-host verification required; stdout protocol-only; host exit does not stop services |

## Product Boundary Constraints

- First release is configured-project, local stdio, and current-Kernel-evaluated low-risk public mutation only.
- Adoption is inspect-only; future apply must not be implicitly chained to task start.
- Medium risk retains a future elicitation/digest/revalidation contract but is refused now.
- High/destructive, raw process control, external-process termination, permanent follow, remote MCP, UI, native, and enterprise surfaces are not first-release capabilities.
- Node.js 20+ is explicit; “no global CLI” must not be presented as “no runtime prerequisite.”
- Host manifests are packaging/presentation metadata, never a policy source.

## Affected Object Map

| Obligation refs | Object/state surface | Owner | Consumers | Evidence | Coverage gap |
| --- | --- | --- | --- | --- | --- |
| `CA-001`, `CA-002`, `CA-007`, `CA-008`, `CA-010`, `CA-016`, `CA-017`, `CA-024`, `CA-025`, `CA-041` | Kernel, Operation Registry, CLI/MCP adapters, normalized result | Application Kernel | CLI, MCP, Skill, both Plugins | `src/cli.js`, `src/output.js`, source handoff | Final module/schema placement is plan-owned |
| `CA-003`, `CA-004`, `CA-009`, `CA-014`, `CA-020`, `CA-021`, `CA-031` | Project, task, run, PID, port, ownership, scope | Kernel + existing control plane | Lifecycle operations and observation | `src/global-runtime.js`, `src/runtime.js`, `src/control-plane/` | Exact resolver boundary is plan-owned |
| `CA-005`, `CA-011`, `CA-013`, `CA-026`–`CA-029`, `CA-042`–`CA-044` | Operation journal, IDs/digests, effects, safe clean | Kernel journal/recovery | CLI/MCP retry, Skill fallback, diagnosis | Confirmed discussion contract; current locks/state patterns | Journal physical module and storage file shape are plan-owned |
| `CA-012`, `CA-015`, `CA-022`, `CA-023`, `CA-032`–`CA-035`, `CA-037`, `CA-038`, `CA-047`, `CA-048` | Skill, runtime, schemas, manifest, Plugin packages, shared state | Build/installer/runtime owners | Codex, Claude, CLI | `.agents/skills/launchdeck-agent/SKILL.md`, `src/agent-installer.js` | Exact host path substitution requires real-host proof |
| `CA-006`, `CA-036`, `CA-039`, `CA-040`, `CA-045`, `CA-046`, `CA-049`, `CA-050` | Stdio frames, logs/events, eval traces, host/platform evidence | Adapter + verification owners | Release process and users | Existing test conventions; source handoff official-doc evidence | Each host/OS cell remains unproved until executed |
| `CA-018`, `CA-019`, `CA-030` | Future medium-risk confirmation and adoption plans | Future specification | Future MCP clients | Preserved deferred contract | Deliberately deferred |

## State-Behavior Matrix

| Surface | State | Required behavior |
| --- | --- | --- |
| Project resolution | missing | Return typed missing-project result and safe next action; do not use Plugin directory |
| Project resolution | ambiguous or outside allowed scope | Refuse and report candidate/scope evidence without mutation |
| Task/run | stopped and safe/owned/compatible | Journal one operation, acquire required lock, execute once, report definitive or indeterminate effects |
| Task/run | matching run already active | Return existing run with `reusedExistingRun=true`; do not spawn |
| Task/run | unknown or external owner | Inspect-only; mutation refused |
| Task/run | failed or completed | Report lifecycle status independently from operation outcome; mutation follows declared task semantics and new operation ID |
| Operation | prepared/running | Persist until terminal or reconciled; same-ID request inspects original work |
| Operation | response lost before caller observes ID | Use bounded `operation.list` correlation by project/task/name/time/state; reconcile only one unique candidate; stop on zero or ambiguous matches |
| Operation | succeeded/failed/refused | Return original result for same ID/digest; terminal full record defaults to 30-day retention |
| Operation | indeterminate | Never auto-retry; inspect/reconcile from journal and live evidence; retain until resolved |
| Operation | recovery ID missing/expired | Return `operation_record_missing_or_expired`; never treat it as a new execution |
| Clean plan | digest matches fresh recomputation | Execute safe-clean targets only and journal result |
| Clean plan | digest stale | Refuse without deletion and require a new plan |
| Runtime/components | compatible | Permit declared operations within policy |
| Runtime/components | incompatible or digest drift | Permit bounded diagnosis where safe; fail writes closed |
| Skill installation | identical duplicate | Report locations and deterministic precedence; optional user-controlled cleanup |
| Skill installation | divergent duplicate | Preserve content, report digests/ambiguity, require explicit user migration |
| Plugin/host | exit, disabled, updated, uninstalled | Leave services and shared state intact; compatible standalone CLI may take over |
| Release evidence | failed, blocked, or unsupported cell | Withhold that exact readiness claim and every roll-up depending on it |

## Dependency Impact Table

| Obligation refs | Dependency / consumer | Impact | Required handling and evidence |
| --- | --- | --- | --- |
| `CA-001`, `CA-016`, `CA-041` | Existing CLI orchestration and output consumers | Kernel extraction can change semantics or formatting | Inventory current handlers and envelope consumers; contract and equivalence tests before cutover |
| `CA-003`, `CA-004`, `CA-021` | Registry/run/ownership/process adapters | Incorrect ownership or lifetime coupling can duplicate or kill services | Reuse authoritative evidence; positive, refusal, host-exit, and takeover tests |
| `CA-007`, `CA-010`, `CA-025`, `CA-035` | Package/protocol/config/registry/journal/build identities | Conflation can permit unsafe writes or false incompatibility | Separate axes in compatibility manifest and capabilities; mismatch tests fail writes closed |
| `CA-011`, `CA-028`, `CA-029`, `CA-043`, `CA-044` | Journal, Skill fallback, CLI/MCP recovery | Transport failure can replay side effects | Fault-injection matrix with same-ID recovery and no cross-surface retry |
| `CA-020`, `CA-032`–`CA-038` | Host manifests and Plugin packages | Host path/layout drift can launch wrong runtime or duplicate policy | Generate separately from one manifest; digest validation; real-host launch proof |
| `CA-039`, `CA-040`, `CA-046`, `CA-049`, `CA-050` | Release labels, docs, host/platform claims | Narrow tests can be generalized incorrectly | Layered readiness matrix with exact evidence links and unsupported cells visible |

## Change Propagation Matrix

| Change surface | Upstream inputs | Downstream consumers | Constraint / risk |
| --- | --- | --- | --- |
| Operation definition | Existing CLI command semantics and configured task policy | Kernel, CLI mapping/help, MCP tool/schema, tests, capabilities | One definition must not make host manifests a second policy source |
| Agent Result | Current CLI envelopes plus normalized semantics | MCP structured output, Skill reports, equivalence tests, docs | Outcome/resource separation and provenance must survive every adapter |
| Journal/state version | Operation identity, locks, effect evidence | Retry, reconcile, update takeover, standalone CLI | Migration must preserve unresolved evidence and fail writes closed |
| Compatibility manifest | Package/protocol/state/schema/Skill/runtime identities | Build, capabilities, both Plugins, installer doctor | Separate version axes; shared build identity/digests |
| Skill content/routing | Capability contract and fallback rules | User-level installs, Plugin copies, Codex/Claude behavior | Duplicate/drift detection must be non-destructive |
| MCP runtime bundle | Operation definitions, SDK, schemas | Host manifests, stdio tests, both Plugins | Prebuilt ESM; stdout purity; no global CLI/npx/install script |
| Host lifecycle | Plugin install/update/disable/uninstall | Managed service, shared state, recovery, CLI takeover | Package lifecycle cannot own product runtime state |

## Locked Decisions Carry-Forward

- One Kernel owns execution, safety, compatibility, shared state, recovery, and normalized semantics.
- CLI and Agent protocol versions remain independent; current CLI behavior is a compatibility constraint.
- First-release public MCP is narrower than CLI and dynamically low-risk only.
- Canonical Skill is one intent router; refusal and uncertain mutation never trigger blind fallback.
- Plugins bundle the runtime and are host-specific artifacts from one compatibility manifest.
- Node.js 20+ remains a declared prerequisite.
- Journaled idempotency and indeterminate effects replace universal exactly-once claims.
- Readiness never rolls across untested surface, host, update/uninstall, recovery, or OS boundaries.

## Must-Preserve Carry-Forward

- `MP-001` through `MP-008` and `CA-001` through `CA-050` remain protected by stable reference to the source handoff.
- A downstream phase may resolve or reopen an obligation but may not silently omit, weaken, or replace it.
- Stop and reopen if a surface becomes an independent authority, CLI compatibility blocks normalized semantics, recovery needs a daemon/alternate authority, a host cannot launch the bundled runtime under the prerequisite model, or a deferred surface becomes mandatory now.

## Canonical References

- `.specify/features/2026-07-19-launchdeck-agent-surfaces/spec-contract.json` — Agent-authoritative specification contract.
- `.specify/features/2026-07-19-launchdeck-agent-surfaces/spec.md` — Project-facing behavior and acceptance specification.
- `.specify/features/2026-07-19-launchdeck-agent-surfaces/alignment.md` — Semantic terms, upstream dispositions, resolved soft unknowns, and delta audit.
- `.specify/discussions/agent-surfaces-skill-mcp-plugin/handoff-to-specify.json` — User-confirmed upstream decisions and full protected obligations.
- `README.md`, `.agents/skills/launchdeck-agent/SKILL.md`, `src/agent-installer.js`, `src/cli.js`, `src/output.js`, `src/global-runtime.js`, `src/runtime.js`, `src/control-plane/` — retained live behavior evidence.

## Deferred / Future Ideas

- `adoption.apply` with reviewed plan digest, confirmation evidence, execution-time revalidation, and no implicit start.
- Medium-risk MCP with verified host elicitation and confirmation binding.
- Remote MCP/OAuth, hooks, UI, native executable distribution, and enterprise policy, each under a separate later contract.
