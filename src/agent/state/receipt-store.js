import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../../control-plane/state.js';
import { digestCanonical } from '../digests.js';
import { AgentInstallerError } from '../errors.js';
import { redactInstallerValue } from '../result.js';
import { resolveInstallationScope } from './scope-resolver.js';
import { installerStatePaths } from './paths.js';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const RECEIPT_ID_PATTERN = /^receipt_[A-Za-z0-9_-]{8,128}$/;
const SCOPE_IDENTITY_PATTERN = /^(?:project|user):sha256:[0-9a-f]{64}$/;

export function createReceiptStore(options = {}) {
  const env = options.env ?? process.env;
  const paths = installerStatePaths(env);
  const clock = options.clock ?? (() => new Date());

  return Object.freeze({
    paths,
    commit,
    read,
    readCurrent
  });

  function commit(candidate) {
    const receipt = normalizeReceipt(candidate, clock);
    const receiptPath = paths.receiptPath(receipt.receiptId);
    if (fs.existsSync(receiptPath)) {
      const existing = readReceiptPath(receiptPath);
      if (existing.receiptDigest === receipt.receiptDigest) return existing;
      throw receiptError(
        'agent_receipt_immutable',
        `Receipt '${receipt.receiptId}' already exists with different content.`
      );
    }

    atomicWriteJson(receiptPath, receipt);
    const published = readReceiptPath(receiptPath);
    if (published.receiptDigest !== receipt.receiptDigest) {
      throw receiptError('agent_receipt_write_invalid', 'Published receipt verification failed.');
    }

    atomicWriteJson(paths.scopeIndexPath(receipt.scopeIdentity), {
      schemaVersion: 1,
      scope: receipt.scope,
      scopeIdentity: receipt.scopeIdentity,
      projectIdentity: receipt.projectIdentity,
      receiptId: receipt.receiptId,
      receiptDigest: receipt.receiptDigest,
      updatedAt: nowIso(clock)
    });
    return published;
  }

  function read(receiptId) {
    const receiptPath = paths.receiptPath(requireReceiptId(receiptId));
    return fs.existsSync(receiptPath) ? readReceiptPath(receiptPath) : null;
  }

  function readCurrent(scope) {
    const normalizedScope = normalizeScopeRef(scope);
    const indexPath = paths.scopeIndexPath(normalizedScope.scopeIdentity);
    if (!fs.existsSync(indexPath)) return null;
    const index = readJson(indexPath, 'agent_receipt_index_invalid');
    if (
      index?.schemaVersion !== 1
      || index.scope !== normalizedScope.scope
      || index.scopeIdentity !== normalizedScope.scopeIdentity
      || index.projectIdentity !== normalizedScope.projectIdentity
      || !RECEIPT_ID_PATTERN.test(index.receiptId ?? '')
      || !DIGEST_PATTERN.test(index.receiptDigest ?? '')
    ) {
      throw receiptError('agent_receipt_index_invalid', 'Current receipt index is invalid.');
    }
    const receipt = read(index.receiptId);
    if (
      !receipt
      || receipt.receiptDigest !== index.receiptDigest
      || receipt.scopeIdentity !== index.scopeIdentity
    ) {
      throw receiptError(
        'agent_receipt_index_invalid',
        'Current receipt index does not resolve to its immutable receipt.'
      );
    }
    return receipt;
  }
}

export function classifyReceiptOwnership(ownedTarget = {}, observation = {}) {
  if (
    observation.targetId !== ownedTarget.targetId
    || observation.ownershipBoundary !== ownedTarget.ownershipBoundary
  ) {
    return Object.freeze({
      classification: 'unrelated',
      removable: false,
      repairable: false
    });
  }
  if (observation.exists !== true) {
    return Object.freeze({
      classification: 'missing',
      removable: false,
      repairable: true
    });
  }
  if (observation.observedDigest === ownedTarget.desiredDigest) {
    return Object.freeze({
      classification: 'verified',
      removable: true,
      repairable: false
    });
  }
  return Object.freeze({
    classification: 'divergent',
    removable: false,
    repairable: false
  });
}

