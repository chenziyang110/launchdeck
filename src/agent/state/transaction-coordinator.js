import crypto from 'node:crypto';
import { digestCanonical } from '../digests.js';
import { AgentInstallerError, toInstallerErrorPayload } from '../errors.js';
import { redactInstallerValue } from '../result.js';
import {
  normalizeCanonicalTransactionPlan,
  normalizeTransactionActionDescription
} from './transaction-plan.js';
import { withInstallerResourceLocks } from './resource-locks.js';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function createInstallerTransactionCoordinator(options = {}) {
  const journal = requireJournal(options.journal);
  const receiptStore = requireReceiptStore(options.receiptStore);
  const backupStore = requireBackupStore(options.backupStore);
  const resourceLockRunner = options.resourceLockRunner ?? withInstallerResourceLocks;
  const faultInjector = options.faultInjector ?? null;

  return Object.freeze({
    async execute(candidate) {
      let request;
      try {
        request = normalizeRequest(candidate);
      } catch (error) {
        return refusalResult(candidate ?? {}, error);
      }

      const existing = await readExisting(journal, request.operationId);
      if (existing) return resultForExisting(existing, request);

      if (request.approval.approved !== true) {
        return Object.freeze({
          outcome: 'cancelled',
          effectCertainty: 'none',
          operationId: request.operationId,
          receiptId: null,
          effects: [],
          error: null,
          nextActions: [],
          replayed: false
        });
      }
      if (request.approval.planDigest !== request.plan.planDigest) {
        return refusalResult(request, transactionError(
          'agent_plan_approval_mismatch',
          'Approval does not match the immutable plan digest.'
        ));
      }
      if (request.approval.planBindingDigest !== request.planBindingDigest) {
        return refusalResult(request, transactionError(
          'agent_plan_binding_mismatch',
          'Approval does not match the canonical plan/action binding.'
        ));
      }

      try {
        return await resourceLockRunner(lockOptions(request), async (locks) => {
          const current = await readExisting(journal, request.operationId);
          if (current) return resultForExisting(current, request);

          const revalidation = await request.revalidatePlan({
            operationId: request.operationId,
            plan: request.plan,
            locks
          });
          if (revalidation?.valid !== true || revalidation.planDigest !== request.plan.planDigest) {
            return preconditionRefusal(request, revalidation);
          }
          return executeLocked({
            journal,
            receiptStore,
            backupStore,
            faultInjector,
            request,
            locks
          });
        });
      } catch (error) {
        if (error?.fatal === true) throw error;
        const durable = await readExisting(journal, request.operationId);
        if (durable) return resultForExisting(durable, request);
        return refusalResult(request, error);
      }
    }
  });
}

