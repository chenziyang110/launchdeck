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
  'clean.applySafe'
]);

test('canonical Skill publishes the exact deterministic ordered routing traces', () => {
  assert.ok(skillContract, 'references/eval-prompts.md must contain the launchdeck-agent trace contract markers');
  assert.deepEqual(skillContract, fixture);
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

function readSkillTraceContract() {
  const content = fs.readFileSync(new URL('../../.agents/skills/launchdeck-agent/references/eval-prompts.md', import.meta.url), 'utf8');
  const match = content.match(/<!-- launchdeck-agent-trace-contract:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- launchdeck-agent-trace-contract:end -->/);
  return match ? JSON.parse(match[1]) : null;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}
