import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLI_ONLY_ROUTES,
  CLI_OPERATION_ROUTES,
  mapCliInvocation
} from '../../src/adapters/cli-operation-map.js';
import { AGENT_OPERATION_NAMES } from '../../src/kernel/operation-registry.js';
import { validateAgentOperationResult } from '../../src/kernel/agent-result.js';
import { createCliFixture } from '../helpers/cli-fixture.js';

test('declarative CLI operation map exposes only bounded query/adoption/recovery routes in this cutover', () => {
  assert.deepEqual(CLI_OPERATION_ROUTES.map((route) => route.route), [
    'capabilities',
    'diagnose',
    'projects',
    'tasks',
    'inspect',
    'logs',
    'events',
    'adoption.inspect',
    'operation.list',
    'operation.get',
    'operation.reconcile'
  ]);
  assert.deepEqual(CLI_OPERATION_ROUTES.map((route) => route.operation), [
    'capabilities.get',
    'system.diagnose',
    'project.list',
    'task.list',
    'project.inspect',
    'task.logs.read',
    'task.events.read',
    'adoption.inspect',
    'operation.list',
    'operation.get',
    'operation.reconcile'
  ]);
  for (const route of CLI_OPERATION_ROUTES) {
    assert.equal(AGENT_OPERATION_NAMES.includes(route.operation), true, route.route);
    assert.equal(route.kind, 'query', route.route);
  }
});

test('CLI mapping produces only closed Agent inputs and keeps CLI-only controls outside the Agent catalog', () => {
  const context = { projectRef: 'alpha' };
  const cases = [
    { invocation: { positionals: ['capabilities'], options: {} }, operation: 'capabilities.get', input: {} },
    { invocation: { positionals: ['diagnose'], options: { checks: ['runtime', 'journal'] } }, operation: 'system.diagnose', input: { projectRef: 'alpha', checks: ['runtime', 'journal'] } },
    { invocation: { positionals: ['projects'], options: { limit: 20 } }, operation: 'project.list', input: { limit: 20 } },
    { invocation: { positionals: ['tasks'], options: { limit: 20 } }, operation: 'task.list', input: { projectRef: 'alpha', limit: 20 } },
    { invocation: { positionals: ['adoption', 'inspect'], options: { maxDepth: 3, maxFiles: 50 } }, operation: 'adoption.inspect', input: { projectRef: 'alpha', maxDepth: 3, maxFiles: 50 } },
    { invocation: { positionals: ['operation', 'get', 'op_aaaaaaaaaaaaaaaa'], options: {} }, operation: 'operation.get', input: { operationId: 'op_aaaaaaaaaaaaaaaa' } }
  ];
  for (const expected of cases) {
    assert.deepEqual(mapCliInvocation({ ...expected.invocation, context }), {
      operation: expected.operation,
      input: expected.input
    });
  }

  for (const route of ['init', 'project.add', 'agent.install', 'force-stop', 'clean.all', 'logs.follow']) {
    assert.equal(CLI_ONLY_ROUTES.includes(route), true, route);
  }
  assert.equal(mapCliInvocation({ positionals: ['force-stop', 'alpha:dev'], options: { force: true }, context }), null);
  assert.equal(mapCliInvocation({ positionals: ['clean'], options: { all: true, yes: true }, context }), null);
  assert.equal(mapCliInvocation({ positionals: ['logs', 'dev'], options: { follow: true }, context }), null);
});

test('migrated tasks JSON route preserves legacy fields and nests one normalized Agent result', () => {
  const fixture = createCliFixture();
  try {
    fixture.writeConfig(config());
    const result = fixture.runCliJson(['tasks']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.schemaVersion, 1);
    assert.equal(result.json.command, 'tasks');
    assert.equal(result.json.ok, true);
    assert.equal(result.json.project.name, 'adapter-project');
    assert.deepEqual(result.json.tasks.map((task) => task.name), ['build', 'dev']);
    assert.equal(result.json.agentResult, undefined);
    assert.equal(validateAgentOperationResult(result.json.data.agentResult).ok, true);
    assert.equal(result.json.data.agentResult.operation.name, 'task.list');
    assert.equal(result.json.data.agentResult.outcome.kind, 'succeeded');
    assert.equal(result.json.data.agentResult.resource.status, 'available');
    assert.equal(result.json.data.agentResult.effects.changed, false);
    assert.equal(result.json.data.agentResult.provenance.cliSchemaVersion, 1);
  } finally {
    fixture.cleanup();
  }
});

test('capabilities is independently reachable through the real CLI and CLI-only init stays outside Kernel routing', () => {
  const fixture = createCliFixture();
  try {
    const capabilities = fixture.runCliJson(['capabilities']);
    assert.equal(capabilities.status, 0, capabilities.stderr);
    assert.equal(capabilities.json.schemaVersion, 1);
    assert.equal(capabilities.json.command, 'capabilities');
    assert.equal(validateAgentOperationResult(capabilities.json.data.agentResult).ok, true);
    assert.equal(capabilities.json.data.agentResult.operation.name, 'capabilities.get');

    const initialized = fixture.runCliJson(['init']);
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.equal(initialized.json.schemaVersion, 1);
    assert.equal(initialized.json.data.agentResult, undefined);
  } finally {
    fixture.cleanup();
  }
});

function config() {
  return {
    version: 1,
    project: { name: 'adapter-project' },
    tasks: {
      build: { command: 'node -e "process.exit(0)"', risk: 'medium' },
      dev: { command: 'node scripts/dev.js', longRunning: true, risk: 'low' }
    },
    clean: { safe: ['dist'], risky: ['node_modules'] }
  };
}
