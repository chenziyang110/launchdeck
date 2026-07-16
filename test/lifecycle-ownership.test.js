import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createControlPlaneFixture } from './helpers/control-plane-fixture.js';

test('stop --json stops a verified-owned run and records stopped evidence', async () => {
  await withLifecycleFixture(async ({ fixture }) => {
    const port = await getFreePort();
    writeReadyProject(fixture, { name: 'lifecycle-owned-stop', port });
    assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'owned-stop']).status, 0);
    const started = fixture.runCliJson(['start', 'owned-stop:dev']);
    assert.equal(started.status, 0, cliFailureMessage(started));

    const stopped = fixture.runGlobalCliJson(['stop', 'owned-stop:dev']);

    assert.equal(stopped.status, 0, cliFailureMessage(stopped));
    assert.equal(stopped.json.command, 'stop');
    const data = payloadData(stopped.json);
    assert.equal(Array.isArray(data.stopped), true, `Expected stop payload to include stopped[], got ${JSON.stringify(data)}`);
    assert.equal(Array.isArray(data.failed), true, `Expected stop payload to include failed[], got ${JSON.stringify(data)}`);
    assert.equal(data.stopped.length, 1);
    assert.equal(data.stopped[0].runId, started.json.process.runId);
    assert.equal(data.stopped[0].status, 'stopped');
    assert.equal(data.failed.length, 0);
    assertRunStatus(fixture.homeDir, started.json.process.runId, 'stopped');
    assert.equal(await canListen(port), true);
  });
});

test('stop --json refuses probable-owned runs without stopping the fixture process', async () => {
  await withLifecycleFixture(async ({ fixture }) => {
    const port = await getFreePort();
    writeReadyProject(fixture, { name: 'lifecycle-probable-stop', port });
    assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'probable-stop']).status, 0);
    const started = fixture.runCliJson(['start', 'probable-stop:dev']);
    assert.equal(started.status, 0, cliFailureMessage(started));
    rewriteRun(fixture.homeDir, started.json.process.runId, (run) => ({
      ...run,
      ownershipConfidence: 'probable-owned',
      ownershipProof: {
        confidence: 'probable-owned',
        pidMatchesRun: true,
        processAlive: true,
        cwdMatches: 'unavailable',
        commandMatches: 'unavailable',
        envMarkerMatches: 'unavailable',
        startTimeMatches: 'unavailable',
        portEvidence: [],
        checkedAt: '2026-07-09T00:00:00.000Z',
        reasons: ['partial_os_evidence']
      }
    }));

    const stopped = fixture.runGlobalCliJson(['stop', 'probable-stop:dev']);

    assert.equal(stopped.status, 1);
    assert.equal(errorCode(stopped.json), 'ownership_not_verified');
    assertNextActionIncludes(stopped.json, 'inspect');
    assertNextActionIncludes(stopped.json, 'reconcile');
    assert.equal(await canConnect(port), true);
  });
});

test('stop --json refuses unknown ownership without stopping the fixture process', async () => {
  await withLifecycleFixture(async ({ fixture, trackChild }) => {
    const port = await getFreePort();
    writeReadyProject(fixture, { name: 'lifecycle-unknown-stop', port });
    assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'unknown-stop']).status, 0);
    const child = spawnExternalServer(fixture, port);
    trackChild(child);
    await waitForPortListening(port);
    const project = fixture.runGlobalCliJson(['projects']).json.projects[0];
    const runId = 'run_unknown_fixture';
    writeRunIndex(fixture.homeDir, {
      version: 1,
      updatedAt: '2026-07-09T00:00:00.000Z',
      runs: [runRecord({
        runId,
        project,
        fixture,
        port,
        pid: child.pid,
        command: 'node scripts/not-the-server.js',
        cwd: fixture.path('tmp', 'unknown-owner'),
        ownershipConfidence: 'unknown',
        ownershipProof: {
          confidence: 'unknown',
          pidMatchesRun: true,
          processAlive: true,
          cwdMatches: false,
          commandMatches: false,
          envMarkerMatches: false,
          startTimeMatches: 'unavailable',
          portEvidence: [],
          checkedAt: '2026-07-09T00:00:00.000Z',
          reasons: ['no_launchdeck_run_marker']
        }
      })]
    });

    const stopped = fixture.runGlobalCliJson(['stop', 'unknown-stop:dev']);

    assert.equal(stopped.status, 1);
    assert.equal(errorCode(stopped.json), 'unknown_process_owner');
    assertNextActionIncludes(stopped.json, 'inspect');
    assert.equal(await canConnect(port), true);
  });
});

