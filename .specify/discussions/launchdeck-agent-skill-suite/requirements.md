# Requirements Draft: Launchdeck Agent Skill Suite

## Core Goal

Provide a skill suite that lets coding agents safely onboard and operate arbitrary local software projects through Launchdeck.

Users should not need to know the skill names. They should be able to say a natural request such as "start this project" or "run the dev server", and the agent should internally route that intent to the Launchdeck skill suite.

## Product Requirements

- The skill suite must discover likely project lifecycle commands without immediately running risky commands.
- The skill suite must produce or repair `.launchdeck.yml` as the project lifecycle authority.
- The skill suite must be reachable through natural user intent, not only explicit skill invocation.
- The skill suite must persist discovered lifecycle knowledge so future runs can skip broad discovery.
- The skill suite must use Launchdeck CLI commands for start, stop, restart, ps, ports, inspect, logs, reconcile, and clean.
- The skill suite must avoid duplicate service starts by checking Launchdeck state and declared ports before running managed tasks.
- The skill suite must never stop an unknown process directly. It must use Launchdeck ownership proof and safe inspect/reconcile flows.
- The skill suite must prefer compact JSON for low-context agent loops.
- The skill suite must keep risky cleanup and destructive reset outside automatic behavior.

## Non-Goals

- The skill suite is not a replacement for Launchdeck.
- The skill suite is not a universal build system.
- The skill suite does not own direct OS process killing.
- The skill suite does not infer that an occupied port is safe to kill.

## Success Signals

- An agent can enter an unknown project, discover lifecycle candidates, create a proposed `.launchdeck.yml`, run `doctor`, register the project, start exactly one managed service, inspect ports, read logs, stop the owned service, and recover stale state.
- A second agent or terminal sees the same Launchdeck state instead of starting a duplicate service.
- When a port is occupied externally, the skill routes to `inspect` and refuses unsafe stop behavior.
- After first adoption, the user can ask the agent to run the same project again and the agent can use existing Launchdeck config/registry state directly.

## Skill Authoring Requirements

- Skill descriptions must include natural user intents such as "start this project", "run the dev server", "restart the service", "port is occupied", "show logs", and equivalent Chinese phrases.
- Skill bodies must stay short and procedural, with detailed framework-specific discovery rules moved to `references/`.
- The routing skill must make direct process launch the exception, not the default, whenever Launchdeck can manage the task.
- The onboarding skill must distinguish evidence-backed command detection from guesses and record confidence.
- Skill evaluation must include both trigger tests and behavior tests against realistic user prompts.
- The suite must include a hidden routing/index skill that can trigger even when the user never says "Launchdeck" or a skill name.
- Each skill must preserve the shared rule that Launchdeck owns execution, state, and ownership checks.
- Framework-specific details must be loaded only when evidence points to that framework.
- Every skill must make unsafe direct process killing visibly out of bounds.
- V0 should ship as one `launchdeck-agent` skill with references, not six separate skills, until natural-intent routing is proven.
- V0 should avoid scripts unless evals show prose discovery is too unreliable; any first script should be read-only.

## V0 Package Requirement

The v0 package should contain one skill folder named `launchdeck-agent`.

The skill must be able to answer this routing question:

```text
Given the user's natural request and current project state,
should the agent onboard, operate, observe, recover, clean, or decline?
```

The v0 package should treat references as internal subflows rather than public user-facing skills. Users should experience one capability: "agent can safely run/manage my project through Launchdeck."

## Intent Routing Requirements

- The v0 router must trigger on natural lifecycle requests in English and Chinese, including "start/run this project", "启动这个项目", "run the dev server", "restart this service", "重启服务", "port is occupied", "端口被占用", "show logs", "看日志", "stop this service", and "停止服务".
- The router must require both lifecycle intent and local project/service context before using Launchdeck.
- The router must not trigger for general explanations, ordinary code edits, API design discussion, documentation-only tasks, or production deployment requests unless the user also asks to operate a local project.
- Ambiguous requests should start with read-only evidence gathering rather than lifecycle mutation.
- The router must treat any request that could create a duplicate process, occupy a port, stop a process, or clean generated files as a Launchdeck candidate.
- The router must prefer `--json --compact` when invoking Launchdeck for agent-internal diagnosis.
- The router must summarize user-facing results as conclusion, evidence, and safe next action instead of dumping full JSON by default.

## Adoption Requirements

- First-run adoption must begin with read-only discovery and must not start long-lived project commands before a Launchdeck lifecycle model exists.
- Adoption must reuse existing `.launchdeck.yml` and Launchdeck registry state when present.
- Adoption must classify discovered lifecycle candidates as `exact`, `strong`, `weak`, or `unknown`.
- Adoption may write or repair `.launchdeck.yml` only from evidence-backed candidates; weak or conflicting candidates require user confirmation or a proposal-only response.
- Adoption must model long-running tasks, declared ports, build/test tasks, and safe clean targets separately.
- Adoption must run `launchdeck doctor` before managed execution.
- Adoption must register the project after a valid lifecycle model exists so future agents can use stable project/task targets.
- Adoption must report durable handles after successful managed start: target, status, URL or port, log location, stop command, and restart command.
- Adoption must stop safely when commands are unknown, ports are externally occupied, doctor fails, secrets are missing, or the user request is not local lifecycle management.

## Discovery Requirements

