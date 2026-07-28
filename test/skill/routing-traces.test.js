import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const fixture = readJson('./fixtures/routing-traces.json');
const skillContract = readSkillTraceContract();
const mutationOperations = new Set([
  'task.start',
  'task.stop',
  'task.restart',
  'task.run',
  'clean.applySafe',
  'project.add',
  'project.register'
]);

test('canonical Skill publishes reusable safety invariants and allowed recovery branches', () => {
  assert.ok(skillContract, 'references/eval-prompts.md must contain the launchdeck-agent trace contract markers');
  assert.equal(skillContract.schemaVersion, 2);
  assert.equal(fixture.schemaVersion, 2);
  assert.deepEqual(skillContract.invariants, fixture.invariants);
  assert.deepEqual(skillContract.allowedRecoveryBranches, fixture.allowedRecoveryBranches);
  assert.equal(fixture.invariants.mcpFirst, true);
  assert.equal(fixture.invariants.pinEntrypointForRequest, true);
  assert.equal(fixture.invariants.observeBeforeMutate, true);
  assert.equal(fixture.invariants.maxLifecycleMutations, 1);
  assert.equal(fixture.invariants.replayWhenEffectUnknown, false);
  assert.deepEqual(fixture.invariants.forbidden, [
    'force', 'raw_command', 'destructive', 'medium_or_unknown_risk', 'permanent_follow'
  ]);
});

test('intent matrix reaches the right goal without borrowing authority across routes', () => {
  const authorOnly = scenario('explicit_config_authoring_strong');
  const launchOnlyMissing = scenario('launch_only_missing_config');
  const combined = scenario('explicit_config_validate_launch');
  const genericConfirmation = scenario('generic_confirmation_after_proposal');

  assert.deepEqual(authorOnly.goal, {
    config: 'authored', validation: 'succeeded', lifecycle: 'not_requested', outcome: 'succeeded'
  });
  assert.equal(mutationCalls(authorOnly.trace).length, 0);
  assert.deepEqual(launchOnlyMissing.goal, {
    config: 'missing_preserved', validation: 'not_run', lifecycle: 'not_dispatched', outcome: 'refused'
  });
  assert.equal(launchOnlyMissing.trace.some((entry) => entry.kind === 'write'), false);
  assert.equal(genericConfirmation.trace.some((entry) => entry.kind === 'write'), false);

  assert.deepEqual(combined.goal, {
    config: 'authored', validation: 'succeeded', lifecycle: 'started', observation: 'bounded_complete', outcome: 'succeeded'
  });
  assert.equal(mutationCalls(combined.trace).length, 1);
  assert.equal(combined.trace.filter((entry) => entry.operation === 'task.start').length, 1);
  assertOrdered(combined.trace, [
    'bounded.read', 'config.write', 'config.validate', 'capabilities.get', 'task.status',
    'task.start', 'task.status', 'task.logs.read', 'readiness.check'
  ]);
});

test('combined recovery scenarios stop at unsafe boundaries and preserve completed config work', () => {
  for (const id of [
    'combined_validation_failed',
    'combined_risk_not_low',
    'combined_existing_config_collision',
    'combined_scope_ambiguous'
  ]) {
    const item = scenario(id);
    assert.equal(mutationCalls(item.trace).length, 0, id);
    assert.equal(item.goal.lifecycle, 'not_dispatched', id);
    assert.equal(item.trace.some((entry) => entry.name === 'config.rollback'), false, id);
  }

  for (const id of ['combined_start_refused_not_dispatched', 'combined_start_effect_unknown']) {
    const item = scenario(id);
    assert.equal(item.goal.config, 'authored', id);
    assert.equal(item.goal.outcome, 'partially_completed', id);
    assert.equal(item.trace.filter((entry) => entry.operation === 'task.start').length, 1, id);
    assert.equal(item.trace.some((entry) => entry.name === 'config.rollback'), false, id);
  }
  const unknown = scenario('combined_start_effect_unknown');
  const afterUnknownStart = unknown.trace.slice(unknown.trace.findIndex((entry) => entry.operation === 'task.start') + 1);
  assert.equal(afterUnknownStart.some((entry) => entry.surface === 'cli'), false);
  assert.equal(unknown.trace.some((entry) => entry.name === 'mutation.replay'), false);
});