test('stop --json refuses matching pid and listener without trusted spawn proof', async () => {
  await withLifecycleFixture(async ({ fixture, trackChild }) => {
    const port = await getFreePort();
    writeReadyProject(fixture, { name: 'lifecycle-stale-local-state', port });
    assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'stale-local']).status, 0);
    const child = spawnExternalServer(fixture, port);
    trackChild(child);
    await waitForPortListening(port);

    const project = fixture.runGlobalCliJson(['projects']).json.projects[0];
    const runId = 'run_stale_local_state';
    const staleProcess = {
      ...runRecord({
      runId,
      project,
      fixture,
      port,
      pid: child.pid,
      command: 'node scripts/launchdeck-owned-server.js',
      ownershipConfidence: undefined,
      ownershipProof: undefined
      }),
      cwd: fixture.path('tmp', 'stale-cwd')
    };
    writeRuntimeState(fixture, {
      version: 1,
      projectRoot: fixture.projectRoot,
      updatedAt: '2026-07-09T00:00:00.000Z',
      processes: {
        dev: {
          ...staleProcess,
          ports: staleProcess.declaredPorts,
          lastRefresh: '2026-07-09T00:00:00.000Z'
        }
      }
    });
    writeRunIndex(fixture.homeDir, {
      version: 1,
      updatedAt: '2026-07-09T00:00:00.000Z',
      runs: [staleProcess]
    });

    const stopped = fixture.runGlobalCliJson(['stop', 'stale-local:dev']);

    assert.equal(stopped.status, 1);
    assert.equal(errorCode(stopped.json), 'unknown_process_owner');
    assertNextActionIncludes(stopped.json, 'inspect');
    assert.equal(await canConnect(port), true);
  });
});

test('stop --json refuses an external process without stopping the external listener', async () => {
  await withLifecycleFixture(async ({ fixture, trackChild }) => {
    const port = await getFreePort();
    writeReadyProject(fixture, { name: 'lifecycle-external-stop', port });
    assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'external-stop']).status, 0);
    const child = spawnExternalServer(fixture, port);
    trackChild(child);
    await waitForPortListening(port);

    const stopped = fixture.runGlobalCliJson(['stop', 'external-stop:dev']);

    assert.equal(stopped.status, 1);
    assert.equal(errorCode(stopped.json), 'external_process');
    assertNextActionIncludes(stopped.json, `inspect port:${port}`);
    assert.equal(await canConnect(port), true);
  });
});

test('force-stop --json preserves the verified ownership gate', async () => {
  await withLifecycleFixture(async ({ fixture, trackChild }) => {
    const port = await getFreePort();
    writeReadyProject(fixture, { name: 'lifecycle-force-gate', port });
    assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'force-gate']).status, 0);
    const child = spawnExternalServer(fixture, port);
    trackChild(child);
    await waitForPortListening(port);

    const forced = fixture.runGlobalCliJson(['force-stop', 'force-gate:dev']);

    assert.equal(forced.status, 1);
    assert.equal(errorCode(forced.json), 'external_process');
    assertNextActionIncludes(forced.json, 'inspect');
    assert.equal(await canConnect(port), true);
  });
});

