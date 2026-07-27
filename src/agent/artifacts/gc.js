import fs from 'node:fs';
import path from 'node:path';
import { withLock } from '../../control-plane/locks.js';
import { AgentInstallerError } from '../errors.js';
import {
  artifactPathForBuild,
  assertInstallerOwnedPath
} from './store.js';
import { collectArtifactPins } from './references.js';

const BUILD_IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const DEFAULT_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_DELETES = 10;
const MAX_DELETES_LIMIT = 100;

export function planArtifactGarbageCollection({
  builds = [],
  pins = [],
  now = new Date(),
  gracePeriodMs = DEFAULT_GRACE_PERIOD_MS
} = {}) {
  const observedAt = requireDate(now, 'now');
  const grace = requireDuration(gracePeriodMs, 'gracePeriodMs');
  const pinByBuild = normalizePins(pins);
  const normalizedBuilds = normalizeBuilds(builds);

  return Object.freeze(normalizedBuilds.map((build) => {
    const pin = pinByBuild.get(build.buildIdentity);
    const referenceCount = pin?.referenceCount ?? pin?.reasons.length ?? 0;
    const recoveryReferenceCount = pin?.recoveryReferenceCount
      ?? pin?.recoveryReasons?.length
      ?? 0;
    const base = {
      buildIdentity: build.buildIdentity,
      path: build.path,
      referenceCount,
      recoveryReferenceCount,
      verified: build.verified,
      ownershipVerified: build.ownershipVerified,
      unreferencedSince: build.unreferencedSince,
      eligibleAfter: build.unreferencedSince
        ? new Date(Date.parse(build.unreferencedSince) + grace).toISOString()
        : null
    };

    if (referenceCount > 0) {
      return decision(base, 'pinned', [
        ...(pin?.reasons ?? []),
        'artifact-has-live-or-recovery-reference'
      ]);
    }
    if (build.state === 'corrupt' || build.state === 'quarantined') {
      return decision(base, 'quarantined', [
        `artifact-state:${build.state}`,
        'quarantine-is-not-standard-gc-eligible'
      ]);
    }
    if (!build.verified || build.state !== 'verified') {
      return decision(base, 'retained', ['artifact-is-not-verified']);
    }
    if (!build.ownershipVerified) {
      return decision(base, 'retained', ['artifact-ownership-not-verified']);
    }
    if (!build.unreferencedSince) {
      return decision(base, 'retained', ['unreferenced-age-is-unknown']);
    }
    if (Date.parse(base.eligibleAfter) > observedAt.getTime()) {
      return decision(base, 'retained', ['unreferenced-grace-period-active']);
    }
    return decision(base, 'eligible', [
      'verified-launchdeck-owned',
      'zero-references',
      'unreferenced-grace-period-complete'
    ]);
  }));
}

