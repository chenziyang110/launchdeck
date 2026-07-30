# Agent Release Process

This is the mandatory release procedure for Launchdeck Agents and maintainers.
Use it whenever a request includes a version bump, release, Git tag, GitHub
Release, or npm publication.

## Completion Contract

A versioned release is complete only when all of these refer to the same
`MAJOR.MINOR.PATCH` version and the same merged source:

1. `package.json` and `package-lock.json`.
2. Generated installer payload and compatibility manifests.
3. An annotated Git tag on the merged `main` commit.
4. A non-draft GitHub Release for that tag.
5. The public `launchdeck@<version>` package on the npm registry.

If `package.json` did not change, do not publish npm merely because docs or CI
changed. If the version did change, npm publication is required unless the user
explicitly excludes it. Authentication, OTP, registry, or network failures make
the release **partially published and blocked**; they do not make it complete.

Never move an existing release tag, overwrite an npm version, delete a published
release to retry, or claim success from local verification alone.

## 1. Read-only preflight

Start from a clean, current `main` and resolve the intended SemVer bump.

```bash
git fetch origin main --tags
git status --short
git log -1 --oneline origin/main
git tag --list "v*" --sort=-version:refname
gh auth status
npm config get registry
npm whoami
npm view launchdeck version dist-tags --json
```

Requirements:

- The npm registry must be `https://registry.npmjs.org/` unless the release
  explicitly targets another registry.
- `npm whoami` must succeed before the release reaches the npm publish step.
- An npm `E404` for `launchdeck` or `launchdeck@<version>` means the package or
  version is not published; a `401` means authentication is missing or invalid.
- Never print, commit, or paste an npm token into commands, logs, PRs, or docs.
  Ask the user to run `npm login` or configure a token through an approved secret
  store when authentication is unavailable.

Create a short-lived branch from `origin/main`:

```bash
git switch -c release/v<version> origin/main
```

## 2. Prepare the version

Make and test the product change first. Then prepare the release metadata:

```bash
npm version <version> --no-git-tag-version
npm run prepack
```

The Agent must also:

- Add a reviewed `CHANGELOG.md` entry with the release date, behavior changes,
  fixes, and safety effects.
- Update README GitHub installation examples to `#v<version>`.
- Confirm `package.json` and both root entries in `package-lock.json` use the
  exact version.
- Confirm generated files report the exact package version.
- After `prepack`, copy the generated `buildIdentity` from
  `agent/compatibility-manifest.json` into
  `agent/evidence/index.json` at `candidate.buildIdentity`.
- Run the evidence binding test immediately:

```bash
node --test test/host/evidence-index.test.js
```

Do not edit generated payload digests by hand. Regenerate them with `prepack`.

## 3. Local release gates

Run every gate against the final release fingerprint and read each exit code:

```bash
npm ci
npm run check
npm test
npm run smoke
npm audit --omit=dev --audit-level=high
npm run package:check
git diff --check
git status --short
```

The full test runner is intentionally serial. Do not replace it with parallel
Windows shards. A failed gate must be diagnosed and rerun after the final fix.

Review the packed inventory and confirm it identifies
`launchdeck@<version>`. No tag, GitHub Release, or npm publish is allowed while a
required gate is failing.

## 4. Commit, PR, and cross-platform CI

Use Conventional Commits. A typical release has focused product/test commits and
one release metadata commit:

```bash
git commit -m "chore(release): prepare v<version>"
git push --set-upstream origin release/v<version>
gh pr create --base main --head release/v<version>
```

The PR must describe behavior, safety boundaries, and exact local verification.
Wait for the Windows, macOS, Ubuntu, package inventory, and production audit jobs.
If this repository does not create a PR run automatically, use the existing
manual fallback and watch that exact run:

```bash
gh workflow run CI --ref release/v<version>
gh run watch <run-id> --exit-status
```

Merge only after the remote matrix is green and review requirements are met.
Fetch `origin/main` afterward and record the merge commit.

## 5. Annotated tag and GitHub Release

The tag must point at the merged `main` commit, not the pre-merge branch commit.

```bash
git fetch origin main --tags
git tag -a v<version> <merged-main-commit> -m "Launchdeck v<version>"
git push origin v<version>
gh release create v<version> --title "Launchdeck v<version>" --notes <release-notes>
```

Verify the tag and Release before npm publication:

```bash
git ls-remote --tags origin refs/tags/v<version> refs/tags/v<version>^{}
gh release view v<version>
npm pack --dry-run github:chenziyang110/launchdeck#v<version>
```

The remote pack must report the expected package name, version, and inventory.

## 6. Publish npm when the version changed

Publish only from a clean checkout or worktree at the immutable annotated tag.
Verify that `HEAD` equals the peeled tag commit and the worktree is clean.

First check whether the exact npm version already exists:

```bash
npm view launchdeck@<version> version dist.integrity dist.tarball --json
```

- If the registry returns `E404`, continue.
- If the exact version already exists, do not run `npm publish` again. Verify the
  existing package and treat npm as complete only when it is the intended release.
- If identity or provenance is ambiguous, stop and ask the user; npm versions are
  immutable.

Re-run the package check at the tag, then publish publicly:

```bash
npm whoami
npm run package:check
npm publish --access public
```

If npm requests an OTP or authentication, pause and ask the user to complete the
official npm authentication flow. Never weaken npm account security to automate
the release.

Verify registry convergence:

```bash
npm view launchdeck@<version> version dist.integrity dist.tarball --json
npm pack --dry-run launchdeck@<version>
npx --yes --package launchdeck@<version> launchdeck --version
```

All three must resolve the exact published version.

## 7. Closeout and recovery

The final report must include:

- PR URL and merged `main` commit.
- Cross-platform CI run URL and conclusions.
- Annotated tag and GitHub Release URL.
- npm package version and registry verification.
- Local test, smoke, audit, and package results.
- Any skipped tests or withheld compatibility claims.

Safe recovery rules:

- If GitHub publication succeeded but npm authentication failed, keep the tag and
  Release intact. Authenticate and resume npm publication from the same tag.
- If npm succeeded but the GitHub Release is missing, create the Release from the
  existing immutable tag; do not republish npm.
- If a remote object exists with unexpected content, stop. Do not delete, move,
  overwrite, or increment the version without explicit user direction.
