import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { getOperationDefinition } from '../../src/kernel/operation-registry.js';
import {
  assessCompatibility,
  evaluateCompatibilityGate
} from '../../src/kernel/compatibility.js';

test('component mismatch blocks writes even when every version axis matches', () => {
  const local = manifest();
  const observed = structuredClone(local);
  observed.componentDigests.operationRegistry = `sha256:${'f'.repeat(64)}`;

  const assessment = assessCompatibility(local, observed);
  assert.equal(assessment.axes.operationCatalog.writable, true);
  assert.equal(assessment.components.operationRegistry.matches, false);
  assert.equal(assessment.canWrite, false);
  assert.equal(assessment.diagnosticOnly, true);

  const gate = evaluateCompatibilityGate(getOperationDefinition('task.start'), assessment);
  assert.deepEqual(gate, {
    allowed: false,
    code: 'compatibility_mismatch',
    diagnosticOnly: true
  });
});

test('capabilities and diagnosis remain available on incompatible components without authorizing mutation', () => {
  const local = manifest();
  const observed = structuredClone(local);
  observed.versions.registryState.current = 99;
  const assessment = assessCompatibility(local, observed);

  for (const operation of ['capabilities.get', 'system.diagnose']) {
    const gate = evaluateCompatibilityGate(getOperationDefinition(operation), assessment);
    assert.equal(gate.allowed, true, operation);
    assert.equal(gate.diagnosticOnly, true, operation);
  }
  assert.equal(evaluateCompatibilityGate(getOperationDefinition('task.stop'), assessment).allowed, false);
});

test('package version and runtime path alone never restore write compatibility', () => {
  const local = manifest();
  const observed = structuredClone(local);
  observed.packageVersion = local.packageVersion;
  observed.componentDigests.operationSchemas = `sha256:${'e'.repeat(64)}`;
  observed.hostArtifacts.codex.artifactId = 'same-path-label';

  const assessment = assessCompatibility(local, observed);
  assert.equal(assessment.canWrite, false);
  assert.equal(assessment.components.operationSchemas.matches, false);
});

function manifest() {
  return JSON.parse(fs.readFileSync(new URL('../../agent/compatibility-manifest.json', import.meta.url), 'utf8'));
}