export async function collectArtifactGarbage({
  env = process.env,
  now = new Date(),
  gracePeriodMs = DEFAULT_GRACE_PERIOD_MS,
  maxDeletes = DEFAULT_MAX_DELETES,
  dryRun = false,
  listBuilds,
  listReferenceRecords,
  lockRunner = withLock,
  removeBuild
} = {}) {
  if (typeof listBuilds !== 'function' || typeof listReferenceRecords !== 'function') {
    throw gcError(
      'agent_artifact_gc_invalid',
      'GC requires build and reference providers.'
    );
  }
  if (typeof lockRunner !== 'function') {
    throw gcError('agent_artifact_gc_invalid', 'GC lock runner is required.');
  }
  if (removeBuild !== undefined && typeof removeBuild !== 'function') {
    throw gcError('agent_artifact_gc_invalid', 'GC removeBuild must be a function.');
  }
  const observedAt = requireDate(now, 'now');
  const grace = requireDuration(gracePeriodMs, 'gracePeriodMs');
  const deletionLimit = requireDeletionLimit(maxDeletes);

  return lockRunner({
    lockName: 'agent-artifact-store',
    env,
    ownerCommand: 'launchdeck agent artifact-gc'
  }, async () => {
    const initial = await observePlan({
      listBuilds,
      listReferenceRecords,
      now: observedAt,
      gracePeriodMs: grace
    });
    const decisions = new Map(
      initial.map((entry) => [entry.buildIdentity, entry])
    );
    const deleted = [];

    if (!dryRun && deletionLimit > 0) {
      const candidates = initial
        .filter((entry) => entry.decision === 'eligible')
        .sort((left, right) => compareStrings(left.buildIdentity, right.buildIdentity));
      for (const candidate of candidates) {
        if (deleted.length >= deletionLimit) break;
        const fresh = await observePlan({
          listBuilds,
          listReferenceRecords,
          now: observedAt,
          gracePeriodMs: grace
        });
        const freshCandidate = fresh.find(
          (entry) => entry.buildIdentity === candidate.buildIdentity
        );
        if (!freshCandidate) {
          decisions.set(candidate.buildIdentity, decision({
            ...candidate,
            referenceCount: 0,
            recoveryReferenceCount: 0
          }, 'retained', ['candidate-disappeared-before-deletion']));
          continue;
        }
        decisions.set(candidate.buildIdentity, freshCandidate);
        if (freshCandidate.decision !== 'eligible') continue;

        assertExactOwnedBuildPath(freshCandidate, env);
        if (removeBuild) {
          await removeBuild(freshCandidate);
        } else {
          removeExactBuildDirectory(freshCandidate, env);
        }
        deleted.push(deepFreeze({
          buildIdentity: freshCandidate.buildIdentity,
          path: freshCandidate.path,
          deletedAt: observedAt.toISOString()
        }));
      }
    }

    return deepFreeze({
      dryRun: dryRun === true,
      observedAt: observedAt.toISOString(),
      gracePeriodMs: grace,
      maxDeletes: deletionLimit,
      decisions: Object.freeze(
        [...decisions.values()].sort(
          (left, right) => compareStrings(left.buildIdentity, right.buildIdentity)
        )
      ),
      deleted: Object.freeze(deleted)
    });
  });
}

async function observePlan({
  listBuilds,
  listReferenceRecords,
  now,
  gracePeriodMs
}) {
  const builds = await listBuilds();
  const records = await listReferenceRecords();
  const pins = collectArtifactPins(records ?? {});
  return planArtifactGarbageCollection({
    builds,
    pins,
    now,
    gracePeriodMs
  });
}

function decision(base, value, evidence) {
  return deepFreeze({
    ...base,
    decision: value,
    decisionEvidence: Object.freeze([...new Set(evidence)].sort(compareStrings))
  });
}

function normalizePins(pins) {
  if (!Array.isArray(pins)) {
    throw gcError('agent_artifact_gc_invalid', 'GC pins must be an array.');
  }
  const byBuild = new Map();
  for (const pin of pins) {
    const buildIdentity = requireBuildIdentity(pin?.buildIdentity);
    const reasons = normalizeStringArray(pin?.reasons ?? [], 'pin reasons');
    const recoveryReasons = normalizeStringArray(
      pin?.recoveryReasons ?? [],
      'pin recovery reasons'
    );
    byBuild.set(buildIdentity, {
      referenceCount: Number.isInteger(pin?.referenceCount)
        ? pin.referenceCount
        : reasons.length,
      recoveryReferenceCount: Number.isInteger(pin?.recoveryReferenceCount)
        ? pin.recoveryReferenceCount
        : recoveryReasons.length,
      reasons,
      recoveryReasons
    });
  }
  return byBuild;
}

