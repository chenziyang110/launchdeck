import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENT_OPERATION_NAMES, validateAgentOperationRequest } from '../../src/kernel/operation-registry.js';
import { createCapabilitiesHandlers } from '../../src/kernel/operations/capabilities.js';
import { createProjectHandlers } from '../../src/kernel/operations/project.js';
import { createTaskHandlers } from '../../src/kernel/operations/task.js';

test('capabilities reports the exact Agent catalog, low-only mutation boundary, and diagnostic compatibility', async () => {
  const handlers = createCapabilitiesHandlers({
    provenance: provenance(),
    compatibility: {
      canRead: true,
      canWrite: false,
      diagnosticOnly: true,
      axes: { agentProtocol: { compatible: true }, stateSchema: { compatible: false } },
      components: { runtime: { compatible: false } }
    },
    evidence: { required: ['CORE-WINDOWS'], passed: [], unavailable: ['CORE-WINDOWS'] }
  });

  const result = await handlers['capabilities.get']({ request: { input: {} } });

  assert.equal(result.outcome.kind, 'succeeded');
  assert.equal(result.resource.kind, 'capabilities');
  assert.deepEqual(result.resource.data.operations.map((operation) => operation.name), AGENT_OPERATION_NAMES);
  assert.deepEqual(result.resource.data.operations.filter((operation) => operation.kind === 'mutation').map((operation) => operation.maxAgentRisk), ['low', 'low', 'low', 'low', 'low']);
  assert.equal(result.resource.data.riskBoundary, 'low-only');
  assert.equal(result.resource.data.compatibility.diagnosticOnly, true);
  assert.equal(result.resource.data.compatibility.canWrite, false);
  assert.equal(result.resource.data.stateHome, provenance().stateHome);
  assert.deepEqual(result.effects, { certainty: 'none', changed: false, evidenceRefs: [] });
  assert.equal(JSON.stringify(result).includes('adoption.apply'), false);
  assert.equal(JSON.stringify(result).includes('force'), false);
});

test('system diagnosis executes only requested bounded checks and redacts provider secrets', async () => {
  const calls = [];
  const handlers = createCapabilitiesHandlers({
    provenance: provenance(),
    diagnosticChecks: {
      runtime: async () => ({ status: 'healthy', executable: 'node' }),
      journal: async () => ({ status: 'degraded', API_TOKEN: 'diagnostic_token_must_not_leak' }),
      registry: async () => {
        calls.push('registry');
        return { status: 'healthy' };
      }
    },
    onDiagnosticCheck: (name) => calls.push(name)
  });

  const result = await handlers['system.diagnose']({
    request: { input: { checks: ['runtime', 'journal'] } }
  });

  assert.deepEqual(calls, ['runtime', 'journal']);
  assert.deepEqual(Object.keys(result.resource.data.checks), ['runtime', 'journal']);
  assert.equal(result.resource.data.checks.journal.API_TOKEN, '[REDACTED]');
  assert.equal(JSON.stringify(result).includes('diagnostic_token_must_not_leak'), false);
  assert.deepEqual(result.effects, { certainty: 'none', changed: false, evidenceRefs: [] });
});

test('project and task queries project existing authority without introducing mutation effects', async () => {
  const projects = [
    { projectId: 'project-a', alias: 'alpha', projectRoot: 'F:/projects/alpha', status: 'active' },
    { projectId: 'project-b', alias: 'bravo', projectRoot: 'F:/projects/bravo', status: 'active' }
  ];
  const projectHandlers = createProjectHandlers({
    listProjects: async () => projects,
    inspectProject: async ({ target }) => ({ target, ownership: 'unknown', status: 'external' })
  });
  const taskHandlers = createTaskHandlers({
    listTasks: async () => [
      { name: 'dev', type: 'managed', risk: 'low' },
      { name: 'build', type: 'command', risk: 'medium' }
    ],
    readTaskStatus: async ({ taskRef }) => ({ taskRef, status: 'running', runId: 'run-a' })
  });

  const listedProjects = await projectHandlers['project.list']({ request: { input: { limit: 2 } } });
  assert.deepEqual(listedProjects.resource.data.projects, projects);
  assert.equal(listedProjects.resource.kind, 'projectCollection');
  assert.deepEqual(listedProjects.effects, { certainty: 'none', changed: false, evidenceRefs: [] });

  const inspected = await projectHandlers['project.inspect']({
    request: { input: { projectRef: 'alpha', target: { kind: 'port', value: 4173 } } },
    inputs: { projectContext: { project: projects[0] } }
  });
  assert.equal(inspected.resource.data.inspection.ownership, 'unknown');
  assert.deepEqual(inspected.nextActions, []);

  const tasks = await taskHandlers['task.list']({
    request: { input: { projectRef: 'alpha', limit: 20 } },
    inputs: { projectContext: { project: projects[0] } }
  });
  assert.deepEqual(tasks.resource.data.tasks.map((task) => task.name), ['build', 'dev']);
  assert.equal(tasks.resource.data.tasks[1].risk, 'low');

  const status = await taskHandlers['task.status']({
    request: { input: { projectRef: 'alpha', taskRef: 'dev' } },
    inputs: { projectContext: { project: projects[0] } }
  });
  assert.equal(status.resource.status, 'running');
  assert.equal(status.resource.runId, 'run-a');
  assert.deepEqual(status.effects, { certainty: 'none', changed: false, evidenceRefs: [] });
});

test('public query schemas reject arbitrary paths, permanent follow, and over-broad limits', () => {
  const invalid = [
    { operation: 'task.logs.read', input: { taskRef: 'dev', path: 'F:/secrets.txt' } },
    { operation: 'task.logs.read', input: { taskRef: 'dev', follow: true } },
    { operation: 'task.logs.read', input: { taskRef: 'dev', maxBytes: 65_537 } },
    { operation: 'task.events.read', input: { taskRef: 'dev', limit: 201 } },
    { operation: 'project.list', input: { limit: 201 } }
  ];
  for (const request of invalid) {
    assert.equal(validateAgentOperationRequest(request).ok, false, JSON.stringify(request));
  }
});

function provenance() {
  return {
    surface: 'mcp',
    host: 'standalone',
    runtimeKind: 'package-mcp',
    runtimeVersion: '0.1.0',
    runtimePath: 'F:/runtime/launchdeck-mcp.mjs',
    stateHome: 'F:/state/launchdeck',
    buildIdentity: `sha256:${'b'.repeat(64)}`,
    agentProtocolVersion: '1.0.0',
    cliSchemaVersion: null
  };
}
