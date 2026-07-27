import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createArtifactStore } from '../artifacts/store.js';
import { createInstallerReconciler } from './reconciliation.js';
import { createReceiptStore } from './receipt-store.js';

const TRUSTED_RECEIPT_TARGETS = Object.freeze({
  'codex:mcp:mcpServers.launchdeck': Object.freeze(['.codex', 'mcp.json']),
  'codex:mcp:[mcp_servers.launchdeck]': Object.freeze(['.codex', 'config.toml']),
  'codex:skill:launchdeck-agent': Object.freeze(['.agents', 'skills', 'launchdeck-agent']),
  'claude:mcp:mcpServers.launchdeck': Object.freeze(['.mcp.json'])
});

const EMPTY_FILE_DIGEST = `sha256:${crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`;
const ZERO_DIGEST = `sha256:${'0'.repeat(64)}`;

export function isCanonicalPublicReconciliationPath(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return false;
  if (!path.isAbsolute(value)) return false;
  const resolved = path.resolve(value);
  return process.platform === 'win32'
    ? resolved.toLowerCase() === value.toLowerCase()
    : resolved === value;
}

export function createPublicInstallerReconciler(options = {}) {
  const journal = requireJournal(options.journal);
  const env = {
    ...(options.env ?? process.env),
    ...(journal.paths?.homeDir ? { LAUNCHDECK_HOME: journal.paths.homeDir } : {})
  };
  const receiptStore = options.receiptStore ?? createReceiptStore({ env });
  const artifactStore = options.artifactStore ?? createArtifactStore({ env });
  const fileSystem = requireFileSystem(options.fileSystem ?? fs);
  const takeoverEvidence = new Map();

  return createInstallerReconciler({
    journal,
    receiptStore,
    resourceLockRunner: options.resourceLockRunner,
    evidenceProvider: async (input = {}) => {
      if (input.phase === 'lock-takeover') {
        return observeTakeoverEvidence({
          input,
          receiptStore,
          env,
          fileSystem,
          takeoverEvidence
        });
      }
      return observeReconciliationEvidence({
        input,
        receiptStore,
        artifactStore,
        env,
        fileSystem,
        takeoverEvidence
      });
    }
  });
}

function observeTakeoverEvidence({
  input,
  receiptStore,
  env,
  fileSystem,
  takeoverEvidence
}) {
  const operationId = requireText(input.operationId, 'operationId');
  const record = requireInstallerRecord(input.record);
  const processEvidence = observeProcessEvidence(input.lockEvidence?.lockRecord);
  const leaseEvidence = observeLeaseEvidence(input.lockEvidence?.lockRecord, input.lockEvidence);
  const currentReceipt = readCurrentReceipt(record, receiptStore);
  const liveTargetEvidence = observeAggregateNoEffects({
    record,
    currentReceipt,
    env,
    fileSystem
  });
  const evidence = {
    processEvidence,
    leaseEvidence,
    journalEvidence: {
      state: record.state,
      effectsCertainty: record.effectsCertainty
    },
    liveTargetEvidence
  };
  if (
    input.lockEvidence?.ownerAlive !== true
    && processEvidence.state === 'not-running'
    && leaseEvidence.state === 'expired'
    && liveTargetEvidence.classification === 'no-effects'
    && liveTargetEvidence.preconditionsMatch === true
  ) {
    takeoverEvidence.set(operationId, {
      state: 'abandoned',
      processState: processEvidence.state,
      ownerPid: sanitizePid(input.lockEvidence?.lockRecord?.ownerPid),
      ownerStartIdentityChanged: true,
      leaseState: leaseEvidence.state
    });
  }
  return deepFreeze(evidence);
}

