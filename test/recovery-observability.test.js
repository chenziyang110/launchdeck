import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { cliPath } from './helpers/cli-fixture.js';
import { createManagedProjectFixture } from './helpers/control-plane-fixture.js';

test('logs project:task continues to read existing managed log content', async () => {
  await withRecoveryFixture(async ({ fixture }) => {
    const port = await getFreePort();
    createManagedProject(fixture, {
      name: 'recovery-logs-existing',
      alias: 'recovery-logs-existing',
      port
    });
    startManagedFixture(fixture, 'recovery-logs-existing');

    const logs = fixture.runGlobalCliJson(['logs', 'recovery-logs-existing:dev', '--lines', '20']);

    assert.equal(logs.status, 0, cliFailureMessage(logs));
    assert.equal(logs.json.command, 'logs');
    assert.equal(payloadData(logs.json).project.name, 'recovery-logs-existing');
    assert.equal(payloadData(logs.json).task, 'dev');
    assert.equal(payloadData(logs.json).logPath, fixture.path('.launchdeck', 'logs', 'dev.log'));
    assert.match(payloadData(logs.json).content, /\[launchdeck\] starting dev/);
    assert.match(payloadData(logs.json).content, /ready port=/);
  });
});

test('status --all marks a disappeared owned run as stale with reconcile next action', async () => {
  await withRecoveryFixture(async ({ fixture }) => {
    const port = await getFreePort();
    createManagedProject(fixture, {
      name: 'recovery-stale-status',
      alias: 'recovery-stale-status',
      port
    });
    const started = startManagedFixture(fixture, 'recovery-stale-status');
    await stopFixtureOwnedPid(started.json.process.pid);

    const status = fixture.runGlobalCliJson(['status', '--all']);

    assert.equal(status.status, 0, cliFailureMessage(status));
    const run = findRun(payloadData(status.json).runs, started.json.process.runId);
    assert.equal(run.status, 'stale');
    assertNextActionIncludes(run, 'launchdeck reconcile recovery-stale-status:dev');
    assertNextActionIncludes(run, `launchdeck inspect run:${started.json.process.runId}`);
  });
});

test('reconcile --json marks stale runs without killing a new external listener on the same port', async () => {
  await withRecoveryFixture(async ({ fixture, trackChild }) => {
    const port = await getFreePort();
    createManagedProject(fixture, {
      name: 'recovery-reconcile',
      alias: 'recovery-reconcile',
      port
    });
    const started = startManagedFixture(fixture, 'recovery-reconcile');
    await stopFixtureOwnedPid(started.json.process.pid);
    const external = spawnExternalServer(fixture, port);
    trackChild(external);
    await waitForPortListening(port);

    const reconciled = fixture.runGlobalCliJson(['reconcile', 'recovery-reconcile:dev']);

    assert.equal(reconciled.status, 0, cliFailureMessage(reconciled));
    assert.equal(reconciled.json.command, 'reconcile');
    const data = payloadData(reconciled.json);
    assert.equal(Array.isArray(data.staleRuns), true);
    assert.equal(data.staleRuns.some((run) => run.runId === started.json.process.runId), true);
    assert.equal(Array.isArray(data.updatedRuns), true);
    assert.equal(data.updatedRuns.some((run) => run.runId === started.json.process.runId && run.status === 'stale'), true);
    assert.equal(Array.isArray(data.events), true);
    assert.equal(await canConnect(port), true);
    assert.equal(isPidRunning(external.pid), true);
  });
});

test('events --json reads bounded structured event history for a target', async () => {
  await withRecoveryFixture(async ({ fixture }) => {
    createManagedProject(fixture, {
      name: 'recovery-events',
      alias: 'recovery-events',
      port: await getFreePort()
    });
    const project = payloadData(fixture.runGlobalCliJson(['projects']).json).projects[0];
    writeEvent(fixture.homeDir, {
      eventId: 'evt_recovery_started',
      transactionId: 'tx_recovery_events',
      timestamp: '2026-07-09T00:00:00.000Z',
      level: 'info',
      type: 'run.started',
      projectId: project.projectId,
      alias: project.alias,
      task: 'dev',
      runId: 'run_recovery_events',
      message: 'Task started.',
      data: {},
      next: []
    });
    writeEvent(fixture.homeDir, {
      eventId: 'evt_recovery_ready',
      transactionId: 'tx_recovery_events',
      timestamp: '2026-07-09T00:00:01.000Z',
      level: 'info',
      type: 'run.ready',
      projectId: project.projectId,
      alias: project.alias,
      task: 'dev',
      runId: 'run_recovery_events',
      message: 'Task ready.',
      data: {},
      next: []
    });

    const events = fixture.runGlobalCliJson(['events', 'recovery-events:dev', '--lines', '10']);

    assert.equal(events.status, 0, cliFailureMessage(events));
    assert.equal(events.json.command, 'events');
    assert.deepEqual(payloadData(events.json).events.map((event) => event.eventId), [
      'evt_recovery_started',
      'evt_recovery_ready'
    ]);
    assert.equal(payloadData(events.json).events.every((event) => event.schemaVersion === 1), true);
  });
});

