# Feature Specification: Launchdeck Agent Skill

**Feature Branch**: `2026-07-09-launchdeck-agent-skill`  
**Created**: 2026-07-09  
**Status**: Approved for planning  
**Input**: Confirmed `sp-discussion` handoff `launchdeck-agent-skill-suite`

## Overview

### Feature Goal

Create a v0 `launchdeck-agent` skill package that lets coding agents safely discover, adopt, operate, recover, observe, and clean local software projects through Launchdeck.

The skill package must convert natural local lifecycle requests, such as "start this project", "run the dev server", "restart this service", "port 8888 is occupied", "show logs", "clean build cache", "启动这个项目", and "端口被占用", into Launchdeck-controlled workflows. The user should not need to name Launchdeck or choose a skill.

### Intended Users and Value

- **Primary users / roles**: Developers using coding agents to operate local projects; coding agents that need a safe lifecycle control path.
- **Problem or opportunity**: Agents often start duplicate dev servers, collide on ports, lose track of process ownership, or kill processes imprecisely.
- **Confirmed product outcome**: The agent routes local lifecycle intent through Launchdeck, persists lifecycle knowledge, avoids duplicate starts, proves ownership before mutation, and keeps cleanup safe.

## Confirmed Scope

### In Scope

- One project-local skill package at `.agents/skills/launchdeck-agent/`.
- `SKILL.md` as a short router and safety contract.
- Reference files for intent routing, adoption, discovery, command flows, recovery, clean safety, and eval prompts.
- Natural English and Chinese trigger coverage for local project lifecycle requests.
- Agent-internal Launchdeck command posture using `--json --compact` where supported.
- First-run adoption flow that discovers lifecycle evidence and writes or proposes `.launchdeck.yml` under safety rules.
- Repeat-run flows that reuse `.launchdeck.yml`, Launchdeck registry state, runtime state, logs, and events.
- Eval prompts that test triggering, non-triggering, behavior safety, and compact-output behavior.

### Out of Scope

- GUI, TUI, or product UI.
- MCP server.
- Separate public onboarding/operation/recovery/cleanup skills in v0.
- Direct OS process killing by port or PID.
- Production deployment management.
- Destructive reset automation.
- Replacing or bypassing Launchdeck CLI behavior.

### Deferred Or Future Scope

- Deterministic scanner scripts, unless evals show prose discovery is repeatedly unreliable.
- Executable eval fixtures.
- Monorepo-first management of multiple launchable apps in one repo.
- Ecosystem expansion beyond Node, Python, Docker Compose, and Make/Just/Taskfile.
- Promoting reference subflows into separate public skills after v0 trigger behavior is proven.
- Metadata such as `agents/openai.yaml` only if implementation discovers this repository's skill installer requires it.

## Must-Preserve Discussion Inputs

- **Source**: `.specify/discussions/launchdeck-agent-skill-suite/handoff-to-specify.md`
- **Coverage Status**: `handoff-ready-complete-with-soft-unknowns`
- **Planning Gate Status**: `ready-for-specify`, accepted as planning-ready because the handoff is user-confirmed, internally consistent, and `consumer_eligibility.sp-specify.status` is `ready`.

### Mapped Must-Preserve Items

- `MP-001` goal: This spec defines the central target as a v0 `launchdeck-agent` skill package.
- `MP-002` decision: V0 is one router skill with bundled references, not six public skills.
- `MP-003` decision: Users express natural intent; agent routing is internal.
- `MP-004` decision: Launchdeck is the execution authority.
- `MP-005` decision: `.launchdeck.yml` is lifecycle authority and first-run discovery persists knowledge.
- `MP-006` decision: Observe before mutate.
- `MP-007` decision: Stop, restart, and force-stop require Launchdeck ownership proof.
- `MP-008` non-goal: Unknown or external processes are inspect-only and must not be killed automatically.
- `MP-009` decision: Safe clean, risky clean, and reset are separate; reset is out of automatic scope.
- `MP-010` decision: Agent-internal Launchdeck calls prefer `--json --compact`.
- `MP-011` scope: V0 discovery covers Node, Python, Docker Compose, and Make/Just/Taskfile first.
- `MP-012` tradeoff: V0 defers scripts unless evals show prose discovery is unreliable.
- `MP-013` reference: Eval prompts test trigger, non-trigger, behavior/safety, and compact-output behavior.
- `MP-014` blocking question: Exact package path is resolved to `.agents/skills/launchdeck-agent/` by local evidence; metadata remains conditional if installer evidence later requires it.

