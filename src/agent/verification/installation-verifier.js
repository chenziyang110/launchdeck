import fs from 'node:fs';
import path from 'node:path';
import { redactInstallerValue } from '../result.js';
import { createMcpHandshakeVerifier } from './mcp-handshake.js';

const BUILD_IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const RECEIPT_ID_PATTERN = /^receipt_[A-Za-z0-9_-]{8,128}$/;
const SCOPE_IDENTITY_PATTERN = /^(?:project|user):sha256:[0-9a-f]{64}$/;
const RECEIPT_CANDIDATE_FIELDS = Object.freeze([
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
]);
const REQUIRED_RECEIPT_CANDIDATE_FIELDS = Object.freeze([
  'receiptId',
  'scope',
  'scopeIdentity',
  'projectIdentity',
  'buildIdentity',
  'targets',
  'ownedDigests',
  'verificationEvidence'
]);
const CHECK_ORDER = Object.freeze([
  'skill-digest',
  'config-ownership',
  'config-digest',
  'stable-launcher',
  'runtime-digest',
  'mcp-initialize',
  'launchdeck-capabilities',
  'build-identity',
  'receipt-candidate',
  'host-approval'
]);

export function createInstallationVerifier(options = {}) {
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const handshake = createMcpHandshakeVerifier({
    transportFactory: typeof options.mcpHandshake === 'function'
      ? options.mcpHandshake
      : options.transportFactory,
    timeoutMs
  });

  return Object.freeze({
    async verifyTarget(request = {}) {
      const target = request.target ?? {};
      const expected = request.expected ?? {};
      const observed = request.observed ?? {};
      const receiptCandidate = request.receiptCandidate ?? {};
      const expectedBuildIdentity = String(expected.buildIdentity ?? '');
      const checks = new Map();

      setCheck(checks, 'skill-digest', digestPass(target.skillPath, observed.skillDigest, expected.skillDigest), {
        digest: observed.skillDigest ?? null
      });
      setCheck(checks, 'config-ownership', observed.configOwnership === 'verified' ? 'pass' : 'fail', {
        ownershipBoundary: target.ownershipBoundary ?? null
      });
      setCheck(checks, 'config-digest', digestPass(target.configPath, observed.configDigest, expected.configDigest), {
        digest: observed.configDigest ?? null
      });
      setCheck(checks, 'stable-launcher', stableLauncherPass(target, observed, expectedBuildIdentity), {
        launcherPath: absolutePathOrNull(observed.launcherPath ?? target.launcherPath)
      });
      setCheck(checks, 'runtime-digest', digestPass(target.runtimePath, observed.runtimeDigest, expected.runtimeDigest), {
        digest: observed.runtimeDigest ?? null
      });

      if (!isBuildIdentity(expectedBuildIdentity)) {
        setRuntimeSkipped(checks);
        setCheck(checks, 'receipt-candidate', receiptCandidatePass(
          receiptCandidate,
          target,
          expected,
          observed,
          expectedBuildIdentity
        ), {
          receiptId: receiptCandidate.receiptId ?? null
        });
        setCheck(checks, 'host-approval', hostApprovalStatus(observed), {
          requiredHostActions: redactedHostActions(observed.requiredHostActions)
        });
        return finalResult({
          target,
          expectedBuildIdentity,
          observed,
          checks,
          ready: false,
          state: 'failed',
          code: 'agent_build_identity_invalid'
        });
      }

      if (launcherPathInvalid(target, observed)) {
        setRuntimeSkipped(checks);
        setCheck(checks, 'receipt-candidate', receiptCandidatePass(
          receiptCandidate,
          target,
          expected,
          observed,
          expectedBuildIdentity
        ), {
          receiptId: receiptCandidate.receiptId ?? null
        });
        setCheck(checks, 'host-approval', hostApprovalStatus(observed), {
          requiredHostActions: redactedHostActions(observed.requiredHostActions)
        });
        return finalResult({
          target,
          expectedBuildIdentity,
          observed,
          checks,
          ready: false,
          state: 'failed',
          code: 'agent_launcher_path_invalid'
        });
      }

      if (preRuntimeFailed(checks)) {
        setRuntimeSkipped(checks);
      } else {
        const mcpResult = await handshake.verify({
          command: observed.verificationCommand ?? observed.launcherPath ?? target.launcherPath,
          args: [
            ...(Array.isArray(observed.verificationArgs) ? observed.verificationArgs : []),
            '--build',
            expectedBuildIdentity,
            '--'
          ],
          expectedBuildIdentity,
          env: observed.env
        });
        mergeMcpChecks(checks, mcpResult);
      }

      setCheck(checks, 'receipt-candidate', receiptCandidatePass(
        receiptCandidate,
        target,
        expected,
        observed,
        expectedBuildIdentity
      ), {
        receiptId: receiptCandidate.receiptId ?? null
      });
      setCheck(checks, 'host-approval', hostApprovalStatus(observed), {
        requiredHostActions: redactedHostActions(observed.requiredHostActions)
      });

      const ordered = orderedChecks(checks);
      const pendingHost = checks.get('host-approval')?.status === 'pending';
      const anyFail = ordered.some((entry) => entry.status === 'fail');
      const code = failureCode(checks, pendingHost);

      return finalResult({
        target,
        expectedBuildIdentity,
        observed,
        checks,
        ready: !pendingHost && !anyFail,
        state: pendingHost ? 'pending-host-approval' : (anyFail ? 'failed' : 'verified'),
        code
      });
    }
  });
}