function observeReconciliationEvidence({
  input,
  receiptStore,
  artifactStore,
  env,
  fileSystem,
  takeoverEvidence
}) {
  const operationId = requireText(input.operationId, 'operationId');
  const record = requireInstallerRecord(input.record);
  const artifactEvidence = [observeArtifactEvidence(record.installer.buildIdentity, artifactStore)];
  const receiptEvidence = observeReceiptEvidence(record, receiptStore);
  const currentReceipt = readCurrentReceipt(record, receiptStore);
  const successReady = artifactEvidence[0].classification === 'verified'
    && receiptEvidence.classification === 'committed';
  const liveTargetEvidence = observeLiveTargetEvidence({
    record,
    successReady,
    currentReceipt,
    env,
    fileSystem
  });
  const lockEvidence = takeoverEvidence.get(operationId) ?? { state: 'released' };
  takeoverEvidence.delete(operationId);
  return deepFreeze({
    lockEvidence,
    liveTargetEvidence,
    artifactEvidence,
    receiptEvidence
  });
}

function observeAggregateNoEffects({ record, currentReceipt, env, fileSystem }) {
  const observations = observeLiveTargetEvidence({
    record,
    successReady: false,
    currentReceipt,
    env,
    fileSystem
  });
  if (
    observations.length > 0
    && observations.every((entry) =>
      entry.classification === 'no-effects'
      && entry.preconditionsMatch === true
    )
  ) {
    return {
      classification: 'no-effects',
      preconditionsMatch: true
    };
  }
  return {
    classification: 'unknown',
    preconditionsMatch: false
  };
}

function observeLiveTargetEvidence({
  record,
  successReady,
  currentReceipt,
  env,
  fileSystem
}) {
  const actions = requireActionArray(record.installer?.actions);
  const effectTargetIds = new Set(
    requireActionArray(record.installer?.effects)
      .map((entry) => (typeof entry?.targetId === 'string' ? entry.targetId : null))
      .filter(Boolean)
  );
  return actions.map((action) => observeTarget({
    action,
    effectTargetIds,
    record,
    successReady,
    currentReceipt,
    env,
    fileSystem
  }));
}

function observeTarget({
  action,
  effectTargetIds,
  record,
  successReady,
  currentReceipt,
  env,
  fileSystem
}) {
  const trustedTarget = authorizeTargetObservation({
    action,
    record,
    currentReceipt,
    env
  });
  if (!trustedTarget) {
    return {
      targetId: action.targetId,
      ownershipBoundary: action.ownershipBoundary,
      classification: 'unknown'
    };
  }

  const { targetPath, scopeRoot, targetKind, identityName } = trustedTarget;
  let stat;
  try {
    stat = fileSystem.lstatSync(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return missingTargetObservation(action, effectTargetIds.has(action.targetId));
    }
    return {
      targetId: action.targetId,
      ownershipBoundary: action.ownershipBoundary,
      classification: 'unknown'
    };
  }
  if (
    stat.isSymbolicLink()
    || (targetKind === 'file' && !stat.isFile())
    || (targetKind === 'directory' && !stat.isDirectory())
    || !realPathContained(scopeRoot, targetPath, fileSystem)
  ) {
    return {
      targetId: action.targetId,
      ownershipBoundary: action.ownershipBoundary,
      classification: 'unknown'
    };
  }

  const observedDigest = targetKind === 'directory'
    ? digestDirectory(targetPath, identityName, fileSystem)
    : digestFile(targetPath, fileSystem);
  const effectRecorded = effectTargetIds.has(action.targetId);
  if (observedDigest === action.desiredDigest) {
    return successReady
      ? {
          targetId: action.targetId,
          ownershipBoundary: action.ownershipBoundary,
          classification: 'verified',
          observedDigest,
          buildIdentity: record.installer.buildIdentity
        }
      : {
          targetId: action.targetId,
          ownershipBoundary: action.ownershipBoundary,
          classification: 'managed-effect-remains',
          observedDigest
        };
  }
  if (observedDigest === action.preconditionDigest) {
    return effectRecorded
      ? {
          targetId: action.targetId,
          ownershipBoundary: action.ownershipBoundary,
          classification: 'fully-rolled-back',
          observedDigest
        }
      : {
          targetId: action.targetId,
          ownershipBoundary: action.ownershipBoundary,
          classification: 'no-effects',
          observedDigest,
          preconditionsMatch: true
        };
  }
  return {
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    classification: 'unknown',
    observedDigest
  };
}