### Discussion Conflicts

No open conflicts.

## Scenarios and Usage Paths

### Primary Scenario - Unknown Project Adoption And Start

A user asks the agent to start the current local project without knowing Launchdeck or the skill name.

**Usage Path**:
1. The agent detects local lifecycle intent plus project/service context.
2. The skill checks existing `.launchdeck.yml`, Launchdeck registry state, `status`, `ps`, `ports`, and `inspect` before mutation.
3. If the project is not adopted, the skill performs read-only discovery, classifies candidates, writes or proposes `.launchdeck.yml`, runs `launchdeck doctor`, registers the project, and starts the managed task through Launchdeck.
4. The agent reports target, status, URL or port, log path, stop command, restart command, and any risk.

**Acceptance Signals**:
- The agent does not run a long-lived command directly before Launchdeck adoption.
- Exact or strong evidence may authorize config creation; weak, conflicting, or unknown evidence produces a proposal or asks for confirmation.
- The managed start uses Launchdeck, not raw shell backgrounding.

### Secondary Scenario - Repeat Start Does Not Duplicate

A user or second agent asks to start a project that is already running.

**Usage Path**:
1. The skill resolves the registered project/task target.
2. The skill inspects existing Launchdeck run and declared port state.
3. If a matching managed run exists, the agent reports the existing run and control handles instead of starting another process.

**Acceptance Signals**:
- Repeated start reports the same Launchdeck-owned run when appropriate.
- Declared ports are checked before spawning.
- User-facing output includes evidence and safe next actions.

### Secondary Scenario - Port Conflict Is Inspect-Only Without Ownership

A user asks why a port is occupied or asks the agent to fix a failed start caused by an occupied port.

**Usage Path**:
1. The skill runs Launchdeck observation commands such as `ports` and `inspect port:<port>` with compact JSON.
2. The skill classifies the occupant as same task, other Launchdeck task, external known process, unknown process, or stale record.
3. If Launchdeck ownership is absent or uncertain, the agent refuses automatic kill/stop and reports safe options.

**Acceptance Signals**:
- Port or PID alone never authorizes stop.
- Unknown or external occupants are not killed automatically.
- Stale records route through `reconcile` before mutation.

### Secondary Scenario - Stop, Restart, And Force-Stop Stay Ownership-Gated

A user asks to stop or restart a local service.

**Usage Path**:
1. The skill resolves the Launchdeck target.
2. The skill inspects ownership and reconciles stale state when needed.
3. Normal stop/restart uses Launchdeck only when ownership is verified.
4. Force-stop is allowed only for Launchdeck-owned targets after normal stop failure or stuck-process evidence.

**Acceptance Signals**:
- Stop/restart/force-stop never bypass Launchdeck ownership proof.
- Normal restart is not implemented as blind raw kill plus start.
- Logs/events remain available as recovery evidence.

### Secondary Scenario - Safe Clean Does Not Become Reset

A user asks to clean caches or build output.

**Usage Path**:
1. The skill classifies the request as clean, risky clean, or reset.
2. The skill inspects running tasks and preserves evidence.
3. Safe clean uses `launchdeck clean --safe`.
4. Risky clean requires explicit confirmation; reset is declined as a separate destructive request.

