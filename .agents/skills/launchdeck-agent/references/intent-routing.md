# Intent Routing

Route only when the prompt combines local lifecycle intent with local project/service context. The user does not need to say "Launchdeck".

## Should Trigger

- Start/run/dev: "start this project", "run the dev server", "start the local API", "启动这个项目", "运行开发服务".
- Managed build/test lifecycle: "build this local app", "run project tests through the lifecycle", "构建项目", "测试这个项目".
- Restart/stop: "restart this service", "stop the local demo", "重启服务", "停止服务".
- Observation: "show logs", "what is running", "which port is used", "查看日志", "看看端口".
- Recovery: "port 8888 is occupied", "the dev server failed because the port is busy", "端口被占用".
- Safe clean: "clean the build cache safely", "clear local generated cache", "安全清理缓存".
- Adoption inspection: "inspect how this repo could be managed", "analyze this unknown project's lifecycle", "分析这个项目如何接入".

## Should Not Trigger

- Ordinary code edits: refactor, fix a component, change source logic, add tests, unless local lifecycle operation is also requested.
- Docs-only or explanation: "explain ports", "write API docs", "what command starts Vite normally".
- Production or remote operations: deploy to production, manage cloud services, operate a remote host.
- Force or destructive requests: force-stop, raw process termination, risky clean, reset, remove dependencies, wipe data.
- Medium-risk execution, external-process termination, remote/production control, adoption apply, or permanent log following.
- Ambiguous preview/open wording without a local project/service signal.
- General troubleshooting that does not involve a local service, port, logs, process ownership, or lifecycle command.

## Context Gate

Before routing, identify at least one local anchor:

- Current working directory is a project repo.
- `.launchdeck.yml` exists or can be discovered.
- User names a local project, task, service, or port.
- Launchdeck registry/runtime/log/event evidence exists.

If the local anchor is absent, ask one clarifying question or answer normally outside this skill.

## Subflow Selection

- Onboarding or missing lifecycle model -> `adoption-flow.md`, then `discovery-rules.md`.
- Start/dev/run/build/test/package/lint/typecheck -> `command-flows.md`.
- Status, running process list, ports, logs, events, inspect -> `command-flows.md`.
- Occupied port, conflict, stale record, duplicate risk, stop failure -> `recovery-playbooks.md`.
- Cache/build-output cleanup -> `clean-safety.md`.
- Prompt review or skill validation -> `eval-prompts.md`.

## Surface State Machine

1. Record an intent-gate decision.
2. Call `capabilities.get` over MCP.
3. If supported, observe with the narrow task/project/log/event operation needed for the request, then send at most one low-risk mutation.
4. Allow compatible CLI JSON fallback only after pre-handshake failure or explicit safe-operation omission and before any mutation dispatch. Re-check capabilities and observation on CLI.
5. On a Kernel refusal, report and stop. Do not reinterpret host approval or user prose as execution authority.
6. On post-dispatch transport loss, do not use CLI fallback. Use the known operation ID, or one exact `operation.list` query bounded to 15 minutes and 20 results. Zero or multiple candidates stop unresolved.
7. Refuse every forbidden intent without a lifecycle call.
