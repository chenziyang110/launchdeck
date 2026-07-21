import fs from 'node:fs';
import { OPERATION_REGISTRY } from '../kernel/operation-registry.js';

const bundledOperationSchema = typeof __LAUNCHDECK_AGENT_OPERATIONS_SCHEMA__ !== 'undefined'
  ? __LAUNCHDECK_AGENT_OPERATIONS_SCHEMA__
  : null;
const operationSchema = bundledOperationSchema ?? JSON.parse(
  fs.readFileSync(new URL('../../schema/agent-operations.schema.json', import.meta.url), 'utf8')
);

const DESCRIPTIONS = Object.freeze({
  'capabilities.get': 'Report Launchdeck Agent operations, compatibility, and runtime provenance.',
  'system.diagnose': 'Run bounded Launchdeck runtime and integration diagnostics.',
  'project.list': 'List projects registered in the Launchdeck user control plane.',
  'project.inspect': 'Inspect bounded project, task, run, port, PID, or conflict evidence.',
  'adoption.inspect': 'Inspect a registered project and propose configuration without applying changes.',
  'task.list': 'List configured tasks for an explicitly resolved project.',
  'task.status': 'Read the current status of a configured project task.',
  'task.logs.read': 'Read a bounded page of task log lines.',
  'task.events.read': 'Read a bounded page of lifecycle events.',
  'task.start': 'Start a low-risk managed task, reusing a matching active run.',
  'task.stop': 'Stop a low-risk task only when Launchdeck ownership is verified.',
  'task.restart': 'Restart a low-risk task under the shared lifecycle locks.',
  'task.run': 'Run a low-risk finite task and return its bounded output.',
  'operation.list': 'Correlate operation journal records in a bounded time window.',
  'operation.get': 'Read one durable operation journal record.',
  'operation.reconcile': 'Reconcile an indeterminate operation from evidence without replaying it.',
  'clean.plan': 'Preview the canonical safe-clean plan without deleting files.',
  'clean.applySafe': 'Apply a previously previewed low-risk safe-clean plan by digest.'
});

export function projectAgentTools() {
  return OPERATION_REGISTRY.map((definition) => Object.freeze({
    name: definition.name,
    description: DESCRIPTIONS[definition.name] ?? `Execute Launchdeck operation ${definition.name}.`,
    inputSchema: operationInputSchema(definition.inputSchemaRef),
    annotations: Object.freeze({
      readOnlyHint: definition.kind === 'query',
      destructiveHint: false,
      idempotentHint: definition.kind === 'query' || definition.name !== 'task.run',
      openWorldHint: false
    })
  }));
}

export const AGENT_TOOLS = Object.freeze(projectAgentTools());

function operationInputSchema(schemaRef) {
  const requestSchema = resolveSchema({ $ref: schemaRef });
  const inputSchema = requestSchema?.properties?.input;
  if (!inputSchema) throw new TypeError(`Operation schema ${schemaRef} does not expose an input object.`);
  const resolved = resolveSchema(inputSchema);
  if (resolved.type !== 'object' || resolved.additionalProperties !== false) {
    throw new TypeError(`Operation schema ${schemaRef} must project a closed input object.`);
  }
  return Object.freeze(resolved);
}

function resolveSchema(value, ancestors = new Set()) {
  if (Array.isArray(value)) return value.map((entry) => resolveSchema(entry, ancestors));
  if (!value || typeof value !== 'object') return value;

  if (typeof value.$ref === 'string') {
    const target = localReference(value.$ref);
    if (ancestors.has(value.$ref)) throw new TypeError(`Circular local schema reference: ${value.$ref}`);
    const nextAncestors = new Set(ancestors).add(value.$ref);
    const { $ref: _ref, ...siblings } = value;
    return resolveSchema(deepMerge(target, siblings), nextAncestors);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, resolveSchema(entry, ancestors)])
  );
}

function localReference(reference) {
  if (!reference.startsWith('#/')) throw new TypeError(`Only local operation schema references are supported: ${reference}`);
  let current = operationSchema;
  for (const segment of reference.slice(2).split('/')) {
    current = current?.[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  if (!current) throw new TypeError(`Operation schema reference was not found: ${reference}`);
  return current;
}

function deepMerge(base, overlay) {
  if (!isObject(base) || !isObject(overlay)) return clone(overlay);
  const merged = clone(base);
  for (const [key, value] of Object.entries(overlay)) {
    merged[key] = isObject(merged[key]) && isObject(value)
      ? deepMerge(merged[key], value)
      : clone(value);
  }
  return merged;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