**Acceptance Signals**:
- `.launchdeck.yml`, logs/events, runtime state for running tasks, env/secrets, databases, user data, source files, and config files are preserved.
- Dependency directories, Docker volumes, and broad clean recipes are not removed by default.
- Clean does not imply service stop.

### Edge Cases and Failure Paths

- Missing or invalid `.launchdeck.yml`: perform read-only discovery and run `doctor`; do not start long-running tasks until a valid lifecycle model exists.
- Multiple plausible commands conflict: downgrade confidence and require proposal/confirmation.
- Required secrets or external dependencies are missing: stop adoption and report evidence.
- Production deployment request: decline Launchdeck local lifecycle route or ask for clarification.
- Ambiguous "preview/open this app": route only when local project/service context is present.
- Logs missing or unreadable: use events fallback and do not clean/restart solely to recover logs.

## Capability Decomposition

### Capability Map

- **Intent Routing**: Detect local lifecycle intent plus project/service context and decide whether to onboard, operate, observe, recover, clean, or decline.
  Supports: all scenarios.
  Depends on: trigger-rich `SKILL.md` description and `references/intent-routing.md`.
  Delivery note: core.

- **Adoption Flow**: Turn an unknown project into a Launchdeck-managed project through read-only discovery, confidence labels, config creation/proposal, doctor, and registry add.
  Supports: unknown project adoption.
  Depends on: `.launchdeck.yml`, Launchdeck doctor, registry commands, discovery rules.
  Delivery note: core.

- **Discovery Rules**: Identify lifecycle candidates for Node, Python, Docker Compose, and Make/Just/Taskfile without running long-lived commands.
  Supports: adoption and config repair.
  Depends on: project manifests, task files, framework evidence, README as supporting evidence only.
  Delivery note: enabling.

- **Command Flows**: Define safe start, dev, run, restart, stop, force-stop, status, ps, ports, inspect, logs, and events behavior through Launchdeck.
  Supports: repeat start, stop/restart, observation.
  Depends on: Launchdeck CLI command surface.
  Delivery note: core.

- **Recovery Playbooks**: Handle port conflicts, stale records, duplicate-start risk, stop failure, and missing evidence without direct OS kills.
  Supports: port conflict and recovery scenarios.
  Depends on: `inspect`, `ports`, `conflicts`, `reconcile`, logs, events, ownership proof.
  Delivery note: core.

- **Clean Safety**: Separate safe clean, risky clean, and reset and preserve diagnostic/user data.
  Supports: clean scenario.
  Depends on: Launchdeck clean target model.
  Delivery note: core.

- **Eval Prompts**: Prove trigger correctness, non-trigger correctness, behavior safety, and compact-output behavior against baseline agent behavior.
  Supports: acceptance proof.
  Depends on: representative prompt fixtures and expected decisions.
  Delivery note: validation-oriented.

### Capability Relationships

- Intent routing chooses the subflow; it must not contain all detailed rules.
- Adoption precedes managed start for unknown projects.
- Observation precedes mutation for start, restart, stop, force-stop, recovery, and clean.
- Recovery may block operation when ownership or state evidence is unsafe.
- Eval prompts must cover every safety boundary that could otherwise regress into raw agent behavior.

### Capability Preservation Ledger

