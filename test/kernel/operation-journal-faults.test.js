import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOperationJournal } from '../../src/control-plane/operation-journal.js';
import { createApplicationKernel } from '../../src/kernel/application-kernel.js';

const FAULT_CASES = [
  { point: 'before_journal', state: null, handlerCalls: 0, effectCalls: 0 },
  { point: 'after_prepared', state: 'prepared', handlerCalls: 0, effectCalls: 0 },
  { point: 'after_running', state: 'running', handlerCalls: 0, effectCalls: 0 },
  { point: 'after_effect', state: 'running', handlerCalls: 1, effectCalls: 1 },
  { point: 'after_terminal', state: 'succeeded', handlerCalls: 1, effectCalls: 1 },
  { point: 'before_response', state: 'succeeded', handlerCalls: 1, effectCalls: 1 }
];

test('deterministic crash windows preserve recoverable evidence and never invent a second effect', async () => {
  for (const [index, expected] of FAULT_CASES.entries()) {
    await withKernelJournal(async ({ journal, makeKernel, recordPath }) => {
      const operationId = `op_fault${String(index).padStart(18, '0')}`;
      const counters = { handler: 0, effect: 0 };
      const crash = Object.assign(new Error(`crash at ${expected.point}`), {
        code: 'simulated_process_crash',
        fatal: true
      });
      const kernel = makeKernel({
        operationId,
        counters,
        faultInjector: async (point) => {
          if (point === expected.point) throw crash;
        }
      });

      await assert.rejects(
        kernel.execute(request()),
        (error) => error === crash,
        expected.point
      );

      assert.equal(counters.handler, expected.handlerCalls, expected.point);
      assert.equal(counters.effect, expected.effectCalls, expected.point);
      const filePath = recordPath(operationId);
      assert.equal(fs.existsSync(filePath), expected.state !== null, expected.point);
      if (expected.state !== null) {
        const record = await journal.get(operationId);
        assert.equal(record.state, expected.state, expected.point);
        assert.equal(record.retainUntil, expected.state === 'succeeded' ? '2026-08-19T00:00:00.000Z' : null);
      }
    });
  }
});

test('mutation handler observes durable running state before its first declared effect', async () => {
  await withKernelJournal(async ({ journal, makeKernel }) => {
    const operationId = 'op_runningbeforeeffect0001';
    const observed = [];
    const counters = { handler: 0, effect: 0 };
    const kernel = makeKernel({ operationId, counters, observed });

    const result = await kernel.execute(request());

    assert.equal(result.outcome.kind, 'succeeded');
    assert.deepEqual(observed, ['running']);
    assert.equal(counters.handler, 1);
    assert.equal(counters.effect, 1);
    assert.equal((await journal.get(operationId)).state, 'succeeded');
  });
});

test('same-ID recovery reconciles original evidence without invoking the mutation handler again', async () => {
  await withKernelJournal(async ({ journal, makeKernel }) => {
    const operationId = 'op_noreplay00000000000001';
    const counters = { handler: 0, effect: 0, reconcile: 0 };
    const crash = Object.assign(new Error('response lost after effect'), {
      code: 'simulated_process_crash',
      fatal: true
    });
    const kernel = makeKernel({
      operationId,
      counters,
      faultInjector: async (point) => {
        if (point === 'after_effect') throw crash;
      }
    });

    await assert.rejects(kernel.execute(request()), (error) => error === crash);
    const running = await journal.get(operationId);
    assert.equal(running.state, 'running');
    assert.equal(counters.handler, 1);
    assert.equal(counters.effect, 1);

    const recovered = await journal.recover({
      operationId,
      inputDigest: running.inputDigest,
      reconcile: async (record) => {
        counters.reconcile += 1;
        assert.equal(record.state, 'running');
        return {
          resolvedOutcome: 'succeeded',
          effectsCertainty: 'confirmed',
          effectEvidenceRefs: ['run:run-from-fixture'],
          resourceRef: { kind: 'task', id: 'dev', runId: 'run-from-fixture' }
        };
      }
    });

    assert.equal(recovered.state, 'reconciled');
    assert.equal(recovered.resolvedOutcome, 'succeeded');
    assert.equal(counters.reconcile, 1);
    assert.equal(counters.handler, 1);
    assert.equal(counters.effect, 1);

    const same = await journal.recover({ operationId, inputDigest: running.inputDigest });
    assert.deepEqual(same, recovered);
    assert.equal(counters.handler, 1);
    assert.equal(counters.effect, 1);
    await assert.rejects(
      journal.recover({ operationId, inputDigest: `sha256:${'f'.repeat(64)}` }),
      errorWithCode('operation_id_digest_mismatch')
    );
    await assert.rejects(
      journal.recover({ operationId: 'op_missing000000000000000', inputDigest: running.inputDigest }),
      errorWithCode('operation_record_missing_or_expired')
    );
    assert.equal(counters.handler, 1);
    assert.equal(counters.effect, 1);
  });
});

