import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCliFixture, repoRoot } from '../helpers/cli-fixture.js';
import { controlPlanePaths } from '../../src/control-plane/state.js';
import { mutationLockNames } from '../../src/control-plane/locks.js';
import {
  JOURNAL_SCHEMA_VERSION,
  JOURNAL_STATES,
  operationJournalPaths
} from '../../src/control-plane/operation-journal.js';

const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'agent-first-installer');
const baseline = JSON.parse(
  fs.readFileSync(path.join(fixtureRoot, 'baseline.json'), 'utf8')
);

test('legacy Agent CLI surface and Skill-only dry-run remain available', () => {
  const fixture = createCliFixture({ prefix: 'launchdeck-cli-agent-first-' });
  const skillRoot = fixture.path('skill-target');

  try {
    const help = fixture.runCli(['--help']);
    assert.equal(help.status, 0, help.stderr);
    for (const command of baseline.legacyAgentCommands) {
      assert.match(help.stdout, new RegExp(`\\b${command}\\b`));
    }

    const before = snapshot(fixture.projectRoot);
    const result = fixture.runCliJson([
      'agent',
      'install',
      '--agent',
      'codex',
      '--target',
      skillRoot,
      '--dry-run',
      '--compact'
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.action, 'install');
    assert.equal(result.json.dryRun, true);
    assert.equal(result.json.result.status, 'planned');
    assert.equal(fs.existsSync(path.join(skillRoot, 'launchdeck-agent')), false);
    assert.deepEqual(snapshot(fixture.projectRoot), before);
  } finally {
    fixture.cleanup();
  }
});

test('state root, mutation lock order, and operation journal remain canonical', () => {
  const stateHome = path.join(os.tmpdir(), 'launchdeck-agent-first-state');
  const env = { ...process.env, LAUNCHDECK_HOME: stateHome };
  const statePaths = controlPlanePaths(env);
  const journalPaths = operationJournalPaths(env);

  assert.equal(statePaths.homeDir, path.resolve(stateHome));
  assert.equal(journalPaths.homeDir, statePaths.homeDir);
  assert.equal(
    journalPaths.rootDir,
    path.join(statePaths.homeDir, 'runtime', 'operations', 'v1')
  );
  assert.equal(JOURNAL_SCHEMA_VERSION, 1);
  assert.deepEqual(JOURNAL_STATES, baseline.journalStates);
  assert.deepEqual(
    mutationLockNames({
      operationId: 'op_1234567890abcdef',
      registryMutation: true,
      projectId: 'project-one',
      taskRef: 'web',
      includeRunIndex: true,
      includeJournalIndex: true
    }),
    [
      'operation-op_1234567890abcdef',
      'registry',
      'project-project-one',
      'task-project-one-web',
      'run-index',
      'operation-journal-index'
    ]
  );
});

test('npm package exposes the existing CLI, MCP, Skill, and build surfaces', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

  assert.deepEqual(Object.keys(packageJson.bin).sort(), [...baseline.packageBins].sort());
  assert.equal(packageJson.bin.launchdeck, './src/cli.js');
  assert.equal(packageJson.bin['launchdeck-mcp'], './src/mcp/stdio-server.js');
  assert.ok(packageJson.files.includes('.agents/skills/launchdeck-agent/'));
  assert.ok(packageJson.files.includes('agent/compatibility-manifest.json'));
  assert.equal(packageJson.scripts['agent:build'], 'node scripts/build-agent-plugins.js');
  assert.equal(packageJson.scripts.test, 'node scripts/run-tests.js');
});

test('Flask demo keeps source configuration without persisted Launchdeck runtime state', () => {
  const demoRoot = path.join(repoRoot, 'demos', 'flask-server');
  const pyproject = fs.readFileSync(path.join(demoRoot, 'pyproject.toml'), 'utf8');

  for (const relativePath of baseline.flaskDemo.requiredFiles) {
    assert.equal(
      fs.existsSync(path.join(demoRoot, relativePath)),
      true,
      `Missing Flask demo source: ${relativePath}`
    );
  }
  assert.match(
    pyproject,
    new RegExp(`${baseline.flaskDemo.entrypoint}\\s*=\\s*"${baseline.flaskDemo.module}"`)
  );
  assert.equal(fs.existsSync(path.join(demoRoot, '.launchdeck')), false);
  assert.equal(fs.existsSync(path.join(demoRoot, 'scratch')), false);
});

function snapshot(root) {
  if (!fs.existsSync(root)) return [];
  const entries = [];
  walk(root, root, entries);
  return entries.sort((left, right) => left.localeCompare(right));
}

function walk(root, current, entries) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    entries.push(entry.isDirectory() ? `${relative}/` : relative);
    if (entry.isDirectory()) walk(root, absolute, entries);
  }
}
