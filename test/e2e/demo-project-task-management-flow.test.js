import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCliJson } from '../helpers/cli-fixture.js';
import { connectLaunchdeckMcp, requireAgentResult } from '../helpers/mcp-client.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const exampleRoot = path.join(repoRoot, 'examples');
const fixturePrefix = 'launchdeck-e2e-example-';

test('official demo API exercises MCP-first finite and managed task lifecycle', async () => {
  const port = await getFreePort();
  const fixture = createExampleFixture('demo-api', { port, sourcePort: 8888 });
  let mcp;
  let project;
  try {
    project = register(fixture, 'e2e-demo-api');
    mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });

    const capabilities = requireAgentResult(await mcp.callTool('capabilities.get', {
      projectRef: project.projectId
    }), { operation: 'capabilities.get', outcome: 'succeeded' });
    assert.equal(capabilities.resource.data.agentOperations.includes('task.run'), true);
    assert.equal(capabilities.resource.data.agentOperations.includes('task.start'), true);
    assert.equal(capabilities.resource.data.agentOperations.includes('task.stop'), true);

    const tasks = requireAgentResult(await mcp.callTool('task.list', {
      projectRef: project.projectId
    }), { operation: 'task.list', outcome: 'succeeded' });
    assert.deepEqual(
      tasks.resource.data.tasks.map((task) => [task.name, task.type, task.risk]),
      [
        ['check', 'foreground', 'low'],
        ['dev', 'managed', 'low']
      ]
    );

    const check = requireAgentResult(await mcp.callTool('task.run', {
      projectRef: project.projectId,
      taskRef: 'check',
      output: 'summary'
    }), { operation: 'task.run' });
    assert.equal(check.outcome.kind, 'succeeded', JSON.stringify(check));
    assert.equal(check.resource.status, 'completed');
    assert.equal(check.resource.data.exitCode, 0);

    const beforeStart = requireAgentResult(await mcp.callTool('task.status', {
      projectRef: project.projectId,
      taskRef: 'dev'
    }), { operation: 'task.status', outcome: 'succeeded' });
    assert.notEqual(beforeStart.resource.status, 'running');

    const started = requireAgentResult(await mcp.callTool('task.start', {
      projectRef: project.projectId,
      taskRef: 'dev'
    }), { operation: 'task.start', outcome: 'succeeded' });
    assert.ok(['running', 'ready'].includes(started.resource.status));
    assert.equal(started.effects.changed, true);
    assert.match(started.resource.runId, /^run_/);

    const health = await waitForHealth(port);
    assert.deepEqual(
      { ok: health.ok, service: health.service, port: health.port },
      { ok: true, service: 'launchdeck-demo-api', port }
    );

    const logs = requireAgentResult(await mcp.callTool('task.logs.read', {
      projectRef: project.projectId,
      taskRef: 'dev',
      limit: 40
    }), { operation: 'task.logs.read', outcome: 'succeeded' });
    assert.match(logs.resource.data.lines.join('\n'), /ready url=http:\/\/127\.0\.0\.1:/);

    const events = requireAgentResult(await mcp.callTool('task.events.read', {
      projectRef: project.projectId,
      taskRef: 'dev',
      limit: 40
    }), { operation: 'task.events.read', outcome: 'succeeded' });
    assert.ok(events.resource.data.items.length > 0);

    const stopped = requireAgentResult(await mcp.callTool('task.stop', {
      projectRef: project.projectId,
      taskRef: 'dev'
    }), { operation: 'task.stop', outcome: 'succeeded' });
    assert.equal(stopped.resource.status, 'stopped');
    assert.equal(stopped.effects.changed, true);
    await waitForPortState(port, true);
  } finally {
    await stopIfNeeded(mcp, project?.projectId, 'dev');
    await mcp?.close().catch(() => {});
    fixture.cleanup();
  }
});

test('official demo API reconciles an externally exited managed service without replaying it', async () => {
  const port = await getFreePort();
  const fixture = createExampleFixture('demo-api', { port, sourcePort: 8888 });
  let mcp;
  let project;
  try {
    project = register(fixture, 'e2e-demo-recovery');
    mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });

    const started = requireAgentResult(await mcp.callTool('task.start', {
      projectRef: project.projectId,
      taskRef: 'dev'
    }), { operation: 'task.start', outcome: 'succeeded' });
    await waitForHealth(port);

    const controlledExit = await fetch(`http://127.0.0.1:${port}/_demo/exit`);
    assert.equal(controlledExit.ok, true);
    await waitForPortState(port, true);

    const reconciled = fixture.runCliJson(['reconcile', project.alias, '--compact']);
    assert.equal(reconciled.status, 0, reconciled.stderr);
    assert.equal(reconciled.json.ok, true);
    assert.equal(reconciled.json.command, 'reconcile');

    const recoveredStatus = requireAgentResult(await mcp.callTool('task.status', {
      projectRef: project.projectId,
      taskRef: 'dev'
    }), { operation: 'task.status', outcome: 'succeeded' });
    assert.equal(['starting', 'running', 'ready', 'stopping'].includes(recoveredStatus.resource.status), false);
  } finally {
    await stopIfNeeded(mcp, project?.projectId, 'dev');
    await mcp?.close().catch(() => {});
    fixture.cleanup();
  }
});

