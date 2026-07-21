import { z } from 'zod';
import { canonicalDigest, canonicalJson } from './compatibility.js';

const PROJECT_REF = z.string().min(1).max(256);
const TASK_REF = z.string().min(1).max(128);
const CURSOR = z.string().min(1).max(512);
const OPERATION_ID = z.string().regex(/^op_[A-Za-z0-9_-]{16,128}$/);
const PLAN_DIGEST = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const RUN_ID = z.string().min(1).max(256);
const DATE_TIME = z.string().refine(isDateTime, { message: 'Expected an RFC 3339 date-time.' });

const DEFINITIONS = [
  definition('capabilities.get', 'query', 'none'),
  definition('system.diagnose', 'query', 'none'),
  definition('project.list', 'query', 'none'),
  definition('project.inspect', 'query', 'none'),
  definition('adoption.inspect', 'query', 'none'),
  definition('task.list', 'query', 'none'),
  definition('task.status', 'query', 'none'),
  definition('task.logs.read', 'query', 'none'),
  definition('task.events.read', 'query', 'none'),
  definition('task.start', 'mutation', 'low'),
  definition('task.stop', 'mutation', 'low'),
  definition('task.restart', 'mutation', 'low'),
  definition('task.run', 'mutation', 'low'),
  definition('operation.list', 'query', 'none'),
  definition('operation.get', 'query', 'none'),
  definition('operation.reconcile', 'recovery', 'low'),
  definition('clean.plan', 'query', 'none'),
  definition('clean.applySafe', 'mutation', 'low')
];

export const OPERATION_REGISTRY = Object.freeze(DEFINITIONS);
export const AGENT_OPERATION_NAMES = Object.freeze(DEFINITIONS.map((entry) => entry.name));

const DEFINITIONS_BY_NAME = new Map(DEFINITIONS.map((entry) => [entry.name, entry]));
const REQUEST_SCHEMAS = new Map([
  ['capabilities.get', request('capabilities.get', z.strictObject({ projectRef: PROJECT_REF.optional() }))],
  ['system.diagnose', request('system.diagnose', z.strictObject({
    projectRef: PROJECT_REF.optional(),
    checks: z.array(z.enum(['runtime', 'compatibility', 'state', 'registry', 'journal', 'skill', 'project', 'transport'])).max(8).refine(isUnique).optional()
  }))],
  ['project.list', request('project.list', pageInput())],
  ['project.inspect', request('project.inspect', z.strictObject({
    projectRef: PROJECT_REF.optional(),
    target: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.enum(['project', 'task', 'run', 'conflict']), value: z.string().min(1).max(256) }),
      z.strictObject({ kind: z.literal('port'), value: z.number().int().min(1).max(65535) }),
      z.strictObject({ kind: z.literal('pid'), value: z.number().int().min(1) })
    ])
  }))],
  ['adoption.inspect', request('adoption.inspect', z.strictObject({
    projectRef: PROJECT_REF.optional(),
    maxDepth: z.number().int().min(1).max(6).optional(),
    maxFiles: z.number().int().min(1).max(500).optional(),
    signals: z.array(z.enum(['package', 'scripts', 'compose', 'make', 'just', 'taskfile', 'existingConfig'])).refine(isUnique).optional()
  }))],
  ['task.list', request('task.list', z.strictObject({
    projectRef: PROJECT_REF.optional(),
    cursor: CURSOR.optional(),
    limit: z.number().int().min(1).max(200).optional()
  }))],
  ['task.status', request('task.status', taskRequiredInput())],
  ['task.logs.read', request('task.logs.read', z.strictObject({
    projectRef: PROJECT_REF.optional(),
    taskRef: TASK_REF,
    cursor: CURSOR.optional(),
    limit: z.number().int().min(1).max(200).optional(),
    maxBytes: z.number().int().min(1).max(65536).optional()
  }))],
  ['task.events.read', request('task.events.read', z.strictObject({
    projectRef: PROJECT_REF.optional(),
    taskRef: TASK_REF.optional(),
    runId: RUN_ID.optional(),
    cursor: CURSOR.optional(),
    limit: z.number().int().min(1).max(200).optional(),
    windowSeconds: z.number().int().min(1).max(86400).optional()
  }).refine((input) => input.projectRef || input.taskRef || input.runId, {
    message: 'At least one projectRef, taskRef, or runId is required.'
  }))],
  ['task.start', request('task.start', taskRequiredInput())],
  ['task.stop', request('task.stop', taskRequiredInput())],
  ['task.restart', request('task.restart', taskRequiredInput())],
  ['task.run', request('task.run', z.strictObject({
    projectRef: PROJECT_REF.optional(),
    taskRef: TASK_REF,
    output: z.enum(['none', 'summary']).optional()
  }))],
  ['operation.list', request('operation.list', z.strictObject({
    projectRef: PROJECT_REF,
    taskRef: TASK_REF.optional(),
    operationName: z.enum(['task.start', 'task.stop', 'task.restart', 'task.run', 'clean.applySafe']),
    createdAfter: DATE_TIME,
    createdBefore: DATE_TIME,
    states: z.array(z.enum(['prepared', 'running', 'succeeded', 'failed', 'refused', 'indeterminate', 'reconciled'])).min(1).refine(isUnique),
    cursor: CURSOR.optional(),
    limit: z.number().int().min(1).max(20).optional()
  }).superRefine(validateOperationWindow))],
  ['operation.get', request('operation.get', z.strictObject({ operationId: OPERATION_ID }))],
  ['operation.reconcile', request('operation.reconcile', z.strictObject({ operationId: OPERATION_ID }))],
  ['clean.plan', request('clean.plan', z.strictObject({ projectRef: PROJECT_REF.optional() }))],
  ['clean.applySafe', request('clean.applySafe', z.strictObject({
    projectRef: PROJECT_REF.optional(),
    planDigest: PLAN_DIGEST
  }))]
]);

