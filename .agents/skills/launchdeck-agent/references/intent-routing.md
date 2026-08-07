# Intent Routing

Route when the prompt combines local lifecycle intent with local project/service context, or when it explicitly asks to configure that local project for Launchdeck. Lifecycle users do not need to say "Launchdeck"; configuration authoring users must explicitly request the config write.

## Surface pin (hard rule)

Pin exactly one Launchdeck entrypoint for the whole request through `entrypoint-discovery.md` (MCP first, then CLI candidates). **Pre-dispatch only:** compatible CLI JSON may cover capabilities, projects, and read-only discovery when MCP is unavailable. **After a mutation may have been dispatched:** never switch entrypoints, never fall back to CLI or another surface, and never repeat the mutation—recover only by known operation ID or the bounded `operation.list` correlation in this document.

## Should Trigger

- Start/run/dev: "start this project", "run the dev server", "start the local API", "启动这个项目", "运行开发服务".
- Managed build/test lifecycle: "build this local app", "run project tests through the lifecycle", "构建项目", "测试这个项目".
- Restart/stop: "restart this service", "stop the local demo", "重启服务", "停止服务".
- Observation: "show logs", "what is running", "which port is used", "查看日志", "看看端口".
- Recovery: "port 8888 is occupied", "the dev server failed because the port is busy", "端口被占用".
- Safe clean: "clean the build cache safely", "clear local generated cache", "安全清理缓存".
- Adoption inspection: "inspect how this repo could be managed", "analyze this unknown project's lifecycle", "分析这个项目如何接入".
- Explicit configuration authoring: "create a `.launchdeck.yml` for this repo", "configure this project for Launchdeck", "为这个项目生成 Launchdeck 配置", "给当前项目编写 `.launchdeck.yml`".
- Explicit configure-validate-launch: "check this project's Launchdeck config, create it only if missing, validate it, then launch the `start` task", "检查配置，缺失则生成，验证成功后启动". The current request must explicitly authorize both the missing-config write and the later lifecycle start.

## Should Not Trigger

- Ordinary code edits: refactor, fix a component, change source logic, add tests, unless local lifecycle operation is also requested.
- Docs-only or explanation: "explain ports", "write API docs", "what command starts Vite normally".
- Production or remote operations: deploy to production, manage cloud services, operate a remote host.
- Force or destructive requests: force-stop, raw process termination, risky clean, reset, remove dependencies, wipe data.
- Medium-risk execution, external-process termination, remote/production control, adoption apply, or permanent log following.
- Ambiguous preview/open wording without a local project/service signal.
- General troubleshooting that does not involve a local service, port, logs, process ownership, or lifecycle command.
- General explanations of Launchdeck configuration without a named/current local project or an explicit request to write its config.

## Context Gate

Before routing, identify at least one local anchor:

- Current working directory is a project repo.
- `.launchdeck.yml` exists or can be discovered.
- User names a local project, task, service, or port.
- Launchdeck registry/runtime/log/event evidence exists.

If the local anchor is absent, ask one clarifying question or answer normally outside this skill.

## Subflow Selection

- Combined intent -> only when the current request explicitly says to configure or create a missing config, validate it, and then launch. A generic confirmation, generic "yes", or an earlier proposal does not create combined intent.
- Authoring-only explicit configuration for a local project -> `adoption-flow.md`, then `discovery-rules.md`; validate and stop.
- Onboarding, inspection, or a missing lifecycle model without explicit write intent -> the read-only branch in `adoption-flow.md`, then `discovery-rules.md`.
- Lifecycle-only start/dev/run/build/test/package/lint/typecheck -> `command-flows.md`. When the config is missing, report the missing-config state and stop; lifecycle-only intent never authors it.
- Status, running process list, ports, logs, events, inspect -> `command-flows.md`.
- Occupied port, conflict, stale record, duplicate risk, stop failure -> `recovery-playbooks.md`.
- Cache/build-output cleanup -> `clean-safety.md`.
- Prompt review or skill validation -> `eval-prompts.md`.

## Surface State Machine

1. Record an intent-gate decision and distinguish `inspection_only`, `explicit_config_authoring`, `lifecycle_only`, and `explicit_config_validate_launch`. Inspection-only adoption wording never authorizes a write; a later generic confirmation or generic "yes" is neither explicit authoring nor combined intent.
2. Call `capabilities.get` over MCP.
3. For explicit config authoring alone, follow `adoption-flow.md`: `project.list` decides whether registered-scope MCP inspection is callable; an unregistered missing-config target uses bounded workspace reads instead. Then allow at most one missing-config filesystem write and read-only validation. Stop without registration or lifecycle execution.
4. For lifecycle-only intent, observe with the narrow task/project/log/event operation needed for the request, then send at most one low-risk mutation. Missing config is a final refusal for this route and does not authorize authoring.
5. For explicit configure-validate-launch combined intent, follow the guarded branch in `adoption-flow.md`. Cross each phase only on its own proven effect: read-only discovery; write only a missing config; successful validation; re-run `capabilities.get` and observe through the pinned entrypoint; exactly one low-risk lifecycle mutation; then bounded status, logs, and readiness observations.
6. Allow compatible CLI JSON fallback for lifecycle intent only after pre-handshake failure or explicit safe-operation omission and before any mutation dispatch. Re-check capabilities and observation on CLI.
7. On a Kernel refusal, report and stop. Do not reinterpret host approval or user prose as execution authority.
8. On post-dispatch transport loss, do not use CLI fallback. Use the known operation ID, or one exact `operation.list` query bounded to 15 minutes and 20 results. Zero or multiple candidates stop unresolved.
9. Refuse every forbidden intent without a lifecycle call.

## Evidence Layers

Keep four evidence layers distinct in every decision and summary:

- Install approval: an explicit Launchdeck installer confirmation authorizes the planned installer mutation only. npm/npx approval does not count as Launchdeck approval.
- Host trust and reload: host-owned prompts, trust state, extension reloads, and config reloads are pending until observed for the exact host/version/scope/component.
- Runtime readiness: MCP initialize plus `capabilities.get`, or a compatible CLI JSON fallback before dispatch, proves only the exact build identity and operation surface observed.
- Project authoring: the installer never writes `.launchdeck.yml`; the installed Agent writes at most one missing config through the explicit authoring branch.

Project scope is the default selection. User scope requires explicit `--scope user` or an unambiguous user-scope request. Exact host/version/component claims require current matching evidence; deterministic fixtures and superseded cells must be described as such.
