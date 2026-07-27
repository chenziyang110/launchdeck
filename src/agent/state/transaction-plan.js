import { digestCanonical } from '../digests.js';
import { AgentInstallerError } from '../errors.js';
import { resolveInstallationScope } from './scope-resolver.js';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PLAN_ID_PATTERN = /^plan_[A-Za-z0-9_-]{16,128}$/;

export const PACKAGED_BUILD_SELECTOR = 'packaged';

export function createCanonicalTransactionPlan(input = {}) {
  return normalizeCanonicalTransactionPlan(input);
}

export function normalizeCanonicalTransactionPlan(input = {}) {
  const actions = requireArray(input.actions, 'plan.actions')
    .map((action) => normalizeTransactionActionDescription(action));
  const targets = requireArray(input.targets ?? [], 'plan.targets')
    .map((target) => normalizeCanonicalTransactionTargetDescription(target));
  const actionTargetIds = normalizeTargetIds(actions.map((action) => action.targetId));
  const targetIds = normalizeTargetIds(input.targetIds ?? actionTargetIds);
  if (digestCanonical(targetIds) !== digestCanonical(actionTargetIds)) {
    throw planError(
      'agent_plan_target_mismatch',
      'Approved target locks do not match the executable actions.'
    );
  }
  if (targets.length !== actionTargetIds.length) {
    throw planError(
      'agent_plan_target_mismatch',
      'Approved target metadata does not match the executable actions.'
    );
  }
  const actionsByTargetId = new Map(actions.map((action) => [action.targetId, action]));
  const targetsByTargetId = new Map();
  for (const target of targets) {
    if (targetsByTargetId.has(target.targetId)) {
      throw planError(
        'agent_plan_duplicate_target',
        'Approved target metadata contains duplicate targetIds.'
      );
    }
    targetsByTargetId.set(target.targetId, target);
  }
  for (const targetId of actionTargetIds) {
    const target = targetsByTargetId.get(targetId);
    const action = actionsByTargetId.get(targetId);
    if (!target || !action) {
      throw planError(
        'agent_plan_target_mismatch',
        'Approved target metadata does not match the executable actions.'
      );
    }
    validateTargetActionBinding(target, action);
  }

  const normalized = {
    planId: requirePlanId(input.planId),
    buildIdentity: requireDigest(input.buildIdentity, 'plan.buildIdentity'),
    scope: requireScope(input.scope),
    scopeIdentity: requireText(input.scopeIdentity, 'plan.scopeIdentity'),
    projectIdentity: normalizeProjectIdentity(input.projectIdentity),
    targetIds,
    includeLauncher: input.includeLauncher === true,
    previousBuildPins: requireArray(
      input.previousBuildPins ?? [],
      'plan.previousBuildPins'
    ).map((digest) => requireDigest(digest, 'plan.previousBuildPins')),
    targets,
    actions
  };

  const planDigest = digestCanonical(canonicalPlanDigestShape(normalized));
  if (input.planDigest !== undefined) {
    const providedPlanDigest = requireDigest(input.planDigest, 'plan.planDigest');
    if (providedPlanDigest !== planDigest) {
      throw planError(
        'agent_plan_digest_mismatch',
        'Approved plan digest does not match immutable plan content.'
      );
    }
  }

  const planBindingDigest = digestCanonical(canonicalPlanBindingShape({
    ...normalized,
    planDigest
  }));
  if (input.planBindingDigest !== undefined) {
    const providedPlanBindingDigest = requireDigest(
      input.planBindingDigest,
      'plan.planBindingDigest'
    );
    if (providedPlanBindingDigest !== planBindingDigest) {
      throw planError(
        'agent_plan_binding_mismatch',
        'Approved plan binding does not match the canonical plan/action binding.'
      );
    }
  }

  return deepFreeze({
    ...normalized,
    planDigest,
    planBindingDigest
  });
}

export function normalizeTransactionActionDescription(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    throw planError('agent_transaction_invalid', 'plan.actions contains an invalid action.');
  }
  return {
    actionId: requireText(action.actionId, 'plan.action.actionId'),
    kind: requireText(action.kind, 'plan.action.kind'),
    targetId: requireText(action.targetId, 'plan.action.targetId'),
    ownershipBoundary: requireText(
      action.ownershipBoundary,
      'plan.action.ownershipBoundary'
    ),
    targetPath: requireText(action.targetPath, 'plan.action.targetPath'),
    preconditionDigest: requireDigest(
      action.preconditionDigest,
      'plan.action.preconditionDigest'
    ),
    desiredDigest: requireDigest(action.desiredDigest, 'plan.action.desiredDigest'),
    requiresBackup: action.requiresBackup === true
  };
}

export function normalizeCanonicalTransactionTargetDescription(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw planError('agent_transaction_invalid', 'plan.targets contains an invalid target.');
  }
  const targetId = requireText(target.targetId, 'plan.target.targetId');
  const descriptor = parseTargetDescriptor(targetId);
  const normalized = {
    targetId,
    hostId: requireOptionalText(target.hostId, 'plan.target.hostId') ?? descriptor.hostId,
    scope: requireScope(target.scope ?? descriptor.scope),
    component: requireText(target.component ?? descriptor.component, 'plan.target.component'),
    path: requireText(target.path ?? target.targetPath, 'plan.target.path'),
    ownershipBoundary: requireText(
      target.ownershipBoundary,
      'plan.target.ownershipBoundary'
    ),
    ownership: requireText(target.ownership, 'plan.target.ownership'),
    liveDigest: requireDigest(
      target.liveDigest ?? target.preconditionDigest,
      'plan.target.liveDigest'
    ),
    desiredDigest: requireDigest(target.desiredDigest, 'plan.target.desiredDigest')
  };
  if (normalized.hostId !== descriptor.hostId) {
    throw planError(
      'agent_plan_target_mismatch',
      'Approved target host metadata does not match targetId.'
    );
  }
  if (normalized.scope !== descriptor.scope || normalized.component !== descriptor.component) {
    throw planError(
      'agent_plan_target_mismatch',
      'Approved target scope or component does not match targetId.'
    );
  }
  const evidenceDigest = requireDigest(
    target.evidenceDigest ?? createCanonicalTargetEvidenceDigest(normalized),
    'plan.target.evidenceDigest'
  );
  return {
    ...normalized,
    evidenceDigest
  };
}

