import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyInstallerPayload } from './manifest.js';
import { digestCanonical } from '../digests.js';

const STORE_VERSION = 'v1';
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function artifactPathForBuild(buildIdentity, env = process.env) {
  const normalized = requireBuildIdentity(buildIdentity);
  const homeDir = requireLaunchdeckHome(env);
  return assertInstallerOwnedPath({
    env,
    area: 'artifacts',
    candidate: path.join(
      homeDir,
      'installer',
      'artifacts',
      STORE_VERSION,
      'sha256',
      normalized.slice('sha256:'.length)
    )
  });
}

export function createArtifactStore({ env = process.env, randomId } = {}) {
  const resolvedEnv = normalizeEnv(env);
  const nextId = typeof randomId === 'function'
    ? randomId
    : () => crypto.randomBytes(8).toString('hex');
  const root = requireLaunchdeckHome(resolvedEnv);
  const artifactsRoot = path.join(root, 'installer', 'artifacts', STORE_VERSION, 'sha256');
  const quarantineRoot = path.join(root, 'installer', 'quarantine', STORE_VERSION, 'sha256');

  function install({ operationId, payloadRoot, manifest } = {}) {
    requireText(operationId, 'operationId');
    const verification = verifyInstallerPayload({ payloadRoot, manifest });
    if (!verification.ok) {
      const quarantine = quarantineStagedPayload({
        payloadRoot,
        manifest,
        operationId,
        reason: quarantineReasonForVerification(verification.code),
        verification
      });
      throw artifactIntegrityError('agent_artifact_integrity_failed', {
        operationId,
        buildIdentity: manifest?.buildIdentity ?? null,
        quarantinePath: quarantine.path,
        sourceIntegrityCode: verification.code ?? null,
        mismatches: verification.mismatches
      });
    }

    const artifactPath = artifactPathForBuild(verification.buildIdentity, resolvedEnv);
    const active = inspect(verification.buildIdentity);
    if (active.state === 'verified') {
      const installedManifest = readJson(path.join(artifactPath, 'manifest.json'));
      if (digestCanonical(installedManifest) !== digestCanonical(manifest)) {
        throw artifactIntegrityError('agent_artifact_identity_collision', {
          operationId,
          buildIdentity: verification.buildIdentity,
          artifactPath,
          incomingManifestDigest: digestCanonical(manifest),
          installedManifestDigest: digestCanonical(installedManifest)
        });
      }
      return freezeResult({
        status: 'noop',
        state: 'verified',
        buildIdentity: verification.buildIdentity,
        artifactPath
      });
    }

    if (active.state === 'corrupt') {
      quarantine(verification.buildIdentity, {
        operationId,
        reason: 'verified-path-corruption'
      });
    }

    publishVerifiedPayload({
      artifactPath,
      payloadRoot,
      manifest
    });

    return freezeResult({
      status: 'installed',
      state: 'verified',
      buildIdentity: verification.buildIdentity,
      artifactPath
    });
  }

  function inspect(buildIdentity) {
    const normalized = requireBuildIdentity(buildIdentity);
    const artifactPath = artifactPathForBuild(normalized, resolvedEnv);
    if (!fs.existsSync(artifactPath)) {
      return freezeResult({
        buildIdentity: normalized,
        state: 'absent',
        activationAllowed: false,
        path: artifactPath
      });
    }
    const manifestPath = path.join(artifactPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return freezeResult({
        buildIdentity: normalized,
        state: 'corrupt',
        activationAllowed: false,
        code: 'agent_artifact_digest_mismatch',
        path: artifactPath
      });
    }
    let observedManifest;
    try {
      observedManifest = readJson(manifestPath);
    } catch {
      return freezeResult({
        buildIdentity: normalized,
        state: 'corrupt',
        activationAllowed: false,
        code: 'agent_artifact_digest_mismatch',
        path: artifactPath
      });
    }
    const observed = verifyInstallerPayload({
      payloadRoot: artifactPath,
      manifest: observedManifest
    });
    if (!observed.ok) {
      return freezeResult({
        buildIdentity: normalized,
        state: 'corrupt',
        activationAllowed: false,
        code: 'agent_artifact_digest_mismatch',
        path: artifactPath,
        mismatches: observed.mismatches
      });
    }
    if (observedManifest?.buildIdentity !== normalized) {
      return freezeResult({
        buildIdentity: normalized,
        state: 'corrupt',
        activationAllowed: false,
        code: 'agent_artifact_digest_mismatch',
        path: artifactPath
      });
    }
    return freezeResult({
      buildIdentity: normalized,
      state: 'verified',
      activationAllowed: true,
      path: artifactPath
    });
  }

  function listQuarantine() {
    assertInstallerOwnedPath({
      env: resolvedEnv,
      area: 'quarantine',
      candidate: quarantineRoot
    });
    if (!fs.existsSync(quarantineRoot)) return Object.freeze([]);
    const entries = [];
    for (const buildDir of fs.readdirSync(quarantineRoot, { withFileTypes: true })) {
      if (!buildDir.isDirectory()) continue;
      const buildDirPath = path.join(quarantineRoot, buildDir.name);
      for (const entryDir of fs.readdirSync(buildDirPath, { withFileTypes: true })) {
        if (!entryDir.isDirectory()) continue;
        const candidate = path.join(buildDirPath, entryDir.name);
        const metadataPath = path.join(candidate, 'quarantine.json');
        if (!fs.existsSync(metadataPath)) continue;
        const metadata = readJson(metadataPath);
        entries.push(freezeResult({
          buildIdentity: metadata.buildIdentity,
          operationId: metadata.operationId,
          reason: metadata.reason,
          contentRetained: metadata.contentRetained === true,
          mismatches: Array.isArray(metadata.mismatches)
            ? metadata.mismatches
            : [],
          path: candidate,
          state: 'quarantined',
          activationAllowed: false
        }));
      }
    }
    entries.sort((left, right) => compareStrings(left.path, right.path));
    return Object.freeze(entries);
  }

  function quarantine(buildIdentity, { operationId, reason } = {}) {
    const normalized = requireBuildIdentity(buildIdentity);
    requireText(operationId, 'operationId');
    requireText(reason, 'reason');
    const artifactPath = artifactPathForBuild(normalized, resolvedEnv);
    if (!fs.existsSync(artifactPath)) {
      const existing = listQuarantine().find((entry) => entry.buildIdentity === normalized);
      if (existing) return existing;
      return freezeResult({
        buildIdentity: normalized,
        state: 'absent',
        activationAllowed: false,
        path: artifactPath
      });
    }

    const quarantinePath = uniqueQuarantinePath(quarantineRoot, normalized, operationId);
    assertInstallerOwnedPath({
      env: resolvedEnv,
      area: 'quarantine',
      candidate: quarantinePath
    });
    fs.mkdirSync(path.dirname(quarantinePath), { recursive: true });
    fs.renameSync(artifactPath, quarantinePath);
    writeJson(path.join(quarantinePath, 'quarantine.json'), {
      buildIdentity: normalized,
      operationId,
      reason,
      contentRetained: true,
      retentionFailureCode: null,
      mismatches: []
    });
    return freezeResult({
      buildIdentity: normalized,
      operationId,
      reason,
      contentRetained: true,
      state: 'quarantined',
      activationAllowed: false,
      path: quarantinePath
    });
  }

  function resolveForActivation(buildIdentity) {
    const observation = inspect(buildIdentity);
    return observation.state === 'verified' ? observation.path : null;
  }

  function publishVerifiedPayload({ artifactPath, payloadRoot, manifest }) {
    assertInstallerOwnedPath({
      env: resolvedEnv,
      area: 'artifacts',
      candidate: artifactPath
    });
    const tempPath = uniqueTemporaryPath(artifactsRoot);
    assertInstallerOwnedPath({
      env: resolvedEnv,
      area: 'artifacts',
      candidate: tempPath
    });
    fs.mkdirSync(tempPath, { recursive: true });
    try {
      copyPayloadTree(payloadRoot, tempPath);
      writeJson(path.join(tempPath, 'manifest.json'), manifest);

      const existing = fs.existsSync(artifactPath) ? inspect(manifest.buildIdentity) : null;
      if (existing?.state === 'verified') {
        fs.rmSync(tempPath, { recursive: true, force: true });
        return;
      }
      fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
      if (fs.existsSync(artifactPath)) {
        fs.rmSync(artifactPath, { recursive: true, force: true });
      }
      fs.renameSync(tempPath, artifactPath);
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { recursive: true, force: true });
      }
    }
  }

  function quarantineStagedPayload({
    payloadRoot,
    manifest,
    operationId,
    reason,
    verification
  }) {
    const quarantinePath = uniqueQuarantinePath(quarantineRoot, manifest?.buildIdentity ?? 'sha256:' + '0'.repeat(64), operationId);
    assertInstallerOwnedPath({
      env: resolvedEnv,
      area: 'quarantine',
      candidate: quarantinePath
    });
    let contentRetained = false;
    let retentionFailureCode = null;
    fs.mkdirSync(quarantinePath, { recursive: true });
    if (reason !== 'payload-symlink-unsupported') {
      try {
        copyPayloadTree(payloadRoot, quarantinePath);
        contentRetained = true;
      } catch (error) {
        retentionFailureCode = error?.code ?? 'agent_artifact_integrity_failed';
        fs.rmSync(quarantinePath, { recursive: true, force: true });
        fs.mkdirSync(quarantinePath, { recursive: true });
      }
    }
    if (manifest && contentRetained) {
      writeJson(path.join(quarantinePath, 'manifest.json'), manifest);
    }
    const mismatches = boundedMismatchMetadata(verification?.mismatches);
    writeJson(path.join(quarantinePath, 'quarantine.json'), {
      buildIdentity: manifest?.buildIdentity ?? null,
      operationId,
      reason,
      contentRetained,
      retentionFailureCode,
      mismatches
    });
    return freezeResult({
      buildIdentity: manifest?.buildIdentity ?? null,
      operationId,
      reason,
      contentRetained,
      mismatches,
      state: 'quarantined',
      activationAllowed: false,
      path: quarantinePath
    });
  }

  return Object.freeze({
    install,
    inspect,
    listQuarantine,
    quarantine,
    resolveForActivation
  });
}

