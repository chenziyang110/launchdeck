import { z } from 'zod';

export const AGENT_RESULT_FIELDS = Object.freeze([
  'protocolVersion',
  'operation',
  'outcome',
  'resource',
  'effects',
  'safety',
  'error',
  'nextActions',
  'provenance'
]);

const sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const codeSchema = z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/);
const agentResultSchema = z.strictObject({
  protocolVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/),
  operation: z.strictObject({
    id: z.string().regex(/^(?:op|req)_[A-Za-z0-9_-]{16,128}$/),
    name: z.string().regex(/^[a-z][a-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/),
    inputDigest: sha256Schema,
    journalStatus: z.enum(['not_applicable', 'unavailable', 'prepared', 'running', 'succeeded', 'failed', 'refused', 'indeterminate', 'reconciled'])
  }),
  outcome: z.strictObject({
    kind: z.enum(['succeeded', 'failed', 'partial', 'refused', 'indeterminate']),
    code: codeSchema,
    message: z.string().max(2048),
    reusedExistingRun: z.boolean()
  }),
  resource: z.strictObject({
    kind: z.enum(['capabilities', 'diagnostic', 'projectCollection', 'project', 'inspection', 'adoptionPlan', 'taskCollection', 'task', 'run', 'logPage', 'eventPage', 'operationCollection', 'operation', 'cleanPlan', 'cleanResult']),
    id: z.string().max(256).nullable(),
    status: z.enum(['available', 'healthy', 'degraded', 'configured', 'unconfigured', 'missing', 'ambiguous', 'idle', 'prepared', 'starting', 'running', 'ready', 'stopping', 'stopped', 'completed', 'failed', 'partial', 'stale', 'unknown', 'external', 'planned', 'applied', 'unchanged', 'indeterminate', 'reconciled', 'refused']),
    projectRef: z.string().max(256).nullable(),
    taskRef: z.string().max(128).nullable(),
    runId: z.string().max(256).nullable(),
    data: z.record(z.string(), z.unknown()).optional()
  }),
  effects: z.strictObject({
    certainty: z.enum(['none', 'confirmed', 'possible', 'unknown']),
    changed: z.boolean().nullable(),
    evidenceRefs: z.array(z.string().max(512)).max(50)
  }).superRefine((effects, context) => {
    if (effects.certainty === 'none' && effects.changed !== false) {
      context.addIssue({ code: 'custom', path: ['changed'], message: 'No effects requires changed=false.' });
    }
    if (effects.certainty === 'confirmed' && typeof effects.changed !== 'boolean') {
      context.addIssue({ code: 'custom', path: ['changed'], message: 'Confirmed effects requires a boolean changed value.' });
    }
  }),
  safety: z.strictObject({
    risk: z.enum(['none', 'low', 'medium', 'high', 'destructive', 'unknown']),
    decision: z.enum(['allowed', 'refused', 'not_applicable']),
    ownership: z.enum(['verified', 'not_required', 'unknown', 'external', 'mismatch']),
    projectScope: z.enum(['resolved', 'not_required', 'missing', 'ambiguous', 'out_of_scope', 'unconfigured'])
  }),
  error: z.union([
    z.null(),
    z.strictObject({
      code: codeSchema,
      message: z.string().max(2048),
      details: z.record(z.string(), z.unknown())
    })
  ]),
  nextActions: z.array(z.strictObject({
    kind: z.enum(['inspect', 'read', 'reconcile', 'resolve_scope', 'fix_config', 'upgrade_component', 'view_logs', 'view_events', 'manual_action']),
    label: z.string().max(200),
    operationName: z.string().max(128).nullable(),
    input: z.record(z.string(), z.unknown()).nullable(),
    reason: z.string().max(512)
  })).max(5),
  provenance: z.strictObject({
    surface: z.enum(['cli', 'mcp']),
    host: z.enum(['standalone', 'codex', 'claude', 'unknown']),
    runtimeKind: z.enum(['package-cli', 'package-mcp', 'plugin-bundled-mcp']),
    runtimeVersion: z.string().max(128),
    runtimePath: z.string().max(4096),
    stateHome: z.string().max(4096),
    buildIdentity: sha256Schema,
    agentProtocolVersion: z.string().max(128),
    cliSchemaVersion: z.union([z.literal(1), z.null()])
  })
});

export function validateAgentOperationResult(value) {
  const parsed = agentResultSchema.safeParse(value);
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

export function normalizeAgentOperationResult(value) {
  const validation = validateAgentOperationResult(value);
  if (!validation.ok) {
    throw new TypeError(`Invalid AgentOperationResult: ${JSON.stringify(validation.errors)}`);
  }
  const result = validation.value;
  return Object.fromEntries(AGENT_RESULT_FIELDS.map((field) => [field, result[field]]));
}
