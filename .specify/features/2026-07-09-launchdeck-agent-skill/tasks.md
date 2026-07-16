# Tasks: Launchdeck Agent Skill

**Input**: Design documents from `.specify/features/2026-07-09-launchdeck-agent-skill/`  
**Prerequisites**: `plan.md`, `spec.md`, `alignment.md`, `context.md`, `research.md`, `quickstart.md`, `plan-contract.json`

**Tests**: No new Node runtime tests are planned because this feature is a Markdown skill package and does not change CLI behavior. Replacement validation is static artifact review, command-name checks against `node src/cli.js --help`, safety-wording scans, and prompt/eval review from `quickstart.md`.

**Organization**: Tasks are grouped by setup plus five user-story-shaped behavior slices. Delivery shape is serial setup, parallel reference-writing batch, then serial eval/integration validation.

## Planning Inputs

- **Locked decisions**: one `launchdeck-agent` router skill; natural intent routes internally; Launchdeck is execution authority; `.launchdeck.yml` is lifecycle authority; observe before mutate; ownership proof before stop/restart/force-stop; unknown/external process is inspect-only; clean/risky/reset stay separate; compact JSON for agent loops.
- **Implementation constitution**: write only `.agents/skills/launchdeck-agent/**`; do not edit `src/`, `test/`, `package.json`, runtime behavior, dependencies, or demo services for this feature.
- **Active profile**: Standard Delivery with Lifecycle Safety Constraints.
- **Reference fidelity**: behavior-level preservation only: natural request -> Launchdeck route; unknown project -> adoption; repeat start -> existing run; occupied port -> inspect/reconcile; stop/restart -> ownership proof; clean -> safe/risky/reset split.
- **Alignment risks**: root skill may overtrigger near misses; prose discovery may be inconsistent; metadata beyond `SKILL.md` is unproven.
- **Validation references**: `quickstart.md`, `README.md`, `src/cli.js` help output, `test/global-runtime.test.js`, `test/clean-safety.test.js`, `test/cli-control-plane-contract.test.js`.
- **Must-preserve IDs**: MP-001 through MP-014 from `spec.md` and `plan-contract.json`.
- **No-new-test rationale**: behavior is delivered as agent instructions and prompt fixtures; CLI correctness is already covered by existing tests referenced in `research.md`. Residual risk is prompt interpretation variance, mitigated by `eval-prompts.md` and the final integration task.

## Implementation Target Boundary

- **Target root**: `F:/github/launchdeck`
- **Target-relative paths**:
  - `.agents/skills/launchdeck-agent/SKILL.md`
  - `.agents/skills/launchdeck-agent/references/intent-routing.md`
  - `.agents/skills/launchdeck-agent/references/adoption-flow.md`
  - `.agents/skills/launchdeck-agent/references/discovery-rules.md`
  - `.agents/skills/launchdeck-agent/references/command-flows.md`
  - `.agents/skills/launchdeck-agent/references/recovery-playbooks.md`
  - `.agents/skills/launchdeck-agent/references/clean-safety.md`
  - `.agents/skills/launchdeck-agent/references/eval-prompts.md`
- **Evidence status**: verified by `.codex/skills/` convention, no `.agents/skills`, no required `agents/openai.yaml`, and live CLI help.
- **Boundary constraints**: planning/task artifacts are authoritative; repository paths outside `launchdeck/` are excluded by the git-root learning.
- **Reference-only paths**: `README.md`, `src/cli.js`, tests, and `.planning/quick/2026-07-08-global-runtime-supervisor/STATUS.md` are evidence only, not implementation write targets.

## Task Guardrail Index

