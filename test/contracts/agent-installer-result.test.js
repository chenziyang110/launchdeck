import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInstallerExecutionEnvelope,
  normalizeInstallerResult
} from '../../src/agent/result.js';
import {
  AgentInstallerError,
  toInstallerErrorPayload
} from '../../src/agent/errors.js';

const BUILD_IDENTITY = `sha256:${'b'.repeat(64)}`;
const PLAN_DIGEST = `sha256:${'c'.repeat(64)}`;

test('normalized installer result has one stable typed field set and remains deeply immutable', () => {
  const result = normalizeInstallerResult(resultFixture());

  assert.deepEqual(Object.keys(result), [
    'outcome',
    'effectCertainty',
    'scope',
    'projectIdentity',
    'buildIdentity',
    'operationId',
    'planDigest',
    'receiptId',
    'targets',
    'health',
    'effects',
    'nextActions',
    'error'
  ]);
  assert.equal(result.outcome, 'succeeded');
  assert.equal(result.effectCertainty, 'complete');
  assert.equal(result.error, null);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.targets), true);
  assert.throws(() => result.targets.push({}), TypeError);
});

test('terminal outcomes require their exact effect certainty and error shape', () => {
  const cases = [
    ['planned', 'none', false],
    ['cancelled', 'none', false],
    ['noop', 'none', false],
    ['succeeded', 'complete', false],
    ['refused', 'none', true],
    ['failed-and-rolled-back', 'complete', true],
    ['partial', 'partial', true],
    ['indeterminate', 'unknown', true],
    ['reconciled', 'complete', false]
  ];

  for (const [outcome, effectCertainty, needsError] of cases) {
    const result = normalizeInstallerResult(resultFixture({
      outcome,
      effectCertainty,
      receiptId: outcome === 'succeeded' ? 'receipt_0123456789abcdef' : null,
      effects: effectCertainty === 'none' ? [] : [{ kind: 'config-write', state: 'verified' }],
      error: needsError ? {
        code: `agent_${outcome.replaceAll('-', '_')}`,
        message: `Fixture ${outcome}.`,
        details: { targetPath: 'F:/projects/demo/.mcp.json' }
      } : null
    }));
    assert.equal(result.outcome, outcome);
    assert.equal(result.effectCertainty, effectCertainty);
    assert.equal(result.error === null, !needsError);

    assert.throws(
      () => normalizeInstallerResult({ ...resultFixture({ outcome }), effectCertainty: 'unknown' }),
      { code: 'agent_result_invalid' },
      outcome
    );
  }
});

test('pre-plan refused results may carry null planDigest and nullable buildIdentity without fabricating digests', () => {
  const withoutResolvedBuild = normalizeInstallerResult(resultFixture({
    outcome: 'refused',
    effectCertainty: 'none',
    buildIdentity: null,
    operationId: null,
    planDigest: null,
    receiptId: null,
    targets: [],
    health: [],
    effects: [],
    nextActions: [],
    error: {
      code: 'agent_build_identity_invalid',
      message: 'Build selection must be a sha256 digest or packaged.',
      details: {}
    }
  }));
  assert.equal(withoutResolvedBuild.buildIdentity, null);
  assert.equal(withoutResolvedBuild.planDigest, null);

  const withResolvedBuild = normalizeInstallerResult(resultFixture({
    outcome: 'refused',
    effectCertainty: 'none',
    buildIdentity: BUILD_IDENTITY,
    operationId: null,
    planDigest: null,
    receiptId: null,
    targets: [],
    health: [],
    effects: [],
    nextActions: [],
    error: {
      code: 'agent_selection_ambiguous',
      message: 'Host selection is ambiguous.',
      details: {}
    }
  }));
  assert.equal(withResolvedBuild.buildIdentity, BUILD_IDENTITY);
  assert.equal(withResolvedBuild.planDigest, null);
});

