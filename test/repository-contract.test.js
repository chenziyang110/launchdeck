import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers/cli-fixture.js';

test('release metadata keeps system tests deterministic and the npm payload bounded', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts.check, 'node scripts/check-syntax.js');
  assert.equal(packageJson.scripts.test, 'node --test --test-concurrency=1');
  assert.deepEqual(packageJson.files, [
    'src/',
    'schema/',
    '.agents/skills/launchdeck-agent/'
  ]);
  assert.equal(packageJson.repository.url, 'git+https://github.com/chenziyang110/launchdeck.git');
  assert.equal(fs.existsSync(path.join(repoRoot, 'LICENSE')), true);
});

test('CI runs the repository checks and the maintained lifecycle smoke on every supported OS', () => {
  const workflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');

  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /node scripts\/smoke-lifecycle\.js --mode quick --json/);
  assert.doesNotMatch(workflow, /node -e/);
});