test('healthy MCP routing observes before exactly one mutation', () => {
  const trace = scenario('healthy_mcp_start').trace;
  assert.deepEqual(callNames(trace), ['capabilities.get', 'task.status', 'task.start']);
  assert.deepEqual(trace.map((entry) => entry.kind), ['decision', 'call', 'call', 'call', 'report']);
  assert.equal(mutationCalls(trace).length, 1);
  assert.equal(trace.at(-1).outcome, 'succeeded');
});

test('CLI fallback occurs only on pre-dispatch unavailability or explicit capability omission', () => {
  const fallbackIds = ['pre_handshake_cli_fallback', 'capability_omission_cli_fallback'];
  for (const id of fallbackIds) {
    const trace = scenario(id).trace;
    const firstCli = trace.findIndex((entry) => entry.kind === 'call' && entry.surface === 'cli');
    assert.notEqual(firstCli, -1, id);
    assert.equal(trace.slice(0, firstCli).some((entry) => mutationOperations.has(entry.operation)), false, id);
    assert.equal(trace.some((entry) => entry.kind === 'decision' && entry.name === 'fallback' && entry.outcome === 'compatible_cli_allowed'), true, id);
    assert.equal(mutationCalls(trace).length, 1, id);
  }

  const allFallbackIds = fixture.scenarios
    .filter((item) => item.trace.some((entry) => entry.kind === 'call' && entry.surface === 'cli'))
    .map((item) => item.id);
  assert.deepEqual(allFallbackIds, fallbackIds);
});

test('business refusal reports and stops without cross-surface fallback', () => {
  const item = scenario('business_refusal');
  assert.deepEqual(item.appliesTo, [
    'risk_not_low',
    'ownership_not_verified',
    'scope_not_resolved',
    'compatibility_mismatch',
    'resource_busy',
    'plan_digest_mismatch',
    'config_invalid',
    'input_invalid'
  ]);
  assert.equal(item.trace.some((entry) => entry.surface === 'cli'), false);
  assert.equal(mutationCalls(item.trace).length, 1);
  assert.deepEqual(item.trace.slice(-2).map((entry) => entry.outcome), ['refused', 'refused']);
});

test('post-dispatch response loss uses bounded journal recovery and never replays or falls back', () => {
  const ids = [
    'response_loss_known_id',
    'response_loss_lost_id_unique',
    'response_loss_lost_id_zero',
    'response_loss_lost_id_ambiguous'
  ];
  for (const id of ids) {
    const trace = scenario(id).trace;
    assert.equal(trace.some((entry) => entry.surface === 'cli'), false, id);
    assert.equal(trace.filter((entry) => entry.operation === 'task.start').length, 1, id);
    const afterLoss = trace.slice(trace.findIndex((entry) => entry.outcome === 'transport_lost_after_dispatch') + 1);
    assert.equal(afterLoss
      .filter((entry) => entry.kind === 'call')
      .every((entry) => ['operation.list', 'operation.get', 'operation.reconcile'].includes(entry.operation)), true, id);
  }

  const known = scenario('response_loss_known_id').trace;
  assert.deepEqual(callNames(known).slice(-2), ['task.start', 'operation.get']);

  for (const id of ['response_loss_lost_id_unique', 'response_loss_lost_id_zero', 'response_loss_lost_id_ambiguous']) {
    const correlation = scenario(id).trace.find((entry) => entry.operation === 'operation.list');
    assert.equal(correlation.input.projectRef, 'fixture-project', id);
    assert.equal(correlation.input.operationName, 'task.start', id);
    assert.equal(correlation.input.taskRef, 'dev', id);
    assert.ok(correlation.input.limit <= 20, id);
    assert.ok(windowMinutes(correlation.input) <= 15, id);
  }
});

