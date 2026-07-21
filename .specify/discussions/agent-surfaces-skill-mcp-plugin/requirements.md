# Launchdeck Agent Surfaces Requirements

## Goal

Launchdeck must expose one safe local lifecycle control plane through CLI, Agent Skill, MCP, and installable Codex/Claude Plugins without duplicating execution authority, state, or safety logic.

## First-Release Boundary

In scope:

- A shared Application Kernel with an operation registry, project resolution, risk policy, ownership checks, locks, operation journal, normalized results, effects certainty, provenance, and compatibility checks.
- Backward-compatible CLI behavior plus a read-only `capabilities` operation.
- A local stdio MCP server with typed, bounded tools and structured output.
- One canonical `launchdeck-agent` Skill that prefers compatible MCP and safely falls back to compatible CLI only before execution or for safe read operations.
- Generated Codex and Claude Plugin packages built from the same Skill, runtime, schemas, assets, and compatibility manifest.
- Plugin installation that does not require a global Launchdeck CLI, while retaining Node.js 20+ as a prerequisite.
- Existing managed projects with a valid `.launchdeck.yml`; read-only adoption inspection may suggest configuration but does not write it.
- Public MCP mutation limited to low-risk configured operations.

Out of scope:

- Arbitrary shell, environment, working-directory, force, or confirmation parameters.
- Automatic adoption/configuration writes, medium/high/destructive MCP execution, force-stop, risky clean, reset, external-process termination, remote MCP, OAuth, hooks, MCP UI, GUI/TUI, production or remote service management, and enterprise policy implementation.
- Claims of absolute exactly-once mutation semantics.

Deferred:

- `adoption_apply` after a separately reviewed confirmation and plan-digest contract.
- Medium-risk execution after both target hosts prove a reliable human elicitation flow.
- Streamable HTTP, enterprise-managed policy distribution, native binaries, hooks, and UI.

## Product And Safety Requirements

- Launchdeck Kernel remains the sole execution and mutation authority; Skill and MCP cannot implement alternate lifecycle logic.
- CLI, MCP, and Plugin runtimes share `LAUNCHDECK_HOME`, registry, run index, locks, logs, events, and operation journal.
- Project context must be explicit or host-provided and trusted; the Plugin installation directory must never become an implicit project.
- Start must reuse an existing matching run and must not duplicate a service.
- Stop/restart require Launchdeck ownership proof; external or unknown owners remain inspect-only.
- Public MCP tools cannot accept raw commands, arbitrary environment, arbitrary cwd, `force`, or model-authored confirmation fields.
- Task risk becomes an enforced Kernel policy across CLI and MCP, not display metadata.
- MCP annotations and host approval settings are defense-in-depth hints, not Kernel authorization.
- Mutation results that are uncertain after transport failure must not be retried automatically or replayed through another surface.
- Plugin update, disable, and uninstall must not stop managed tasks or delete shared state.
- Skill, MCP runtime, schemas, compatibility manifest, and host manifest must have the same build identity and verifiable digests.
- MCP stdio stdout contains only protocol messages; diagnostics and task output use stderr, logs, events, or bounded structured results.

## MCP Capability Boundary

First-release tools may include capabilities, doctor, adoption inspection, project list/register, task list, status, inspect, bounded logs/events, low-risk task run/start/stop/restart, reconcile, clean plan, and digest-bound safe clean.

Public MCP excludes force-stop, project removal, risky clean, reset, automatic adoption writes, arbitrary command execution, and permanent follow streams.

## Success Criteria

- CLI and MCP produce semantically equivalent normalized outcomes for the same operation.
- A service started through Plugin MCP remains observable and safely controllable through standalone CLI after the host or MCP server exits.
- Repeated start creates no duplicate run or process.
- Unknown/external process ownership never authorizes mutation.
- Same-operation retries recover or return the original result without re-execution; indeterminate operations stay blocked from automatic retry.
- Plugin update observes an older compatible run; incompatible state permits diagnosis but fails closed for writes.
- Plugin uninstall preserves services, registry, journal, logs, events, and project configuration.
- Real stdio tests prove framing, schema, structured results, concurrency locks, interruption recovery, and absence of stdout contamination.
- Real Codex and Claude host smokes separately prove Plugin discovery, Skill routing, bundled MCP startup, project scope, update, and uninstall behavior.

