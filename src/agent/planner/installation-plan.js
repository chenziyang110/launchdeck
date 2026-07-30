import { AgentInstallerError, toInstallerErrorPayload } from '../errors.js';
import {
  createCanonicalTransactionPlan,
  createCanonicalTransactionPlanId,
  isDigest,
  normalizeCanonicalTransactionTargetDescription,
  normalizeTransactionActionDescription
} from '../state/transaction-plan.js';

export async function createInstallationPlan({ desired, evidence } = {}) {
  if (!desired || typeof desired !== 'object') {
    throw plannerError('agent_plan_invalid', 'Desired installation is required.');
  }
  if (!evidence || typeof evidence !== 'object') {
    throw plannerError('agent_plan_invalid', 'Planner evidence is required.');
  }
  if (!isDigest(desired.desiredBuildIdentity)) {
    throw plannerError(
      'agent_build_identity_unresolved',
      'Packaged build selection must resolve to a verified sha256 build before planning.'
    );
  }

  const targets = normalizeTargets(evidence.targets);
  const targetPlans = normalizeTargetPlans(evidence.targetPlans);
  const actions = [];

  for (const targetPlan of targetPlans) {
    if (targetPlan.status === 'refused') {
      throw plannerError(codeForTargetRefusal(targetPlan.code), targetPlan.message ?? 'Target planning refused.', {
        targetId: targetPlan.targetId,
        nativeCode: targetPlan.code
      });
    }
    if (targetPlan.status !== 'planned' && targetPlan.status !== 'no-op' && targetPlan.status !== 'noop') {
      throw plannerError('agent_plan_target_invalid', 'Target plan status is invalid.', {
        targetId: targetPlan.targetId,
        status: targetPlan.status
      });
    }
    for (const action of targetPlan.actions ?? []) {
      actions.push(normalizeAction(action));
    }
  }

  assertUnique(targets, 'targetId', 'agent_plan_duplicate_target');
  assertUnique(actions, 'actionId', 'agent_plan_duplicate_action');
  const canonicalTargets = createCanonicalTargets({ targets, actions });
  const evaluatedTargets = createEvaluatedTargets({ targets, actions, targetPlans });
  const targetIds = canonicalTargets.map((target) => target.targetId);
  const trustedSources = trustedSourcesFromEvidence(evidence);
  const includeLauncher = desired.includeLauncher === true || evidence.includeLauncher === true;
  const previousBuildPins = normalizePreviousBuildPins(
    desired.previousBuildPins ?? evidence.previousBuildPins ?? []
  );
  const planId = createCanonicalTransactionPlanId({
    buildIdentity: desired.desiredBuildIdentity,
    scope: desired.scope,
    scopeIdentity: desired.scopeIdentity,
    projectIdentity: desired.projectIdentity,
    targetIds,
    includeLauncher,
    previousBuildPins,
    targets: canonicalTargets,
    actions
  });
  const canonicalPlan = createCanonicalTransactionPlan({
    planId,
    buildIdentity: desired.desiredBuildIdentity,
    scope: desired.scope,
    scopeIdentity: desired.scopeIdentity,
    projectIdentity: desired.projectIdentity,
    targetIds,
    includeLauncher,
    previousBuildPins,
    targets: canonicalTargets,
    actions
  });

  return deepFreeze({
    ...canonicalPlan,
    desiredInstallationDigest: desired.inputDigest,
    matrixRevision: evidence.matrixRevision,
    sourceIdentity: desired.sourceIdentity,
    state: actions.length === 0 ? 'plan-ready' : 'awaiting-approval',
    targets: canonicalTargets,
    evaluatedTargets,
    supersedesReceiptId: evidence.supersedesReceiptId ?? null,
    requiredHostActions: [],
    trustedSources,
    effectsPreview: {
      effectCertainty: 'none',
      actionCount: actions.length,
      targetCount: evaluatedTargets.length
    }
  });
}

export function createDryRunPlanResult({ plan } = {}) {
  return resultForPlan(plan, {
    outcome: 'planned',
    nextActions: ['Review the plan and rerun with --yes to apply it.']
  });
}

export function createApprovalRequirement({ plan, jsonMode = false } = {}) {
  const error = new AgentInstallerError(
    'agent_approval_required',
    jsonMode
      ? 'Launchdeck mutation approval is required; JSON mode cannot prompt.'
      : 'Launchdeck mutation approval is required before applying this plan.',
    {
      effectCertainty: 'none',
      details: {
        planDigest: plan?.planDigest ?? null,
        planBindingDigest: plan?.planBindingDigest ?? null
      }
    }
  );
  return resultForPlan(plan, {
    outcome: 'refused',
    error: toInstallerErrorPayload(error),
    nextActions: ['Rerun with --yes after reviewing the plan.']
  });
}

export function createNoopPlanResult({ plan } = {}) {
  return resultForPlan(plan, {
    outcome: 'noop',
    nextActions: []
  });
}

function resultForPlan(plan, overrides = {}) {
  assertPlan(plan);
  return deepFreeze({
    outcome: overrides.outcome,
    effectCertainty: 'none',
    scope: plan.scope,
    scopeIdentity: plan.scopeIdentity,
    projectIdentity: plan.projectIdentity ?? null,
    buildIdentity: plan.buildIdentity,
    operationId: null,
    planDigest: plan.planDigest,
    planBindingDigest: plan.planBindingDigest,
    receiptId: null,
    targetIds: cloneJson((plan.evaluatedTargets ?? plan.targets).map((target) => target.targetId)),
    targets: cloneJson(plan.evaluatedTargets ?? plan.targets),
    health: [],
    effects: [],
    nextActions: overrides.nextActions ?? [],
    ...(overrides.error ? { error: overrides.error } : {})
  });
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets)) {
    throw plannerError('agent_plan_target_invalid', 'Planner targets are required.');
  }
  return targets.map((target) => normalizeObject(target, 'agent_plan_target_invalid'))
    .sort(compareBy('targetId'));
}