| Guardrail | Applies To | Source |
| --- | --- | --- |
| G-BOUNDARY: write only `.agents/skills/launchdeck-agent/**` during implementation | T001-T008 | plan.md#Implementation-Constitution |
| G-NO-RUNTIME: do not edit `src/`, `test/`, `package.json`, dependencies, runtime state, or demo services | T001-T008 | plan.md#Forbidden-Implementation-Drift |
| G-LAUNCHDECK-AUTHORITY: all lifecycle mutation guidance goes through Launchdeck commands | T001, T004, T005, T008; MP-004, CA-AS-001 | spec.md, plan.md |
| G-OBSERVE-FIRST: status/ps/ports/inspect/reconcile before mutation | T002-T005, T007-T008; MP-006, CA-AS-004 | spec.md#Requirements |
| G-OWNERSHIP: stop/restart/force-stop require Launchdeck ownership proof | T004-T005, T007-T008; MP-007, CA-AS-003 | spec.md#Requirements |
| G-UNKNOWN-INSPECT: unknown/external processes remain inspect-only | T005, T007-T008; MP-008, CA-AS-003 | spec.md#Requirements |
| G-CLEAN-SPLIT: safe clean, risky clean, and reset are separate | T006-T008; MP-009, CA-AS-007 | spec.md#Requirements |
| G-COMPACT: agent-internal examples prefer `--json --compact`; users get concise summaries | T001, T004-T008; MP-010, CA-AS-005 | quickstart.md#9 |
| G-PROGRESSIVE: `SKILL.md` stays short; references own detailed subflows | T001-T008; MP-002, CA-AS-006 | skill-creator guidance |
| G-NO-SCANNER: no scanner scripts in v0 unless user reconfirms after eval evidence | T003, T008; MP-012 | plan-contract.json |

## Capability Operation Coverage

| Operation | Upstream Source | Selected Entry Point | Task IDs / Packet Fields | Validation | Degradation Check |
| --- | --- | --- | --- | --- | --- |
| Route local lifecycle intent | FR-003 to FR-006 | `SKILL.md` + `intent-routing.md` | T001, T002, T007, T008 | trigger and non-trigger evals | Not reduced to docs-only; root description is actual skill trigger surface |
| Adopt unknown project | FR-007 to FR-014 | `adoption-flow.md` + `discovery-rules.md` | T003, T007, T008 | adoption eval prompts | Weak/conflicting evidence stays proposal/confirmation-gated |
| Start/run/restart/stop/force-stop/logs/events | FR-017 to FR-021 | `command-flows.md` | T004, T007, T008 | command-flow eval prompts | No raw shell backgrounding or raw kill |
| Recover port/stale/ownership conflicts | FR-022 to FR-025 | `recovery-playbooks.md` | T005, T007, T008 | recovery eval prompts | Unknown/external owners stay inspect-only |
| Clean safely | FR-026 to FR-028 | `clean-safety.md` | T006, T007, T008 | clean eval prompts | Clean does not become reset |
| Validate behavior | FR-029 to FR-030, SC-001 to SC-005 | `eval-prompts.md` | T007, T008 | prompt catalog and quickstart checks | Evals test behavior, not wording only |

## User-Observable Path Coverage

| Feature / Surface | Real Entry Point | Producer Data | Transformer / State Builder | Consumer Surface | Executor / Boundary | Task IDs / Packet Fields | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Skill auto-routing | Skill metadata `description` | natural user prompt | `SKILL.md` router | coding agent skill selection | local skill loader | T001, T002, T007, T008 | should-trigger and should-not-trigger prompts |
| Unknown project adoption | user lifecycle prompt | manifests, task files, existing `.launchdeck.yml` | adoption/discovery references | agent proposed or written lifecycle model | Launchdeck CLI | T003, T007, T008 | adoption eval and quickstart step 5 |
| Managed operation | user start/restart/stop/log request | Launchdeck registry/runtime/logs/events | command-flows reference | agent summary and safe next actions | Launchdeck CLI | T004, T007, T008 | command eval and command-name validation |
| Recovery | occupied port/stale state prompt | Launchdeck ports/conflicts/inspect/reconcile | recovery playbook | refusal or safe recovery plan | Launchdeck CLI | T005, T007, T008 | recovery eval and raw-kill scan |
| Clean | clean/cache/reset prompt | Launchdeck clean config and runtime evidence | clean-safety reference | safe clean or confirmation/refusal | Launchdeck CLI | T006, T007, T008 | clean eval and quickstart step 8 |

## Reference Fidelity Mapping

- Natural request -> Launchdeck route: T001, T002, T007, T008.
- Unknown project -> read-only discovery -> config proposal/write -> doctor -> registry add -> managed start: T003, T007, T008.
- Repeat start -> existing run: T004, T007, T008.
- Occupied port -> inspect/reconcile, no unmanaged kill: T005, T007, T008.
- Stop/restart/force-stop -> ownership proof: T004, T005, T007, T008.
- Clean -> safe by default, risky confirmed, reset declined: T006, T007, T008.

## Consequence Obligation Mapping

