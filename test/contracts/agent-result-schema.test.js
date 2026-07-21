import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  AGENT_RESULT_FIELDS,
  normalizeAgentOperationResult,
  validateAgentOperationResult
} from '../../src/kernel/agent-result.js';

const EXPECTED_FIELDS = Object.freeze([
  'protocolVersion',
  'operation',
  'outcome',
  'resource',
  'effects',
  'safety',
  'error',
  'nextActions',
  'provenance'
]);

test('production Agent result schema is the frozen nine-field contract', () => {
  const frozen = readJson('../../.specify/features/2026-07-19-launchdeck-agent-surfaces/contracts/agent-operation-result.schema.json');
  const production = readJson('../../schema/agent-operation-result.schema.json');

  assert.deepEqual(production, frozen);
  assert.deepEqual(AGENT_RESULT_FIELDS, EXPECTED_FIELDS);
  assert.deepEqual(production.required, EXPECTED_FIELDS);
  assert.equal(production.additionalProperties, false);
});

test('normalizer preserves outcome and resource status as independent concepts', () => {
  const normalized = normalizeAgentOperationResult(validResult({
    outcome: { kind: 'succeeded', code: 'task_reused', message: 'Existing run reused.', reusedExistingRun: true },
    resource: { kind: 'run', id: 'run-1', status: 'running', projectRef: 'project-a', taskRef: 'dev', runId: 'run-1' }
  }));

  assert.deepEqual(Object.keys(normalized), EXPECTED_FIELDS);
  assert.equal(normalized.outcome.kind, 'succeeded');
  assert.equal(normalized.resource.status, 'running');
  assert.equal(normalized.outcome.reusedExistingRun, true);
  assert.equal(validateAgentOperationResult(normalized).ok, true);
});

test('Agent result validator rejects missing, extra, and invalid effects fields', () => {
  const missing = validResult();
  delete missing.provenance;
  assert.equal(validateAgentOperationResult(missing).ok, false);

  const extra = { ...validResult(), schemaVersion: 1 };
  assert.equal(validateAgentOperationResult(extra).ok, false);

  const impossibleEffects = validResult({ effects: { certainty: 'none', changed: true, evidenceRefs: [] } });
  assert.equal(validateAgentOperationResult(impossibleEffects).ok, false);
});

test('Agent protocol and CLI schema versions remain separate axes', () => {
  const result = validResult();
  assert.equal(result.protocolVersion, '1.0.0');
  assert.equal(result.provenance.agentProtocolVersion, '1.0.0');
  assert.equal(result.provenance.cliSchemaVersion, 1);

  const mcpResult = validResult({
    provenance: { ...result.provenance, surface: 'mcp', runtimeKind: 'package-mcp', cliSchemaVersion: null }
  });
  assert.equal(validateAgentOperationResult(mcpResult).ok, true);
});

function validResult(overrides = {}) {
  const base = {
    protocolVersion: '1.0.0',
    operation: {
      id: 'op_0123456789abcdef',
      name: 'task.start',
      inputDigest: `sha256:${'a'.repeat(64)}`,
      journalStatus: 'succeeded'
    },
    outcome: { kind: 'succeeded', code: 'task_started', message: 'Task started.', reusedExistingRun: false },
    resource: { kind: 'run', id: 'run-1', status: 'running', projectRef: 'project-a', taskRef: 'dev', runId: 'run-1' },
    effects: { certainty: 'confirmed', changed: true, evidenceRefs: ['run:run-1'] },
    safety: { risk: 'low', decision: 'allowed', ownership: 'verified', projectScope: 'resolved' },
    error: null,
    nextActions: [],
    provenance: {
      surface: 'cli',
      host: 'standalone',
      runtimeKind: 'package-cli',
      runtimeVersion: '0.1.0',
      runtimePath: 'F:/fixture/src/cli.js',
      stateHome: 'F:/fixture/home',
      buildIdentity: `sha256:${'b'.repeat(64)}`,
      agentProtocolVersion: '1.0.0',
      cliSchemaVersion: 1
    }
  };

  return { ...base, ...overrides };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}
