import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../../control-plane/state.js';
import { AgentInstallerError } from '../errors.js';
import { installerStatePaths } from './paths.js';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ID_PATTERN = /^(?:backup|op)_[A-Za-z0-9_-]{16,128}$/;
const OPEN_RECOVERY_STATES = new Set(['prepared', 'running', 'partial', 'indeterminate']);
const DIRECTORY_MANIFEST_SCHEMA_VERSION = 1;
const MAX_DIRECTORY_FILES = 1_024;
const MAX_DIRECTORY_DEPTH = 32;
const MAX_DIRECTORY_TOTAL_BYTES = 10 * 1024 * 1024;

export function createBackupStore(options = {}) {
  const env = options.env ?? process.env;
  const paths = installerStatePaths(env);
  const clock = options.clock ?? (() => new Date());

  return Object.freeze({
    paths,
    create,
    read,
    restore,
    assessRetention
  });

  function create(input = {}) {
    const backupId = requireId(input.backupId, 'backupId', 'backup_');
    const operationId = requireId(input.operationId, 'operationId', 'op_');
    const targetId = requireText(input.targetId, 'targetId');
    const sourcePath = path.resolve(requireText(input.sourcePath, 'sourcePath'));
    const originalDigest = requireDigest(input.originalDigest, 'originalDigest');
    const source = requireBackupSource(sourcePath);
    if (digestSource(sourcePath, source.kind) !== originalDigest) {
      throw backupError(
        'agent_backup_source_mismatch',
        'Backup source digest does not match transaction evidence.'
      );
    }
    const backupDir = paths.backupDir(operationId, backupId);
    const backupPath = path.join(backupDir, 'content');
    const metadataPath = path.join(backupDir, 'metadata.json');
    if (fs.existsSync(metadataPath) || fs.existsSync(backupPath)) {
      throw backupError('agent_backup_immutable', `Backup '${backupId}' already exists.`);
    }

    if (source.kind === 'directory') {
      atomicCopyDirectory(sourcePath, backupPath);
    } else {
      atomicCopyFile(sourcePath, backupPath, 0o600);
    }
    if (digestSource(backupPath, source.kind, path.basename(sourcePath)) !== originalDigest) {
      fs.rmSync(backupPath, { recursive: true, force: true });
      throw backupError('agent_backup_invalid', 'Backup content did not preserve the approved digest.');
    }
    const metadata = {
      schemaVersion: 1,
      backupId,
      operationId,
      targetId,
      sourcePath,
      sourceKind: source.kind,
      originalDigest,
      backupPath,
      permissionsEvidence: {
        mode: source.entry.mode & 0o777,
        backupMode: 0o600
      },
      redactionState: 'redacted-metadata',
      createdAt: nowIso(clock),
      restoredAt: null,
      retentionState: 'recovery'
    };
    atomicWriteJson(metadataPath, metadata);
    return freezeMetadata(metadata);
  }

  function read(backupId) {
    const match = findBackupMetadata(requireId(backupId, 'backupId', 'backup_'));
    return match ? freezeMetadata(match.metadata) : null;
  }

  function restore(backupId, input = {}) {
    const match = requireBackup(backupId);
    const metadata = match.metadata;
    const targetId = requireText(input.targetId, 'targetId');
    const targetPath = path.resolve(requireText(input.targetPath, 'targetPath'));
    if (targetId !== metadata.targetId || targetPath !== path.resolve(metadata.sourcePath)) {
      throw backupError(
        'agent_backup_target_mismatch',
        'Backup target does not match its recorded ownership boundary.'
      );
    }
    const expectedCurrentDigest = requireDigest(
      input.expectedCurrentDigest,
      'expectedCurrentDigest'
    );
    const targetKind = sourceKindAt(targetPath);
    if (!targetKind || digestSource(targetPath, targetKind) !== expectedCurrentDigest) {
      throw backupError(
        'agent_backup_precondition_changed',
        'Restore target changed after the approved recovery plan.'
      );
    }
    const sourceKind = metadata.sourceKind ?? 'file';
    if (!fs.existsSync(metadata.backupPath)
      || sourceKindAt(metadata.backupPath) !== sourceKind
      || digestSource(metadata.backupPath, sourceKind, path.basename(metadata.sourcePath))
        !== metadata.originalDigest) {
      throw backupError('agent_backup_invalid', 'Backup content is missing or corrupt.');
    }

    if (sourceKind === 'directory') {
      atomicReplaceDirectory(metadata.backupPath, targetPath, metadata.permissionsEvidence.mode);
    } else {
      atomicCopyFile(metadata.backupPath, targetPath, metadata.permissionsEvidence.mode);
    }
    const restoredAt = nowIso(clock);
    atomicWriteJson(match.metadataPath, { ...metadata, restoredAt });
    return Object.freeze({
      restored: true,
      backupId: metadata.backupId,
      targetId,
      targetPath,
      restoredDigest: metadata.originalDigest,
      restoredAt
    });
  }

  function assessRetention(backupId, evidence = {}) {
    requireBackup(backupId);
    if (
      evidence.referencedByRecovery === true
      || OPEN_RECOVERY_STATES.has(evidence.transactionState)
    ) {
      return Object.freeze({
        decision: 'retained',
        reason: 'recovery-reference'
      });
    }
    return Object.freeze({
      decision: 'retained',
      reason: 'collection-not-authorized'
    });
  }

  function requireBackup(backupId) {
    const match = findBackupMetadata(requireId(backupId, 'backupId', 'backup_'));
    if (!match) throw backupError('agent_backup_not_found', `Backup '${backupId}' was not found.`);
    return match;
  }

  function findBackupMetadata(backupId) {
    if (!fs.existsSync(paths.backupsDir)) return null;
    for (const operationEntry of fs.readdirSync(paths.backupsDir, { withFileTypes: true })) {
      if (!operationEntry.isDirectory()) continue;
      const metadataPath = path.join(
        paths.backupsDir,
        operationEntry.name,
        backupId,
        'metadata.json'
      );
      if (!fs.existsSync(metadataPath)) continue;
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      validateMetadata(metadata, metadataPath);
      return { metadata, metadataPath };
    }
    return null;
  }
}