| Obligation ID | Task IDs | Affected State / Dependency | Required References | Validation | Stop And Reopen |
| --- | --- | --- | --- | --- | --- |
| CA-AS-001 | T001, T004, T005, T008 | all lifecycle mutation guidance | plan.md, README.md, src/cli.js help | final raw-process-command scan | A reference bypasses Launchdeck for lifecycle mutation |
| CA-AS-002 | T003, T007, T008 | unknown project adoption | spec.md, research.md, quickstart.md | adoption eval prompts | Adoption mutates config before confidence classification |
| CA-AS-003 | T004, T005, T007, T008 | stop/restart/force-stop | README.md, runtime ownership evidence | ownership eval prompts | Stop/restart/force-stop lacks ownership proof |
| CA-AS-004 | T004, T005, T007, T008 | start/dev/run and port conflicts | global-runtime status, README.md | duplicate-start eval prompts | Start/dev/run can duplicate a matching managed run |
| CA-AS-005 | T001, T004, T007, T008 | agent compact output loop | quickstart.md, cli contract tests | compact-output eval prompts | Agent loop guidance ignores compact JSON |
| CA-AS-006 | T001-T008 | reference boundaries | skill-creator, plan.md | root skill length and route review | Reference boundaries blur safety posture |
| CA-AS-007 | T006-T008 | clean/reset states | README.md, clean tests | clean eval prompts | Clean becomes risky clean/reset by default |
| CA-AS-008 | T003, T007, T008 | ecosystem discovery | spec.md, research.md | discovery eval prompts | Discovery ignores `.launchdeck.yml` or v0 ecosystem files |
| CA-AS-009 | T001, T002, T007, T008 | natural trigger state | SKILL.md, intent-routing.md | trigger eval prompts | Users must explicitly name Launchdeck or the skill |
| CA-AS-010 | T003-T005, T007-T008 | repeat-run persisted evidence | README.md, global runtime status | repeat-run eval prompts | Repeat-run ignores config, registry, runtime, logs, or events |

## Analyze Remediation Mapping

No prior analyze blockers for this task package.

| Finding ID | Disposition | Task/Section Evidence | Notes |
|------------|-------------|-----------------------|-------|
| No prior analyze blockers | not_applicable | First task-generation pass | No remediation mapping required |

## Phase 1: Setup And Root Router

**Purpose**: Create the actual skill entry point and freeze the route/safety contract before reference files are written.

- [X] T001 Create `.agents/skills/launchdeck-agent/SKILL.md` with frontmatter, short router body, reference route table, and global safety rules

### T001 Details

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | none |
| parallel_safe | false |
| write_scope | `.agents/skills/launchdeck-agent/SKILL.md` |
| read_scope | `spec.md`, `plan.md`, `research.md`, `quickstart.md`, `.codex/skills/skill-creator/SKILL.md`, `README.md`, `src/cli.js` help output |
| forbidden | `src/**`, `test/**`, `package.json`, `.env`, credential files, runtime state, dependency manifests |
| expected_outputs | `.agents/skills/launchdeck-agent/SKILL.md`（新建） |
| anti_goals | Do not make a long monolithic skill; do not add scripts or dependencies; do not implement lifecycle behavior outside Launchdeck. Does-not-remove: preserve natural intent routing via `SKILL.md` and references. |
| does_not_remove | MP-001 through MP-014; CA-AS-001, CA-AS-006, CA-AS-009 |
| capability_operations | implements `route local lifecycle intent`; preserves all lifecycle operations through references |
| consumer_surfaces | local skill metadata and root skill body |
| required_evidence | frontmatter evidence, progressive-disclosure evidence, real_entrypoint_evidence |
| retry_max | 2 |
| escalation | debugger |

**Context Navigation**

| Need | Find it at |
| --- | --- |
| Target path and file list | `plan.md#Implementation-Target-Boundary` |
| Root skill shape | `plan.md#Implementation-Constitution` |
| Trigger and non-trigger requirements | `spec.md#Requirements` |
| Data model / contracts status | `plan.md#Project-Structure` |
| Reference implementation | `.codex/skills/skill-creator/SKILL.md` |

**Acceptance Criteria**

- Frontmatter includes `name: "launchdeck-agent"` or `name: launchdeck-agent`.
- Description includes English and Chinese local lifecycle triggers and near-miss exclusions.
- Body is a short router, not a full monolithic guide.
- Body states Launchdeck is execution authority and raw PID/port killing is not allowed.
- Body routes to every required reference file.

