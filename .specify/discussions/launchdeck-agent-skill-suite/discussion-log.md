# Discussion Log: Launchdeck Agent Skill Suite

## 2026-07-09T15:44:38+08:00 - semantic checkpoint

- User framed the next product direction: create a skill suite for agents so they can discover an arbitrary project's run/build/test/stop/log/clean lifecycle and use Launchdeck to manage it.
- Recommendation recorded: the skills should not become a parallel process manager. They should discover, model, configure, and operate through Launchdeck.
- Evidence checked: project memory, project cognition compass, README, `src/cli.js`, `src/runtime.js`, and `test/cli.test.js`.
- Key consequence: this affects lifecycle safety, port conflicts, duplicate starts, zombie process recovery, and agent automation contracts.

## 2026-07-09T15:49:50+08:00 - semantic checkpoint

- User clarified the expected UX: the user should only express intent, such as asking the agent to start or run the project. The user should not need to know or select a specific Launchdeck skill.
- Decision recorded: skill routing should be agent-internal. A hidden `launchdeck-agent` router should detect project lifecycle intent and route into discovery, adoption, operation, observation, recovery, or cleanup guidance.
- Decision recorded: first-run discovery should persist lifecycle knowledge so future runs can use existing `.launchdeck.yml`, registry, runtime state, logs, and events rather than repeating broad discovery.

## 2026-07-09T15:54:00+08:00 - semantic checkpoint

- User asked to continue using `skill-creator` methodology.
- Decision recorded: the suite should be designed with progressive disclosure: trigger-rich metadata descriptions, lean SKILL.md bodies, reference files for ecosystem-specific discovery and recovery rules, and scripts only for deterministic repeated logic.
- Decision recorded: evaluation should cover both triggering behavior and lifecycle behavior, comparing with-skill behavior against baseline agent behavior.
- Key skill-writing implication: the `description` field is a product surface because it determines whether natural user intent routes into Launchdeck.

## 2026-07-09T15:57:03+08:00 - semantic checkpoint

- Added first-pass skill contracts for `launchdeck-agent`, `launchdeck-onboard-project`, `launchdeck-operate-project`, `launchdeck-observe-project`, `launchdeck-recover-project`, and `launchdeck-clean-project`.
- Recorded frontmatter description direction for each skill, because description quality controls automatic routing.
- Recorded shared rules: Launchdeck owns execution, `.launchdeck.yml` owns lifecycle knowledge, first run discovers and records, repeat run reuses, port occupation triggers inspect rather than kill, stale state triggers reconcile, and compact JSON is preferred for agent loops.

## 2026-07-09T16:02:22+08:00 - semantic checkpoint

- Recommendation sharpened: v0 should ship as one `launchdeck-agent` skill with bundled references, not six public skills.
- Reason: the highest v0 risk is trigger accuracy from natural user intent. One router description can be tuned and evaluated more easily than six competing descriptions.
- Recorded v0 package shape: `SKILL.md` plus references for intent routing, adoption flow, discovery rules, command flows, recovery playbooks, clean safety, and eval prompts.
- Recorded script stance: avoid scripts at first unless evals prove prose discovery is unreliable; any first script should be read-only and emit candidate lifecycle facts.

## 2026-07-09T16:04:42+08:00 - semantic checkpoint

- Intent routing contract drafted for v0.
- Trigger rule recorded: Launchdeck routing should require lifecycle intent plus local project/service context.
- Strong trigger examples include starting/running the current project, running a dev server, restarting a service, diagnosing occupied ports, listing running state, stopping owned services, reading logs, and safe cache/build cleanup.
- Negative trigger examples include general port education, documentation-only work, ordinary code edits, API design, and production deployment requests.
- Router order recorded: classify lifecycle intent, identify target, determine Launchdeck adoption, route to observe/adopt/operate/recover/clean, and use compact JSON for agent loops.

## 2026-07-09T16:06:54+08:00 - semantic checkpoint

- Adoption flow contract drafted for first-run unknown projects.
- Recorded staged flow: identify root, reuse existing Launchdeck config/registry, perform read-only discovery, classify lifecycle candidates, author or repair `.launchdeck.yml`, run doctor, register, managed start, and report reusable control handles.
- Recorded candidate confidence model: `exact`, `strong`, `weak`, and `unknown`.
- Recorded adoption failure rules: stop safely for unknown commands, conflicting candidates, externally occupied ports, doctor failure, missing required secrets/services, or production-deployment requests.

## 2026-07-09T16:08:44+08:00 - semantic checkpoint

