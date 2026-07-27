import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { redactInstallerValue } from './result.js';
import { digestCanonical } from './digests.js';
import { launcherPaths } from './artifacts/launcher.js';
import { resolveInstallationScopeReference } from './state/scope-resolver.js';

const EMPTY_CONTENT_DIGEST = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const EMPTY_RUNTIME_DIGEST = `sha256:${'0'.repeat(64)}`;

export function createAgentDiagnostics(options = {}) {
  const receiptStore = options.receiptStore;
  const registry = options.registry;
  const env = options.env ?? process.env;

  return Object.freeze({
    async observe(input = {}) {
      const receipt = await readCurrentReceipt(receiptStore, input, env);
      const targets = receipt
        ? await inspectReceiptTargets(registry, receipt.targets ?? [], input, env)
        : [];
      const health = targets.map(healthForTarget);
      const unhealthy = health.some((item) => item.severity === 'error');
      const intentionallyAbsent = targets.length > 0
        && targets.every((target) => target.state === 'absent');
      const result = {
        outcome: 'succeeded',
        effectCertainty: 'complete',
        scope: normalizedScope(input),
        projectIdentity: input.scope === 'user' ? null : (input.projectRoot ?? input.projectIdentity ?? null),
        buildIdentity: receipt?.buildIdentity
          ?? input.buildIdentity
          ?? digestCanonical({ state: 'not-installed', scope: normalizedScope(input) }),
        operationId: null,
        planDigest: receipt?.receiptDigest
          ?? input.planDigest
          ?? digestCanonical({ operation: input.operation ?? 'status', state: 'not-installed' }),
        receiptId: receipt?.receiptId ?? null,
        targets,
        health,
        effects: [],
        nextActions: receipt
          ? (intentionallyAbsent
              ? [{ command: 'launchdeck agent setup' }]
              : unhealthy
                ? [{ command: 'launchdeck agent repair' }]
                : [])
          : [{ command: 'launchdeck agent setup' }],
        error: null
      };
      return redactInstallerValue(result);
    }
  });
}

async function inspectReceiptTargets(registry, targets, input, env) {
  return Promise.all(targets.map(async (receiptTarget) => {
    const normalizedTarget = normalizeReceiptTarget(receiptTarget);
    if (normalizedTarget.hostId === 'launchdeck' && normalizedTarget.component === 'runtime') {
      return inspectRuntimeReceiptTarget(normalizedTarget, env);
    }
    const adapter = adapterFor(registry, normalizedTarget);
    if (!adapter || typeof adapter.inspect !== 'function') {
      return diagnosticTarget(normalizedTarget, null, 'unverifiable');
    }
    try {
      const context = inspectionContext(normalizedTarget, input);
      const observation = typeof adapter.resolveTargets === 'function'
        ? await inspectResolvedReceiptTarget(adapter, normalizedTarget, context)
        : await adapter.inspect(normalizedTarget, context);
      if (!observation || observation.kind === 'refusal') {
        return diagnosticTarget(normalizedTarget, observation, 'unverifiable');
      }
      return diagnosticTarget(normalizedTarget, observation);
    } catch (error) {
      return diagnosticTarget(normalizedTarget, {
        code: error?.code ?? 'agent_target_inspection_failed'
      }, 'unverifiable');
    }
  }));
}

function inspectRuntimeReceiptTarget(receiptTarget, env) {
  const targetPath = launcherPaths(env).root;
  try {
    if (!fs.existsSync(targetPath)) {
      return diagnosticTarget(receiptTarget, {
        path: targetPath,
        exists: false,
        status: 'missing',
        liveDigest: EMPTY_RUNTIME_DIGEST,
        ownership: receiptTarget.desiredDigest === EMPTY_RUNTIME_DIGEST
          ? 'launchdeck'
          : 'unknown'
      });
    }
    const digest = digestRuntimeDirectory(targetPath);
    return diagnosticTarget(receiptTarget, {
      path: targetPath,
      exists: true,
      status: 'present',
      liveDigest: digest,
      ownership: digest === receiptTarget.desiredDigest ? 'launchdeck' : 'unknown'
    });
  } catch (error) {
    return diagnosticTarget(receiptTarget, {
      path: targetPath,
      exists: true,
      code: error?.code ?? 'agent_runtime_inspection_failed'
    }, 'unverifiable');
  }
}

function digestRuntimeDirectory(root) {
  const rootEntry = fs.lstatSync(root);
  if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
    throw new TypeError('Stable launcher is not a regular directory.');
  }
  const files = [];
  collectRuntimeFiles(root, '', files);
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return digestCanonical({
    schemaVersion: 1,
    skillName: path.basename(root),
    files
  });
}

function collectRuntimeFiles(root, relativeDir, files) {
  const directory = path.join(root, relativeDir);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new TypeError('Stable launcher contains a symbolic link.');
    if (entry.isDirectory()) {
      collectRuntimeFiles(root, relativePath, files);
      continue;
    }
    if (!entry.isFile()) throw new TypeError('Stable launcher contains an unsupported entry.');
    const bytes = fs.readFileSync(absolutePath);
    files.push({
      path: relativePath.replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
    });
  }
}

