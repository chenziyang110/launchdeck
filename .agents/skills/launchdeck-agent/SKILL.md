---
name: launchdeck-agent
description: "Use this skill aggressively for local project lifecycle operations even when the user does not mention Launchdeck: start this project, run the dev server, dev, build, test, restart service, stop service, show logs, inspect ports, port is occupied, clean cache; also Chinese requests like 启动这个项目, 运行开发服务, 构建/测试项目, 重启服务, 停止服务, 查看日志, 端口被占用, 清理缓存. Do not use for ordinary code edits, docs-only work, general explanations, API design discussion, or production deployment unless the user also asks to operate a local project or service."
---

# Launchdeck Agent

Use this skill only after verifying both signals:

- Local lifecycle intent: start, run, dev, build, test, restart, stop, logs, ports, recovery, or clean.
- Local project/service context: current repo, named local project, declared task, service, port, runtime state, or `.launchdeck.yml`.

Launchdeck is the execution authority. Do not use raw PID/port process control, direct background service recipes, or ad hoc lifecycle commands when Launchdeck can observe or mutate the project. Prefer the local stdio MCP, observe before mutate, and summarize the normalized result instead of dumping raw JSON.

## Route

Read only the needed reference:

- `references/intent-routing.md` - decide trigger, non-trigger, and subflow.
- `references/adoption-flow.md` - read-only inspection for an unknown or unconfigured project.
- `references/discovery-rules.md` - evidence and confidence rules for Node, Python, Docker Compose, Make, Just, and Taskfile.
- `references/command-flows.md` - MCP-first managed start/run/restart/stop and bounded observation.
- `references/recovery-playbooks.md` - occupied ports, conflicts, stale records, duplicate risk, and stop failures.
- `references/clean-safety.md` - digest-bound safe clean and risky/reset refusal.
- `references/eval-prompts.md` - prompt fixtures for trigger, safety, and compact-output review.

## Operating Rules

1. Pass the intent gate, then call `capabilities.get` before selecting an operation or fallback surface.
2. Use MCP observation before one low-risk mutation. Let the Kernel decide current scope, risk, ownership, compatibility, locks, and clean digest.
3. Use compatible CLI JSON fallback only when MCP is unavailable before dispatch or omits the required safe operation. Re-check CLI capabilities and observe again before its one mutation.
4. After any mutation might have been dispatched, never fall back or repeat it. Recover by known operation ID or one bounded `operation.list` correlation followed by get/reconcile.
5. Treat risk, ownership, scope, compatibility, lock, digest, config, and input refusals as final. Report them without another surface.
6. Keep adoption inspection read-only. Do not write configuration, register, or start as an adoption side effect.
7. Refuse force, risky/destructive clean, raw command/env/cwd, external termination, medium-risk, remote/production, and permanent-follow intent without calling a lifecycle operation.
8. User-facing response should include conclusion, target, outcome, resource status/URL/port when known, evidence, and a safe next action.
