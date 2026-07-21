import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationKernel } from '../../src/kernel/application-kernel.js';
import { createTaskHandlers } from '../../src/kernel/operations/task.js';

test('low-risk start creates one run and a later matching start reports honest reuse semantics', async () => {
  const calls = [];
  const run = runFixture('run_shared', 'ready');
  const harness = lifecycleHarness({
    mutations: {
      start: async (context) => {
        calls.push(context);
        return calls.length === 1
          ? { run, reusedExistingRun: false, changed: true, evidenceRefs: ['receipt:spawn:1'] }
          : { run, reusedExistingRun: true, changed: false, evidenceRefs: ['receipt:spawn:1'] };
      }
    }
  });

  const first = await harness.execute('task.start');
  const second = await harness.execute('task.start');

  assert.equal(calls.length, 2);
  assert.equal(first.outcome.kind, 'succeeded');
  assert.equal(first.outcome.code, 'task_started');
  assert.equal(first.outcome.reusedExistingRun, false);
  assert.equal(first.resource.kind, 'run');
  assert.equal(first.resource.status, 'ready');
  assert.equal(first.resource.runId, 'run_shared');
  assert.deepEqual(first.effects, {
    certainty: 'confirmed',
    changed: true,
    evidenceRefs: ['receipt:spawn:1']
  });
  assert.equal(second.outcome.code, 'task_start_reused');
  assert.equal(second.outcome.reusedExistingRun, true);
  assert.equal(second.resource.runId, first.resource.runId);
  assert.deepEqual(second.effects, {
    certainty: 'confirmed',
    changed: false,
    evidenceRefs: ['receipt:spawn:1']
  });
});

test('verified stop and finite run project existing lifecycle authority into normalized resource/effect semantics', async () => {
  const calls = { stop: 0, run: 0 };
  const harness = lifecycleHarness({
    mutations: {
      stop: async () => {
        calls.stop += 1;
        return {
          run: runFixture('run_old', 'stopped'),
          changed: true,
          evidenceRefs: ['receipt:signal:1']
        };
      },
      run: async () => {
        calls.run += 1;
        return {
          status: 'completed',
          exitCode: 0,
          stdout: 'finite stdout',
          stderr: 'finite stderr',
          changed: true,
          evidenceRefs: ['receipt:finite:1']
        };
      }
    }
  });

  const stopped = await harness.execute('task.stop');
  assert.equal(calls.stop, 1);
  assert.equal(stopped.outcome.code, 'task_stopped');
  assert.equal(stopped.resource.status, 'stopped');
  assert.equal(stopped.resource.runId, 'run_old');
  assert.equal(stopped.effects.changed, true);

  const completed = await harness.execute('task.run');
  assert.equal(calls.run, 1);
  assert.equal(completed.outcome.code, 'task_run_completed');
  assert.equal(completed.resource.kind, 'task');
  assert.equal(completed.resource.status, 'completed');
  assert.deepEqual(completed.resource.data, {
    exitCode: 0,
    stdout: 'finite stdout',
    stderr: 'finite stderr'
  });
  assert.equal(completed.effects.changed, true);
});

test('restart keeps one operation identity and represents stop-success/start-failure as partial', async () => {
  let receivedOperationId;
  const harness = lifecycleHarness({
    mutations: {
      restart: async (context) => {
        receivedOperationId = context.operationId;
        return {
          status: 'partial',
          stoppedRun: runFixture('run_old', 'stopped'),
          startedRun: null,
          changed: true,
          evidenceRefs: ['receipt:signal:1', 'receipt:start-failure:1'],
          error: {
            code: 'task_start_failed',
            message: 'Replacement run failed to start.',
            details: { phase: 'start' }
          }
        };
      }
    }
  });

  const result = await harness.execute('task.restart');

  assert.equal(receivedOperationId, result.operation.id);
  assert.equal(result.outcome.kind, 'partial');
  assert.equal(result.outcome.code, 'task_restart_partial');
  assert.equal(result.resource.kind, 'run');
  assert.equal(result.resource.id, 'run_old');
  assert.equal(result.resource.status, 'failed');
  assert.equal(result.resource.data.stoppedRun.runId, 'run_old');
  assert.equal(result.resource.data.startedRun, null);
  assert.equal(result.effects.certainty, 'confirmed');
  assert.equal(result.effects.changed, true);
  assert.equal(result.error.code, 'task_start_failed');
  assert.deepEqual(result.nextActions.map((action) => action.kind), ['inspect', 'view_logs']);
});

test('foreground completion uncertainty is indeterminate and offers reconciliation without rerunning the task', async () => {
  let runCalls = 0;
  const harness = lifecycleHarness({
    mutations: {
      run: async () => {
        runCalls += 1;
        return {
          status: 'indeterminate',
          exitCode: null,
          stdout: '',
          stderr: '',
          certainty: 'unknown',
          changed: null,
          evidenceRefs: ['receipt:finite-dispatch:1'],
          error: {
            code: 'task_completion_unknown',
            message: 'The task may have completed, but terminal evidence is unavailable.',
            details: {}
          }
        };
      }
    }
  });

  const result = await harness.execute('task.run');

  assert.equal(runCalls, 1);
  assert.equal(result.outcome.kind, 'indeterminate');
  assert.equal(result.outcome.code, 'task_completion_unknown');
  assert.equal(result.resource.status, 'indeterminate');
  assert.deepEqual(result.effects, {
    certainty: 'unknown',
    changed: null,
    evidenceRefs: ['receipt:finite-dispatch:1']
  });
  assert.equal(result.nextActions.length, 1);
  assert.equal(result.nextActions[0].kind, 'reconcile');
  assert.equal(result.nextActions[0].operationName, 'operation.reconcile');
  assert.deepEqual(result.nextActions[0].input, { operationId: result.operation.id });
});

function lifecycleHarness(options = {}) {
  const handlers = createTaskHandlers({ mutations: options.mutations });
  const kernel = createApplicationKernel({
    provenance: provenance(),
    handlers,
    projectResolver: () => resolvedProject(),
    taskResolver: ({ request }) => ({
      name: request.input.taskRef,
      risk: options.risk ?? 'low',
      longRunning: request.operation !== 'task.run'
    }),
    ownershipResolver: () => ({ classification: options.ownership ?? 'verified' }),
    compatibilityResolver: () => ({ canRead: true, canWrite: true, diagnosticOnly: false }),
    lockRunner: async (_context, callback) => callback()
  });
  return {
    execute(operation, input = {}) {
      return kernel.execute({
        operation,
        input: { projectRef: 'project-a', taskRef: 'dev', ...input }
      });
    }
  };
}

function resolvedProject() {
  return {
    status: 'resolved',
    code: 'project_scope_resolved',
    project: {
      id: 'project-a-id',
      projectId: 'project-a-id',
      alias: 'project-a',
      name: 'Project A',
      projectRoot: 'F:/fixtures/project-a',
      configPath: 'F:/fixtures/project-a/.launchdeck.yml'
    },
    source: 'test-fixture',
    reasons: []
  };
}

function runFixture(runId, status) {
  return {
    runId,
    task: 'dev',
    status,
    pid: 4242,
    ports: [43123],
    readiness: { status: status === 'ready' ? 'ready' : status }
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