test('config authoring requires explicit intent and never chains lifecycle mutation', () => {
  const inspectOnly = scenario('inspect_only_adoption_strong').trace;
  const authored = scenario('explicit_config_authoring_strong').trace;
  const ambiguous = scenario('ambiguous_config_authoring').trace;
  const existing = scenario('existing_config_authoring_refusal').trace;

  assert.deepEqual(callNames(authored), ['capabilities.get', 'project.list']);
  assert.deepEqual(authored.filter((entry) => entry.kind === 'inspection'), [
    {
      kind: 'inspection',
      surface: 'workspace',
      operation: 'bounded.read',
      input: { maxDepth: 4, maxFiles: 200, secretFiles: 'excluded' },
      outcome: 'strong'
    }
  ]);
  assert.equal(authored.some((entry) => entry.operation === 'adoption.inspect'), false);
  assert.deepEqual(authored.filter((entry) => entry.kind === 'write'), [
    { kind: 'write', surface: 'filesystem', path: '.launchdeck.yml', outcome: 'succeeded' }
  ]);
  const writeIndex = authored.findIndex((entry) => entry.kind === 'write');
  assert.deepEqual(authored[writeIndex + 1], {
    kind: 'validation', surface: 'cli', operation: 'doctor', outcome: 'succeeded'
  });
  assert.equal(mutationCalls(authored).length, 0);

  for (const trace of [inspectOnly, ambiguous, existing]) {
    assert.equal(trace.some((entry) => entry.kind === 'write'), false);
    assert.equal(trace.some((entry) => entry.kind === 'validation'), false);
    assert.equal(mutationCalls(trace).length, 0);
  }
  for (const trace of [inspectOnly, ambiguous]) {
    assert.equal(trace.some((entry) => entry.operation === 'adoption.inspect'), false);
    assert.equal(trace.some((entry) => entry.kind === 'inspection' && entry.surface === 'workspace'), true);
  }
  assert.equal(inspectOnly.some((entry) => entry.name === 'config.authoring' && entry.outcome === 'inspection_only'), true);
  assert.equal(ambiguous.some((entry) => entry.name === 'config.confidence' && entry.outcome === 'weak'), true);
  assert.equal(existing.some((entry) => entry.name === 'config.authoring' && entry.outcome === 'existing_config_preserved'), true);
});

function scenario(id) {
  const found = fixture.scenarios.find((item) => item.id === id);
  assert.ok(found, `Missing routing scenario ${id}`);
  return found;
}

function callNames(trace) {
  return trace.filter((entry) => entry.kind === 'call').map((entry) => entry.operation);
}

function mutationCalls(trace) {
  return trace.filter((entry) => entry.kind === 'call' && mutationOperations.has(entry.operation));
}

function windowMinutes(input) {
  if (Number.isFinite(input.windowMinutes)) return input.windowMinutes;
  return (Date.parse(input.until) - Date.parse(input.since)) / 60_000;
}

function assertOrdered(trace, operations) {
  let cursor = -1;
  for (const operation of operations) {
    cursor = trace.findIndex((entry, index) => index > cursor && entry.operation === operation);
    assert.notEqual(cursor, -1, `Missing ordered operation ${operation}`);
  }
}

function readSkillTraceContract() {
  const content = fs.readFileSync(new URL('../../.agents/skills/launchdeck-agent/references/eval-prompts.md', import.meta.url), 'utf8');
  const match = content.match(/<!-- launchdeck-agent-trace-contract:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- launchdeck-agent-trace-contract:end -->/);
  return match ? JSON.parse(match[1]) : null;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}
