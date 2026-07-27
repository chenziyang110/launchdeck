import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  collectArtifactGarbage,
  planArtifactGarbageCollection
} from '../../../src/agent/artifacts/gc.js';
import {
  collectArtifactPins,
  isArtifactPinned
} from '../../../src/agent/artifacts/references.js';
import {
  COLLECTABLE_BUILD,
  createLauncherFixture,
  CURRENT_BUILD,
  makeArtifactObservation,
  PREVIOUS_BUILD,
  QUARANTINED_BUILD,
  RECOVERY_BUILD
} from '../../fixtures/agent-launcher/launcher-fixture.js';

const NOW = new Date('2026-07-23T00:00:00.000Z');
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

test('current receipts and every open recovery record hard-pin current, previous, and recovery builds', () => {
  const pins = collectArtifactPins({
    receipts: [canonicalReceipt('receipt_current0001', CURRENT_BUILD)],
    transactions: [{
      operationId: 'op_0123456789abcdef',
      state: 'partial',
      installer: {
        buildIdentity: CURRENT_BUILD,
        previousBuildPins: [PREVIOUS_BUILD],
        receiptCandidate: { buildIdentity: RECOVERY_BUILD },
        backupRefs: []
      }
    }, {
      operationId: 'op_fedcba9876543210',
      state: 'succeeded',
      installer: {
        buildIdentity: COLLECTABLE_BUILD,
        previousBuildPins: [COLLECTABLE_BUILD]
      }
    }],
    backups: [{
      backupId: 'backup-recovery',
      state: 'required',
      requiredBuildIdentities: [RECOVERY_BUILD]
    }],
    reconciliationRecords: [{
      operationId: 'op_aaaaaaaaaaaaaaaa',
      state: 'indeterminate',
      installer: {
        buildIdentity: CURRENT_BUILD,
        requiredBuildIdentities: [PREVIOUS_BUILD]
      }
    }]
  });

  assert.equal(isArtifactPinned(pins, CURRENT_BUILD), true);
  assert.equal(isArtifactPinned(pins, PREVIOUS_BUILD), true);
  assert.equal(isArtifactPinned(pins, RECOVERY_BUILD), true);
  assert.equal(isArtifactPinned(pins, COLLECTABLE_BUILD), false);
  assert.deepEqual(
    pins.map((entry) => entry.buildIdentity),
    [CURRENT_BUILD, PREVIOUS_BUILD, RECOVERY_BUILD].sort()
  );
  for (const pin of pins) {
    assert.equal(Object.isFrozen(pin.reasons), true);
    assert.equal(pin.reasons.length > 0, true);
  }
});

test('unknown receipt and journal reference dialects fail closed instead of yielding zero pins', () => {
  assert.throws(
    () => collectArtifactPins({
      receipts: [{ receiptId: 'receipt_unknown', buildIdentity: CURRENT_BUILD }]
    }),
    { code: 'agent_artifact_references_invalid' }
  );
  assert.throws(
    () => collectArtifactPins({
      transactions: [{
        operationId: 'op_0123456789abcdef',
        state: 'indeterminate',
        metadata: { buildIdentity: CURRENT_BUILD }
      }]
    }),
    { code: 'agent_artifact_references_invalid' }
  );
});

test('GC eligibility is deterministic: pinned, young, corrupt, quarantined, or unowned builds are never eligible', (t) => {
  const fixture = createLauncherFixture(t, 'gc-plan');
  const pins = collectArtifactPins({
    receipts: [canonicalReceipt('receipt_current0001', CURRENT_BUILD)]
  });
  const builds = [
    makeArtifactObservation(fixture.launchdeckHome, CURRENT_BUILD),
    makeArtifactObservation(fixture.launchdeckHome, PREVIOUS_BUILD, {
      unreferencedSince: new Date(NOW.getTime() - THIRTY_DAYS_MS + 1).toISOString()
    }),
    makeArtifactObservation(fixture.launchdeckHome, COLLECTABLE_BUILD, {
      unreferencedSince: new Date(NOW.getTime() - THIRTY_DAYS_MS).toISOString()
    }),
    makeArtifactObservation(fixture.launchdeckHome, RECOVERY_BUILD, {
      state: 'corrupt',
      verified: false
    }),
    makeArtifactObservation(fixture.launchdeckHome, QUARANTINED_BUILD, {
      state: 'quarantined',
      verified: false
    }),
    makeArtifactObservation(fixture.launchdeckHome, `sha256:${'6'.repeat(64)}`, {
      ownershipVerified: false
    })
  ];

  const decisions = planArtifactGarbageCollection({
    builds,
    pins,
    now: NOW
  });
  const byBuild = new Map(decisions.map((entry) => [entry.buildIdentity, entry]));

  assert.equal(byBuild.get(CURRENT_BUILD).decision, 'pinned');
  assert.equal(byBuild.get(PREVIOUS_BUILD).decision, 'retained');
  assert.equal(byBuild.get(COLLECTABLE_BUILD).decision, 'eligible');
  assert.equal(byBuild.get(RECOVERY_BUILD).decision, 'quarantined');
  assert.equal(byBuild.get(QUARANTINED_BUILD).decision, 'quarantined');
  assert.equal(byBuild.get(`sha256:${'6'.repeat(64)}`).decision, 'retained');
  assert.equal(byBuild.get(COLLECTABLE_BUILD).eligibleAfter, NOW.toISOString());
  assert.equal(byBuild.get(CURRENT_BUILD).referenceCount > 0, true);
  assert.equal(Object.isFrozen(decisions), true);
});