| Upstream Signal | Source | Selected Entry Point | Implementation Obligation | Acceptance Proof | Narrowing Confirmation |
| --- | --- | --- | --- | --- | --- |
| start/run/preview local project | requirements.md | `launchdeck-agent/SKILL.md` route to `command-flows.md` or `adoption-flow.md` | Must use Launchdeck-managed start after evidence preflight. | Behavior eval: unknown project and existing run reuse. | Not narrowed. |
| create/propose `.launchdeck.yml` | requirements.md | `references/adoption-flow.md` | Exact/strong evidence may write; weak/conflicting evidence must propose or confirm. | Adoption eval with exact, weak, and conflicting candidates. | Conservative default selected in this spec. |
| stop/restart/force-stop | handoff-to-specify.md | `references/command-flows.md` and `references/recovery-playbooks.md` | Must require Launchdeck ownership proof. | Behavior eval: unknown pid/port refusal and owned force-stop after stop failure. | Not narrowed. |
| port occupied / zombie-looking process | discussion-log.md | `references/recovery-playbooks.md` | Must inspect/reconcile; must not raw kill unknown/external owners. | Behavior eval: external port occupant not killed. | Not narrowed. |
| clean caches/build output | requirements.md | `references/clean-safety.md` | Must default to safe clean and separate risky clean/reset. | Behavior eval: safe clean, risky clean confirmation, reset refusal. | Not narrowed. |
| scanner script | technical-options.md | Deferred | No v0 mutating script; any later scanner must be read-only candidate emission. | Reopen only if evals prove repeated prose failure. | User-confirmed deferred by handoff. |

## Requirements

### Functional Requirements

- **FR-001**: The v0 package MUST be named `launchdeck-agent` and live under `.agents/skills/launchdeck-agent/` unless implementation discovers a stricter local installer convention.
- **FR-002**: The package MUST include `SKILL.md` plus `references/intent-routing.md`, `references/adoption-flow.md`, `references/discovery-rules.md`, `references/command-flows.md`, `references/recovery-playbooks.md`, `references/clean-safety.md`, and `references/eval-prompts.md`.
- **FR-003**: `SKILL.md` frontmatter description MUST include natural lifecycle trigger phrases in English and Chinese and MUST trigger even when the user does not mention Launchdeck or skill names.
- **FR-004**: `SKILL.md` body MUST stay short and route details to references; framework-specific discovery rules MUST NOT live in the root skill body.
- **FR-005**: The skill MUST require local lifecycle intent plus local project/service context before entering Launchdeck behavior.
- **FR-006**: The skill MUST decline Launchdeck routing for general explanation, documentation-only work, ordinary code edits, API design discussion, and production deployment unless local lifecycle operation is also requested.
- **FR-007**: The adoption flow MUST reuse existing `.launchdeck.yml` and Launchdeck registry state before inferring new commands.
- **FR-008**: First-run adoption MUST perform read-only discovery before config mutation or long-running execution.
- **FR-009**: Discovery MUST classify lifecycle candidates as `exact`, `strong`, `weak`, or `unknown`.
- **FR-010**: Exact or strong evidence MAY authorize `.launchdeck.yml` creation or repair; weak, unknown, or conflicting evidence MUST be proposal-only or require confirmation.
- **FR-011**: Discovery MUST cover Node, Python, Docker Compose, and Make/Just/Taskfile in v0.
- **FR-012**: Discovery MUST prefer machine-readable manifests and task files over README prose.
- **FR-013**: Adoption MUST run `launchdeck doctor` before managed execution.
- **FR-014**: Adoption MUST register the project after a valid lifecycle model exists so later agents can use stable project/task targets.
- **FR-015**: Agent-internal Launchdeck calls SHOULD use `--json --compact` when the command supports it.
- **FR-016**: User-facing output MUST summarize conclusion, evidence, and safe next action instead of dumping verbose JSON by default.
- **FR-017**: Start/dev/run flows MUST observe Launchdeck state and declared ports before mutation.
- **FR-018**: Start/dev/run flows MUST be idempotent for the same project/task and report an existing managed run instead of launching a duplicate.
- **FR-019**: Restart MUST inspect and reconcile stale state before mutation and require Launchdeck ownership for any existing process it stops.
- **FR-020**: Stop MUST require Launchdeck ownership proof and MUST refuse direct stopping of unknown or external processes.
- **FR-021**: Force-stop MUST require Launchdeck ownership plus evidence that normal stop failed or the process is stuck.
- **FR-022**: Recovery MUST classify port occupants as same Launchdeck task, other Launchdeck task, external known process, unknown process, or stale record.
- **FR-023**: Occupied ports without verified Launchdeck ownership MUST be inspect-only and MUST NOT be killed automatically.
- **FR-024**: Stale state MUST route through Launchdeck reconcile before start, stop, restart, or force-stop proceeds.
- **FR-025**: Logs and events MUST be treated as evidence and preserved across recovery and cleanup flows.
- **FR-026**: Clean MUST default to safe clean and MUST NOT imply service stop.
- **FR-027**: Risky clean MUST require explicit confirmation with named targets and impact.
- **FR-028**: Reset MUST be out of automatic scope and treated as a separate destructive request.
- **FR-029**: Eval prompts MUST include should-trigger, should-not-trigger, behavior/safety, and compact-output groups.
- **FR-030**: Eval prompts MUST compare intended with-skill behavior against baseline agent behavior: fewer ad hoc starts, fewer raw kills, fewer duplicate servers, more persisted Launchdeck config usage, and more inspect/reconcile before mutation.

