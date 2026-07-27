import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeInstallerResult,
  redactInstallerValue
} from '../../src/agent/result.js';
import {
  AgentInstallerError,
  toInstallerErrorPayload
} from '../../src/agent/errors.js';

const SECRET_CANARIES = [
  'Bearer super-secret-authorization',
  'sk-test-api-token',
  'database-password',
  'cookie-session-secret',
  'ENV_SECRET_VALUE',
  '{\"mcpServers\":{\"private\":{\"env\":{\"TOKEN\":\"raw-config-secret\"}}}}'
];

test('recursive redaction removes secret values from nested objects and arrays without mutating evidence', () => {
  const evidence = {
    targetPath: 'F:/projects/demo/.mcp.json',
    digest: `sha256:${'a'.repeat(64)}`,
    authorization: SECRET_CANARIES[0],
    nested: {
      apiToken: SECRET_CANARIES[1],
      password: SECRET_CANARIES[2],
      credentials: [{ cookie: SECRET_CANARIES[3] }],
      env: { LAUNCHDECK_TOKEN: SECRET_CANARIES[4] },
      rawConfigBody: SECRET_CANARIES[5],
      fieldNames: ['command', 'args', 'env']
    }
  };
  const snapshot = structuredClone(evidence);
  const redacted = redactInstallerValue(evidence);
  const serialized = JSON.stringify(redacted);

  assert.deepEqual(evidence, snapshot, 'redaction must not mutate live evidence');
  assert.equal(redacted.targetPath, evidence.targetPath);
  assert.equal(redacted.digest, evidence.digest);
  assert.deepEqual(redacted.nested.fieldNames, ['command', 'args', 'env']);
  for (const secret of SECRET_CANARIES) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.equal(serialized.includes('[REDACTED]'), true);
  assert.equal(Object.isFrozen(redacted), true);
  assert.equal(Object.isFrozen(redacted.nested.credentials[0]), true);
});

test('typed error projection recursively redacts details and message canaries before persistence or rendering', () => {
  const error = new AgentInstallerError(
    'agent_adapter_failed',
    `Adapter refused ${SECRET_CANARIES[0]}.`,
    {
      effectCertainty: 'none',
      details: {
        hostId: 'claude',
        targetPath: 'F:/projects/demo/.mcp.json',
        headers: { authorization: SECRET_CANARIES[0] },
        cause: {
          apiKey: SECRET_CANARIES[1],
          rawConfigBody: SECRET_CANARIES[5]
        }
      },
      nextActions: [{
        kind: 'inspect',
        label: 'Inspect the Claude project approval state.',
        input: { token: SECRET_CANARIES[1], targetPath: 'F:/projects/demo/.mcp.json' }
      }]
    }
  );
  const payload = toInstallerErrorPayload(error);
  const serialized = JSON.stringify(payload);

  assert.equal(payload.code, 'agent_adapter_failed');
  assert.equal(payload.effectCertainty, 'none');
  assert.equal(payload.details.hostId, 'claude');
  assert.equal(payload.details.targetPath, 'F:/projects/demo/.mcp.json');
  for (const secret of SECRET_CANARIES) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.equal(serialized.includes('stack'), false);
});

test('normalized refused result allows safe identities and paths but no environment or raw config values', () => {
  const result = normalizeInstallerResult({
    outcome: 'refused',
    effectCertainty: 'none',
    scope: 'project',
    projectIdentity: 'F:/projects/flask-demo',
    buildIdentity: `sha256:${'b'.repeat(64)}`,
    operationId: null,
    planDigest: `sha256:${'c'.repeat(64)}`,
    receiptId: null,
    targets: [{
      targetId: 'claude:project:mcp',
      hostId: 'claude',
      component: 'mcp',
      state: 'divergent',
      path: 'F:/projects/flask-demo/.mcp.json',
      digest: `sha256:${'d'.repeat(64)}`,
      diagnostic: {
        fieldNames: ['command', 'args', 'env'],
        env: { API_TOKEN: SECRET_CANARIES[1] },
        rawConfigBody: SECRET_CANARIES[5]
      }
    }],
    health: [{
      code: 'agent_target_divergent',
      severity: 'error',
      message: `Do not print ${SECRET_CANARIES[2]}.`
    }],
    effects: [],
    nextActions: [{
      kind: 'inspect',
      label: 'Review the existing Launchdeck entry.',
      input: { targetPath: 'F:/projects/flask-demo/.mcp.json' }
    }],
    error: {
      code: 'agent_target_divergent',
      message: `Existing config contained ${SECRET_CANARIES[3]}.`,
      details: {
        targetPath: 'F:/projects/flask-demo/.mcp.json',
        authorization: SECRET_CANARIES[0]
      }
    }
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.targets[0].path, 'F:/projects/flask-demo/.mcp.json');
  assert.equal(result.targets[0].digest, `sha256:${'d'.repeat(64)}`);
  assert.deepEqual(result.targets[0].diagnostic.fieldNames, ['command', 'args', 'env']);
  for (const secret of SECRET_CANARIES) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});
