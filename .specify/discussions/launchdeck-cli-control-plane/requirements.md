# Requirements: Launchdeck CLI Control Plane

## Target Need

Launchdeck should let a user see and control all locally managed project services from a single CLI control plane. The user should know which project services are running, which ports they occupy, whether Launchdeck owns them, and which operations are safe.

## Product Boundary

The product remains CLI-first. The new product layer is a global, user-scoped control plane for many local projects.

Single-instance means:

- one authoritative registry and runtime state namespace per default OS user
- many CLI clients can read the same state
- only one mutating lifecycle operation should change shared state at a time
- no always-running daemon is required for the first version
- daemon/service mode is a future option, not a prerequisite

## Core Objects

- Project: a local code directory registered with Launchdeck.
- Task: a named lifecycle action from `.launchdeck.yml`.
- Run: the current or historical execution instance of a task.
- Port: an observed local TCP port with ownership and conflict status.

## Required Product Behaviors

- `project:task` should not start duplicate Launchdeck-owned instances by default.
- `start` and `dev` should return `already_running` when the selected task is already running.
- `restart` should be stop-owned then wait-for-release then start.
- `stop` should only stop Launchdeck-owned process trees.
- `force-stop` should be limited to Launchdeck-owned process trees unless a future explicit external-danger contract is added.
- Port inspection should identify owned, external, stale, conflict, and unknown states.
- Launchdeck must not kill external processes automatically.
- Stale state must be repairable through `reconcile`.
- Human output must explain reason and safe next actions.
- JSON output must be stable enough for automation and future UI/MCP/agent consumers.

## State Model

Run status should distinguish:

- starting
- running
- ready
- running_not_ready
- stopping
- stopped
- exited
- failed
- stale
- unknown

Ownership should distinguish:

- owned
- external
- stale-owned
- unknown

Port status should distinguish:

- free
- owned-listening
- external-listening
- conflict-owned
- conflict-external
- unknown-owner

## Safety Rules

- Port is evidence, not stop authority.
- PID is evidence, not sole ownership proof.
- Ownership proof should combine run id, project id, task name, root pid, process start time, cwd/command evidence where available, and runtime state.
- External processes are inspect-only by default.
- Uncertain ownership should block stop/restart and route to inspect/reconcile.

## Configuration Contract

`.launchdeck.yml` is a safety control contract. It should describe:

- task command
- task kind
- whether the task is long-running
- expected ports
- ready checks
- stop behavior
- safe clean targets
- risky/destructive actions when explicitly supported

Automatic discovery can propose configuration, but explicit project config remains the authority.

## Observation Contract

Launchdeck should expose:

- `status --all` for a global snapshot
- `status --watch` for foreground observation
- `logs <project:task>` and `logs --follow`
- `events` and `events --json`
- `inspect <target>` for task, port, PID, or project explanation

Observation commands must not mutate lifecycle state except for safe read-time refreshes explicitly defined by the product contract.

## Ready Model

Running and ready are different:

- running means the owned process is alive
- ready means a configured readiness signal has passed

Supported first-ready signals should include:

- port listening
- HTTP GET status
- process stays alive through a timeout

## Failure And Recovery

Failures should map to stable categories:

- config_error
- command_error
- port_conflict
- ready_timeout
- process_exit
- state_stale

Every failure should include safe next actions such as `inspect`, `logs`, `reconcile`, `doctor`, or `restart` when ownership permits.

## Project Registration And Naming

Global project identity should separate system identity, user reference, and filesystem location:

- `projectId`: system-generated stable identity for a registered local project instance
- `alias`: globally unique user-facing reference for CLI commands
- `project.name`: default name from `.launchdeck.yml`
- `path`: current project location, which can become missing or repaired
- `configPath`: current lifecycle contract path

Command references such as `api:dev` should resolve through alias. Ambiguous aliases must be rejected instead of guessed.

`project remove` removes the registry entry only. It must not delete project files and should refuse removal while owned tasks are running unless a later explicit force contract is defined.

## Global State Responsibilities

The global control-plane state should be separated:

- registry: which projects Launchdeck knows
- runtime index: Launchdeck-owned runs and their current/latest state
- locks: concurrency control for registry, project, and task mutations
- events: append-only history of Launchdeck actions
- live OS inspection: current process and port reality

