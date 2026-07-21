import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createOperationJournal, operationJournalPaths } from '../../src/control-plane/operation-journal.js';
import { createAgentSurfaceFixture } from '../helpers/agent-surface-fixture.js';
import { connectLaunchdeckMcp, requireAgentResult } from '../helpers/mcp-client.js';

test('real correlation routes distinguish zero, unique, and ambiguous candidates without retry authority', async () => {
  await withRegisteredFixture('recovery-correlation', async ({ fixture, project, mcp }) => {
    const createdAfter = new Date(Date.now() - 1_000).toISOString();
    const zero = await correlate(mcp, project.projectId, {
      operationName: 'task.start',
      taskRef: 'managed',
      createdAfter,
      createdBefore: new Date(Date.now() + 1_000).toISOString()
    });
    assert.equal(zero.outcome.code, 'operation_correlation_not_found');
    assert.equal(zero.resource.data.records.length, 0);

    const started = requireAgentResult(await mcp.callTool('task.start', {
      projectRef: project.projectId,
      taskRef: 'managed'
    }), { operation: 'task.start', outcome: 'succeeded' });
    const unique = await correlate(mcp, project.projectId, {
      operationName: 'task.start',
      taskRef: 'managed',
      createdAfter,
      createdBefore: new Date(Date.now() + 1_000).toISOString()
    });
    assert.equal(unique.outcome.code, 'operation_correlation_unique');
    assert.equal(unique.resource.data.correlation.operationId, started.operation.id);

    await mcp.callTool('task.run', { projectRef: project.projectId, taskRef: 'finite' });
    await mcp.callTool('task.run', { projectRef: project.projectId, taskRef: 'finite' });
    const ambiguous = await correlate(mcp, project.projectId, {
      operationName: 'task.run',
      taskRef: 'finite',
      createdAfter,
      createdBefore: new Date(Date.now() + 1_000).toISOString()
    });
    assert.equal(ambiguous.outcome.code, 'operation_correlation_ambiguous');
    assert.equal(ambiguous.resource.data.records.length, 2);
    assert.equal(ambiguous.nextActions.length, 0);

    const beforeInvalid = listJournalRecords(fixture.env).length;
    const invalid = requireAgentResult(await mcp.callTool('operation.list', {
      projectRef: project.projectId,
      operationName: 'task.run',
      taskRef: 'finite',
      createdAfter,
      createdBefore: new Date(Date.now() + 16 * 60 * 1000).toISOString(),
      states: ['succeeded'],
      limit: 21
    }), { operation: 'operation.list', outcome: 'refused' });
    assert.equal(invalid.outcome.code, 'input_invalid');
    assert.equal(listJournalRecords(fixture.env).length, beforeInvalid);
  });
});

test('same ID reads original evidence while different-digest-shaped and missing recovery requests never create work', async () => {
  await withRegisteredFixture('recovery-id-cases', async ({ fixture, project, mcp }) => {
    const run = requireAgentResult(await mcp.callTool('task.run', {
      projectRef: project.projectId,
      taskRef: 'finite'
    }), { operation: 'task.run', outcome: 'succeeded' });
    const recordsBefore = listJournalRecords(fixture.env);
    const first = requireAgentResult(await mcp.callTool('operation.get', {
      operationId: run.operation.id
    }), { operation: 'operation.get', outcome: 'succeeded' });
    const second = requireAgentResult(await mcp.callTool('operation.get', {
      operationId: run.operation.id
    }), { operation: 'operation.get', outcome: 'succeeded' });
    assert.equal(first.resource.data.record.inputDigest, run.operation.inputDigest);
    assert.deepEqual(second.resource.data.record, first.resource.data.record);

    const differentDigestShape = requireAgentResult(await mcp.callTool('operation.get', {
      operationId: run.operation.id,
      inputDigest: `sha256:${'0'.repeat(64)}`
    }), { operation: 'operation.get', outcome: 'refused' });
    assert.equal(differentDigestShape.outcome.code, 'input_invalid');
    assert.deepEqual(listJournalRecords(fixture.env), recordsBefore);

    const missingId = 'op_0123456789abcdef';
    const missing = requireAgentResult(await mcp.callTool('operation.get', {
      operationId: missingId
    }), { operation: 'operation.get' });
    const cliMissing = fixture.runGlobalCliJson(['operation', 'get', missingId]);
    const recordsAfterMissing = listJournalRecords(fixture.env);

    fs.rmSync(operationJournalPaths(fixture.env).recordPath(run.operation.id));
    const expired = requireAgentResult(await mcp.callTool('operation.get', {
      operationId: run.operation.id
    }), { operation: 'operation.get' });
    const cliExpired = fixture.runGlobalCliJson(['operation', 'get', run.operation.id]);
    assert.deepEqual({
      mcpMissing: { kind: missing.outcome.kind, code: missing.outcome.code },
      cliMissing: cliOutcome(cliMissing),
      mcpExpired: { kind: expired.outcome.kind, code: expired.outcome.code },
      cliExpired: cliOutcome(cliExpired)
    }, {
      mcpMissing: { kind: 'failed', code: 'operation_record_missing_or_expired' },
      cliMissing: { kind: 'failed', code: 'operation_record_missing_or_expired' },
      mcpExpired: { kind: 'failed', code: 'operation_record_missing_or_expired' },
      cliExpired: { kind: 'failed', code: 'operation_record_missing_or_expired' }
    });
    assert.deepEqual(recordsAfterMissing, recordsBefore);
    assert.equal(listJournalRecords(fixture.env).includes(`${run.operation.id}.json`), false);
  });
});