function validateMetadata(metadata, metadataPath) {
  if (
    metadata?.schemaVersion !== 1
    || !ID_PATTERN.test(metadata.backupId ?? '')
    || !ID_PATTERN.test(metadata.operationId ?? '')
    || !DIGEST_PATTERN.test(metadata.originalDigest ?? '')
    || typeof metadata.targetId !== 'string'
    || typeof metadata.sourcePath !== 'string'
    || typeof metadata.backupPath !== 'string'
    || (metadata.sourceKind !== undefined && !['file', 'directory'].includes(metadata.sourceKind))
    || !metadata.permissionsEvidence
    || metadata.redactionState !== 'redacted-metadata'
  ) {
    throw backupError('agent_backup_invalid', `Backup metadata is invalid: ${metadataPath}`);
  }
}

function freezeMetadata(metadata) {
  return deepFreeze(structuredClone(metadata));
}

function requireBackupSource(filePath) {
  let entry;
  try {
    entry = fs.lstatSync(filePath);
  } catch {
    throw backupError('agent_backup_source_missing', `Backup source is missing: ${filePath}`);
  }
  if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
    throw backupError('agent_backup_source_invalid', 'Backup source must be a regular file or directory.');
  }
  if (entry.isDirectory()) {
    // Traverse now so an unsupported entry is rejected before any backup path is created.
    digestDirectory(filePath);
  }
  return { entry, kind: entry.isDirectory() ? 'directory' : 'file' };
}

function atomicCopyFile(sourcePath, targetPath, mode) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.copyFileSync(sourcePath, tempPath);
    try {
      fs.chmodSync(tempPath, mode);
    } catch (error) {
      if (!['ENOSYS', 'EPERM', 'EACCES'].includes(error?.code)) throw error;
    }
    fs.renameSync(tempPath, targetPath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function atomicCopyDirectory(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    copyDirectoryTree(sourcePath, tempPath);
    fs.renameSync(tempPath, targetPath);
  } finally {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
}

function atomicReplaceDirectory(sourcePath, targetPath, mode) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const nonce = `${process.pid}.${crypto.randomBytes(8).toString('hex')}`;
  const tempPath = `${targetPath}.${nonce}.tmp`;
  const displacedPath = `${targetPath}.${nonce}.displaced`;
  let displaced = false;
  try {
    copyDirectoryTree(sourcePath, tempPath);
    try {
      fs.chmodSync(tempPath, mode);
    } catch (error) {
      if (!['ENOSYS', 'EPERM', 'EACCES'].includes(error?.code)) throw error;
    }
    if (fs.existsSync(targetPath)) {
      fs.renameSync(targetPath, displacedPath);
      displaced = true;
    }
    try {
      fs.renameSync(tempPath, targetPath);
    } catch (error) {
      if (displaced && !fs.existsSync(targetPath)) {
        fs.renameSync(displacedPath, targetPath);
        displaced = false;
      }
      throw error;
    }
    fs.rmSync(displacedPath, { recursive: true, force: true });
    displaced = false;
  } finally {
    fs.rmSync(tempPath, { recursive: true, force: true });
    if (displaced && !fs.existsSync(targetPath) && fs.existsSync(displacedPath)) {
      fs.renameSync(displacedPath, targetPath);
      displaced = false;
    }
    if (!displaced) fs.rmSync(displacedPath, { recursive: true, force: true });
  }
}