export function assertInstallerOwnedPath({
  env = process.env,
  area,
  candidate,
  requireExisting = false
} = {}) {
  const homeDir = requireLaunchdeckHome(env);
  const areaSegments = area === 'artifacts'
    ? ['installer', 'artifacts', STORE_VERSION, 'sha256']
    : area === 'quarantine'
      ? ['installer', 'quarantine', STORE_VERSION, 'sha256']
      : area === 'launcher'
        ? ['installer', 'launcher', STORE_VERSION]
        : null;
  if (!areaSegments) {
    throw artifactIntegrityError('agent_artifact_path_escape', {
      reason: 'installer-area-invalid',
      area
    });
  }
  const areaRoot = path.resolve(homeDir, ...areaSegments);
  const resolvedCandidate = path.resolve(candidate ?? areaRoot);
  if (!isContainedOrEqual(areaRoot, resolvedCandidate)) {
    throw artifactIntegrityError('agent_artifact_path_escape', {
      reason: 'candidate-outside-installer-area',
      area,
      candidate: resolvedCandidate
    });
  }
  assertNoLinkedIntermediates(homeDir, resolvedCandidate);
  if (requireExisting && !fs.existsSync(resolvedCandidate)) {
    throw artifactIntegrityError('agent_artifact_path_escape', {
      reason: 'candidate-missing',
      area,
      candidate: resolvedCandidate
    });
  }
  if (fs.existsSync(homeDir) && fs.existsSync(areaRoot)) {
    const realHome = fs.realpathSync(homeDir);
    const realAreaRoot = fs.realpathSync(areaRoot);
    if (!isContainedOrEqual(realHome, realAreaRoot)) {
      throw artifactIntegrityError('agent_artifact_path_escape', {
        reason: 'installer-area-realpath-escape',
        area
      });
    }
    if (fs.existsSync(resolvedCandidate)) {
      const realCandidate = fs.realpathSync(resolvedCandidate);
      if (!isContainedOrEqual(realAreaRoot, realCandidate)) {
        throw artifactIntegrityError('agent_artifact_path_escape', {
          reason: 'candidate-realpath-escape',
          area,
          candidate: resolvedCandidate
        });
      }
    }
  }
  return resolvedCandidate;
}

