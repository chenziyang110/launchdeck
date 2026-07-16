import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCliFixture } from './helpers/cli-fixture.js';

const runtimeLockPath = path.join(os.tmpdir(), 'launchdeck-managed-runtime-test.lock');
const runtimeLockStaleMs = 300_000;

test('dev --json starts the default managed task with a lifecycle envelope', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);

    const result = fixture.runCliJson(['dev']);

    assert.equal(result.status, 0, result.stderr);
    assertManagedStartEnvelope(result.json, 'dev', 'dev', fixture);
  });
});

test('start --json starts a named managed task with a lifecycle envelope', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);

    const result = fixture.runCliJson(['start', 'api']);

    assert.equal(result.status, 0, result.stderr);
    assertManagedStartEnvelope(result.json, 'start', 'api', fixture);
  });
});

test('start --json returns run identity and readiness fields for the managed run', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);

    const result = fixture.runCliJson(['start', 'dev']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.json.process.runId, /^run_[A-Za-z0-9_-]+$/);
    assert.match(result.json.process.transactionId, /^tx_[A-Za-z0-9_-]+$/);
    assert.ok(['starting', 'running', 'ready'].includes(result.json.process.status));
    assert.ok(result.json.readiness, 'start payload should include readiness state');
    assert.equal(result.json.readiness.status, 'running');
  });
});

test('start --json injects launchdeck run markers into the managed task environment', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);

    const result = fixture.runCliJson(['start', 'dev']);
    assert.equal(result.status, 0, result.stderr);
    const env = await readJsonWhenReady(fixture.path('tmp', 'dev-env.json'));

    assert.equal(env.LAUNCHDECK_TASK, 'dev');
    assert.equal(env.LAUNCHDECK_RUN_ID, result.json.process.runId);
    assert.equal(env.LAUNCHDECK_HOME, result.json.process.launchdeckHome);
    assert.equal(env.LAUNCHDECK_PROJECT_ID, result.json.process.projectId);
  });
});

test('start --json treats a second owned start as idempotent without spawning another process', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);
    const first = fixture.runCliJson(['start', 'dev']);
    assert.equal(first.status, 0, first.stderr);

    const second = fixture.runCliJson(['start', 'dev']);

    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.json.process.runId, first.json.process.runId);
    assert.equal(second.json.process.pid, first.json.process.pid);
    assert.equal(second.json.process.spawned, false);
    assert.equal(Number(fs.readFileSync(fixture.path('tmp', 'dev-start-count.txt'), 'utf8')), 1);
  });
});

test('restart --json reports partial_failure when stop succeeds but start fails', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);
    const started = fixture.runCliJson(['start', 'dev']);
    assert.equal(started.status, 0, started.stderr);
    writeManagedConfig(fixture, {
      dev: {
        cwd: 'missing-dir'
      }
    });

    const restarted = fixture.runCliJson(['restart', 'dev']);

    assert.equal(restarted.status, 1);
    assert.equal(restarted.json.ok, false);
    assert.equal(restarted.json.command, 'restart');
    assert.equal(restarted.json.status, 'partial');
    assert.equal(restarted.json.error.code, 'partial_failure');
    assert.equal(Array.isArray(restarted.json.results), true);
    assert.deepEqual(
      restarted.json.results.map((entry) => [entry.task, entry.status]),
      [
        ['dev', 'stopped'],
        ['dev', 'start_failed']
      ]
    );
  });
});

test('ps --json refreshes managed records without deleting stale evidence', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);
    const started = fixture.runCliJson(['start', 'dev']);
    assert.equal(started.status, 0, started.stderr);

    const result = fixture.runCliJson(['ps']);

    assert.equal(result.status, 0, result.stderr);
    assertSuccessEnvelope(result.json, 'ps', fixture);
    assert.equal(result.json.processes.length, 1);
    assert.equal(result.json.processes[0].task, 'dev');
    assert.equal(result.json.processes[0].status, 'running');
    assert.equal(typeof result.json.processes[0].lastRefresh, 'string');
  });
});

