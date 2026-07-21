import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createAgentSurfaceFixture } from '../helpers/agent-surface-fixture.js';
import { connectLaunchdeckMcp, requireAgentResult } from '../helpers/mcp-client.js';

const normalizationContract = JSON.parse(fs.readFileSync(
  new URL('../fixtures/agent-surfaces/expected/us1-normalization.json', import.meta.url),
  'utf8'
));

test('real CLI and MCP task.list results are semantically equivalent after allowed host normalization', async () => {
  await withRegisteredFixture('us1-equivalence-list', async ({ fixture, projectId, mcp }) => {
    const cli = fixture.runCliJson(['tasks']);
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.json.schemaVersion, 1);
    const cliResult = requireCliAgentResult(cli);

    const call = await mcp.callTool('task.list', { projectRef: projectId });
    assert.equal(call.isError, false);
    const mcpResult = requireAgentResult(call, { operation: 'task.list', outcome: 'succeeded' });
    assertSurfaceVersions(cliResult, mcpResult);
    assert.deepEqual(normalizeResult(cliResult), normalizeResult(mcpResult));
  });
});

test('real CLI and MCP finite task execution preserve one normalized result contract', async () => {
  await withRegisteredFixture('us1-equivalence-run', async ({ fixture, projectId, mcp }) => {
    const cli = fixture.runCliJson(['run', 'finite']);
    assert.equal(cli.status, 0, cli.stderr);
    const cliResult = requireCliAgentResult(cli);

    const call = await mcp.callTool('task.run', { projectRef: projectId, taskRef: 'finite' });
    assert.equal(call.isError, false);
    const mcpResult = requireAgentResult(call, { operation: 'task.run', outcome: 'succeeded' });
    assertSurfaceVersions(cliResult, mcpResult);
    assert.deepEqual(normalizeResult(cliResult), normalizeResult(mcpResult));
  });
});

test('real CLI and MCP clean.plan expose the same digest-bound safe snapshot', async () => {
  await withRegisteredFixture('us1-equivalence-clean', async ({ fixture, projectId, mcp }) => {
    const cli = fixture.runCliJson(['clean']);
    assert.equal(cli.status, 0, cli.stderr);
    const cliResult = requireCliAgentResult(cli);

    const call = await mcp.callTool('clean.plan', { projectRef: projectId });
    assert.equal(call.isError, false);
    const mcpResult = requireAgentResult(call, { operation: 'clean.plan', outcome: 'succeeded' });
    assertSurfaceVersions(cliResult, mcpResult);
    assert.deepEqual(normalizeResult(cliResult), normalizeResult(mcpResult));
  });
});

async function withRegisteredFixture(alias, callback) {
  const fixture = await createAgentSurfaceFixture();
  let mcp;
  try {
    const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', alias]);
    assert.equal(added.status, 0, added.stderr);
    const projectId = added.json.project.projectId;
    mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
    await callback({ fixture, projectId, mcp });
  } finally {
    await mcp?.close().catch(() => {});
    fixture.cleanup();
  }
}

function requireCliAgentResult(command) {
  const result = command.json?.data?.agentResult;
  assert.ok(result, 'CLI schemaVersion 1 envelope must nest data.agentResult.');
  return result;
}

function assertSurfaceVersions(cliResult, mcpResult) {
  assert.equal(cliResult.provenance.surface, 'cli');
  assert.equal(cliResult.provenance.cliSchemaVersion, 1);
  assert.equal(mcpResult.provenance.surface, 'mcp');
  assert.equal(mcpResult.provenance.cliSchemaVersion, null);
  for (const field of normalizationContract.requiredSharedProvenance) {
    assert.equal(mcpResult.provenance[field], cliResult.provenance[field], field);
  }
}

function normalizeResult(result) {
  return {
    protocolVersion: result.protocolVersion,
    operation: {
      name: result.operation.name,
      inputDigest: result.operation.inputDigest,
      journalStatus: result.operation.journalStatus
    },
    outcome: result.outcome,
    resource: result.resource,
    effects: result.effects,
    safety: result.safety,
    error: result.error,
    nextActions: result.nextActions
  };
}
