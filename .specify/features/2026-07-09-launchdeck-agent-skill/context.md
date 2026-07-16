# Planning Context: Launchdeck Agent Skill

**Feature Branch**: `2026-07-09-launchdeck-agent-skill`  
**Created**: 2026-07-09  
**Status**: Approved for planning  
**Derived From**: `spec.md`, `alignment.md`, discussion handoff, discussion sources, project cognition compass, and live repository evidence

## Planning Context

- Planning boundary: create a project-local skill package, not a CLI/runtime change.
- Mainline next command after planning: `/sp.tasks`.
- The package must preserve Launchdeck as the execution authority and `.launchdeck.yml` as the lifecycle authority.
- The root skill should be a trigger-rich router; detailed subflows belong in references.
- No source code, tests, runtime state, package dependencies, or CLI behavior are in scope for this specification pass.

## Relevant Repository Context

- `package.json` defines Launchdeck as a Node.js ESM CLI with `bin.launchdeck = ./src/cli.js`.
- `README.md` describes Launchdeck as a user-scoped control plane for local project services with registry, logs, events, live OS inspection, safe clean, and compact JSON.
- `src/cli.js` help exposes `doctor`, `tasks`, `project add`, `project scan`, `status --all`, `conflicts`, lifecycle run/start/restart/stop/force-stop, `ps`, `ports`, `inspect`, `logs`, `events`, `reconcile`, and `clean`, all with JSON/compact support where applicable.
- Existing local skills live under `.codex/skills/<skill>/SKILL.md` with optional `references/` folders. No `.agents/skills` folder or required `agents/openai.yaml` file was found.

## Existing Patterns And Reuse Notes

- Skill packages in this repository are plain directories under `.codex/skills/`.
- Existing workflow skills use `SKILL.md` plus `references/` for progressive disclosure.
- `README.md` already positions `--json --compact` as the low-token agent/script surface.
- Tests already prove compact envelopes preserve key process-control fields and concise next actions.
- Global runtime tests already prove cross-project registry visibility, declared port inspection, external port detection, and duplicate-start idempotency.
- Clean safety tests already prove dry-run behavior, safe-only removal, risky confirmation, and refusal of unsafe targets.

## Integration Boundaries

- User intent enters through the skill description and root `SKILL.md`.
- The skill may instruct agents to run Launchdeck commands; it must not directly own OS process management.
- The skill writes or proposes `.launchdeck.yml` only under evidence rules.
- The Launchdeck registry and run index provide cross-agent visibility.
- Logs and events are diagnostic evidence and must not be discarded by recovery or safe clean guidance.
- Skill eval prompts validate agent behavior, not the Launchdeck CLI implementation itself.

## Product Boundary Constraints

- V0 focuses on local filesystem projects.
- V0 discovery coverage is Node, Python, Docker Compose, and Make/Just/Taskfile.
- Monorepo-first behavior is deferred.
- Scripts are deferred unless evals show repeated prose discovery failure.
- Metadata beyond `SKILL.md` is conditional, not required by current local evidence.

## Affected Object Map

| Obligation ID | Object / State Surface | Owner | Consumers | Evidence | Coverage Gap |
| --- | --- | --- | --- | --- | --- |
| CA-AS-001 | `.agents/skills/launchdeck-agent/SKILL.md` | skill package | coding agents | handoff, skill convention reads | none |
| CA-AS-002 | `references/adoption-flow.md` and `references/discovery-rules.md` | skill package | unknown-project adoption | requirements, discussion log | exact prose details planned downstream |
| CA-AS-003 | `references/command-flows.md` | skill package | stop/restart/force-stop flows | README, CLI help, tests | none |
| CA-AS-004 | Launchdeck registry and run index | Launchdeck CLI | repeat-run and cross-agent behavior | README, global runtime tests | none |
| CA-AS-005 | JSON/compact output guidance | Launchdeck CLI and skill package | agent loops | README, cli contract tests | none |
| CA-AS-006 | Reference boundaries | skill package | subflow loading | handoff and skill-creator methodology | none |
| CA-AS-007 | `references/clean-safety.md` | skill package | cleanup flows | README, clean tests | none |
| CA-AS-008 | `.launchdeck.yml` adoption model | Launchdeck CLI and skill package | project lifecycle authority | README, requirements | monorepo deferred |
| CA-AS-009 | skill frontmatter description | skill package | natural intent routing | handoff, requirements | eval tuning remains downstream |
| CA-AS-010 | persisted config/registry/runtime evidence | Launchdeck CLI | later agents and terminals | README, global runtime tests | none |

## Consequence Notes

- `CA-AS-001`: Direct process mutation outside Launchdeck would break the core safety model; implementation must forbid raw kill/start shortcuts.
- `CA-AS-003`: Stop/restart/force-stop wording must include ownership proof and should use Launchdeck commands only.
- `CA-AS-004`: Duplicate-start prevention depends on inspect/status/ports before mutation and existing-run reporting.
- `CA-AS-007`: Clean guidance must keep safe clean, risky clean, and reset separate.

## Dependency Impact Table

