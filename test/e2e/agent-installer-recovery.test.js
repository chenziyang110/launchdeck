import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { AgentInstallerError } from '../../src/agent/errors.js';
import { digestCanonical } from '../../src/agent/digests.js';
import { createBackupStore } from '../../src/agent/state/backup-store.js';
import { collectArtifactPins, isArtifactPinned } from '../../src/agent/artifacts/references.js';
import { createCanonicalTransactionPlan } from '../../src/agent/state/transaction-plan.js';
import { createInstallerReconciler } from '../../src/agent/state/reconciliation.js';
import { createInstallerTransactionCoordinator } from '../../src/agent/state/transaction-coordinator.js';
import { createOperationJournal } from '../../src/control-plane/operation-journal.js';
import { createPublicInstallerReconciler } from '../../src/agent/state/public-reconciliation.js';
import { createReceiptStore } from '../../src/agent/state/receipt-store.js';
import { resolveInstallationScope } from '../../src/agent/state/scope-resolver.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(testDir, '..', 'fixtures', 'agent-installer-recovery');
const matrix = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'scenarios.json'), 'utf8'));

test('recovery matrix is parameterized for production authorities instead of static outcomes', () => {
  assert.deepEqual(new Set(matrix.requiredAuthorities), new Set([
    'createInstallerTransactionCoordinator',
    'createOperationJournal',
    'createBackupStore',
    'createReceiptStore',
    'createInstallerReconciler',
    'createPublicInstallerReconciler',
    'resourceLockRunner'
  ]));
  assert.deepEqual(new Set(matrix.requiredFaultClasses), new Set([
    'response-loss',
    'crash-windows',
    'reverse-rollback',
    'partial-effects',
    'indeterminate-effects',
    'contention',
    'prior-build-pins',
    'evidence-based-reconcile'
  ]));
});

test('response loss is observed from the production journal without replaying mutation work', async (t) => {
  const fixture = createRecoveryFixture(t, byId('response-loss-known-id'));
  const request = fixture.request();
  await assert.rejects(
    fixture.coordinator({
      faultInjector: async ({ point }) => {
        if (point === 'before_response') throw fatalFault(point);
      }
    }).execute(request),
    /fatal before_response/
  );
  const applyCount = fixture.counters.apply;
  const verifyCount = fixture.counters.verify;

  const recovered = await fixture.coordinator().execute(request);
  const record = await fixture.journal.get(request.operationId);

  assert.equal(recovered.outcome, 'succeeded');
  assert.equal(recovered.recoveredFromJournal, true);
  assert.equal(recovered.replayed, false);
  assert.equal(fixture.counters.apply, applyCount);
  assert.equal(fixture.counters.verify, verifyCount);
  assert.equal(record.state, 'succeeded');
  assert.equal(record.installer.terminalResult.outcome, 'succeeded');
});

test('crash windows leave durable journal, backup, effect, receipt, and pin evidence', async (t) => {
  for (const [index, window] of byId('crash-windows').windows.entries()) {
    await t.test(window, async (t) => {
      const fixture = createRecoveryFixture(t, byId('crash-windows'));
      const request = fixture.request({
        operationId: opId(`crash${index}`),
        actionCount: 1
      });
      await assert.rejects(
        fixture.coordinator({
          faultInjector: async ({ point }) => {
            if (point === window) throw fatalFault(point);
          }
        }).execute(request),
        new RegExp(`fatal ${window}`)
      );

      const record = await fixture.journal.get(request.operationId);
      assert.equal(record.installer.kind, 'agent-installer');
      assert.equal(record.installer.previousBuildPins.includes(BUILD_OLD), true);
      const expectedBackupCount = ['after_prepared', 'after_running'].includes(window) ? 0 : 1;
      assert.equal(record.installer.backupRefs.length >= expectedBackupCount, true);
      if (['after_effect', 'after_verification', 'after_receipt', 'before_response'].includes(window)) {
        assert.equal(record.installer.effects.length, 1);
        assert.equal(fixture.readTarget(0), 'desired-0');
      }
      if (['after_receipt', 'before_response'].includes(window)) {
        assert.equal(fixture.receiptStore.read(request.receiptCandidate.receiptId) !== null, true);
      }
    });
  }
});