async function executeLocked(context) {
  const { journal, receiptStore, backupStore, faultInjector, request, locks } = context;
  const initialInstaller = {
    schemaVersion: 1,
    kind: 'agent-installer',
    operation: request.operation,
    planId: request.plan.planId,
    planDigest: request.plan.planDigest,
    planBindingDigest: request.planBindingDigest,
    scope: request.plan.scope,
    scopeIdentity: request.plan.scopeIdentity,
    projectIdentity: request.plan.projectIdentity,
    buildIdentity: request.plan.buildIdentity,
    resourceLocks: Array.isArray(locks)
      ? locks.map((lock) => lock?.lockName).filter(Boolean)
      : [],
    includeLauncher: request.plan.includeLauncher,
    actions: request.plan.actions,
    effects: [],
    verificationEvidence: [],
    backupRefs: [],
    previousBuildPins: request.plan.previousBuildPins,
    receiptCandidate: request.receiptCandidate,
    receiptRef: null,
    rollbackEvidence: [],
    rollbackErrors: [],
    reconciliationEvidence: null,
    checkpoints: ['prepared'],
    terminalResult: null
  };
  const prepared = await journal.prepare({
    operationId: request.operationId,
    operationName: `agent.${request.operation}`,
    definitionVersion: '1.0.0',
    inputDigest: request.inputDigest,
    requestSummary: {
      operation: request.operation,
      planDigest: request.plan.planDigest,
      planBindingDigest: request.planBindingDigest,
      scope: request.plan.scope,
      scopeIdentity: request.plan.scopeIdentity,
      buildIdentity: request.plan.buildIdentity,
      targetIds: request.plan.targetIds
    },
    projectRef: {
      projectId: request.plan.projectIdentity ?? request.plan.scopeIdentity,
      alias: request.plan.scope
    },
    taskRef: null,
    runtimeProvenance: {
      surface: 'agent-installer',
      runtimeKind: 'launchdeck-agent-installer',
      buildIdentity: request.plan.buildIdentity
    },
    installer: initialInstaller
  });
  let record = prepared.record;
  let installer = record.installer;
  const executed = [];
  try {
    await assertLocksOwned(locks);
    await injectFault(faultInjector, 'after_prepared', request.operationId, record);

    installer = appendCheckpoint(installer, 'running');
    record = await journal.transition(request.operationId, {
      expectedRevision: record.revision,
      to: 'running',
      effectsCertainty: 'none',
      installer
    });
    await renewLocks(locks);
    await injectFault(faultInjector, 'after_running', request.operationId, record);

    for (const action of request.actions) {
      await assertLocksOwned(locks);
      let backupRef = null;
      if (action.requiresBackup === true) {
        backupRef = backupStore.create({
          backupId: backupIdFor(request.operationId, action.actionId),
          operationId: request.operationId,
          targetId: action.targetId,
          sourcePath: action.targetPath,
          originalDigest: action.preconditionDigest
        });
        installer = appendCheckpoint(installer, 'backup', {
          backupRefs: [...installer.backupRefs, backupRef]
        });
        record = await journal.checkpoint(request.operationId, {
          expectedRevision: record.revision,
          installer
        });
        await renewLocks(locks);
      }

      let effect;
      try {
        effect = await action.apply(Object.freeze({
          operationId: request.operationId,
          plan: request.plan,
          action: actionDescription(action),
          backupRef,
          receiptCandidate: request.receiptCandidate
        }));
      } catch (error) {
        if (error?.fatal === true || effectCertainty(error) === 'none') throw error;
        throw new AgentInstallerError(
          error?.code ?? 'agent_apply_completion_unknown',
          error?.message ?? `Action '${action.actionId}' completion is unknown.`,
          {
            effectCertainty: 'unknown',
            details: {
              ...(error?.details ?? {}),
              actionId: action.actionId,
              originalEffectCertainty: effectCertainty(error)
            }
          }
        );
      }
      const normalizedEffect = normalizeEffect(effect, action);
      await assertLocksOwned(locks);
      executed.push({ action, effect: normalizedEffect, backupRef });
      installer = appendCheckpoint(installer, 'effect', {
        effects: [...installer.effects, normalizedEffect]
      });
      record = await journal.checkpoint(request.operationId, {
        expectedRevision: record.revision,
        effectsCertainty: 'confirmed',
        effectEvidenceRefs: installer.effects.map((entry) => entry.effectId),
        installer
      });
      await renewLocks(locks);
      await injectFault(faultInjector, 'after_effect', request.operationId, record, {
        actionId: action.actionId
      });
    }

    installer = appendCheckpoint(installer, 'verification');
    record = await journal.checkpoint(request.operationId, {
      expectedRevision: record.revision,
      effectsCertainty: installer.effects.length > 0 ? 'confirmed' : 'none',
      installer
    });
    await assertLocksOwned(locks);
    const verificationEvidence = normalizeVerification(await request.verify(Object.freeze({
      operationId: request.operationId,
      plan: request.plan,
      effects: structuredClone(installer.effects),
      receiptCandidate: structuredClone(request.receiptCandidate)
    })), request);
    installer = appendCheckpoint(installer, 'verified', {
      verificationEvidence: structuredClone(verificationEvidence)
    });
    record = await journal.checkpoint(request.operationId, {
      expectedRevision: record.revision,
      effectsCertainty: installer.effects.length > 0 ? 'confirmed' : 'none',
      installer
    });
    await renewLocks(locks);
    await injectFault(faultInjector, 'after_verification', request.operationId, record);

    await assertLocksOwned(locks);
    const receipt = receiptStore.commit({
      ...request.receiptCandidate,
      buildIdentity: request.plan.buildIdentity,
      verificationEvidence: structuredClone(verificationEvidence)
    });
    await assertLocksOwned(locks);
    const receiptRef = {
      receiptId: receipt.receiptId,
      receiptDigest: receipt.receiptDigest,
      scopeIdentity: receipt.scopeIdentity,
      buildIdentity: receipt.buildIdentity
    };
    installer = appendCheckpoint(installer, 'receipt', { receiptRef });
    record = await journal.checkpoint(request.operationId, {
      expectedRevision: record.revision,
      effectsCertainty: installer.effects.length > 0 ? 'confirmed' : 'none',
      installer
    });
    await renewLocks(locks);
    await injectFault(faultInjector, 'after_receipt', request.operationId, record);

    await assertLocksOwned(locks);
    const result = successResult(request, installer, receipt);
    installer = {
      ...installer,
      terminalResult: result
    };
    record = await journal.transition(request.operationId, {
      expectedRevision: record.revision,
      to: 'succeeded',
      effectsCertainty: installer.effects.length > 0 ? 'confirmed' : 'none',
      effectEvidenceRefs: installer.effects.map((entry) => entry.effectId),
      resourceRef: {
        kind: 'agentInstallation',
        id: receipt.receiptId,
        buildIdentity: receipt.buildIdentity
      },
      installer,
      result
    });
    await injectFault(faultInjector, 'before_response', request.operationId, record);
    return deepFreeze(result);
  } catch (error) {
    if (error?.fatal === true) throw error;
    const handledError = error?.code === 'lock_lost'
      ? new AgentInstallerError('agent_transaction_lock_lost', error.message, {
          effectCertainty: 'unknown',
          details: { journalState: record.state }
        })
      : error;
    const latest = await readExisting(journal, request.operationId);
    if (latest) {
      record = latest;
      installer = latest.installer ?? installer;
    }
    if (record.state === 'prepared') {
      return refusePrepared({ journal, request, record, installer, error: handledError });
    }
    if (
      effectCertainty(handledError) === 'unknown'
      || error?.code === 'lock_lost'
      || committedReceiptExists(receiptStore, request.receiptCandidate.receiptId)
    ) {
      return markIndeterminate({
        journal,
        request,
        record,
        installer,
        error: handledError
      });
    }
    try {
      await assertLocksOwned(locks);
    } catch (lockError) {
      return markIndeterminate({
        journal,
        request,
        record,
        installer,
        error: new AgentInstallerError('agent_transaction_lock_lost', lockError.message, {
          effectCertainty: 'unknown',
          details: { journalState: record.state }
        })
      });
    }
    return rollbackKnownEffects({
      journal,
      request,
      record,
      installer,
      executed,
      error: handledError,
      locks
    });
  }
}