export function createCanonicalTransactionPlanId(input = {}) {
  const digest = digestCanonical({
    buildIdentity: input.buildIdentity,
    scope: input.scope,
    scopeIdentity: input.scopeIdentity,
    projectIdentity: input.projectIdentity ?? null,
    targetIds: normalizeTargetIds(input.targetIds ?? []),
    includeLauncher: input.includeLauncher === true,
    previousBuildPins: requireArray(
      input.previousBuildPins ?? [],
      'plan.previousBuildPins'
    ),
    targets: requireArray(input.targets ?? [], 'plan.targets')
      .map((target) => normalizeCanonicalTransactionTargetDescription(target)),
    actions: requireArray(input.actions ?? [], 'plan.actions')
      .map((action) => normalizeTransactionActionDescription(action))
  });
  return `plan_${digest.slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

export function resolveCanonicalScope(input = {}) {
  if (input.scope === 'project') {
    return resolveInstallationScope({
      scope: 'project',
      projectRoot: input.projectIdentity ?? input.projectRoot,
      env: input.env
    });
  }
  return resolveInstallationScope({
    scope: 'user',
    userHome: input.userHome ?? input.homeDir,
    env: input.env
  });
}

export function isDigest(value) {
  return DIGEST_PATTERN.test(String(value ?? ''));
}

function canonicalPlanDigestShape(plan) {
  return {
    planId: plan.planId,
    buildIdentity: plan.buildIdentity,
    scope: plan.scope,
    scopeIdentity: plan.scopeIdentity,
    projectIdentity: plan.projectIdentity,
    targetIds: plan.targetIds,
    includeLauncher: plan.includeLauncher,
    previousBuildPins: plan.previousBuildPins,
    targets: plan.targets,
    actions: plan.actions
  };
}

function canonicalPlanBindingShape(plan) {
  return {
    planId: plan.planId,
    planDigest: plan.planDigest,
    buildIdentity: plan.buildIdentity,
    scope: plan.scope,
    scopeIdentity: plan.scopeIdentity,
    projectIdentity: plan.projectIdentity,
    targetIds: plan.targetIds,
    includeLauncher: plan.includeLauncher,
    previousBuildPins: plan.previousBuildPins,
    targets: plan.targets,
    actions: plan.actions
  };
}

function createCanonicalTargetEvidenceDigest(target) {
  return digestCanonical({
    targetId: target.targetId,
    hostId: target.hostId,
    scope: target.scope,
    component: target.component,
    path: target.path,
    ownershipBoundary: target.ownershipBoundary,
    ownership: target.ownership,
    liveDigest: target.liveDigest,
    desiredDigest: target.desiredDigest
  });
}

function validateTargetActionBinding(target, action) {
  if (
    target.targetId !== action.targetId
    || target.path !== action.targetPath
    || target.ownershipBoundary !== action.ownershipBoundary
    || target.liveDigest !== action.preconditionDigest
    || target.desiredDigest !== action.desiredDigest
  ) {
    throw planError(
      'agent_plan_target_mismatch',
      'Approved target metadata does not match the executable action binding.'
    );
  }
}

function parseTargetDescriptor(targetId) {
  const [hostId, scope, component, ...rest] = String(targetId ?? '').split(':');
  if (!hostId || !scope || !component || rest.length > 0) {
    throw planError('agent_plan_target_invalid', 'plan.target.targetId is invalid.');
  }
  return {
    hostId,
    scope,
    component
  };
}

function normalizeTargetIds(value) {
  return [...new Set(requireArray(value, 'plan.targetIds')
    .map((targetId) => requireText(targetId, 'plan.targetId')))]
    .sort();
}

function requirePlanId(value) {
  const planId = String(value ?? '').trim();
  if (!PLAN_ID_PATTERN.test(planId)) {
    throw planError('agent_plan_invalid', 'plan.planId is invalid.');
  }
  return planId;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw planError('agent_transaction_invalid', `${label} is required.`);
  }
  return text;
}

function requireOptionalText(value, label) {
  if (value === undefined || value === null || value === '') return null;
  return requireText(value, label);
}

function requireDigest(value, label) {
  const digest = String(value ?? '');
  if (!DIGEST_PATTERN.test(digest)) {
    throw planError('agent_transaction_invalid', `${label} is invalid.`);
  }
  return digest;
}

function requireScope(value) {
  if (!['project', 'user'].includes(value)) {
    throw planError('agent_transaction_invalid', 'plan.scope is invalid.');
  }
  return value;
}

function normalizeProjectIdentity(value) {
  return value === null || value === undefined ? null : requireText(value, 'plan.projectIdentity');
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw planError('agent_transaction_invalid', `${label} must be an array.`);
  }
  return [...value];
}

function planError(code, message) {
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