test('reverse rollback is produced by the product coordinator in reverse action order', async (t) => {
  const fixture = createRecoveryFixture(t, byId('reverse-rollback-after-launcher'));
  const request = fixture.request({
    operationId: 'op_reverserollback00000001',
    actionCount: 3,
    verify: async () => {
      fixture.trace.push('verify:failed');
      throw new AgentInstallerError(
        'agent_runtime_verification_failed',
        'Runtime verification failed after launcher mutation.',
        { effectCertainty: 'complete' }
      );
    }
  });

  const result = await fixture.coordinator().execute(request);
  const record = await fixture.journal.get(request.operationId);

  assert.equal(result.outcome, 'failed-and-rolled-back');
  assert.equal(result.effectCertainty, 'complete');
  assert.deepEqual(record.installer.rollbackEvidence.map((entry) => entry.actionId), [
    'action-2',
    'action-1',
    'action-0'
  ]);
  assert.deepEqual(fixture.trace, [
    'apply:action-0',
    'apply:action-1',
    'apply:action-2',
    'verify:failed',
    'rollback:action-2',
    'rollback:action-1',
    'rollback:action-0'
  ]);
  assert.equal(fixture.receiptStore.read(request.receiptCandidate.receiptId), null);
});

test('partial and indeterminate effects are produced and remain non-replayable', async (t) => {
  const partialFixture = createRecoveryFixture(t, byId('partial-after-second-target'));
  const partialRequest = partialFixture.request({
    operationId: 'op_partialsecond000000001',
    actionCount: 2,
    rollbackFailures: new Set(['action-1']),
    verify: async () => {
      throw new AgentInstallerError(
        'agent_runtime_verification_failed',
        'Verification failed with one target still live.',
        { effectCertainty: 'complete' }
      );
    }
  });
  const partial = await partialFixture.coordinator().execute(partialRequest);
  const partialRecord = await partialFixture.journal.get(partialRequest.operationId);

  assert.equal(partial.outcome, 'partial');
  assert.equal(partial.effectCertainty, 'partial');
  assert.equal(partial.nextActions[0].operation, 'operation.reconcile');
  assert.equal(partialRecord.state, 'indeterminate');
  assert.equal(partialRecord.installer.rollbackErrors[0].actionId, 'action-1');
  const partialReplay = await partialFixture.coordinator().execute(partialRequest);
  assert.equal(partialReplay.recoveredFromJournal, true);
  assert.equal(partialFixture.counters.apply, 2);

  const unknownFixture = createRecoveryFixture(t, byId('indeterminate-response-loss'));
  const unknownRequest = unknownFixture.request({
    operationId: 'op_unknownresponse0000001',
    applyFailures: new Map([
      ['action-0', new AgentInstallerError(
        'agent_apply_completion_unknown',
        'Host response was lost after apply boundary.',
        { effectCertainty: 'unknown' }
      )]
    ])
  });
  const unknown = await unknownFixture.coordinator().execute(unknownRequest);
  const unknownRecord = await unknownFixture.journal.get(unknownRequest.operationId);

  assert.equal(unknown.outcome, 'indeterminate');
  assert.equal(unknown.effectCertainty, 'unknown');
  assert.equal(unknown.nextActions[0].operation, 'operation.reconcile');
  assert.equal(unknownRecord.state, 'indeterminate');
  assert.equal(unknownFixture.counters.rollback, 0);
});

test('resource lock contention refuses the overlapping operation before effects or second journal writes', async (t) => {
  const fixture = createRecoveryFixture(t, byId('contention-overlapping-mutation'));
  const request = fixture.request({ operationId: 'op_contentionfirst000001' });
  const contention = new AgentInstallerError(
    'agent_lifecycle_contention',
    'Overlapping installer mutation is already running.',
    { effectCertainty: 'none' }
  );

  const result = await fixture.coordinator({
    resourceLockRunner: async () => {
      throw contention;
    }
  }).execute(request);

  assert.equal(result.outcome, 'refused');
  assert.equal(result.effectCertainty, 'none');
  assert.equal(result.error.code, 'agent_lifecycle_contention');
  assert.equal(fixture.counters.apply, 0);
  await assert.rejects(fixture.journal.get(request.operationId), /missing|expired/i);
});

test('prior and recovery build pins are retained by product artifact reference accounting', async (t) => {
  const fixture = createRecoveryFixture(t, byId('prior-and-recovery-build-pins'));
  const request = fixture.request({
    operationId: 'op_priorpin000000000001',
    previousBuildPins: [BUILD_OLD, BUILD_RECOVERY]
  });
  await assert.rejects(
    fixture.coordinator({
      faultInjector: async ({ point }) => {
        if (point === 'after_effect') throw fatalFault(point);
      }
    }).execute(request),
    /fatal after_effect/
  );

  const record = await fixture.journal.get(request.operationId);
  const references = collectArtifactPins({
    receipts: [fixture.previousReceipt],
    transactions: [record],
    backups: [],
    reconciliationRecords: []
  });

  assert.equal(isArtifactPinned(references, BUILD_NEW), true);
  assert.equal(isArtifactPinned(references, BUILD_OLD), true);
  assert.equal(isArtifactPinned(references, BUILD_RECOVERY), true);
  assert.equal(isArtifactPinned(references, BUILD_UNUSED), false);
});