test('logs --follow --json emits visible JSON Lines for appended managed log output', async () => {
  await withRecoveryFixture(async ({ fixture }) => {
    const port = await getFreePort();
    createManagedProject(fixture, {
      name: 'recovery-follow',
      alias: 'recovery-follow',
      port
    });
    const started = startManagedFixture(fixture, 'recovery-follow');
    const follower = spawnLaunchdeck(fixture, ['logs', 'recovery-follow:dev', '--follow', '--json']);
    try {
      const linePromise = waitForJsonLine(follower, (line) =>
        line.type === 'log.line' && line.line.includes('follow-visible-line')
      );
      fs.appendFileSync(fixture.path('.launchdeck', 'logs', 'dev.log'), 'follow-visible-line\n');
      const line = await linePromise;

      assert.equal(line.schemaVersion, 1);
      assert.equal(line.runId, started.json.process.runId);
      assert.equal(line.task, 'dev');
      assert.equal(line.projectId, started.json.project.id);
      assert.equal(typeof line.timestamp, 'string');
    } finally {
      await stopChild(follower);
    }
  });
});

test('clean --safe preserves running logs latest failed logs and failure-linked events', async () => {
  await withRecoveryFixture(async ({ fixture }) => {
    const port = await getFreePort();
    createManagedProject(fixture, {
      name: 'recovery-retention',
      alias: 'recovery-retention',
      port,
      clean: {
        safe: ['cache', '.launchdeck/logs'],
        risky: []
      }
    });
    const started = startManagedFixture(fixture, 'recovery-retention');
    const runningLogPath = fixture.path('.launchdeck', 'logs', 'dev.log');
    const failedLogPath = fixture.path('.launchdeck', 'logs', 'dev.failed.log');
    fixture.writeFile('cache/value.txt', 'remove me');
    fixture.writeFile('.launchdeck/logs/dev.failed.log', 'latest failed evidence\n');
    writeEvent(fixture.homeDir, {
      eventId: 'evt_recovery_stop_failed',
      transactionId: started.json.process.transactionId,
      timestamp: '2026-07-09T00:00:02.000Z',
      level: 'error',
      type: 'stop.failed',
      projectId: started.json.project.id,
      alias: 'recovery-retention',
      task: 'dev',
      runId: started.json.process.runId,
      status: 'stop_failed',
      code: 'stop_failed',
      message: 'Stop failed.',
      data: { logPath: failedLogPath },
      next: []
    });

    const cleaned = fixture.runGlobalCliJson(['clean', '--safe'], { cwd: fixture.projectRoot });

    assert.equal(cleaned.status, 0, cliFailureMessage(cleaned));
    assert.equal(fs.existsSync(fixture.path('cache')), false);
    assert.equal(fs.existsSync(runningLogPath), true);
    assert.match(fs.readFileSync(runningLogPath, 'utf8'), /\[launchdeck\] starting dev/);
    assert.equal(fs.existsSync(failedLogPath), true);
    assert.match(fs.readFileSync(eventsPath(fixture.homeDir), 'utf8'), /evt_recovery_stop_failed/);
  });
});

test('logs --follow --json redacts secret-looking managed output before streaming', async () => {
  await withRecoveryFixture(async ({ fixture }) => {
    const secret = 'ld_secret_value_must_not_stream';
    const port = await getFreePort();
    createManagedProject(fixture, {
      name: 'recovery-follow-redaction',
      alias: 'recovery-follow-redaction',
      port,
      server: {
        secret
      }
    });
    startManagedFixture(fixture, 'recovery-follow-redaction');
    const follower = spawnLaunchdeck(fixture, ['logs', 'recovery-follow-redaction:dev', '--follow', '--json']);
    try {
      const linePromise = waitForJsonLine(follower, (line) =>
        line.type === 'log.line' && line.line.includes('API_TOKEN')
      );
      fs.appendFileSync(fixture.path('.launchdeck', 'logs', 'dev.log'), `API_TOKEN=${secret}\n`);
      const line = await linePromise;

      assert.equal(line.schemaVersion, 1);
      assert.equal(line.line.includes(secret), false);
      assert.match(line.line, /API_TOKEN=\[REDACTED\]/);
    } finally {
      await stopChild(follower);
    }
  });
});

