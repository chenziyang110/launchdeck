# Data Model: Launchdeck Global CLI Control Plane

## Storage Namespaces

### User Control Plane

Rooted at `LAUNCHDECK_HOME`, with platform default resolved by existing global runtime path logic.

```text
LAUNCHDECK_HOME/
├── registry/projects.json
├── runtime/runs.json
├── locks/*.lock
├── events/events.jsonl
└── logs/<projectId>/
```

### Project Runtime Compatibility

Rooted inside each project:

```text
<project>/.launchdeck/
├── runtime/state.json
└── logs/
```

Project-local state remains readable for compatibility and recovery. The global run index is the authoritative cross-project view after this feature lands.

## Entity: RegistryState

Persistent file: `registry/projects.json`

Fields:

- `version`: integer, current writer version.
- `createdAt`: ISO timestamp.
- `updatedAt`: ISO timestamp.
- `projects`: array of ProjectRegistration.
- `migratedFrom`: optional migration metadata for prior `projects.json`.

Rules:

- Read current legacy `LAUNCHDECK_HOME/projects.json` if v2 registry is absent.
- Write only the current v2 shape.
- Unknown newer versions fail closed with a structured repair/upgrade error.
- Registry mutation requires `registry.lock`.

## Entity: ProjectRegistration

Fields:

- `projectId`: stable id derived from canonical project root at registration time.
- `alias`: unique user-facing alias.
- `name`: display name from config or registration flag.
- `projectRoot`: canonical absolute path.
- `configPath`: canonical absolute path to `.launchdeck.yml` or equivalent config.
- `configHash`: optional hash for stale config detection.
- `status`: `active`, `missing`, `config_missing`, `invalid_config`, `repair_required`.
- `addedAt`: ISO timestamp.
- `updatedAt`: ISO timestamp.
- `lastSeenAt`: ISO timestamp.

Identity rules:

- `projectId` is stable across alias repair.
- `alias` must be unique in the user namespace.
- `projectRoot` and `configPath` can be repaired without creating a second project.
- `project remove` removes only this registration and only when no Launchdeck-owned run for that project is running, starting, ready, or stopping.

## Entity: TaskDefinition

Source: normalized project config.

Fields:

- `name`: task name.
- `command`: command string from config.
- `cwd`: resolved working directory.
- `env`: configured environment values after redaction policy for outputs/events.
- `longRunning`: boolean.
- `ports`: declared numeric ports.
- `risk`: `safe`, `confirm`, or `dangerous`.
- `log`: optional log file setting.
- `ready`: optional readiness configuration.
- `clean`: optional clean target metadata for clean commands.

Rules:

- Long-running task starts are managed and recorded.
- Foreground tasks can run without global run index entries unless a future command explicitly records them.
- Declared ports are inspected before managed start.

## Entity: RunIndexState

Persistent file: `runtime/runs.json`

Fields:

- `version`: integer.
- `updatedAt`: ISO timestamp.
- `runs`: array of ManagedRun.
- `indexes`: optional denormalized lookup metadata for project/task/port acceleration.

Rules:

- Mutations require project and task locks.
- Reads can be stale-tolerant but must expose stale/conflict evidence.
- Runtime reconciliation may update dead/stale runs only through explicit reconcile paths or lifecycle mutation preflight.

## Entity: ManagedRun

Fields:

- `runId`: unique id.
- `transactionId`: lifecycle transaction id that created or last mutated the run.
- `projectId`: registry project id.
- `projectAlias`: alias snapshot.
- `projectRoot`: root snapshot.
- `task`: task name.
- `command`: command snapshot.
- `cwd`: cwd snapshot.
- `pid`: root process id.
- `processGroupId`: optional group id or platform equivalent.
- `status`: lifecycle status.
- `ownershipConfidence`: ownership confidence classification.
- `ownershipProof`: OwnershipProof.
- `declaredPorts`: array of ports.
- `observedPorts`: latest PortObservation references.
- `logPath`: absolute log path.
- `startedAt`: ISO timestamp.
- `readyAt`: optional ISO timestamp.
- `stoppedAt`: optional ISO timestamp.
- `lastObservedAt`: ISO timestamp.
- `exitCode`: optional number.
- `stopSignal`: optional string.
- `failure`: optional structured error snapshot.

Lifecycle statuses:

- `starting`: process has been spawned or is about to be spawned under a transaction.
- `running`: process is alive, readiness not proven.
- `ready`: readiness check succeeded.
- `failed`: spawn or readiness failed.
- `stopping`: stop transaction is in progress.
- `stopped`: stop completed.
- `stop_failed`: stop was attempted and did not complete safely.
- `stale`: state points to a process that is dead or no longer matches.
- `unknown`: state cannot be trusted because required evidence is unavailable or incompatible.

Allowed transitions:

