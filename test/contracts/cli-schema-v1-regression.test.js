import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFailureEnvelope,
  createPartialEnvelope,
  createSuccessEnvelope,
  toCompactJson
} from '../../src/output.js';
import { LaunchdeckError } from '../../src/errors.js';

test('normal schemaVersion 1 success nests Agent semantics without changing legacy mirrors', () => {
  const agentResult = resultFixture({ outcomeKind: 'succeeded', resourceStatus: 'available' });
  const envelope = createSuccessEnvelope('tasks', {
    project: { name: 'demo' },
    tasks: [{ name: 'dev', type: 'managed' }],
    agentResult
  }, context());

  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.status, 'ok');
  assert.deepEqual(envelope.project, { name: 'demo' });
  assert.deepEqual(envelope.tasks, [{ name: 'dev', type: 'managed' }]);
  assert.deepEqual(envelope.data.project, { name: 'demo' });
  assert.deepEqual(envelope.data.tasks, [{ name: 'dev', type: 'managed' }]);
  assert.deepEqual(envelope.data.agentResult, agentResult);
  assert.equal(envelope.agentResult, undefined);
});

test('failure and partial envelopes preserve legacy status/code/exit meaning while nesting outcome/resource separately', () => {
  const failureAgent = resultFixture({ outcomeKind: 'refused', resourceStatus: 'refused', outcomeCode: 'scope_not_resolved' });
  const failure = createFailureEnvelope(
    'diagnose',
    new LaunchdeckError('config_not_found', 'Config missing.'),
    context(),
    { agentResult: failureAgent }
  );
  assert.equal(failure.schemaVersion, 1);
  assert.equal(failure.status, 'error');
  assert.equal(failure.code, 'config_not_found');
  assert.equal(failure.error.code, 'config_not_found');
  assert.equal(failure.data.agentResult.outcome.kind, 'refused');
  assert.equal(failure.data.agentResult.resource.status, 'refused');
  assert.equal(failure.agentResult, undefined);

  const partialAgent = resultFixture({ outcomeKind: 'partial', resourceStatus: 'partial', outcomeCode: 'restart_partial' });
  const partial = createPartialEnvelope('restart', [{ task: 'dev', ok: false }], context(), {
    agentResult: partialAgent
  });
  assert.equal(partial.schemaVersion, 1);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.code, 'partial_failure');
  assert.deepEqual(partial.results, [{ task: 'dev', ok: false }]);
  assert.equal(partial.data.agentResult.outcome.kind, 'partial');
  assert.equal(partial.data.agentResult.resource.status, 'partial');
  assert.equal(partial.agentResult, undefined);
});

test('compact schemaVersion 1 projection remains legacy-only and excludes nested Agent result', () => {
  const envelope = createSuccessEnvelope('tasks', {
    project: { name: 'demo' },
    tasks: [{ name: 'dev', type: 'managed', risk: 'low' }],
    agentResult: resultFixture({ outcomeKind: 'succeeded', resourceStatus: 'available' })
  }, context());
  const compact = toCompactJson(envelope);

  assert.deepEqual(compact, {
    ok: true,
    schemaVersion: 1,
    command: 'tasks',
    status: 'ok',
    project: 'demo',
    tasks: [{ name: 'dev', type: 'managed', risk: 'low' }],
    counts: { tasks: 1 }
  });
  assert.equal(JSON.stringify(compact).includes('agentResult'), false);
  assert.equal(JSON.stringify(compact).includes('protocolVersion'), false);
});

function resultFixture(options) {
  const noEffects = options.outcomeKind === 'succeeded' || options.outcomeKind === 'refused';
  return {
    protocolVersion: '1.0.0',
    operation: {
      id: 'op_aaaaaaaaaaaaaaaa',
      name: 'task.list',
      inputDigest: `sha256:${'a'.repeat(64)}`,
      journalStatus: 'not_applicable'
    },
    outcome: {
      kind: options.outcomeKind,
      code: options.outcomeCode ?? 'tasks_listed',
      message: 'Fixture outcome.',
      reusedExistingRun: false
    },
    resource: {
      kind: 'taskCollection',
      id: null,
      status: options.resourceStatus,
      projectRef: 'project-a',
      taskRef: null,
      runId: null
    },
    effects: {
      certainty: noEffects ? 'none' : 'confirmed',
      changed: noEffects ? false : true,
      evidenceRefs: []
    },
    safety: {
      risk: 'none',
      decision: options.outcomeKind === 'refused' ? 'refused' : 'allowed',
      ownership: 'not_required',
      projectScope: 'resolved'
    },
    error: options.outcomeKind === 'succeeded' ? null : {
      code: options.outcomeCode ?? 'fixture_error',
      message: 'Fixture error.',
      details: {}
    },
    nextActions: [],
    provenance: {
      surface: 'cli',
      host: 'standalone',
      runtimeKind: 'package-cli',
      runtimeVersion: '0.1.0',
      runtimePath: 'F:/launchdeck/src/cli.js',
      stateHome: 'F:/state/launchdeck',
      buildIdentity: `sha256:${'b'.repeat(64)}`,
      agentProtocolVersion: '1.0.0',
      cliSchemaVersion: 1
    }
  };
}

function context() {
  return { projectRoot: 'F:/projects/demo', configPath: 'F:/projects/demo/.launchdeck.yml' };
}
