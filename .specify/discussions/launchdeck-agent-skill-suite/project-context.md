# Project Context: Launchdeck Agent Skill Suite

## Boundary

- Implementation target: `F:/github/launchdeck`
- Current product foundation: Launchdeck CLI global control plane
- New discussion scope: agent-facing skill suite for discovering and operating arbitrary projects through Launchdeck

## Verified Existing Foundation

- Launchdeck has CLI commands for project registry, lifecycle operation, observation, recovery, logs/events, and clean.
- Launchdeck keeps user-scoped global control-plane state.
- Launchdeck requires ownership proof for stop/restart/force-stop and treats external processes as inspect-only.
- Launchdeck now supports compact JSON output for lower-context agent usage.

## Product Implication

The skill suite should orchestrate Launchdeck. It should not bypass Launchdeck's state, locks, ownership checks, or safety model.

