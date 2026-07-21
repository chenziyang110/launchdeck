import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOperationJournal } from '../../src/control-plane/operation-journal.js';
import { createOperationHandlers } from '../../src/kernel/operations/operation.js';
import { validateAgentOperationRequest } from '../../src/kernel/operation-registry.js';

test('operation.list schema enforces an exact positive window no wider than 15 minutes and limit at most 20', () => {
  const base = {
    operation: 'operation.list',
    input: {
      projectRef: 'alpha',
      operationName: 'task.start',
      createdAfter: '2026-07-20T00:00:00.000Z',
      createdBefore: '2026-07-20T00:15:00.000Z',
      states: ['prepared'],
      limit: 20
    }
  };
  assert.equal(validateAgentOperationRequest(base).ok, true);
  assert.equal(validateAgentOperationRequest({
    ...base,
    input: { ...base.input, createdBefore: '2026-07-20T00:15:00.001Z' }
  }).ok, false);
  assert.equal(validateAgentOperationRequest({ ...base, input: { ...base.input, limit: 21 } }).ok, false);
  assert.equal(validateAgentOperationRequest({
    ...base,
    input: { ...base.input, createdAfter: base.input.createdBefore }
  }).ok, false);
});

test('operation correlation distinguishes zero, unique, and ambiguous without authorizing retry', async () => {
  await withJournal(async ({ journal }) => {
    const handlers = createOperationHandlers({ journal });
    const baseInput = {
      projectRef: 'alpha',
      operationName: 'task.start',
      taskRef: 'dev',
      createdAfter: '2026-07-19T23:59:59.000Z',
      createdBefore: '2026-07-20T00:00:01.000Z',
      states: ['prepared'],
      limit: 20
    };
    const context = (input = baseInput) => ({
      request: { input },
      inputs: { projectContext: { project: { projectId: 'project-a', alias: 'alpha' } } }
    });

    const zero = await handlers['operation.list'](context());
    assert.equal(zero.outcome.code, 'operation_correlation_not_found');
    assert.equal(zero.resource.data.correlation.status, 'none');
    assert.deepEqual(zero.nextActions, []);

    await journal.prepare(operationInput('op_correlation000000000001'));
    const unique = await handlers['operation.list'](context());
    assert.equal(unique.outcome.code, 'operation_correlation_unique');
    assert.equal(unique.resource.data.correlation.status, 'unique');
    assert.equal(unique.resource.data.records.length, 1);
    assert.deepEqual(unique.nextActions.map((action) => action.operationName), ['operation.get', 'operation.reconcile']);
    assert.equal(unique.nextActions.some((action) => action.operationName === 'task.start'), false);

    await journal.prepare(operationInput('op_correlation000000000002'));
    const ambiguous = await handlers['operation.list'](context());
    assert.equal(ambiguous.outcome.code, 'operation_correlation_ambiguous');
    assert.equal(ambiguous.resource.data.correlation.status, 'ambiguous');
    assert.equal(ambiguous.resource.data.records.length, 2);
    assert.deepEqual(ambiguous.nextActions, []);
    assert.equal(JSON.stringify(ambiguous).includes('task.start'), true, 'operationName may be observed');
    assert.equal(JSON.stringify(ambiguous.nextActions).includes('task.start'), false, 'ambiguous evidence cannot authorize retry');
  });
});

async function withJournal(callback) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-operation-correlation-'));
  const journal = createOperationJournal({
    env: { ...process.env, LAUNCHDECK_HOME: homeDir },
    clock: () => new Date('2026-07-20T00:00:00.000Z')
  });
  try {
    await callback({ journal, homeDir });
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

function operationInput(operationId) {
  return {
    operationId,
    operationName: 'task.start',
    definitionVersion: '1.0.0',
    inputDigest: `sha256:${operationId.endsWith('1') ? 'a'.repeat(64) : 'b'.repeat(64)}`,
    requestSummary: { projectRef: 'alpha', taskRef: 'dev' },
    projectRef: { projectId: 'project-a', alias: 'alpha' },
    taskRef: 'dev',
    runtimeProvenance: { buildIdentity: `sha256:${'c'.repeat(64)}` }
  };
}
