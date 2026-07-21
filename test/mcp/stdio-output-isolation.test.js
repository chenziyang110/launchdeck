import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAgentSurfaceFixture } from '../helpers/agent-surface-fixture.js';
import { createTempProject, removeTempProject } from '../helpers/cli-fixture.js';
import { connectLaunchdeckMcp, requireAgentResult } from '../helpers/mcp-client.js';

test('foreground child stdout and stderr stay inside protocol results and every server stdout line is JSON-RPC', async (t) => {
  const fixture = await registeredFixture('mcp-output-isolation');
  t.after(() => fixture.cleanup());
  const secret = 'mcp-secret-value-must-not-leak';
  const mcp = await connectLaunchdeckMcp({
    cwd: fixture.projectRoot,
    env: { ...fixture.env, MCP_TEST_SECRET: secret }
  });
  t.after(() => mcp.close());

  const call = await mcp.callTool('task.run', {
    projectRef: fixture.projectAlias,
    taskRef: 'finite',
    output: 'summary'
  });
  assert.equal(call.isError, false);
  const result = requireAgentResult(call, { operation: 'task.run', outcome: 'succeeded' });
  assert.match(result.resource.data.stdout, /agent-surfaces-finite-stdout:low/);
  assert.match(result.resource.data.stderr, /agent-surfaces-finite-stderr:low/);
  assert.equal(fs.existsSync(fixture.finiteReceiptPath('low')), true);

  const stdout = mcp.stdoutText();
  const frames = mcp.stdoutFrames();
  assert.equal(frames.length > 0, true);
  assert.equal(stdout.split(/\r?\n/).filter(Boolean).length, frames.length);
  assert.doesNotMatch(stdout, new RegExp(`^${secret}$`, 'm'));
  assert.doesNotMatch(mcp.stderrText(), new RegExp(secret));
});

test('Plugin installation cwd never supplies executable project scope', async (t) => {
  const fixture = await registeredFixture('mcp-plugin-cwd-scope');
  t.after(() => fixture.cleanup());
  const pluginTemp = createTempProject({ prefix: 'launchdeck-cli-mcp-plugin-' });
  t.after(() => removeTempProject(pluginTemp));
  const pluginCwd = path.join(pluginTemp, 'Plugin Cache 空格');
  fs.mkdirSync(pluginCwd, { recursive: true });
  fs.writeFileSync(path.join(pluginCwd, '.launchdeck.yml'), [
    'version: 1',
    'project:',
    '  name: plugin-installation-must-not-be-scope',
    'tasks:',
    '  managed:',
    '    command: node -e "process.exit(0)"',
    '    longRunning: true',
    '    risk: low',
    'clean:',
    '  safe: []',
    '  risky: []',
    ''
  ].join(os.EOL));

  const mcp = await connectLaunchdeckMcp({ cwd: pluginCwd, env: fixture.env });
  t.after(() => mcp.close());
  const call = await mcp.callTool('task.status', { taskRef: 'managed' });
  assert.equal(call.isError, true);
  const result = requireAgentResult(call, { operation: 'task.status', outcome: 'refused' });
  assert.equal(result.outcome.code, 'scope_not_resolved');
  assert.notEqual(result.resource.projectRef, 'plugin-installation-must-not-be-scope');
  assert.equal(result.effects.changed, false);
});

async function registeredFixture(alias) {
  const fixture = await createAgentSurfaceFixture();
  const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', alias]);
  assert.equal(added.status, 0, added.stderr);
  return { ...fixture, projectAlias: alias };
}