**Verify Commands**

```powershell
Test-Path .agents\skills\launchdeck-agent\SKILL.md
Select-String -Path .agents\skills\launchdeck-agent\SKILL.md -Pattern 'launchdeck-agent|启动|端口|start|restart|stop|clean'
```

**Handoff Format**: status, changed_files, validation_output, concerns, recovery_hints.

**Checkpoint 1**: Root route contract exists. Reference tasks may begin after T001.

## Phase 2: Parallel Reference Writing

**Purpose**: Write independent subflows with non-overlapping files. These tasks are parallel-safe after T001.

**Parallel Batch 2.1**: T002, T003, T004, T005, and T006 may run together because their write scopes do not overlap.

- [X] T002 [P] [US1] Create `.agents/skills/launchdeck-agent/references/intent-routing.md` for trigger, non-trigger, and subflow selection rules
- [X] T003 [P] [US1] Create `.agents/skills/launchdeck-agent/references/adoption-flow.md` and `.agents/skills/launchdeck-agent/references/discovery-rules.md` for unknown-project adoption
- [X] T004 [P] [US2] Create `.agents/skills/launchdeck-agent/references/command-flows.md` for managed start, repeat start, restart, stop, force-stop, logs, and events
- [X] T005 [P] [US3] Create `.agents/skills/launchdeck-agent/references/recovery-playbooks.md` for ports, conflicts, stale state, ownership refusal, and stop failures
- [X] T006 [P] [US4] Create `.agents/skills/launchdeck-agent/references/clean-safety.md` for safe clean, risky clean, and reset refusal

### T002 Details

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T001: root skill route contract |
| parallel_safe | true |
| write_scope | `.agents/skills/launchdeck-agent/references/intent-routing.md` |
| read_scope | `spec.md`, `alignment.md`, `plan.md`, `quickstart.md` |
| forbidden | `src/**`, `test/**`, `.env`, credential files, other reference files |
| expected_outputs | `.agents/skills/launchdeck-agent/references/intent-routing.md`（新建） |
| anti_goals | Do not route ordinary code edits, docs-only work, general explanations, or production deployment unless local lifecycle operation is requested. Does-not-remove: preserve natural local lifecycle trigger operation. |
| does_not_remove | MP-003, MP-014, CA-AS-009 |
| capability_operations | implements trigger and subflow selection; does not own command execution |
| consumer_surfaces | skill routing reference loaded by `SKILL.md` |
| required_evidence | trigger coverage, non-trigger coverage, real_entrypoint_evidence |
| retry_max | 2 |
| escalation | debugger |

**Context Navigation**

| Need | Find it at |
| --- | --- |
| Natural intent requirements | `spec.md#Functional-Requirements` |
| Semantic term decisions | `alignment.md#Semantic-Term-Decisions` |
| Active profile constraints | `plan.md#Scenario-Profile-Inputs` |
| Data model / contracts status | `plan.md#Project-Structure` |

**Acceptance Criteria**

- Includes should-trigger local lifecycle categories in English and Chinese.
- Includes should-not-trigger near misses.
- Requires local project/service context before Launchdeck routing.
- Routes onboarding, operation, observation, recovery, and clean to the correct reference files.

**Verify Commands**

```powershell
Test-Path .agents\skills\launchdeck-agent\references\intent-routing.md
Select-String -Path .agents\skills\launchdeck-agent\references\intent-routing.md -Pattern 'should-trigger|should not|启动|端口|local project|reference'
```

### T003 Details

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T001: root skill route contract |
| parallel_safe | true |
| write_scope | `.agents/skills/launchdeck-agent/references/adoption-flow.md`, `.agents/skills/launchdeck-agent/references/discovery-rules.md` |
| read_scope | `spec.md`, `plan.md`, `research.md`, `README.md` |
| forbidden | `src/**`, `test/**`, `.launchdeck/**`, `.env`, credential files, scanner scripts |
| expected_outputs | `adoption-flow.md`（新建）, `discovery-rules.md`（新建） |
| anti_goals | Do not run long-lived commands before adoption; do not create scanner scripts; do not mutate config from weak/conflicting evidence. Does-not-remove: preserve adoption via evidence-gated `.launchdeck.yml` flow. |
| does_not_remove | MP-005, MP-006, MP-011, MP-012, CA-AS-002, CA-AS-008 |
| capability_operations | implements unknown-project adoption and discovery confidence classification |
| consumer_surfaces | adoption and discovery references loaded by `SKILL.md` |
| required_evidence | confidence-rule evidence, ecosystem coverage evidence |
| retry_max | 2 |
| escalation | debugger |

