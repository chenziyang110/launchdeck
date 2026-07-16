# References: Launchdeck Global CLI Control Plane

## Primary Discussion Sources

- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/handoff-to-specify.json`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/handoff-assessment.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/requirements.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/technical-options.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/project-context.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/open-questions.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/discussion-log.md`
- `F:/github/launchdeck/.specify/discussions/launchdeck-cli-control-plane/discussion-state.md`

## Prior Product Context

- `F:/github/launchdeck/.specify/discussions/launchdeck-tool/`
- `F:/github/launchdeck/.specify/features/2026-07-07-launchdeck-v1-cross/`

The prior package established Launchdeck v1 as a CLI-first local lifecycle control tool. The current feature extends that into a global control plane and should not erase the v1 safety contract.

## Project Cognition And Workflow Sources

- `F:/github/launchdeck/.specify/memory/constitution.md`
- `F:/github/launchdeck/.specify/memory/project-rules.md`
- `F:/github/launchdeck/.specify/memory/learnings/INDEX.md`
- `F:/github/launchdeck/.specify/templates/workflow-state-template.md`
- `F:/github/launchdeck/.planning/quick/2026-07-08-global-runtime-supervisor/STATUS.md`
- `F:/github/launchdeck/.planning/quick/2026-07-08-global-runtime-supervisor/SUMMARY.md`

## Live Repository Evidence

- `F:/github/launchdeck/package.json`
- `F:/github/launchdeck/README.md`
- `F:/github/launchdeck/src/cli.js`
- `F:/github/launchdeck/src/global-runtime.js`
- `F:/github/launchdeck/src/runtime.js`
- `F:/github/launchdeck/src/adapters/process.js`
- `F:/github/launchdeck/src/output.js`
- `F:/github/launchdeck/src/errors.js`
- `F:/github/launchdeck/test/global-runtime.test.js`

## Evidence Summary

- The handoff is confirmed and planning-ready.
- Existing implementation already covers a small global registry/runtime slice.
- The full feature still needs explicit locks, transaction events, unified inspect, alias repair, stronger ownership proof, persistent compatibility, retention, official demo, docs, and cross-platform lifecycle evidence.

## Next Consumer

Recommended next command: `/sp.plan`
