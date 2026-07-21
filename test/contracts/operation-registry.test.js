import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AGENT_OPERATION_NAMES,
  OPERATION_REGISTRY,
  getOperationDefinition,
  listAgentOperations
} from '../../src/kernel/operation-registry.js';

export const EXPECTED_AGENT_OPERATIONS = Object.freeze([
  'capabilities.get',
  'system.diagnose',
  'project.list',
  'project.inspect',
  'adoption.inspect',
  'task.list',
  'task.status',
  'task.logs.read',
  'task.events.read',
  'task.start',
  'task.stop',
  'task.restart',
  'task.run',
  'operation.list',
  'operation.get',
  'operation.reconcile',
  'clean.plan',
  'clean.applySafe'
]);

const EXCLUDED_OPERATIONS = Object.freeze([
  'adoption.apply',
  'task.forceStop',
  'task.logs.follow',
  'project.remove',
  'clean.applyAll',
  'clean.reset',
  'shell.run',
  'remote.execute'
]);

test('operation registry exposes exactly the approved 18 operations', () => {
  assert.deepEqual(AGENT_OPERATION_NAMES, EXPECTED_AGENT_OPERATIONS);
  assert.equal(OPERATION_REGISTRY.length, 18);
  assert.deepEqual(OPERATION_REGISTRY.map((entry) => entry.name), EXPECTED_AGENT_OPERATIONS);
  assert.deepEqual(listAgentOperations().map((entry) => entry.name), EXPECTED_AGENT_OPERATIONS);

  for (const entry of OPERATION_REGISTRY) {
    assert.equal(entry.agentExposed, true, entry.name);
    assert.match(entry.inputSchemaRef, /^#\/\$defs\/[a-z][A-Za-z0-9.]+$/);
    assert.ok(['query', 'mutation', 'recovery'].includes(entry.kind), entry.name);
    assert.ok(['none', 'low'].includes(entry.maxAgentRisk), entry.name);
    assert.equal(getOperationDefinition(entry.name), entry);
  }
});

test('deferred and dropped operations have no registry entry', () => {
  for (const operation of EXCLUDED_OPERATIONS) {
    assert.equal(getOperationDefinition(operation), null, operation);
    assert.equal(AGENT_OPERATION_NAMES.includes(operation), false, operation);
  }
});

test('registry declaration contains no state, effect, or transport imports', () => {
  const source = fs.readFileSync(new URL('../../src/kernel/operation-registry.js', import.meta.url), 'utf8');
  const importSpecifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

  for (const specifier of importSpecifiers) {
    assert.doesNotMatch(specifier, /(?:node:fs|node:child_process|control-plane|runtime\.js|@modelcontextprotocol)/);
  }
});
