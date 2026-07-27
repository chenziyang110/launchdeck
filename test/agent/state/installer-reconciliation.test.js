import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { AgentInstallerError } from '../../../src/agent/errors.js';
import {
  createPublicInstallerReconciler
} from '../../../src/agent/state/public-reconciliation.js';
import {
  createInstallerReconciler
} from '../../../src/agent/state/reconciliation.js';
import {
  createInstallerTransactionCoordinator
} from '../../../src/agent/state/transaction-coordinator.js';
import { createOperationHandlers } from '../../../src/kernel/operations/operation.js';
import {
  createAgentTransactionFixture,
  fatalFault
} from '../../fixtures/agent-transactions/transaction-fixture.js';

test('insufficient live evidence becomes durable indeterminate state without replay', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'reconcile-indeterminate');
  const request = fixture.transactionRequest({
    operationId: 'op_reconcileunknown00000001'
  });
  await interruptAt(fixture, request, 'after_effect');
  const secret = 'reconcile_token_must_not_persist';
  const reconciler = createInstallerReconciler({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    evidenceProvider: async ({ record }) => {
      fixture.counters.reconcileObserve += 1;
      assert.equal(record.state, 'running');
      return {
        lockEvidence: {
          state: 'unknown',
          ownerPid: 4242
        },
        liveTargetEvidence: [{
          targetId: request.actions[0].targetId,
          classification: 'unknown',
          API_TOKEN: secret,
          rawConfig: `{"token":"${secret}"}`
        }],
        artifactEvidence: [{
          buildIdentity: request.plan.buildIdentity,
          classification: 'verified'
        }],
        receiptEvidence: {
          classification: 'absent'
        }
      };
    }
  });
  const appliesBefore = fixture.counters.apply;

  const result = await reconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });
  const record = await fixture.readJournal(request.operationId);

  assert.equal(result.outcome, 'indeterminate');
  assert.equal(result.effectCertainty, 'unknown');
  assert.equal(result.classification, 'indeterminate');
  assert.equal(result.replayed, false);
  assert.equal(record.state, 'indeterminate');
  assert.equal(record.effectsCertainty, 'unknown');
  assert.equal(record.retainUntil, null);
  assert.equal(record.installer.reconciliationEvidence.classification, 'indeterminate');
  assert.equal(JSON.stringify(record).includes(secret), false);
  assert.equal(fixture.counters.reconcileObserve, 1);
  assert.equal(fixture.counters.apply, appliesBefore);
  assert.equal(fixture.counters.rollback, 0);
  assert.equal(result.nextActions[0].operation, 'operation.reconcile');
});

test('a committed receipt plus matching live targets reconciles response loss as success', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'reconcile-receipt');
  const request = fixture.transactionRequest({
    operationId: 'op_reconcilereceipt0000001'
  });
  await interruptAt(fixture, request, 'after_receipt');
  const receiptBefore = fixture.receiptStore.read(request.receiptCandidate.receiptId);
  const appliesBefore = fixture.counters.apply;
  const verifiesBefore = fixture.counters.verify;
  const reconciler = createInstallerReconciler({
    journal: fixture.journal,
    receiptStore: {
      read: fixture.receiptStore.read,
      readCurrent: fixture.receiptStore.readCurrent,
      commit() {
        throw new Error('reconciliation must not recommit a receipt');
      }
    },
    evidenceProvider: async () => ({
      lockEvidence: {
        state: 'abandoned',
        processState: 'not-running',
        ownerStartIdentityChanged: true,
        leaseState: 'expired'
      },
      liveTargetEvidence: request.actions.map((action) => ({
        targetId: action.targetId,
        classification: 'verified',
        observedDigest: action.desiredDigest,
        buildIdentity: request.plan.buildIdentity
      })),
      artifactEvidence: [{
        buildIdentity: request.plan.buildIdentity,
        classification: 'verified'
      }],
      receiptEvidence: {
        classification: 'committed',
        receiptId: receiptBefore.receiptId,
        receiptDigest: receiptBefore.receiptDigest
      }
    })
  });

  const result = await reconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });
  const record = await fixture.readJournal(request.operationId);
  const receiptAfter = fixture.receiptStore.read(request.receiptCandidate.receiptId);

  assert.equal(result.outcome, 'succeeded');
  assert.equal(result.effectCertainty, 'complete');
  assert.equal(result.classification, 'succeeded');
  assert.equal(result.replayed, false);
  assert.equal(result.receiptId, receiptBefore.receiptId);
  assert.equal(record.state, 'reconciled');
  assert.equal(record.resolvedOutcome, 'succeeded');
  assert.deepEqual(receiptAfter, receiptBefore);
  assert.equal(fixture.counters.apply, appliesBefore);
  assert.equal(fixture.counters.verify, verifiesBefore);
});

