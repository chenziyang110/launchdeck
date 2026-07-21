import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { OPERATION_REGISTRY } from '../../src/kernel/operation-registry.js';

const routingFixture = readJson('./fixtures/routing-traces.json');
const forbidden = readJson('./fixtures/forbidden-calls.json');
const skillFiles = [
  'SKILL.md',
  'references/intent-routing.md',
  'references/command-flows.md',
  'references/recovery-playbooks.md',
  'references/clean-safety.md',
  'references/adoption-flow.md',
  'references/eval-prompts.md'
];

test('every forbidden intent has a zero-call refusal trace', () => {
  for (const id of forbidden.requiredForbiddenScenarioIds) {
    const scenario = routingFixture.scenarios.find((item) => item.id === id);
    assert.ok(scenario, id);
    assert.deepEqual(scenario.trace, [
      { kind: 'decision', name: 'intent.gate', outcome: 'forbidden' },
      { kind: 'report', outcome: 'refused' }
    ], id);
  }
});

test('public Agent registry and deterministic traces contain no dropped operation or forbidden input', () => {
  const publicOperations = OPERATION_REGISTRY.map((definition) => definition.name);
  for (const operation of forbidden.forbiddenOperations) {
    assert.equal(publicOperations.includes(operation), false, operation);
  }
  for (const scenario of routingFixture.scenarios) {
    for (const entry of scenario.trace) {
      assert.equal(forbidden.forbiddenOperations.includes(entry.operation), false, `${scenario.id}:${entry.operation}`);
      visitKeys(entry.input, (key) => {
        assert.equal(forbidden.forbiddenInputKeys.includes(key), false, `${scenario.id}:${key}`);
      });
    }
  }
});

test('canonical Skill exposes no executable force, risky clean, approval, or follow route', () => {
  const violations = [];
  for (const relativePath of skillFiles) {
    const content = fs.readFileSync(new URL(`../../.agents/skills/launchdeck-agent/${relativePath}`, import.meta.url), 'utf8');
    for (const command of executableCodeSpans(content)) {
      for (const pattern of forbidden.forbiddenExecutablePatterns) {
        if (command.includes(pattern)) violations.push({ relativePath, pattern, command });
      }
    }
  }
  assert.deepEqual(violations, []);
});

function executableCodeSpans(content) {
  return [...content.matchAll(/`([^`\r\n]+)`/g)]
    .map((match) => match[1])
    .filter((value) => value.includes('launchdeck ') || value.startsWith('--'));
}

function visitKeys(value, onKey) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) visitKeys(item, onKey);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    onKey(key);
    visitKeys(child, onKey);
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}
