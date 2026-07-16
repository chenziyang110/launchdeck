# Requirements Checklist: Launchdeck Agent Skill

## Spec Quality

- [x] Feature goal is explicit and user-centered.
- [x] In-scope, out-of-scope, and deferred scope are separated.
- [x] Natural-language trigger behavior is specified.
- [x] Safety boundaries are testable.
- [x] Acceptance proof includes positive and negative behavior.
- [x] Discussion Decision Digest is preserved.
- [x] Must-Preserve ledger items are mapped.
- [x] Senior Consequence Analysis obligations are preserved.
- [x] Source-signal disposition is complete.
- [x] No planning-critical hard unknowns remain.

## Testability

- [x] Unknown project adoption has acceptance signals.
- [x] Duplicate-start prevention has acceptance signals.
- [x] External/unknown port occupant behavior has acceptance signals.
- [x] Ownership-gated stop/restart/force-stop behavior has acceptance signals.
- [x] Safe clean, risky clean, and reset refusal have acceptance signals.
- [x] Compact-output behavior has acceptance signals.
- [x] Evals are required for trigger, non-trigger, behavior/safety, and compact-output behavior.

## Boundary Review

- [x] Launchdeck remains execution authority.
- [x] `.launchdeck.yml` remains lifecycle authority.
- [x] The feature does not edit CLI/runtime source.
- [x] The feature does not add scripts in v0.
- [x] The feature does not introduce GUI, MCP, production deployment, or reset automation.
- [x] The target package path is verified as `.agents/skills/launchdeck-agent/`.

## Readiness

- [x] Artifact package is ready for user review.
- [x] Mainline next command after user review is `/sp.plan`.
