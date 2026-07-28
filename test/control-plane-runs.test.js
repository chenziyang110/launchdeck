import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildGlobalStatus, listGlobalRuns } from '../src/control-plane/inspect.js';
import { readRunIndex } from '../src/control-plane/runs.js';
import { controlPlanePaths } from '../src/control-plane/state.js';
import { createControlPlaneFixture } from './helpers/control-plane-fixture.js';

test('run index collapses repeated run and operation records to their newest observation', () => {
  const fixture = createControlPlaneFixture();
  try {
    writeRunIndex(fixture.env, [
      runRecord({
        runId: 'run_repeated',
        operationId: 'op_repeated',
        status: 'starting',
        lastObservedAt: '2026-07-28T00:00:00.000Z'
      }),
      runRecord({
        runId: 'run_repeated',
        operationId: 'op_repeated',
        status: 'running',
        lastObservedAt: '2026-07-28T00:00:01.000Z'
      }),
      runRecord({
        runId: 'run_operation_retry',
        operationId: 'op_repeated',
        status: 'stopped',
        lastObservedAt: '2026-07-28T00:00:02.000Z'
      })
    ]);

    const index = readRunIndex(fixture.env);

    assert.equal(index.runs.length, 1);
    assert.equal(index.runs[0].runId, 'run_operation_retry');
    assert.equal(index.runs[0].status, 'stopped');
  } finally {
    fixture.cleanup();
  }
});

test('global status uses one de-duplicated observed snapshot for runs, processes, and summary', async () => {
  const fixture = createControlPlaneFixture();
  try {
    fixture.writeConfig({
      version: 1,
      project: { name: 'consistent-global-status' },
      tasks: {
        dev: {
          command: 'node scripts/dev.js',
          longRunning: true,
          ports: [],
          risk: 'low'
        }
      },
      clean: { safe: [], risky: [] }
    });
    assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'consistent']).status, 0);

    const deadPid = 2_147_483_647;
    const duplicate = runRecord({
      runId: 'run_dead_owned',
      operationId: 'op_dead_owned',
      projectId: fixture.runGlobalCliJson(['projects']).json.projects[0].projectId,
      projectAlias: 'consistent',
      pid: deadPid,
      status: 'running',
      lastObservedAt: '2026-07-28T00:00:03.000Z',
      ownershipConfidence: 'verified-owned',
      ownershipProof: {
        source: 'launchdeck-spawn',
        confidence: 'verified-owned',
        pid: deadPid,
        reasons: ['launchdeck_spawned_process']
      }
    });
    writeRunIndex(fixture.env, [
      { ...duplicate, status: 'starting', lastObservedAt: '2026-07-28T00:00:02.000Z' },
      duplicate
    ]);

    const listedRuns = listGlobalRuns(fixture.env);
    const status = await buildGlobalStatus(fixture.env);

    assert.equal(listedRuns.length, 1);
    assert.equal(listedRuns[0].status, 'stale');
    assert.equal(status.runs.length, 1);
    assert.equal(status.processes.length, 1);
    assert.equal(status.runs[0].status, 'stale');
    assert.equal(status.processes[0].status, 'stale');
    assert.equal(status.summary.processes.total, status.processes.length);
    assert.equal(status.summary.processes.running, 0);
    assert.equal(status.summary.processes.stale, 1);
    assert.equal(status.projects[0].runs.length, 1);
    assert.equal(status.projects[0].processes.length, 1);
    assert.equal(status.projects[0].status, 'stopped');
  } finally {
    fixture.cleanup();
  }
});

function runRecord(overrides = {}) {
  return {
    runId: 'run_fixture',
    transactionId: 'tx_fixture',
    operationId: undefined,
    projectId: 'project_fixture',
    projectAlias: 'fixture',
    projectRoot: 'F:/fixture',
    configPath: 'F:/fixture/.launchdeck.yml',
    task: 'dev',
    command: 'node scripts/dev.js',
    cwd: 'F:/fixture',
    pid: 2_147_483_647,
    status: 'stopped',
    declaredPorts: [],
    startedAt: '2026-07-28T00:00:00.000Z',
    lastObservedAt: '2026-07-28T00:00:00.000Z',
    ...overrides
  };
}

function writeRunIndex(env, runs) {
  const runsPath = controlPlanePaths(env).runsPath;
  fs.mkdirSync(path.dirname(runsPath), { recursive: true });
  fs.writeFileSync(runsPath, `${JSON.stringify({
    version: 1,
    updatedAt: '2026-07-28T00:00:03.000Z',
    runs
  }, null, 2)}\n`);
}