**Context Navigation**

| Need | Find it at |
| --- | --- |
| Adoption requirements | `spec.md#Primary-Scenario---Unknown-Project-Adoption-And-Start` |
| Discovery decision | `research.md#Discovery-Method` |
| Project structure | `plan.md#Project-Structure` |
| Data model / contracts status | `plan.md#Project-Structure` |

**Acceptance Criteria**

- Reuses existing `.launchdeck.yml` and registry state before inference.
- Defines exact/strong/weak/unknown confidence labels.
- Covers Node, Python, Docker Compose, Make, Just, and Taskfile evidence.
- Requires `launchdeck doctor` before managed execution.
- Requires `project add` after valid lifecycle model exists.

**Verify Commands**

```powershell
Test-Path .agents\skills\launchdeck-agent\references\adoption-flow.md
Test-Path .agents\skills\launchdeck-agent\references\discovery-rules.md
Select-String -Path .agents\skills\launchdeck-agent\references\*.md -Pattern 'exact|strong|weak|unknown|package.json|pyproject.toml|docker-compose|Makefile|justfile|Taskfile|doctor|project add'
```

### T004 Details

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T001: root skill route contract |
| parallel_safe | true |
| write_scope | `.agents/skills/launchdeck-agent/references/command-flows.md` |
| read_scope | `spec.md`, `plan.md`, `README.md`, `src/cli.js` help output, `test/global-runtime.test.js` |
| forbidden | `src/**`, `test/**`, `.env`, credential files, raw process recipes |
| expected_outputs | `.agents/skills/launchdeck-agent/references/command-flows.md`（新建） |
| anti_goals | Do not instruct agents to background services directly or kill/restart through OS commands. Does-not-remove: preserve Launchdeck-owned lifecycle operation. |
| does_not_remove | MP-004, MP-006, MP-007, MP-010, CA-AS-001, CA-AS-003, CA-AS-004, CA-AS-005, CA-AS-010 |
| capability_operations | implements managed start, repeat start, restart, stop, force-stop, logs, and events guidance |
| consumer_surfaces | command flow reference loaded by `SKILL.md` |
| required_evidence | command-name evidence, compact-output evidence, ownership evidence |
| retry_max | 2 |
| escalation | debugger |

**Context Navigation**

| Need | Find it at |
| --- | --- |
| Command flow requirements | `spec.md#Secondary-Scenario---Stop-Restart-And-Force-Stop-Stay-Ownership-Gated` |
| CLI surface | `README.md#Command-reference` and `src/cli.js` help |
| Ownership consequence design | `plan.md#Operational-Consequence-Design` |
| Data model / contracts status | `plan.md#Project-Structure` |

**Acceptance Criteria**

- Start/dev/run observes state and declared ports before mutation.
- Repeat start reports existing managed run when matched.
- Restart/stop/force-stop require Launchdeck ownership proof.
- Logs/events are evidence, not cleanup targets.
- Internal command examples use `--json --compact` where supported.

**Verify Commands**

```powershell
Test-Path .agents\skills\launchdeck-agent\references\command-flows.md
Select-String -Path .agents\skills\launchdeck-agent\references\command-flows.md -Pattern 'status --all|ps --all|ports|inspect|start|restart|stop|force-stop|logs|events|--json --compact|ownership'
```

### T005 Details

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T001: root skill route contract |
| parallel_safe | true |
| write_scope | `.agents/skills/launchdeck-agent/references/recovery-playbooks.md` |
| read_scope | `spec.md`, `plan.md`, `README.md`, `src/runtime.js`, `test/global-runtime.test.js` |
| forbidden | `src/**`, `test/**`, `.env`, credential files, raw kill commands |
| expected_outputs | `.agents/skills/launchdeck-agent/references/recovery-playbooks.md`（新建） |
| anti_goals | Do not provide direct OS process-kill instructions for unknown or external owners. Does-not-remove: preserve inspect-only recovery for unknown/external processes. |
| does_not_remove | MP-006, MP-007, MP-008, CA-AS-001, CA-AS-003, CA-AS-004, CA-AS-010 |
| capability_operations | implements port conflict, stale state, ownership refusal, duplicate-risk, and stop-failure recovery |
| consumer_surfaces | recovery reference loaded by `SKILL.md` |
| required_evidence | ownership-classification evidence, recovery path evidence |
| retry_max | 2 |
| escalation | debugger |

