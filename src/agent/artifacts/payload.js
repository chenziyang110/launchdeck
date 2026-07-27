import fs from 'node:fs';
import path from 'node:path';
import { AgentInstallerError } from '../errors.js';

const PAYLOAD_PREFIX = 'package/agent/installer-payload/';
const MANIFEST_PACKAGE_PATH = `${PAYLOAD_PREFIX}manifest.json`;

export function listInstallerPayloadFiles(payloadRoot) {
  const root = requireDirectory(payloadRoot, 'payloadRoot');
  const files = [];
  collectInstallerPayloadFiles(root, root, files);
  files.sort(comparePathEntries);
  return Object.freeze(files);
}

export function expectedInstallerPackageFiles(manifest) {
  const normalizedManifest = requireInstallerPayloadManifest(manifest);
  const files = [
    MANIFEST_PACKAGE_PATH,
    ...normalizedManifest.files.map((entry) => `${PAYLOAD_PREFIX}${normalizePayloadRelativePath(entry.path)}`)
  ].sort(compareStrings);
  return Object.freeze(files);
}

export function validateInstallerPackageInventory({ source, packageFiles, manifest } = {}) {
  if (source !== 'npm-pack-json') {
    throw installerPayloadError(
      'agent_package_inventory_source_invalid',
      'Package inventory must come from npm pack JSON output.',
      { source }
    );
  }
  const normalizedManifest = requireInstallerPayloadManifest(manifest);
  if (!Array.isArray(packageFiles)) {
    throw installerPayloadError(
      'agent_package_inventory_invalid',
      'Package inventory must be provided as an array.'
    );
  }

  const actual = packageFiles.map(normalizePackageInventoryPath);
  const actualSet = new Set(actual);
  const expected = expectedInstallerPackageFiles(normalizedManifest);
  const expectedSet = new Set(expected);

  const missing = expected.filter((entry) => !actualSet.has(entry));
  const forbidden = uniqueSorted(actual.filter(isForbiddenPackagePath));
  const unexpectedPayloadFiles = uniqueSorted(actual.filter((entry) => (
    isPayloadPackagePath(entry)
    && !expectedSet.has(entry)
    && !isForbiddenPackagePath(entry)
  )));

  const result = deepFreeze({
    ok: missing.length === 0 && forbidden.length === 0 && unexpectedPayloadFiles.length === 0,
    missing: Object.freeze(missing),
    forbidden: Object.freeze(forbidden),
    unexpectedPayloadFiles: Object.freeze(unexpectedPayloadFiles)
  });
  return result;
}

function collectInstallerPayloadFiles(root, current, files) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (entry.isSymbolicLink()) {
      throw installerPayloadError(
        'agent_payload_symlink_unsupported',
        'Installer payload cannot contain symbolic links.',
        { path: relative }
      );
    }
    if (entry.isDirectory()) {
      collectInstallerPayloadFiles(root, absolute, files);
      continue;
    }
    if (entry.isFile()) {
      if (relative === 'manifest.json') continue;
      files.push(relative);
    }
  }
}

function requireDirectory(value, label) {
  const resolved = requireText(value, label);
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw installerPayloadError(
      'agent_payload_root_invalid',
      'Installer payload root must be a directory.',
      { [label]: resolved }
    );
  }
  return resolved;
}

function requireInstallerPayloadManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw installerPayloadError(
      'agent_payload_manifest_invalid',
      'Installer payload manifest must be an object.'
    );
  }
  if (!Number.isInteger(value.manifestVersion) || value.manifestVersion !== 1) {
    throw installerPayloadError(
      'agent_payload_manifest_invalid',
      'Installer payload manifest version is invalid.'
    );
  }
  requireDigest(value.buildIdentity, 'buildIdentity');
  requireText(value.packageVersion, 'packageVersion');
  requireText(value.nodeRange, 'nodeRange');
  if (!Array.isArray(value.files)) {
    throw installerPayloadError(
      'agent_payload_manifest_invalid',
      'Installer payload manifest files must be an array.'
    );
  }

  const files = value.files.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw installerPayloadError(
        'agent_payload_manifest_invalid',
        `Manifest file entry ${index} must be an object.`
      );
    }
    return Object.freeze({
      path: normalizePayloadRelativePath(requireText(entry.path, `files[${index}].path`)),
      bytes: requireByteCount(entry.bytes, `files[${index}].bytes`),
      sha256: requireDigest(entry.sha256, `files[${index}].sha256`)
    });
  });

  return Object.freeze({
    manifestVersion: 1,
    buildIdentity: requireDigest(value.buildIdentity, 'buildIdentity'),
    packageVersion: requireText(value.packageVersion, 'packageVersion'),
    nodeRange: requireText(value.nodeRange, 'nodeRange'),
    files: Object.freeze(files)
  });
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw installerPayloadError(
      'agent_payload_manifest_invalid',
      `${label} is required.`
    );
  }
  return normalized;
}

function requireDigest(value, label) {
  const normalized = String(value ?? '').trim();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    throw installerPayloadError(
      'agent_payload_manifest_invalid',
      `${label} must be a sha256 digest.`
    );
  }
  return normalized;
}

function requireByteCount(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw installerPayloadError(
      'agent_payload_manifest_invalid',
      `${label} must be a non-negative integer.`
    );
  }
  return value;
}

function normalizePayloadRelativePath(value) {
  const normalized = String(value ?? '').replaceAll('\\', '/').replace(/^\.\/+/, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw installerPayloadError(
      'agent_payload_manifest_invalid',
      'Manifest file paths must be relative.'
    );
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw installerPayloadError(
      'agent_payload_manifest_invalid',
      'Manifest file paths must not escape the payload root.'
    );
  }
  return normalized;
}

function normalizePackageInventoryPath(value) {
  const normalized = String(value ?? '').replaceAll('\\', '/').replace(/^\.\/+/, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw installerPayloadError(
      'agent_package_inventory_invalid',
      'Package inventory paths must be non-empty.'
    );
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw installerPayloadError(
      'agent_package_inventory_invalid',
      'Package inventory paths must stay within the package root.'
    );
  }
  return normalized;
}

function isPayloadPackagePath(value) {
  return value.startsWith(PAYLOAD_PREFIX);
}

function isForbiddenPackagePath(value) {
  return value === 'package/agent/installer-payload.tgz'
    || (value.startsWith('package/') && value.endsWith('.tgz'))
    || value === 'package/.env'
    || value === 'package/.launchdeck/runtime/state.json'
    || value.startsWith('package/.npm/_cacache/');
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareStrings);
}

function comparePathEntries(left, right) {
  return compareStrings(left, right);
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function installerPayloadError(code, message, details = {}) {
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