async function withRecoveryFixture(callback) {
  const fixture = createManagedProjectFixture();
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
    await stopRecordedFixtureProcesses(fixture);
    for (const child of children) {
      await stopChild(child);
    }
    fixture.cleanup();
  }
}

function createManagedProject(fixture, options) {
  fixture.writeConfig({
    version: 1,
    project: {
      name: options.name
    },
    tasks: {
      dev: {
        command: `node scripts/dev-server.js ${options.port}`,
        longRunning: true,
        ports: [options.port],
        ready: {
          type: 'http',
          url: `http://127.0.0.1:${options.port}/health`,
          timeoutMs: 2_000
        },
        risk: 'low'
      }
    },
    clean: options.clean ?? {
      safe: [],
      risky: []
    }
  });
  fixture.writeScript('scripts/dev-server.js', serverScript(options.server ?? {}));
  const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', options.alias]);
  assert.equal(added.status, 0, cliFailureMessage(added));
}

function startManagedFixture(fixture, alias) {
  const started = fixture.runCliJson(['start', `${alias}:dev`]);
  assert.equal(started.status, 0, cliFailureMessage(started));
  return started;
}

function serverScript(options = {}) {
  const secretLine = options.secret
    ? `console.log('server-visible-started');\n`
    : '';
  return `
import http from 'node:http';
const port = Number(process.argv[2]);
${secretLine}
const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, pid: process.pid }));
    return;
  }
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('ready');
});
server.listen(port, '127.0.0.1', () => {
  console.log(\`ready port=\${port} pid=\${process.pid}\`);
});
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
`;
}

function spawnExternalServer(fixture, port) {
  fixture.writeScript('scripts/external-server.js', serverScript());
  return spawn(process.execPath, ['scripts/external-server.js', String(port)], {
    cwd: fixture.projectRoot,
    stdio: 'ignore',
    windowsHide: true
  });
}

function spawnLaunchdeck(fixture, args) {
  return spawn(process.execPath, [cliPath, ...args], {
    cwd: fixture.homeDir,
    env: {
      ...process.env,
      ...fixture.env
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
}

function waitForJsonLine(child, predicate, timeoutMs = 4_000) {
  let stdout = '';
  let stderr = '';
  const parsed = [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for JSONL. stdout=${stdout.trim()} stderr=${stderr.trim()}`));
    }, timeoutMs);

    const onStdout = (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? '';
      for (const line of lines.filter(Boolean)) {
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        parsed.push(event);
        if (predicate(event)) {
          cleanup();
          resolve(event);
          return;
        }
      }
    };
    const onStderr = (chunk) => {
      stderr += chunk.toString();
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`Follow process exited before expected JSONL: code=${code} signal=${signal} parsed=${JSON.stringify(parsed)} stderr=${stderr.trim()}`));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
      child.off('error', onError);
    };

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function writeEvent(homeDir, event) {
  fs.mkdirSync(path.dirname(eventsPath(homeDir)), { recursive: true });
  fs.appendFileSync(eventsPath(homeDir), `${JSON.stringify({ schemaVersion: 1, ...event })}\n`);
}

function eventsPath(homeDir) {
  return path.join(homeDir, 'events', 'events.jsonl');
}

function findRun(runs, runId) {
  assert.equal(Array.isArray(runs), true, `Expected runs array, got ${JSON.stringify(runs)}`);
  const run = runs.find((candidate) => candidate.runId === runId);
  assert.ok(run, `Expected runs to include ${runId}, got ${JSON.stringify(runs)}`);
  return run;
}

function assertNextActionIncludes(subject, expected) {
  const next = subject.next ?? subject.safeActions ?? [];
  assert.ok(
    Array.isArray(next) && next.some((action) => JSON.stringify(action).includes(expected)),
    `Expected next action containing ${expected}, got ${JSON.stringify(next)}`
  );
}

async function stopFixtureOwnedPid(pid) {
  assert.equal(Number.isInteger(pid) && pid > 0, true, `Expected fixture-owned pid, got ${pid}`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      throw error;
    }
  }
  await waitForPidExit(pid);
}

async function stopRecordedFixtureProcesses(fixture) {
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
      try {
        process.kill(pid, 'SIGTERM');
      } catch (error) {
        if (error?.code !== 'ESRCH') {
          throw error;
        }
      }
      await waitForPidExit(pid).catch(() => undefined);
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

async function waitForPidExit(pid, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!isPidRunning(pid)) {
      return;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for pid ${pid} to exit.`);
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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

function payloadData(payload) {
  return payload.data ?? payload;
}

function cliFailureMessage(result) {
  return [
    `status=${result.status}`,
    `stdout=${result.stdout.trim()}`,
    `stderr=${result.stderr.trim()}`
  ].join('\n');
}