**Context Navigation**

| Need | Find it at |
| --- | --- |
| Recovery requirements | `spec.md#Secondary-Scenario---Port-Conflict-Is-Inspect-Only-Without-Ownership` |
| Ownership facts | `src/runtime.js` and `README.md#Safety-model` |
| Stop-and-reopen conditions | `plan-contract.json#ca_obligations` |
| Data model / contracts status | `plan.md#Project-Structure` |

**Acceptance Criteria**

- Classifies same task, other Launchdeck task, external known process, unknown process, and stale record.
- Routes stale state through `launchdeck reconcile`.
- Unknown/external occupants produce safe options, not automatic stop/kill.
- Stop failure uses inspect/logs/events evidence.

**Verify Commands**

```powershell
Test-Path .agents\skills\launchdeck-agent\references\recovery-playbooks.md
Select-String -Path .agents\skills\launchdeck-agent\references\recovery-playbooks.md -Pattern 'same task|other Launchdeck|external|unknown|stale|reconcile|inspect|ownership|stop failed'
```

### T006 Details

| Field | Value |
| --- | --- |
| agent | executor |
| depends_on | T001: root skill route contract |
| parallel_safe | true |
| write_scope | `.agents/skills/launchdeck-agent/references/clean-safety.md` |
| read_scope | `spec.md`, `plan.md`, `README.md`, `test/clean-safety.test.js` |
| forbidden | `src/**`, `test/**`, `.env`, credential files, runtime state deletion recipes |
| expected_outputs | `.agents/skills/launchdeck-agent/references/clean-safety.md`（新建） |
| anti_goals | Do not make clean imply stop, registry removal, dependency deletion, volume deletion, or reset. Does-not-remove: preserve safe-clean-by-default operation. |
| does_not_remove | MP-009, CA-AS-007 |
| capability_operations | implements safe clean, risky clean confirmation, and reset refusal guidance |
| consumer_surfaces | clean safety reference loaded by `SKILL.md` |
| required_evidence | clean classification evidence, destructive-action refusal evidence |
| retry_max | 2 |
| escalation | debugger |

**Context Navigation**

| Need | Find it at |
| --- | --- |
| Clean requirements | `spec.md#Secondary-Scenario---Safe-Clean-Does-Not-Become-Reset` |
| Clean safety evidence | `README.md#Safety-model`, `test/clean-safety.test.js` |
| Clean consequence design | `plan.md#Operational-Consequence-Design` |
| Data model / contracts status | `plan.md#Project-Structure` |

**Acceptance Criteria**

- Separates safe clean, risky clean, and reset.
- States clean does not stop services.
- Preserves logs/events/runtime evidence required for diagnosis.
- Requires explicit confirmation for risky clean targets.
- Declines reset as a separate destructive request.

**Verify Commands**

```powershell
Test-Path .agents\skills\launchdeck-agent\references\clean-safety.md
Select-String -Path .agents\skills\launchdeck-agent\references\clean-safety.md -Pattern 'clean --safe|risky|reset|confirmation|logs|events|does not stop'
```

**Join Point 2.1**: All reference subflows exist and can be routed from `SKILL.md`.

Join Point Validation:

```powershell
$files = @(
  '.agents/skills/launchdeck-agent/references/intent-routing.md',
  '.agents/skills/launchdeck-agent/references/adoption-flow.md',
  '.agents/skills/launchdeck-agent/references/discovery-rules.md',
  '.agents/skills/launchdeck-agent/references/command-flows.md',
  '.agents/skills/launchdeck-agent/references/recovery-playbooks.md',
  '.agents/skills/launchdeck-agent/references/clean-safety.md'
)
foreach ($file in $files) { if (!(Test-Path $file)) { throw "Missing $file" } }
```

## Phase 3: Eval Prompt Coverage

**Purpose**: Prove routing and safety behavior through prompt fixtures before final integration.

- [X] T007 [US5] Create `.agents/skills/launchdeck-agent/references/eval-prompts.md` with should-trigger, should-not-trigger, behavior/safety, and compact-output cases

