import { AgentInstallerError, toInstallerErrorPayload } from '../errors.js';
import { redactInstallerValue } from '../result.js';
import { withInstallerResourceLocks } from './resource-locks.js';

export function createInstallerReconciler(options = {}) {
  const journal = requireJournal(options.journal);
  const receiptStore = requireReceiptStore(options.receiptStore);
  const evidenceProvider = options.evidenceProvider;
  const resourceLockRunner = options.resourceLockRunner ?? withInstallerResourceLocks;
  if (typeof evidenceProvider !== 'function') {
    throw new TypeError('An installer reconciliation evidenceProvider is required.');
  }

  return Object.freeze({
    async reconcile(input = {}) {
      const operationId = requireText(input.operationId, 'operationId');
      const inputDigest = requireText(input.inputDigest, 'inputDigest');
      let record;
      try {
        record = await journal.get(operationId);
      } catch (error) {
        return refusal(operationId, error);
      }
      if (record.inputDigest !== inputDigest) {
        return refusal(operationId, new AgentInstallerError(
          'operation_id_digest_mismatch',
          `Operation '${operationId}' has a different input digest.`,
          { effectCertainty: 'none' }
        ));
      }
      if (!record.installer || record.installer.kind !== 'agent-installer') {
        return refusal(operationId, new AgentInstallerError(
          'agent_reconciliation_kind_invalid',
          'The operation is not an Agent installer transaction.',
          { effectCertainty: 'none' }
        ));
      }
      if (record.installer.terminalResult && record.state !== 'indeterminate') {
        return deepFreeze({
          ...structuredClone(record.installer.terminalResult),
          recoveredFromJournal: true,
          replayed: false
        });
      }

      try {
        return await resourceLockRunner(lockOptionsFor(
          record,
          journal,
          evidenceProvider,
          operationId
        ), async (locks) => {
          return reconcileLocked({
            journal,
            receiptStore,
            evidenceProvider,
            operationId,
            inputDigest,
            locks
          });
        });
      } catch (error) {
        return deepFreeze({
          ...indeterminateResult(operationId, record),
          error: {
            code: error?.code ?? 'agent_reconciliation_lock_unavailable',
            message: 'Reconciliation could not acquire and verify canonical installer locks.',
            effectCertainty: 'unknown',
            details: {},
            nextActions: []
          }
        });
      }
    }
  });
}

async function reconcileLocked(context) {
  const {
    journal,
    receiptStore,
    evidenceProvider,
    operationId,
    inputDigest,
    locks
  } = context;
  await assertReconciliationLocks(locks);
  let record = await journal.get(operationId);
  if (record.inputDigest !== inputDigest) {
    return refusal(operationId, new AgentInstallerError(
      'operation_id_digest_mismatch',
      `Operation '${operationId}' has a different input digest.`,
      { effectCertainty: 'none' }
    ));
  }
  if (!record.installer || record.installer.kind !== 'agent-installer') {
    return refusal(operationId, new AgentInstallerError(
      'agent_reconciliation_kind_invalid',
      'The operation is not an Agent installer transaction.',
      { effectCertainty: 'none' }
    ));
  }
  if (record.installer.terminalResult && record.state !== 'indeterminate') {
    return deepFreeze({
      ...structuredClone(record.installer.terminalResult),
      recoveredFromJournal: true,
      replayed: false
    });
  }

  const rawEvidence = await evidenceProvider(Object.freeze({
    operationId,
    record: structuredClone(record),
    locks: Array.isArray(locks)
      ? locks.map((lock) => ({
          lockName: lock?.lockName
        }))
      : []
  }));
  await renewReconciliationLocks(locks);
  const boundedEvidence = boundEvidence(rawEvidence);
  const decision = classify(record, boundedEvidence, receiptStore);
  const reconciliationEvidence = {
    schemaVersion: 1,
    classification: decision.classification,
    ...boundedEvidence
  };
  let installer = {
    ...record.installer,
    reconciliationEvidence
  };

  if (decision.classification === 'indeterminate') {
    const result = indeterminateResult(operationId, record);
    installer = { ...installer, terminalResult: result };
    const lastError = {
      code: 'agent_reconciliation_evidence_insufficient',
      message: 'Live evidence cannot defend one terminal outcome.',
      effectCertainty: 'unknown',
      details: {
        journalState: record.state,
        classification: 'indeterminate'
      }
    };
    await assertReconciliationLocks(locks);
    if (record.state === 'running') {
      record = await journal.transition(operationId, {
        expectedRevision: record.revision,
        to: 'indeterminate',
        effectsCertainty: 'unknown',
        effectEvidenceRefs: record.effectEvidenceRefs,
        installer,
        lastError
      });
    } else {
      record = await journal.checkpoint(operationId, {
        expectedRevision: record.revision,
        effectsCertainty: 'unknown',
        installer,
        lastError
      });
    }
    return deepFreeze(result);
  }

  const result = resultForDecision(operationId, record, decision);
  installer = { ...installer, terminalResult: result };
  await assertReconciliationLocks(locks);
  const recovered = await journal.recover({
    operationId,
    inputDigest,
    reconcile: async () => ({
      resolvedOutcome: decision.resolvedOutcome,
      effectsCertainty: decision.effectsCertainty,
      effectEvidenceRefs: record.effectEvidenceRefs,
      resourceRef: decision.resourceRef,
      installer,
      result
    })
  });
  if (recovered.state !== 'reconciled') {
    return deepFreeze(indeterminateResult(operationId, recovered));
  }
  return deepFreeze(result);
}

