import assert from 'node:assert/strict';
import test from 'node:test';
import {
  digestAgentOperationRequest,
  validateAgentOperationRequest
} from '../../src/kernel/operation-registry.js';

const VALID_REQUESTS = Object.freeze([
  { operation: 'capabilities.get', input: {} },
  { operation: 'system.diagnose', input: { checks: ['runtime', 'transport'] } },
  { operation: 'project.list', input: { limit: 80 } },
  { operation: 'project.inspect', input: { projectRef: 'project-a', target: { kind: 'port', value: 43123 } } },
  { operation: 'adoption.inspect', input: { maxDepth: 4, maxFiles: 200, signals: ['package', 'scripts'] } },
  { operation: 'task.list', input: { projectRef: 'project-a', limit: 80 } },
  { operation: 'task.status', input: { projectRef: 'project-a', taskRef: 'dev' } },
  { operation: 'task.logs.read', input: { taskRef: 'dev', limit: 80, maxBytes: 32768 } },
  { operation: 'task.events.read', input: { projectRef: 'project-a', limit: 80, windowSeconds: 900 } },
  { operation: 'task.start', input: { taskRef: 'dev' } },
  { operation: 'task.stop', input: { projectRef: 'project-a', taskRef: 'dev' } },
  { operation: 'task.restart', input: { projectRef: 'project-a', taskRef: 'dev' } },
  { operation: 'task.run', input: { taskRef: 'test', output: 'summary' } },
  {
    operation: 'operation.list',
    input: {
      projectRef: 'project-a',
      operationName: 'task.start',
      createdAfter: '2026-07-20T00:00:00.000Z',
      createdBefore: '2026-07-20T00:15:00.000Z',
      states: ['indeterminate'],
      limit: 20
    }
  },
  { operation: 'operation.get', input: { operationId: 'op_0123456789abcdef' } },
  { operation: 'operation.reconcile', input: { operationId: 'op_0123456789abcdef' } },
  { operation: 'clean.plan', input: { projectRef: 'project-a' } },
  { operation: 'clean.applySafe', input: { projectRef: 'project-a', planDigest: `sha256:${'a'.repeat(64)}` } }
]);

const FORBIDDEN_FIELDS = Object.freeze([
  'command',
  'shell',
  'env',
  'cwd',
  'force',
  'yes',
  'confirmed',
  'confirmation',
  'approvalToken',
  'projectRoot',
  'path',
  'follow',
  'risk'
]);

test('closed input catalog accepts one representative request for every operation', () => {
  assert.equal(VALID_REQUESTS.length, 18);

  for (const request of VALID_REQUESTS) {
    const validation = validateAgentOperationRequest(request);
    assert.equal(validation.ok, true, `${request.operation}: ${JSON.stringify(validation.errors)}`);
    assert.deepEqual(validation.errors, []);
  }
});

test('closed input catalog rejects unknown and deferred operations', () => {
  for (const operation of ['adoption.apply', 'task.forceStop', 'project.remove', 'clean.applyAll', 'shell.run']) {
    const validation = validateAgentOperationRequest({ operation, input: {} });
    assert.equal(validation.ok, false, operation);
    assert.ok(validation.errors.some((error) => error.code === 'operation_not_supported'), operation);
  }
});

test('public mutation inputs reject command, environment, force, confirmation, and path fields recursively', () => {
  for (const field of FORBIDDEN_FIELDS) {
    const topLevel = validateAgentOperationRequest({
      operation: 'task.start',
      input: { taskRef: 'dev', [field]: field === 'env' ? { SECRET: 'value' } : true }
    });
    assert.equal(topLevel.ok, false, `input.${field}`);

    const nested = validateAgentOperationRequest({
      operation: 'project.inspect',
      input: { target: { kind: 'task', value: 'dev', [field]: true } }
    });
    assert.equal(nested.ok, false, `input.target.${field}`);
  }
});

test('bounded observations and recovery queries refuse broad or malformed inputs', () => {
  const invalidRequests = [
    { operation: 'task.logs.read', input: { taskRef: 'dev', limit: 201 } },
    { operation: 'task.logs.read', input: { taskRef: 'dev', maxBytes: 65537 } },
    { operation: 'task.events.read', input: { limit: 20 } },
    { operation: 'operation.list', input: { projectRef: 'p', operationName: 'task.start', createdAfter: 'bad', createdBefore: 'bad', states: ['running'], limit: 21 } },
    { operation: 'operation.get', input: { operationId: 'op_short' } },
    { operation: 'clean.applySafe', input: { planDigest: 'sha256:not-a-digest' } }
  ];

  for (const request of invalidRequests) {
    assert.equal(validateAgentOperationRequest(request).ok, false, JSON.stringify(request));
  }
});

test('canonical request digest is order-independent and operation-bound', () => {
  const first = { operation: 'task.start', input: { projectRef: 'project-a', taskRef: 'dev' } };
  const reordered = { input: { taskRef: 'dev', projectRef: 'project-a' }, operation: 'task.start' };
  const different = { operation: 'task.stop', input: { projectRef: 'project-a', taskRef: 'dev' } };

  assert.match(digestAgentOperationRequest(first), /^sha256:[0-9a-f]{64}$/);
  assert.equal(digestAgentOperationRequest(first), digestAgentOperationRequest(reordered));
  assert.notEqual(digestAgentOperationRequest(first), digestAgentOperationRequest(different));
});
