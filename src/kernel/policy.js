import { evaluateCompatibilityGate } from './compatibility.js';

const TASK_MUTATIONS = new Set(['task.start', 'task.stop', 'task.restart', 'task.run']);

export function evaluateOperationPolicy(input = {}) {
  const definition = input.definition;
  const operationName = definition?.name ?? 'unknown';
  const projectScope = input.projectContext?.status ?? 'unconfigured';
  const risk = normalizeRisk(input.task?.risk, definition);
  const ownership = normalizeOwnership(input.ownership, operationName);
  const compatibility = evaluateCompatibilityGate(definition, input.compatibility ?? {
    canRead: false,
    canWrite: false,
    diagnosticOnly: true
  });

  if (!definition) return refusal('operation_not_supported', risk, ownership, projectScope, compatibility);
  if (requiresProject(definition) && projectScope !== 'resolved') {
    return refusal('scope_not_resolved', risk, ownership, projectScope, compatibility);
  }
  if (!compatibility.allowed) {
    return refusal(compatibility.code, risk, ownership, projectScope, compatibility);
  }
  if (definition.kind === 'mutation' || definition.kind === 'recovery') {
    if (risk !== 'low') return refusal('risk_not_low', risk, ownership, projectScope, compatibility);
    if (requiresVerifiedOwnership(operationName) && ownership !== 'verified') {
      return refusal('ownership_not_verified', risk, ownership, projectScope, compatibility);
    }
  }

  return Object.freeze({
    allowed: true,
    decision: 'allowed',
    code: 'allowed',
    risk,
    ownership,
    projectScope,
    compatibility
  });
}

function refusal(code, risk, ownership, projectScope, compatibility) {
  return Object.freeze({
    allowed: false,
    decision: 'refused',
    code,
    risk,
    ownership,
    projectScope,
    compatibility
  });
}

function normalizeRisk(taskRisk, definition) {
  if (definition?.kind === 'query') return 'none';
  const normalized = String(taskRisk ?? 'unknown').toLowerCase();
  return ['low', 'medium', 'high', 'destructive'].includes(normalized) ? normalized : 'unknown';
}

function normalizeOwnership(ownership, operationName) {
  if (!requiresVerifiedOwnership(operationName)) return 'not_required';
  const normalized = String(ownership?.classification ?? ownership ?? 'unknown').toLowerCase();
  if (normalized === 'verified_owned') return 'verified';
  if (['verified', 'unknown', 'external', 'mismatch'].includes(normalized)) return normalized;
  return 'unknown';
}

function requiresVerifiedOwnership(operationName) {
  return TASK_MUTATIONS.has(operationName);
}

function requiresProject(definition) {
  return ![
    'capabilities.get',
    'system.diagnose',
    'project.list',
    'operation.get',
    'operation.reconcile'
  ].includes(definition.name);
}