function authorizeTargetObservation({ action, record, currentReceipt, env }) {
  if (!trustedOwnershipTarget(currentReceipt, record.installer?.receiptCandidate, action, record)) {
    return null;
  }

  const descriptor = parseTargetDescriptor(action.targetId);
  if (!descriptor || descriptor.scope !== record.installer.scope) return null;

  const scopeRoot = observationRootFor(descriptor, record, env);
  if (!scopeRoot) return null;

  const managedTarget = canonicalManagedTarget({
    descriptor,
    ownershipBoundary: action.ownershipBoundary,
    scopeRoot
  });
  if (!managedTarget) return null;

  const candidatePath = normalizeAbsolutePath(action.targetPath);
  if (!candidatePath || !samePath(candidatePath, managedTarget.targetPath)) return null;

  return {
    scopeRoot,
    ...managedTarget
  };
}

function observeArtifactEvidence(buildIdentity, artifactStore) {
  try {
    const artifact = artifactStore.inspect(buildIdentity);
    return {
      buildIdentity,
      classification: artifact.state === 'verified' ? 'verified' : artifact.state
    };
  } catch {
    return {
      buildIdentity,
      classification: 'unknown'
    };
  }
}

function observeReceiptEvidence(record, receiptStore) {
  const scope = {
    scope: record.installer.scope,
    scopeIdentity: record.installer.scopeIdentity,
    projectIdentity: record.installer.projectIdentity
  };
  const expectedReceiptId = record.installer.receiptRef?.receiptId
    ?? record.installer.receiptCandidate?.receiptId
    ?? null;
  let immutableReceipt;
  if (expectedReceiptId) {
    try {
      immutableReceipt = receiptStore.read(expectedReceiptId);
    } catch {
      return { classification: 'unknown' };
    }
  } else {
    immutableReceipt = null;
  }
  let currentReceipt;
  try {
    currentReceipt = receiptStore.readCurrent(scope);
  } catch {
    return { classification: 'unknown' };
  }
  if (!immutableReceipt && !currentReceipt) {
    return { classification: 'absent' };
  }
  if (
    immutableReceipt
    && currentReceipt
    && immutableReceipt.receiptId === currentReceipt.receiptId
    && immutableReceipt.receiptDigest === currentReceipt.receiptDigest
    && immutableReceipt.buildIdentity === record.installer.buildIdentity
  ) {
    return {
      classification: 'committed',
      receiptId: immutableReceipt.receiptId,
      receiptDigest: immutableReceipt.receiptDigest
    };
  }
  if (immutableReceipt && !currentReceipt) {
    return {
      classification: 'orphaned',
      receiptId: immutableReceipt.receiptId,
      receiptDigest: immutableReceipt.receiptDigest
    };
  }
  if (!immutableReceipt && currentReceipt) {
    return {
      classification: 'replaced',
      receiptId: currentReceipt.receiptId,
      receiptDigest: currentReceipt.receiptDigest
    };
  }
  return {
    classification: 'replaced',
    receiptId: currentReceipt?.receiptId ?? immutableReceipt?.receiptId ?? null,
    receiptDigest: currentReceipt?.receiptDigest ?? immutableReceipt?.receiptDigest ?? null
  };
}

function readCurrentReceipt(record, receiptStore) {
  try {
    return receiptStore.readCurrent({
      scope: record.installer.scope,
      scopeIdentity: record.installer.scopeIdentity,
      projectIdentity: record.installer.projectIdentity
    });
  } catch {
    return null;
  }
}

function trustedOwnershipTarget(currentReceipt, receiptCandidate, action, record) {
  return trustedReceiptTarget(currentReceipt, action, record)
    ?? trustedReceiptTarget(receiptCandidate, action, record);
}