### T007 Details

| Field | Value |
| --- | --- |
| agent | test-engineer |
| depends_on | T002: routing; T003: adoption/discovery; T004: command flows; T005: recovery; T006: clean safety |
| parallel_safe | false |
| write_scope | `.agents/skills/launchdeck-agent/references/eval-prompts.md` |
| read_scope | `spec.md`, `quickstart.md`, all generated skill references |
| forbidden | `src/**`, `test/**`, `.env`, credential files, executable eval fixtures |
| expected_outputs | `.agents/skills/launchdeck-agent/references/eval-prompts.md`（新建） |
| anti_goals | Do not add executable eval scripts or benchmark harnesses in v0. Does-not-remove: preserve behavior eval coverage through prompt fixtures. |
| does_not_remove | MP-013, SC-001, SC-002, SC-003, SC-004, SC-005 |
| capability_operations | validates trigger routing, non-trigger rejection, safety behavior, and compact output posture |
| consumer_surfaces | eval prompt reference loaded by reviewers and future skill-creator loop |
| required_evidence | trigger_evidence, behavior_safety_evidence, compact_output_evidence |
| retry_max | 2 |
| escalation | debugger |

**Context Navigation**

| Need | Find it at |
| --- | --- |
| Success criteria | `spec.md#Measurable-Success-Criteria` |
| Quickstart scenarios | `quickstart.md#3-Simulate-Should-Trigger-Prompts` through `quickstart.md#9-Validate-Compact-Output-Posture` |
| Existing reference behavior | `.agents/skills/launchdeck-agent/references/*.md` |
| Data model / contracts status | `plan.md#Project-Structure` |

**Acceptance Criteria**

- At least 8 should-trigger prompts, including English and Chinese.
- At least 6 should-not-trigger prompts.
- Behavior/safety prompts cover adoption, repeat start, duplicate prevention, conflicts, external/unknown owners, stale state, stop failure, safe clean, risky clean, and reset refusal.
- Compact-output prompts verify `--json --compact` and concise user summaries.
- No expected behavior authorizes raw OS process kill for unknown/external owners.

**Verify Commands**

```powershell
Test-Path .agents\skills\launchdeck-agent\references\eval-prompts.md
Select-String -Path .agents\skills\launchdeck-agent\references\eval-prompts.md -Pattern 'should-trigger|should-not-trigger|behavior|compact|unknown|external|reset|启动'
```

## Phase 4: Integration And Validation

**Purpose**: Join all files, repair inconsistencies, and prove the package is ready for `$sp-implement` completion review.

- [X] T008 Integrate and validate `.agents/skills/launchdeck-agent/**` against `quickstart.md`, command help, safety scans, and all acceptance criteria

### T008 Details

| Field | Value |
| --- | --- |
| agent | quality-reviewer |
| depends_on | T001 through T007 |
| parallel_safe | false |
| write_scope | `.agents/skills/launchdeck-agent/SKILL.md`, `.agents/skills/launchdeck-agent/references/*.md` |
| read_scope | `spec.md`, `plan.md`, `research.md`, `quickstart.md`, `README.md`, `src/cli.js` help output |
| forbidden | `src/**`, `test/**`, `package.json`, `.env`, credential files, runtime state, generated dependency directories |
| expected_outputs | `.agents/skills/launchdeck-agent/**`（修改如需修正一致性） |
| anti_goals | Do not expand scope into CLI/runtime changes, metadata unless evidence requires it, scanners, public subskills, MCP, GUI, or executable eval fixtures. Does-not-remove: preserve all confirmed skill-package operations and user-confirmed deferrals. |
| does_not_remove | MP-001 through MP-014; CA-AS-001 through CA-AS-010; SC-001 through SC-005 |
| capability_operations | validates all implemented skill-package capabilities |
| consumer_surfaces | skill package as consumed by agents and reviewers |
| required_evidence | real_entrypoint_evidence, command_surface_evidence, safety_scan_evidence, eval_prompt_evidence |
| retry_max | 2 |
| escalation | debugger |

**Context Navigation**

| Need | Find it at |
| --- | --- |
| Completion gate | `quickstart.md#10-Completion-Gate` |
| Command names | `README.md#Command-reference` and `src/cli.js` help output |
| Safety model | `README.md#Safety-model` |
| Plan validation strategy | `plan-contract.json#validation_strategy` |
| Data model / contracts status | `plan.md#Project-Structure` |

