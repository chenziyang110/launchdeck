import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationKernel } from '../../src/kernel/application-kernel.js';

test('permissive adapter annotations cannot authorize medium, high, or destructive risk', async () => {
  for (const risk of ['medium', 'high', 'destructive']) {
    const harness = kernelHarness({ taskRisks: [risk] });
    const result = await harness.kernel.execute(
      { operation: 'task.start', input: { projectRef: 'project-a', taskRef: 'dev' } },
      { trustedContext: { annotations: { destructiveHint: false }, risk: 'low', ownership: 'verified' } }
    );

    assert.equal(result.outcome.kind, 'refused', risk);
    assert.equal(result.outcome.code, 'risk_not_low', risk);
    assert.equal(result.safety.risk, risk, risk);
    assert.equal(result.safety.decision, 'refused', risk);
    assert.equal(harness.calls.handler, 0, risk);
  }
});

test('unknown and external ownership remain inspect-only', async () => {
  for (const ownership of ['unknown', 'external']) {
    const harness = kernelHarness({ ownership: [ownership] });
    const result = await harness.kernel.execute({
      operation: 'task.stop',
      input: { projectRef: 'project-a', taskRef: 'dev' }
    });

    assert.equal(result.outcome.kind, 'refused', ownership);
    assert.equal(result.outcome.code, 'ownership_not_verified', ownership);
    assert.equal(result.safety.ownership, ownership, ownership);
    assert.equal(harness.calls.handler, 0, ownership);
  }
});

test('mutation policy is revalidated under the ordered lock immediately before effects', async () => {
  const harness = kernelHarness({ taskRisks: ['low', 'high'] });
  const result = await harness.kernel.execute({
    operation: 'task.restart',
    input: { projectRef: 'project-a', taskRef: 'dev' }
  });

  assert.equal(harness.calls.lock, 1);
  assert.equal(harness.calls.task, 2);
  assert.equal(harness.calls.ownership, 2);
  assert.equal(harness.calls.compatibility, 2);
  assert.equal(harness.calls.handler, 0);
  assert.equal(result.outcome.code, 'risk_not_low');
  assert.equal(result.safety.risk, 'high');
});

test('model input cannot inject risk, ownership, compatibility, or project-root authority', async () => {
  const harness = kernelHarness();
  const forbidden = ['risk', 'ownership', 'compatibility', 'projectRoot'];

  for (const field of forbidden) {
    const result = await harness.kernel.execute({
      operation: 'task.start',
      input: { taskRef: 'dev', [field]: field === 'projectRoot' ? 'F:/other' : 'allowed' }
    });
    assert.equal(result.outcome.kind, 'refused', field);
    assert.equal(result.outcome.code, 'input_invalid', field);
  }
  assert.equal(harness.calls.handler, 0);
});

function kernelHarness(options = {}) {
  const calls = { project: 0, task: 0, ownership: 0, compatibility: 0, lock: 0, handler: 0 };
  const taskRisks = [...(options.taskRisks ?? ['low'])];
  const ownership = [...(options.ownership ?? ['verified'])];
  const compatibility = [...(options.compatibility ?? [{ canRead: true, canWrite: true, diagnosticOnly: false }])];

  const kernel = createApplicationKernel({
    projectResolver: () => {
      calls.project += 1;
      return {
        status: 'resolved',
        code: 'project_scope_resolved',
        project: { projectId: 'project-a-id', projectRoot: 'F:/fixtures/project-a', configPath: 'F:/fixtures/project-a/.launchdeck.yml' }
      };
    },
    taskResolver: () => {
      const index = Math.min(calls.task, taskRisks.length - 1);
      calls.task += 1;
      return { name: 'dev', risk: taskRisks[index] };
    },
    ownershipResolver: () => {
      const index = Math.min(calls.ownership, ownership.length - 1);
      calls.ownership += 1;
      return { classification: ownership[index] };
    },
    compatibilityResolver: () => {
      const index = Math.min(calls.compatibility, compatibility.length - 1);
      calls.compatibility += 1;
      return compatibility[index];
    },
    lockRunner: async (_context, callback) => {
      calls.lock += 1;
      return callback();
    },
    handlers: {
      'task.start': handler,
      'task.stop': handler,
      'task.restart': handler
    },
    provenance: {
      surface: 'mcp',
      host: 'standalone',
      runtimeKind: 'package-mcp',
      runtimeVersion: '0.1.0',
      runtimePath: 'F:/fixtures/runtime.mjs',
      stateHome: 'F:/fixtures/home',
      buildIdentity: `sha256:${'b'.repeat(64)}`,
      agentProtocolVersion: '1.0.0',
      cliSchemaVersion: null
    }
  });

  return { kernel, calls };

  function handler() {
    calls.handler += 1;
    return {
      outcome: { kind: 'succeeded', code: 'handled', message: 'Handled.', reusedExistingRun: false },
      resource: { kind: 'task', id: 'dev', status: 'running', projectRef: 'project-a-id', taskRef: 'dev', runId: null },
      effects: { certainty: 'confirmed', changed: true, evidenceRefs: [] }
    };
  }
}