test('an immutable receipt that is not the current scope receipt cannot reconcile as success', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'reconcile-orphan-receipt');
  const request = fixture.transactionRequest({
    operationId: 'op_reconcileorphan000000001'
  });
  await interruptAt(fixture, request, 'after_receipt');
  const receipt = fixture.receiptStore.read(request.receiptCandidate.receiptId);
  const reconciler = createInstallerReconciler({
    journal: fixture.journal,
    receiptStore: {
      read: fixture.receiptStore.read,
      readCurrent: () => null
    },
    evidenceProvider: async () => ({
      lockEvidence: { state: 'released' },
      liveTargetEvidence: request.actions.map((action) => ({
        targetId: action.targetId,
        classification: 'verified',
        observedDigest: action.desiredDigest,
        buildIdentity: request.plan.buildIdentity
      })),
      artifactEvidence: [{
        buildIdentity: request.plan.buildIdentity,
        classification: 'verified'
      }],
      receiptEvidence: {
        classification: 'committed',
        receiptId: receipt.receiptId,
        receiptDigest: receipt.receiptDigest
      }
    })
  });

  const result = await reconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });

  assert.equal(result.outcome, 'indeterminate');
  assert.equal(result.replayed, false);
  assert.equal((await fixture.readJournal(request.operationId)).state, 'indeterminate');
});

test('matching targets and receipt cannot terminalize while original owner evidence is live', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'reconcile-live-owner');
  const request = fixture.transactionRequest({
    operationId: 'op_reconcileliveowner000001'
  });
  await interruptAt(fixture, request, 'after_receipt');
  const receipt = fixture.receiptStore.readCurrent(fixture.scope);
  const reconciler = createInstallerReconciler({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    evidenceProvider: async () => ({
      lockEvidence: {
        state: 'held',
        processState: 'running',
        ownerStartIdentityChanged: false,
        leaseState: 'live'
      },
      liveTargetEvidence: request.actions.map((action) => ({
        targetId: action.targetId,
        classification: 'verified',
        observedDigest: action.desiredDigest,
        buildIdentity: request.plan.buildIdentity
      })),
      artifactEvidence: [{
        buildIdentity: request.plan.buildIdentity,
        classification: 'verified'
      }],
      receiptEvidence: {
        classification: 'committed',
        receiptId: receipt.receiptId,
        receiptDigest: receipt.receiptDigest
      }
    })
  });

  const result = await reconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });

  assert.equal(result.outcome, 'indeterminate');
  assert.equal((await fixture.readJournal(request.operationId)).state, 'indeterminate');
});

test('proven abandoned no-effects work closes safely and requires a newly approved plan', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'reconcile-no-effects');
  const request = fixture.transactionRequest({
    operationId: 'op_reconcilenoeffects000001'
  });
  await interruptAt(fixture, request, 'after_prepared');
  const reconciler = createInstallerReconciler({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    evidenceProvider: async () => ({
      lockEvidence: {
        state: 'abandoned',
        processState: 'not-running',
        ownerStartIdentityChanged: true,
        leaseState: 'expired'
      },
      liveTargetEvidence: request.actions.map((action) => ({
        targetId: action.targetId,
        classification: 'no-effects',
        observedDigest: action.preconditionDigest,
        preconditionsMatch: true
      })),
      artifactEvidence: [{
        buildIdentity: request.plan.buildIdentity,
        classification: 'pinned'
      }],
      receiptEvidence: {
        classification: 'absent'
      }
    })
  });

  const result = await reconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });
  const record = await fixture.readJournal(request.operationId);

  assert.equal(result.classification, 'no-effects');
  assert.equal(result.outcome, 'failed-and-rolled-back');
  assert.equal(result.effectCertainty, 'complete');
  assert.equal(result.replayed, false);
  assert.equal(record.state, 'reconciled');
  assert.equal(record.resolvedOutcome, 'failed');
  assert.equal(fixture.counters.apply, 0);
  assert.equal(fixture.counters.verify, 0);
  assert.equal(fixture.receiptStore.read(request.receiptCandidate.receiptId), null);
  assert.deepEqual(result.nextActions, [{
    operation: 'agent.setup',
    reason: 'The abandoned operation had no effects; create and approve a fresh plan.',
    requiresApproval: true
  }]);
});

