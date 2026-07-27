import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  BUILD_IDENTITY,
  createFreshSetupFixture,
  setupCliArgv
} from '../fixtures/agent-first-setup/setup-fixture.js';

test('npx and installed fresh setup entrypoints produce equivalent verified project installations', async () => {
  const npx = await runFreshEntrypoint('npx');
  const installed = await runFreshEntrypoint('installed');

  try {
    assert.deepEqual(normalizeForParity(npx.cli.json), normalizeForParity(installed.cli.json));
    assertPublicCliRun(npx.cli, 'npx');
    assertPublicCliRun(installed.cli, 'installed');
    assertVerifiedFreshInstall(npx.fixture, npx.cli.json);
    assertVerifiedFreshInstall(installed.fixture, installed.cli.json);
  } finally {
    npx.fixture.cleanup();
    installed.fixture.cleanup();
  }
});

test('second setup run is a no-op and does not change an existing project config', async () => {
  const existingConfig = 'version: 1\nproject:\n  name: user-authored\n';
  const fixture = createFreshSetupFixture({ launchdeckConfig: existingConfig });

  try {
    const first = runSetupCli(fixture, 'installed');
    assertPublicCliRun(first, 'installed');
    assert.equal(first.json.result.outcome, 'succeeded');
    const receiptCount = fixture.receiptRecordCount();
    const configPath = path.join(fixture.projectRoot, '.launchdeck.yml');
    const configBeforeSecondRun = fs.readFileSync(configPath, 'utf8');

    const second = runSetupCli(fixture, 'installed');

    assertPublicCliRun(second, 'installed');
    assert.equal(second.json.result.outcome, 'noop');
    assert.equal(second.json.result.effectCertainty, 'none');
    assert.equal(second.json.result.receiptId, null);
    assert.deepEqual(second.json.result.effects, []);
    assert.equal(fixture.receiptRecordCount(), receiptCount);
    assert.equal(fs.readFileSync(configPath, 'utf8'), configBeforeSecondRun);
    assert.equal(configBeforeSecondRun, existingConfig);
  } finally {
    fixture.cleanup();
  }
});

function runFreshEntrypoint(entrypoint) {
  const fixture = createFreshSetupFixture();
  const cli = runSetupCli(fixture, entrypoint);
  return { fixture, cli };
}

function runSetupCli(fixture, entrypoint) {
  const run = fixture.runCli(setupCliArgv({ projectRoot: fixture.projectRoot }), { entrypoint });
  return {
    ...run,
    json: JSON.parse(run.stdout)
  };
}

function assertPublicCliRun(run, entrypoint) {
  assert.equal(run.status, 0);
  assert.equal(run.stderr, '');
  assert.equal(run.entrypoint, entrypoint);
  assert.deepEqual(run.argv.slice(0, 2), ['agent', 'setup']);
  assert.equal(run.argv.includes('--json'), true);
  assert.equal(run.argv.includes('--yes'), true);
}

function assertVerifiedFreshInstall(fixture, envelope) {
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.command, 'agent setup');
  assert.equal(envelope.result.outcome, 'succeeded');
  assert.equal(envelope.result.effectCertainty, 'complete');
  assert.equal(envelope.result.buildIdentity, BUILD_IDENTITY);
  assert.match(envelope.result.operationId, /^op_/);
  assert.match(envelope.result.receiptId, /^receipt_/);
  assert.equal(envelope.result.effects.length, 2);

  const receipt = fixture.currentReceipt();
  assert.equal(receipt.receiptId, envelope.result.receiptId);
  assert.equal(receipt.buildIdentity, BUILD_IDENTITY);
  assert.equal(receipt.verificationEvidence.every((entry) => entry.verified === true), true);
  assert.deepEqual(
    receipt.targets.map((target) => target.targetId).sort(),
    ['codex:project:mcp', 'codex:project:skill']
  );

  assert.equal(fs.existsSync(fixture.targetPath('skill')), true);
  assert.equal(fs.existsSync(fixture.targetPath('mcp')), true);
  assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.launchdeck.yml')), false);
  assert.equal(fixture.receiptRecordCount(), 1);
}

function normalizeForParity(envelope) {
  return {
    schemaVersion: envelope.schemaVersion,
    ok: envelope.ok,
    command: envelope.command,
    outcome: envelope.result.outcome,
    effectCertainty: envelope.result.effectCertainty,
    scope: envelope.result.scope,
    buildIdentity: envelope.result.buildIdentity,
    targetIds: envelope.result.targets.map((target) => target.targetId).sort(),
    effectTypes: envelope.result.effects.map((effect) => effect.effectType).sort(),
    receiptCommitted: /^receipt_/.test(envelope.result.receiptId)
  };
}
