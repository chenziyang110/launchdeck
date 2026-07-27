import { withLock } from '../../control-plane/locks.js';
import { AgentInstallerError } from '../errors.js';

const BUILD_IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const OPERATION_ID_PATTERN = /^op_[A-Za-z0-9_-]{16,128}$/;

export function installerResourceLockNames(options = {}) {
  requireOperationId(options.operationId);
  requireBuildIdentity(options.buildIdentity);
  const scopeIdentity = requireText(options.scopeIdentity, 'scopeIdentity');
  const targetIds = normalizeTargetIds(options.targetIds);
  const names = [
    'agent-artifact-store',
    `agent-receipt-${lockToken(scopeIdentity)}`,
    ...targetIds.map((targetId) => `agent-target-${lockToken(targetId)}`)
  ];
  if (options.includeLauncher === true) names.push('agent-launcher');
  return Object.freeze(names);
}

export async function withInstallerResourceLocks(options, callback) {
  if (typeof callback !== 'function') {
    throw lockError('agent_lock_options_invalid', 'Lock callback is required.');
  }
  const names = installerResourceLockNames(options);
  const lockRunner = options.lockRunner ?? withLock;
  const held = [];

  async function acquireAt(index) {
    if (index === names.length) return callback(Object.freeze([...held]));
    const lockName = names[index];
    return lockRunner({
      lockName,
      env: options.env,
      ownerCommand: options.ownerCommand,
      ownerCwd: options.ownerCwd,
      ownerStartEvidence: options.ownerStartEvidence,
      transactionId: options.operationId,
      ttlMs: options.ttlMs,
      waitMs: options.waitMs,
      takeoverPolicy: takeoverPolicy(options, lockName)
    }, async (lock) => {
      held.push(lock);
      try {
        return await acquireAt(index + 1);
      } finally {
        held.pop();
      }
    });
  }

  return acquireAt(0);
}

export function assessInstallerLockTakeover(input = {}) {
  const lockRecord = input.lockRecord;
  const processEvidence = input.processEvidence;
  const journalEvidence = input.journalEvidence;
  const liveTargetEvidence = input.liveTargetEvidence;
  const ownerStartDiffers = typeof lockRecord?.ownerStartEvidence === 'string'
    && typeof processEvidence?.ownerStartEvidence === 'string'
    && lockRecord.ownerStartEvidence !== processEvidence.ownerStartEvidence;
  const ownerAbsent = processEvidence?.state === 'not-running' && ownerStartDiffers;
  const journalNoEffects = journalEvidence?.state === 'prepared'
    && journalEvidence?.effectsCertainty === 'none';
  const liveNoEffects = liveTargetEvidence?.classification === 'no-effects'
    && liveTargetEvidence?.preconditionsMatch === true;
  const leaseExpired = input.staleCandidate === true
    || input.leaseEvidence?.state === 'expired';

  if (
    input.ownerAlive !== true
    && ownerAbsent
    && leaseExpired
    && journalNoEffects
    && liveNoEffects
  ) {
    return Object.freeze({
      allowed: true,
      classification: 'abandoned-no-effects',
      reason: 'owner-dead-no-effects-proven',
      nextAction: null
    });
  }
  return Object.freeze({
    allowed: false,
    classification: 'indeterminate',
    reason: 'insufficient-owner-and-effect-evidence',
    nextAction: 'operation.reconcile'
  });
}

function takeoverPolicy(options, lockName) {
  return async (lockEvidence) => {
    if (typeof options.takeoverEvidenceProvider !== 'function') return false;
    if (lockEvidence.ownerAlive === true) return false;
    const evidence = await options.takeoverEvidenceProvider(Object.freeze({
      lockName,
      lockPath: lockEvidence.lockPath,
      lockRecord: lockEvidence.owner,
      ownerAlive: lockEvidence.ownerAlive
    }));
    return assessInstallerLockTakeover({
      lockRecord: lockEvidence.owner,
      ownerAlive: lockEvidence.ownerAlive,
      staleCandidate: lockEvidence.staleCandidate,
      processEvidence: evidence?.processEvidence,
      leaseEvidence: evidence?.leaseEvidence,
      journalEvidence: evidence?.journalEvidence,
      liveTargetEvidence: evidence?.liveTargetEvidence,
      now: evidence?.now
    }).allowed;
  };
}

function normalizeTargetIds(value) {
  if (!Array.isArray(value)) {
    throw lockError('agent_lock_options_invalid', 'targetIds must be an array.');
  }
  return [...new Set(value.map((entry) => requireText(entry, 'targetId')))].sort();
}

function lockToken(value) {
  const token = String(value).replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!token || token === '.' || token === '..') {
    throw lockError('agent_lock_options_invalid', 'Lock identity is invalid.');
  }
  return token;
}

function requireOperationId(value) {
  const operationId = String(value ?? '');
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    throw lockError('agent_lock_options_invalid', 'operationId is invalid.');
  }
  return operationId;
}

function requireBuildIdentity(value) {
  const buildIdentity = String(value ?? '');
  if (!BUILD_IDENTITY_PATTERN.test(buildIdentity)) {
    throw lockError('agent_lock_options_invalid', 'buildIdentity is invalid.');
  }
  return buildIdentity;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw lockError('agent_lock_options_invalid', `${label} is required.`);
  return text;
}

function lockError(code, message) {
  return new AgentInstallerError(code, message, {
    effectCertainty: 'none'
  });
}
