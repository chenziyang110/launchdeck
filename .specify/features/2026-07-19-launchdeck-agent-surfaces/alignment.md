# Alignment: Launchdeck Agent Surfaces

**Mode**: Compile from confirmed discussion contract  
**Source**: `.specify/discussions/agent-surfaces-skill-mcp-plugin/handoff-to-specify.json`  
**Source digest**: `a2a870b1209c26068d8fb337fa1774018a09bc148148ea57343f47686adb04e6`  
**Handoff validation**: valid; complete coverage; planning gate ready; quality gate user-confirmed; zero hard unknowns; zero open conflicts

## Semantic Delta

`semantic_delta: []`

The specification preserves the locked target, first-release boundary, safety posture, architecture direction, Plugin model, accepted tradeoffs, and all protected `MP-*` and `CA-*` obligations. Specify-owned resolution of `SU-003`, `SU-004`, and `SU-005` adds planning detail expressly assigned to this phase; it does not broaden or narrow scope, change risk acceptance, move the target, or alter a confirmed deferral.

## Semantic Term Decisions

| Term | Selected meaning | Excluded meaning | Confirmation / authority |
| --- | --- | --- | --- |
| One control plane | One Kernel, state home, safety policy, compatibility model, and recovery authority shared by every adapter | Multiple backends or host-owned authoritative state | `MP-001`, confirmed digest |
| Application Kernel | Public application boundary owning declared operation execution, policy, ownership, locks, compatibility, journal, recovery, and normalized results | A thin utility library while CLI/MCP keep separate orchestration | Locked direction |
| Configured project | A project resolvable through explicit/host/registered context under the caller's allowed scope | Plugin installation directory or arbitrary caller-provided cwd | `CA-009`, `CA-020` |
| Low risk | Current risk resolved from the configured task by the Kernel immediately before execution | Static MCP annotation, host approval, or a model assertion | `CA-008`, `CA-016`, `CA-017` |
| Ownership | Launchdeck proof tying managed task/run/process state to the requested resource | Port or PID coincidence | `CA-004` |
| Normalized result | Separate operation outcome, resource lifecycle state, effects certainty, safety, error, next action, and provenance | One overloaded status field or host-formatted prose | `CA-024`, `CA-041` |
| Indeterminate | The mutation may have produced side effects but current evidence cannot prove a definitive result | Failure assumed safe to retry | `MP-007`, `CA-011`, `CA-029`, `CA-044` |
| Safe clean | Kernel recomputes and matches a current plan digest immediately before deletion | Boolean yes/confirmed or possession of a stale digest | `CA-005`, `CA-013`, `CA-026`, `CA-027` |
| Plugin | Host-specific installable artifact containing the canonical Skill, host metadata, and bundled stdio runtime, generated from one compatibility manifest | A second product backend, state owner, or service supervisor | `CA-032`, `CA-038` |
| Canonical Skill | One intent router with progressive-disclosure references, MCP-first operation selection, and guarded CLI fallback | Multiple competing public lifecycle Skills or blind fallback | `MP-005`, `CA-023`, `CA-045` |
| Ready | A claim bound to the exact verified surface, host, OS, update/uninstall, and recovery cells | CLI tests generalized to MCP, Plugin, host, or platform readiness | `MP-008`, `CA-039`, `CA-040`, `CA-050` |

## Upstream Intent Disposition

| Capability signal | Disposition | Reason and obligation | Confirmation / reopen |
| --- | --- | --- | --- |
| Kernel Operation Registry and normalized result | In scope | Required single authority and adapter-equivalence foundation | Confirmed digest |
| Project context and scope resolution | In scope | Prevents wrong-directory and cross-project mutation | Confirmed digest |
| Risk, ownership, compatibility policy | In scope | Kernel safety boundary shared by all mutation surfaces | Confirmed digest |
| Operation journal and recovery | In scope | Required for idempotency, uncertainty, and cross-surface recovery | Confirmed digest |
| CLI compatibility adapter and capabilities | In scope | Preserves existing consumers and exposes real runtime contract | Confirmed digest |
| Typed local stdio MCP | In scope | First-release Agent transport | Confirmed digest |
| Diagnosis and bounded observation | In scope | Enables observe-before-mutate without arbitrary reads or permanent calls | Confirmed digest |
| Low-risk configured-task start/stop/restart/run | In scope | Public first-release mutation boundary | Confirmed digest |
| Operation get/reconcile and digest-bound safe clean | In scope | Recovers uncertain work and prevents preview/execute drift | Confirmed digest |
| Read-only adoption inspection | In scope | Discovery without configuration mutation or implicit start | Confirmed digest |
| Canonical Skill routing and safe fallback | In scope | Intent-driven host experience and refusal safety | Confirmed digest |
| Compatibility manifest and dual host packaging | In scope | Host correctness without duplicating policy | Confirmed digest |
| Protocol/fault/Skill/host/update/uninstall/platform verification | In scope | Evidence-scoped readiness | Confirmed digest |
| Automatic adoption/configuration writes | Deferred | Future apply requires reviewed digest, human evidence, revalidation, and no implicit start | Reopen if first-release delivery requires writes |
| Medium-risk public MCP execution | Deferred | Portable reliable human elicitation is not established | Reopen after real host proof and explicit scope change |
| Remote MCP, OAuth, hooks, UI, GUI/TUI, native, enterprise policy | Deferred | Each needs a later boundary and evidence contract | Reopen per required surface |
| High/destructive MCP, force/risky cleanup/reset, arbitrary raw controls, permanent follow | Dropped | Contradicts first-release public safety boundary | New reviewed safety contract required |
| External-process termination | Dropped | Unknown/external ownership remains inspect-only | Reopen ownership semantics explicitly |
| Production or remote service management | Dropped | Contradicts the confirmed local first-release control-plane boundary | New trust, authentication, policy, and evidence contract required |
| Absolute exactly-once | Dropped | Not universally provable; replaced by journaled idempotency and indeterminate outcomes | Reopen only for a provable restricted class |