async function assertReconciliationLocks(locks) {
  if (!Array.isArray(locks)) return;
  for (const lock of locks) {
    if (typeof lock?.assertOwned === 'function') await lock.assertOwned();
  }
}

async function renewReconciliationLocks(locks) {
  if (!Array.isArray(locks)) return;
  for (const lock of locks) {
    if (typeof lock?.renew === 'function') await lock.renew();
    else if (typeof lock?.assertOwned === 'function') await lock.assertOwned();
  }
}

function classify(record, evidence, receiptStore) {
  const actions = Array.isArray(record.installer.actions)
    ? record.installer.actions
    : [];
  const liveByTarget = new Map();
  for (const observation of evidence.liveTargetEvidence) {
    if (!actions.some((action) =>
      action.targetId === observation.targetId
      && (
        observation.ownershipBoundary === undefined
        || observation.ownershipBoundary === action.ownershipBoundary
      )
    )) {
      continue;
    }
    liveByTarget.set(observation.targetId, observation);
  }

  const receipt = receiptForEvidence(record, evidence.receiptEvidence, receiptStore);
  const lockInactive = isOriginalOwnerInactive(evidence.lockEvidence);
  const artifactVerified = evidence.artifactEvidence.some((entry) =>
    entry.buildIdentity === record.installer.buildIdentity
    && entry.classification === 'verified'
  );
  const targetsVerified = actions.length > 0 && actions.every((action) => {
    const observation = liveByTarget.get(action.targetId);
    return observation?.classification === 'verified'
      && observation.observedDigest === action.desiredDigest
      && observation.buildIdentity === record.installer.buildIdentity;
  });
  if (
    receipt
    && lockInactive
    && artifactVerified
    && targetsVerified
    && evidence.receiptEvidence.classification === 'committed'
  ) {
    return {
      classification: 'succeeded',
      resolvedOutcome: 'succeeded',
      effectsCertainty: 'confirmed',
      receiptId: receipt.receiptId,
      resourceRef: {
        kind: 'agentInstallation',
        id: receipt.receiptId,
        buildIdentity: receipt.buildIdentity
      },
      targetIds: []
    };
  }

  const abandoned = evidence.lockEvidence.state === 'abandoned'
    && lockInactive;
  const noReceipt = evidence.receiptEvidence.classification === 'absent';
  const noEffects = actions.length > 0 && actions.every((action) => {
    const observation = liveByTarget.get(action.targetId);
    return observation?.classification === 'no-effects'
      && observation.preconditionsMatch === true
      && observation.observedDigest === action.preconditionDigest;
  });
  if (abandoned && noReceipt && noEffects) {
    return {
      classification: 'no-effects',
      resolvedOutcome: 'failed',
      effectsCertainty: 'confirmed',
      receiptId: null,
      resourceRef: null,
      targetIds: []
    };
  }

  const remainingTargetIds = [];
  let restoredCount = 0;
  for (const action of actions) {
    const observation = liveByTarget.get(action.targetId);
    if (
      observation?.classification === 'fully-rolled-back'
      && observation.observedDigest === action.preconditionDigest
    ) {
      restoredCount += 1;
    } else if (
      observation?.classification === 'managed-effect-remains'
      && observation.observedDigest === action.desiredDigest
    ) {
      remainingTargetIds.push(action.targetId);
    }
  }
  if (
    noReceipt
    && lockInactive
    && remainingTargetIds.length > 0
    && restoredCount + remainingTargetIds.length === actions.length
  ) {
    return {
      classification: 'partial',
      resolvedOutcome: 'partial',
      effectsCertainty: 'possible',
      receiptId: null,
      resourceRef: null,
      targetIds: remainingTargetIds.sort()
    };
  }

  return {
    classification: 'indeterminate',
    resolvedOutcome: null,
    effectsCertainty: 'unknown',
    receiptId: null,
    resourceRef: null,
    targetIds: []
  };
}