function copyDirectoryTree(sourceRoot, targetRoot, relativeDir = '', depth = 0, totals = { files: 0, bytes: 0 }) {
  if (depth > MAX_DIRECTORY_DEPTH) {
    throw backupError('agent_backup_source_invalid', 'Backup directory exceeds the supported maximum depth.');
  }
  const sourceDir = path.join(sourceRoot, relativeDir);
  const targetDir = path.join(targetRoot, relativeDir);
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw backupError('agent_backup_source_invalid', 'Backup directory cannot contain symbolic links.');
    }
    if (entry.isDirectory()) {
      copyDirectoryTree(sourceRoot, targetRoot, relativePath, depth + 1, totals);
      continue;
    }
    if (!entry.isFile()) {
      throw backupError('agent_backup_source_invalid', 'Backup directory contains an unsupported entry.');
    }
    const bytes = fs.readFileSync(sourcePath);
    totals.files += 1;
    totals.bytes += bytes.length;
    assertDirectoryLimits(totals);
    fs.writeFileSync(targetPath, bytes, { mode: 0o600 });
  }
}

function digestFile(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function digestSource(sourcePath, sourceKind, identityName = path.basename(sourcePath)) {
  return sourceKind === 'directory' ? digestDirectory(sourcePath, identityName) : digestFile(sourcePath);
}

function digestDirectory(root, identityName = path.basename(root)) {
  const files = [];
  const seen = new Set();
  const totals = { files: 0, bytes: 0 };
  collectDirectoryFiles(root, '', files, seen, totals, 0);
  files.sort((left, right) => compareStrings(left.path, right.path));
  return digestCanonical({
    schemaVersion: DIRECTORY_MANIFEST_SCHEMA_VERSION,
    skillName: identityName,
    files
  });
}

function collectDirectoryFiles(root, relativeDir, files, seen, totals, depth) {
  if (depth > MAX_DIRECTORY_DEPTH) {
    throw backupError('agent_backup_source_invalid', 'Backup directory exceeds the supported maximum depth.');
  }
  const directory = path.join(root, relativeDir);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw backupError('agent_backup_source_invalid', 'Backup directory cannot contain symbolic links.');
    }
    if (entry.isDirectory()) {
      collectDirectoryFiles(root, relativePath, files, seen, totals, depth + 1);
      continue;
    }
    if (!entry.isFile()) {
      throw backupError('agent_backup_source_invalid', 'Backup directory contains an unsupported entry.');
    }
    const canonicalPath = canonicalDirectoryPath(relativePath);
    const collisionKey = process.platform === 'win32'
      ? canonicalPath.toLowerCase()
      : canonicalPath;
    if (seen.has(collisionKey)) {
      throw backupError('agent_backup_source_invalid', 'Backup directory contains duplicate canonical paths.');
    }
    seen.add(collisionKey);
    const bytes = fs.readFileSync(absolutePath);
    totals.files += 1;
    totals.bytes += bytes.length;
    assertDirectoryLimits(totals);
    files.push({
      path: canonicalPath,
      bytes: bytes.length,
      sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
    });
  }
}

function assertDirectoryLimits(totals) {
  if (totals.files > MAX_DIRECTORY_FILES) {
    throw backupError('agent_backup_source_invalid', 'Backup directory exceeds the supported maximum file count.');
  }
  if (totals.bytes > MAX_DIRECTORY_TOTAL_BYTES) {
    throw backupError('agent_backup_source_invalid', 'Backup directory exceeds the supported maximum size.');
  }
}

function canonicalDirectoryPath(relativePath) {
  const normalized = path.normalize(relativePath).replaceAll('\\', '/');
  if (normalized.startsWith('../') || normalized === '..' || normalized.includes('/../')) {
    throw backupError('agent_backup_source_invalid', 'Backup directory contains a traversal path.');
  }
  return normalized;
}

function digestCanonical(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonicalJson(value))).digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function sourceKindAt(targetPath) {
  if (!fs.existsSync(targetPath)) return null;
  const entry = fs.lstatSync(targetPath);
  if (entry.isSymbolicLink()) return null;
  if (entry.isDirectory()) return 'directory';
  if (entry.isFile()) return 'file';
  return null;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireId(value, label, prefix) {
  const id = String(value ?? '');
  if (!ID_PATTERN.test(id) || !id.startsWith(prefix)) {
    throw backupError('agent_backup_invalid', `${label} is invalid.`);
  }
  return id;
}

function requireDigest(value, label) {
  const digest = String(value ?? '');
  if (!DIGEST_PATTERN.test(digest)) {
    throw backupError('agent_backup_invalid', `${label} is invalid.`);
  }
  return digest;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw backupError('agent_backup_invalid', `${label} is required.`);
  return text;
}

function nowIso(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw backupError('agent_backup_invalid', 'Backup clock is invalid.');
  }
  return date.toISOString();
}

function backupError(code, message) {
  return new AgentInstallerError(code, message, {
    effectCertainty: 'none'
  });
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