test('operation.reconcile dispatches installer journal kinds through the injected installer hook', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'operation-dispatch');
  const request = fixture.transactionRequest({
    operationId: 'op_operationdispatch0000001'
  });
  await interruptAt(fixture, request, 'after_prepared');
  const reconciler = createInstallerReconciler({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    evidenceProvider: async () => ({
      lockEvidence: {
        state: 'abandoned',
        processState: 'not-running',
        ownerStartIdentityChanged: true,
        leaseState: 'expired'
      },
      liveTargetEvidence: request.actions.map((action) => ({
        targetId: action.targetId,
        classification: 'no-effects',
        observedDigest: action.preconditionDigest,
        preconditionsMatch: true
      })),
      artifactEvidence: [],
      receiptEvidence: { classification: 'absent' }
    })
  });
  const handlers = createOperationHandlers({
    journal: fixture.journal,
    installerReconciler: reconciler
  });

  const envelope = await handlers['operation.reconcile']({
    request: { input: { operationId: request.operationId } }
  });

  assert.equal(envelope.journalStatus, 'reconciled');
  assert.equal(envelope.resource.data.record.resolvedOutcome, 'failed');
});

test('known mixed live state reconciles as partial and never broadens ownership', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'reconcile-partial');
  const restored = fixture.fileMutationAction({
    actionId: 'action-restored',
    targetId: 'codex:project:mcp',
    relativePath: '.codex/mcp.json'
  });
  const stillLive = fixture.fileMutationAction({
    actionId: 'action-still-live',
    targetId: 'claude:project:mcp',
    relativePath: '.mcp.json',
    rollback: async () => {
      throw new AgentInstallerError(
        'agent_rollback_verification_unknown',
        'Restore could not be proven.',
        { effectCertainty: 'unknown' }
      );
    }
  });
  const request = fixture.transactionRequest({
    operationId: 'op_reconcilepartial00000001',
    actions: [restored, stillLive],
    verify: async () => {
      throw new AgentInstallerError(
        'agent_runtime_verification_failed',
        'Runtime verification failed.',
        { effectCertainty: 'complete' }
      );
    }
  });
  const partial = await coordinatorFor(fixture).execute(request);
  assert.equal(partial.outcome, 'partial');
  const appliesBefore = fixture.counters.apply;
  const reconciler = createInstallerReconciler({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    evidenceProvider: async () => ({
      lockEvidence: { state: 'released' },
      liveTargetEvidence: [
        {
          targetId: restored.targetId,
          ownershipBoundary: restored.ownershipBoundary,
          classification: 'fully-rolled-back',
          observedDigest: restored.preconditionDigest
        },
        {
          targetId: stillLive.targetId,
          ownershipBoundary: stillLive.ownershipBoundary,
          classification: 'managed-effect-remains',
          observedDigest: stillLive.desiredDigest
        },
        {
          targetId: 'foreign:project:mcp',
          ownershipBoundary: 'mcpServers.foreign',
          classification: 'unrelated'
        }
      ],
      artifactEvidence: [{
        buildIdentity: request.plan.buildIdentity,
        classification: 'recovery-pinned'
      }],
      receiptEvidence: { classification: 'absent' }
    })
  });

  const result = await reconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });
  const record = await fixture.readJournal(request.operationId);

  assert.equal(result.classification, 'partial');
  assert.equal(result.outcome, 'partial');
  assert.equal(result.effectCertainty, 'partial');
  assert.equal(result.replayed, false);
  assert.equal(record.state, 'reconciled');
  assert.equal(record.resolvedOutcome, 'partial');
  assert.equal(fixture.counters.apply, appliesBefore);
  assert.equal(result.nextActions[0].operation, 'agent.repair');
  assert.deepEqual(result.nextActions[0].targetIds, [stillLive.targetId]);
  assert.equal(
    result.nextActions[0].targetIds.includes('foreign:project:mcp'),
    false,
    'reconciliation cannot claim unrelated ownership'
  );
});