export function listAgentOperations() {
  return [...OPERATION_REGISTRY];
}

export function getOperationDefinition(name) {
  return DEFINITIONS_BY_NAME.get(name) ?? null;
}

export function validateAgentOperationRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.operation !== 'string') {
    return failure('$', 'invalid_type', 'Operation request must be an object with an operation name.');
  }

  const schema = REQUEST_SCHEMAS.get(value.operation);
  if (!schema) return failure('$.operation', 'operation_not_supported', `Unsupported Agent operation: ${value.operation}`);

  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data, errors: [] };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => ({
      path: issue.path.length === 0 ? '$' : `$.${issue.path.join('.')}`,
      code: issue.code,
      message: issue.message
    }))
  };
}

export function canonicalizeAgentOperationRequest(value) {
  const validation = validateAgentOperationRequest(value);
  if (!validation.ok) throw new TypeError(`Invalid Agent operation request: ${JSON.stringify(validation.errors)}`);
  return canonicalJson(validation.value);
}

export function digestAgentOperationRequest(value) {
  const validation = validateAgentOperationRequest(value);
  if (!validation.ok) throw new TypeError(`Invalid Agent operation request: ${JSON.stringify(validation.errors)}`);
  return canonicalDigest(validation.value);
}

function definition(name, kind, maxAgentRisk) {
  return Object.freeze({
    name,
    kind,
    maxAgentRisk,
    agentExposed: true,
    inputSchemaRef: `#/$defs/${name}`
  });
}

function request(operation, input) {
  return z.strictObject({ operation: z.literal(operation), input });
}

function pageInput() {
  return z.strictObject({
    cursor: CURSOR.optional(),
    limit: z.number().int().min(1).max(200).optional()
  });
}

function taskRequiredInput() {
  return z.strictObject({ projectRef: PROJECT_REF.optional(), taskRef: TASK_REF });
}

function validateOperationWindow(input, context) {
  const after = Date.parse(input.createdAfter);
  const before = Date.parse(input.createdBefore);
  if (before <= after) {
    context.addIssue({ code: 'custom', path: ['createdBefore'], message: 'createdBefore must be after createdAfter.' });
  } else if (before - after > 15 * 60 * 1000) {
    context.addIssue({ code: 'custom', path: ['createdBefore'], message: 'Operation correlation window cannot exceed 15 minutes.' });
  }
}

function isDateTime(value) {
  return /T/.test(value) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

function isUnique(values) {
  return new Set(values).size === values.length;
}

function failure(path, code, message) {
  return { ok: false, errors: [{ path, code, message }] };
}
