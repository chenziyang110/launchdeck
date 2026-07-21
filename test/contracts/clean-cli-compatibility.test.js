import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { mapCliInvocation } from '../../src/adapters/cli-operation-map.js';
import { validateAgentOperationRequest } from '../../src/kernel/operation-registry.js';
import { createCliFixture } from '../helpers/cli-fixture.js';

test('clean preview preserves schemaVersion 1 mirrors and nests one clean.plan Agent result', () => {
  const fixture = cleanFixture();
  try {
    const result = fixture.runCliJson(['clean']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.schemaVersion, 1);
    assert.equal(result.json.dryRun, true);
    assert.equal(result.json.mode, 'dry-run');
    assert.equal(result.json.removed.length, 0);
    assert.match(result.json.planDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.json.data.planDigest, result.json.planDigest);
    assert.equal(result.json.data.agentResult.operation.name, 'clean.plan');
    assert.equal(result.json.data.agentResult.operation.journalStatus, 'not_applicable');
    assert.equal(result.json.data.agentResult.resource.kind, 'cleanPlan');
    assert.equal(result.json.data.agentResult.resource.data.planDigest, result.json.planDigest);
    assert.equal(result.json.data.agentResult.effects.changed, false);
    assert.equal(fs.existsSync(fixture.path('cache', 'value.txt')), true);
    assert.equal(fs.existsSync(fixture.path('node_modules', 'value.txt')), true);
  } finally {
    fixture.cleanup();
  }
});

test('clean --safe internally binds apply to a fresh digest while preserving legacy output fields', () => {
  const fixture = cleanFixture();
  try {
    const result = fixture.runCliJson(['clean', '--safe']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.schemaVersion, 1);
    assert.equal(result.json.dryRun, false);
    assert.equal(result.json.mode, 'safe');
    assert.match(result.json.planDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.json.data.agentResult.operation.name, 'clean.applySafe');
    assert.equal(result.json.data.agentResult.operation.journalStatus, 'succeeded');
    assert.equal(result.json.data.agentResult.resource.kind, 'cleanResult');
    assert.equal(result.json.data.agentResult.effects.certainty, 'confirmed');
    assert.equal(result.json.data.agentResult.effects.changed, true);
    assert.equal(result.json.targets.some((entry) => (entry.rawPath ?? entry.path) === 'cache'), true);
    assert.equal(result.json.removed.some((entry) => (entry.rawPath ?? entry.path) === 'cache'), true);
    assert.equal(fs.existsSync(fixture.path('cache')), false);
    assert.equal(fs.existsSync(fixture.path('node_modules', 'value.txt')), true);
  } finally {
    fixture.cleanup();
  }
});

test('risky clean remains CLI-only and public clean inputs reject confirmation-shaped authority', () => {
  const fixture = cleanFixture();
  try {
    const risky = fixture.runCliJson(['clean', '--all', '--yes']);
    assert.equal(risky.status, 0, risky.stderr);
    assert.equal(risky.json.data?.agentResult, undefined);
    assert.equal(risky.json.agentResult, undefined);
    assert.equal(fs.existsSync(fixture.path('node_modules')), false);

    const digest = `sha256:${'c'.repeat(64)}`;
    for (const forbidden of [
      { yes: true },
      { confirmed: true },
      { approvalToken: 'model-token' },
      { riskyTargets: ['node_modules'] },
      { path: 'cache' },
      { nested: { confirmed: true } }
    ]) {
      const validation = validateAgentOperationRequest({
        operation: 'clean.applySafe',
        input: { projectRef: 'project-a', planDigest: digest, ...forbidden }
      });
      assert.equal(validation.ok, false, JSON.stringify(forbidden));
    }
  } finally {
    fixture.cleanup();
  }
});

test('declarative CLI mapping exposes preview and trusted internal safe apply but excludes clean --all', () => {
  const digest = `sha256:${'d'.repeat(64)}`;
  assert.deepEqual(mapCliInvocation({ positionals: ['clean'], options: {}, context: { projectRef: 'project-a' } }), {
    operation: 'clean.plan',
    input: { projectRef: 'project-a' }
  });
  assert.deepEqual(mapCliInvocation({
    positionals: ['clean'],
    options: { safe: true },
    context: { projectRef: 'project-a', planDigest: digest }
  }), {
    operation: 'clean.applySafe',
    input: { projectRef: 'project-a', planDigest: digest }
  });
  assert.equal(mapCliInvocation({
    positionals: ['clean'],
    options: { all: true, yes: true },
    context: { projectRef: 'project-a', planDigest: digest }
  }), null);
});

function cleanFixture() {
  const fixture = createCliFixture();
  fixture.writeConfig({
    version: 1,
    project: { name: 'clean-agent-compatibility' },
    tasks: { build: { command: 'node -e "process.exit(0)"' } },
    clean: { safe: ['cache'], risky: ['node_modules'] }
  });
  fixture.writeFile('cache/value.txt', 'safe');
  fixture.writeFile('node_modules/value.txt', 'risky');
  return fixture;
}