test('product reconciler classifies evidence without replaying uncertain work', async (t) => {
  const fixture = createRecoveryFixture(t, byId('reconcile-no-replay'));
  const request = fixture.request({
    operationId: 'op_reconcilenoreplay00001',
    actionCount: 2,
    rollbackFailures: new Set(['action-1']),
    verify: async () => {
      throw new AgentInstallerError(
        'agent_runtime_verification_failed',
        'Runtime verification failed.',
        { effectCertainty: 'complete' }
      );
    }
  });
  const partial = await fixture.coordinator().execute(request);
  assert.equal(partial.outcome, 'partial');
  const applyCount = fixture.counters.apply;
  const reconciler = createInstallerReconciler({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    resourceLockRunner: async (_options, callback) => callback([]),
    evidenceProvider: async () => ({
      lockEvidence: { state: 'released' },
      liveTargetEvidence: [
        {
          targetId: request.actions[0].targetId,
          ownershipBoundary: request.actions[0].ownershipBoundary,
          classification: 'fully-rolled-back',
          observedDigest: request.actions[0].preconditionDigest
        },
        {
          targetId: request.actions[1].targetId,
          ownershipBoundary: request.actions[1].ownershipBoundary,
          classification: 'managed-effect-remains',
          observedDigest: request.actions[1].desiredDigest
        }
      ],
      artifactEvidence: [{ buildIdentity: request.plan.buildIdentity, classification: 'verified' }],
      receiptEvidence: { classification: 'absent' }
    })
  });

  const reconciled = await reconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });
  const record = await fixture.journal.get(request.operationId);

  assert.equal(reconciled.outcome, 'partial');
  assert.equal(reconciled.replayed, false);
  assert.equal(record.state, 'reconciled');
  assert.equal(record.installer.reconciliationEvidence.classification, 'partial');
  assert.equal(fixture.counters.apply, applyCount);
  assert.equal(reconciled.nextActions[0].operation, 'agent.repair');
});

test('public reconciliation observes only canonical current-receipt-owned paths and fails closed', async (t) => {
  const fixture = createRecoveryFixture(t, byId('reconcile-no-replay'));
  const request = fixture.request({
    operationId: 'op_publicreconcile000001',
    actionCount: 1,
    targetRelativePaths: [path.join('.codex', 'mcp.json')],
    ownershipBoundaries: ['mcpServers.launchdeck'],
    targetIds: ['codex:project:mcp']
  });
  await assert.rejects(
    fixture.coordinator({
      faultInjector: async ({ point }) => {
        if (point === 'after_receipt') throw fatalFault(point);
      }
    }).execute(request),
    /fatal after_receipt/
  );
  const touched = [];
  const publicReconciler = createPublicInstallerReconciler({
    env: fixture.env,
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    artifactStore: { inspect: (buildIdentity) => ({ state: 'verified', buildIdentity }) },
    resourceLockRunner: async (_options, callback) => callback([]),
    fileSystem: trackedFileSystem((entry) => touched.push(entry))
  });

  const result = await publicReconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });
  assert.equal(result.outcome, 'succeeded');
  assert.equal(touched.some((entry) => entry.kind === 'read' && entry.path === request.actions[0].targetPath), true);

  const forged = fixture.request({
    operationId: 'op_publicforged000000001',
    actionCount: 1,
    targetRelativePaths: [path.join('.codex', 'mcp.json')],
    ownershipBoundaries: ['mcpServers.launchdeck'],
    targetIds: ['codex:project:mcp']
  });
  await assert.rejects(
    fixture.coordinator({
      faultInjector: async ({ point }) => {
        if (point === 'after_receipt') throw fatalFault(point);
      }
    }).execute(forged),
    /fatal after_receipt/
  );
  const forgedPath = path.resolve(fixture.root, 'outside-forged-target.json');
  fs.writeFileSync(forgedPath, 'desired-0', 'utf8');
  tamperJournalTargetPath(fixture, forged.operationId, forgedPath);
  const touchedAfterForge = [];
  const forgedResult = await createPublicInstallerReconciler({
    env: fixture.env,
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    artifactStore: { inspect: (buildIdentity) => ({ state: 'verified', buildIdentity }) },
    resourceLockRunner: async (_options, callback) => callback([]),
    fileSystem: trackedFileSystem((entry) => touchedAfterForge.push(entry))
  }).reconcile({
    operationId: forged.operationId,
    inputDigest: forged.inputDigest
  });

  assert.equal(forgedResult.outcome, 'indeterminate');
  assert.equal(touchedAfterForge.some((entry) => entry.path === forgedPath), false);
});