test('null digests stay invalid for every non-pre-plan result shape', () => {
  const cases = [
    resultFixture({ outcome: 'planned', effectCertainty: 'none', buildIdentity: BUILD_IDENTITY, planDigest: null, receiptId: null, effects: [] }),
    resultFixture({ outcome: 'cancelled', effectCertainty: 'none', buildIdentity: BUILD_IDENTITY, planDigest: null, receiptId: null, effects: [] }),
    resultFixture({ outcome: 'noop', effectCertainty: 'none', buildIdentity: BUILD_IDENTITY, planDigest: null, receiptId: null, effects: [] }),
    resultFixture({ outcome: 'succeeded', effectCertainty: 'complete', buildIdentity: BUILD_IDENTITY, planDigest: null }),
    resultFixture({
      outcome: 'refused',
      effectCertainty: 'none',
      buildIdentity: null,
      operationId: null,
      planDigest: null,
      receiptId: null,
      targets: [{ targetId: 'codex:project:skill' }],
      effects: [],
      error: { code: 'agent_refused', message: 'not pre-plan', details: {} }
    }),
    resultFixture({ outcome: 'failed-and-rolled-back', effectCertainty: 'complete', buildIdentity: BUILD_IDENTITY, planDigest: null, receiptId: null, effects: [{ kind: 'x' }], error: { code: 'agent_failed', message: 'failed', details: {} } }),
    resultFixture({ outcome: 'partial', effectCertainty: 'partial', buildIdentity: BUILD_IDENTITY, planDigest: null, receiptId: null, effects: [{ kind: 'x' }], error: { code: 'agent_partial', message: 'partial', details: {} } }),
    resultFixture({ outcome: 'indeterminate', effectCertainty: 'unknown', buildIdentity: BUILD_IDENTITY, planDigest: null, receiptId: null, effects: [{ kind: 'x' }], error: { code: 'agent_indeterminate', message: 'indeterminate', details: {} } }),
    resultFixture({ outcome: 'reconciled', effectCertainty: 'complete', buildIdentity: BUILD_IDENTITY, planDigest: null, receiptId: null, effects: [{ kind: 'x' }], error: null })
  ];

  for (const candidate of cases) {
    assert.throws(
      () => normalizeInstallerResult(candidate),
      { code: 'agent_result_invalid' }
    );
  }
});

test('schemaVersion 1 execution envelope nests installer details without changing the outer authority', () => {
  const success = createInstallerExecutionEnvelope('agent setup', resultFixture());
  assert.deepEqual(Object.keys(success), ['schemaVersion', 'ok', 'command', 'result']);
  assert.equal(success.schemaVersion, 1);
  assert.equal(success.ok, true);
  assert.equal(success.command, 'agent setup');
  assert.equal(success.result.outcome, 'succeeded');
  assert.equal(success.result.effectCertainty, 'complete');
  assert.equal(success.protocolVersion, undefined);

  for (const outcome of ['refused', 'failed-and-rolled-back', 'partial', 'indeterminate']) {
    const failure = createInstallerExecutionEnvelope('agent update', resultFixture({
      outcome,
      effectCertainty: outcome === 'partial' ? 'partial' : outcome === 'indeterminate' ? 'unknown' : outcome === 'refused' ? 'none' : 'complete',
      receiptId: null,
      effects: outcome === 'refused' ? [] : [{ kind: 'target-write', state: 'rolled-back' }],
      error: { code: `agent_${outcome.replaceAll('-', '_')}`, message: outcome, details: {} }
    }));
    assert.equal(failure.schemaVersion, 1);
    assert.equal(failure.ok, false);
  }
});

test('typed installer errors preserve safe action context and unknown errors collapse to internal_error', () => {
  const typed = new AgentInstallerError(
    'agent_plan_conflict',
    'The approved target changed.',
    {
      effectCertainty: 'none',
      details: {
        targetPath: 'F:/projects/demo/.mcp.json',
        expectedDigest: `sha256:${'d'.repeat(64)}`
      },
      nextActions: [{
        kind: 'replan',
        label: 'Inspect the changed target and approve a new plan.'
      }]
    }
  );
  const payload = toInstallerErrorPayload(typed);

  assert.equal(typed instanceof Error, true);
  assert.deepEqual(payload, {
    code: 'agent_plan_conflict',
    message: 'The approved target changed.',
    effectCertainty: 'none',
    details: {
      targetPath: 'F:/projects/demo/.mcp.json',
      expectedDigest: `sha256:${'d'.repeat(64)}`
    },
    nextActions: [{
      kind: 'replan',
      label: 'Inspect the changed target and approve a new plan.'
    }]
  });

  const unknown = toInstallerErrorPayload(new Error('Unexpected adapter failure.'));
  assert.equal(unknown.code, 'internal_error');
  assert.equal(unknown.effectCertainty, 'unknown');
  assert.deepEqual(unknown.details, {});
  assert.deepEqual(unknown.nextActions, []);
  assert.equal('stack' in unknown, false);
  assert.equal('cause' in unknown, false);
});

function resultFixture(overrides = {}) {
  return {
    outcome: 'succeeded',
    effectCertainty: 'complete',
    scope: 'project',
    projectIdentity: 'F:/projects/flask-demo',
    buildIdentity: BUILD_IDENTITY,
    operationId: 'op_0123456789abcdef',
    planDigest: PLAN_DIGEST,
    receiptId: 'receipt_0123456789abcdef',
    targets: [{
      targetId: 'codex:project:skill',
      hostId: 'codex',
      component: 'skill',
      state: 'verified',
      path: 'F:/projects/flask-demo/.agents/skills/launchdeck-agent',
      digest: `sha256:${'d'.repeat(64)}`
    }],
    health: [],
    effects: [{ kind: 'skill-write', state: 'verified' }],
    nextActions: [],
    error: null,
    ...overrides
  };
}