function digestPass(filePath, observedDigest, expectedDigest) {
  return pathExists(filePath) && isDigest(observedDigest) && observedDigest === expectedDigest
    ? 'pass'
    : 'fail';
}

function stableLauncherPass(target, observed, expectedBuildIdentity) {
  const launcherPath = observed.launcherPath ?? target.launcherPath;
  return pathExists(launcherPath)
    && path.isAbsolute(launcherPath)
    && observed.launcherResolved === true
    && isBuildIdentity(expectedBuildIdentity)
      ? 'pass'
      : 'fail';
}

function launcherPathInvalid(target, observed) {
  const launcherPath = observed.launcherPath ?? target.launcherPath;
  return typeof launcherPath !== 'string' || !path.isAbsolute(launcherPath);
}

function preRuntimeFailed(checks) {
  return ['skill-digest', 'config-ownership', 'config-digest', 'stable-launcher', 'runtime-digest']
    .some((code) => checks.get(code)?.status !== 'pass');
}

function setRuntimeSkipped(checks) {
  for (const code of ['mcp-initialize', 'launchdeck-capabilities', 'build-identity']) {
    setCheck(checks, code, 'fail');
  }
}

function mergeMcpChecks(checks, result) {
  const byCode = new Map((result?.checks ?? []).map((entry) => [entry.code, entry]));
  for (const code of ['mcp-initialize', 'launchdeck-capabilities', 'build-identity']) {
    const entry = byCode.get(code);
    setCheck(checks, code, entry?.status === 'pass' ? 'pass' : 'fail', {
      ...(entry?.observedBuildIdentity ? { observedBuildIdentity: entry.observedBuildIdentity } : {})
    });
  }
}

function receiptCandidatePass(receiptCandidate, target, expected, observed, expectedBuildIdentity) {
  if (!receiptCandidateRootPass(receiptCandidate)) return 'fail';
  if (receiptCandidate.buildIdentity !== expectedBuildIdentity) return 'fail';
  if (!isReceiptId(receiptCandidate.receiptId)) return 'fail';
  if (!scopeIdentityPass(receiptCandidate, target, expected)) return 'fail';

  const targetPath = canonicalTargetPath(target);
  const desiredDigest = expectedDesiredDigest(target, expected);
  const liveDigest = observedOwnedDigest(target, observed);
  if (!target.targetId || !target.component || !target.ownershipBoundary) return 'fail';
  if (!targetPath || !isDigest(desiredDigest) || !isDigest(liveDigest)) return 'fail';
  if (liveDigest !== desiredDigest) return 'fail';

  const targets = Array.isArray(receiptCandidate.targets) ? receiptCandidate.targets : [];
  if (targets.length === 0 || hasDuplicateTargetIds(targets)) return 'fail';
  if (!receiptTargetsCanonical(targets)) return 'fail';
  if (!ownedDigestsExact(receiptCandidate.ownedDigests, targets)) return 'fail';

  const matches = targets.filter((entry) =>
    entry?.targetId === target.targetId
    && entry?.ownershipBoundary === target.ownershipBoundary
    && entry?.desiredDigest === desiredDigest
  );
  if (matches.length !== 1) return 'fail';

  return 'pass';
}

function hostApprovalStatus(observed) {
  if (observed.hostApprovalObserved === true) return 'pass';
  return Array.isArray(observed.requiredHostActions) && observed.requiredHostActions.length > 0
    ? 'pending'
    : 'fail';
}

function failureCode(checks, pendingHost) {
  if (pendingHost) return 'agent_host_approval_pending';
  if (checks.get('stable-launcher')?.status === 'fail') return 'agent_verification_evidence_incomplete';
  if (checks.get('launchdeck-capabilities')?.status === 'fail') return 'agent_capabilities_unavailable';
  if (checks.get('mcp-initialize')?.status === 'fail') return 'agent_mcp_initialize_failed';
  if (checks.get('build-identity')?.status === 'fail') return 'agent_build_identity_mismatch';
  if (checks.get('receipt-candidate')?.status === 'fail') return 'agent_build_identity_mismatch';
  if (orderedChecks(checks).some((entry) => entry.status === 'fail')) {
    return 'agent_verification_evidence_incomplete';
  }
  return undefined;
}