async function rollbackKnownEffects(context) {
  const { journal, request, executed, error, locks } = context;
  let { record, installer } = context;
  const rollbackEvidence = [...(installer.rollbackEvidence ?? [])];
  const rollbackErrors = [...(installer.rollbackErrors ?? [])];

  for (const entry of [...executed].reverse()) {
    try {
      await assertLocksOwned(locks);
      const evidence = await entry.action.rollback(Object.freeze({
        operationId: request.operationId,
        plan: request.plan,
        effect: entry.effect,
        backupRef: entry.backupRef,
        receiptCandidate: request.receiptCandidate
      }));
      rollbackEvidence.push(normalizeRollbackEvidence({
        actionId: entry.action.actionId,
        targetId: entry.action.targetId,
        ...evidence
      }, entry));
      await renewLocks(locks);
    } catch (rollbackError) {
      if (rollbackError?.code === 'lock_lost') {
        return markIndeterminate({
          journal,
          request,
          record,
          installer,
          error: new AgentInstallerError('agent_transaction_lock_lost', rollbackError.message, {
            effectCertainty: 'unknown',
            details: { journalState: record.state }
          })
        });
      }
      rollbackErrors.push(redactInstallerValue({
        actionId: entry.action.actionId,
        targetId: entry.action.targetId,
        error: toInstallerErrorPayload(rollbackError)
      }));
    }
    installer = appendCheckpoint(installer, 'rollback', {
      rollbackEvidence,
      rollbackErrors
    });
    record = await journal.checkpoint(request.operationId, {
      expectedRevision: record.revision,
      effectsCertainty: rollbackErrors.length > 0 ? 'possible' : 'confirmed',
      installer,
      lastError: toInstallerErrorPayload(error)
    });
  }

  const restored = executed.length === rollbackEvidence.length
    && rollbackErrors.length === 0
    && rollbackEvidence.every((entry) => entry.restored === true && entry.verified === true);
  const result = restored
    ? failureResult(request, installer, error, {
        outcome: 'failed-and-rolled-back',
        effectCertainty: 'complete',
        nextActions: []
      })
    : failureResult(request, installer, error, {
        outcome: 'partial',
        effectCertainty: 'partial',
        nextActions: [reconcileAction(request.operationId)]
      });
  installer = { ...installer, terminalResult: result };
  await assertLocksOwned(locks);
  record = await journal.transition(request.operationId, {
    expectedRevision: record.revision,
    to: restored ? 'failed' : 'indeterminate',
    effectsCertainty: restored ? 'confirmed' : 'possible',
    effectEvidenceRefs: installer.effects.map((entry) => entry.effectId),
    installer,
    lastError: toInstallerErrorPayload(error),
    result: restored ? result : undefined
  });
  return deepFreeze(result);
}

