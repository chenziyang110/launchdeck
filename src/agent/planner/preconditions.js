import { digestCanonical } from '../digests.js';
import { AgentInstallerError, toInstallerErrorPayload } from '../errors.js';
import {
  normalizeCanonicalTransactionTargetDescription,
  normalizeTransactionActionDescription
} from '../state/transaction-plan.js';

export function createPlanPreconditions({ plan, observations } = {}) {
  assertPlan(plan);
  rejectProjectConfigAuthorship(plan);
  const boundTargets = canonicalTargetsById(plan);
  const observationsByTarget = new Map(
    (Array.isArray(observations) ? observations : []).map((observation) => [observation.targetId, observation])
  );
  const targets = [...boundTargets.values()].map((target) => {
    const observation = observationsByTarget.get(target.targetId);
    const ownership = resolveObservationOwnership(target, observation);
    validateObservationBinding(target, observation);
    return {
      targetId: target.targetId,
      scope: target.scope,
      component: target.component,
      targetPath: target.path,
      ownershipBoundary: target.ownershipBoundary,
      ownership,
      preconditionDigest: target.liveDigest,
      desiredDigest: target.desiredDigest,
      evidenceDigest: target.evidenceDigest
    };
  }).sort(compareBy('targetId'));

  const core = {
    planDigest: plan.planDigest,
    targets
  };
  return deepFreeze({
    ...core,
    preconditionSetDigest: digestCanonical(core)
  });
}

export async function revalidatePlanPreconditions({ plan, inspector } = {}) {
  assertPlan(plan);
  rejectProjectConfigAuthorship(plan);
  const boundTargets = canonicalTargetsById(plan);
  if (!inspector || typeof inspector.inspect !== 'function') {
    throw plannerError('agent_plan_precondition_invalid', 'Target inspector is required.');
  }

  for (const target of boundTargets.values()) {
    const observed = await inspector.inspect(target);
    if (Array.isArray(observed)) {
      return invalidResult(plan, 'agent_plan_duplicate_live_target', target.targetId);
    }
    if (!observed || typeof observed !== 'object') {
      return invalidResult(plan, 'agent_plan_precondition_missing', target.targetId);
    }
    if (String(observed.path ?? '') !== String(target.path ?? '')) {
      return invalidResult(plan, 'agent_plan_precondition_path_changed', target.targetId, {
        expectedPath: target.path,
        observedPath: observed.path
      });
    }
    if (observed.scope !== undefined && observed.scope !== target.scope) {
      return invalidResult(plan, 'agent_plan_target_scope_changed', target.targetId, {
        expectedScope: target.scope,
        observedScope: observed.scope
      });
    }
    if (observed.component !== undefined && observed.component !== target.component) {
      return invalidResult(plan, 'agent_plan_target_component_changed', target.targetId, {
        expectedComponent: target.component,
        observedComponent: observed.component
      });
    }
    const expectedOwnership = requireOwnedClassification(target.ownership, target.targetId);
    if (
      observed.ownershipBoundary !== target.ownershipBoundary
      || observed.ownership !== expectedOwnership
    ) {
      return invalidResult(plan, 'agent_plan_ownership_changed', target.targetId, {
        expectedOwnershipBoundary: target.ownershipBoundary,
        observedOwnershipBoundary: observed.ownershipBoundary,
        expectedOwnership,
        observedOwnership: observed.ownership
      });
    }
    if (observed.observedDigest !== target.liveDigest) {
      return invalidResult(plan, 'agent_plan_precondition_changed', target.targetId, {
        expectedDigest: target.liveDigest,
        observedDigest: observed.observedDigest
      });
    }
    if (
      observed.evidenceDigest !== undefined
      && observed.evidenceDigest !== target.evidenceDigest
    ) {
      return invalidResult(plan, 'agent_plan_evidence_changed', target.targetId, {
        expectedEvidenceDigest: target.evidenceDigest,
        observedEvidenceDigest: observed.evidenceDigest
      });
    }
  }

  return deepFreeze({
    valid: true,
    planDigest: plan.planDigest,
    effectCertainty: 'none',
    effects: []
  });
}

function validateObservationBinding(target, observation) {
  if (!observation || typeof observation !== 'object') return;
  if (observation.path !== undefined && String(observation.path) !== String(target.path)) {
    throw plannerError('agent_plan_precondition_path_changed', 'Observed target path drifted before apply.', {
      targetId: target.targetId,
      expectedPath: target.path,
      observedPath: observation.path
    });
  }
  if (observation.scope !== undefined && observation.scope !== target.scope) {
    throw plannerError('agent_plan_target_scope_changed', 'Observed target scope drifted before apply.', {
      targetId: target.targetId,
      expectedScope: target.scope,
      observedScope: observation.scope
    });
  }
  if (observation.component !== undefined && observation.component !== target.component) {
    throw plannerError('agent_plan_target_component_changed', 'Observed target component drifted before apply.', {
      targetId: target.targetId,
      expectedComponent: target.component,
      observedComponent: observation.component
    });
  }
  if (
    observation.ownershipBoundary !== undefined
    && observation.ownershipBoundary !== target.ownershipBoundary
  ) {
    throw plannerError('agent_plan_ownership_changed', 'Observed target ownership boundary drifted before apply.', {
      targetId: target.targetId,
      expectedOwnershipBoundary: target.ownershipBoundary,
      observedOwnershipBoundary: observation.ownershipBoundary
    });
  }
  if (observation.observedDigest !== undefined && observation.observedDigest !== target.liveDigest) {
    throw plannerError('agent_plan_precondition_changed', 'Observed target digest drifted before apply.', {
      targetId: target.targetId,
      expectedDigest: target.liveDigest,
      observedDigest: observation.observedDigest
    });
  }
  if (
    observation.evidenceDigest !== undefined
    && observation.evidenceDigest !== target.evidenceDigest
  ) {
    throw plannerError('agent_plan_evidence_changed', 'Observed target evidence drifted before apply.', {
      targetId: target.targetId,
      expectedEvidenceDigest: target.evidenceDigest,
      observedEvidenceDigest: observation.evidenceDigest
    });
  }
}