test('a user installs the Codex Skill into a copied real project through the CLI', () => {
  const fixture = createExampleFixture('demo-api', { port: 8888, sourcePort: 8888 });
  const skillRoot = path.join(fixture.projectRoot, '.agents', 'skills');
  const target = path.join(skillRoot, 'launchdeck-agent');
  try {
    const doctor = fixture.runCliJson(['agent', 'doctor', '--compact']);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.equal(doctor.json.status, 'ok');

    const installed = fixture.runCliJson([
      'agent',
      'install',
      '--agent',
      'codex',
      '--scope',
      'project',
      '--target',
      skillRoot,
      '--compact'
    ]);
    assert.equal(installed.status, 0, installed.stderr);
    assert.equal(installed.json.result.status, 'installed');
    assert.equal(installed.json.target.dir, target);
    assert.match(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), /name: launchdeck-agent/);

    const again = fixture.runCliJson([
      'agent',
      'install',
      '--agent',
      'codex',
      '--scope',
      'project',
      '--target',
      skillRoot,
      '--compact'
    ]);
    assert.equal(again.status, 0, again.stderr);
    assert.equal(again.json.result.status, 'already_installed');
  } finally {
    fixture.cleanup();
  }
});

test('hands-on demo proves compact CLI fallback plus MCP failure reporting without replay', async () => {
  const port = await getFreePort();
  const fixture = createExampleFixture('hands-on-demo', { port, sourcePort: 4317 });
  let mcp;
  try {
    const project = register(fixture, 'e2e-hands-on');

    const cliCapabilities = fixture.runCliJson(['capabilities', '--compact']);
    assert.equal(cliCapabilities.status, 0, cliCapabilities.stderr);
    assert.equal(cliCapabilities.json.command, 'capabilities');
    assert.equal(cliCapabilities.json.status, 'ok');

    const cliTasks = fixture.runCliJson(['tasks', '--compact']);
    assert.equal(cliTasks.status, 0, cliTasks.stderr);
    assert.deepEqual(
      cliTasks.json.tasks.map((task) => task.name),
      ['build', 'fail', 'dev']
    );

    const cliBuild = fixture.runCliJson(['run', 'build', '--compact']);
    assert.equal(cliBuild.status, 0, cliBuild.stderr);
    assert.equal(cliBuild.json.ok, true);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, 'dist', 'demo.txt')), true);

    mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
    const failed = requireAgentResult(await mcp.callTool('task.run', {
      projectRef: project.projectId,
      taskRef: 'fail',
      output: 'summary'
    }), { operation: 'task.run', outcome: 'failed' });
    assert.equal(failed.outcome.code, 'task_command_failed');
    assert.equal(failed.resource.status, 'failed');
    assert.equal(failed.resource.data.exitCode, 7);
    assert.match(failed.resource.data.stderr, /intentional demo failure/);
  } finally {
    await mcp?.close().catch(() => {});
    fixture.cleanup();
  }
});

function createExampleFixture(exampleName, portOverride) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), fixturePrefix));
  const sourceRoot = path.join(exampleRoot, exampleName);
  fs.cpSync(sourceRoot, projectRoot, {
    recursive: true,
    filter: (source) => {
      const parts = path.relative(sourceRoot, source).split(path.sep);
      return !parts.includes('.launchdeck') && !parts.includes('scratch');
    }
  });
  const configPath = path.join(projectRoot, '.launchdeck.yml');
  const config = fs.readFileSync(configPath, 'utf8');
  fs.writeFileSync(
    configPath,
    config.replaceAll(String(portOverride.sourcePort), String(portOverride.port))
  );
  const homeDir = path.join(projectRoot, '.e2e-launchdeck-home');
  const env = { ...process.env, LAUNCHDECK_HOME: homeDir };
  return {
    projectRoot,
    env,
    runCliJson: (args) => runCliJson(args, { cwd: projectRoot, env, timeout: 20_000 }),
    cleanup: () => removeFixture(projectRoot)
  };
}

function register(fixture, alias) {
  const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', alias]);
  assert.equal(added.status, 0, added.stderr);
  return added.json.project;
}

async function stopIfNeeded(mcp, projectId, taskRef) {
  if (!mcp || !projectId) return;
  try {
    const status = requireAgentResult(await mcp.callTool('task.status', {
      projectRef: projectId,
      taskRef
    }), { operation: 'task.status', outcome: 'succeeded' });
    if (['starting', 'running', 'ready', 'stopping'].includes(status.resource.status)) {
      await mcp.callTool('task.stop', { projectRef: projectId, taskRef });
    }
  } catch {
    // The temporary project is about to be removed; cleanup cannot mask the test result.
  }
}

async function waitForHealth(port) {
  return waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }, `Demo API did not become healthy on port ${port}.`);
}

async function getFreePort() {
  const server = net.createServer();
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForPortState(port, expectedAvailable) {
  await waitFor(() => isPortAvailable(port).then((available) => available === expectedAvailable),
    `Port ${port} did not become ${expectedAvailable ? 'available' : 'occupied'}.`);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function waitFor(check, errorMessage) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(errorMessage);
}

function removeFixture(projectRoot) {
  const tempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(projectRoot);
  const relative = path.relative(tempRoot, resolved);
  if (
    relative === ''
    || relative.startsWith('..')
    || path.isAbsolute(relative)
    || !path.basename(resolved).startsWith(fixturePrefix)
  ) {
    throw new Error(`Refusing to remove non-E2E fixture: ${projectRoot}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}
