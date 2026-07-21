import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { isPidRunning, runtimePaths, writeState } from '../../src/runtime.js';
import { AGENT_OPERATION_NAMES } from '../../src/kernel/operation-registry.js';
import { createAgentSurfaceFixture } from '../helpers/agent-surface-fixture.js';
import { connectLaunchdeckMcp, requireAgentResult } from '../helpers/mcp-client.js';

test('CLI then MCP and MCP then CLI reuse the exact managed run without a second spawn', async () => {
  await assertCrossSurfaceReuse({ first: 'cli', alias: 'us1-cli-first' });
  await assertCrossSurfaceReuse({ first: 'mcp', alias: 'us1-mcp-first' });
});

test('synchronized real MCP starts converge on one run and one append-only spawn receipt', async () => {
  await withRegisteredFixture('us1-concurrent', async ({ fixture, projectId, mcp }) => {
    const calls = await Promise.all([
      mcp.callTool('task.start', { projectRef: projectId, taskRef: 'managed' }),
      mcp.callTool('task.start', { projectRef: projectId, taskRef: 'managed' })
    ]);
    const results = calls.map((call) => requireAgentResult(call, {
      operation: 'task.start',
      outcome: 'succeeded'
    }));
    assert.equal(results[0].resource.runId, results[1].resource.runId);
    assert.deepEqual(results.map((result) => result.outcome.reusedExistingRun).sort(), [false, true]);
    assert.deepEqual(results.map((result) => result.effects.changed).sort(), [false, true]);
    assert.equal(readReceipts(fixture.spawnReceiptPath).length, 1);
  });
});

test('external and unknown ownership refuse across real CLI and MCP before spawn or signal effects', async () => {
  await assertExternalRefusal();
  await assertUnknownRefusal();
});

test('stale safe-clean digest refuses under locks before deleting any current target', async () => {
  await withRegisteredFixture('us1-clean-drift', async ({ fixture, projectId, mcp }) => {
    const planCall = await mcp.callTool('clean.plan', { projectRef: projectId });
    const plan = requireAgentResult(planCall, { operation: 'clean.plan', outcome: 'succeeded' });
    const oldDigest = plan.resource.data.planDigest;
    const originalTarget = fixture.path('artifacts', 'safe-cache');
    const driftedTarget = fixture.path('artifacts', 'safe-cache-drifted');
    fs.renameSync(originalTarget, driftedTarget);

    const applyCall = await mcp.callTool('clean.applySafe', {
      projectRef: projectId,
      planDigest: oldDigest
    });
    const refused = requireAgentResult(applyCall, {
      operation: 'clean.applySafe',
      outcome: 'refused'
    });
    assert.equal(applyCall.isError, true);
    assert.equal(refused.outcome.code, 'plan_digest_mismatch');
    assert.equal(refused.operation.journalStatus, 'refused');
    assert.deepEqual(refused.effects, { certainty: 'none', changed: false, evidenceRefs: [] });
    assert.equal(fs.existsSync(driftedTarget), true);
    assert.equal(fs.existsSync(fixture.path('artifacts', 'safe-output')), true);
    assert.equal(fs.existsSync(fixture.sentinelPath('risky-content')), true);
  });
});

test('CLI and MCP adoption inspection preserve byte inventory, process state, ports, and public surface', async () => {
  await withRegisteredFixture('us1-adoption-zero-write', async ({ fixture, projectId, mcp }) => {
    const before = snapshotTrees([fixture.projectRoot, fixture.homeDir]);
    const cli = fixture.runCliJson(['adoption', 'inspect', '--max-depth', '3', '--max-files', '100']);
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.json.data.agentResult.outcome.kind, 'succeeded');
    assert.deepEqual(snapshotTrees([fixture.projectRoot, fixture.homeDir]), before);

    const call = await mcp.callTool('adoption.inspect', {
      projectRef: projectId,
      maxDepth: 3,
      maxFiles: 100
    });
    const inspected = requireAgentResult(call, { operation: 'adoption.inspect', outcome: 'succeeded' });
    assert.equal(inspected.effects.changed, false);
    assert.deepEqual(snapshotTrees([fixture.projectRoot, fixture.homeDir]), before);
    assert.equal(fs.existsSync(fixture.spawnReceiptPath), false);
    assert.equal(await portIsAvailable(fixture.managedPort), true);

    const listed = await mcp.listTools();
    assert.equal(listed.tools.some((tool) => tool.name === 'adoption.apply'), false);
    const capabilities = requireAgentResult(await mcp.callTool('capabilities.get'), {
      operation: 'capabilities.get',
      outcome: 'succeeded'
    });
    assert.deepEqual(capabilities.resource.data.agentOperations, [...AGENT_OPERATION_NAMES]);
    assert.equal(capabilities.nextActions.some((action) => action.operationName === 'adoption.apply'), false);
  });
});

async function assertCrossSurfaceReuse({ first, alias }) {
  await withRegisteredFixture(alias, async ({ fixture, projectId, mcp }) => {
    let initial;
    let reused;
    if (first === 'cli') {
      const command = fixture.runCliJson(['start', 'managed']);
      assert.equal(command.status, 0, command.stderr);
      initial = command.json.data.agentResult;
      reused = requireAgentResult(await mcp.callTool('task.start', {
        projectRef: projectId,
        taskRef: 'managed'
      }), { operation: 'task.start', outcome: 'succeeded' });
    } else {
      initial = requireAgentResult(await mcp.callTool('task.start', {
        projectRef: projectId,
        taskRef: 'managed'
      }), { operation: 'task.start', outcome: 'succeeded' });
      const command = fixture.runCliJson(['start', 'managed']);
      assert.equal(command.status, 0, command.stderr);
      reused = command.json.data.agentResult;
    }
    assert.equal(initial.outcome.reusedExistingRun, false);
    assert.equal(initial.effects.changed, true);
    assert.equal(reused.outcome.reusedExistingRun, true);
    assert.equal(reused.effects.changed, false);
    assert.equal(reused.resource.runId, initial.resource.runId);
    const receipts = readReceipts(fixture.spawnReceiptPath);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].runId, initial.resource.runId);
  });
}

