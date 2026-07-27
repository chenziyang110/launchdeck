import { AgentInstallerError } from '../errors.js';

const BUILD_IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const RECOVERABLE_STATES = new Set([
  'prepared',
  'running',
  'partial',
  'indeterminate',
  'recoverable'
]);
const TERMINAL_STATES = new Set([
  'succeeded',
  'failed',
  'refused',
  'cancelled',
  'reconciled'
]);

export function collectArtifactPins({
  receipts = [],
  transactions = [],
  backups = [],
  reconciliationRecords = []
} = {}) {
  const pins = new Map();

  for (const receipt of requireRecords(receipts, 'receipts')) {
    const currentReceipt = normalizeCurrentReceipt(receipt);
    addPin(
      pins,
      currentReceipt.buildIdentity,
      `receipt:${recordIdentity(currentReceipt, 'receiptId')}`,
      false
    );
  }

  for (const transaction of requireRecords(transactions, 'transactions')) {
    const normalized = normalizeRecoverableRecord(transaction, 'transaction');
    if (!normalized) continue;
    const identity = recordIdentity(normalized, 'operationId');
    const evidence = normalized.evidence;
    addBuildFields(pins, evidence, `transaction:${identity}`, true, [
      'buildIdentity',
      'desiredBuildIdentity'
    ], [
      'buildIdentities',
      'previousBuildPins',
      'requiredBuildIdentities'
    ]);
    addPin(
      pins,
      evidence.receiptCandidate?.buildIdentity,
      `transaction-receipt-candidate:${identity}`,
      true,
      true
    );
    for (const backupRef of arrayOrEmpty(evidence.backupRefs)) {
      const buildIdentity = typeof backupRef === 'string'
        ? backupRef
        : backupRef?.buildIdentity;
      addPin(
        pins,
        buildIdentity,
        `transaction-backup:${identity}`,
        true,
        true
      );
    }
  }

  for (const backup of requireRecords(backups, 'backups')) {
    if (!isRequiredBackup(backup)) continue;
    if (!hasAnyBuildReference(backup)) {
      throw referenceError(
        'agent_artifact_references_invalid',
        'A recovery backup must identify the build it retains.',
        { backupId: recordIdentity(backup, 'backupId') }
      );
    }
    addBuildFields(
      pins,
      backup,
      `backup:${recordIdentity(backup, 'backupId')}`,
      true,
      ['buildIdentity'],
      ['requiredBuildIdentities']
    );
  }

  for (const record of requireRecords(
    reconciliationRecords,
    'reconciliationRecords'
  )) {
    const normalized = normalizeRecoverableRecord(record, 'reconciliation');
    if (!normalized) continue;
    const evidence = normalized.evidence;
    addBuildFields(
      pins,
      evidence,
      `reconciliation:${recordIdentity(normalized, 'operationId')}`,
      true,
      ['buildIdentity', 'previousBuildIdentity'],
      ['buildIdentities', 'requiredBuildIdentities', 'previousBuildPins']
    );
  }

  return Object.freeze(
    [...pins.entries()]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([buildIdentity, entry]) => deepFreeze({
        buildIdentity,
        referenceCount: entry.reasons.size,
        recoveryReferenceCount: entry.recoveryReasons.size,
        reasons: Object.freeze([...entry.reasons].sort(compareStrings)),
        recoveryReasons: Object.freeze(
          [...entry.recoveryReasons].sort(compareStrings)
        )
      }))
  );
}

export function isArtifactPinned(pins, buildIdentity) {
  const normalized = requireBuildIdentity(buildIdentity);
  if (!Array.isArray(pins)) {
    throw referenceError('agent_artifact_references_invalid', 'Pins must be an array.');
  }
  return pins.some((entry) => entry?.buildIdentity === normalized);
}

function addBuildFields(
  pins,
  record,
  reason,
  recovery,
  scalarFields,
  arrayFields
) {
  for (const field of scalarFields) {
    addPin(pins, record?.[field], `${reason}:${field}`, recovery, true);
  }
  for (const field of arrayFields) {
    for (const value of arrayOrEmpty(record?.[field])) {
      const buildIdentity = typeof value === 'string' ? value : value?.buildIdentity;
      addPin(pins, buildIdentity, `${reason}:${field}`, recovery, true);
    }
  }
}

