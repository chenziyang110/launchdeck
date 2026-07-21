import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationKernel } from '../../src/kernel/application-kernel.js';
import { createTaskHandlers } from '../../src/kernel/operations/task.js';

test('public mutation inputs reject every raw execution, force, approval, path, remote, and policy override before effects', async () => {
  const forbidden = {
    command: 'node unsafe.js',
    cwd: 'F:/outside',
    env: { TOKEN: 'secret' },
    force: true,
    forceOwned: true,
    yes: true,
    confirmation: 'approved',
    approval: { granted: true },
    shell: 'powershell',
    path: 'F:/target',
    remote: 'ssh://host',
    url: 'https://example.invalid',
    risk: 'low',
    ownership: 'verified',
    hostAnnotations: { readOnlyHint: false }
  };

  for (const [field, value] of Object.entries(forbidden)) {
    const harness = refusalHarness();
    const result = await harness.kernel.execute({
      operation: 'task.start',
      input: { projectRef: 'project-a', taskRef: 'dev', [field]: value }
    }, {
      trustedContext: { annotations: { destructiveHint: false }, approval: true, force: true }
    });

    assert.equal(result.outcome.kind, 'refused', field);
    assert.equal(result.outcome.code, 'input_invalid', field);
    assert.equal(result.effects.certainty, 'none', field);
    assert.equal(result.effects.changed, false, field);
    assert.equal(harness.calls.handler, 0, field);
    assert.equal(harness.calls.lock, 0, field);
    assert.equal(harness.calls.journal, 0, field);
  }
});

test('medium, high, and destructive configured tasks refuse before journal, lock, spawn, or signal effects', async () => {
  for (const operation of ['task.start', 'task.stop', 'task.restart', 'task.run']) {
    for (const risk of ['medium', 'high', 'destructive']) {
      const harness = refusalHarness({ risk });
      const result = await harness.kernel.execute({
        operation,
        input: { projectRef: 'project-a', taskRef: 'dev' }
      }, {
        trustedContext: { annotations: { safeHint: true }, risk: 'low', approval: true }
      });

      assert.equal(result.outcome.kind, 'refused', `${operation}:${risk}`);
      assert.equal(result.outcome.code, 'risk_not_low', `${operation}:${risk}`);
      assert.equal(result.safety.risk, risk, `${operation}:${risk}`);
      assert.equal(result.effects.changed, false, `${operation}:${risk}`);
      assert.equal(harness.calls.handler, 0, `${operation}:${risk}`);
      assert.equal(harness.calls.lock, 0, `${operation}:${risk}`);
      assert.equal(harness.calls.journal, 0, `${operation}:${risk}`);
    }
  }
});

test('unknown and external owners remain inspect-only for start, stop, and restart with no spawn or signal', async () => {
  for (const operation of ['task.start', 'task.stop', 'task.restart']) {
    for (const ownership of ['unknown', 'external']) {
      const harness = refusalHarness({ ownership });
      const result = await harness.kernel.execute({
        operation,
        input: { projectRef: 'project-a', taskRef: 'dev' }
      }, {
        trustedContext: { approval: true, force: true, annotations: { destructiveHint: false } }
      });

      assert.equal(result.outcome.kind, 'refused', `${operation}:${ownership}`);
      assert.equal(result.outcome.code, 'ownership_not_verified', `${operation}:${ownership}`);
      assert.equal(result.safety.ownership, ownership, `${operation}:${ownership}`);
      assert.equal(result.effects.certainty, 'none', `${operation}:${ownership}`);
      assert.equal(harness.calls.handler, 0, `${operation}:${ownership}`);
      assert.equal(harness.calls.spawn, 0, `${operation}:${ownership}`);
      assert.equal(harness.calls.signal, 0, `${operation}:${ownership}`);
    }
  }
});

function refusalHarness(options = {}) {
  const calls = { handler: 0, lock: 0, journal: 0, spawn: 0, signal: 0 };
  const effect = (kind) => async () => {
    calls.handler += 1;
    calls[kind] += 1;
    throw new Error('Refusal contract allowed a forbidden effect.');
  };
  const handlers = createTaskHandlers({
    mutations: {
      start: effect('spawn'),
      stop: effect('signal'),
      restart: effect('signal'),
      run: effect('spawn')
    }
  });
  const journal = {
    paths: { homeDir: 'F:/fixtures/state-home' },
    async prepare() {
      calls.journal += 1;
      throw new Error('Refusal contract prepared a journal record.');
    }
  };
  const kernel = createApplicationKernel({
    provenance: provenance(),
    handlers,
    operationJournal: journal,
    projectResolver: () => ({
      status: 'resolved',
      code: 'project_scope_resolved',
      project: { projectId: 'project-a-id', projectRoot: 'F:/fixtures/project-a' }
    }),
    taskResolver: () => ({ name: 'dev', risk: options.risk ?? 'low', longRunning: true }),
    ownershipResolver: () => ({ classification: options.ownership ?? 'verified' }),
    compatibilityResolver: () => ({ canRead: true, canWrite: true, diagnosticOnly: false }),
    lockRunner: async (_context, callback) => {
      calls.lock += 1;
      return callback();
    }
  });
  return { kernel, calls };
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
