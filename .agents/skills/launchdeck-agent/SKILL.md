---
name: launchdeck-agent
description: "Use this skill aggressively for local project lifecycle operations even when the user does not mention Launchdeck: start this project, run the dev server, dev, build, test, restart service, stop service, show logs, inspect ports, port is occupied, clean cache; and when the user explicitly asks to configure this local project for Launchdeck or create or generate a project-adapted `.launchdeck.yml`, including 为这个项目生成 Launchdeck 配置. Do not use for ordinary code edits, docs-only work, general explanations, API design discussion, or production deployment unless the user also asks to operate or configure a local project or service."
---

# Launchdeck Agent

Use this skill only after verifying a local project/service context plus one applicable intent:

- Local lifecycle intent: start, run, dev, build, test, restart, stop, logs, ports, recovery, or clean; or
- Explicit configuration-authoring intent: create/write/generate `.launchdeck.yml` or configure/adopt this project for Launchdeck.
- Local context: current repo, named local project, declared task, service, port, runtime state, or `.launchdeck.yml`.

## Policy, transport, and authority

These surfaces are layered, not peer competitors:

- **Policy (this Skill):** intent gates, entrypoint pin, observe-before-mutate, config-authoring rules, recovery, and refusals. The Skill decides *whether* and *how* to route; it is not a second control plane.
- **Transport (MCP preferred, CLI fallback):** call the pinned Launchdeck surface. Prefer local stdio MCP. Use compatible CLI JSON only when MCP is unavailable **before** any mutation dispatch, or omits a required safe operation. Do not use raw PID/port process control, ad hoc background recipes, or shell lifecycle when Launchdeck can observe or mutate the project.
- **Authority (Kernel):** every lifecycle mutation is decided by the shared Kernel (ownership, risk, locks, journal, recovery). Summarize the normalized result; do not dump raw JSON to the user.

Keep the install and host layers separate:

- Installer layer: installs or repairs Launchdeck-owned runtime, Skill, MCP, launcher, host config, and receipts. It never authors a project `.launchdeck.yml`.
- Agent authoring layer: may write one missing `.launchdeck.yml` only through the explicit authoring branch after bounded project inspection (workspace file edit + validation, not an MCP lifecycle mutation). Preserve every existing config. Lifecycle-only intent never authors a missing config.
- Host layer: approval prompts, trust decisions, extension reloads, and host discovery are host-owned. Do not treat an installed file or fixture as host readiness.
- Runtime readiness: MCP initialize/capabilities evidence or compatible CLI JSON evidence for the exact selected build, component, scope, host/version, platform, and scenario.

Project scope is the default for setup/install planning. User scope is explicit; do not infer it from home-directory access or from a generic confirmation.

## Route

Read only the needed reference:

- `references/intent-routing.md` - decide trigger, non-trigger, author-only, lifecycle-only, or explicit configure-validate-launch subflow.
- `references/entrypoint-discovery.md` - select and pin the installed MCP or CLI entrypoint before any operation.
- `references/adoption-flow.md` - read-only inspection plus the separate explicit missing-config authoring flow.
- `references/discovery-rules.md` - evidence and confidence rules for Node, Python, Docker Compose, Make, Just, and Taskfile.
- `references/command-flows.md` - MCP-first managed start/run/restart/stop and bounded observation.
- `references/recovery-playbooks.md` - occupied ports, conflicts, stale records, duplicate risk, and stop failures.
- `references/clean-safety.md` - digest-bound safe clean and risky/reset refusal.
- `references/eval-prompts.md` - prompt fixtures for trigger, safety, and compact-output review.

## Operating Rules

1. Pass the intent gate, then follow `entrypoint-discovery.md` exactly. Pin the first usable MCP or CLI entrypoint, its build identity, and scope for the whole request.
2. Call `capabilities.get` through that entrypoint before selecting an operation.
3. For lifecycle operations, use MCP observation before one low-risk mutation. Let the Kernel decide current scope, risk, ownership, compatibility, locks, and clean digest.
4. Use compatible CLI JSON fallback only when MCP is unavailable before dispatch or omits the required safe operation. Read-only discovery may use the bounded fallback in `entrypoint-discovery.md`; lifecycle mutation must re-check CLI capabilities and observe again before its one mutation.
5. After any mutation might have been dispatched, never fall back, switch entrypoints, or repeat it. Recover by known operation ID or one bounded `operation.list` correlation followed by get/reconcile.
6. Correct a deterministic task input at most once only when the public CLI refusal proves `effect.certainty: none`, `effect.changed: false`, and `effect.dispatch: not_dispatched`. Choose only from `availableTasks`, honoring `project.defaultTask`; otherwise ask the user instead of guessing.
7. Treat risk, ownership, scope, compatibility, lock, digest, config, and input refusals as final. Apart from the one proven non-dispatch input correction above, report them without another surface.
8. Keep adoption inspection read-only. Author one missing `.launchdeck.yml` only through the explicit authoring branch in `adoption-flow.md`; preserve every existing config. Configuration authoring alone stops after validation. Only a current request that explicitly combines missing-config authoring, validation, and launch may continue through the guarded combined-intent branch.
9. Refuse requests to execute force, risky/destructive clean, raw command/env/cwd, external termination, medium-risk, remote/production, or permanent-follow behavior without calling a lifecycle operation.
10. Use accepted Agent-facing lifecycle aliases when the user asks for the normal webpage/service flow: `up`, `status --all`, `logs <task>`, and `down`. For the Flask demo flow, logs must target `start`, not the default `dev`.
11. User-facing response should include conclusion, target, outcome, resource status/URL/port when known, evidence, and a safe next action.
12. Be precise about evidence: deterministic fixtures prove deterministic fixture behavior only. Do not claim unverified real hosts, operating systems, host versions, or extension readiness without a current matching evidence cell.
13. In a combined configure-validate-launch request, keep discovery, filesystem authoring, validation, fresh capability/observation, the single lifecycle mutation, and bounded post-start observation as separate operation/effect evidence. Validation failure, scope ambiguity, config collision, non-low risk, or unknown/possibly-dispatched effect stops the flow. Preserve a successfully written user config; never roll it back or replay a lifecycle mutation.