async function markIndeterminate(context) {
  const { journal, request, error } = context;
  let { record, installer } = context;
  const result = failureResult(request, installer, error, {
    outcome: 'indeterminate',
    effectCertainty: 'unknown',
    nextActions: [reconcileAction(request.operationId)]
  });
  installer = {
    ...installer,
    terminalResult: result
  };
  if (record.state === 'running') {
    record = await journal.transition(request.operationId, {
      expectedRevision: record.revision,
      to: 'indeterminate',
      effectsCertainty: 'unknown',
      effectEvidenceRefs: installer.effects.map((entry) => entry.effectId),
      installer,
      lastError: toInstallerErrorPayload(error)
    });
  } else {
    record = await journal.checkpoint(request.operationId, {
      expectedRevision: record.revision,
      effectsCertainty: 'unknown',
      installer,
      lastError: toInstallerErrorPayload(error)
    });
  }
  return deepFreeze(result);
}

async function refusePrepared(context) {
  const { journal, request, error } = context;
  const record = context.record;
  const result = refusalResult(request, error);
  const installer = {
    ...context.installer,
    terminalResult: result
  };
  await journal.transition(request.operationId, {
    expectedRevision: record.revision,
    to: 'refused',
    effectsCertainty: 'none',
    effectEvidenceRefs: [],
    installer,
    lastError: toInstallerErrorPayload(error),
    result
  });
  return result;
}

async function readExisting(journal, operationId) {
  try {
    return await journal.get(operationId);
  } catch (error) {
    if (error?.code === 'operation_record_missing_or_expired') return null;
    throw error;
  }
}

function resultForExisting(record, request) {
  if (record.inputDigest !== request.inputDigest) {
    return refusalResult(request, transactionError(
      'operation_id_digest_mismatch',
      `Operation '${request.operationId}' already has a different input digest.`
    ));
  }
  if (record.installer?.terminalResult) {
    return deepFreeze({
      ...structuredClone(record.installer.terminalResult),
      recoveredFromJournal: true,
      replayed: false
    });
  }
  return deepFreeze({
    outcome: 'indeterminate',
    effectCertainty: record.effectsCertainty === 'possible' ? 'partial' : 'unknown',
    operationId: request.operationId,
    receiptId: record.installer?.receiptRef?.receiptId ?? null,
    effects: structuredClone(record.installer?.effects ?? []),
    error: {
      code: 'agent_operation_requires_reconciliation',
      message: 'The original installer operation is unresolved.',
      effectCertainty: 'unknown',
      details: { journalState: record.state },
      nextActions: []
    },
    nextActions: [reconcileAction(request.operationId)],
    recoveredFromJournal: true,
    replayed: false
  });
}

