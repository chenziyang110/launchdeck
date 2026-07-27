import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createCodexHostAdapter } from '../../../src/agent/hosts/codex/index.js';
import { createBackupStore } from '../../../src/agent/state/backup-store.js';
import { createIsolatedStateFixture } from '../../fixtures/agent-state/isolated-state-fixture.js';

test('directory backups preserve a byte-bound Skill tree and restore it atomically', async (t) => {
  const fixture = createIsolatedStateFixture(t, 'backup-directory');
  const targetPath = path.join(
    fixture.projectRoot,
    '.agents',
    'skills',
    'launchdeck-agent'
  );
  fs.mkdirSync(path.join(targetPath, 'references'), { recursive: true });
  fs.writeFileSync(path.join(targetPath, 'SKILL.md'), '# original\n');
  fs.writeFileSync(path.join(targetPath, 'references', 'flow.md'), 'original-flow\n');

  const adapter = createCodexHostAdapter({ fs });
  const target = {
    scope: 'project',
    component: 'skill',
    path: targetPath,
    skillRoot: targetPath,
    ownershipBoundary: 'launchdeck-agent'
  };
  const originalDigest = (await adapter.inspect(target, { fs })).contentDigest;
  const store = createBackupStore({ env: fixture.env });
  const backup = store.create({
    backupId: 'backup_directory0000001',
    operationId: 'op_directory00000001',
    targetId: 'codex:project:skill',
    sourcePath: targetPath,
    originalDigest
  });

  assert.equal(backup.sourceKind, 'directory');
  assert.equal(fs.lstatSync(backup.backupPath).isDirectory(), true);
  assert.equal(JSON.stringify(backup).includes('# original'), false);

  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(targetPath, { recursive: true });
  fs.writeFileSync(path.join(targetPath, 'SKILL.md'), '# changed\n');
  const changedDigest = (await adapter.inspect(target, { fs })).contentDigest;
  const restored = store.restore(backup.backupId, {
    targetId: backup.targetId,
    targetPath,
    expectedCurrentDigest: changedDigest
  });

  assert.equal(restored.restored, true);
  assert.equal(restored.restoredDigest, originalDigest);
  assert.equal((await adapter.inspect(target, { fs })).contentDigest, originalDigest);
  assert.equal(fs.readFileSync(path.join(targetPath, 'SKILL.md'), 'utf8'), '# original\n');
  assert.equal(
    fs.readFileSync(path.join(targetPath, 'references', 'flow.md'), 'utf8'),
    'original-flow\n'
  );
  assert.equal(fs.existsSync(backup.backupPath), true);
});