function receiptForEvidence(record, evidence, receiptStore) {
  const receiptRef = record.installer.receiptRef;
  const candidate = record.installer.receiptCandidate;
  const expectedReceiptId = receiptRef?.receiptId ?? candidate?.receiptId;
  if (
    evidence.classification !== 'committed'
    || evidence.receiptId !== expectedReceiptId
    || (
      receiptRef?.receiptDigest !== undefined
      && evidence.receiptDigest !== receiptRef.receiptDigest
    )
  ) {
    return null;
  }
  try {
    const receipt = receiptStore.read(evidence.receiptId);
    const current = receiptStore.readCurrent({
      scope: record.installer.scope,
      scopeIdentity: record.installer.scopeIdentity,
      projectIdentity: record.installer.projectIdentity
    });
    if (
      !receipt
      || !current
      || receipt.receiptDigest !== evidence.receiptDigest
      || receipt.buildIdentity !== record.installer.buildIdentity
      || receipt.scopeIdentity !== record.installer.scopeIdentity
      || current?.receiptId !== receipt.receiptId
      || current?.receiptDigest !== receipt.receiptDigest
    ) {
      return null;
    }
    return receipt;
  } catch {
    return null;
  }
}

function isOriginalOwnerInactive(lockEvidence) {
  if (lockEvidence?.state === 'released') return true;
  return lockEvidence?.state === 'abandoned'
    && lockEvidence.processState === 'not-running'
    && lockEvidence.ownerStartIdentityChanged === true
    && ['expired', 'absent', 'replaced'].includes(lockEvidence.leaseState);
}

function lockOptionsFor(record, journal, evidenceProvider, operationId) {
  const actions = Array.isArray(record.installer?.actions)
    ? record.installer.actions
    : [];
  return {
    operationId: record.operationId,
    buildIdentity: record.installer.buildIdentity,
    scopeIdentity: record.installer.scopeIdentity,
    targetIds: actions.map((action) => action.targetId),
    includeLauncher: record.installer.includeLauncher === true
      || record.installer.resourceLocks?.includes('agent-launcher'),
    env: journal.paths?.homeDir
      ? { ...process.env, LAUNCHDECK_HOME: journal.paths.homeDir }
      : undefined,
    takeoverEvidenceProvider: async (lockEvidence) => evidenceProvider(Object.freeze({
      phase: 'lock-takeover',
      operationId,
      record: structuredClone(record),
      lockEvidence
    }))
  };
}