function trustedReceiptTarget(receipt, action, record) {
  if (
    !receipt
    || receipt.scope !== record.installer.scope
    || receipt.scopeIdentity !== record.installer.scopeIdentity
    || receipt.projectIdentity !== record.installer.projectIdentity
    || receipt.buildIdentity !== record.installer.buildIdentity
  ) {
    return null;
  }
  return requireActionArray(receipt.targets).find((entry) =>
    entry?.targetId === action.targetId
    && entry?.ownershipBoundary === action.ownershipBoundary
    && entry?.desiredDigest === action.desiredDigest
  ) ?? null;
}

function observeProcessEvidence(lockRecord) {
  const ownerPid = sanitizePid(lockRecord?.ownerPid);
  if (ownerPid === null) {
    return {
      state: 'unknown',
      ownerStartEvidence: null
    };
  }
  try {
    process.kill(ownerPid, 0);
    return {
      state: 'running',
      ownerStartEvidence: String(lockRecord?.ownerStartEvidence ?? 'running')
    };
  } catch (error) {
    if (error?.code === 'EPERM') {
      return {
        state: 'running',
        ownerStartEvidence: String(lockRecord?.ownerStartEvidence ?? 'running')
      };
    }
    return {
      state: 'not-running',
      ownerStartEvidence: `not-running:${ownerPid}`
    };
  }
}

function observeLeaseEvidence(lockRecord, lockEvidence) {
  if (lockEvidence?.staleCandidate === true) {
    return { state: 'expired' };
  }
  const expiresAt = Date.parse(String(lockRecord?.expiresAt ?? ''));
  if (!Number.isFinite(expiresAt)) {
    return { state: 'absent' };
  }
  return {
    state: expiresAt <= Date.now() ? 'expired' : 'live'
  };
}

function parseTargetDescriptor(targetId) {
  const [host, scope, component, ...rest] = String(targetId ?? '').split(':');
  if (!host || !scope || !component || rest.length > 0) return null;
  if (!['project', 'user'].includes(scope)) return null;
  return { host, scope, component };
}

function observationRootFor(descriptor, record, env) {
  if (descriptor.host === 'launchdeck' && descriptor.component === 'runtime') {
    return normalizeAbsolutePath(env.LAUNCHDECK_HOME);
  }
  if (descriptor.scope === 'project') {
    return normalizeAbsolutePath(record.installer.projectIdentity);
  }
  return normalizeAbsolutePath(env.HOME ?? env.USERPROFILE);
}

function canonicalManagedTarget({ descriptor, ownershipBoundary, scopeRoot }) {
  if (
    descriptor.host === 'launchdeck'
    && descriptor.component === 'runtime'
    && ownershipBoundary === 'stable-launcher'
  ) {
    return {
      targetPath: path.resolve(scopeRoot, 'installer', 'launcher', 'v1'),
      targetKind: 'directory',
      identityName: 'v1'
    };
  }
  const relative = TRUSTED_RECEIPT_TARGETS[
    `${descriptor.host}:${descriptor.component}:${ownershipBoundary}`
  ];
  if (!relative) return null;
  return {
    targetPath: path.resolve(scopeRoot, ...relative),
    targetKind: descriptor.component === 'skill' ? 'directory' : 'file',
    identityName: descriptor.component === 'skill' ? ownershipBoundary : null
  };
}

function normalizeAbsolutePath(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  if (!path.isAbsolute(value)) return null;
  return path.resolve(value);
}