function normalizeBuilds(builds) {
  if (!Array.isArray(builds)) {
    throw gcError('agent_artifact_gc_invalid', 'GC builds must be an array.');
  }
  const seen = new Set();
  const normalized = builds.map((build) => {
    if (!build || typeof build !== 'object' || Array.isArray(build)) {
      throw gcError('agent_artifact_gc_invalid', 'GC build observation is invalid.');
    }
    const buildIdentity = requireBuildIdentity(build.buildIdentity);
    if (seen.has(buildIdentity)) {
      throw gcError(
        'agent_artifact_gc_invalid',
        'GC build observations contain a duplicate identity.',
        { buildIdentity }
      );
    }
    seen.add(buildIdentity);
    return {
      buildIdentity,
      path: path.resolve(requireText(build.path, 'build.path')),
      state: requireText(build.state, 'build.state'),
      verified: build.verified === true,
      ownershipVerified: build.ownershipVerified === true,
      unreferencedSince: build.unreferencedSince === null
        || build.unreferencedSince === undefined
        ? null
        : requireDate(build.unreferencedSince, 'build.unreferencedSince').toISOString()
    };
  });
  return normalized.sort(
    (left, right) => compareStrings(left.buildIdentity, right.buildIdentity)
  );
}

function assertExactOwnedBuildPath(candidate, env) {
  const expected = path.resolve(artifactPathForBuild(candidate.buildIdentity, env));
  if (
    path.resolve(candidate.path) !== expected
    || candidate.verified !== true
    || candidate.ownershipVerified !== true
  ) {
    throw gcError(
      'agent_artifact_gc_path_invalid',
      'GC candidate is not the exact verified Launchdeck-owned build directory.',
      {
        buildIdentity: candidate.buildIdentity,
        expectedPath: expected,
        observedPath: candidate.path
      }
    );
  }
  assertInstallerOwnedPath({
    env,
    area: 'artifacts',
    candidate: expected
  });
}

function removeExactBuildDirectory(candidate, env) {
  assertExactOwnedBuildPath(candidate, env);
  if (!fs.existsSync(candidate.path)) return;
  assertInstallerOwnedPath({
    env,
    area: 'artifacts',
    candidate: candidate.path,
    requireExisting: true
  });
  const stat = fs.lstatSync(candidate.path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw gcError(
      'agent_artifact_gc_path_invalid',
      'GC candidate must be a regular build directory.',
      { path: candidate.path }
    );
  }
  const artifactRoot = path.dirname(candidate.path);
  const realRoot = fs.realpathSync(artifactRoot);
  const realCandidate = fs.realpathSync(candidate.path);
  if (!isContained(realRoot, realCandidate)) {
    throw gcError(
      'agent_artifact_gc_path_invalid',
      'GC candidate resolves outside the artifact root.',
      { path: candidate.path }
    );
  }
  fs.rmSync(candidate.path, { recursive: true, force: false });
}

function isContained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== ''
    && !relative.startsWith('..')
    && !path.isAbsolute(relative);
}

function requireDeletionLimit(value) {
  if (
    !Number.isInteger(value)
    || value < 0
    || value > MAX_DELETES_LIMIT
  ) {
    throw gcError(
      'agent_artifact_gc_invalid',
      `maxDeletes must be an integer from 0 to ${MAX_DELETES_LIMIT}.`
    );
  }
  return value;
}

function requireDuration(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw gcError('agent_artifact_gc_invalid', `${label} must be non-negative.`);
  }
  return value;
}

function requireDate(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw gcError('agent_artifact_gc_invalid', `${label} must be a valid date.`);
  }
  return date;
}

function requireBuildIdentity(value) {
  const normalized = String(value ?? '').trim();
  if (!BUILD_IDENTITY_PATTERN.test(normalized)) {
    throw gcError(
      'agent_build_identity_invalid',
      'GC build identity is invalid.',
      { buildIdentity: normalized }
    );
  }
  return normalized;
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw gcError('agent_artifact_gc_invalid', `${label} is required.`);
  }
  return normalized;
}

function normalizeStringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw gcError('agent_artifact_gc_invalid', `${label} must be an array of strings.`);
  }
  return Object.freeze([...new Set(value)].sort(compareStrings));
}

function gcError(code, message, details = {}) {
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