- Discovery rules contract drafted for v0.
- Recorded evidence priority: existing Launchdeck config/registry, machine-readable manifests, compose/task definitions, framework config/conventions, docs, then loose clues.
- Recorded ecosystem coverage for v0: Node, Python, Docker Compose, and Make/Just/Taskfile.
- Recorded conflict handling: evidence conflicts downgrade confidence and require proposal or confirmation rather than automatic lifecycle mutation.
- Recorded compact candidate shape: task kind, command, long-running flag, ports, confidence, evidence, and risks.

## 2026-07-09T16:20:51+08:00 - semantic checkpoint

- Command flows contract drafted for already adopted projects.
- Recorded shared rule: observe before mutate.
- Recorded idempotent start behavior: repeated start/dev/run should report an existing matching Launchdeck-managed run rather than launching a duplicate.
- Recorded restart/stop safety: restart and stop require inspect/reconcile evidence and Launchdeck ownership proof before process mutation.
- Recorded force-stop safety: only for Launchdeck-owned targets with evidence of normal stop failure or stuck process.
- Recorded logs/events preservation and safe-clean boundaries.

## 2026-07-09T16:22:37+08:00 - semantic checkpoint

- Recovery playbooks contract drafted.
- Recorded recovery posture: diagnose, prove ownership, reconcile if safe, mutate only through Launchdeck.
- Recorded port conflict classification: same Launchdeck task, other Launchdeck task, external known process, unknown process, or stale record.
- Resolved default for unverified port ownership: inspect-only, refuse automatic kill/stop, report evidence, and offer safe manual or configuration alternatives.
- Recorded stale state, stop_failed, duplicate-start risk, and missing-log recovery flows.

## 2026-07-09T16:24:22+08:00 - semantic checkpoint

- Clean safety contract drafted.
- Recorded cleanup tiers: safe clean, risky clean, and reset.
- Recorded v0 default: only safe clean may run automatically through `launchdeck clean --safe`; risky clean requires explicit confirmation; reset is out of automatic scope.
- Recorded preservation rules for `.launchdeck.yml`, Launchdeck logs/events, running runtime state, env/secrets, databases, user data, source files, and config files.
- Resolved risky clean/reset presentation: named targets with impact, explicit confirmation, and reset treated as a separate destructive request.

## 2026-07-09T16:25:31+08:00 - semantic checkpoint

- Eval prompts contract drafted for v0.
- Recorded eval groups: should-trigger prompts, should-not-trigger prompts, behavior/safety prompts, and compact-output prompts.
- Recorded behavior eval coverage: unknown adoption, existing run reuse, duplicate-start prevention, owned/external port conflicts, stale state, stop failure, safe clean, risky clean, and reset refusal.
- Recorded pass criteria: natural intent enters Launchdeck when appropriate, non-lifecycle tasks stay out, unknown/external processes are not killed, ownership proof gates stop/restart/force-stop, and agent loops prefer compact JSON.
- Resolved default eval location: `launchdeck-agent/references/eval-prompts.md` for v0, with executable fixtures deferred until prose evals reveal repeatable failure patterns.

## 2026-07-09T16:27:19+08:00 - semantic checkpoint

- Actual v0 skill package draft recorded.
- Recorded package shape: one `launchdeck-agent/SKILL.md` plus references for intent routing, adoption flow, discovery rules, command flows, recovery playbooks, clean safety, and eval prompts.
- Recorded `SKILL.md` responsibility: short router and safety contract only, with trigger-rich description as the key natural-language entry surface.
- Recorded script stance: no scripts in v0 unless evals prove a repeated need; any first scanner script must be read-only and must not mutate config, processes, files, or Launchdeck state.

## 2026-07-09T16:29:56+08:00 - lifecycle checkpoint

- User accepted continuing into handoff readiness.
- Handoff assessment completed with verdict `ready-for-specify`.
- Draft unified handoff pair created for user review: `handoff-to-specify.md` and `handoff-to-specify.json`.
- Handoff remains draft/user-review; it is not marked `handoff-ready` until user confirmation.

## 2026-07-09T16:40:46+08:00 - lifecycle checkpoint

- User confirmed the draft handoff as `handoff-ready`.
- Updated Markdown and JSON quality-gate status to `handoff-ready` with user confirmation time.
- Recorded `sp-specify` as the ready downstream consumer; `sp-quick` remains blocked because this scope requires specification first.
- Handoff remains resumable until consumed by `sp-specify`.

## 2026-07-09T16:59:13+08:00 - lifecycle checkpoint

- `sp-specify` consumed the handoff into `.specify/features/2026-07-09-launchdeck-agent-skill`.
- Local `specify` CLI did not expose a `discussion mark-consumed` command, so the equivalent consumed/completed fields were updated manually in `discussion-state.md`.
- Source discussion is no longer a live handoff-ready candidate for future routing.
