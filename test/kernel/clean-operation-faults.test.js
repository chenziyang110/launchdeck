import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOperationJournal } from '../../src/control-plane/operation-journal.js';
import { createApplicationKernel } from '../../src/kernel/application-kernel.js';
import { createCleanHandlers } from '../../src/kernel/operations/clean.js';

const FAULTS = [
  { point: 'after_prepared', state: 'prepared', revalidations: 0, applyCalls: 0 },
  { point: 'after_running', state: 'running', revalidations: 1, applyCalls: 0 },
  { point: 'after_effect', state: 'running', revalidations: 1, applyCalls: 1 }
];

test('clean.applySafe fault windows keep prepared/running evidence and never delete before revalidation', async () => {
  for (const [index, expected] of FAULTS.entries()) {
    const operationId = `op_cleanfault${String(index).padStart(16, '0')}`;
    const counters = { plans: 0, revalidations: 0, apply: 0 };
    const crash = Object.assign(new Error(`crash at ${expected.point}`), {
      code: 'simulated_process_crash',
      fatal: true
    });
    await withFaultHarness({
      operationId,
      counters,
      faultInjector: async (point) => {
        if (point === expected.point) throw crash;
      }
    }, async ({ execute, journal }) => {
      const preview = await execute('clean.plan');
      await assert.rejects(
        execute('clean.applySafe', { planDigest: preview.resource.data.planDigest }),
        (error) => error === crash,
        expected.point
      );

      assert.equal(counters.revalidations, expected.revalidations, expected.point);
      assert.equal(counters.apply, expected.applyCalls, expected.point);
      assert.equal((await journal.get(operationId)).state, expected.state, expected.point);
    });
  }
});

test('post-delete uncertainty reconciles the original clean operation without applying again', async () => {
  const operationId = 'op_cleanrecovery000000001';
  const counters = { plans: 0, revalidations: 0, apply: 0, reconcile: 0 };
  const crash = Object.assign(new Error('response lost after safe deletion'), {
    code: 'simulated_process_crash',
    fatal: true
  });
  await withFaultHarness({
    operationId,
    counters,
    faultInjector: async (point) => {
      if (point === 'after_effect') throw crash;
    }
  }, async ({ execute, journal }) => {
    const preview = await execute('clean.plan');
    await assert.rejects(
      execute('clean.applySafe', { planDigest: preview.resource.data.planDigest }),
      (error) => error === crash
    );
    const running = await journal.get(operationId);
    assert.equal(running.state, 'running');
    assert.equal(counters.apply, 1);

    const reconciled = await journal.recover({
      operationId,
      inputDigest: running.inputDigest,
      reconcile: async (record) => {
        counters.reconcile += 1;
        assert.equal(record.operationName, 'clean.applySafe');
        return {
          resolvedOutcome: 'succeeded',
          effectsCertainty: 'confirmed',
          effectEvidenceRefs: ['clean:tree-digest:after'],
          resourceRef: { kind: 'cleanResult', id: preview.resource.data.planDigest, runId: null }
        };
      }
    });

    assert.equal(reconciled.state, 'reconciled');
    assert.equal(counters.reconcile, 1);
    assert.equal(counters.apply, 1);
    const same = await journal.recover({ operationId, inputDigest: running.inputDigest });
    assert.equal(same.state, 'reconciled');
    assert.equal(counters.apply, 1);
  });
});

async function withFaultHarness(options, callback) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-clean-fault-'));
  const env = { ...process.env, LAUNCHDECK_HOME: homeDir };
  const journal = createOperationJournal({ env });
  let lockDepth = 0;
  const kernel = createApplicationKernel({
    env,
    operationJournal: journal,
    operationIdFactory: () => options.operationId,
    faultInjector: options.faultInjector,
    handlers: createCleanHandlers({
      createPlan: async () => {
        options.counters.plans += 1;
        if (lockDepth > 0) options.counters.revalidations += 1;
        return cleanPlanFixture();
      },
      applySafe: async ({ operationId }) => {
        options.counters.apply += 1;
        assert.equal(lockDepth > 0, true);
        assert.equal((await journal.get(operationId)).state, 'running');
        return {
          removed: [{ rawPath: 'cache', status: 'removed', existed: true }],
          changed: true,
          evidenceRefs: ['clean:tree-digest:after']
        };
      }
    }),
    projectResolver: () => ({
      status: 'resolved',
      code: 'project_scope_resolved',
      project: {
        projectId: 'project-a-id',
        alias: 'project-a',
        projectRoot: 'F:/fixtures/project-a',
        configPath: 'F:/fixtures/project-a/.launchdeck.yml'
      }
    }),
    taskResolver: () => null,
    ownershipResolver: () => ({ classification: 'verified' }),
    compatibilityResolver: () => ({ canRead: true, canWrite: true, diagnosticOnly: false }),
    lockRunner: async (_context, inner) => {
      lockDepth += 1;
      try {
        return await inner();
      } finally {
        lockDepth -= 1;
      }
    },
    provenance: provenance()
  });
  try {
    await callback({
      journal,
      execute: (operation, input = {}) => kernel.execute({
        operation,
        input: { projectRef: 'project-a', ...input }
      })
    });
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

function cleanPlanFixture() {
  return {
    version: 1,
    configDigest: `sha256:${'a'.repeat(64)}`,
    targets: [{
      kind: 'safe',
      rawPath: 'cache',
      resolvedPath: 'F:/fixtures/project-a/cache',
      canonicalPath: 'F:/fixtures/project-a/cache',
      exists: true,
      status: 'planned',
      protectedPaths: []
    }],
    refusals: [],
    protectedPaths: [],
    excludedRiskyTargets: [{ kind: 'risky', rawPath: 'node_modules' }]
  };
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
