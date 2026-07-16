# Project Context: Launchdeck Tool

## Context Boundary

The active project at `F:/github/launchdeck` is the implementation target for this discussion. No external project is currently in scope.

Current project role:

- role: implementation target
- scope: Launchdeck CLI, protocol docs, examples, schema, and local lifecycle runtime
- evidence source: live repository reads

Reference sources:

- User's prior idea: a skill suite for agents to manage build, run, test, stop, and clean project operations.
- User's refinement: the core should be a universal tool, with skills as agent integration.
- User's confirmation: cross-platform support is required.
- Existing Launchdeck docs and code created in the current repository.

## Project Cognition

`.specify/project-cognition/status.json` reports:

- runtime_format: project-cognition-go
- status: ok
- freshness: fresh
- readiness: query_ready
- baseline_kind: greenfield_empty

Compass query result for the current discussion reported no compact evidence lane and no minimal live reads, with `agent_normalization.required=true` because the query was Chinese/mixed-language. Therefore project cognition was used only as advisory navigation. Current project facts below are proven from live repository reads.

## Verified Project Facts

- `package.json` defines a Node ESM CLI package named `launchdeck`.
- The binary entry is `launchdeck: ./src/cli.js`.
- Scripts include `check` and `test`.
- Runtime dependency is `yaml`.
- Node engine is `>=20`.
- `README.md` describes Launchdeck as a universal lifecycle control tool using `.launchdeck.yml`.
- `.launchdeck.yml` dogfoods Launchdeck with setup, test, lint, safe clean, and risky clean tasks.
- `src/cli.js` exposes init, doctor, lifecycle aliases, run, dev/start/restart, ps, logs, stop, and clean.
- `src/runtime.js` manages runtime directories, state, process start/stop, log tailing, and clean target resolution.
- `src/runtime.js` currently contains OS-specific stop behavior: Windows uses `taskkill`; non-Windows attempts process-group SIGTERM before falling back to PID SIGTERM.
- `src/config.js` loads config upward and normalizes tasks, env, ports, risks, cwd, and clean target declarations.

## Advice Confidence

High for the discussion-level recommendation that the tool should be CLI-first and lifecycle-control centered.

Medium for release-readiness claims, because broader cross-platform and multi-stack validation has not been completed in this discussion.

## Evidence Checked

- `.specify/memory/project-rules.md`
- `.specify/memory/learnings/INDEX.md`
- `.specify/project-cognition/status.json`
- project cognition compass output
- `package.json`
- `README.md`
- `.launchdeck.yml`
- `src/cli.js`
- `src/runtime.js`
- `src/config.js`

## Open Assumptions

- Node is acceptable as the first runtime and distribution path.
- Local project lifecycle control remains the product center.
- Automatic discovery is useful but does not block first coherent product validation.
- Agent integrations should consume the CLI/protocol instead of replacing it.
- Cross-platform behavior must be verified before claiming broad product readiness.