function resultForDecision(operationId, record, decision) {
  if (decision.classification === 'succeeded') {
    return {
      outcome: 'succeeded',
      effectCertainty: 'complete',
      operationId,
      receiptId: decision.receiptId,
      buildIdentity: record.installer.buildIdentity,
      effects: structuredClone(record.installer.effects ?? []),
      classification: 'succeeded',
      error: null,
      nextActions: [],
      replayed: false
    };
  }
  if (decision.classification === 'no-effects') {
    return {
      outcome: 'failed-and-rolled-back',
      effectCertainty: 'complete',
      operationId,
      receiptId: null,
      buildIdentity: record.installer.buildIdentity,
      effects: [],
      classification: 'no-effects',
      error: {
        code: 'agent_operation_abandoned_no_effects',
        message: 'The abandoned installer operation produced no effects.',
        effectCertainty: 'complete',
        details: {},
        nextActions: []
      },
      nextActions: [{
        operation: 'agent.setup',
        reason: 'The abandoned operation had no effects; create and approve a fresh plan.',
        requiresApproval: true
      }],
      replayed: false
    };
  }
  return {
    outcome: 'partial',
    effectCertainty: 'partial',
    operationId,
    receiptId: null,
    buildIdentity: record.installer.buildIdentity,
    effects: structuredClone(record.installer.effects ?? []),
    classification: 'partial',
    error: {
      code: 'agent_reconciliation_partial',
      message: 'Known Launchdeck-managed effects remain after recovery.',
      effectCertainty: 'partial',
      details: { targetIds: decision.targetIds },
      nextActions: []
    },
    nextActions: [{
      operation: 'agent.repair',
      reason: 'Create a bounded repair plan for the remaining managed targets.',
      requiresApproval: true,
      targetIds: decision.targetIds
    }],
    replayed: false
  };
}

function indeterminateResult(operationId, record) {
  return {
    outcome: 'indeterminate',
    effectCertainty: 'unknown',
    operationId,
    receiptId: record.installer?.receiptRef?.receiptId ?? null,
    buildIdentity: record.installer?.buildIdentity ?? null,
    effects: structuredClone(record.installer?.effects ?? []),
    classification: 'indeterminate',
    error: {
      code: 'agent_reconciliation_evidence_insufficient',
      message: 'Live evidence cannot defend one terminal outcome.',
      effectCertainty: 'unknown',
      details: { journalState: record.state },
      nextActions: []
    },
    nextActions: [{
      operation: 'operation.reconcile',
      operationId,
      reason: 'Collect bounded live evidence before authorizing new work.',
      requiresApproval: false
    }],
    replayed: false
  };
}

function boundEvidence(input) {
  const evidence = input && typeof input === 'object' ? input : {};
  return redactInstallerValue({
    lockEvidence: pick(evidence.lockEvidence, [
      'state',
      'processState',
      'ownerPid',
      'ownerStartIdentityChanged',
      'leaseState'
    ]),
    liveTargetEvidence: array(evidence.liveTargetEvidence).map((entry) => pick(entry, [
      'targetId',
      'ownershipBoundary',
      'classification',
      'observedDigest',
      'preconditionsMatch',
      'buildIdentity'
    ])),
    artifactEvidence: array(evidence.artifactEvidence).map((entry) => pick(entry, [
      'buildIdentity',
      'classification'
    ])),
    receiptEvidence: pick(evidence.receiptEvidence, [
      'classification',
      'receiptId',
      'receiptDigest'
    ])
  });
}

function pick(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(fields
    .filter((field) => value[field] !== undefined)
    .map((field) => [field, value[field]]));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function refusal(operationId, error) {
  return deepFreeze({
    outcome: 'refused',
    effectCertainty: 'none',
    operationId,
    receiptId: null,
    effects: [],
    classification: 'refused',
    error: toInstallerErrorPayload(error),
    nextActions: [],
    replayed: false
  });
}

function requireJournal(journal) {
  for (const method of ['get', 'transition', 'checkpoint', 'recover']) {
    if (typeof journal?.[method] !== 'function') {
      throw new TypeError(`A journal with ${method}() is required.`);
    }
  }
  return journal;
}

function requireReceiptStore(store) {
  for (const method of ['read', 'readCurrent']) {
    if (typeof store?.[method] !== 'function') {
      throw new TypeError(`A receipt store with ${method}() is required.`);
    }
  }
  return store;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