function canonicalTargetsById(plan) {
  const actionsByTargetId = new Map(
    plan.actions.map((action) => {
      const normalizedAction = normalizeTransactionActionDescription(action);
      return [normalizedAction.targetId, normalizedAction];
    })
  );
  const targetsByTargetId = new Map();
  for (const target of plan.targets) {
    const normalizedTarget = normalizeCanonicalTransactionTargetDescription(target);
    const action = actionsByTargetId.get(normalizedTarget.targetId);
    if (!action) {
      throw plannerError(
        'agent_plan_target_mismatch',
        'Plan target metadata does not match the executable actions.'
      );
    }
    if (
      normalizedTarget.path !== action.targetPath
      || normalizedTarget.ownershipBoundary !== action.ownershipBoundary
      || normalizedTarget.liveDigest !== action.preconditionDigest
      || normalizedTarget.desiredDigest !== action.desiredDigest
    ) {
      throw plannerError(
        'agent_plan_target_mismatch',
        'Plan target metadata does not match the executable actions.'
      );
    }
    if (targetsByTargetId.has(normalizedTarget.targetId)) {
      throw plannerError(
        'agent_plan_duplicate_target',
        'Plan target metadata contains duplicate targetIds.'
      );
    }
    targetsByTargetId.set(normalizedTarget.targetId, normalizedTarget);
  }
  if (targetsByTargetId.size !== actionsByTargetId.size) {
    throw plannerError(
      'agent_plan_target_mismatch',
      'Plan target metadata does not match the executable actions.'
    );
  }
  return targetsByTargetId;
}

export function createPreconditionRefusal({ plan, evidence } = {}) {
  assertPlan(plan);
  const code = evidence?.code ?? 'agent_plan_precondition_changed';
  const error = plannerError(code, 'Plan preconditions changed before apply.', {
    targetId: evidence?.targetId ?? null,
    ...(evidence?.details && typeof evidence.details === 'object' ? evidence.details : {})
  });
  return deepFreeze({
    outcome: 'refused',
    effectCertainty: 'none',
    scope: plan.scope,
    projectIdentity: plan.projectIdentity ?? null,
    buildIdentity: plan.buildIdentity,
    operationId: null,
    planDigest: plan.planDigest,
    receiptId: null,
    targets: cloneJson(plan.targets),
    health: [],
    effects: [],
    nextActions: ['Re-run planning before applying changes.'],
    error: toInstallerErrorPayload(error)
  });
}

function invalidResult(plan, code, targetId, details = {}) {
  return deepFreeze({
    valid: false,
    planDigest: plan.planDigest,
    effectCertainty: 'none',
    effects: [],
    code,
    targetId,
    details
  });
}

function rejectProjectConfigAuthorship(plan) {
  const forbidden = plan.actions.find((action) => {
    const targetPath = String(action?.targetPath ?? '').replaceAll('\\', '/');
    return targetPath === '.launchdeck.yml' || targetPath.endsWith('/.launchdeck.yml');
  });
  if (forbidden) {
    throw plannerError(
      'agent_project_config_authorship_forbidden',
      'The installer must not author .launchdeck.yml.',
      { actionId: forbidden.actionId, targetPath: forbidden.targetPath }
    );
  }
}

function assertPlan(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.targets) || !Array.isArray(plan.actions)) {
    throw plannerError('agent_plan_invalid', 'Installation plan is required.');
  }
}

function requireOwnedClassification(value, targetId) {
  const ownership = String(value ?? '').trim();
  if (!ownership || ownership === 'unknown' || ownership === 'foreign' || ownership === 'unobserved') {
    throw plannerError(
      'agent_plan_ownership_missing',
      'Target ownership must be positively proven before apply.',
      { targetId, ownership: ownership || null }
    );
  }
  return ownership;
}

function resolveObservationOwnership(target, observation) {
  const expectedOwnership = requireOwnedClassification(target.ownership, target.targetId);
  if (observation === undefined || observation === null) {
    return expectedOwnership;
  }
  if (typeof observation !== 'object' || Array.isArray(observation)) {
    throw plannerError(
      'agent_plan_invalid',
      'Observation must be a plain object.',
      { targetId: target.targetId }
    );
  }
  if (!Object.hasOwn(observation, 'ownership')) {
    throw plannerError(
      'agent_plan_ownership_missing',
      'Observation ownership must be supplied when observations are provided.',
      { targetId: target.targetId }
    );
  }
  const observedOwnership = requireOwnedClassification(observation.ownership, target.targetId);
  if (observedOwnership !== expectedOwnership) {
    throw plannerError(
      'agent_plan_ownership_changed',
      'Observation ownership must match the canonical target ownership.',
      {
        targetId: target.targetId,
        expectedOwnership,
        observedOwnership
      }
    );
  }
  return observedOwnership;
}

function plannerError(code, message, details = {}) {
  return new AgentInstallerError(code, message, {
    effectCertainty: 'none',
    details
  });
}

function compareBy(field) {
  return (left, right) => String(left?.[field] ?? '').localeCompare(String(right?.[field] ?? ''));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
