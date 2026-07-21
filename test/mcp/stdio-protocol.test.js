import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { AGENT_OPERATION_NAMES } from '../../src/kernel/operation-registry.js';
import { createAgentSurfaceFixture } from '../helpers/agent-surface-fixture.js';
import { connectLaunchdeckMcp, requireAgentResult } from '../helpers/mcp-client.js';

const QUERY_OPERATIONS = new Set([
  'capabilities.get',
  'system.diagnose',
  'project.list',
  'project.inspect',
  'adoption.inspect',
  'task.list',
  'task.status',
  'task.logs.read',
  'task.events.read',
  'operation.list',
  'operation.get',
  'clean.plan'
]);

test('official SDK initializes the real server and lists exactly 18 closed registry-projected tools', async (t) => {
  const fixture = await registeredFixture('mcp-protocol-list');
  t.after(() => fixture.cleanup());
  const mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
  t.after(() => mcp.close());

  assert.equal(typeof mcp.serverVersion?.name, 'string');
  assert.equal(typeof mcp.serverVersion?.version, 'string');
  assert.equal(typeof mcp.serverCapabilities?.tools, 'object');
  const listed = await mcp.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    [...AGENT_OPERATION_NAMES].sort()
  );
  assert.equal(listed.tools.length, 18);

  for (const tool of listed.tools) {
    assert.equal(tool.inputSchema.type, 'object', tool.name);
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    assert.equal(typeof tool.description, 'string', tool.name);
    assert.equal(tool.description.length > 0, true, tool.name);
    assert.equal(tool.annotations?.readOnlyHint, QUERY_OPERATIONS.has(tool.name), tool.name);
    assert.equal(tool.annotations?.destructiveHint, false, tool.name);
    assert.equal(tool.annotations?.openWorldHint, false, tool.name);
  }

  assertProtocolFrames(mcp.stdoutFrames());
  assert.equal(mcp.transportErrors.length, 0);
});

test('real tools/call separates success tool and domain errors with complete structured results', async (t) => {
  const fixture = await registeredFixture('mcp-protocol-calls');
  t.after(() => fixture.cleanup());
  const mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
  t.after(() => mcp.close());

  const capabilitiesCall = await mcp.callTool('capabilities.get');
  assert.equal(capabilitiesCall.isError, false);
  const capabilities = requireAgentResult(capabilitiesCall, {
    operation: 'capabilities.get',
    outcome: 'succeeded'
  });
  assert.deepEqual(capabilities.resource.data.agentOperations, [...AGENT_OPERATION_NAMES]);
  assert.equal(capabilities.provenance.surface, 'mcp');
  assert.equal(capabilities.provenance.cliSchemaVersion, null);

  const statusCall = await mcp.callTool('task.status', {
    projectRef: fixture.projectAlias,
    taskRef: 'managed'
  });
  assert.equal(statusCall.isError, false);
  requireAgentResult(statusCall, { operation: 'task.status', outcome: 'succeeded' });

  const mediumReceipt = fixture.finiteReceiptPath('medium');
  const mediumCall = await mcp.callTool('task.run', {
    projectRef: fixture.projectAlias,
    taskRef: 'medium',
    output: 'summary'
  });
  assert.equal(mediumCall.isError, true);
  const medium = requireAgentResult(mediumCall, { operation: 'task.run', outcome: 'refused' });
  assert.equal(medium.outcome.code, 'risk_not_low');
  assert.equal(medium.effects.certainty, 'none');
  assert.equal(medium.effects.changed, false);
  assert.equal(fs.existsSync(mediumReceipt), false);

  const unknownCall = await mcp.callTool('launchdeck.unknown', {});
  assert.equal(unknownCall.isError, true);
  const unknown = requireAgentResult(unknownCall, { outcome: 'refused' });
  assert.match(unknown.operation.id, /^req_/);
  assert.equal(unknown.operation.journalStatus, 'not_applicable');
  assert.equal(unknown.effects.changed, false);

  const invalidCall = await mcp.callTool('task.start', {
    projectRef: fixture.projectAlias,
    taskRef: 'managed',
    nested: { force: true }
  });
  assert.equal(invalidCall.isError, true);
  const invalid = requireAgentResult(invalidCall, { operation: 'task.start', outcome: 'refused' });
  assert.match(invalid.operation.id, /^req_/);
  assert.equal(invalid.outcome.code, 'input_invalid');
  assert.equal(invalid.operation.journalStatus, 'not_applicable');
  assert.equal(invalid.effects.changed, false);

  assertProtocolFrames(mcp.stdoutFrames());
});

async function registeredFixture(alias) {
  const fixture = await createAgentSurfaceFixture();
  const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', alias]);
  assert.equal(added.status, 0, added.stderr);
  return { ...fixture, projectAlias: alias };
}

function assertProtocolFrames(frames) {
  assert.equal(frames.length > 0, true);
  for (const frame of frames) {
    assert.equal(frame.jsonrpc, '2.0');
    assert.equal(typeof frame, 'object');
  }
}