- Discovery must prefer existing `.launchdeck.yml` and Launchdeck registry state over newly inferred commands.
- Discovery must prioritize machine-readable manifests and task files over README prose.
- Discovery must cover Node, Python, Docker Compose, and Make/Just/Taskfile in v0.
- Discovery must emit compact candidates with task kind, command, long-running flag, ports, confidence, evidence, and risks.
- Discovery must downgrade confidence when multiple plausible lifecycle commands conflict.
- Discovery must not infer safe cleanup from broad `clean` or reset-like tasks without explicit safe target evidence.
- Discovery must not invent framework commands when no reliable manifest, task, or framework evidence exists.
- Discovery must treat secrets, databases, migrations, and external dependencies as adoption risks that can block managed start.

## Command Flow Requirements

- Command flows must observe Launchdeck state before lifecycle mutation.
- Start/dev/run must be idempotent for the same project/task and must report an existing managed run instead of launching a duplicate.
- Start/dev/run must inspect declared ports before execution and route unknown/external port occupation to recovery.
- Restart must inspect and reconcile stale state before mutation and must require Launchdeck ownership for any existing process it stops.
- Stop must require Launchdeck ownership proof and must refuse direct stopping of unknown or external processes.
- Force-stop must require Launchdeck ownership plus evidence that normal stop failed or the process is stuck.
- Logs and events must be treated as evidence and preserved across recovery and cleanup flows.
- Clean must default to safe clean, must not imply service stop, and must require confirmation for risky clean or reset.
- User-facing command results must summarize conclusion, evidence, and safe next action.
- Agent-facing command calls must prefer `--json --compact`.

## Recovery Requirements

- Recovery must diagnose before mutation and must use Launchdeck commands as the only mutation surface.
- Port conflict recovery must classify occupants as same Launchdeck task, other Launchdeck task, external known process, unknown process, or stale record.
- Occupied ports without verified Launchdeck ownership must default to inspect-only behavior and must not be killed automatically.
- Stale state must route through reconcile before start, stop, restart, or force-stop proceeds.
- Stop failure recovery must preserve logs/events, verify ownership, then allow force-stop only for Launchdeck-owned targets with evidence of normal stop failure or stuck process.
- Duplicate-start recovery must return an existing matching managed run instead of creating another instance.
- Missing logs must fall back to events and must not trigger cleanup or restart by itself.
- Recovery output must include classification, target, port, owner evidence, allowed actions, blocked actions, and safe next actions.

## Clean Safety Requirements

- Clean must be modeled separately from stop, restart, recovery, and reset.
- Safe clean may only remove evidence-backed generated outputs or cache paths that can be recreated.
- Safe clean must preserve `.launchdeck.yml`, Launchdeck logs/events, runtime state for running tasks, env/secrets, databases, user data, and source/config files.
- Dependency directories, Docker volumes, package-manager caches, broad project `clean` recipes, and undeclared generated folders must be treated as risky clean.
- Reset actions such as database deletion, env/secret removal, broad workspace wipes, and `git clean -xdf` style deletion must be out of automatic scope.
- Clean must inspect whether managed tasks are running and must not stop services unless the user separately requests a stop action.
- Risky clean and reset must require explicit user confirmation with named targets and impact.
- Clean output must report completed targets, skipped risky targets, preserved evidence, running-task constraints, and safe next actions.

## Eval Requirements

- Eval prompts must cover should-trigger and should-not-trigger natural-language requests in English and Chinese.
- Eval prompts must verify behavior, not only trigger selection.
- Behavior evals must cover unknown project adoption, existing managed run reuse, duplicate-start prevention, Launchdeck-owned port conflicts, external/unknown port conflicts, stale state, stop failure, safe clean, risky clean, and reset refusal.
- Evals must verify that external or unknown port occupants are not killed automatically.
- Evals must verify that stop, restart, and force-stop require Launchdeck ownership proof.
- Evals must verify that agent-internal Launchdeck calls prefer `--json --compact`.
- Evals must verify that user-facing replies summarize conclusion, evidence, and safe next action rather than dumping verbose JSON.
- Eval success should be judged against baseline agent behavior: fewer ad hoc starts, fewer raw kills, fewer duplicate servers, more persisted Launchdeck config usage, and more inspect/reconcile before mutation.

## V0 Skill Package Requirements

- V0 must ship as one skill package named `launchdeck-agent`.
- `launchdeck-agent/SKILL.md` must be a short router and safety contract, not a long framework guide.
- `SKILL.md` description must include natural trigger phrases for start, run, preview, restart, stop, inspect, port conflict, logs, running services, clean caches, and local project lifecycle management.
- `SKILL.md` must route details to references for intent routing, adoption, discovery, command flows, recovery, clean safety, and eval prompts.
- Reference files must be loaded only when their subflow is relevant.
- V0 must not expose separate public onboarding/operation/recovery/cleanup skills until the router trigger behavior is proven.
- V0 must ship prose-and-reference first; deterministic scanner scripts are deferred unless eval failures show a repeated need.
- Any future scanner script must be read-only and must emit candidate facts without writing config, starting processes, stopping processes, cleaning files, or mutating Launchdeck state.

## User Experience Contract

The user-facing interaction should look like this:

```text
User: 帮我启动这个项目
Agent: detects project-run intent
Agent: checks whether Launchdeck config/registry already exists
Agent: if missing, discovers lifecycle and creates/proposes .launchdeck.yml
Agent: runs Launchdeck doctor/register/status/start through safe commands
Agent: reports URL/status/log path/next safe actions
```

The user should not have to say:

```text
Use launchdeck-discover-project, then launchdeck-author-config...
```

Skill routing is an agent-internal behavior.