test('insufficient reconciliation evidence keeps indeterminate work unresolved and non-replayable', async () => {
  await withKernelJournal(async ({ journal }) => {
    const operationId = 'op_indeterminate0000000001';
    await journal.prepare(operationInput(operationId));
    await journal.transition(operationId, { expectedRevision: 1, to: 'running' });
    await journal.transition(operationId, {
      expectedRevision: 2,
      to: 'indeterminate',
      effectsCertainty: 'unknown',
      lastError: { code: 'completion_evidence_lost' }
    });
    let reconciliationCalls = 0;

    const unresolved = await journal.recover({
      operationId,
      inputDigest: (await journal.get(operationId)).inputDigest,
      reconcile: async () => {
        reconciliationCalls += 1;
        return null;
      }
    });

    assert.equal(unresolved.state, 'indeterminate');
    assert.equal(unresolved.retainUntil, null);
    assert.equal(unresolved.revision, 3);
    assert.equal(reconciliationCalls, 1);
  });
});

async function withKernelJournal(callback) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-kernel-journal-'));
  const env = { ...process.env, LAUNCHDECK_HOME: homeDir };
  const journal = createOperationJournal({ env, clock: () => new Date('2026-07-20T00:00:00.000Z') });
  const recordsDir = path.join(homeDir, 'runtime', 'operations', 'v1', 'records');
  try {
    await callback({
      journal,
      homeDir,
      recordPath: (operationId) => path.join(recordsDir, `${operationId}.json`),
      makeKernel: (options) => kernelHarness(journal, options)
    });
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

function kernelHarness(operationJournal, options) {
  return createApplicationKernel({
    operationJournal,
    operationIdFactory: () => options.operationId,
    faultInjector: options.faultInjector,
    projectResolver: () => ({
      status: 'resolved',
      code: 'project_scope_resolved',
      project: {
        projectId: 'project-a',
        alias: 'alpha',
        projectRoot: 'F:/fixtures/project-a',
        configPath: 'F:/fixtures/project-a/.launchdeck.yml'
      }
    }),
    taskResolver: () => ({ name: 'dev', risk: 'low' }),
    ownershipResolver: () => ({ classification: 'verified' }),
    compatibilityResolver: () => ({ canRead: true, canWrite: true, diagnosticOnly: false }),
    lockRunner: async (_context, inner) => inner(),
    handlers: {
      'task.start': async ({ operationId }) => {
        options.counters.handler += 1;
        const record = await operationJournal.get(operationId);
        options.observed?.push(record.state);
        options.counters.effect += 1;
        return {
          outcome: { kind: 'succeeded', code: 'task_started', message: 'Task started.', reusedExistingRun: false },
          resource: {
            kind: 'task', id: 'dev', status: 'running', projectRef: 'project-a', taskRef: 'dev', runId: 'run-fixture'
          },
          effects: { certainty: 'confirmed', changed: true, evidenceRefs: ['run:run-fixture'] }
        };
      }
    },
    provenance: provenance()
  });
}

function request() {
  return { operation: 'task.start', input: { projectRef: 'alpha', taskRef: 'dev' } };
}

function operationInput(operationId) {
  return {
    operationId,
    operationName: 'task.start',
    definitionVersion: '1.0.0',
    inputDigest: `sha256:${'a'.repeat(64)}`,
    requestSummary: { projectRef: 'alpha', taskRef: 'dev' },
    projectRef: { projectId: 'project-a', alias: 'alpha' },
    taskRef: 'dev',
    runtimeProvenance: provenance()
  };
}

function provenance() {
  return {
    surface: 'mcp',
    host: 'standalone',
    runtimeKind: 'package-mcp',
    runtimeVersion: '0.1.0',
    runtimePath: 'F:/fixtures/runtime.mjs',
    stateHome: 'fixture-home',
    buildIdentity: `sha256:${'b'.repeat(64)}`,
    agentProtocolVersion: '1.0.0',
    cliSchemaVersion: null
  };
}
function errorWithCode(code) {
  return (error) => error?.code === code;
}
