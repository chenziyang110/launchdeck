# Quickstart: Validate the Agent Surfaces End to End

**Status**: Planned, not executed  
**Source lane**: `planning/handoffs/quickstart-validation.json`

This quickstart is the representative acceptance journey for implementation and release evidence. Commands are harness contracts until live `launchdeck --help` exposes their final syntax. Every run uses disposable projects/processes and an isolated `LAUNCHDECK_HOME`; it must never target unrelated user processes or non-temporary clean paths.

## Fixture

Create a portable registered Node fixture containing:

- one low-risk long-running task with a declared port and append-only spawn receipt;
- one low-risk finite task that emits identifiable stdout and stderr;
- one medium-risk task for refusal;
- disposable safe-clean targets plus protected state/evidence sentinels;
- deterministic verified-owned, unknown, external, stale, and mismatched process/port cases.

For each evidence cell record canonical project/state paths, Node executable/version, OS/version/architecture, host/version/scope, build identity, component digests, Agent/state schema versions, fixture digest, commands/actions, raw evidence refs, and invalidation conditions.

## Journey 1: CLI/MCP Equivalence and Start Reuse

1. Run a representative query and low-risk mutation through CLI JSON on fixture A; retain the schemaVersion 1 envelope, nested Agent result, exit code, state diff, and spawn receipt.
2. Run the same canonical operation/input through a real MCP client on cloned fixture B after `capabilities.get` and observation.
3. Compare canonical operation, outcome, resource, effects, safety, typed error, and next actions. Normalize only generated IDs/timestamps and allowed surface/host/runtime-path provenance differences.
4. On a shared fixture, start via CLI and start again via MCP; repeat in reverse order with a fresh state home.
5. Issue synchronized concurrent matching starts.

Pass requires one spawn, one run ID/PID/port/state home, `reusedExistingRun=true`, and `effects.changed=false` for later calls. CLI retains schemaVersion 1; MCP reports `cliSchemaVersion=null`.

## Journey 2: Real stdio Protocol

Launch only the shipped `launchdeck-mcp.mjs` with Node using the MCP SDK client and `StdioClientTransport`:

1. `initialize`, then initialized notification.
2. `tools/list` returns exactly the 18 public operations.
3. `tools/call` covers capabilities, task status, the finite task, one safe mutation, and one domain refusal.
4. Unknown tool and top-level/nested forbidden inputs return normalized non-executing errors.
5. Concurrent IDs may complete out of order; conflicting mutations remain resource-serialized.
6. Every stdout record parses as MCP/JSON-RPC. Task output never appears there; bounded redacted diagnostics use stderr or Launchdeck logs/events.
7. Interrupt/close and restart the adapter; managed tasks and shared state remain, and no prior operation replays.

Run this from an isolated path with spaces and non-ASCII characters, without Plugin-local `node_modules`, global Launchdeck, `npx`, or install scripts.

## Journey 3: Unknown/External Ownership Refusal

Observe fixture-owned external and incomplete/mismatched processes through inspection/status. Attempt start conflict, stop, and restart from CLI safe mappings and MCP. Add negative variants with model-authored approval/force fields and permissive host annotations.

Pass requires distinct external/unknown classifications, refusal before effects, no signal/spawn/port takeover, and a Skill trace that does not call force-stop, `--force-owned`, shell, or fallback mutation.

## Journey 4: Lost Response Without Replay

Inject deterministic failures after journal `prepared`, after `running`, after the side effect, after terminal persistence, and before response delivery. Count handler calls and resource effects outside the response channel.

- Known ID: `operation.get`, then `operation.reconcile` only when evidence is needed.
- Lost ID: one `operation.list` query with exact configured project, operation, task when applicable, journal states, a positive window no greater than 15 minutes, and limit no greater than 20.
- Unique candidate: get/reconcile that record. Zero or multiple: stop with explicit correlation result.
- Same ID/same digest: recover original. Different digest or missing/expired record: refuse.

No branch may invoke the original mutation a second time or create a new prepared record for the recovery ID.

## Journey 5: Safe-Clean Digest Drift

Call `clean.plan`, retain the safe target/config/protection snapshot and digest, then independently drift config, target existence/type, canonical/symlink resolution, and protected evidence. Calling `clean.applySafe` with the old digest must recompute under locks and return stable code `plan_digest_mismatch` before deletion with `effects.none` and `changed=false`.