### Non-Functional Requirements

- The package MUST minimize agent context usage through progressive disclosure.
- The root skill SHOULD stay under the skill-creator recommended size and load reference files only when relevant.
- The skill MUST preserve Launchdeck safety model instead of becoming a parallel process manager.
- The package MUST be readable and reviewable as plain Markdown.
- The spec MUST preserve cross-platform intent; skill prose must not assume Windows-only process commands.

### Boundary Constraints

- Launchdeck CLI is the execution authority.
- `.launchdeck.yml` is the lifecycle authority.
- The skill package may instruct agents to call Launchdeck but must not implement its own process manager.
- Source code, tests, CLI behavior, and runtime semantics are not changed by this feature specification.
- No new dependency is required by v0 skill prose.

## Acceptance Proof

### Acceptance Signals

- A reviewer can inspect `.agents/skills/launchdeck-agent/SKILL.md` and verify it is a short router with explicit safety gates.
- Every reference file exists and owns its intended subflow.
- Eval prompts include positive, negative, safety, and compact-output cases.
- The package explains how to avoid duplicate starts, prove ownership before stop/restart/force-stop, refuse unknown/external process kills, and keep clean safe.
- The package uses Launchdeck command names that exist in the current CLI docs or help.

### Measurable Success Criteria

- **SC-001**: At least 8 should-trigger prompts, including English and Chinese examples, map to Launchdeck lifecycle routing.
- **SC-002**: At least 6 should-not-trigger prompts stay out of Launchdeck routing unless local lifecycle context is added.
- **SC-003**: Behavior eval prompts cover unknown project adoption, existing run reuse, duplicate-start prevention, Launchdeck-owned conflicts, external/unknown conflicts, stale state, stop failure, safe clean, risky clean, and reset refusal.
- **SC-004**: Compact-output eval prompts verify `--json --compact` posture and concise user summaries.
- **SC-005**: No eval expected behavior authorizes raw OS process kill for unknown or external owners.

## Decision Capture

### Discussion Decision Digest

- **Selected Direction**: One `launchdeck-agent` router skill with bundled references, because v0's highest risk is natural-intent routing and safety consistency.
- **Rejected Alternatives**: Six public skills for v0 are rejected because competing descriptions would make trigger tuning harder. GUI/MCP-first is rejected because the CLI/skill behavior contract should stabilize first. Direct agent process killing is rejected by safety model. Clean-as-reset and automatic destructive cleanup are rejected.
- **Accepted Tradeoffs**: Weak-confidence discovery may be less automated to preserve safety. References remain internal until trigger behavior is proven. Scanner scripts are deferred until evals prove need.
- **Experience Commitments**: Users express intent, not skill names; the agent reports conclusion, evidence, and safe next action; the agent avoids duplicate local services.
- **Review Criteria Carry-Forward**: Review target boundary, safety rules, Must-Preserve items, and CA obligations before planning. Do not over-review exact wording inside every reference unless it changes product boundary.
- **Must Not Dilute**: Observe before mutate; ownership proof before stop/restart/force-stop; inspect-only for unknown/external processes; safe clean only by default; compact JSON for agent loops.