function normalizeRequest(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw transactionError('agent_transaction_invalid', 'Transaction request is required.');
  }
  const plan = candidate.plan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw transactionError('agent_transaction_invalid', 'Approved plan is required.');
  }
  const actions = requireArray(candidate.actions, 'actions');
  for (const action of actions) validateAction(action);
  if (typeof candidate.revalidatePlan !== 'function' || typeof candidate.verify !== 'function') {
    throw transactionError(
      'agent_transaction_invalid',
      'Plan revalidation and runtime verification callbacks are required.'
    );
  }
  const normalizedPlanActions = requireArray(plan.actions, 'plan.actions')
    .map((action) => normalizeTransactionActionDescription(action));
  const executableDescriptions = actions.map((action) => actionDescription(action));
  if (digestCanonical(normalizedPlanActions) !== digestCanonical(executableDescriptions)) {
    throw transactionError(
      'agent_plan_action_mismatch',
      'Executable actions do not match the approved immutable plan.'
    );
  }
  const targetIds = normalizeTargetIds(plan.targetIds);
  const actionTargetIds = normalizeTargetIds(executableDescriptions.map((action) => action.targetId));
  if (digestCanonical(targetIds) !== digestCanonical(actionTargetIds)) {
    throw transactionError(
      'agent_plan_target_mismatch',
      'Approved target locks do not match the executable actions.'
    );
  }
  const normalizedPlan = normalizeCanonicalTransactionPlan({
    ...plan,
    targetIds: actionTargetIds,
    actions: executableDescriptions
  });
  const receiptCandidate = deriveReceiptCandidate(
    candidate.receiptCandidate,
    normalizedPlan,
    executableDescriptions
  );
  return {
    operationId: requireText(candidate.operationId, 'operationId'),
    operation: requireText(candidate.operation, 'operation'),
    inputDigest: requireDigest(candidate.inputDigest, 'inputDigest'),
    plan: deepFreeze(normalizedPlan),
    planBindingDigest: normalizedPlan.planBindingDigest,
    approval: {
      approved: candidate.approval?.approved === true,
      planDigest: String(candidate.approval?.planDigest ?? ''),
      planBindingDigest: String(candidate.approval?.planBindingDigest ?? '')
    },
    actions,
    revalidatePlan: candidate.revalidatePlan,
    verify: candidate.verify,
    receiptCandidate
  };
}

function validateAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    throw transactionError('agent_transaction_invalid', 'Transaction action is invalid.');
  }
  assertAllowedEvidenceFields(action, [
    'actionId',
    'kind',
    'targetId',
    'ownershipBoundary',
    'targetPath',
    'preconditionDigest',
    'desiredDigest',
    'requiresBackup',
    'apply',
    'rollback'
  ], 'action', 'none');
  for (const field of [
    'actionId',
    'kind',
    'targetId',
    'ownershipBoundary',
    'targetPath'
  ]) {
    requireText(action[field], `action.${field}`);
  }
  requireDigest(action.preconditionDigest, 'action.preconditionDigest');
  requireDigest(action.desiredDigest, 'action.desiredDigest');
  if (typeof action.apply !== 'function' || typeof action.rollback !== 'function') {
    throw transactionError(
      'agent_transaction_invalid',
      'Transaction actions require apply and rollback callbacks.'
    );
  }
}