Caches may exist but must be rebuildable and must not be treated as authority.

## Command Transaction Semantics

State-changing commands should behave like small transactions:

- resolve project/task
- acquire the correct lock
- refresh live reality
- perform preflight safety checks
- write an in-progress state when needed
- execute the action
- write final state or failure state
- append events
- release locks

Failures must still leave inspectable state and events. A failed launch should move from `starting` to `failed`, not disappear.

## Lock And Concurrency Semantics

Locking should be granular:

- registry lock for project add/remove/repair
- project lock for project-level maintenance and cleanup
- task lock for `project:task` start/stop/restart

Different projects or different tasks may proceed concurrently. The same `project:task` must serialize mutations.

Stale lock recovery must account for PID reuse by checking PID existence and process start time where possible.

## Ownership Proof

Launchdeck may operate on a process only when ownership evidence is sufficient.

Ownership confidence should distinguish:

- verified-owned
- probable-owned
- stale-owned
- external
- unknown

Stop/restart should be allowed only for owned states according to the command's safety level. External and unknown states should route to inspect/reconcile.

## Inspect And Status Layering

Status and diagnostic commands should have clear roles:

- `status`: global or project-level dashboard summary
- `ps`: Launchdeck-owned run/process view
- `ports`: local port view including external observations
- `conflicts`: blocking issues and affected tasks
- `inspect`: evidence and safe action explanation for one target

`inspect` should accept targets such as project alias, `project:task`, run id, port, PID, and project path.

## Onboarding

Project onboarding should be explicit:

- `project scan` discovers candidate projects
- `project add` registers a project
- `doctor` checks manageability
- `start/dev` runs only after explicit command

Scanning must not register, start, install, clean, or mutate projects by default.

## Multi-Project Port Conflicts

Port conflicts should expose facts:

- which tasks declare a port
- who currently occupies the port
- whether occupancy is owned, external, unknown, or stale
- which tasks are blocked
- which actions are safe

Launchdeck should not auto-prioritize projects, auto-migrate ports, or automatically stop a different task unless the user explicitly invokes a safe owned action.

## Logs And Events

Logs and events should remain separate:

- logs are task stdout/stderr
- events are Launchdeck control-plane actions

Both should be traceable through `projectId`, `task`, `runId`, and transaction id.

Logs should be per-run where possible. Events should be append-only JSON Lines. Retention must not delete the current running run, latest failed run, or important failure evidence by default.

## Clean And Reset Boundary

`clean` is for hygiene. It may delete regenerable project-local targets, old logs, stale/resolved state, old events, and rebuildable caches when those targets are explicitly declared or Launchdeck-owned.

`clean` must not:

- stop running services
- delete project registry entries
- delete project files outside declared clean targets
- delete project root or paths outside project root
- delete current running logs
- delete latest failed run logs
- kill external processes
- perform database, Docker volume, or destructive reset behavior

Destructive `reset` behavior is deferred and must be configured separately with stronger confirmation.

## Permission And Confirmation Model

Confirmation and force semantics should stay narrow:

- `--yes` confirms an already-known impact area.
- `--force` strengthens Launchdeck-owned operations only.
- `--force` must not grant ownership.
- no flag may bypass path containment, project-root refusal, unknown ownership, unsupported state version, or external process safety.
- non-interactive commands must fail with structured errors instead of waiting for prompts.

## Automation Contract

CLI remains the product center, but automation is a first-class consumer.

Requirements:

- stable JSON envelope with `ok`, `code`, `message`, `data`, and `next`
- JSON Lines for watch/events streams
- non-interactive mode never hangs on prompts
- configurable timeouts for locks, ready checks, stop/restart flows, and watch/follow commands
- stable exit-code stance with detailed branching in JSON `code`
- idempotent ensure-running behavior where `already_running` can be successful for `start`
- structured next actions with action kind, target, command, risk, and confirmation needs

## Extension Boundary

Core owns lifecycle semantics and safety policy. Extensions may add:

- discovery suggestions
- runtime adapters
- ready-check adapters
- presentation clients such as TUI, GUI, MCP, editor, or web dashboard
- opt-in policy automation later