| Obligation ID | Upstream / Downstream Surface | Impact | Required Handling |
| --- | --- | --- | --- |
| CA-AS-001 | Launchdeck CLI -> skill package | Skill semantics depend on CLI safety model. | Reference Launchdeck commands; do not bypass them. |
| CA-AS-002 | Manifests/task files -> adoption flow | Discovery evidence changes config authoring safety. | Use confidence labels and proposal fallback. |
| CA-AS-003 | Runtime ownership proof -> command flows | Stop/restart safety depends on owner evidence. | Require inspect/reconcile before mutation. |
| CA-AS-005 | Compact JSON -> agent context budget | Verbose output can exceed agent context. | Prefer `--json --compact` internally and summarize to user. |
| CA-AS-009 | Skill description -> trigger routing | Bad description causes missed or false triggers. | Include trigger-rich English/Chinese examples and eval prompts. |

## Change Propagation Matrix

| Change Surface | Upstream Inputs | Downstream Consumers | Constraint / Risk |
| --- | --- | --- | --- |
| `SKILL.md` description | natural intent examples | skill auto-routing | Too broad triggers non-lifecycle tasks; too narrow misses user intent. |
| `adoption-flow.md` | discovery confidence | `.launchdeck.yml` creation | Weak evidence must not become automatic config mutation. |
| `command-flows.md` | Launchdeck CLI surface | lifecycle operations | Must stay aligned with real command names and safety flags. |
| `recovery-playbooks.md` | port/ownership inspection | conflict handling | Unknown/external owners stay inspect-only. |
| `clean-safety.md` | clean target model | cleanup behavior | Clean must not imply stop or reset. |
| `eval-prompts.md` | user prompt examples | acceptance proof | Evals must test behavior, not just trigger selection. |

## Locked Decisions Carry-Forward

- One router skill with bundled references.
- Users express natural intent; skill routing is internal.
- Launchdeck is execution authority.
- `.launchdeck.yml` is lifecycle authority.
- Observe before mutate.
- Ownership proof before stop/restart/force-stop.
- Inspect-only for unknown/external processes.
- Safe clean only by default.
- Compact JSON for agent loops.

## Discussion Decision Carry-Forward

- **Locked Direction**: One `launchdeck-agent` router skill plus references; planning must not split v0 into six public skills.
- **Rejected Alternatives**: GUI/MCP-first, direct OS process killing, clean-as-reset, automatic destructive cleanup.
- **Accepted Tradeoffs**: Conservative weak-confidence discovery, internal references before public subskills, scripts deferred until eval evidence.
- **Experience Commitments**: User asks naturally; agent responds with conclusion, evidence, and safe next action.
- **Review Criteria Carry-Forward**: Preserve safety rules, target path, Must-Preserve ledger, and CA obligations.
- **Must Not Dilute**: Do not convert managed lifecycle operations into docs-only guidance or raw shell commands.

## Must-Preserve Carry-Forward

- `MP-001`: v0 `launchdeck-agent` skill package is the central target.
- `MP-002`: one router skill with references.
- `MP-003`: natural user intent, internal routing.
- `MP-004`: Launchdeck-only execution authority.
- `MP-005`: `.launchdeck.yml` and persisted registry/runtime state.
- `MP-006`: observe before mutate.
- `MP-007`: ownership proof for stop/restart/force-stop.
- `MP-008`: unknown/external processes are inspect-only.
- `MP-009`: safe clean/risky clean/reset separation.
- `MP-010`: compact JSON posture.
- `MP-011`: v0 ecosystem discovery coverage.
- `MP-012`: scripts deferred.
- `MP-013`: eval prompt coverage.
- `MP-014`: target package path resolved to `.agents/skills/launchdeck-agent/`; metadata conditional.

Stop-and-reopen conditions:

- Reopen if implementation cannot place a skill package under `.agents/skills/launchdeck-agent/`.
- Reopen if a required Launchdeck command is missing.
- Reopen if eval design cannot verify duplicate-start and unsafe-kill prevention.
- Reopen if user changes the target from skill package to GUI, MCP, product installer, or CLI behavior change.

## Canonical References

- `.specify/discussions/launchdeck-agent-skill-suite/handoff-to-specify.md`
- `.specify/discussions/launchdeck-agent-skill-suite/handoff-to-specify.json`
- `.specify/discussions/launchdeck-agent-skill-suite/requirements.md`
- `.specify/discussions/launchdeck-agent-skill-suite/technical-options.md`
- `.specify/discussions/launchdeck-agent-skill-suite/project-context.md`
- `.specify/discussions/launchdeck-agent-skill-suite/open-questions.md`
- `.specify/discussions/launchdeck-agent-skill-suite/discussion-log.md`
- `README.md`
- `src/cli.js`
- `test/cli-contract.test.js`
- `test/cli-control-plane-contract.test.js`
- `test/global-runtime.test.js`
- `test/clean-safety.test.js`

## Deferred / Future Ideas

- Scanner script that emits candidate lifecycle facts only.
- Executable fixtures for eval automation.
- Multiple public subskills after v0 trigger quality is proven.
- Monorepo app selection and multi-app registry guidance.