function normalizeVerification(evidence, request) {
  if (!Array.isArray(evidence) || evidence.length !== request.actions.length) {
    throw transactionError(
      'agent_runtime_verification_failed',
      'Every selected target must produce runtime verification evidence.',
      'complete'
    );
  }
  const normalized = evidence.map((entry) => normalizeVerificationEntry(entry));
  const byTarget = new Map(normalized.map((entry) => [entry.targetId, entry]));
  if (byTarget.size !== normalized.length) {
    throw transactionError(
      'agent_runtime_verification_failed',
      'Runtime verification evidence contains duplicate targets.',
      'complete'
    );
  }
  for (const action of request.actions) {
    const entry = byTarget.get(action.targetId);
    if (
      entry?.verified !== true
      || entry.buildIdentity !== request.plan.buildIdentity
      || entry.observedDigest !== action.desiredDigest
    ) {
      throw transactionError(
        'agent_runtime_verification_failed',
        `Target '${action.targetId}' did not verify the approved build${entry?.diagnosticCode ? ` (${entry.diagnosticCode})` : ''}${entry?.diagnosticChecks?.length ? ` [${entry.diagnosticChecks.join(', ')}]` : ''}.`,
        'complete'
      );
    }
  }
  return deepFreeze(normalized);
}

function normalizeEffect(effect, action) {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) {
    throw transactionError(
      'agent_effect_evidence_invalid',
      `Action '${action.actionId}' did not return effect evidence.`,
      'unknown'
    );
  }
  assertAllowedEvidenceFields(effect, [
    'effectId',
    'actionId',
    'targetId',
    'ownershipBoundary',
    'effectType',
    'beforeDigest',
    'afterDigest',
    'effectCertainty'
  ], 'effect evidence');
  if (
    effect.actionId !== action.actionId
    || effect.targetId !== action.targetId
    || effect.ownershipBoundary !== action.ownershipBoundary
    || effect.beforeDigest !== action.preconditionDigest
    || effect.afterDigest !== action.desiredDigest
    || effect.effectCertainty !== 'complete'
  ) {
    throw transactionError(
      'agent_effect_evidence_mismatch',
      `Action '${action.actionId}' returned evidence outside the approved boundary.`,
      'unknown'
    );
  }
  return deepFreeze({
    effectId: requireText(effect.effectId, 'effect.effectId'),
    actionId: action.actionId,
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    effectType: requireText(effect.effectType, 'effect.effectType'),
    beforeDigest: requireDigest(effect.beforeDigest, 'effect.beforeDigest'),
    afterDigest: requireDigest(effect.afterDigest, 'effect.afterDigest'),
    effectCertainty: 'complete'
  });
}

function successResult(request, installer, receipt) {
  return {
    outcome: 'succeeded',
    effectCertainty: 'complete',
    operationId: request.operationId,
    receiptId: receipt.receiptId,
    buildIdentity: request.plan.buildIdentity,
    effects: structuredClone(installer.effects),
    error: null,
    nextActions: [],
    replayed: false
  };
}

function failureResult(request, installer, error, overrides) {
  return {
    outcome: overrides.outcome,
    effectCertainty: overrides.effectCertainty,
    operationId: request.operationId,
    receiptId: null,
    buildIdentity: request.plan.buildIdentity,
    effects: structuredClone(installer.effects),
    error: toInstallerErrorPayload(error),
    nextActions: overrides.nextActions,
    replayed: false
  };
}

function refusalResult(request, error) {
  const operationId = request.operationId ?? null;
  return deepFreeze({
    outcome: 'refused',
    effectCertainty: 'none',
    operationId,
    receiptId: null,
    effects: [],
    error: toInstallerErrorPayload(error),
    nextActions: error?.nextActions ?? [],
    replayed: false
  });
}

function preconditionRefusal(request, evidence) {
  const code = evidence?.code ?? 'agent_plan_precondition_changed';
  const error = transactionError(
    code,
    'The approved plan changed while its resources were locked.'
  );
  const result = refusalResult(request, error);
  return deepFreeze({
    ...result,
    nextActions: [{
      operation: `agent.${request.operation}`,
      reason: 'Re-discover current targets and approve a fresh plan.',
      requiresApproval: true
    }]
  });
}

function appendCheckpoint(installer, checkpoint, patch = {}) {
  return {
    ...installer,
    ...patch,
    checkpoints: [...installer.checkpoints, checkpoint]
  };
}