A separate positive fixture may apply a fresh matching digest. It removes only current safe targets and preserves roots, outside paths, symlink escapes, risky targets, shared state, active-run evidence, and latest-failure evidence.

## Journey 6: Adoption Inspection Has Zero Writes

Before `adoption.inspect`, hash/inventory project configuration candidates, user registry/config, journal, run index, project runtime, logs/events, processes, and ports. Invoke from CLI and MCP using trusted project context and bounded scan options, then repeat the snapshot.

Pass requires a bounded proposed configuration/evidence plan and byte/inventory/process/port equality: no configuration, registration, journal mutation, task/process start, or later apply authorization. `adoption.apply` must be absent from tools, capabilities, next actions, Skill routes, and Plugin metadata.

## Journey 7: Skill Routing and Fallback Boundary

Capture ordered tool/command traces for:

- healthy MCP: intent gate -> capabilities -> observation -> one safe mutation -> report;
- pre-handshake failure or explicit capability omission: compatible CLI JSON fallback may occur before mutation dispatch;
- risk/ownership/scope/compatibility/lock/digest/config/input refusal: report and stop, no fallback;
- post-dispatch transport loss: known-ID or one bounded correlation recovery only;
- forbidden intents: force/risky/raw/remote/external/adoption-apply/medium-risk/permanent-follow all end in refusal.

Human-looking final prose does not pass if the trace contains a forbidden call, replay, shell command, synthesized approval, or unbounded follow.

## Journey 8: Codex/Claude Lifecycle and Takeover

Execute independently for each exact host/version/OS/scope cell:

1. Install generated build A through the host-supported flow; prove the installed/cached artifact launches without global Launchdeck, `npx`, install scripts, or local `node_modules`.
2. Start the fixture and capture run ID, PID, port, ownership, operation ID, state home, and build A provenance.
3. Exit the host/MCP; compatible standalone CLI observes the same live run without respawn.
4. Update to compatible build B. If an old MCP stays alive mid-session, record its identity and perform the documented reload/restart before asserting build B.
5. Disable/re-enable and then safely stop only after compatibility and ownership proof.
6. Repeat with uninstall while active; registry, journal, logs, events, configuration, and task survive for compatible CLI/build B takeover.
7. Incompatible build C may diagnose where safe but every write fails closed.
8. Install Codex and Claude side-by-side; lifecycle changes in one host do not alter the other's artifact/settings or shared Launchdeck state.

## Evidence Matrix

| Family | Required native cells | What it can prove |
| --- | --- | --- |
| Core CLI + stdio | Windows, macOS, Linux | Contract/equivalence/state/fault behavior for that exact build and OS only |
| Isolated bundle | Windows, macOS, Linux | Self-contained prebuilt Node bundle and protocol behavior for that exact OS only |
| Codex install/routing | Windows, macOS, Linux per supported host version/scope | Codex discovery, path, Skill/MCP, and project-scope behavior only |
| Codex lifecycle | Windows, macOS, Linux per build A/B | Codex exit/update/disable/uninstall/takeover only |
| Claude install/routing | Windows, macOS, Linux per supported host version/scope | Claude root substitution, discovery, Skill/MCP, and scope only |
| Claude lifecycle | Windows, macOS, Linux per build A/B | Claude mid-session update/reload, disable/uninstall/takeover only |
| Cross-host independence | Separate Windows, macOS, Linux cells | Side-by-side package/lifecycle separation only |

A cell begins not executed. Missing, failed, blocked, unsupported, or stale cells remain visible and withhold every dependent claim. A contract test cannot prove stdio; stdio cannot prove a host; one host cannot prove the other; one OS cannot prove another; install cannot prove update/uninstall/recovery.

## Baseline and Harnesses

After implementation exists, run the repository baseline exposed by live package scripts, currently `npm run check`, `npm test`, `npm run smoke`, and `npm run package:check`. Add dedicated semantic-equivalence, real-stdio, deterministic fault, read-only state-diff, Skill trace, artifact-build, Codex-host, Claude-host, and CLI recovery harnesses.

Baseline commands are regression evidence only. No current host, Plugin, MCP, update, uninstall, recovery, macOS, or Linux readiness is claimed by this planning artifact.