test('ps --json reports runtime_state_invalid with config context when state JSON is corrupt', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);
    fixture.writeFile('.launchdeck/runtime/state.json', '{ invalid json');

    const result = fixture.runCliJson(['ps']);

    assert.equal(result.status, 1);
    assert.equal(result.json.ok, false);
    assert.equal(result.json.command, 'ps');
    assert.equal(result.json.status, 'error');
    assert.equal(result.json.error.code, 'runtime_state_invalid');
    assert.equal(result.json.projectRoot, fixture.projectRoot);
    assert.equal(result.json.configPath, fixture.path('.launchdeck.yml'));
  });
});

test('logs --json returns managed log content using the contract payload names', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);
    const started = fixture.runCliJson(['start', 'dev']);
    assert.equal(started.status, 0, started.stderr);

    const result = fixture.runCliJson(['logs', 'dev']);

    assert.equal(result.status, 0, result.stderr);
    assertSuccessEnvelope(result.json, 'logs', fixture);
    assert.equal(result.json.task, 'dev');
    assert.equal(result.json.logPath, fixture.path('.launchdeck', 'logs', 'dev.log'));
    assert.match(result.json.content, /command: node scripts\/dev\.js|command: node scripts\\dev\.js/);
  });
});

test('stop <task> --json stops one managed task with a process payload', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);
    const started = fixture.runCliJson(['start', 'dev']);
    assert.equal(started.status, 0, started.stderr);

    const result = fixture.runCliJson(['stop', 'dev']);

    assert.equal(result.status, 0, result.stderr);
    assertSuccessEnvelope(result.json, 'stop', fixture);
    assert.equal(result.json.process.task, 'dev');
    assert.equal(result.json.process.status, 'stopped');
    assert.equal(typeof result.json.process.stoppedAt, 'string');
  });
});

test('stop --json stops all running managed tasks with per-task results', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);
    const dev = fixture.runCliJson(['start', 'dev']);
    const api = fixture.runCliJson(['start', 'api']);
    assert.equal(dev.status, 0, dev.stderr);
    assert.equal(api.status, 0, api.stderr);

    const result = fixture.runCliJson(['stop']);

    assert.equal(result.status, 0, result.stderr);
    assertSuccessEnvelope(result.json, 'stop', fixture);
    assert.deepEqual(
      result.json.results.map((entry) => [entry.task, entry.ok, entry.status]),
      [
        ['api', true, 'stopped'],
        ['dev', true, 'stopped']
      ]
    );
  });
});

test('start --json rejects foreground tasks with task_not_managed', async () => {
  await withFixture(async (fixture) => {
    writeManagedConfig(fixture);

    const result = fixture.runCliJson(['start', 'build']);

    assert.equal(result.status, 1);
    assertFailureEnvelope(result.json, 'start', 'task_not_managed', fixture);
    assert.equal(result.json.error.details.task, 'build');
  });
});

async function withFixture(callback) {
  return await withRuntimeLock(async () => {
    const fixture = createCliFixture();
    try {
      return await callback(fixture);
    } finally {
      fixture.runCli(['stop', '--json'], { timeout: 5_000 });
      killFixtureProcesses(fixture);
      fixture.cleanup();
    }
  });
}

async function withRuntimeLock(callback) {
  const lockHandle = await acquireRuntimeLock();
  try {
    return await callback();
  } finally {
    releaseRuntimeLock(lockHandle);
  }
}