function lockOptions(request) {
  return {
    operationId: request.operationId,
    buildIdentity: request.plan.buildIdentity,
    scopeIdentity: request.plan.scopeIdentity,
    targetIds: request.plan.targetIds,
    includeLauncher: request.plan.includeLauncher
  };
}

function actionDescription(action) {
  return {
    actionId: action.actionId,
    kind: action.kind,
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    targetPath: action.targetPath,
    preconditionDigest: action.preconditionDigest,
    desiredDigest: action.desiredDigest,
    requiresBackup: action.requiresBackup === true
  };
}

function normalizeTargetIds(value) {
  return [...new Set(requireArray(value, 'plan.targetIds')
    .map((targetId) => requireText(targetId, 'plan.targetId')))]
    .sort();
}

function deriveReceiptCandidate(candidate, plan, actions) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw transactionError('agent_transaction_invalid', 'receiptCandidate is required.');
  }
  assertAllowedEvidenceFields(candidate, [
    'receiptId',
    'scope',
    'scopeIdentity',
    'projectIdentity',
    'buildIdentity',
    'targets',
    'ownedDigests',
    'verificationEvidence',
    'committedAt',
    'supersedesReceiptId'
  ], 'receipt candidate', 'none');
  const receiptScope = candidate.scope;
  const receiptScopeIdentity = candidate.scopeIdentity;
  const receiptProjectIdentity = candidate.projectIdentity ?? null;
  if (
    receiptScope !== plan.scope
    || receiptScopeIdentity !== plan.scopeIdentity
    || receiptProjectIdentity !== plan.projectIdentity
  ) {
    throw transactionError(
      'agent_receipt_plan_mismatch',
      'Receipt scope identity does not match the approved plan.'
    );
  }
  const expectedTargets = actions.map((action) => ({
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    desiredDigest: action.desiredDigest
  }));
  if (
    digestCanonical(candidate.targets ?? []) !== digestCanonical(expectedTargets)
    || digestCanonical(candidate.ownedDigests ?? [])
      !== digestCanonical(actions.map((action) => action.desiredDigest))
  ) {
    throw transactionError(
      'agent_receipt_plan_mismatch',
      'Receipt ownership does not match the approved actions.'
    );
  }
  return deepFreeze({
    receiptId: requireText(candidate.receiptId, 'receiptCandidate.receiptId'),
    scope: plan.scope,
    scopeIdentity: plan.scopeIdentity,
    projectIdentity: plan.projectIdentity,
    buildIdentity: plan.buildIdentity,
    targets: expectedTargets,
    ownedDigests: actions.map((action) => action.desiredDigest),
    verificationEvidence: [],
    committedAt: candidate.committedAt,
    supersedesReceiptId: candidate.supersedesReceiptId ?? null
  });
}

function normalizeVerificationEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw transactionError(
      'agent_runtime_verification_failed',
      'Runtime verification evidence is invalid.',
      'complete'
    );
  }
  assertAllowedEvidenceFields(entry, [
    'targetId',
    'kind',
    'buildIdentity',
    'observedDigest',
    'verified',
    'diagnosticCode',
    'diagnosticChecks'
  ], 'verification evidence', 'complete');
  return {
    targetId: requireText(entry.targetId, 'verification.targetId'),
    kind: requireText(entry.kind, 'verification.kind'),
    buildIdentity: requireDigest(entry.buildIdentity, 'verification.buildIdentity'),
    observedDigest: requireDigest(entry.observedDigest, 'verification.observedDigest'),
    verified: entry.verified === true,
    ...(typeof entry.diagnosticCode === 'string'
      ? { diagnosticCode: entry.diagnosticCode }
      : {}),
    ...(Array.isArray(entry.diagnosticChecks)
      ? { diagnosticChecks: entry.diagnosticChecks.filter((code) => typeof code === 'string') }
      : {})
  };
}