### Locked Decisions

- V0 ships one `launchdeck-agent` package, not multiple public skills.
- `.agents/skills/launchdeck-agent/` is the verified local target path.
- Reference files are internal subflows and may later be promoted only after eval evidence.
- The skill cannot bypass Launchdeck for process mutation.
- Port or PID evidence alone cannot authorize stop.

### User-Confirmed Deferrals

- Scanner scripts -> deferred until evals prove prose discovery failure.
- Executable eval fixtures -> deferred until prose evals reveal repeatable gaps.
- Monorepo-first behavior -> deferred unless downstream planning finds a hard local requirement.
- Separate public subskills -> deferred until router trigger behavior is proven.
- MCP/GUI/product installer -> out of v0.

### Canonical References

- `.specify/discussions/launchdeck-agent-skill-suite/handoff-to-specify.md`
- `.specify/discussions/launchdeck-agent-skill-suite/requirements.md`
- `.specify/discussions/launchdeck-agent-skill-suite/technical-options.md`
- `.specify/discussions/launchdeck-agent-skill-suite/open-questions.md`
- `README.md`
- `src/cli.js`
- `test/cli-contract.test.js`
- `test/cli-control-plane-contract.test.js`
- `test/global-runtime.test.js`
- `test/clean-safety.test.js`

## Consequence Analysis

### Lifecycle And State Behavior

- `CA-AS-001`: Skill package and references -> all mutation states -> must treat Launchdeck as execution authority and must not independently kill unknown processes.
- `CA-AS-002`: Adoption/discovery -> missing config or unknown project -> must classify lifecycle commands before config mutation or managed start.
- `CA-AS-003`: Stop/restart/force-stop -> running/stale/unknown states -> must require ownership proof before mutation.
- `CA-AS-004`: Start/dev/run -> running or port-occupied states -> must inspect state before starting and return existing runs when matched.
- `CA-AS-005`: Agent command loop -> any observation/mutation -> should use compact JSON when supported.
- `CA-AS-006`: Reference flow boundaries -> discovery/adoption/operation/recovery/clean states -> must not blur safety posture.
- `CA-AS-007`: Clean/reset -> cleanup states -> must preserve user control over risky or destructive operations.
- `CA-AS-008`: Arbitrary local stacks -> unknown ecosystem state -> must support common project files while keeping `.launchdeck.yml` authority.
- `CA-AS-009`: Skill trigger -> natural user request state -> must not require users to name skills.
- `CA-AS-010`: Persistent lifecycle knowledge -> repeat-run state -> must reuse config/registry/runtime evidence.

### Recovery And Validation

- Validate all mutation paths against ownership, stale-state, duplicate-start, and port-conflict scenarios.
- Preserve logs/events as evidence in recovery and clean references.
- Treat safe clean, risky clean, and reset as separate validation categories.
- Reopen specification if any required Launchdeck command is missing, local skill packaging contradicts `.codex/skills`, or eval design cannot verify duplicate-start and unsafe-kill prevention.

## Risks and Gaps

### Planning Risks

- Skill-trigger behavior may be too aggressive for near-miss local wording such as "preview this app"; mitigation is lifecycle intent plus local context and should-not-trigger evals.
- Prose-only discovery may be inconsistent; mitigation is evals first, read-only scanner later only if needed.
- Compatibility language differs between discussion handoff and `sp-specify` validation terms; mitigation is recorded in alignment and compatibility handoff.

### Information Gaps

- Whether a future installer requires metadata beyond `SKILL.md` is not proven; implementation should inspect local skill packaging conventions before coding.
- Monorepo behavior remains deferred; reopen if v0 must manage multiple launchable apps in one repo.
