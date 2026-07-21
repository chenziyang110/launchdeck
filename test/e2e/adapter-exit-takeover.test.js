import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import test from 'node:test';
import { isPidRunning, readState } from '../../src/runtime.js';
import { readRunIndex } from '../../src/control-plane/runs.js';
import { createAgentSurfaceFixture } from '../helpers/agent-surface-fixture.js';
import { connectLaunchdeckMcp, requireAgentResult } from '../helpers/mcp-client.js';

test('adapter exit leaves one managed run for capabilities, inspect, logs, and safe CLI stop takeover', async () => {
  const fixture = await createAgentSurfaceFixture();
  let mcp;
  try {
    const project = register(fixture, 'adapter-exit-takeover');
    mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
    const capabilities = requireAgentResult(await mcp.callTool('capabilities.get'), {
      operation: 'capabilities.get',
      outcome: 'succeeded'
    });
    const started = requireAgentResult(await mcp.callTool('task.start', {
      projectRef: project.projectId,
      taskRef: 'managed'
    }), { operation: 'task.start', outcome: 'succeeded' });
    const runId = started.resource.runId;
    const processInfo = readState(fixture.projectRoot).processes.managed;
    const identity = {
      runId,
      pid: processInfo.pid,
      ports: processInfo.ports,
      stateHome: capabilities.provenance.stateHome
    };
    assert.equal(identity.stateHome, fixture.homeDir);
    assert.equal(readReceipts(fixture.spawnReceiptPath).length, 1);

    await mcp.close();
    mcp = null;
    assert.equal(isPidRunning(identity.pid), true);
    assert.equal(readState(fixture.projectRoot).processes.managed.runId, identity.runId);
    assert.equal(readRunIndex(fixture.env).runs.find((run) => run.runId === identity.runId)?.pid, identity.pid);

    const cliCapabilities = fixture.runGlobalCliJson(['capabilities']);
    assert.equal(cliCapabilities.status, 0, cliCapabilities.stderr);
    assert.equal(cliCapabilities.json.data.agentResult.provenance.stateHome, identity.stateHome);
    assert.equal(cliCapabilities.json.data.agentResult.provenance.buildIdentity, capabilities.provenance.buildIdentity);

    const inspected = fixture.runGlobalCliJson(['inspect', `task:${project.alias}:managed`]);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(inspected.json.data.agentResult.outcome.kind, 'succeeded');
    assert.equal(JSON.stringify(inspected.json).includes(identity.runId), true);
    assert.equal(JSON.stringify(inspected.json).includes(String(identity.pid)), true);

    const logs = fixture.runGlobalCliJson(['logs', `${project.projectId}:managed`]);
    assert.equal(logs.status, 0, logs.stderr);
    assert.match(logs.json.content, /agent-surfaces-fixture/);
    assert.equal(readReceipts(fixture.spawnReceiptPath).length, 1);

    const stopped = fixture.runGlobalCliJson(['stop', `${project.projectId}:managed`]);
    assert.equal(stopped.status, 0, stopped.stderr);
    assert.equal(stopped.json.data.agentResult.resource.runId, identity.runId);
    assert.equal(stopped.json.data.agentResult.resource.status, 'stopped');
    assert.equal(isPidRunning(identity.pid), false);
    assert.equal(await portIsAvailable(fixture.managedPort), true);
    assert.equal(readReceipts(fixture.spawnReceiptPath).length, 1);
  } finally {
    await mcp?.close().catch(() => {});
    fixture.cleanup();
  }
});

function register(fixture, alias) {
  const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', alias]);
  assert.equal(added.status, 0, added.stderr);
  return added.json.project;
}

function readReceipts(receiptPath) {
  if (!fs.existsSync(receiptPath)) return [];
  return fs.readFileSync(receiptPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
