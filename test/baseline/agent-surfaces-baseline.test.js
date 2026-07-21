import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { proveRunOwnership } from '../../src/control-plane/ownership.js';
import {
  createAgentSurfaceFixture,
  digestFixtureSources,
  snapshotFixtureFiles
} from '../helpers/agent-surface-fixture.js';

test('agent-surface fixture materializes a deterministic isolated contract', async (t) => {
  const fixture = await createAgentSurfaceFixture();
  t.after(() => fixture.cleanup());

  assert.equal(fixture.fixtureDigest, digestFixtureSources());
  assert.match(fixture.fixtureDigest, /^[a-f0-9]{64}$/);
  assert.equal(path.relative(os.tmpdir(), fixture.projectRoot).startsWith('..'), false);
  assert.equal(path.relative(os.tmpdir(), fixture.homeDir).startsWith('..'), false);
  assert.notEqual(fixture.projectRoot, fixture.homeDir);

  const config = YAML.parse(fs.readFileSync(fixture.path('.launchdeck.yml'), 'utf8'));
  assert.equal(config.version, 1);
  assert.deepEqual(
    Object.entries(config.tasks).map(([name, task]) => [name, task.longRunning, task.risk]),
    [
      ['managed', true, 'low'],
      ['finite', false, 'low'],
      ['medium', false, 'medium']
    ]
  );
  assert.equal(fs.existsSync(fixture.sentinelPath('protected-state')), true);
  assert.equal(fs.existsSync(fixture.sentinelPath('protected-evidence')), true);
  assert.equal(fs.existsSync(fixture.sentinelPath('risky-content')), true);
  assert.match(fixture.manifest.claimBoundary, /does not prove MCP, Plugin, host/i);
});

test('agent-surface fixture freezes CLI schemaVersion 1 and finite-task behavior', async (t) => {
  const fixture = await createAgentSurfaceFixture();
  t.after(() => fixture.cleanup());

  const tasks = fixture.runCliJson(['tasks']);
  assert.equal(tasks.status, 0, tasks.stderr);
  assert.equal(tasks.json.ok, true);
  assert.equal(tasks.json.schemaVersion, 1);
  assert.equal(tasks.json.command, 'tasks');
  assert.deepEqual(
    tasks.json.tasks.map((task) => [task.name, task.type]),
    [
      ['managed', 'managed'],
      ['finite', 'foreground'],
      ['medium', 'foreground']
    ]
  );

  const finite = fixture.runCli(['run', 'finite', '--json']);
  const payload = JSON.parse(finite.stdout.trim());
  assert.equal(finite.status, 0, finite.stderr);
  assert.equal(payload.ok, true);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.command, 'run');
  assert.equal(payload.task, 'finite');
  assert.equal(fs.existsSync(fixture.finiteReceiptPath()), true);
});

test('agent-surface managed task reuses one owned run and one spawn receipt', async (t) => {
  const fixture = await createAgentSurfaceFixture();
  t.after(() => fixture.cleanup());

  const first = fixture.runCliJson(['start', 'managed'], { timeout: 10_000 });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.json.schemaVersion, 1);
  assert.equal(first.json.process.spawned, true);
  assert.equal(first.json.process.ownershipConfidence, 'verified-owned');

  const second = fixture.runCliJson(['start', 'managed'], { timeout: 10_000 });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.json.process.spawned, false);
  assert.equal(second.json.process.runId, first.json.process.runId);
  assert.equal(second.json.process.pid, first.json.process.pid);
  assert.equal(second.json.process.ports[0], fixture.managedPort);

  const receipts = fs.readFileSync(fixture.spawnReceiptPath, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(receipts.length, 1);
  assert.equal(JSON.parse(receipts[0]).runId, first.json.process.runId);

  const stopped = fixture.runCliJson(['stop', 'managed'], { timeout: 10_000 });
  assert.equal(stopped.status, 0, stopped.stderr);
});

test('agent-surface clean preview preserves safe, risky, state, and evidence files', async (t) => {
  const fixture = await createAgentSurfaceFixture();
  t.after(() => fixture.cleanup());
  const before = snapshotFixtureFiles(fixture.projectRoot);

  const preview = fixture.runCliJson(['clean']);

  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(preview.json.schemaVersion, 1);
  assert.equal(preview.json.dryRun, true);
  assert.deepEqual(snapshotFixtureFiles(fixture.projectRoot), before);
  assert.equal(fs.existsSync(fixture.sentinelPath('protected-state')), true);
  assert.equal(fs.existsSync(fixture.sentinelPath('protected-evidence')), true);
  assert.equal(fs.existsSync(fixture.sentinelPath('risky-content')), true);
});

test('agent-surface ownership cases cover verified, unknown, external, stale, and mismatched evidence', async (t) => {
  const fixture = await createAgentSurfaceFixture();
  t.after(() => fixture.cleanup());

  const observed = Object.fromEntries(fixture.ownershipCases.cases.map((entry) => {
    const proof = proveRunOwnership(entry.run, {
      listeners: entry.listeners,
      processEvidence: entry.processEvidence ?? undefined,
      checkedAt: fixture.ownershipCases.checkedAt
    });
    return [entry.id, proof.confidence];
  }));

  assert.deepEqual(observed, {
    'verified-owned': 'verified-owned',
    unknown: 'unknown',
    external: 'external',
    'stale-owned': 'stale-owned',
    mismatched: 'external'
  });
});
