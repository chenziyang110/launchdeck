import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { digestCanonical } from '../digests.js';
import { AgentInstallerError } from '../errors.js';
import { listInstallerPayloadFiles } from './payload.js';

const MANIFEST_VERSION = 1;

export function createInstallerPayloadManifest({ payloadRoot, compatibilityManifest } = {}) {
  const root = requireDirectory(payloadRoot, 'payloadRoot');
  const compatibility = requireCompatibilityManifest(compatibilityManifest);
  const files = listInstallerPayloadFiles(root).map((relativePath) => {
    const absolute = path.join(root, ...relativePath.split('/'));
    const bytes = fs.readFileSync(absolute);
    return Object.freeze({
      path: relativePath,
      bytes: bytes.length,
      sha256: sha256(bytes)
    });
  });

  return deepFreeze({
    manifestVersion: MANIFEST_VERSION,
    buildIdentity: compatibility.buildIdentity,
    packageVersion: compatibility.packageVersion,
    nodeRange: compatibility.nodeRange,
    files: Object.freeze(files)
  });
}

export function verifyInstallerPayload({ payloadRoot, manifest } = {}) {
  const root = requireDirectory(payloadRoot, 'payloadRoot');
  const normalizedManifest = requireInstallerPayloadManifest(manifest);
  let actualFiles;
  try {
    actualFiles = listInstallerPayloadFiles(root).map((relativePath) => {
      const absolute = path.join(root, ...relativePath.split('/'));
      const bytes = fs.readFileSync(absolute);
      return Object.freeze({
        path: relativePath,
        bytes: bytes.length,
        sha256: sha256(bytes)
      });
    });
  } catch (error) {
    return failureFromError(error, normalizedManifest.buildIdentity);
  }

  const expectedByPath = new Map(normalizedManifest.files.map((entry) => [entry.path, entry]));
  const actualByPath = new Map(actualFiles.map((entry) => [entry.path, entry]));
  const mismatches = [];

  for (const expected of normalizedManifest.files) {
    const observed = actualByPath.get(expected.path);
    if (!observed) {
      mismatches.push(Object.freeze({
        path: expected.path,
        reason: 'missing',
        expectedSha256: expected.sha256,
        expectedBytes: expected.bytes
      }));
      continue;
    }
    if (observed.sha256 !== expected.sha256 || observed.bytes !== expected.bytes) {
      mismatches.push(Object.freeze({
        path: expected.path,
        reason: 'digest-mismatch',
        expectedSha256: expected.sha256,
        actualSha256: observed.sha256,
        expectedBytes: expected.bytes,
        actualBytes: observed.bytes
      }));
    }
  }

  for (const actual of actualFiles) {
    if (!expectedByPath.has(actual.path)) {
      mismatches.push(Object.freeze({
        path: actual.path,
        reason: 'undeclared',
        actualSha256: actual.sha256,
        actualBytes: actual.bytes
      }));
    }
  }

  const manifestPath = path.join(root, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const observed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (digestCanonical(observed) !== digestCanonical(normalizedManifest)) {
        mismatches.push(Object.freeze({
          path: 'manifest.json',
          reason: 'manifest-mismatch'
        }));
      }
    } catch {
      mismatches.push(Object.freeze({
        path: 'manifest.json',
        reason: 'manifest-invalid'
      }));
    }
  }

  if (mismatches.length > 0) {
    const code = mismatches.some((entry) => entry.reason === 'symlink-unsupported')
      ? 'agent_payload_symlink_unsupported'
      : 'agent_payload_digest_mismatch';
    return deepFreeze({
      ok: false,
      code,
      buildIdentity: normalizedManifest.buildIdentity,
      fileCount: actualFiles.length,
      mismatches: Object.freeze(sortMismatches(mismatches))
    });
  }

  return deepFreeze({
    ok: true,
    buildIdentity: normalizedManifest.buildIdentity,
    fileCount: normalizedManifest.files.length,
    mismatches: Object.freeze([])
  });
}

function requireDirectory(value, label) {
  const resolved = requireText(value, label);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw payloadError(
      'agent_payload_root_invalid',
      'Installer payload root must be a directory.',
      { [label]: resolved }
    );
  }
  return resolved;
}

function requireCompatibilityManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw payloadError(
      'agent_compatibility_manifest_invalid',
      'Compatibility manifest must be an object.'
    );
  }
  return {
    buildIdentity: requireDigest(value.buildIdentity, 'buildIdentity'),
    packageVersion: requireText(value.packageVersion, 'packageVersion'),
    nodeRange: requireText(value.nodeRange, 'nodeRange')
  };
}

function requireInstallerPayloadManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw payloadError(
      'agent_payload_manifest_invalid',
      'Installer payload manifest must be an object.'
    );
  }
  if (value.manifestVersion !== MANIFEST_VERSION) {
    throw payloadError(
      'agent_payload_manifest_invalid',
      'Installer payload manifest version is invalid.'
    );
  }
  const files = Array.isArray(value.files) ? value.files.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw payloadError(
        'agent_payload_manifest_invalid',
        `Manifest file entry ${index} must be an object.`
      );
    }
    return Object.freeze({
      path: requirePayloadRelativePath(entry.path, `files[${index}].path`),
      bytes: requireByteCount(entry.bytes, `files[${index}].bytes`),
      sha256: requireDigest(entry.sha256, `files[${index}].sha256`)
    });
  }) : null;
  if (!files) {
    throw payloadError(
      'agent_payload_manifest_invalid',
      'Installer payload manifest files must be an array.'
    );
  }
  return Object.freeze({
    manifestVersion: MANIFEST_VERSION,
    buildIdentity: requireDigest(value.buildIdentity, 'buildIdentity'),
    packageVersion: requireText(value.packageVersion, 'packageVersion'),
    nodeRange: requireText(value.nodeRange, 'nodeRange'),
    files: Object.freeze(files)
  });
}

function requirePayloadRelativePath(value, label) {
  const normalized = String(value ?? '').replaceAll('\\', '/').replace(/^\.\/+/, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw payloadError('agent_payload_manifest_invalid', `${label} must be relative.`);
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw payloadError(
      'agent_payload_manifest_invalid',
      `${label} must not escape the payload root.`
    );
  }
  return normalized;
}

function requireDigest(value, label) {
  const normalized = String(value ?? '').trim();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    throw payloadError('agent_payload_manifest_invalid', `${label} must be a sha256 digest.`);
  }
  return normalized;
}

function requireByteCount(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw payloadError('agent_payload_manifest_invalid', `${label} must be a non-negative integer.`);
  }
  return value;
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw payloadError('agent_payload_manifest_invalid', `${label} is required.`);
  }
  return normalized;
}

function sortMismatches(entries) {
  return [...entries].sort((left, right) => {
    if (left.path < right.path) return -1;
    if (left.path > right.path) return 1;
    if (left.reason < right.reason) return -1;
    if (left.reason > right.reason) return 1;
    return 0;
  });
}

function failureFromError(error, buildIdentity) {
  return deepFreeze({
    ok: false,
    code: error?.code === 'agent_payload_symlink_unsupported'
      ? 'agent_payload_symlink_unsupported'
      : 'agent_payload_digest_mismatch',
    buildIdentity,
    fileCount: 0,
    mismatches: Object.freeze([Object.freeze({
      path: error?.details?.path ?? '',
      reason: error?.code === 'agent_payload_symlink_unsupported'
        ? 'symlink-unsupported'
        : 'read-failed'
    })])
  });
}

function payloadError(code, message, details = {}) {
  return new AgentInstallerError(code, message, {
    effectCertainty: 'none',
    details
  });
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
