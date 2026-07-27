import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { acquireLock } from '../../../src/control-plane/locks.js';
import {
  assessInstallerLockTakeover,
  installerResourceLockNames,
  withInstallerResourceLocks
} from '../../../src/agent/state/resource-locks.js';
import { createIsolatedStateFixture } from '../../fixtures/agent-state/isolated-state-fixture.js';

test('installer resources lock in artifact, scope, sorted target, launcher order', (t) => {
  const fixture = createIsolatedStateFixture(t, 'lock-order');
  const names = installerResourceLockNames({
    operationId: 'op_0123456789abcdef',
    buildIdentity: `sha256:${'b'.repeat(64)}`,
    scopeIdentity: `project:sha256:${'c'.repeat(64)}`,
    targetIds: ['target-z', 'target-a', 'target-z'],
    includeLauncher: true,
    env: fixture.env
  });

  assert.deepEqual(names, [
    'agent-artifact-store',
    `agent-receipt-project-sha256-${'c'.repeat(64)}`,
    'agent-target-target-a',
    'agent-target-target-z',
    'agent-launcher'
  ]);
  assert.equal(Object.isFrozen(names), true);
});

test('installer lock runner reuses the existing lock interface and releases in reverse order', async (t) => {
  const fixture = createIsolatedStateFixture(t, 'lock-runner');
  const acquired = [];
  const released = [];
  const result = await withInstallerResourceLocks({
    operationId: 'op_0123456789abcdef',
    buildIdentity: `sha256:${'b'.repeat(64)}`,
    scopeIdentity: `project:sha256:${'c'.repeat(64)}`,
    targetIds: ['target-b', 'target-a'],
    includeLauncher: true,
    env: fixture.env,
    lockRunner: async (options, callback) => {
      assert.equal(options.env.LAUNCHDECK_HOME, fixture.launchdeckHome);
      assert.equal(path.isAbsolute(options.env.LAUNCHDECK_HOME), true);
      acquired.push(options.lockName);
      try {
        return await callback(Object.freeze({ lockName: options.lockName }));
      } finally {
        released.push(options.lockName);
      }
    }
  }, (locks) => {
    assert.deepEqual(locks.map((entry) => entry.lockName), acquired);
    return 'locked';
  });

  assert.equal(result, 'locked');
  assert.deepEqual(released, [...acquired].reverse());
});

test('lock handles expose verifiable ownership and renewable lease evidence', async (t) => {
  const fixture = createIsolatedStateFixture(t, 'lock-lease');
  const lock = await acquireLock({
    lockName: 'agent-target-renewable',
    transactionId: 'op_0123456789abcdef',
    ttlMs: 30_000,
    env: fixture.env
  });
  t.after(() => lock.release());

  const ownershipToken = lock.record.ownershipToken;
  const beforeHeartbeat = lock.record.heartbeatAt;
  assert.match(ownershipToken, /^[0-9a-f]{48}$/);
  assert.equal(await lock.assertOwned(), true);
  const renewed = await lock.renew();
  assert.equal(renewed.ownershipToken, ownershipToken);
  assert.ok(Date.parse(renewed.heartbeatAt) >= Date.parse(beforeHeartbeat));
  assert.equal(await lock.assertOwned(), true);
});

test('expired age alone cannot authorize takeover without liveness, journal, and live-target evidence', (t) => {
  const fixture = createIsolatedStateFixture(t, 'lock-takeover');
  const expiredRecord = {
    lockName: 'agent-target-target-a',
    ownerPid: 4242,
    ownerStartEvidence: 'process-start-a',
    operationId: 'op_0123456789abcdef',
    acquiredAt: '2026-07-01T00:00:00.000Z',
    leaseUpdatedAt: '2026-07-01T00:00:00.000Z'
  };
  const agedOnly = assessInstallerLockTakeover({
    lockRecord: expiredRecord,
    processEvidence: { state: 'unknown', ownerStartEvidence: null },
    journalEvidence: { state: 'running' },
    liveTargetEvidence: { classification: 'unknown' },
    now: new Date('2027-07-01T00:00:00.000Z'),
    env: fixture.env
  });

  assert.deepEqual(agedOnly, {
    allowed: false,
    classification: 'indeterminate',
    reason: 'insufficient-owner-and-effect-evidence',
    nextAction: 'operation.reconcile'
  });

  const provenDeadNoEffects = assessInstallerLockTakeover({
    lockRecord: expiredRecord,
    processEvidence: {
      state: 'not-running',
      ownerStartEvidence: 'different-process-start'
    },
    journalEvidence: {
      state: 'prepared',
      effectsCertainty: 'none'
    },
    leaseEvidence: { state: 'expired' },
    ownerAlive: false,
    liveTargetEvidence: {
      classification: 'no-effects',
      preconditionsMatch: true
    },
    now: new Date('2027-07-01T00:00:00.000Z'),
    env: fixture.env
  });

  assert.equal(provenDeadNoEffects.allowed, true);
  assert.equal(provenDeadNoEffects.classification, 'abandoned-no-effects');

  const liveOwner = assessInstallerLockTakeover({
    lockRecord: expiredRecord,
    ownerAlive: true,
    processEvidence: {
      state: 'not-running',
      ownerStartEvidence: 'different-process-start'
    },
    leaseEvidence: { state: 'expired' },
    journalEvidence: {
      state: 'prepared',
      effectsCertainty: 'none'
    },
    liveTargetEvidence: {
      classification: 'no-effects',
      preconditionsMatch: true
    }
  });
  assert.equal(liveOwner.allowed, false, 'direct owner liveness evidence always denies takeover');
});