test('indeterminate foreground evidence remains non-replayable through real MCP and CLI reconciliation', async () => {
  const fixture = await createAgentSurfaceFixture();
  let mcp;
  try {
    const project = register(fixture, 'recovery-indeterminate');
    const journal = createOperationJournal({ env: fixture.env });
    const operationId = 'op_indeterminate0001';
    const inputDigest = `sha256:${'1'.repeat(64)}`;
    const prepared = await journal.prepare({
      operationId,
      operationName: 'task.run',
      definitionVersion: '1.0.0',
      inputDigest,
      requestSummary: { projectRef: project.projectId, taskRef: 'finite' },
      projectRef: { projectId: project.projectId, alias: project.alias },
      taskRef: 'finite',
      runtimeProvenance: { surface: 'mcp' }
    });
    const running = await journal.transition(operationId, {
      expectedRevision: prepared.record.revision,
      to: 'running'
    });
    await journal.transition(operationId, {
      expectedRevision: running.revision,
      to: 'indeterminate',
      effectsCertainty: 'unknown',
      effectEvidenceRefs: ['counter:foreground=1'],
      lastError: { code: 'task_completion_unknown', message: 'Response channel lost.' }
    });
    const counterPath = fixture.path('artifacts', 'finite', 'indeterminate-count.txt');
    fs.mkdirSync(path.dirname(counterPath), { recursive: true });
    fs.writeFileSync(counterPath, '1\n');

    mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
    const mcpResult = requireAgentResult(await mcp.callTool('operation.reconcile', {
      operationId
    }), { operation: 'operation.reconcile', outcome: 'indeterminate' });
    assert.equal(mcpResult.outcome.code, 'operation_still_indeterminate');
    assert.equal(fs.readFileSync(counterPath, 'utf8'), '1\n');

    const cli = fixture.runGlobalCliJson(['operation', 'reconcile', operationId]);
    assert.equal(cli.json.data.agentResult.outcome.kind, 'indeterminate');
    assert.equal(fs.readFileSync(counterPath, 'utf8'), '1\n');
    assert.deepEqual(listJournalRecords(fixture.env), [`${operationId}.json`]);
  } finally {
    await mcp?.close().catch(() => {});
    fixture.cleanup();
  }
});

async function correlate(mcp, projectRef, input) {
  return requireAgentResult(await mcp.callTool('operation.list', {
    projectRef,
    operationName: input.operationName,
    taskRef: input.taskRef,
    createdAfter: input.createdAfter,
    createdBefore: input.createdBefore,
    states: ['prepared', 'running', 'succeeded', 'failed', 'refused', 'indeterminate', 'reconciled'],
    limit: 20
  }), { operation: 'operation.list', outcome: 'succeeded' });
}

async function withRegisteredFixture(alias, callback) {
  const fixture = await createAgentSurfaceFixture();
  let mcp;
  try {
    const project = register(fixture, alias);
    mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
    await callback({ fixture, project, mcp });
  } finally {
    await mcp?.close().catch(() => {});
    fixture.cleanup();
  }
}

function register(fixture, alias) {
  const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', alias]);
  assert.equal(added.status, 0, added.stderr);
  return added.json.project;
}

function listJournalRecords(env) {
  const recordsDir = operationJournalPaths(env).recordsDir;
  return fs.existsSync(recordsDir)
    ? fs.readdirSync(recordsDir).filter((entry) => entry.endsWith('.json')).sort()
    : [];
}

function cliOutcome(command) {
  const outcome = command.json?.data?.agentResult?.outcome;
  return outcome ? { kind: outcome.kind, code: outcome.code } : null;
}
