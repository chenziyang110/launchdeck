import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createLaunchdeckHome } from './helpers/control-plane-fixture.js';
import {
  acquireLock,
  withLock
} from '../src/control-plane/locks.js';

test('acquireLock creates an exclusive lock file with owner metadata', async () => {
  await withLockFixture(async ({ homeDir, env }) => {
    const ownerCwd = path.join(homeDir, 'project-one');
    const transactionId = 'txn-lock-metadata';

    const lock = await acquireLock({
      env,
      lockName: 'registry',
      ownerCommand: 'launchdeck project add project-one',
      ownerCwd,
      transactionId,
      ttlMs: 60_000
    });

    try {
      const record = readLockRecord(homeDir, 'registry');

      assert.equal(record.version, 1);
      assert.equal(record.lockName, 'registry');
      assert.equal(record.ownerPid, process.pid);
      assert.equal(record.ownerCommand, 'launchdeck project add project-one');
      assert.equal(record.ownerCwd, ownerCwd);
      assert.equal(record.transactionId, transactionId);
      assertValidIsoTimestamp(record.createdAt);
      assertValidIsoTimestamp(record.expiresAt);
      assert.equal(Date.parse(record.expiresAt) > Date.parse(record.createdAt), true);
      assert.equal(fs.existsSync(lock.lockPath), true);
    } finally {
      await lock.release();
    }
  });
});

test('acquireLock rejects a contended lock after bounded wait with actionable busy data', async () => {
  await withLockFixture(async ({ homeDir, env }) => {
    const firstLock = await acquireLock({
      env,
      lockName: 'task-alpha-dev',
      ownerCommand: 'launchdeck start alpha:dev',
      ownerCwd: homeDir,
      transactionId: 'txn-first',
      ttlMs: 60_000
    });

    try {
      await assert.rejects(
        () => acquireLock({
          env,
          lockName: 'task-alpha-dev',
          ownerCommand: 'launchdeck stop alpha:dev',
          ownerCwd: homeDir,
          transactionId: 'txn-second',
          ttlMs: 60_000,
          waitMs: 25
        }),
        (error) => {
          assert.equal(['lock_busy', 'task_lock_busy'].includes(error.code), true);
          assert.equal(error.details.lockName, 'task-alpha-dev');
          assert.equal(error.details.lockPath, lockPath(homeDir, 'task-alpha-dev'));
          assert.equal(error.details.owner.lockName, 'task-alpha-dev');
          assert.equal(error.details.owner.ownerCommand, 'launchdeck start alpha:dev');
          assert.equal(error.details.owner.ownerCwd, homeDir);
          assert.equal(error.details.owner.transactionId, 'txn-first');
          assert.equal(Number.isInteger(error.details.owner.ownerPid), true);
          assertValidIsoTimestamp(error.details.owner.createdAt);
          assertValidIsoTimestamp(error.details.owner.expiresAt);
          assert.equal(Array.isArray(error.next), true);
          assert.equal(error.next.length > 0, true);
          assert.equal(error.next.every((action) => typeof action.label === 'string'), true);
          assert.equal(error.next.every((action) => typeof action.command === 'string'), true);
          return true;
        }
      );
    } finally {
      await firstLock.release();
    }
  });
});

test('acquireLock refuses to take over an expired lock when the owner process is still alive', async () => {
  await withLockFixture(async ({ homeDir, env }) => {
    writeLockRecord(homeDir, 'registry', {
      version: 1,
      lockName: 'registry',
      ownerPid: process.pid,
      ownerCommand: 'launchdeck project scan workspace',
      ownerCwd: homeDir,
      transactionId: 'txn-live-expired',
      createdAt: '2026-07-08T00:00:00.000Z',
      expiresAt: '2026-07-08T00:00:01.000Z'
    });

    await assert.rejects(
      () => acquireLock({
        env,
        lockName: 'registry',
        ownerCommand: 'launchdeck project add replacement',
        ownerCwd: homeDir,
        transactionId: 'txn-replacement',
        ttlMs: 60_000,
        waitMs: 0
      }),
      (error) => {
        assert.equal(error.code, 'lock_busy');
        assert.equal(error.details.lockName, 'registry');
        assert.equal(error.details.owner.ownerPid, process.pid);
        assert.equal(error.details.owner.transactionId, 'txn-live-expired');
        assert.equal(error.details.staleCandidate, true);
        assert.equal(error.details.takeoverAllowed, false);
        return true;
      }
    );
  });
});

test('acquireLock safely takes over an expired lock when the owner is absent', async () => {
  await withLockFixture(async ({ homeDir, env }) => {
    writeLockRecord(homeDir, 'registry', {
      version: 1,
      lockName: 'registry',
      ownerPid: 0,
      ownerCommand: 'launchdeck project scan old-workspace',
      ownerCwd: homeDir,
      transactionId: 'txn-stale-owner',
      createdAt: '2026-07-08T00:00:00.000Z',
      expiresAt: '2026-07-08T00:00:01.000Z'
    });

    const lock = await acquireLock({
      env,
      lockName: 'registry',
      ownerCommand: 'launchdeck project add replacement',
      ownerCwd: homeDir,
      transactionId: 'txn-takeover',
      ttlMs: 60_000,
      waitMs: 0
    });

    try {
      const record = readLockRecord(homeDir, 'registry');

      assert.equal(record.ownerPid, process.pid);
      assert.equal(record.ownerCommand, 'launchdeck project add replacement');
      assert.equal(record.transactionId, 'txn-takeover');
    } finally {
      await lock.release();
    }
  });
});

test('withLock removes the lock file after the critical section completes', async () => {
  await withLockFixture(async ({ homeDir, env }) => {
    const result = await withLock({
      env,
      lockName: 'task-alpha-dev',
      ownerCommand: 'launchdeck start alpha:dev',
      ownerCwd: homeDir,
      transactionId: 'txn-critical-section',
      ttlMs: 60_000
    }, async () => 'critical-section-result');

    assert.equal(result, 'critical-section-result');
    assert.equal(fs.existsSync(lockPath(homeDir, 'task-alpha-dev')), false);
  });
});

test('withLock removes the lock file after the critical section throws', async () => {
  await withLockFixture(async ({ homeDir, env }) => {
    await assert.rejects(
      () => withLock({
        env,
        lockName: 'task-alpha-dev',
        ownerCommand: 'launchdeck start alpha:dev',
        ownerCwd: homeDir,
        transactionId: 'txn-critical-section-error',
        ttlMs: 60_000
      }, async () => {
        throw new Error('critical section failed');
      }),
      /critical section failed/
    );

    assert.equal(fs.existsSync(lockPath(homeDir, 'task-alpha-dev')), false);
  });
});

async function withLockFixture(callback) {
  const fixture = createLaunchdeckHome();
  try {
    await callback(fixture);
  } finally {
    fixture.cleanup();
  }
}

function lockPath(homeDir, lockName) {
  return path.join(homeDir, 'locks', `${lockName}.lock`);
}

function readLockRecord(homeDir, lockName) {
  return JSON.parse(fs.readFileSync(lockPath(homeDir, lockName), 'utf8'));
}

function writeLockRecord(homeDir, lockName, record) {
  const filePath = lockPath(homeDir, lockName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`);
}

function assertValidIsoTimestamp(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(Number.isNaN(Date.parse(value)), false);
}
