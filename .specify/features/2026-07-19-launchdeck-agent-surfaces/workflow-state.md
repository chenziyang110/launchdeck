---
workflow_runtime_version: 1
revision: 3
stage: tasks
active_command: sp-tasks
status: active
phase_mode: task-generation-only
summary: Compile the complete Kernel, CLI/MCP, Skill, Plugin, recovery, and exact
  readiness plan into a dependency-safe heavy task graph.
current_stage: tasks
next_action: Complete tasks, then transition to implement.
blocker_reason: None
blocker: null
last_resolution_evidence: []
---

# Workflow State: tasks

## Current Command

- active_command: `sp-tasks`
- status: `active`

## Phase Mode

- phase_mode: `task-generation-only`
- summary: `Compile the complete Kernel, CLI/MCP, Skill, Plugin, recovery, and exact readiness plan into a dependency-safe heavy task graph.`

## Stage State

- current_stage: `tasks`
- current_domain: `none`
- next_action: `Complete tasks, then transition to implement.`
- blocker_reason: `None`
- final_handoff_decision: `/sp.implement`

## Allowed Artifact Writes

- tasks.md
- task-index.json
- workflow-state.md

## Forbidden Actions

- edit source code
- start implementation

## Authoritative Files

- plan-contract.json
- task-index.json
- workflow-state.md

## Next Command

- `/sp.implement`
