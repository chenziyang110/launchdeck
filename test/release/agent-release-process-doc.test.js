import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

test('AGENTS makes the versioned GitHub and npm release process mandatory', () => {
  const agents = read('AGENTS.md');

  assert.match(agents, /docs\/agent-release-process\.md/);
  assert.match(agents, /changed package version is not fully released/i);
  assert.match(agents, /npm publication is mandatory/i);
  assert.match(agents, /never expose credentials/i);
});

test('release authority preserves build identity, verification, GitHub, and npm gates', () => {
  const release = read('docs/agent-release-process.md');

  for (const required of [
    'npm version <version> --no-git-tag-version',
    'npm run prepack',
    'agent/evidence/index.json',
    'npm ci',
    'npm run check',
    'npm test',
    'npm run smoke',
    'npm audit --omit=dev --audit-level=high',
    'npm run package:check',
    'gh workflow run CI --ref release/v<version>',
    'git tag -a v<version>',
    'gh release create v<version>',
    'npm publish --access public',
    'npm view launchdeck@<version>',
    'npx --yes --package launchdeck@<version> launchdeck --version'
  ]) {
    assert.ok(release.includes(required), required);
  }

  assert.match(release, /partially published and blocked/i);
  assert.match(release, /do not run `npm publish` again/i);
});

test('contributor release guidance routes to the Agent release authority', () => {
  const contributing = read('CONTRIBUTING.md');

  assert.match(contributing, /Agent Release Process/);
  assert.match(contributing, /partial until GitHub and npm both expose/i);
});

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