async function acquireRuntimeLock() {
  const deadline = Date.now() + 180_000;
  while (Date.now() <= deadline) {
    try {
      const lockHandle = fs.openSync(runtimeLockPath, 'wx');
      fs.writeFileSync(lockHandle, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return lockHandle;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
      removeStaleRuntimeLock();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Timed out waiting for Launchdeck managed runtime test lock: ${runtimeLockPath}`);
}

function removeStaleRuntimeLock() {
  try {
    const stats = fs.statSync(runtimeLockPath);
    if (Date.now() - stats.mtimeMs > runtimeLockStaleMs) {
      fs.rmSync(runtimeLockPath, { force: true });
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

function releaseRuntimeLock(lockHandle) {
  fs.closeSync(lockHandle);
  fs.rmSync(runtimeLockPath, { force: true });
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

  const pids = Object.values(state.processes ?? {}).map((processInfo) => Number(processInfo?.pid));
  for (const pid of pids) {
    if (!Number.isInteger(pid) || pid <= 0) {
      continue;
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
    }
  }
  waitForFixtureProcessesToExit(pids);
}

function waitForFixtureProcessesToExit(pids) {
  const livePids = pids.filter((pid) => Number.isInteger(pid) && pid > 0);
  const deadline = Date.now() + 2_000;
  while (Date.now() <= deadline) {
    const stillRunning = livePids.some((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });
    if (!stillRunning) {
      return;
    }
    sleepSync(50);
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function managedConfig(overrides = {}) {
  return {
    version: 1,
    project: {
      name: 'managed-cli-contract'
    },
    tasks: {
      build: {
        command: "node -e \"require('fs').writeFileSync('build-started.txt', 'yes')\"",
        risk: 'low',
        ...overrides.build
      },
      dev: {
        command: 'node scripts/dev.js',
        longRunning: true,
        ports: [4173],
        risk: 'low',
        ...overrides.dev
      },
      api: {
        command: 'node scripts/api.js',
        longRunning: true,
        ports: [4180],
        risk: 'low',
        ...overrides.api
      }
    },
    clean: {
      safe: [],
      risky: []
    }
  };
}

function writeManagedConfig(fixture, overrides = {}) {
  fixture.writeConfig(managedConfig(overrides));
  fixture.writeScript('scripts/dev.js', `
import fs from 'node:fs';
fs.mkdirSync('tmp', { recursive: true });
const countPath = 'tmp/dev-start-count.txt';
const current = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, 'utf8')) : 0;
fs.writeFileSync(countPath, String(current + 1));
fs.writeFileSync('tmp/dev-env.json', JSON.stringify({
  LAUNCHDECK_HOME: process.env.LAUNCHDECK_HOME,
  LAUNCHDECK_PROJECT_ID: process.env.LAUNCHDECK_PROJECT_ID,
  LAUNCHDECK_RUN_ID: process.env.LAUNCHDECK_RUN_ID,
  LAUNCHDECK_TASK: process.env.LAUNCHDECK_TASK
}));
setInterval(() => {}, 1000);
`);
  fixture.writeScript('scripts/api.js', 'setInterval(() => {}, 1000);');
}

function assertManagedStartEnvelope(payload, command, task, fixture) {
  assertSuccessEnvelope(payload, command, fixture);
  assert.equal(payload.task, task);
  assert.equal(payload.process.task, task);
  assert.equal(payload.process.command, managedConfig().tasks[task].command);
  assert.equal(payload.process.cwd, fixture.projectRoot);
  assert.equal(payload.process.status, 'running');
  assert.equal(payload.process.logPath, fixture.path('.launchdeck', 'logs', `${task}.log`));
  assert.equal(typeof payload.process.pid, 'number');
  assert.equal(typeof payload.process.startedAt, 'string');
}

function assertSuccessEnvelope(payload, command, fixture) {
  assert.equal(payload.ok, true);
  assert.equal(payload.command, command);
  assert.equal(payload.status, 'ok');
  assert.equal(payload.projectRoot, fixture.projectRoot);
  assert.equal(payload.configPath, fixture.path('.launchdeck.yml'));
}

function assertFailureEnvelope(payload, command, code, fixture) {
  assert.equal(payload.ok, false);
  assert.equal(payload.command, command);
  assert.equal(payload.status, 'error');
  assert.equal(payload.error.code, code);
  assert.equal(typeof payload.error.message, 'string');
  assert.equal(payload.projectRoot, fixture.projectRoot);
  assert.equal(payload.configPath, fixture.path('.launchdeck.yml'));
}

async function readJsonWhenReady(filePath) {
  const deadline = Date.now() + 2_000;
  while (Date.now() <= deadline) {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for fixture JSON: ${filePath}`);
}