function normalizeReceipt(candidate, clock) {
  requireCanonicalPlainObject(candidate, 'Receipt', 'agent_receipt_invalid');
  assertAllowedReceiptFields(candidate, [
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
  ], 'Receipt');
  const receiptId = requireReceiptId(candidate.receiptId);
  const scopeRef = normalizeReceiptScope(candidate);
  const buildIdentity = requireDigest(candidate.buildIdentity, 'buildIdentity');
  const targets = requireArray(candidate.targets, 'targets').map(normalizeOwnedTarget);
  if (new Set(targets.map((target) => target.targetId)).size !== targets.length) {
    throw receiptError('agent_receipt_invalid', 'Receipt targets must be unique.');
  }
  const ownedDigests = requireArray(candidate.ownedDigests, 'ownedDigests');
  for (const digest of ownedDigests) requireDigest(digest, 'ownedDigests');
  const verificationEvidence = requireArray(
    candidate.verificationEvidence,
    'verificationEvidence'
  ).map((evidence, index) =>
    normalizeVerificationEvidence(evidence, targets[index], buildIdentity)
  );
  const verificationByTarget = new Map(
    verificationEvidence.map((entry) => [entry.targetId, entry])
  );
  if (
    verificationByTarget.size !== verificationEvidence.length
    || targets.some((target) => {
      const evidence = verificationByTarget.get(target.targetId);
      return evidence?.verified !== true
        || evidence.buildIdentity !== buildIdentity
        || evidence.observedDigest !== target.desiredDigest;
    })
  ) {
    throw receiptError(
      'agent_receipt_verification_invalid',
      'Receipt verification does not match every owned target.'
    );
  }
  const targetDigests = targets.map((target) => target.desiredDigest);
  if (digestCanonical([...ownedDigests].sort()) !== digestCanonical([...targetDigests].sort())) {
    throw receiptError(
      'agent_receipt_invalid',
      'Receipt owned digests do not match its target ownership.'
    );
  }
  const committedAt = candidate.committedAt === undefined
    ? nowIso(clock)
    : requireIsoDate(candidate.committedAt, 'committedAt');
  const supersedesReceiptId = candidate.supersedesReceiptId === null
    || candidate.supersedesReceiptId === undefined
    ? null
    : requireReceiptId(candidate.supersedesReceiptId);
  const content = redactInstallerValue({
    receiptId,
    scope: scopeRef.scope,
    scopeIdentity: scopeRef.scopeIdentity,
    projectIdentity: scopeRef.projectIdentity,
    buildIdentity,
    targets,
    ownedDigests,
    verificationEvidence,
    committedAt,
    supersedesReceiptId
  });
  return deepFreeze({
    ...content,
    receiptDigest: digestCanonical(content)
  });
}

function normalizeOwnedTarget(target) {
  requireCanonicalPlainObject(target, 'Receipt target', 'agent_receipt_invalid');
  assertAllowedReceiptFields(target, [
    'targetId',
    'ownershipBoundary',
    'desiredDigest'
  ], 'Receipt target');
  return {
    targetId: requireText(target.targetId, 'target.targetId'),
    ownershipBoundary: requireText(
      target.ownershipBoundary,
      'target.ownershipBoundary'
    ),
    desiredDigest: requireDigest(target.desiredDigest, 'target.desiredDigest')
  };
}

function normalizeVerificationEvidence(evidence, target, buildIdentity) {
  requireCanonicalPlainObject(
    evidence,
    'Verification evidence',
    'agent_receipt_verification_invalid'
  );
  assertAllowedReceiptFields(evidence, [
    'targetId',
    'kind',
    'buildIdentity',
    'observedDigest',
    'digest',
    'verified'
  ], 'Verification evidence');
  const observedDigest = evidence.observedDigest ?? evidence.digest;
  return {
    targetId: requireText(evidence.targetId ?? target?.targetId, 'verification.targetId'),
    kind: requireText(evidence.kind, 'verification.kind'),
    buildIdentity: requireDigest(
      evidence.buildIdentity ?? buildIdentity,
      'verification.buildIdentity'
    ),
    observedDigest: requireDigest(
      observedDigest,
      'verification.observedDigest'
    ),
    verified: evidence.verified === undefined ? true : evidence.verified === true
  };
}

function assertAllowedReceiptFields(value, fields, label) {
  const unexpected = Object.keys(value).filter((field) => !fields.includes(field));
  if (unexpected.length > 0) {
    throw receiptError(
      'agent_receipt_evidence_invalid',
      `${label} contains unsupported durable fields.`
    );
  }
}

