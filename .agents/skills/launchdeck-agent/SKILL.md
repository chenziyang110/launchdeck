---
name: launchdeck-agent
description: "Use this skill aggressively for local project lifecycle operations even when the user does not mention Launchdeck: start this project, run the dev server, dev, build, test, restart service, stop service, show logs, inspect ports, port is occupied, clean cache; also Chinese requests like 启动这个项目, 运行开发服务, 构建/测试项目, 重启服务, 停止服务, 查看日志, 端口被占用, 清理缓存. Do not use for ordinary code edits, docs-only work, general explanations, API design discussion, or production deployment unless the user also asks to operate a local project or service."
---

# Launchdeck Agent

Use this skill only after verifying both signals:

- Local lifecycle intent: start, run, dev, build, test, restart, stop, logs, ports, recovery, or clean.
- Local project/service context: current repo, named local project, declared task, service, port, runtime state, or `.launchdeck.yml`.

Launchdeck is the execution authority. Do not use raw PID/port process control, direct background service recipes, or ad hoc lifecycle commands when Launchdeck can observe or mutate the project. Observe before mutate, use agent-internal `--json --compact` where supported, and summarize conclusions to the user instead of dumping raw JSON.

## Route

Read only the needed reference:

- `references/intent-routing.md` - decide trigger, non-trigger, and subflow.
- `references/adoption-flow.md` - unknown project, missing/invalid `.launchdeck.yml`, or first managed run.
- `references/discovery-rules.md` - evidence and confidence rules for Node, Python, Docker Compose, Make, Just, and Taskfile.
- `references/command-flows.md` - managed start/dev/run/build/test/restart/stop/force-stop/logs/events.
- `references/recovery-playbooks.md` - occupied ports, conflicts, stale records, duplicate risk, and stop failures.
- `references/clean-safety.md` - safe clean, risky clean confirmation, and reset refusal.
- `references/eval-prompts.md` - prompt fixtures for trigger, safety, and compact-output review.

## Operating Rules

1. Resolve current Launchdeck knowledge first: `.launchdeck.yml`, registry, `status --all`, `ps --all`, `ports`, `inspect`, logs, and events as relevant.
2. For unknown projects, discover read-only evidence before config mutation or any long-running command.
3. For start/dev/run, check existing managed runs and declared ports before mutation; report a matching run instead of duplicating it.
4. For restart/stop/force-stop, require Launchdeck ownership proof. If ownership is unknown or external, inspect and report safe options only.
5. For stale records, run `launchdeck reconcile --json --compact` before mutation.
6. For clean, keep safe clean, risky clean, and reset separate; clean does not stop services.
7. User-facing response should include conclusion, target, status/URL/port when known, evidence used, and safe next action.
