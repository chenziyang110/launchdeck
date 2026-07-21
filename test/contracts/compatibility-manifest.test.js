import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { OPERATION_REGISTRY } from '../../src/kernel/operation-registry.js';
import {
  COMPATIBILITY_VERSION_AXES,
  assessCompatibility,
  canonicalDigest,
  computeBuildIdentity,
  validateCompatibilityManifest
} from '../../src/kernel/compatibility.js';

const EXPECTED_AGENT_OPERATIONS = Object.freeze([
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

const EXPECTED_AXES = Object.freeze([
  'agentProtocol',
  'cliSchema',
  'configSchema',
  'registryState',
  'runtimeState',
  'runIndex',
  'lockRecord',
  'eventSchema',
  'operationJournal',
  'operationCatalog',
  'skillContract',
  'pluginBundleFormat',
  'codexHostManifest',
  'claudeHostManifest'
]);

test('production compatibility schemas remain identical to the approved contracts', () => {
  for (const name of [
    'agent-operations.schema.json',
    'compatibility-manifest.schema.json'
  ]) {
    assert.deepEqual(readJson(`../../schema/${name}`), readJson(`../../.specify/features/2026-07-19-launchdeck-agent-surfaces/contracts/${name}`), name);
  }
});

test('compatibility manifest has independent axes and the exact Agent catalog', () => {
  const manifest = readJson('../../agent/compatibility-manifest.json');
  const validation = validateCompatibilityManifest(manifest);

  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.deepEqual(COMPATIBILITY_VERSION_AXES, EXPECTED_AXES);
  assert.deepEqual(Object.keys(manifest.versions), EXPECTED_AXES);
  assert.deepEqual(manifest.supportedOperations.agentOperations, EXPECTED_AGENT_OPERATIONS);
  assert.equal(manifest.supportedOperations.maxAgentRisk, 'low');
  assert.equal(manifest.supportedOperations.registryDigest, manifest.componentDigests.operationRegistry);
  assert.equal(manifest.supportedOperations.schemaDigest, manifest.componentDigests.operationSchemas);
  assert.notEqual(manifest.hostArtifacts.codex.artifactId, manifest.hostArtifacts.claude.artifactId);
});

test('component digests and build identity use canonical non-self-referential hashing', () => {
  const manifest = readJson('../../agent/compatibility-manifest.json');
  const operationSchema = readJson('../../schema/agent-operations.schema.json');
  const resultSchema = readJson('../../schema/agent-operation-result.schema.json');

  assert.equal(manifest.componentDigests.operationRegistry, canonicalDigest(OPERATION_REGISTRY));
  assert.equal(manifest.componentDigests.operationSchemas, canonicalDigest(operationSchema));
  assert.equal(manifest.componentDigests.agentResultSchema, canonicalDigest(resultSchema));
  assert.equal(computeBuildIdentity(manifest), manifest.buildIdentity);

  const changedIdentityOnly = structuredClone(manifest);
  changedIdentityOnly.buildIdentity = `sha256:${'f'.repeat(64)}`;
  assert.equal(computeBuildIdentity(changedIdentityOnly), manifest.buildIdentity);

  const changedPackage = structuredClone(manifest);
  changedPackage.packageVersion = '0.1.1';
  assert.notEqual(computeBuildIdentity(changedPackage), manifest.buildIdentity);

  assert.equal(canonicalDigest({ b: 2, a: 1 }), canonicalDigest({ a: 1, b: 2 }));
});

test('one incompatible version axis does not overwrite other compatibility decisions', () => {
  const local = readJson('../../agent/compatibility-manifest.json');
  const observed = structuredClone(local);
  observed.versions.cliSchema.current = 2;

  const assessment = assessCompatibility(local, observed);
  assert.equal(assessment.axes.agentProtocol.readable, true);
  assert.equal(assessment.axes.agentProtocol.writable, true);
  assert.equal(assessment.axes.cliSchema.writable, false);
  assert.equal(assessment.canWrite, false);
  assert.equal(assessment.diagnosticOnly, true);
});

test('host compatibility metadata contains no policy, operation, state, or authorization rules', () => {
  const manifest = readJson('../../agent/compatibility-manifest.json');
  const forbidden = new Set(['policy', 'risk', 'ownership', 'stateHome', 'journal', 'retry', 'fallback', 'authorization', 'operations']);

  visit(manifest.hostArtifacts, (key) => {
    assert.equal(forbidden.has(key), false, key);
  });
});

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

function visit(value, onKey) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, onKey);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    onKey(key);
    visit(child, onKey);
  }
}
