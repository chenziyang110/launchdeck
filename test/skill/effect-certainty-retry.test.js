import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const skill = fs.readFileSync(new URL('../../.agents/skills/launchdeck-agent/SKILL.md', import.meta.url), 'utf8');
const commandFlows = fs.readFileSync(
  new URL('../../.agents/skills/launchdeck-agent/references/command-flows.md', import.meta.url),
  'utf8'
);
const contract = `${skill}\n${commandFlows}`;

test('Skill permits at most one deterministic input correction only after proven non-dispatch', () => {
  assert.match(contract, /at most one|only once/i);
  assert.match(contract, /certainty[^\n]*`?none`?/i);
  assert.match(contract, /dispatch[^\n]*`?not_dispatched`?/i);
  assert.match(contract, /availableTasks/);
  assert.match(contract, /defaultTask/);
  assert.match(contract, /correct(?:ed|ion)[^\n]*(?:task|input)|(?:task|input)[^\n]*correct(?:ed|ion)/i);
});

test('Skill never replays unknown or possibly dispatched effects and requires correlation or reconciliation', () => {
  assert.match(contract, /certainty[^\n]*`?unknown`?/i);
  assert.match(contract, /never[^\n]*(?:replay|repeat)|(?:replay|repeat)[^\n]*never/i);
  assert.match(contract, /operation\.list/);
  assert.match(contract, /operation\.(?:get|reconcile)/);
});