```text
starting -> running -> ready
starting -> failed
running -> ready
running -> stopping -> stopped
ready -> stopping -> stopped
stopping -> stop_failed
running -> stale
ready -> stale
stale -> stopped
unknown -> stale
```

Disallowed transitions:

- `external` process observations never transition into owned runs without a Launchdeck run record.
- `stopped` runs do not return to running; restart creates a new run id.

## Entity: OwnershipProof

Fields:

- `confidence`: `verified-owned`, `probable-owned`, `stale-owned`, `external`, or `unknown`.
- `pidMatchesRun`: boolean.
- `processAlive`: boolean.
- `cwdMatches`: boolean or `unavailable`.
- `commandMatches`: boolean or `unavailable`.
- `envMarkerMatches`: boolean or `unavailable`.
- `startTimeMatches`: boolean or `unavailable`.
- `portEvidence`: array of PortOwnershipEvidence.
- `checkedAt`: ISO timestamp.
- `reasons`: array of short stable strings.

Rules:

- Stop and force-stop require `verified-owned`.
- `probable-owned` and `unknown` produce inspect/reconcile next actions.
- `external` is never stopped by Launchdeck.
- `stale-owned` is cleaned from state by reconcile, not killed.

## Entity: PortObservation

Fields:

- `port`: number.
- `protocol`: `tcp` by default.
- `listeners`: array of ListenerObservation.
- `declaredOwners`: array of `{ projectId, alias, task, runId? }`.
- `ownerType`: `launchdeck`, `external`, `conflict`, `free`, `unknown`.
- `conflicts`: array of Conflict.
- `checkedAt`: ISO timestamp.

Rules:

- A declared port occupied by an external listener blocks start.
- A declared port occupied by the same verified run can be treated as owned.
- Listener PID absence produces `unknown`, not ownership.

## Entity: ListenerObservation

Fields:

- `pid`: optional number.
- `command`: optional string.
- `cwd`: optional absolute path.
- `startTime`: optional timestamp or platform-specific token.
- `address`: optional address.
- `source`: `lsof`, `ss`, `netstat`, `tasklist`, or adapter-specific source.

## Entity: Conflict

Fields:

- `type`: `external_port_occupied`, `launchdeck_duplicate`, `alias_collision`, `stale_state`, `lock_busy`, `config_invalid`, or `unknown`.
- `severity`: `info`, `warning`, `blocking`.
- `projectId`: optional project id.
- `alias`: optional alias.
- `task`: optional task name.
- `port`: optional port.
- `runId`: optional run id.
- `message`: human-readable summary.
- `next`: array of NextAction.

## Entity: LockRecord

Persistent file: `locks/<name>.lock`

Fields:

- `version`: integer.
- `lockName`: stable lock name.
- `ownerPid`: current CLI process id.
- `ownerCommand`: command summary.
- `ownerCwd`: cwd.
- `transactionId`: optional transaction id.
- `createdAt`: ISO timestamp.
- `expiresAt`: ISO timestamp.
- `heartbeatAt`: optional ISO timestamp.

Rules:

- Acquisition uses exclusive creation.
- Reentrant lock behavior is not required for v1.
- Stale lock recovery requires owner absence or expired lock plus conservative proof.
- Lock errors include next actions and lock metadata safe for display.

## Entity: EventRecord

Persistent file: `events/events.jsonl`

Fields:

- `schemaVersion`: integer.
- `eventId`: unique id.
- `transactionId`: optional transaction id.
- `timestamp`: ISO timestamp.
- `level`: `debug`, `info`, `warning`, `error`.
- `type`: stable event type.
- `projectId`: optional project id.
- `alias`: optional alias.
- `task`: optional task name.
- `runId`: optional run id.
- `status`: optional lifecycle status.
- `code`: optional error code.
- `message`: concise safe summary.
- `data`: redacted structured payload.
- `next`: array of NextAction.

Rules:

- Events are append-only JSON Lines.
- Secrets in env/config are redacted before persistence.
- Corrupt lines should not crash read-only commands; they produce a warning/error entry.

## Entity: NextAction

Fields:

- `label`: human-readable action label.
- `command`: suggested CLI command.
- `reason`: why this action is relevant.
- `risk`: `safe`, `confirm`, or `dangerous`.

Rules:

- Every blocked lifecycle command should return at least one next action.
- Dangerous actions are not executed implicitly.

## JSON Envelope

Success:

```json
{
  "ok": true,
  "schemaVersion": 1,
  "command": "inspect",
  "data": {},
  "next": []
}
```

Error:

```json
{
  "ok": false,
  "schemaVersion": 1,
  "command": "start",
  "code": "port_conflict",
  "message": "Declared port is already occupied by an external process.",
  "details": {},
  "next": []
}
```

Compatibility rule:

- Existing top-level payload fields may be mirrored during transition.
- New fields should be added under `data`.
