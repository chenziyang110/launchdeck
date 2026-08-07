import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { repoRoot } from './helpers/cli-fixture.js';

test('release metadata keeps system tests deterministic and the npm payload bounded', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts.check, 'node scripts/check-syntax.js');
  assert.equal(packageJson.scripts.test, 'node scripts/run-tests.js');
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts', 'run-tests.js')), true);
  assert.deepEqual(packageJson.files, [
    'src/',
    'schema/',
    'agent/compatibility-manifest.json',
    'agent/evidence/index.json',
    'agent/installer-payload/',
    '.agents/skills/launchdeck-agent/',
    'examples/sample-projects/'
  ]);
  const syntaxChecker = fs.readFileSync(path.join(repoRoot, 'scripts', 'check-syntax.js'), 'utf8');
  assert.match(syntaxChecker, /path\.join\(repoRoot, 'examples', 'sample-projects'\)/);
  assert.equal(packageJson.repository.url, 'git+https://github.com/chenziyang110/launchdeck.git');
  assert.equal(fs.existsSync(path.join(repoRoot, 'LICENSE')), true);
});

test('GitHub dependency install examples materialize the package instead of linking an ephemeral clone', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const tag = `v${packageJson.version}`;

  for (const installCommand of [
    `npm install --global --install-links=true github:chenziyang110/launchdeck#${tag}`,
    `npm install --save-dev --install-links=true github:chenziyang110/launchdeck#${tag}`
  ]) {
    assert.equal(readme.includes(installCommand), true, installCommand);
  }
});

test('CI runs the repository checks and the maintained lifecycle smoke on every supported OS', () => {
  const workflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');

  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /\n  workflow_dispatch:/);
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /node scripts\/smoke-lifecycle\.js --mode quick --json/);
  assert.doesNotMatch(workflow, /node -e/);
});

test('release tests do not depend on workflow feature archives', () => {
  const forbiddenFeaturePath = ['.specify', 'features'].join('/');

  for (const filePath of listJavaScriptFiles(path.join(repoRoot, 'test'))) {
    const source = fs.readFileSync(filePath, 'utf8').replaceAll('\\', '/');
    assert.equal(source.includes(forbiddenFeaturePath), false, path.relative(repoRoot, filePath));
  }
});

test('gallery source inventory is exactly the approved ten-project denominator', () => {
  const expectedIds = [
    'vite-react-habit-tracker',
    'nextjs-blog-manager',
    'nestjs-url-shortener',
    'fastapi-inventory',
    'django-events',
    'go-webhook-inbox',
    'spring-boot-orders',
    'aspnet-library-catalog',
    'docker-compose-helpdesk',
    'node-python-issue-tracker'
  ];
  const catalogPath = path.join(repoRoot, 'examples', 'sample-projects', 'catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const entries = Array.isArray(catalog) ? catalog : catalog.entries;

  assert.deepEqual(entries.map((entry) => entry.id), expectedIds);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, expectedIds.length);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), [
      'id',
      'ports',
      'requirements',
      'sourcePath',
      'stack',
      'theme',
      'title'
    ]);
    assert.equal(fs.existsSync(path.join(repoRoot, entry.sourcePath)), true, entry.id);
  }
});

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}