test('restart --json stops, waits for port release, and starts a new run in one transaction', async () => {
  await withLifecycleFixture(async ({ fixture }) => {
    const port = await getFreePort();
    writeReadyProject(fixture, { name: 'lifecycle-restart', port });
    assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'restart-owned']).status, 0);
    const first = fixture.runCliJson(['start', 'restart-owned:dev']);
    assert.equal(first.status, 0, cliFailureMessage(first));

    const restarted = fixture.runGlobalCliJson(['restart', 'restart-owned:dev']);

    assert.equal(restarted.status, 0, cliFailureMessage(restarted));
    assert.equal(restarted.json.command, 'restart');
    const data = payloadData(restarted.json);
    assert.equal(typeof data.stoppedRun, 'object', `Expected restart payload to include stoppedRun, got ${JSON.stringify(data)}`);
    assert.equal(typeof data.startedRun, 'object', `Expected restart payload to include startedRun, got ${JSON.stringify(data)}`);
    assert.equal(typeof data.transactionId, 'string', `Expected restart payload to include transactionId, got ${JSON.stringify(data)}`);
    assert.equal(data.stoppedRun.runId, first.json.process.runId);
    assert.equal(data.stoppedRun.status, 'stopped');
    assert.match(data.startedRun.runId, /^run_[A-Za-z0-9_-]+$/);
    assert.notEqual(data.startedRun.runId, first.json.process.runId);
    assert.equal(data.stoppedRun.transactionId, data.transactionId);
    assert.equal(data.startedRun.transactionId, data.transactionId);
    assert.equal(Number(fs.readFileSync(fixture.path('tmp', 'ready-start-count.txt'), 'utf8')), 2);
    assert.equal(await canConnect(port), true);
  });
});

test('restart --json records port_release_timeout when the stopped task leaves its port occupied', async () => {
  await withLifecycleFixture(async ({ fixture }) => {
    const port = await getFreePort();
    writeStickyPortProject(fixture, { name: 'lifecycle-port-timeout', port });
    assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'port-timeout']).status, 0);
    const started = fixture.runCliJson(['start', 'port-timeout:dev']);
    assert.equal(started.status, 0, cliFailureMessage(started));

    const restarted = fixture.runGlobalCliJson(['restart', 'port-timeout:dev'], { timeout: 12_000 });

    assert.equal(restarted.status, 1);
    assert.equal(errorCode(restarted.json), 'port_release_timeout');
    assert.equal(runById(fixture.homeDir, started.json.process.runId).status, 'stop_failed');
    assertEventIncludes(fixture.homeDir, {
      type: 'restart.failed',
      code: 'port_release_timeout',
      runId: started.json.process.runId
    });
  });
});

test('stop --json preserves stop_failed evidence when termination does not complete', async () => {
  await withLifecycleFixture(async ({ fixture }) => {
    const port = await getFreePort();
    writeIgnoringStopProject(fixture, { name: 'lifecycle-stop-failed', port });
    assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'stop-failed']).status, 0);
    const started = fixture.runCliJson(['start', 'stop-failed:dev']);
    assert.equal(started.status, 0, cliFailureMessage(started));

    const stopped = fixture.runGlobalCliJson(['stop', 'stop-failed:dev'], { timeout: 12_000 });

    assert.equal(stopped.status, 1);
    assert.equal(errorCode(stopped.json), 'stop_failed');
    assert.equal(runById(fixture.homeDir, started.json.process.runId).status, 'stop_failed');
    assertEventIncludes(fixture.homeDir, {
      type: 'stop.failed',
      code: 'stop_failed',
      runId: started.json.process.runId
    });
  });
});

async function withLifecycleFixture(callback) {
  const fixture = createControlPlaneFixture();
  const children = [];
  try {
    await callback({
      fixture,
      trackChild: (child) => {
        children.push(child);
        return child;
      }
    });
  } finally {
    fixture.runCli(['stop', '--json'], { timeout: 5_000 });
    killFixtureProcesses(fixture);
    for (const child of children) {
      await stopChild(child);
    }
    killRecordedChild(fixture.path('tmp', 'sticky-child.pid'));
    fixture.cleanup();
  }
}

function writeReadyProject(fixture, { name, port }) {
  fixture.writeConfig({
    version: 1,
    project: { name },
    tasks: {
      dev: {
        command: `node scripts/ready-http.js ${port}`,
        longRunning: true,
        ports: [port],
        ready: {
          type: 'http',
          url: `http://127.0.0.1:${port}/health`,
          timeoutMs: 2_000
        },
        risk: 'low'
      }
    },
    clean: {
      safe: [],
      risky: []
    }
  });
  fixture.writeScript('scripts/ready-http.js', readyHttpScript());
}