function addPin(pins, value, reason, recovery, optional = false) {
  if ((value === undefined || value === null || value === '') && optional) return;
  const buildIdentity = requireBuildIdentity(value);
  let entry = pins.get(buildIdentity);
  if (!entry) {
    entry = {
      reasons: new Set(),
      recoveryReasons: new Set()
    };
    pins.set(buildIdentity, entry);
  }
  entry.reasons.add(reason);
  if (recovery) entry.recoveryReasons.add(reason);
}

function normalizeCurrentReceipt(receipt) {
  const explicitlyCurrent = receipt?.current === true
    || receipt?.active === true
    || receipt?.state === 'current'
    || receipt?.state === 'referenced';
  const canonicalReceipt = typeof receipt?.receiptId === 'string'
    && typeof receipt?.receiptDigest === 'string'
    && typeof receipt?.scopeIdentity === 'string'
    && ['project', 'user'].includes(receipt?.scope);
  if (!explicitlyCurrent && !canonicalReceipt) {
    throw referenceError(
      'agent_artifact_references_invalid',
      'Receipt reference is neither canonical nor explicitly current.'
    );
  }
  requireBuildIdentity(receipt.buildIdentity);
  return receipt;
}

function normalizeRecoverableRecord(record, label) {
  const state = String(record?.state ?? '').trim();
  const recoverable = RECOVERABLE_STATES.has(state)
    || record?.recoveryRequired === true
    || record?.open === true;
  if (!recoverable) {
    if (TERMINAL_STATES.has(state)) return null;
    throw referenceError(
      'agent_artifact_references_invalid',
      `${label} reference has an unknown lifecycle state.`,
      { state }
    );
  }
  const evidence = record.installer ?? record;
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || !hasAnyBuildReference(evidence)
  ) {
    throw referenceError(
      'agent_artifact_references_invalid',
      `${label} reference does not expose canonical installer build evidence.`
    );
  }
  return {
    operationId: record.operationId ?? evidence.operationId,
    evidence
  };
}

function isRequiredBackup(backup) {
  return backup?.required === true
    || backup?.recoveryRequired === true
    || backup?.state === 'required'
    || backup?.state === 'open'
    || backup?.retentionState === 'recovery'
    || RECOVERABLE_STATES.has(backup?.state);
}

function hasAnyBuildReference(record) {
  return [
    record?.buildIdentity,
    record?.desiredBuildIdentity,
    record?.previousBuildIdentity,
    record?.receiptCandidate?.buildIdentity
  ].some((entry) => entry !== undefined && entry !== null)
    || [
      record?.buildIdentities,
      record?.previousBuildPins,
      record?.requiredBuildIdentities
    ].some((entry) => Array.isArray(entry) && entry.length > 0);
}

function requireRecords(value, label) {
  if (!Array.isArray(value)) {
    throw referenceError(
      'agent_artifact_references_invalid',
      `${label} must be an array.`
    );
  }
  for (const record of value) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw referenceError(
        'agent_artifact_references_invalid',
        `${label} must contain records.`
      );
    }
  }
  return value;
}

function recordIdentity(record, field) {
  const identity = String(record?.[field] ?? '').trim();
  return identity || 'unknown';
}

function arrayOrEmpty(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw referenceError(
      'agent_artifact_references_invalid',
      'Artifact reference list must be an array.'
    );
  }
  return value;
}

function requireBuildIdentity(value) {
  const normalized = String(value ?? '').trim();
  if (!BUILD_IDENTITY_PATTERN.test(normalized)) {
    throw referenceError(
      'agent_build_identity_invalid',
      'Artifact reference build identity is invalid.',
      { buildIdentity: normalized }
    );
  }
  return normalized;
}

function referenceError(code, message, details = {}) {
  return new AgentInstallerError(code, message, {
    effectCertainty: 'none',
    details
  });
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