async function assertExternalRefusal() {
  const fixture = await createAgentSurfaceFixture();
  let mcp;
  let external;
  try {
    const added = register(fixture, 'us1-external-owner');
    external = spawnExternalPortOwner(fixture.managedPort, fixture.homeDir);
    await waitForPort(fixture.managedPort);
    mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });

    const cli = fixture.runCliJson(['start', 'managed']);
    assert.notEqual(cli.status, 0);
    const cliResult = cli.json.data.agentResult;
    assert.equal(cliResult.outcome.kind, 'refused');
    assert.equal(cliResult.safety.ownership, 'external');

    const call = await mcp.callTool('task.start', {
      projectRef: added.projectId,
      taskRef: 'managed'
    });
    const result = requireAgentResult(call, { operation: 'task.start', outcome: 'refused' });
    assert.equal(result.safety.ownership, 'external');
    assert.equal(result.effects.changed, false);
    assert.equal(isPidRunning(external.pid), true);
    assert.equal(fs.existsSync(fixture.spawnReceiptPath), false);

    const injected = await mcp.callTool('task.start', {
      projectRef: added.projectId,
      taskRef: 'managed',
      approval: { force: true }
    });
    const invalid = requireAgentResult(injected, { operation: 'task.start', outcome: 'refused' });
    assert.equal(invalid.outcome.code, 'input_invalid');
    assert.equal(invalid.effects.changed, false);
  } finally {
    await mcp?.close().catch(() => {});
    await terminateChild(external);
    fixture.cleanup();
  }
}

async function assertUnknownRefusal() {
  const fixture = await createAgentSurfaceFixture();
  let mcp;
  let external;
  try {
    const added = register(fixture, 'us1-unknown-owner');
    external = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      cwd: fixture.homeDir,
      stdio: 'ignore',
      windowsHide: true
    });
    await waitForProcess(external);
    const now = new Date().toISOString();
    writeState(fixture.projectRoot, {
      processes: {
        managed: {
          task: 'managed',
          name: 'managed',
          command: 'external-untrusted-process',
          cwd: fixture.homeDir,
          pid: external.pid,
          ports: [],
          logPath: path.join(runtimePaths(fixture.projectRoot).logsDir, 'unknown.log'),
          startedAt: now,
          lastRefresh: now,
          status: 'running'
        }
      }
    });
    mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });

    const cli = fixture.runCliJson(['stop', 'managed']);
    assert.notEqual(cli.status, 0);
    assert.equal(cli.json.data.agentResult.outcome.kind, 'refused');
    assert.equal(cli.json.data.agentResult.safety.ownership, 'unknown');
    const call = await mcp.callTool('task.stop', {
      projectRef: added.projectId,
      taskRef: 'managed'
    });
    const result = requireAgentResult(call, { operation: 'task.stop', outcome: 'refused' });
    assert.equal(result.safety.ownership, 'unknown');
    assert.equal(result.effects.changed, false);
    assert.equal(isPidRunning(external.pid), true);
  } finally {
    await mcp?.close().catch(() => {});
    await terminateChild(external);
    fixture.cleanup();
  }
}

async function withRegisteredFixture(alias, callback) {
  const fixture = await createAgentSurfaceFixture();
  let mcp;
  try {
    const project = register(fixture, alias);
    mcp = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
    await callback({ fixture, projectId: project.projectId, mcp });
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

function readReceipts(receiptPath) {
  if (!fs.existsSync(receiptPath)) return [];
  return fs.readFileSync(receiptPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function snapshotTrees(roots) {
  const snapshot = {};
  for (const root of roots) walk(root, root, snapshot);
  return snapshot;
}

function walk(root, current, snapshot) {
  if (!fs.existsSync(current)) return;
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = path.join(current, entry.name);
    const key = `${path.basename(root)}/${path.relative(root, absolutePath).replaceAll('\\', '/')}`;
    if (entry.isDirectory()) {
      snapshot[`${key}/`] = 'directory';
      walk(root, absolutePath, snapshot);
    } else if (entry.isFile()) {
      snapshot[key] = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
    } else {
      snapshot[key] = entry.isSymbolicLink() ? 'symlink' : 'other';
    }
  }
}

function spawnExternalPortOwner(port, cwd) {
  const source = [
    "const net = require('net');",
    `const server = net.createServer(); server.listen(${port}, '127.0.0.1');`,
    "const stop = () => server.close(() => process.exit(0));",
    "process.on('SIGTERM', stop); process.on('SIGINT', stop);"
  ].join(' ');
  return spawn(process.execPath, ['-e', source], { cwd, stdio: 'ignore', windowsHide: true });
}

async function waitForPort(port) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!await portIsAvailable(port)) return;
    await delay(25);
  }
  throw new Error(`External fixture did not claim port ${port}.`);
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function waitForProcess(child) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (Number.isInteger(child?.pid) && isPidRunning(child.pid)) return;
    await delay(10);
  }
  throw new Error('External fixture process did not start.');
}

async function terminateChild(child) {
  if (!child || !Number.isInteger(child.pid) || !isPidRunning(child.pid)) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, delay(2_000)]);
  if (isPidRunning(child.pid)) child.kill('SIGKILL');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