Extensions must not bypass ownership proof, path safety, registry/event writes, JSON compatibility, or the single control-plane truth.

## Product Maturity

The product maturity path should be:

- L0 task runner
- L1 managed single-project runtime
- L2 global control plane
- L3 reliable cross-platform supervisor
- L4 ecosystem and automation layer

The current handoff target is L2 with L3 requirements preserved. It should not chase L4 integrations before global visibility, precise owned control, and cross-platform supervision are trustworthy.

## Minimum Complete CLI Surface

The minimum complete CLI product should cover:

- Onboard: `init`, `project add`, `project scan`, `projects`, `project remove`, `project repair`
- Understand: `doctor`, `tasks`, `inspect`
- Operate: `run`, `dev`, `start`, `stop`, `restart`, `force-stop`
- Observe: `status`, `ps`, `ports`, `conflicts`, `logs`, `events`
- Recover: `reconcile`
- Maintain: `clean`

The narrowest complete loop is: register, start once, prevent duplicate start, inspect ownership, show global status, stop/restart owned tasks, reconcile stale state, view logs/events, and clean safe generated state.

## Acceptance Stories

The formal specification should preserve these end-to-end stories:

- Register a project without starting or modifying project files beyond registry state.
- Start a demo service once; a second start returns `already_running` and does not create another instance.
- Show the running service in `status --all`, `ps --all`, and `ports`.
- Block a second project from using an owned occupied port while offering safe actions for the owner task.
- Block startup on an external occupied port and provide inspect/manual next actions without stopping the process.
- Detect stale state after an externally killed process and recover through `reconcile`.
- Preserve logs/events linked by run and transaction.
- Clean only safe/generated/stale/retention-expired data and never delete unknown files or running evidence.

## Official Demo Requirement

The first official demo should prove the core loop with a small dependency-light service such as `examples/demo-api`.

The demo should include:

- a fixed port such as 8888
- a health endpoint
- graceful termination
- build/test/dev tasks
- safe clean target
- optional external-port-conflict script
- docs that show duplicate start, inspect, restart, stop, stale recovery, logs/events, and clean

## Documentation Requirements

Documentation should be split by purpose:

- README: positioning, pain, quick demo, core concepts, common commands
- concepts: control plane, Project/Task/Run/Port, ownership, ready, stale, clean/reset
- commands: command reference, examples, JSON, errors
- config: `.launchdeck.yml` protocol
- demo: official guided journey
- json: automation contract
- safety: threat model and invariants

## Error And Next-Action Contract

Error codes are product APIs. They should be stable, actionable, and domain-oriented.

Next actions should be machine-readable and should never suggest an unsafe action. External port conflicts must not suggest `stop`; stale state should suggest `inspect` or `reconcile`; owned conflicts may suggest owner `logs`, `restart`, or `stop`.

## Future Client Boundary

Future GUI, TUI, MCP, editor, or local web clients should consume the same control-plane state, events, logs, action model, and safety semantics. CLI is the first client, not the only client.

## Compatibility And Migration

Persistent state files should be versioned. Unknown newer versions should allow degraded read-only output where safe, but must block dangerous mutations such as start, stop, restart, force-stop, clean state, and registry mutation.

## Security Requirements

Launchdeck should fail closed when safety is uncertain.

The specification must preserve:

- canonical path containment
- symlink/junction escape refusal
- no default external process stopping
- PID reuse protection
- no env value logging
- safe alias/task character constraints
- corrupt-state degradation and mutation refusal
- user-scoped default state location

## Cross-Platform Readiness

Cross-platform readiness requires lifecycle smoke evidence on Windows, macOS, and Linux for project registration, start, duplicate-start prevention, status, port ownership, logs, stop/restart, stale recovery, safe clean, JSON output, and lock behavior.

## Deferred Scope

- whole-machine or multi-OS-user shared control plane
- always-running daemon
- GUI/TUI dashboard
- external process kill by PID or port
- container-level lifecycle ownership beyond explicit configured commands
- automatic destructive cleanup or reset
- auto-restart policy
- plugin marketplace
- workspace orchestration
- Docker volume/container ownership
