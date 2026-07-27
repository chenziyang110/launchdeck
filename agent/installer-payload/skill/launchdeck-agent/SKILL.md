---
name: launchdeck-agent
description: "Use this skill aggressively for local project lifecycle operations even when the user does not mention Launchdeck: start this project, run the dev server, dev, build, test, restart service, stop service, show logs, inspect ports, port is occupied, clean cache; and when the user explicitly asks to configure this local project for Launchdeck or create or generate a project-adapted `.launchdeck.yml`, including 为这个项目生成 Launchdeck 配置. Do not use for ordinary code edits, docs-only work, general explanations, API design discussion, or production deployment unless the user also asks to operate or configure a local project or service."
---

# Launchdeck Agent

Use this skill only after verifying a local project/service context plus one applicable intent:

- Local lifecycle intent: start, run, dev, build, test, restart, stop, logs, ports, recovery, or clean; or
- Explicit configuration-authoring intent: create/write/generate `.launchdeck.yml` or configure/adopt this project for Launchdeck.
- Local context: current repo, named local project, declared task, service, port, runtime state, or `.launchdeck.yml`.

Launchdeck is the execution authority. Do not use raw PID/port process control, direct background service recipes, or ad hoc lifecycle commands when Launchdeck can observe or mutate the project. Prefer the local stdio MCP, observe before mutate, and summarize the normalized result instead of dumping raw JSON.

Keep the layers separate:

- Installer layer: installs or repairs Launchdeck-owned runtime, Skill, MCP, launcher, host config, and receipts. It never authors a project `.launchdeck.yml`.
- Agent authoring layer: may write one missing `.launchdeck.yml` only through the explicit authoring branch after bounded project inspection. Preserve every existing config.
- Host layer: approval prompts, trust decisions, extension reloads, and host discovery are host-owned. Do not treat an installed file or fixture as host readiness.
- Runtime layer: readiness requires MCP initialize/capabilities evidence or compatible CLI JSON evidence for the exact selected build, component, scope, host/version, platform, and scenario.

Project scope is the default for setup/install planning. User scope is explicit; do not infer it from home-directory access or from a generic confirmation.

## Route

Read only the needed reference:

- `references/intent-routing.md` - decide trigger, non-trigger, and subflow.
- `references/adoption-flow.md` - read-only inspection plus the separate explicit missing-config authoring flow.
- `references/discovery-rules.md` - evidence and confidence rules for Node, Python, Docker Compose, Make, Just, and Taskfile.
- `references/command-flows.md` - MCP-first managed start/run/restart/stop and bounded observation.
- `references/recovery-playbooks.md` - occupied ports, conflicts, stale records, duplicate risk, and stop failures.
- `references/clean-safety.md` - digest-bound safe clean and risky/reset refusal.
- `references/eval-prompts.md` - prompt fixtures for trigger, safety, and compact-output review.

## Operating Rules

1. Pass the intent gate, then call `capabilities.get` before selecting an operation or fallback surface.
2. For lifecycle operations, use MCP observation before one low-risk mutation. Let the Kernel decide current scope, risk, ownership, compatibility, locks, and clean digest.
3. Use compatible CLI JSON fallback for lifecycle operations only when MCP is unavailable before dispatch or omits the required safe operation. Re-check CLI capabilities and observe again before its one mutation.
4. After any mutation might have been dispatched, never fall back or repeat it. Recover by known operation ID or one bounded `operation.list` correlation followed by get/reconcile.
5. Treat risk, ownership, scope, compatibility, lock, digest, config, and input refusals as final. Report them without another surface.
6. Keep adoption inspection read-only. Author one missing `.launchdeck.yml` only through the explicit authoring branch in `adoption-flow.md`; preserve every existing config and never chain registration or lifecycle execution.
7. Refuse requests to execute force, risky/destructive clean, raw command/env/cwd, external termination, medium-risk, remote/production, or permanent-follow behavior without calling a lifecycle operation.
8. Use accepted Agent-facing lifecycle aliases when the user asks for the normal webpage/service flow: `up`, `status --all`, `logs <task>`, and `down`. For the Flask demo flow, logs must target `start`, not the default `dev`.
9. User-facing response should include conclusion, target, outcome, resource status/URL/port when known, evidence, and a safe next action.
10. Be precise about evidence: deterministic fixtures prove deterministic fixture behavior only. Do not claim unverified real hosts, operating systems, host versions, or extension readiness without a current matching evidence cell.