## Specify-Owned Soft-Unknown Resolution

### SU-003 — Agent Operation Result

Resolved in `spec-contract.json#/result_contract` and `spec.md#agent-operation-result`:

- Exact required top-level fields are `protocolVersion`, `operation`, `outcome`, `resource`, `effects`, `safety`, `error`, `nextActions`, and `provenance`.
- `outcome.kind` and `resource.status` are independent.
- Effects certainty is `none`, `confirmed`, `possible`, or `unknown`.
- CLI may adapt the result into its existing envelope without changing existing field meanings.

### SU-004 — Journal Storage and Retention

Resolved in `spec-contract.json#/journal_contract`:

- Versioned journal lives under shared `LAUNCHDECK_HOME` and is not Plugin-owned.
- Kernel issues and journals immutable operation IDs in `prepared` state before side effects; known IDs are recovery keys, not caller-selected identities for new work.
- When a failed response prevents the caller from observing the ID, bounded `operation.list` correlation by project, task, operation name, creation window, and journal state may identify one candidate. Zero or multiple candidates stop without retry.
- Terminal full records default to 30 days.
- Prepared, running, and indeterminate entries are retained until reconciliation or explicit safe resolution.
- A supplied recovery ID whose record is absent or expired is refused and never starts new work.

### SU-005 — Codex Skill Compatibility and Migration

Resolved in `spec-contract.json#/skill_migration_contract`:

- Inspect current `$HOME/.agents/skills/launchdeck-agent`, legacy `~/.codex/skills/launchdeck-agent`, and applicable Plugin-bundled copies.
- Compare canonical content-manifest digest and build identity.
- Identical duplicates are reported with deterministic precedence and optional user-controlled cleanup.
- Divergent copies are preserved; migration/removal requires explicit user selection.
- New install prefers the current location and refuses to overwrite divergent content.

## Out-of-Scope Conflict Audit

No out-of-scope conflict remains. Every upstream capability-like signal is explicitly in scope, deferred with confirmation and reopen trigger, or dropped with confirmation and reopen trigger.

Downstream work must reopen the source discussion before doing any of the following:

- Create a separate CLI or MCP state/safety authority.
- Let MCP or Skill bypass Kernel ownership, risk, compatibility, scope, lock, digest, or journal checks.
- Add raw shell/process control or external-process termination to public MCP.
- Add automatic adoption writes or medium-plus execution to the first release.
- Make daemon, remote MCP, hook, UI, native binary, or enterprise policy mandatory now.
- Couple Plugin install/update/disable/uninstall to service stop or shared-state cleanup.

## Evidence and Review Routing

- Project cognition is advisory and was unavailable/stale in the upstream truth pass; the confirmed contract instead carries bounded live repository evidence and targeted passing tests.
- Current `git status` shows no modifications to the retained runtime evidence paths; dirty paths are workflow skills, manifests, and the current discussion/specification artifacts.
- Because the feature affects running objects, shared state, destructive behavior, compatibility, and security-sensitive mutation, high-risk artifact review is mandatory.
- Read-only review lane contract: inspect only the source handoff and current feature artifacts; no writes, tests, builds, package managers, workflow commands, branch operations, or product-direction decisions; return an evidence packet covering semantic drift, protected obligation coverage, contradictions, testability, and planning blockers.
- Initial lane outcome: `fail` with two agent-owned blockers—lost-response recovery lacked an unknown-ID correlation route, and production/remote service management lacked a disposition. The leader added bounded `operation.list` recovery, the missing dropped capability, dedicated adoption inspection proof, cross-version takeover evidence, full confirmation pointers, and corrected deferred-source refs without changing user-owned semantics.
- Targeted re-review outcome: `pass`. Recovery is executable and fail-safe for lost IDs, all capability signals are disposed, adoption inspection and cross-version takeover have direct proof, confirmation/source refs resolve, and no new semantic delta or contradiction was introduced.

The condition-triggered high-risk review gate is satisfied.
