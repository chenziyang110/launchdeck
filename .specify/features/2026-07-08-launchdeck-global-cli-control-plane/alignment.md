# Alignment: Launchdeck Global CLI Control Plane

## Source And Gate

- Source discussion: `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane`
- Handoff Markdown: `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.md`
- Handoff JSON: `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.json`
- Handoff status: handoff-ready
- Planning gate: ready
- Quality gate: user_confirmed
- Hard unknowns: 0
- Open conflicts: 0

## Confirmed Interpretation

This feature specifies one coherent product layer: Launchdeck as a local, user-scoped, CLI-first control plane for registered project services. It is not a collection of independent CLI patches, not a generic task runner, not a process killer, and not an agent-only integration.

The confirmed "single instance" meaning is one authoritative user-scoped state/control namespace. It does not require an always-running daemon for this feature. Daemon/service mode remains a future implementation option if file/state/lock/watch semantics later prove insufficient.

## Semantic Term Decisions

| Term | Meaning In This Feature |
| --- | --- |
| Global control plane | One user-scoped namespace that sees registered projects, Launchdeck-owned runs, declared ports, conflicts, logs, events, locks, and safe actions. |
| Single instance | One authoritative state/control namespace for all CLI clients under the default OS user, not necessarily one daemon process. |
| Project identity | Stable `projectId` plus unique user-facing `alias`; display name and path are not enough. |
| Owned process | A process tree with enough Launchdeck evidence to permit lifecycle actions. |
| External process | A visible OS process or port listener that Launchdeck cannot prove it owns; inspect-only by default. |
| Ready | A configured readiness signal passed; this is distinct from process running. |
| Running | The owned process is alive; it may or may not be ready. |
| Clean | Non-destructive hygiene for declared/generated/Launchdeck-owned data. |
| Reset | Destructive behavior; separate and deferred. |
| Compatibility surface | JSON, JSON Lines, error codes, next actions, persistent state versions, and event records. |

## Upstream Signal Disposition

Each upstream capability-like signal has exactly one disposition.

| Upstream Signal | Disposition | Where Preserved Or Why |
| --- | --- | --- |
| Launchdeck Global CLI Control Plane framing | preserved | `spec.md` title, overview, scenarios, decision capture |
| CLI-first product surface | preserved | Overview, non-scope for GUI/TUI/MCP implementation |
| User-scoped local machine namespace | in_scope | FR-001, NFR-002, state model |
| Single authoritative state namespace | in_scope | Product model, FR-009 to FR-016 |
| Daemonless first approach | preserved | Out of scope and deferred scope |
| Always-running daemon/service | deferred | Deferred scope, reopen only if watch/event needs require it |
| Project registry | in_scope | FR-001 to FR-008 |
| `projectId` stable identity | in_scope | FR-002, CA-CP-008 |
| Unique alias | in_scope | FR-003, ambiguity edge case |
| Repairable project path/config path | in_scope | FR-004, FR-008 |
| `project add` | in_scope | FR-005 |
| `project scan` | in_scope | FR-006 |
| `project remove` | in_scope | FR-007 |
| `project remove` refusing active owned tasks | in_scope | FR-007 prevents orphaning running control-plane state |
| `project repair` | in_scope | FR-008 |
| `projects` listing | in_scope | FR-001, scenarios, and registry scope |
| Global runtime run index | in_scope | FR-009 |
| Registry, project, and task locks | in_scope | FR-010 to FR-015 |
| Stale lock recovery | in_scope | FR-015 |
| Exact lock timeout defaults | deferred | Soft unknown resolved in planning |
| Transaction id for mutations | in_scope | FR-013 |
| Start writes in-progress evidence | in_scope | FR-014 |
| Duplicate-start prevention | in_scope | Primary scenario, FR-011, FR-017 |
| `start` / `dev` long-running lifecycle | in_scope | FR-017 |
| `stop` | in_scope | FR-019 |
| `restart` | in_scope | FR-018 |
| `force-stop` for owned process trees | in_scope | FR-019, FR-022 |
| External process kill | dropped | Out of scope; violates MP-008 unless reopened |
| Kill by port or PID alone | dropped | Safety invariant; violates MP-007 |
| Ownership proof model | in_scope | FR-019 to FR-022, safety invariants |
| Ownership confidence states | in_scope | Product model and observe/diagnose requirements |
| Ready vs running state | in_scope | FR-023, FR-024 |
| Readiness signals: port, HTTP, alive timeout | in_scope | FR-024 |
| Stale state detection | in_scope | Stale recovery scenario, FR-044 |
| `reconcile` | in_scope | FR-044 |
| `status` | in_scope | FR-026 |
| `ps` | in_scope | FR-027 |
| `ports` | in_scope | FR-028 |
| `conflicts` | in_scope | FR-029 |
| Unified `inspect` | in_scope | FR-030 to FR-032 |
| Existing `inspect-port` compatibility | preserved | FR-032 keeps it while specifying unified `inspect` |
| Project/task/run/port/PID/path inspect targets | in_scope | FR-030 |
| Safe actions and blocked actions | in_scope | FR-031, FR-047 |
| Logs as task stdout/stderr | in_scope | FR-034 |
| Events as append-only control-plane history | in_scope | FR-035 |
| JSON Lines for streams | in_scope | FR-036, FR-048 |
| Exact log/event retention defaults | deferred | Soft unknown resolved in planning |
| Secret-safe logs/events | in_scope | FR-039 |
| `clean` safe hygiene | in_scope | FR-040 to FR-042 |
| Destructive `reset` implementation | deferred | Separate future feature |
| Clean deleting project roots/unknown files/running evidence | dropped | Safety invariants, FR-041 to FR-042 |
| `--yes` confirmation | in_scope | FR-049 and safety invariants |
| `--force` owned-only strengthening | in_scope | FR-022 and safety invariants |
| Non-interactive no-hang behavior | in_scope | FR-049 |
| Timeouts for locks/readiness/stop/watch/follow | in_scope | FR-050 |
| Stable JSON envelope | in_scope | FR-045 |
| Error codes | in_scope | FR-046 |
| Structured next actions | in_scope | FR-047 |
| JSON schema versioning details | deferred | Deferred until multiple durable clients need negotiation |
| Persistent state versioning | in_scope | FR-051, FR-052 |
| Unknown newer state fail-closed behavior | in_scope | FR-052 |
| GUI/TUI/MCP/editor clients | deferred | Future clients reuse same truth; implementation out of scope |
| Agent-specific plugin framing | dropped | Rejected alternative; product is CLI-first |
| Plugin marketplace | dropped | Out of scope |
| Workspace orchestration | dropped | Out of scope |
| Auto-restart policy | dropped | Out of scope for this feature |
| Whole-machine or multi-user shared registry | deferred | Reopen only on explicit product need |
| Docker volume/container ownership | dropped | Out of scope |
| Official demo | in_scope | FR-053, acceptance proof |
| Documentation set | in_scope | FR-054 |
| Security fail-closed requirements | in_scope | FR-055 |
| Cross-platform lifecycle smoke | in_scope | FR-056 |
| Exact cross-platform process-tree proof strategy | deferred | Planning/implementation validation detail |