function copyPayloadTree(sourceRoot, targetRoot) {
  const stat = fs.lstatSync(sourceRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw artifactIntegrityError('agent_artifact_integrity_failed', {
      reason: 'payload-root-not-directory'
    });
  }
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const source = path.join(sourceRoot, entry.name);
    const target = path.join(targetRoot, entry.name);
    if (entry.isSymbolicLink()) {
      throw artifactIntegrityError('agent_artifact_integrity_failed', {
        reason: 'symbolic-link-unsupported',
        path: source
      });
    }
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyPayloadTree(source, target);
      continue;
    }
    if (entry.isFile()) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      try {
        const mode = fs.statSync(source).mode & 0o777;
        fs.chmodSync(target, mode);
      } catch {
        // Permission preservation is best-effort on platforms that do not expose it.
      }
    }
  }
}

function uniqueTemporaryPath(root) {
  for (;;) {
    const candidate = path.join(root, `.tmp-${crypto.randomBytes(8).toString('hex')}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}

function uniqueQuarantinePath(quarantineRoot, buildIdentity, operationId) {
  const hex = buildIdentity.slice('sha256:'.length);
  const safeOperation = operationId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const suffix = crypto.randomBytes(4).toString('hex');
  return path.join(quarantineRoot, hex, `${safeOperation}-${suffix}`);
}

function requireLaunchdeckHome(env) {
  const homeDir = String(env?.LAUNCHDECK_HOME ?? '').trim();
  if (!homeDir) {
    throw artifactIntegrityError('agent_launchdeck_home_missing', {
      reason: 'LAUNCHDECK_HOME is required.'
    });
  }
  return path.resolve(homeDir);
}

function normalizeEnv(env) {
  return env && typeof env === 'object' ? env : process.env;
}

function requireBuildIdentity(value) {
  const normalized = String(value ?? '').trim();
  if (!DIGEST_PATTERN.test(normalized)) {
    throw artifactIntegrityError('agent_build_identity_invalid', {
      buildIdentity: normalized
    });
  }
  return normalized;
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw artifactIntegrityError('agent_artifact_integrity_failed', {
      [label]: normalized
    });
  }
  return normalized;
}

function artifactIntegrityError(code, details = {}) {
  const error = new Error(code === 'agent_build_identity_invalid'
    ? 'Build identity is invalid.'
    : 'Artifact integrity failed.');
  error.name = 'AgentArtifactStoreError';
  error.code = code;
  error.details = details;
  return error;
}

function quarantineReasonForVerification(code) {
  return code === 'agent_payload_symlink_unsupported'
    ? 'payload-symlink-unsupported'
    : 'payload-digest-mismatch';
}

function boundedMismatchMetadata(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.slice(0, 100).map((entry) => Object.freeze({
    path: typeof entry?.path === 'string' ? entry.path : '',
    reason: typeof entry?.reason === 'string' ? entry.reason : 'unknown'
  })));
}

function assertNoLinkedIntermediates(homeDir, candidate) {
  const relative = path.relative(path.resolve(homeDir), path.resolve(candidate));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw artifactIntegrityError('agent_artifact_path_escape', {
      reason: 'candidate-outside-launchdeck-home',
      candidate
    });
  }
  let current = path.resolve(homeDir);
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw artifactIntegrityError('agent_artifact_path_escape', {
        reason: stat.isSymbolicLink()
          ? 'linked-installer-intermediate'
          : 'non-directory-installer-intermediate',
        candidate: current
      });
    }
  }
}

function isContainedOrEqual(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === ''
    || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function freezeResult(value) {
  return Object.freeze(value);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