function normalizeScopeRef(scope) {
  requireCanonicalPlainObject(scope, 'Scope reference', 'agent_receipt_scope_invalid');
  if (scope.scope === 'project') {
    return normalizeProjectScopeRef(scope, 'agent_receipt_scope_invalid');
  }
  if (scope.scope === 'user') {
    return normalizeUserScopeRef(scope, 'agent_receipt_scope_invalid');
  }
  throw receiptError('agent_receipt_scope_invalid', "scope must be 'project' or 'user'.");
}

function readReceiptPath(receiptPath) {
  const receipt = readJson(receiptPath, 'agent_receipt_invalid');
  const { receiptDigest, ...content } = receipt ?? {};
  if (!DIGEST_PATTERN.test(receiptDigest ?? '') || digestCanonical(content) !== receiptDigest) {
    throw receiptError('agent_receipt_invalid', `Receipt is invalid: ${receiptPath}`);
  }
  return deepFreeze(structuredClone(receipt));
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw receiptError(code, `Installer state is invalid: ${filePath}`, {
      causeMessage: error?.message
    });
  }
}

function requireReceiptId(value) {
  const receiptId = String(value ?? '');
  if (!RECEIPT_ID_PATTERN.test(receiptId)) {
    throw receiptError('agent_receipt_invalid', 'receiptId is invalid.');
  }
  return receiptId;
}

function requireDigest(value, label) {
  const digest = String(value ?? '');
  if (!DIGEST_PATTERN.test(digest)) {
    throw receiptError('agent_receipt_invalid', `${label} is invalid.`);
  }
  return digest;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw receiptError('agent_receipt_invalid', `${label} is required.`);
  return text;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw receiptError('agent_receipt_invalid', `${label} must be an array.`);
  }
  return [...value];
}

function normalizeReceiptScope(candidate) {
  requireCanonicalPlainObject(candidate, 'Receipt', 'agent_receipt_invalid');
  if (candidate.scope === 'project') {
    return normalizeProjectScopeRef(candidate, 'agent_receipt_scope_invalid');
  }
  if (candidate.scope === 'user') {
    return normalizeUserScopeRef(candidate, 'agent_receipt_scope_invalid');
  }
  throw receiptError('agent_receipt_invalid', 'Receipt scope is invalid.');
}

function normalizeProjectScopeRef(scope, code) {
  const projectIdentity = requireCanonicalProjectIdentity(scope.projectIdentity, code);
  const resolved = resolveInstallationScope({
    scope: 'project',
    projectRoot: projectIdentity
  });
  if (
    scope.scopeIdentity !== resolved.scopeIdentity
    || resolved.projectIdentity !== projectIdentity
  ) {
    throw receiptError(code, 'Project scope identity is inconsistent.');
  }
  return Object.freeze(resolved);
}

function normalizeUserScopeRef(scope, code) {
  const scopeIdentity = requireText(scope.scopeIdentity, 'scopeIdentity');
  if (scope.projectIdentity !== null) {
    throw receiptError(code, 'User scope identity is inconsistent.');
  }
  if (!SCOPE_IDENTITY_PATTERN.test(scopeIdentity) || !scopeIdentity.startsWith('user:')) {
    throw receiptError(code, 'User scope identity is inconsistent.');
  }
  return Object.freeze({
    scope: 'user',
    scopeIdentity,
    projectIdentity: null
  });
}

function requireCanonicalProjectIdentity(value, code) {
  const projectIdentity = requireText(value, 'projectIdentity');
  if (!path.isAbsolute(projectIdentity) || path.resolve(projectIdentity) !== projectIdentity) {
    throw receiptError(code, 'projectIdentity must be a canonical absolute path.');
  }
  let canonical;
  try {
    canonical = fs.realpathSync.native(projectIdentity);
  } catch (error) {
    throw receiptError(code, 'projectIdentity must resolve to an existing canonical path.', {
      causeCode: error?.code
    });
  }
  if (canonical !== projectIdentity) {
    throw receiptError(code, 'projectIdentity must be a canonical absolute path.');
  }
  return canonical;
}

function requireCanonicalPlainObject(value, label, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw receiptError(code, `${label} must be a canonical plain object.`);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw receiptError(code, `${label} must be a canonical plain object.`);
  }
  return value;
}

function requireIsoDate(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw receiptError('agent_receipt_invalid', `${label} is invalid.`);
  }
  return date.toISOString();
}

function nowIso(clock) {
  return requireIsoDate(clock(), 'clock');
}

function receiptError(code, message, details = undefined) {
  return new AgentInstallerError(code, message, {
    effectCertainty: 'none',
    details
  });
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