test('GC acquires the artifact-store lock, recomputes pins immediately before bounded exact-path deletion, and supports dry-run', async (t) => {
  const fixture = createLauncherFixture(t, 'gc-lock');
  const currentCandidate = makeArtifactObservation(
    fixture.launchdeckHome,
    CURRENT_BUILD
  );
  const collectableCandidate = makeArtifactObservation(
    fixture.launchdeckHome,
    COLLECTABLE_BUILD
  );
  let lockHeld = false;
  let referenceReads = 0;
  const removed = [];

  const result = await collectArtifactGarbage({
    env: fixture.env,
    now: NOW,
    maxDeletes: 1,
    listBuilds: () => {
      assert.equal(lockHeld, true);
      return [currentCandidate, collectableCandidate];
    },
    listReferenceRecords: () => {
      assert.equal(lockHeld, true);
      referenceReads += 1;
      return referenceReads === 1
        ? { receipts: [] }
        : {
            receipts: [{
              ...canonicalReceipt('receipt_became_live', CURRENT_BUILD)
            }]
          };
    },
    lockRunner: async (options, callback) => {
      assert.equal(options.lockName, 'agent-artifact-store');
      lockHeld = true;
      try {
        return await callback(Object.freeze({ lockName: options.lockName }));
      } finally {
        lockHeld = false;
      }
    },
    removeBuild: (candidate) => {
      assert.equal(lockHeld, true);
      removed.push(candidate);
    }
  });

  assert.equal(referenceReads >= 3, true, 'pins are recomputed for each deletion candidate');
  assert.deepEqual(removed.map((entry) => entry.buildIdentity), [COLLECTABLE_BUILD]);
  assert.equal(removed[0].path, collectableCandidate.path);
  assert.equal(result.deleted.length, 1);
  assert.equal(result.deleted[0].buildIdentity, COLLECTABLE_BUILD);
  assert.equal(
    result.decisions.find((entry) => entry.buildIdentity === CURRENT_BUILD).decision,
    'pinned'
  );

  const dryRunRemoved = [];
  const dryRun = await collectArtifactGarbage({
    env: fixture.env,
    now: NOW,
    dryRun: true,
    listBuilds: () => [collectableCandidate],
    listReferenceRecords: () => ({ receipts: [] }),
    lockRunner: async (options, callback) => callback({
      lockName: options.lockName
    }),
    removeBuild: (candidate) => dryRunRemoved.push(candidate)
  });
  assert.equal(dryRun.decisions[0].decision, 'eligible');
  assert.deepEqual(dryRunRemoved, []);
  assert.deepEqual(dryRun.deleted, []);
});

test('GC rejects a linked artifact-root intermediate before invoking deletion', async (t) => {
  const fixture = createLauncherFixture(t, 'gc-root-link');
  const externalRoot = path.join(fixture.root, 'external-gc-root');
  const linkedRoot = path.join(
    fixture.launchdeckHome,
    'installer',
    'artifacts',
    'v1',
    'sha256'
  );
  fs.mkdirSync(externalRoot, { recursive: true });
  fs.mkdirSync(path.dirname(linkedRoot), { recursive: true });
  try {
    fs.symlinkSync(
      externalRoot,
      linkedRoot,
      process.platform === 'win32' ? 'junction' : 'dir'
    );
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip(`Directory link creation is unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const candidate = makeArtifactObservation(
    fixture.launchdeckHome,
    COLLECTABLE_BUILD
  );
  const removed = [];

  await assert.rejects(
    async () => collectArtifactGarbage({
      env: fixture.env,
      now: NOW,
      listBuilds: () => [candidate],
      listReferenceRecords: () => ({ receipts: [] }),
      lockRunner: async (options, callback) => callback({
        lockName: options.lockName
      }),
      removeBuild: (entry) => removed.push(entry)
    }),
    { code: 'agent_artifact_path_escape' }
  );
  assert.deepEqual(removed, []);
});

function canonicalReceipt(receiptId, buildIdentity) {
  return {
    receiptId,
    receiptDigest: `sha256:${'e'.repeat(64)}`,
    scope: 'project',
    scopeIdentity: `project:sha256:${'d'.repeat(64)}`,
    projectIdentity: `sha256:${'d'.repeat(64)}`,
    buildIdentity,
    targets: [],
    ownedDigests: [],
    verificationEvidence: []
  };
}