function finalResult({ target, expectedBuildIdentity, observed, checks, ready, state, code }) {
  return Object.freeze(redactInstallerValue({
    ready,
    state,
    ...(code && state !== 'verified' ? { code } : {}),
    targetId: target.targetId ?? null,
    buildIdentity: expectedBuildIdentity,
    ...(observed.previousBuildIdentity ? { previousBuildIdentity: observed.previousBuildIdentity } : {}),
    requiredHostActions: redactedHostActions(observed.requiredHostActions),
    checks: orderedChecks(checks)
  }));
}

function setCheck(checks, code, status, details = {}) {
  checks.set(code, Object.freeze(redactInstallerValue({
    code,
    status,
    ...details
  })));
}

function orderedChecks(checks) {
  return CHECK_ORDER.map((code) => checks.get(code) ?? check(code, 'fail'));
}

function check(code, status) {
  return Object.freeze({ code, status });
}

function redactedHostActions(actions) {
  return Array.isArray(actions) ? redactInstallerValue(actions) : [];
}

function pathExists(value) {
  return typeof value === 'string' && value.length > 0 && fs.existsSync(value);
}

function absolutePathOrNull(value) {
  return typeof value === 'string' && path.isAbsolute(value) ? value : null;
}

function scopeIdentityPass(receiptCandidate, target, expected) {
  const scope = expected.scope ?? target.scope;
  const scopeIdentity = expected.scopeIdentity;
  const projectIdentity = expected.projectIdentity ?? null;
  if (!['project', 'user'].includes(scope)) return false;
  if (typeof scopeIdentity !== 'string' || !SCOPE_IDENTITY_PATTERN.test(scopeIdentity)) {
    return false;
  }
  if (
    receiptCandidate.scope !== scope
    || receiptCandidate.scopeIdentity !== scopeIdentity
    || (receiptCandidate.projectIdentity ?? null) !== projectIdentity
  ) {
    return false;
  }
  return scope === 'project' ? typeof projectIdentity === 'string' && projectIdentity.length > 0 : projectIdentity === null;
}

function receiptCandidateRootPass(value) {
  return isCanonicalRootObject(value)
    && hasOwnFields(value, REQUIRED_RECEIPT_CANDIDATE_FIELDS)
    && allowedKeys(value, RECEIPT_CANDIDATE_FIELDS)
    && Array.isArray(value.targets)
    && Array.isArray(value.ownedDigests)
    && Array.isArray(value.verificationEvidence);
}

function canonicalTargetPath(target) {
  const targetPath = target.configPath ?? target.path;
  if (typeof targetPath !== 'string' || !path.isAbsolute(targetPath)) return null;
  const canonical = path.resolve(targetPath);
  return targetPath === canonical ? canonical : null;
}

function hasDuplicateTargetIds(targets) {
  const targetIds = targets.map((entry) => entry?.targetId).filter(Boolean);
  return new Set(targetIds).size !== targetIds.length;
}

function expectedDesiredDigest(target, expected) {
  if (isDigest(expected.desiredDigest)) return expected.desiredDigest;
  if (target.component === 'skill') return expected.skillDigest;
  if (target.component === 'runtime') return expected.runtimeDigest;
  return expected.configDigest;
}

function observedOwnedDigest(target, observed) {
  if (isDigest(observed.ownedDigest)) return observed.ownedDigest;
  if (target.component === 'skill') return observed.skillDigest;
  if (target.component === 'runtime') return observed.runtimeDigest;
  return observed.configDigest;
}

function receiptTargetsCanonical(targets) {
  return targets.every((entry) =>
    entry
    && typeof entry === 'object'
    && !Array.isArray(entry)
    && allowedKeys(entry, ['targetId', 'ownershipBoundary', 'desiredDigest'])
    && typeof entry.targetId === 'string'
    && entry.targetId.length > 0
    && typeof entry.ownershipBoundary === 'string'
    && entry.ownershipBoundary.length > 0
    && isDigest(entry.desiredDigest)
  );
}

function ownedDigestsExact(ownedDigests, targets) {
  return Array.isArray(ownedDigests)
    && ownedDigests.length === targets.length
    && ownedDigests.every((digest) => typeof digest === 'string' && isDigest(digest))
    && sameDigestMultiset(ownedDigests, targets.map((entry) => entry.desiredDigest));
}

function sameDigestMultiset(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function allowedKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasOwnFields(value, required) {
  return required.every((field) => Object.hasOwn(value, field));
}

function isCanonicalRootObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isDigest(value) {
  return DIGEST_PATTERN.test(String(value ?? ''));
}

function isBuildIdentity(value) {
  return BUILD_IDENTITY_PATTERN.test(String(value ?? ''));
}

function isReceiptId(value) {
  return RECEIPT_ID_PATTERN.test(String(value ?? ''));
}

function normalizeTimeout(value) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate > 0 ? Math.trunc(candidate) : undefined;
}