test('same operation ID after response loss returns durable success without a second mutation', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'same-id-no-replay');
  const request = fixture.transactionRequest({
    operationId: 'op_sameidnoreplay000000001'
  });
  await interruptAt(fixture, request, 'before_response');
  const applyCount = fixture.counters.apply;
  const verifyCount = fixture.counters.verify;
  const coordinator = coordinatorFor(fixture);

  const recovered = await coordinator.execute(request);
  const digestMismatch = await coordinator.execute({
    ...request,
    inputDigest: `sha256:${'f'.repeat(64)}`
  });

  assert.equal(recovered.outcome, 'succeeded');
  assert.equal(recovered.recoveredFromJournal, true);
  assert.equal(recovered.replayed, false);
  assert.equal(fixture.counters.apply, applyCount);
  assert.equal(fixture.counters.verify, verifyCount);
  assert.equal(digestMismatch.outcome, 'refused');
  assert.equal(digestMismatch.error.code, 'operation_id_digest_mismatch');
  assert.equal(fixture.counters.apply, applyCount);
});

test('public installer reconciliation composition observes canonical live evidence and fails closed', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'public-reconcile');
  const request = fixture.transactionRequest({
    operationId: 'op_publicreconcile00000001'
  });
  await interruptAt(fixture, request, 'after_prepared');
  const reconciler = createPublicInstallerReconciler({
    env: fixture.env,
    journal: fixture.journal
  });

  const first = await reconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });
  const afterPrepared = await fixture.readJournal(request.operationId);

  assert.equal(first.outcome, 'indeterminate');
  assert.equal(first.classification, 'indeterminate');
  assert.equal(afterPrepared.state, 'prepared');
  assert.equal(afterPrepared.installer.reconciliationEvidence.classification, 'indeterminate');

  const mismatchRequest = fixture.transactionRequest({
    operationId: 'op_publicreconcilemismatch01'
  });
  await interruptAt(fixture, mismatchRequest, 'after_receipt');
  const currentReceipt = fixture.receiptStore.readCurrent(fixture.scope);
  const mismatchedCurrent = fixture.receiptStore.commit({
    ...mismatchRequest.receiptCandidate,
    receiptId: 'receipt_publicreplacement0001',
    committedAt: '2026-07-23T12:00:01.000Z',
    verificationEvidence: mismatchRequest.actions.map((action) => ({
      targetId: action.targetId,
      kind: 'runtime-and-digest',
      buildIdentity: mismatchRequest.plan.buildIdentity,
      observedDigest: action.desiredDigest,
      verified: true
    })),
    supersedesReceiptId: currentReceipt?.receiptId ?? null
  });
  assert.notEqual(mismatchedCurrent.receiptId, mismatchRequest.receiptCandidate.receiptId);

  const second = await reconciler.reconcile({
    operationId: mismatchRequest.operationId,
    inputDigest: mismatchRequest.inputDigest
  });

  assert.equal(second.outcome, 'indeterminate');
  assert.equal(second.classification, 'indeterminate');
});

test('public reconciliation succeeds only for exact current-receipt-owned canonical mcp paths', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'public-reconcile-owned');
  const action = fixture.fileMutationAction({
    actionId: 'action-public-owned',
    targetId: 'codex:project:mcp',
    relativePath: path.join('.codex', 'mcp.json')
  });
  const request = fixture.transactionRequest({
    operationId: 'op_publicreconcileowned0001',
    actions: [action]
  });
  await interruptAt(fixture, request, 'after_receipt');
  const touched = [];
  const reconciler = createPublicInstallerReconciler({
    env: fixture.env,
    journal: fixture.journal,
    artifactStore: {
      inspect(buildIdentity) {
        return { state: 'verified', buildIdentity };
      }
    },
    fileSystem: trackedFileSystem((entry) => touched.push(entry))
  });

  const result = await reconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });

  assert.equal(result.outcome, 'succeeded');
  assert.equal(result.classification, 'succeeded');
  assert.equal(
    touched.some((entry) => entry.path === path.resolve(action.targetPath) && entry.kind === 'read'),
    true
  );
});

