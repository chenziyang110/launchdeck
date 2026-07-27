import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createHostRegistry,
  evaluateHostCapability
} from '../../../src/agent/hosts/index.js';

const fixtureRoot = fileURLToPath(new URL('../../fixtures/agent-hosts/matrix/', import.meta.url));
const productionMatrix = JSON.parse(
  fs.readFileSync(new URL('../../../src/agent/hosts/compatibility-matrix.json', import.meta.url), 'utf8')
);
const codexRealHostEvidence = JSON.parse(
  fs.readFileSync(new URL('../../../src/agent/hosts/evidence/codex-0.145.0-win32.json', import.meta.url), 'utf8')
);

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8'));
}

function request(overrides = {}) {
  return {
    host: 'github-copilot',
    exactVersion: '1.4.2',
    platform: 'win32',
    component: 'skill',
    scope: 'project',
    ...overrides
  };
}

test('capabilities require one exact host/version/platform/component/scope evidence row', () => {
  const matrix = fixture('exact-rows.json');
  const result = evaluateHostCapability(matrix, request());

  assert.equal(result.supportState, 'supported');
  assert.equal(result.rowId, 'copilot-1.4.2-win32-skill-project');
  assert.equal(result.relativePath, '.agents/skills/launchdeck-agent');
  assert.equal(result.dialect, 'skill-directory');
  assert.equal(result.fixtureRevision, 'copilot-contract-v1');
  assert.equal(result.realHostEvidenceRevision, 'synthetic-real-host-v1');
});

test('an absent row is unsupported and never inferred from a nearby version', () => {
  const matrix = fixture('exact-rows.json');
  const result = evaluateHostCapability(matrix, request({ exactVersion: '1.4.3' }));

  assert.equal(result.supportState, 'unsupported');
  assert.equal(result.reason, 'absent-capability-row');
  assert.equal('rowId' in result, false);
});

test('contradictory exact rows are ambiguous rather than selected by ordering', () => {
  const matrix = fixture('contradictory-rows.json');
  const result = evaluateHostCapability(matrix, request());

  assert.equal(result.supportState, 'ambiguous');
  assert.equal(result.reason, 'contradictory-capability-rows');
  assert.deepEqual(result.rowIds, [
    'copilot-1.4.2-win32-skill-project-a',
    'copilot-1.4.2-win32-skill-project-b'
  ]);
});

test('scope is part of the exact key and Visual Studio user scope cannot fall back to project', () => {
  const matrix = fixture('exact-rows.json');
  const result = evaluateHostCapability(matrix, request({
    host: 'visual-studio',
    exactVersion: '17.14.8',
    component: 'mcp',
    scope: 'user'
  }));

  assert.equal(result.supportState, 'unsupported');
  assert.equal(result.reason, 'scope-not-proven');
  assert.equal(result.availableScopes.includes('project'), true);
});

test('matrix rows without both fixture and real-host evidence cannot enable support', () => {
  const matrix = fixture('exact-rows.json');
  const incomplete = structuredClone(matrix);
  delete incomplete.rows[0].realHostEvidenceRevision;

  const result = evaluateHostCapability(incomplete, {
    host: incomplete.rows[0].host,
    exactVersion: incomplete.rows[0].exactVersion,
    platform: incomplete.rows[0].platform,
    component: incomplete.rows[0].component,
    scope: incomplete.rows[0].scope
  });

  assert.equal(result.supportState, 'unsupported');
  assert.equal(result.reason, 'evidence-incomplete');
});

test('fixture-only rows remain unsupported even when their evidence labels are populated', () => {
  const matrix = fixture('exact-rows.json');
  const fixtureOnly = structuredClone(matrix);
  fixtureOnly.rows[0].supportState = 'fixture-only';

  const row = fixtureOnly.rows[0];
  const result = evaluateHostCapability(fixtureOnly, {
    host: row.host,
    exactVersion: row.exactVersion,
    platform: row.platform,
    component: row.component,
    scope: row.scope
  });

  assert.equal(result.supportState, 'unsupported');
  assert.equal(result.reason, 'evidence-incomplete');
});

test('the registry exposes one immutable matrix revision to all adapter consumers', () => {
  const matrix = fixture('exact-rows.json');
  const registry = createHostRegistry({ matrix });

  assert.equal(registry.matrix.revision, 'agent-host-matrix-contract-v1');
  assert.equal(registry.matrix.schemaVersion, 1);
  assert.equal(Object.isFrozen(registry.matrix), true);
  assert.equal(Object.isFrozen(registry.matrix.rows), true);
  assert.equal(new Set(registry.matrix.rows.map((row) => row.rowId)).size, registry.matrix.rows.length);
});

test('production Codex support is bound to maintained exact-version real-host evidence', () => {
  assert.equal(codexRealHostEvidence.host, 'codex');
  assert.equal(codexRealHostEvidence.exactVersion, '0.145.0');
  assert.equal(codexRealHostEvidence.platform, 'win32');
  assert.equal(codexRealHostEvidence.privacy.containsHomePath, false);
  assert.equal(codexRealHostEvidence.privacy.containsCredentials, false);
  assert.equal(codexRealHostEvidence.privacy.containsEnvironmentValues, false);

  for (const component of ['skill', 'mcp']) {
    const evidence = codexRealHostEvidence.components.find(
      (entry) => entry.component === component && entry.scope === 'project'
    );
    assert.equal(evidence?.observed, true);
    const result = evaluateHostCapability(productionMatrix, {
      host: 'codex',
      exactVersion: codexRealHostEvidence.exactVersion,
      platform: codexRealHostEvidence.platform,
      component,
      scope: 'project'
    });
    assert.equal(result.supportState, 'supported');
    assert.equal(result.realHostEvidenceRevision, codexRealHostEvidence.revision);
    assert.equal(result.relativePath, evidence.relativePath);
    assert.equal(result.dialect, evidence.dialect);
  }
});

test('production Codex evidence does not claim unobserved user or Linux support', () => {
  for (const request of [
    {
      host: 'codex',
      exactVersion: '0.145.0',
      platform: 'win32',
      component: 'skill',
      scope: 'user'
    },
    {
      host: 'codex',
      exactVersion: '0.145.0',
      platform: 'linux',
      component: 'mcp',
      scope: 'project'
    }
  ]) {
    const result = evaluateHostCapability(productionMatrix, request);
    assert.equal(result.supportState, 'unsupported');
  }
});
