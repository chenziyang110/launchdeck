import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createAgentSurfaceFixture } from '../helpers/agent-surface-fixture.js';
import { connectLaunchdeckMcp, requireAgentResult } from '../helpers/mcp-client.js';

test('concurrent matching MCP starts serialize effects and converge on one managed run', async (t) => {
  const fixture = await registeredFixture('mcp-concurrent-start');
  t.after(() => fixture.cleanup());
  const leftMcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
  t.after(() => leftMcp.close());
  const rightMcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
  t.after(() => rightMcp.close());

  const [leftCall, rightCall] = await Promise.all([
    leftMcp.callTool('task.start', { projectRef: fixture.projectAlias, taskRef: 'managed' }),
    rightMcp.callTool('task.start', { projectRef: fixture.projectAlias, taskRef: 'managed' })
  ]);
  assert.equal(leftCall.isError, false);
  assert.equal(rightCall.isError, false);
  const left = requireAgentResult(leftCall, { operation: 'task.start', outcome: 'succeeded' });
  const right = requireAgentResult(rightCall, { operation: 'task.start', outcome: 'succeeded' });
  assert.equal(left.resource.runId, right.resource.runId);
  assert.deepEqual(
    [left.outcome.reusedExistingRun, right.outcome.reusedExistingRun].sort(),
    [false, true]
  );
  assert.deepEqual(
    [left.effects.changed, right.effects.changed].sort(),
    [false, true]
  );
  const receipts = fs.readFileSync(fixture.spawnReceiptPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  assert.equal(receipts.length, 1);
  assert.equal(JSON.parse(receipts[0]).runId, left.resource.runId);

  for (const mcp of [leftMcp, rightMcp]) {
    const responseIds = mcp.stdoutFrames()
      .filter((frame) => frame.id !== undefined)
      .map((frame) => frame.id);
    assert.equal(new Set(responseIds).size, responseIds.length);
  }
});

test('closing and restarting the MCP adapter leaves the managed run alive and never replays start', async (t) => {
  const fixture = await registeredFixture('mcp-restart-adapter');
  t.after(() => fixture.cleanup());
  const firstMcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
  const startedCall = await firstMcp.callTool('task.start', {
    projectRef: fixture.projectAlias,
    taskRef: 'managed'
  });
  const started = requireAgentResult(startedCall, { operation: 'task.start', outcome: 'succeeded' });
  await firstMcp.close();

  const localStatus = fixture.runCliJson(['ps']);
  assert.equal(localStatus.status, 0, localStatus.stderr);
  const processInfo = localStatus.json.processes.find((entry) => entry.task === 'managed');
  assert.equal(processInfo.runId, started.resource.runId);
  assert.equal(processInfo.status, 'running');

  const secondMcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
  t.after(() => secondMcp.close());
  const reusedCall = await secondMcp.callTool('task.start', {
    projectRef: fixture.projectAlias,
    taskRef: 'managed'
  });
  const reused = requireAgentResult(reusedCall, { operation: 'task.start', outcome: 'succeeded' });
  assert.equal(reused.resource.runId, started.resource.runId);
  assert.equal(reused.outcome.reusedExistingRun, true);
  assert.equal(reused.effects.changed, false);
  const receipts = fs.readFileSync(fixture.spawnReceiptPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  assert.equal(receipts.length, 1);
});

async function registeredFixture(alias) {
  const fixture = await createAgentSurfaceFixture();
  const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', alias]);
  assert.equal(added.status, 0, added.stderr);
  return { ...fixture, projectAlias: alias };
}