test('public reconciliation classifies current Codex config effects from the journal receipt candidate before receipt commit', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'public-reconcile-codex-config-candidate');
  const action = fixture.fileMutationAction({
    actionId: 'action-public-codex-config-candidate',
    targetId: 'codex:project:mcp',
    ownershipBoundary: '[mcp_servers.launchdeck]',
    relativePath: path.join('.codex', 'config.toml'),
    original: '',
    desired: '[mcp_servers.launchdeck]\ncommand = "launchdeck"\n'
  });
  const request = fixture.transactionRequest({
    operationId: 'op_publiccodexcandidate001',
    actions: [action]
  });
  await interruptAt(fixture, request, 'after_effect');

  const reconciler = createPublicInstallerReconciler({
    env: fixture.env,
    journal: fixture.journal,
    artifactStore: {
      inspect(buildIdentity) {
        return { state: 'verified', buildIdentity };
      }
    }
  });
  const result = await reconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });
  const record = await fixture.readJournal(request.operationId);

  assert.equal(result.outcome, 'partial');
  assert.equal(result.classification, 'partial');
  assert.equal(record.installer.reconciliationEvidence.receiptEvidence.classification, 'absent');
  assert.deepEqual(record.installer.reconciliationEvidence.liveTargetEvidence, [{
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    classification: 'managed-effect-remains',
    observedDigest: action.desiredDigest
  }]);
});

test('public reconciliation refuses forged journal target paths without reading or returning a digest', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'public-reconcile-forged');
  const action = fixture.fileMutationAction({
    actionId: 'action-public-forged',
    targetId: 'codex:project:mcp',
    relativePath: path.join('.codex', 'mcp.json')
  });
  const request = fixture.transactionRequest({
    operationId: 'op_publicreconcileforged000',
    actions: [action]
  });
  await interruptAt(fixture, request, 'after_receipt');

  const unrelatedPath = path.join(fixture.root, 'forged-outside.txt');
  fs.writeFileSync(unrelatedPath, 'forged-journal-target', 'utf8');
  tamperJournalActionTargetPath(fixture, request.operationId, unrelatedPath);

  const touched = [];
  const reconciler = createPublicInstallerReconciler({
    env: fixture.env,
    journal: fixture.journal,
    artifactStore: {
      inspect(buildIdentity) {
        return { state: 'verified', buildIdentity };
      }
    },
    fileSystem: trackedFileSystem((entry) => touched.push(entry))
  });

  const result = await reconciler.reconcile({
    operationId: request.operationId,
    inputDigest: request.inputDigest
  });
  const record = await fixture.readJournal(request.operationId);
  const liveEvidence = record.installer.reconciliationEvidence.liveTargetEvidence[0];

  assert.equal(result.outcome, 'indeterminate');
  assert.equal(result.classification, 'indeterminate');
  assert.equal(liveEvidence.classification, 'unknown');
  assert.equal('observedDigest' in liveEvidence, false);
  assert.equal(
    touched.some((entry) => entry.path === path.resolve(unrelatedPath)),
    false,
    'forged journal paths must not trigger file observation'
  );
});

async function interruptAt(fixture, request, point) {
  const crash = fatalFault(point);
  const coordinator = coordinatorFor(fixture, {
    faultInjector: async (event) => {
      if (event.point === point) throw crash;
    }
  });
  await assert.rejects(coordinator.execute(request), (error) => error === crash);
}

function coordinatorFor(fixture, options = {}) {
  return createInstallerTransactionCoordinator({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    backupStore: fixture.backupStore,
    resourceLockRunner: async (_lockOptions, callback) => callback([]),
    ...options
  });
}

function tamperJournalActionTargetPath(fixture, operationId, nextPath) {
  const recordPath = fixture.journal.paths.recordPath(operationId);
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  record.installer.actions[0].targetPath = nextPath;
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
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
