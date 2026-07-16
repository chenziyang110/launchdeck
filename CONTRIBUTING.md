# Contributing to Launchdeck

Launchdeck uses GitHub Flow: `main` stays releasable, work happens on short-lived branches, and every change returns through a reviewed pull request with green CI.

## Set Up

```bash
git clone https://github.com/chenziyang110/launchdeck.git
cd launchdeck
npm ci
npm run check
npm test
```

## Branches

Update `main`, then create a focused branch:

```bash
git switch main
git pull --rebase origin main
git switch -c feat/short-description
```

Use `feat/`, `fix/`, `docs/`, `test/`, `refactor/`, `ci/`, or `chore/` prefixes. Keep branches small and delete them after merge.

## Commits

Use Conventional Commits:

```text
feat(cli): add project inspection
fix(runtime): preserve failed stop evidence
docs(readme): clarify install flow
```

Each commit should be reviewable, contain one logical change, and avoid generated output, credentials, local runtime state, or unrelated formatting.

## Verification

Run the same gates used by CI:

```bash
npm ci
npm run check
npm test
npm run smoke
npm audit --omit=dev --audit-level=high
npm run package:check
```

The test suite intentionally uses one test-file worker because lifecycle tests create real child processes and inspect real ports. Do not remove `--test-concurrency=1` without proving stable cross-platform behavior.

## Pull Requests

- Rebase the branch onto the latest `origin/main` before review.
- Use a Conventional Commit title.
- Explain what changed, why it changed, and how it was verified.
- Link related issues and call out compatibility or safety effects.
- Require green CI and at least one approval before merge.
- Prefer squash merge so `main` retains a concise, linear history.

Maintainers should protect `main`, require the `Verify` matrix and package audit checks, require conversation resolution, and block force pushes and branch deletion.

## Releases

Release versions follow Semantic Versioning. A release requires a clean `main`, green cross-platform CI, a reviewed changelog, an annotated `vMAJOR.MINOR.PATCH` tag, and a GitHub release. npm publication is a separate explicit step.
