import path from 'node:path';
import { digestCanonical } from './digests.js';
import { AgentInstallerError } from './errors.js';

const OPERATIONS = new Set(['setup', 'update', 'repair', 'uninstall']);
const SCOPES = new Set(['project', 'user']);
const HOST_IDS = new Set(['codex', 'claude', 'copilot', 'visual-studio']);
const COMPONENTS = new Set(['runtime', 'skill', 'mcp']);
const PLAN_STATES = new Set([
  'discovering',
  'plan-ready',
  'awaiting-approval',
  'cancelled',
  'applying'
]);
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PLAN_ID_PATTERN = /^plan_[A-Za-z0-9_-]{16,128}$/;

export function normalizeDesiredInstallation(input = {}) {
  const operation = requireMember(input.operation, OPERATIONS, 'agent_operation_invalid');
  const scope = requireMember(input.scope, SCOPES, 'agent_scope_invalid');
  const projectIdentity = normalizeProjectIdentity(input.projectIdentity, scope);
  const hostIds = normalizeSelection(input.hostIds, HOST_IDS, 'host');
  const components = normalizeSelection(input.components, COMPONENTS, 'component');
  const desiredBuildIdentity = requireDigest(input.desiredBuildIdentity, 'desiredBuildIdentity');
  const sourceIdentity = requireText(input.sourceIdentity, 'sourceIdentity');
  const normalized = {
    operation,
    scope,
    projectIdentity,
    hostIds,
    components,
    desiredBuildIdentity,
    sourceIdentity,
    interactive: requireBoolean(input.interactive, 'interactive'),
    approved: requireBoolean(input.approved, 'approved'),
    dryRun: requireBoolean(input.dryRun, 'dryRun'),
    force: requireBoolean(input.force, 'force')
  };
  return deepFreeze({
    ...normalized,
    inputDigest: digestCanonical(normalized)
  });
}

export function normalizeInstallationPlan(input = {}) {
  const planId = requirePattern(input.planId, PLAN_ID_PATTERN, 'agent_plan_id_invalid');
  const desiredInstallationDigest = requireDigest(
    input.desiredInstallationDigest,
    'desiredInstallationDigest'
  );
  const matrixRevision = requireDigest(input.matrixRevision, 'matrixRevision');
  const buildIdentity = requireDigest(input.buildIdentity, 'buildIdentity');
  const state = requireMember(input.state, PLAN_STATES, 'agent_plan_state_invalid');
  const targets = normalizeIdentifiedArray(input.targets, 'targetId', 'agent_plan_target_invalid');
  const actions = normalizeIdentifiedArray(input.actions, 'actionId', 'agent_plan_action_invalid');
  const targetIds = new Set(targets.map((target) => target.targetId));
  for (const action of actions) {
    if (!targetIds.has(action.targetId)) {
      throw modelError('agent_plan_action_invalid', `Action '${action.actionId}' has no target.`);
    }
  }
  const requiredHostActions = normalizeTextArray(input.requiredHostActions, 'requiredHostActions');
  const trustedSources = normalizeTextArray(input.trustedSources, 'trustedSources');
  const effectsPreview = normalizePlainObject(input.effectsPreview, 'effectsPreview');
  const normalized = {
    planId,
    desiredInstallationDigest,
    matrixRevision,
    buildIdentity,
    state,
    targets,
    actions,
    requiredHostActions,
    trustedSources,
    effectsPreview
  };
  return deepFreeze({
    ...normalized,
    planDigest: digestCanonical(normalized)
  });
}

function normalizeProjectIdentity(value, scope) {
  if (scope === 'project') {
    if (typeof value !== 'string' || !value.trim()) {
      throw modelError(
        'agent_project_identity_required',
        'Project scope requires a canonical project identity.'
      );
    }
    return path.resolve(value);
  }
  if (value !== null && value !== undefined && value !== '') {
    throw modelError(
      'agent_project_identity_forbidden',
      'User scope cannot impersonate a project identity.'
    );
  }
  return null;
}

function normalizeSelection(values, allowed, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw modelError('agent_selection_ambiguous', `At least one ${label} must be selected.`);
  }
  const normalized = [...new Set(values.map((value) => String(value).trim()))].sort();
  if (normalized.some((value) => !allowed.has(value))) {
    throw modelError('agent_selection_unsupported', `Unsupported ${label} selection.`);
  }
  return normalized;
}

function normalizeIdentifiedArray(value, identityField, code) {
  if (!Array.isArray(value)) throw modelError(code, `${identityField} collection is required.`);
  const entries = value.map((entry) => {
    const normalized = normalizePlainObject(entry, identityField);
    requireText(normalized[identityField], identityField);
    return normalized;
  });
  const identities = entries.map((entry) => entry[identityField]);
  if (new Set(identities).size !== identities.length) {
    throw modelError(code, `Duplicate ${identityField}.`);
  }
  return entries.sort((left, right) =>
    left[identityField].localeCompare(right[identityField])
  );
}

function normalizeTextArray(value, label) {
  if (!Array.isArray(value)) throw modelError('agent_plan_invalid', `${label} must be an array.`);
  return value.map((entry) => requireText(entry, label));
}

function normalizePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw modelError('agent_plan_invalid', `${label} must be an object.`);
  }
  return structuredClone(value);
}

function requireDigest(value, label) {
  return requirePattern(value, DIGEST_PATTERN, 'agent_digest_invalid', label);
}

function requirePattern(value, pattern, code, label = 'value') {
  const normalized = String(value ?? '');
  if (!pattern.test(normalized)) throw modelError(code, `${label} is invalid.`);
  return normalized;
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw modelError('agent_model_invalid', `${label} is required.`);
  return normalized;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw modelError('agent_model_invalid', `${label} must be boolean.`);
  }
  return value;
}

function requireMember(value, allowed, code) {
  const normalized = String(value ?? '');
  if (!allowed.has(normalized)) throw modelError(code, `Invalid value '${normalized}'.`);
  return normalized;
}

function modelError(code, message) {
  return new AgentInstallerError(code, message, { effectCertainty: 'none' });
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