function writeIgnoringStopProject(fixture, { name, port }) {
  fixture.writeConfig({
    version: 1,
    project: { name },
    tasks: {
      dev: {
        command: `node scripts/takeover-parent.js ${port}`,
        longRunning: true,
        ports: [port],
        ready: {
          type: 'http',
          url: `http://127.0.0.1:${port}/health`,
          timeoutMs: 2_000
        },
        risk: 'low'
      }
    },
    clean: {
      safe: [],
      risky: []
    }
  });
  fixture.writeScript('scripts/takeover-parent.js', `
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const port = Number(process.argv[2]);
fs.mkdirSync('tmp', { recursive: true });
const child = spawn(process.execPath, ['scripts/takeover-child.js', String(port)], {
  cwd: process.cwd(),
  detached: true,
  stdio: 'ignore',
  windowsHide: true
});
child.unref();
fs.writeFileSync(path.join('tmp', 'sticky-child.pid'), String(child.pid));
const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, pid: process.pid }));
    return;
  }
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('ready');
});
server.listen(port, '127.0.0.1');
`);
  fixture.writeScript('scripts/takeover-child.js', `
import http from 'node:http';
const port = Number(process.argv[2]);
function tryListen() {
  const server = http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, pid: process.pid, takeover: true }));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('takeover');
  });
  server.once('error', () => {
    setTimeout(tryListen, 10);
  });
  server.listen(port, '127.0.0.1');
}
tryListen();
`);
}

function writeStickyPortProject(fixture, { name, port }) {
  fixture.writeConfig({
    version: 1,
    project: { name },
    tasks: {
      dev: {
        command: `node scripts/sticky-parent.js ${port}`,
        longRunning: true,
        ports: [port],
        ready: {
          type: 'http',
          url: `http://127.0.0.1:${port}/health`,
          timeoutMs: 2_000
        },
        risk: 'low'
      }
    },
    clean: {
      safe: [],
      risky: []
    }
  });
  fixture.writeScript('scripts/sticky-parent.js', `
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const port = process.argv[2];
fs.mkdirSync('tmp', { recursive: true });
const child = spawn(process.execPath, ['scripts/sticky-child.js', port], {
  cwd: process.cwd(),
  detached: true,
  stdio: 'ignore',
  windowsHide: true
});
child.unref();
fs.writeFileSync(path.join('tmp', 'sticky-child.pid'), String(child.pid));
setInterval(() => {}, 1000);
`);
  fixture.writeScript('scripts/sticky-child.js', readyHttpScript());
}

function readyHttpScript() {
  return `
import fs from 'node:fs';
import http from 'node:http';
const port = Number(process.argv[2]);
fs.mkdirSync('tmp', { recursive: true });
const countPath = 'tmp/ready-start-count.txt';
const current = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, 'utf8')) : 0;
fs.writeFileSync(countPath, String(current + 1));
fs.writeFileSync('tmp/ready-env.json', JSON.stringify({
  LAUNCHDECK_HOME: process.env.LAUNCHDECK_HOME,
  LAUNCHDECK_PROJECT_ID: process.env.LAUNCHDECK_PROJECT_ID,
  LAUNCHDECK_RUN_ID: process.env.LAUNCHDECK_RUN_ID,
  LAUNCHDECK_TASK: process.env.LAUNCHDECK_TASK
}));
const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, pid: process.pid }));
    return;
  }
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('ready');
});
server.listen(port, '127.0.0.1');
`;
}

function spawnExternalServer(fixture, port) {
  fixture.writeScript('scripts/unmanaged-server.js', readyHttpScript());
  return spawn(process.execPath, ['scripts/unmanaged-server.js', String(port)], {
    cwd: fixture.projectRoot,
    stdio: 'ignore',
    windowsHide: true
  });
}

function runRecord({ runId, project, fixture, port, pid, command, cwd = fixture.projectRoot, ownershipConfidence, ownershipProof }) {
  return {
    runId,
    transactionId: `tx_${runId}`,
    projectId: project.projectId ?? project.id,
    projectAlias: project.alias,
    projectRoot: fixture.projectRoot,
    task: 'dev',
    command,
    cwd,
    pid,
    status: 'running',
    ownershipConfidence,
    ownershipProof,
    declaredPorts: [port],
    logPath: fixture.path('.launchdeck', 'logs', 'dev.log'),
    startedAt: '2026-07-09T00:00:00.000Z',
    lastObservedAt: '2026-07-09T00:00:01.000Z'
  };
}

