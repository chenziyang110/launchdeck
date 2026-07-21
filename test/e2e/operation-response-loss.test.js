import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { operationJournalPaths } from '../../src/control-plane/operation-journal.js';
import { createAgentSurfaceFixture } from '../helpers/agent-surface-fixture.js';
import { requireAgentResult } from '../helpers/mcp-client.js';
import {
  connectResponseLossMcp,
  readFaultReceipt,
  runCliWithDroppedResponse
} from '../helpers/deterministic-fault-injector.js';

const RESPONSE_LOSS_RECEIPT_TIMEOUT_MS = 10_000;

test('dropped MCP response recovers by known ID and bounded lost-ID correlation without replay', async () => {
  const fixture = await createAgentSurfaceFixture();
  let mcp;
  try {
    const project = register(fixture, 'recovery-mcp-loss');
    const responseReceiptPath = path.join(fixture.homeDir, 'test-receipts', 'mcp-response.json');
    mcp = await connectResponseLossMcp({
      cwd: fixture.projectRoot,
      env: fixture.env,
      receiptPath: responseReceiptPath,
      callTimeout: 1_000
    });
    const createdAfter = new Date(Date.now() - 1_000).toISOString();
    await assert.rejects(
      mcp.callTool('task.run', { projectRef: project.projectId, taskRef: 'finite' }),
      /timed out/i
    );
    const dropped = await waitForReceipt(responseReceiptPath);
    assert.match(dropped.operationId, /^op_/);
    assert.equal(readEffectCount(fixture), 1);

    const known = requireAgentResult(await mcp.callTool('operation.get', {
      operationId: dropped.operationId
    }), { operation: 'operation.get', outcome: 'succeeded' });
    assert.equal(known.resource.data.record.operationId, dropped.operationId);
    assert.equal(known.resource.data.record.state, 'succeeded');
    assert.equal(readEffectCount(fixture), 1);

    const createdBefore = new Date(Date.now() + 1_000).toISOString();
    const correlated = requireAgentResult(await mcp.callTool('operation.list', {
      projectRef: project.projectId,
      taskRef: 'finite',
      operationName: 'task.run',
      createdAfter,
      createdBefore,
      states: ['succeeded'],
      limit: 20
    }), { operation: 'operation.list', outcome: 'succeeded' });
    assert.equal(correlated.outcome.code, 'operation_correlation_unique');
    assert.equal(correlated.resource.data.correlation.operationId, dropped.operationId);

    const reconciled = requireAgentResult(await mcp.callTool('operation.reconcile', {
      operationId: dropped.operationId
    }), { operation: 'operation.reconcile', outcome: 'succeeded' });
    assert.equal(reconciled.outcome.code, 'operation_already_terminal');
    assert.equal(readEffectCount(fixture), 1);
    assert.equal(listJournalRecords(fixture.env).length, 1);
  } finally {
    await mcp?.close().catch(() => {});
    fixture.cleanup();
  }
});

test('dropped CLI response recovers the original terminal operation through the real CLI route', async () => {
  const fixture = await createAgentSurfaceFixture();
  try {
    register(fixture, 'recovery-cli-loss');
    const responseReceiptPath = path.join(fixture.homeDir, 'test-receipts', 'cli-response.json');
    const lost = await runCliWithDroppedResponse({
      cwd: fixture.projectRoot,
      env: fixture.env,
      args: ['run', 'finite'],
      receiptPath: responseReceiptPath
    });
    assert.equal(lost.responseLost, true);
    assert.equal(lost.stdout, '');
    assert.equal(readEffectCount(fixture), 1);

    const dropped = readFaultReceipt(responseReceiptPath);
    const original = JSON.parse(dropped.stdout).data.agentResult;
    const operationId = original.operation.id;
    const recovered = fixture.runGlobalCliJson(['operation', 'get', operationId]);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(recovered.json.data.agentResult.outcome.kind, 'succeeded');
    assert.equal(recovered.json.data.record.operationId, operationId);
    assert.equal(recovered.json.data.record.state, 'succeeded');
    assert.equal(readEffectCount(fixture), 1);
    assert.equal(listJournalRecords(fixture.env).length, 1);
  } finally {
    fixture.cleanup();
  }
});

async function waitForReceipt(receiptPath) {
  const deadline = Date.now() + RESPONSE_LOSS_RECEIPT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (fs.existsSync(receiptPath)) return readFaultReceipt(receiptPath);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Fault receipt was not written: ${receiptPath}`);
}

function register(fixture, alias) {
  const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', alias]);
  assert.equal(added.status, 0, added.stderr);
  return added.json.project;
}

function readEffectCount(fixture) {
  return fs.existsSync(fixture.finiteReceiptPath('low')) ? 1 : 0;
}

function listJournalRecords(env) {
  const recordsDir = operationJournalPaths(env).recordsDir;
  return fs.existsSync(recordsDir)
    ? fs.readdirSync(recordsDir).filter((entry) => entry.endsWith('.json'))
    : [];
}
