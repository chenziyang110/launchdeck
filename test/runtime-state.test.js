import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createCliFixture } from './helpers/cli-fixture.js';
import {
  listProcesses,
  runtimePaths,
  startManagedTask,
  stopManagedTasks,
  tailLog
} from '../src/runtime.js';

test('startManagedTask writes the v1 runtime state shape for a managed task', () => {
  withFixture((fixture) => {
    fixture.writeConfig(configWithManagedDev());
    writeManagedDevScript(fixture);

    const processInfo = startManagedTask('dev', configWithManagedDev().tasks.dev, fixture.projectRoot);

    try {
      const state = readRuntimeState(fixture.projectRoot);

      assert.equal(state.version, 1);
      assert.equal(state.projectRoot, fixture.projectRoot);
      assert.equal(typeof state.updatedAt, 'string');
      assert.equal(state.processes.dev.task, 'dev');
      assert.equal(state.processes.dev.command, processInfo.command);
      assert.equal(state.processes.dev.cwd, fixture.projectRoot);
      assert.equal(Number.isInteger(state.processes.dev.pid), true);
      assert.deepEqual(state.processes.dev.ports, [4173]);
      assert.equal(state.processes.dev.logPath, fixture.path('.launchdeck', 'logs', 'dev.log'));
      assert.equal(typeof state.processes.dev.startedAt, 'string');
      assert.equal(typeof state.processes.dev.lastRefresh, 'string');
      assert.equal(state.processes.dev.status, 'running');
    } finally {
      stopManagedTasks(fixture.projectRoot, 'dev');
    }
  });
});

test('ps reports runtime_state_invalid and preserves corrupt state evidence', () => {
  withFixture((fixture) => {
    fixture.writeConfig(configWithManagedDev());
    const { statePath } = runtimePaths(fixture.projectRoot);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, '{not valid json');

    const result = fixture.runCliJson(['ps']);

    assert.equal(result.status, 1);
    assert.equal(result.json.ok, false);
    assert.equal(result.json.error.code, 'runtime_state_invalid');
    assert.equal(fs.readFileSync(statePath, 'utf8'), '{not valid json');
  });
});

test('ps refreshes an exited managed process as stale without deleting its record', () => {
  withFixture((fixture) => {
    fixture.writeConfig(configWithManagedDev());
    writeRuntimeState(fixture.projectRoot, {
      version: 1,
      projectRoot: fixture.projectRoot,
      updatedAt: '2026-07-07T00:00:00.000Z',
      processes: {
        dev: managedRecord(fixture, {
          pid: 0,
          status: 'running',
          lastRefresh: '2026-07-07T00:00:00.000Z'
        })
      }
    });

    const processes = listProcesses(fixture.projectRoot);
    const state = readRuntimeState(fixture.projectRoot);

    assert.equal(processes.length, 1);
    assert.equal(state.processes.dev.task, 'dev');
    assert.equal(state.processes.dev.status, 'stale');
    assert.notEqual(state.processes.dev.lastRefresh, '2026-07-07T00:00:00.000Z');
  });
});

test('logs returns log content after a managed process has exited', () => {
  withFixture((fixture) => {
    fixture.writeConfig(configWithManagedDev());
    const logPath = fixture.path('.launchdeck', 'logs', 'dev.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, 'server ready\nrequest complete');
    writeRuntimeState(fixture.projectRoot, {
      version: 1,
      projectRoot: fixture.projectRoot,
      updatedAt: '2026-07-07T00:00:00.000Z',
      processes: {
        dev: managedRecord(fixture, {
          pid: 0,
          logPath,
          status: 'stale'
        })
      }
    });

    const result = tailLog(fixture.projectRoot, 'dev', 1);

    assert.equal(result.taskName, 'dev');
    assert.equal(result.logPath, logPath);
    assert.match(result.content, /request complete/);
    assert.equal(readRuntimeState(fixture.projectRoot).processes.dev.logPath, logPath);
  });
});

test('stop is idempotent for a stale managed process and preserves the record', () => {
  withFixture((fixture) => {
    fixture.writeConfig(configWithManagedDev());
    writeRuntimeState(fixture.projectRoot, {
      version: 1,
      projectRoot: fixture.projectRoot,
      updatedAt: '2026-07-07T00:00:00.000Z',
      processes: {
        dev: managedRecord(fixture, {
          pid: 0,
          status: 'stale'
        })
      }
    });

    const stopped = stopManagedTasks(fixture.projectRoot, 'dev');
    const state = readRuntimeState(fixture.projectRoot);

    assert.equal(stopped.length, 1);
    assert.equal(stopped[0].status, 'stopped');
    assert.equal(state.processes.dev.status, 'stopped');
    assert.equal(typeof state.processes.dev.stoppedAt, 'string');
  });
});

function withFixture(callback) {
  const fixture = createCliFixture();
  try {
    callback(fixture);
  } finally {
    fixture.cleanup();
  }
}

function configWithManagedDev() {
  return {
    version: 1,
    project: {
      name: 'runtime-state-project'
    },
    tasks: {
      dev: {
        command: 'node scripts/dev.js',
        longRunning: true,
        risk: 'low',
        ports: [4173]
      }
    }
  };
}

function writeManagedDevScript(fixture) {
  fixture.writeScript('scripts/dev.js', 'setInterval(() => {}, 1000);');
}

function managedRecord(fixture, overrides = {}) {
  return {
    task: 'dev',
    command: configWithManagedDev().tasks.dev.command,
    cwd: fixture.projectRoot,
    pid: 0,
    ports: [4173],
    logPath: fixture.path('.launchdeck', 'logs', 'dev.log'),
    startedAt: '2026-07-07T00:00:00.000Z',
    lastRefresh: '2026-07-07T00:00:00.000Z',
    status: 'running',
    ...overrides
  };
}

function readRuntimeState(projectRoot) {
  return JSON.parse(fs.readFileSync(runtimePaths(projectRoot).statePath, 'utf8'));
}

function writeRuntimeState(projectRoot, state) {
  const { statePath } = runtimePaths(projectRoot);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}