function readRunIndex(homeDir) {
  return JSON.parse(fs.readFileSync(path.join(homeDir, 'runtime', 'runs.json'), 'utf8'));
}

function writeRunIndex(homeDir, runIndex) {
  const runsPath = path.join(homeDir, 'runtime', 'runs.json');
  fs.mkdirSync(path.dirname(runsPath), { recursive: true });
  fs.writeFileSync(runsPath, `${JSON.stringify(runIndex, null, 2)}\n`);
}

function writeRuntimeState(fixture, state) {
  const statePath = fixture.path('.launchdeck', 'runtime', 'state.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function rewriteRun(homeDir, runId, mapper) {
  const runIndex = readRunIndex(homeDir);
  writeRunIndex(homeDir, {
    ...runIndex,
    runs: runIndex.runs.map((run) => run.runId === runId ? mapper(run) : run)
  });
}

function runById(homeDir, runId) {
  const run = readRunIndex(homeDir).runs.find((candidate) => candidate.runId === runId);
  assert.ok(run, `Expected run index to include ${runId}`);
  return run;
}

function assertRunStatus(homeDir, runId, status) {
  assert.equal(runById(homeDir, runId).status, status);
}

function assertEventIncludes(homeDir, expected) {
  const eventsPath = path.join(homeDir, 'events', 'events.jsonl');
  assert.equal(fs.existsSync(eventsPath), true, `Expected events file at ${eventsPath}`);
  const events = fs.readFileSync(eventsPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.ok(
    events.some((event) =>
      Object.entries(expected).every(([key, value]) => event[key] === value)
    ),
    `Expected event ${JSON.stringify(expected)}, got ${JSON.stringify(events)}`
  );
}

function payloadData(payload) {
  return payload.data ?? payload;
}

function errorCode(payload) {
  return payload.code ?? payload.error?.code;
}

function assertNextActionIncludes(payload, expected) {
  const next = payload.next ?? payload.error?.details?.next ?? payload.details?.next ?? payloadData(payload).next ?? [];
  assert.ok(
    Array.isArray(next) && next.some((action) => JSON.stringify(action).includes(expected)),
    `Expected next action containing ${expected}, got ${JSON.stringify(next)}`
  );
}

function cliFailureMessage(result) {
  return [
    `status=${result.status}`,
    `stdout=${result.stdout.trim()}`,
    `stderr=${result.stderr.trim()}`
  ].join('\n');
}

async function getFreePort() {
  const server = net.createServer();
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await waitForPortFree(port);
  return port;
}

async function waitForPortFree(port) {
  const deadline = Date.now() + 2_000;
  while (Date.now() <= deadline) {
    if (await canListen(port)) {
      return;
    }
    await delay(50);
  }
  throw new Error(`Port ${port} did not become available for test setup.`);
}

async function waitForPortListening(port) {
  const deadline = Date.now() + 2_000;
  while (Date.now() <= deadline) {
    if (await canConnect(port)) {
      return;
    }
    await delay(50);
  }
  throw new Error(`Port ${port} did not start listening for test setup.`);
}

function canListen(port) {
  const server = net.createServer();
  return new Promise((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function killFixtureProcesses(fixture) {
  const statePath = fixture.path('.launchdeck', 'runtime', 'state.json');
  if (!fs.existsSync(statePath)) {
    return;
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return;
  }

  for (const processInfo of Object.values(state.processes ?? {})) {
    const pid = Number(processInfo?.pid);
    if (Number.isInteger(pid) && pid > 0) {
      killPid(pid);
    }
  }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(1_000).then(() => false)
  ]);
  if (!exited) {
    child.kill('SIGKILL');
  }
}

function killRecordedChild(pidPath) {
  if (!fs.existsSync(pidPath)) {
    return;
  }
  const pid = Number(fs.readFileSync(pidPath, 'utf8'));
  if (Number.isInteger(pid) && pid > 0) {
    killPid(pid);
  }
}

function killPid(pid) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error?.code === 'ESRCH') {
      return;
    }
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
}