function createRecoveryFixture(t, scenario) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `launchdeck-${scenario.id}-`));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(project, { recursive: true });
  const env = { LAUNCHDECK_HOME: home, HOME: path.join(root, 'user') };
  const clock = () => new Date('2026-07-23T12:00:00.000Z');
  const journal = createOperationJournal({ env, clock, eventWriter: async () => {} });
  const receiptStore = createReceiptStore({ env, clock });
  const backupStore = createBackupStore({ env, clock });
  const scope = resolveInstallationScope({ scope: 'project', projectRoot: fs.realpathSync.native(project) });
  const counters = { apply: 0, rollback: 0, verify: 0 };
  const trace = [];
  const previousReceipt = receiptStore.commit(previousReceiptCandidate(scope));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  return {
    root,
    env,
    journal,
    receiptStore,
    backupStore,
    scope,
    counters,
    trace,
    previousReceipt,
    coordinator(options = {}) {
      return createInstallerTransactionCoordinator({
        journal,
        receiptStore,
        backupStore,
        resourceLockRunner: async (_options, callback) => callback([]),
        ...options
      });
    },
    request(options = {}) {
      return transactionRequest({
        fixture: this,
        project,
        scope,
        counters,
        trace,
        ...options
      });
    },
    readTarget(index) {
      return fs.readFileSync(path.join(project, `.target-${index}.txt`), 'utf8');
    }
  };
}

function transactionRequest({
  fixture,
  project,
  scope,
  counters,
  trace,
  operationId = 'op_recoverydefault000001',
  actionCount = 1,
  previousBuildPins = [BUILD_OLD],
  applyFailures = new Map(),
  rollbackFailures = new Set(),
  verify,
  targetRelativePaths,
  ownershipBoundaries,
  targetIds
}) {
  const actions = Array.from({ length: actionCount }, (_, index) =>
    createAction({
      project,
      counters,
      trace,
      index,
      applyFailures,
      rollbackFailures,
      targetRelativePath: targetRelativePaths?.[index],
      ownershipBoundary: ownershipBoundaries?.[index],
      targetId: targetIds?.[index]
    })
  );
  const descriptions = actions.map(describeAction);
  const targets = descriptions.map((action) => {
    const [hostId, targetScope, component] = action.targetId.split(':');
    return {
      targetId: action.targetId,
      hostId,
      scope: targetScope,
      component,
      path: action.targetPath,
      ownershipBoundary: action.ownershipBoundary,
      ownership: 'launchdeck-owned',
      liveDigest: action.preconditionDigest,
      desiredDigest: action.desiredDigest
    };
  });
  const plan = createCanonicalTransactionPlan({
    planId: opPlanId(operationId),
    buildIdentity: BUILD_NEW,
    scope: scope.scope,
    scopeIdentity: scope.scopeIdentity,
    projectIdentity: scope.projectIdentity,
    targetIds: descriptions.map((action) => action.targetId),
    includeLauncher: true,
    previousBuildPins,
    targets,
    actions: descriptions
  });
  const receiptCandidate = {
    receiptId: `receipt_${operationId.slice(3)}`,
    scope: plan.scope,
    scopeIdentity: plan.scopeIdentity,
    projectIdentity: plan.projectIdentity,
    buildIdentity: plan.buildIdentity,
    targets: descriptions.map((action) => ({
      targetId: action.targetId,
      ownershipBoundary: action.ownershipBoundary,
      desiredDigest: action.desiredDigest
    })),
    ownedDigests: descriptions.map((action) => action.desiredDigest),
    verificationEvidence: [],
    committedAt: '2026-07-23T12:00:00.000Z',
    supersedesReceiptId: fixture.previousReceipt.receiptId
  };
  return {
    operationId,
    operation: 'update',
    inputDigest: digestCanonical({ operationId, planDigest: plan.planDigest }),
    plan,
    approval: {
      approved: true,
      planDigest: plan.planDigest,
      planBindingDigest: plan.planBindingDigest
    },
    actions,
    receiptCandidate,
    revalidatePlan: async () => ({ valid: true, planDigest: plan.planDigest }),
    verify: verify ?? (async () => {
      counters.verify += 1;
      trace.push('verify:ok');
      return descriptions.map((action) => ({
        targetId: action.targetId,
        kind: 'runtime-and-digest',
        buildIdentity: plan.buildIdentity,
        observedDigest: action.desiredDigest,
        verified: true
      }));
    })
  };
}