async function inspectResolvedReceiptTarget(adapter, receiptTarget, context) {
  const components = [receiptTarget.component].filter(Boolean);
  const hostEvidence = typeof adapter.detect === 'function'
    ? await adapter.detect(context)
    : [];
  const resolved = await adapter.resolveTargets({
    ...context,
    components,
    hostEvidence,
    evidence: hostEvidence
  });
  if (!Array.isArray(resolved)) return resolved;
  const target = resolved.find((candidate) =>
    candidate.targetId === receiptTarget.targetId
    && candidate.scope === receiptTarget.scope
    && candidate.component === receiptTarget.component
    && (!receiptTarget.path || samePath(candidate.path, receiptTarget.path))
  );
  if (!target || target.ownershipBoundary !== receiptTarget.ownershipBoundary) return null;
  const observation = await adapter.inspect(target, context);
  if (!observation || observation.kind === 'refusal') return observation;
  const liveDigest = digestFromObservation(observation);
  const ownership = liveOwnership(observation);
  const receiptProvesOwnership = liveDigest === receiptTarget.desiredDigest
    && (observation.ownershipBoundary ?? target.ownershipBoundary)
      === receiptTarget.ownershipBoundary;
  return {
    ...target,
    ...observation,
    ownership: ownership === 'unknown' && receiptProvesOwnership
      ? 'launchdeck'
      : ownership
  };
}

function inspectionContext(receiptTarget, input) {
  return {
    scope: receiptTarget.scope ?? input.scope,
    scopeIdentity: input.scopeIdentity,
    projectRoot: input.projectRoot ?? input.projectIdentity,
    projectIdentity: input.projectIdentity ?? input.projectRoot,
    homeDir: input.homeDir
  };
}

function diagnosticTarget(receiptTarget, observation, forcedState) {
  const liveDigest = digestFromObservation(observation);
  const exists = observation?.exists
    ?? !['absent', 'missing'].includes(observation?.status);
  const digestMatches = Boolean(
    liveDigest
    && receiptTarget.desiredDigest
    && liveDigest === receiptTarget.desiredDigest
  );
  const ownership = liveOwnership(observation);
  const state = forcedState
    ?? (exists === false
      ? (digestMatches && ownership === 'launchdeck' ? 'absent' : 'missing')
      : observation?.status === 'malformed'
        ? 'corrupt'
        : digestMatches
          ? (ownership === 'launchdeck' ? 'healthy' : 'divergent')
          : 'divergent');
  return {
    ...receiptTarget,
    path: receiptTarget.path ?? observation?.path ?? observation?.target?.path,
    observedDigest: liveDigest,
    liveDigest,
    exists,
    state,
    ownership,
    inspectionCode: observation?.code ?? null
  };
}

function normalizeReceiptTarget(target = {}) {
  const descriptor = parseTargetId(target.targetId);
  return {
    ...target,
    hostId: target.hostId ?? descriptor?.hostId,
    scope: target.scope ?? descriptor?.scope,
    component: target.component ?? descriptor?.component
  };
}

function parseTargetId(targetId) {
  const match = /^([^:]+):(project|user):([^:]+)$/.exec(String(targetId ?? ''));
  if (!match) return null;
  return {
    hostId: match[1],
    scope: match[2],
    component: match[3]
  };
}

function digestFromObservation(observation) {
  const digest = observation?.liveDigest
    ?? observation?.observedDigest
    ?? observation?.contentDigest
    ?? observation?.digest
    ?? null;
  if (digest) return digest;
  return observation && (
    observation.exists === false
    || ['absent', 'missing'].includes(observation.status)
  )
    ? EMPTY_CONTENT_DIGEST
    : null;
}

function healthForTarget(target) {
  const healthy = ['healthy', 'absent'].includes(target.state)
    && target.ownership === 'launchdeck';
  return {
    targetId: target.targetId,
    state: target.state,
    severity: healthy ? 'info' : 'error',
    ownership: target.ownership
  };
}

function adapterFor(registry, target) {
  const hostId = target?.hostId ?? String(target?.targetId ?? '').split(':')[0];
  if (!hostId) return null;
  if (typeof registry?.adapterFor === 'function') return registry.adapterFor(hostId);
  if (typeof registry?.get === 'function') return registry.get(hostId);
  return null;
}

function liveOwnership(observation) {
  if (observation?.ownership === 'launchdeck' || observation?.ownership === 'verified') {
    return 'launchdeck';
  }
  return observation?.ownership ?? 'unknown';
}

function samePath(left, right) {
  if (!left || !right) return false;
  const normalize = (value) => String(value).replaceAll('\\', '/').toLowerCase();
  return normalize(left) === normalize(right);
}

async function readCurrentReceipt(receiptStore, input, env) {
  if (typeof receiptStore?.readCurrent !== 'function') return null;
  try {
    return await receiptStore.readCurrent(resolveInstallationScopeReference(input, env));
  } catch {
    return null;
  }
}

function normalizedScope(input) {
  return input.scope === 'user' ? 'user' : 'project';
}