**Acceptance Criteria**

- All required files exist and are non-empty.
- `SKILL.md` references every required reference file.
- Launchdeck command names used by references exist in current CLI help or README.
- No guidance bypasses Launchdeck for lifecycle mutation.
- No guidance authorizes unknown/external process kills.
- No guidance makes clean equivalent to reset.
- Eval prompts satisfy SC-001 through SC-005.

**Verify Commands**

```powershell
$files = @(
  '.agents/skills/launchdeck-agent/SKILL.md',
  '.agents/skills/launchdeck-agent/references/intent-routing.md',
  '.agents/skills/launchdeck-agent/references/adoption-flow.md',
  '.agents/skills/launchdeck-agent/references/discovery-rules.md',
  '.agents/skills/launchdeck-agent/references/command-flows.md',
  '.agents/skills/launchdeck-agent/references/recovery-playbooks.md',
  '.agents/skills/launchdeck-agent/references/clean-safety.md',
  '.agents/skills/launchdeck-agent/references/eval-prompts.md'
)
foreach ($file in $files) {
  if (!(Test-Path $file)) { throw "Missing $file" }
  if ((Get-Item $file).Length -eq 0) { throw "Empty $file" }
}
$help = node src\cli.js --help
@('doctor','project add','status --all','conflicts','run <task>','start','restart','ps','ports','inspect','logs','events','reconcile','stop','force-stop','clean') | ForEach-Object {
  if ($help -notmatch [regex]::Escape($_)) { throw "Missing CLI help command: $_" }
}
if (rg -n "(taskkill|kill -9|pkill|Stop-Process|fuser)" .agents\skills\launchdeck-agent) { throw "Unsafe raw process command guidance found" }
```

**Final Checkpoint**: Skill package is ready for embedded pre-implement review and final implementation validation.

## Dependencies & Execution Order

- T001 must complete first.
- T002, T003, T004, T005, and T006 can run in parallel after T001.
- T007 depends on T002 through T006.
- T008 depends on T001 through T007.

## Parallel Opportunities

- **Parallel Batch 2.1**: T002, T003, T004, T005, T006.
- **Join Point 2.1**: Verify all six reference files exist before T007.
- Later stages are serial because eval prompts and final validation depend on all reference content.

## Parallel Example

```text
After T001:
Task lane A: T002 intent-routing.md
Task lane B: T003 adoption-flow.md + discovery-rules.md
Task lane C: T004 command-flows.md
Task lane D: T005 recovery-playbooks.md
Task lane E: T006 clean-safety.md

Join Point 2.1:
Confirm every reference file exists and routes cleanly from SKILL.md before T007.
```

## Implementation Dispatch

- **Feature delivery shape**: serial setup with one intra-phase parallel batch, then serial eval and final integration.
- **delegated_task_generation_lanes**: none.
- **execution_model**: adaptive.
- **execution_mode**: light.
- **workflow_status**: ready.
- **dispatch_shape**: leader-inline.
- **execution_surface**: leader-inline.
- **capability_degraded**: false.
- **embedded_review_gate**: required.
- **auto_repair_tasks**: true.
- **review_window_policy**: max_completed_tasks_before_review=5, max_unreviewed_changed_paths=8, max_unreviewed_validation_failures=0.
- **visible_review_command**: none.

## Implementation-Readiness Task Self-Audit

- Buildable FR coverage: passed; FR-001 through FR-030 map to T001 through T008.
- Success criteria coverage: passed; SC-001 through SC-005 map to T007 and T008.
- Locked decision preservation: passed through Task Guardrail Index and task anti-goals.
- Guardrail mapping: passed; every implementation task has applicable guardrails.
- User-observable path coverage: passed; routing, adoption, operation, recovery, clean, and eval surfaces are mapped.
- DP1 packet readiness: passed; each task has objective, write scope, dependencies, and required references.
- DP2 packet readiness: passed; parallel batch has isolated write scopes and join point.
- DP3 packet readiness: passed; validation and handoff format are explicit.
- Reference fidelity mapping: passed; all six behavior-level inventory items map to tasks.
- Unmapped task status: passed; no orphan tasks.
- Write-set conflict status: passed; only T008 intentionally spans all skill files after join.

## Recommended Next Command

- /sp.implement