function createAction({
  project,
  counters,
  trace,
  index,
  applyFailures,
  rollbackFailures,
  targetRelativePath,
  ownershipBoundary,
  targetId
}) {
  const actionId = `action-${index}`;
  const targetPath = path.resolve(project, targetRelativePath ?? `.target-${index}.txt`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `original-${index}`, 'utf8');
  const preconditionDigest = digestText(`original-${index}`);
  const desiredDigest = digestText(`desired-${index}`);
  return {
    actionId,
    kind: 'write-fixture-target',
    targetId: targetId ?? `codex:project:${index === 0 ? 'skill' : `mcp${index}`}`,
    ownershipBoundary: ownershipBoundary ?? `launchdeck-boundary-${index}`,
    targetPath,
    preconditionDigest,
    desiredDigest,
    requiresBackup: true,
    async apply() {
      counters.apply += 1;
      trace.push(`apply:${actionId}`);
      const failure = applyFailures.get(actionId);
      if (failure) throw failure;
      fs.writeFileSync(targetPath, `desired-${index}`, 'utf8');
      return {
        effectId: `effect-${actionId}`,
        actionId,
        targetId: this.targetId,
        ownershipBoundary: this.ownershipBoundary,
        effectType: this.kind,
        beforeDigest: this.preconditionDigest,
        afterDigest: this.desiredDigest,
        effectCertainty: 'complete'
      };
    },
    async rollback() {
      counters.rollback += 1;
      trace.push(`rollback:${actionId}`);
      if (rollbackFailures.has(actionId)) {
        throw new AgentInstallerError(
          'agent_rollback_verification_unknown',
          'Rollback could not be proven.',
          { effectCertainty: 'unknown' }
        );
      }
      fs.writeFileSync(targetPath, `original-${index}`, 'utf8');
      return {
        restored: true,
        restoredDigest: this.preconditionDigest,
        verified: true
      };
    }
  };
}

function previousReceiptCandidate(scope) {
  return {
    receiptId: 'receipt_previoususable0001',
    scope: scope.scope,
    scopeIdentity: scope.scopeIdentity,
    projectIdentity: scope.projectIdentity,
    buildIdentity: BUILD_OLD,
    targets: [{
      targetId: 'previous:project:skill',
      ownershipBoundary: 'previous-boundary',
      desiredDigest: digestText('previous')
    }],
    ownedDigests: [digestText('previous')],
    verificationEvidence: [{
      targetId: 'previous:project:skill',
      kind: 'runtime-and-digest',
      buildIdentity: BUILD_OLD,
      observedDigest: digestText('previous'),
      verified: true
    }],
    committedAt: '2026-07-23T11:59:00.000Z',
    supersedesReceiptId: null
  };
}

function describeAction(action) {
  return {
    actionId: action.actionId,
    kind: action.kind,
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    targetPath: action.targetPath,
    preconditionDigest: action.preconditionDigest,
    desiredDigest: action.desiredDigest,
    requiresBackup: action.requiresBackup
  };
}

function trackedFileSystem(onTouch) {
  return {
    lstatSync(targetPath) {
      onTouch({ kind: 'lstat', path: path.resolve(targetPath) });
      return fs.lstatSync(targetPath);
    },
    readFileSync(targetPath, options) {
      onTouch({ kind: 'read', path: path.resolve(targetPath) });
      return fs.readFileSync(targetPath, options);
    },
    realpathSync: fs.realpathSync
  };
}

function tamperJournalTargetPath(fixture, operationId, nextPath) {
  const recordPath = fixture.journal.paths.recordPath(operationId);
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  record.installer.actions[0].targetPath = nextPath;
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function byId(id) {
  const found = matrix.cases.find((entry) => entry.id === id);
  assert.ok(found, `missing recovery fixture ${id}`);
  return found;
}

function digestText(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function opPlanId(operationId) {
  return `plan_${operationId.slice(3).padEnd(16, '0')}`;
}

function opId(seed) {
  return `op_${seed.replace(/[^A-Za-z0-9_-]/g, '').padEnd(16, '0')}`;
}

function fatalFault(point) {
  const error = new Error(`fatal ${point}`);
  error.fatal = true;
  return error;
}

const BUILD_OLD = `sha256:${'1'.repeat(64)}`;
const BUILD_NEW = `sha256:${'2'.repeat(64)}`;
const BUILD_RECOVERY = `sha256:${'9'.repeat(64)}`;
const BUILD_UNUSED = `sha256:${'0'.repeat(64)}`;
