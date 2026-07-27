# Intent Routing

Route when the prompt combines local lifecycle intent with local project/service context, or when it explicitly asks to configure that local project for Launchdeck. Lifecycle users do not need to say "Launchdeck"; configuration authoring users must explicitly request the config write.

## Should Trigger

- Start/run/dev: "start this project", "run the dev server", "start the local API", "启动这个项目", "运行开发服务".
- Managed build/test lifecycle: "build this local app", "run project tests through the lifecycle", "构建项目", "测试这个项目".
- Restart/stop: "restart this service", "stop the local demo", "重启服务", "停止服务".
- Observation: "show logs", "what is running", "which port is used", "查看日志", "看看端口".
- Recovery: "port 8888 is occupied", "the dev server failed because the port is busy", "端口被占用".
- Safe clean: "clean the build cache safely", "clear local generated cache", "安全清理缓存".
- Adoption inspection: "inspect how this repo could be managed", "analyze this unknown project's lifecycle", "分析这个项目如何接入".
- Explicit configuration authoring: "create a `.launchdeck.yml` for this repo", "configure this project for Launchdeck", "为这个项目生成 Launchdeck 配置", "给当前项目编写 `.launchdeck.yml`".

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

- Explicit configuration authoring for a local project -> `adoption-flow.md`, then `discovery-rules.md`.
- Onboarding, inspection, or a missing lifecycle model without explicit write intent -> the read-only branch in `adoption-flow.md`, then `discovery-rules.md`.
- Start/dev/run/build/test/package/lint/typecheck -> `command-flows.md`.
- Status, running process list, ports, logs, events, inspect -> `command-flows.md`.
- Occupied port, conflict, stale record, duplicate risk, stop failure -> `recovery-playbooks.md`.
- Cache/build-output cleanup -> `clean-safety.md`.
- Prompt review or skill validation -> `eval-prompts.md`.

## Surface State Machine

1. Record an intent-gate decision and distinguish `inspection_only`, `explicit_config_authoring`, and lifecycle intent. Inspection-only adoption wording never authorizes a write; a later generic "yes" is not explicit authoring intent.
2. Call `capabilities.get` over MCP.
3. For explicit config authoring, follow `adoption-flow.md`: `project.list` decides whether registered-scope MCP inspection is callable; an unregistered missing-config target uses bounded workspace reads instead. Then allow at most one missing-config filesystem write and read-only validation. Stop without registration or lifecycle execution.
4. For lifecycle intent, observe with the narrow task/project/log/event operation needed for the request, then send at most one low-risk mutation.
5. Allow compatible CLI JSON fallback for lifecycle intent only after pre-handshake failure or explicit safe-operation omission and before any mutation dispatch. Re-check capabilities and observation on CLI.
6. On a Kernel refusal, report and stop. Do not reinterpret host approval or user prose as execution authority.
7. On post-dispatch transport loss, do not use CLI fallback. Use the known operation ID, or one exact `operation.list` query bounded to 15 minutes and 20 results. Zero or multiple candidates stop unresolved.
8. Refuse every forbidden intent without a lifecycle call.

## Evidence Layers

Keep four evidence layers distinct in every decision and summary:

- Install approval: an explicit Launchdeck installer confirmation authorizes the planned installer mutation only. npm/npx approval does not count as Launchdeck approval.
- Host trust and reload: host-owned prompts, trust state, extension reloads, and config reloads are pending until observed for the exact host/version/scope/component.
- Runtime readiness: MCP initialize plus `capabilities.get`, or a compatible CLI JSON fallback before dispatch, proves only the exact build identity and operation surface observed.
- Project authoring: the installer never writes `.launchdeck.yml`; the installed Agent writes at most one missing config through the explicit authoring branch.

Project scope is the default selection. User scope requires explicit `--scope user` or an unambiguous user-scope request. Exact host/version/component claims require current matching evidence; deterministic fixtures and superseded cells must be described as such.