function normalizeRollbackEvidence(evidence, entry) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw transactionError(
      'agent_rollback_evidence_invalid',
      `Rollback evidence for '${entry.action.actionId}' is invalid.`,
      'unknown'
    );
  }
  assertAllowedEvidenceFields(evidence, [
    'actionId',
    'targetId',
    'restored',
    'restoredDigest',
    'verified'
  ], 'rollback evidence');
  const restoredDigest = requireDigest(
    evidence.restoredDigest,
    'rollback.restoredDigest'
  );
  if (
    evidence.restored === true
    && evidence.verified === true
    && restoredDigest !== entry.action.preconditionDigest
  ) {
    throw transactionError(
      'agent_rollback_evidence_invalid',
      `Rollback evidence for '${entry.action.actionId}' does not prove the precondition digest.`,
      'unknown'
    );
  }
  return deepFreeze({
    actionId: entry.action.actionId,
    targetId: entry.action.targetId,
    restored: evidence.restored === true,
    restoredDigest,
    verified: evidence.verified === true
  });
}

function backupIdFor(operationId, actionId) {
  const digest = crypto.createHash('sha256')
    .update(`${operationId}\0${actionId}`)
    .digest('hex');
  return `backup_${digest.slice(0, 32)}`;
}

function committedReceiptExists(receiptStore, receiptId) {
  try {
    return receiptStore.read(receiptId) !== null;
  } catch {
    return true;
  }
}

async function assertLocksOwned(locks) {
  if (!Array.isArray(locks)) return;
  for (const lock of locks) {
    if (typeof lock?.assertOwned === 'function') await lock.assertOwned();
  }
}

async function renewLocks(locks) {
  if (!Array.isArray(locks)) return;
  for (const lock of locks) {
    if (typeof lock?.renew === 'function') await lock.renew();
    else if (typeof lock?.assertOwned === 'function') await lock.assertOwned();
  }
}

async function injectFault(faultInjector, point, operationId, record, details = {}) {
  if (typeof faultInjector !== 'function') return;
  await faultInjector(Object.freeze({
    point,
    operationId,
    journalState: record.state,
    revision: record.revision,
    ...details
  }));
}

function effectCertainty(error) {
  return ['none', 'complete', 'partial', 'unknown'].includes(error?.effectCertainty)
    ? error.effectCertainty
    : 'unknown';
}

function reconcileAction(operationId) {
  return {
    operation: 'operation.reconcile',
    operationId,
    reason: 'Observe durable and live evidence before any new mutation.',
    requiresApproval: false
  };
}

function requireJournal(journal) {
  for (const method of ['prepare', 'get', 'transition', 'checkpoint', 'recover']) {
    if (typeof journal?.[method] !== 'function') {
      throw new TypeError(`A journal with ${method}() is required.`);
    }
  }
  return journal;
}

function requireReceiptStore(store) {
  for (const method of ['commit', 'read', 'readCurrent']) {
    if (typeof store?.[method] !== 'function') {
      throw new TypeError(`A receipt store with ${method}() is required.`);
    }
  }
  return store;
}

function requireBackupStore(store) {
  for (const method of ['create', 'read', 'restore']) {
    if (typeof store?.[method] !== 'function') {
      throw new TypeError(`A backup store with ${method}() is required.`);
    }
  }
  return store;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw transactionError('agent_transaction_invalid', `${label} must be an array.`);
  }
  return [...value];
}

function assertAllowedEvidenceFields(value, fields, label, certainty = 'unknown') {
  const unexpected = Object.keys(value).filter((field) => !fields.includes(field));
  if (unexpected.length > 0) {
    throw transactionError(
      'agent_durable_evidence_invalid',
      `${label} contains unsupported durable fields.`,
      certainty
    );
  }
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw transactionError('agent_transaction_invalid', `${label} is required.`);
  }
  return text;
}

function requireDigest(value, label) {
  const digest = String(value ?? '');
  if (!DIGEST_PATTERN.test(digest)) {
    throw transactionError('agent_transaction_invalid', `${label} is invalid.`);
  }
  return digest;
}

function requireScope(value) {
  if (!['project', 'user'].includes(value)) {
    throw transactionError('agent_transaction_invalid', 'plan.scope is invalid.');
  }
  return value;
}

function transactionError(code, message, certainty = 'none') {
  return new AgentInstallerError(code, message, {
    effectCertainty: certainty
  });
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
