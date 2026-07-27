import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createBackupStore } from '../../../src/agent/state/backup-store.js';
import { createIsolatedStateFixture } from '../../fixtures/agent-state/isolated-state-fixture.js';

const ORIGINAL = '{\"mcpServers\":{\"launchdeck\":{\"env\":{\"API_TOKEN\":\"must-survive-only-in-backup\"}}}}\\n';

test('backup captures bytes and permissions below isolated LAUNCHDECK_HOME without persisting raw config in metadata', (t) => {
  const fixture = createIsolatedStateFixture(t, 'backup-create');
  const targetPath = path.join(fixture.projectRoot, '.mcp.json');
  fs.writeFileSync(targetPath, ORIGINAL, { encoding: 'utf8', mode: 0o600 });
  const store = createBackupStore({
    env: fixture.env,
    clock: () => new Date('2026-07-23T12:00:00.000Z')
  });
  const backup = store.create({
    backupId: 'backup_0123456789abcdef',
    operationId: 'op_0123456789abcdef',
    targetId: 'claude:project:mcp',
    sourcePath: targetPath,
    originalDigest: sha256(ORIGINAL)
  });

  assert.equal(path.relative(fixture.launchdeckHome, backup.backupPath).startsWith('..'), false);
  assert.equal(fs.readFileSync(backup.backupPath, 'utf8'), ORIGINAL);
  assert.equal(backup.originalDigest, sha256(ORIGINAL));
  assert.equal(backup.permissionsEvidence.mode !== null, true);
  assert.equal(JSON.stringify(backup).includes('must-survive-only-in-backup'), false);
  assert.equal(JSON.stringify(backup).includes(ORIGINAL), false);
  assert.equal(Object.isFrozen(backup), true);
});

test('verified restore is bounded to the recorded target and preserves backup evidence', (t) => {
  const fixture = createIsolatedStateFixture(t, 'backup-restore');
  const targetPath = path.join(fixture.projectRoot, '.mcp.json');
  fs.writeFileSync(targetPath, ORIGINAL, 'utf8');
  const store = createBackupStore({ env: fixture.env });
  const backup = store.create({
    backupId: 'backup_0123456789abcdef',
    operationId: 'op_0123456789abcdef',
    targetId: 'claude:project:mcp',
    sourcePath: targetPath,
    originalDigest: sha256(ORIGINAL)
  });
  const changed = '{\"changed\":true}\n';
  fs.writeFileSync(targetPath, changed, 'utf8');

  const restored = store.restore(backup.backupId, {
    targetId: backup.targetId,
    targetPath,
    expectedCurrentDigest: sha256(changed)
  });

  assert.equal(restored.restored, true);
  assert.equal(fs.readFileSync(targetPath, 'utf8'), ORIGINAL);
  assert.equal(fs.existsSync(backup.backupPath), true, 'recovery evidence is retained after restore');
  assert.throws(
    () => store.restore(backup.backupId, {
      targetId: 'foreign:project:mcp',
      targetPath: path.join(fixture.projectRoot, 'foreign.json'),
      expectedCurrentDigest: sha256(changed)
    }),
    { code: 'agent_backup_target_mismatch' }
  );
});

test('age alone never makes a recovery backup removable', (t) => {
  const fixture = createIsolatedStateFixture(t, 'backup-retention');
  const targetPath = path.join(fixture.projectRoot, '.mcp.json');
  fs.writeFileSync(targetPath, ORIGINAL, 'utf8');
  const store = createBackupStore({
    env: fixture.env,
    clock: () => new Date('2027-07-23T12:00:00.000Z')
  });
  const backup = store.create({
    backupId: 'backup_0123456789abcdef',
    operationId: 'op_0123456789abcdef',
    targetId: 'claude:project:mcp',
    sourcePath: targetPath,
    originalDigest: sha256(ORIGINAL)
  });

  assert.deepEqual(store.assessRetention(backup.backupId, {
    transactionState: 'indeterminate',
    referencedByRecovery: true,
    now: new Date('2037-07-23T12:00:00.000Z')
  }), {
    decision: 'retained',
    reason: 'recovery-reference'
  });
  assert.equal(fs.existsSync(backup.backupPath), true);
});

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}