function samePath(left, right) {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function realPathContained(scopeRoot, targetPath, fileSystem) {
  try {
    const realScopeRoot = resolveRealPath(scopeRoot, fileSystem);
    const realTargetPath = resolveRealPath(targetPath, fileSystem);
    if (!realScopeRoot || !realTargetPath) return false;
    const relative = path.relative(realScopeRoot, realTargetPath);
    return relative.length > 0
      && relative !== '.'
      && !relative.startsWith('..')
      && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

function resolveRealPath(targetPath, fileSystem) {
  if (typeof fileSystem.realpathSyncNative === 'function') {
    return fileSystem.realpathSyncNative(targetPath);
  }
  if (typeof fileSystem.realpathSync === 'function') {
    return fileSystem.realpathSync(targetPath);
  }
  return null;
}

function requireInstallerRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('Installer reconciliation record is required.');
  }
  if (!record.installer || record.installer.kind !== 'agent-installer') {
    throw new TypeError('Installer reconciliation record must be an agent-installer journal.');
  }
  return record;
}

function requireActionArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizePid(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function digestFile(filePath, fileSystem) {
  return `sha256:${crypto.createHash('sha256').update(fileSystem.readFileSync(filePath)).digest('hex')}`;
}

function digestDirectory(root, identityName, fileSystem) {
  if (typeof fileSystem.readdirSync !== 'function') {
    throw new TypeError('Directory reconciliation requires readdirSync().');
  }
  const files = [];
  collectDirectoryFiles(root, '', files, fileSystem);
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return digestCanonical({
    schemaVersion: 1,
    skillName: identityName,
    files
  });
}

function collectDirectoryFiles(root, relativeDir, files, fileSystem) {
  const directory = path.join(root, relativeDir);
  for (const entry of fileSystem.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new TypeError('Managed reconciliation directories cannot contain symbolic links.');
    }
    if (entry.isDirectory()) {
      collectDirectoryFiles(root, relativePath, files, fileSystem);
      continue;
    }
    if (!entry.isFile()) {
      throw new TypeError('Managed reconciliation directories contain an unsupported entry.');
    }
    const bytes = fileSystem.readFileSync(absolutePath);
    files.push({
      path: relativePath.replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
    });
  }
}

function digestCanonical(value) {
  const canonical = JSON.stringify(canonicalJson(value));
  return `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function missingTargetObservation(action, effectRecorded) {
  const base = {
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary
  };
  if (![EMPTY_FILE_DIGEST, ZERO_DIGEST].includes(action.preconditionDigest)) {
    return { ...base, classification: 'missing' };
  }
  return effectRecorded
    ? { ...base, classification: 'fully-rolled-back', observedDigest: action.preconditionDigest }
    : {
        ...base,
        classification: 'no-effects',
        observedDigest: action.preconditionDigest,
        preconditionsMatch: true
      };
}

function requireJournal(journal) {
  for (const method of ['get', 'transition', 'checkpoint', 'recover']) {
    if (typeof journal?.[method] !== 'function') {
      throw new TypeError(`A journal with ${method}() is required.`);
    }
  }
  return journal;
}

function requireFileSystem(fileSystem) {
  const nativeRealpath = typeof fileSystem?.realpathSync?.native === 'function'
    ? fileSystem.realpathSync.native.bind(fileSystem.realpathSync)
    : typeof fileSystem?.realpathSyncNative === 'function'
      ? fileSystem.realpathSyncNative.bind(fileSystem)
      : undefined;
  if (
    typeof fileSystem?.lstatSync !== 'function'
    || typeof fileSystem?.readFileSync !== 'function'
    || (
      typeof fileSystem?.realpathSync !== 'function'
      && typeof nativeRealpath !== 'function'
    )
  ) {
    throw new TypeError('A fileSystem with lstatSync(), readFileSync(), and realpath support is required.');
  }
  return Object.freeze({
    lstatSync: fileSystem.lstatSync.bind(fileSystem),
    readFileSync: fileSystem.readFileSync.bind(fileSystem),
    readdirSync: typeof fileSystem.readdirSync === 'function'
      ? fileSystem.readdirSync.bind(fileSystem)
      : undefined,
    realpathSync: typeof fileSystem.realpathSync === 'function'
      ? fileSystem.realpathSync.bind(fileSystem)
      : undefined,
    realpathSyncNative: nativeRealpath
  });
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