## Must-Preserve Coverage

| ID | Disposition | Spec Coverage |
| --- | --- | --- |
| MP-001 | preserved | Title, overview, scope, decision capture |
| MP-002 | preserved | User-scoped registry and namespace requirements |
| MP-003 | preserved | Daemonless-first scope and state namespace definition |
| MP-004 | preserved | FR-001 to FR-008 |
| MP-005 | preserved | Product model authority layers |
| MP-006 | preserved | Primary scenario, FR-011, FR-017 |
| MP-007 | preserved | Safety invariants, FR-019 to FR-022 |
| MP-008 | preserved | Out of scope and safety invariants |
| MP-009 | preserved | FR-030 to FR-032 |
| MP-010 | preserved | FR-040 to FR-044 |
| MP-011 | preserved | Safety invariants and permission requirements |
| MP-012 | preserved | FR-045 to FR-050 |
| MP-013 | preserved | Overview and future-client deferred scope |
| MP-014 | preserved | FR-051 to FR-052 |
| MP-015 | preserved | FR-055 and safety invariants |
| MP-016 | preserved | FR-053 and acceptance proof |
| MP-017 | preserved | FR-056 and release claim requirement |

## Consequence Obligation Coverage

| ID | Spec Coverage |
| --- | --- |
| CA-CP-001 | Product model, FR-001, FR-009 |
| CA-CP-002 | FR-010 to FR-016 |
| CA-CP-003 | FR-019 to FR-022 |
| CA-CP-004 | Out of scope, external conflict scenario |
| CA-CP-005 | Stale recovery scenario, FR-044 |
| CA-CP-006 | FR-031, FR-047, NFR-004 |
| CA-CP-007 | Product model, FR-023 to FR-029 |
| CA-CP-008 | FR-001 to FR-008 |
| CA-CP-009 | Authority layers, FR-009 to FR-016 |
| CA-CP-010 | FR-013, FR-016, FR-035 |
| CA-CP-011 | FR-015 |
| CA-CP-012 | FR-030 to FR-032 |
| CA-CP-013 | FR-034 to FR-039 |
| CA-CP-014 | FR-040 to FR-044 |
| CA-CP-015 | Safety invariants, FR-022, FR-049 |
| CA-CP-016 | FR-045 to FR-050 |
| CA-CP-017 | Overview, deferred future clients |
| CA-CP-018 | FR-051 to FR-052 |
| CA-CP-019 | FR-055 |
| CA-CP-020 | FR-056 |

## Repository Evidence Alignment

Live reads show the repository already contains an early global runtime slice:

- `src/cli.js` exposes `project add`, `project remove`, `project scan`, `projects`, `status --all`, `conflicts`, `ps --all`, `ports`, `inspect-port`, global `project:task` start/stop/restart/logs, and JSON output.
- `src/global-runtime.js` currently stores a user-level registry, inspects declared ports, lists global processes, and blocks external declared-port conflicts before spawn.
- `src/runtime.js` currently manages project-local runtime state and logs.
- `src/adapters/process.js` contains process spawn/stop and port listener inspection adapters.
- `test/global-runtime.test.js` verifies the quick-slice behavior for registry, global views, port conflicts, scan, logs, and no fragile unbounded log follow.

This evidence supports planning from existing code, but it does not reduce scope. The formal feature still requires lock semantics, transaction events, unified inspect, alias repair, stronger ownership proof, compatibility rules, retention, demo, docs, and cross-platform validation.

## Readiness Decision

Aligned: ready for `/sp.plan`.

No clarification blocker remains. Soft unknowns are legitimate planning inputs and must not be treated as permission to change the confirmed product boundary.