function normalizeTargetPlans(targetPlans) {
  if (!Array.isArray(targetPlans)) {
    throw plannerError('agent_plan_target_invalid', 'Target plans are required.');
  }
  return targetPlans.map((targetPlan) => normalizeObject(targetPlan, 'agent_plan_target_invalid'))
    .sort(compareBy('targetId'));
}

function normalizeAction(action) {
  return normalizeTransactionActionDescription(action);
}

function createCanonicalTargets({ targets, actions }) {
  const actionsByTargetId = new Map(actions.map((action) => [action.targetId, action]));
  const canonicalTargets = [];
  for (const target of targets) {
    const action = actionsByTargetId.get(target.targetId);
    if (!action) continue;
    canonicalTargets.push(normalizeCanonicalTransactionTargetDescription({
      targetId: target.targetId,
      hostId: target.hostId,
      scope: target.scope,
      component: target.component,
      path: target.path,
      ownershipBoundary: target.ownershipBoundary,
      ownership: target.ownership,
      liveDigest: target.liveDigest ?? action.preconditionDigest,
      desiredDigest: action.desiredDigest
    }));
  }
  if (canonicalTargets.length !== actionsByTargetId.size) {
    throw plannerError(
      'agent_plan_target_mismatch',
      'Planner targets do not cover every executable action target.'
    );
  }
  return canonicalTargets.sort(compareBy('targetId'));
}

function createEvaluatedTargets({ targets, actions, targetPlans = [] }) {
  const canonicalTargets = createCanonicalTargets({ targets, actions });
  const canonicalByTargetId = new Map(canonicalTargets.map((target) => [target.targetId, target]));
  const plansByTargetId = new Map(targetPlans.map((targetPlan) => [targetPlan.targetId, targetPlan]));
  const evaluated = [];
  for (const target of targets) {
    const canonical = canonicalByTargetId.get(target.targetId);
    if (canonical) {
      evaluated.push(canonical);
      continue;
    }
    const targetPlan = plansByTargetId.get(target.targetId);
    const liveDigest = target.liveDigest
      ?? target.preconditionDigest
      ?? targetPlan?.liveDigest
      ?? targetPlan?.contentDigest
      ?? targetPlan?.desiredDigest;
    const desiredDigest = target.desiredDigest
      ?? targetPlan?.desiredDigest
      ?? liveDigest;
    if (!liveDigest || !desiredDigest) continue;
    evaluated.push(normalizeCanonicalTransactionTargetDescription({
      targetId: target.targetId,
      hostId: target.hostId,
      scope: target.scope,
      component: target.component,
      path: target.path,
      ownershipBoundary: target.ownershipBoundary,
      ownership: target.ownership,
      liveDigest,
      desiredDigest
    }));
  }
  return evaluated.sort(compareBy('targetId'));
}

function normalizeObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw plannerError(code, 'Planner entry must be an object.');
  }
  return cloneJson(value);
}

function normalizePreviousBuildPins(value) {
  if (!Array.isArray(value)) {
    throw plannerError('agent_plan_invalid', 'previousBuildPins must be an array.');
  }
  return [...new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))]
    .map((entry) => {
      if (!isDigest(entry)) {
        throw plannerError('agent_plan_invalid', 'previousBuildPins must contain sha256 digests.');
      }
      return entry;
    })
    .sort(compareStrings);
}

function trustedSourcesFromEvidence(evidence) {
  const sources = [];
  if (typeof evidence.matrixRevision === 'string' && evidence.matrixRevision) {
    sources.push(`capability-matrix:${evidence.matrixRevision}`);
  }
  for (const row of Array.isArray(evidence.hostEvidence) ? evidence.hostEvidence : []) {
    if (row?.hostId && row?.version) sources.push(`host-probe:${row.hostId}:${row.version}`);
  }
  return [...new Set(sources)].sort(compareStrings);
}

function assertUnique(entries, field, code) {
  const seen = new Set();
  for (const entry of entries) {
    const identity = entry?.[field];
    if (!identity || seen.has(identity)) {
      throw plannerError(code, `Duplicate ${field}.`, { [field]: identity ?? null });
    }
    seen.add(identity);
  }
}

function codeForTargetRefusal(code) {
  return code === 'ownership-collision'
    ? 'agent_target_ownership_collision'
    : `agent_target_${String(code ?? 'refused').replaceAll('-', '_')}`;
}

function assertPlan(plan) {
  if (
    !plan
    || typeof plan !== 'object'
    || typeof plan.planDigest !== 'string'
    || typeof plan.planBindingDigest !== 'string'
  ) {
    throw plannerError('agent_plan_invalid', 'Installation plan is required.');
  }
}

function plannerError(code, message, details = {}) {
  return new AgentInstallerError(code, message, {
    effectCertainty: 'none',
    details
  });
}

function compareBy(field) {
  return (left, right) => compareStrings(String(left?.[field] ?? ''), String(right?.[field] ?? ''));
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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
