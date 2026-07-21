import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApplicationKernel } from '../../src/kernel/application-kernel.js';
import { createTaskHandlers } from '../../src/kernel/operations/task.js';

test('sequential and synchronized concurrent matching starts converge on one spawn receipt and run', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-kernel-start-concurrency-'));
  const receiptPath = path.join(root, 'spawn.ndjson');
  let activeRun = null;
  const lock = serializedLock();
  const handlers = createTaskHandlers({
    mutations: {
      start: async () => {
        if (activeRun) {
          return {
            run: activeRun,
            reusedExistingRun: true,
            changed: false,
            evidenceRefs: [`file:${receiptPath}`]
          };
        }
        await delay(15);
        activeRun = {
          runId: 'run_converged',
          task: 'managed',
          status: 'ready',
          pid: 5252,
          ports: [45123],
          readiness: { status: 'ready' }
        };
        fs.appendFileSync(receiptPath, `${JSON.stringify({ runId: activeRun.runId, pid: activeRun.pid })}\n`);
        return {
          run: activeRun,
          reusedExistingRun: false,
          changed: true,
          evidenceRefs: [`file:${receiptPath}`]
        };
      }
    }
  });
  const kernel = createApplicationKernel({
    provenance: provenance(),
    handlers,
    projectResolver: () => ({
      status: 'resolved',
      code: 'project_scope_resolved',
      project: { projectId: 'project-a-id', projectRoot: root, configPath: path.join(root, '.launchdeck.yml') }
    }),
    taskResolver: () => ({ name: 'managed', risk: 'low', longRunning: true }),
    ownershipResolver: () => ({ classification: 'verified' }),
    compatibilityResolver: () => ({ canRead: true, canWrite: true, diagnosticOnly: false }),
    lockRunner: lock.run
  });
  const request = { operation: 'task.start', input: { projectRef: 'project-a', taskRef: 'managed' } };

  try {
    const first = await kernel.execute(request);
    const concurrent = await Promise.all([kernel.execute(request), kernel.execute(request)]);
    const results = [first, ...concurrent];
    const receipts = fs.existsSync(receiptPath)
      ? fs.readFileSync(receiptPath, 'utf8').trim().split(/\r?\n/).filter(Boolean)
      : [];

    assert.equal(receipts.length, 1);
    assert.deepEqual(new Set(results.map((result) => result.resource.runId)), new Set(['run_converged']));
    assert.equal(results.filter((result) => result.effects.changed === true).length, 1);
    assert.equal(results.filter((result) => result.effects.changed === false).length, 2);
    assert.equal(results.filter((result) => result.outcome.reusedExistingRun).length, 2);
    assert.equal(lock.maxActive(), 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function serializedLock() {
  let tail = Promise.resolve();
  let active = 0;
  let peak = 0;
  return {
    async run(_context, callback) {
      const previous = tail;
      let release;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      active += 1;
      peak = Math.max(peak, active);
      try {
        return await callback();
      } finally {
        active -= 1;
        release();
      }
    },
    maxActive() {
      return peak;
    }
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function provenance() {
  return {
    surface: 'mcp',
    host: 'standalone',
    runtimeKind: 'package-mcp',
    runtimeVersion: '0.1.0',
    runtimePath: 'F:/fixtures/launchdeck-mcp.mjs',
    stateHome: 'F:/fixtures/state-home',
    buildIdentity: `sha256:${'b'.repeat(64)}`,
    agentProtocolVersion: '1.0.0',
    cliSchemaVersion: null
  };
}
