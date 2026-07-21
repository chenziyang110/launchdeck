import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const evidenceRoot = path.join(repoRoot, 'agent', 'evidence');
const index = readJson(path.join(evidenceRoot, 'index.json'));
const compatibility = readJson(path.join(repoRoot, 'agent', 'compatibility-manifest.json'));

test('evidence index binds every entry to one real cell and its exact candidate identity', () => {
  assert.equal(index.candidate.buildIdentity, compatibility.buildIdentity);
  assert.match(index.claimBoundary, /no aggregate host-release conclusion/i);
  assert.ok(index.entries.length > 0);

  for (const entry of index.entries) {
    const cell = readJson(path.join(evidenceRoot, entry.path));
    assert.equal(cell.cellId, entry.cellId, entry.path);
    assert.ok(['current', 'superseded'].includes(entry.candidateRelation), entry.path);
    assert.equal(entry.candidateRelation === 'current', cell.buildIdentity === index.candidate.buildIdentity, entry.path);
  }
});

test('evidence index cannot hide incomplete host work behind a broad release field', () => {
  for (const key of ['ready', 'readiness', 'rollup', 'overallReady', 'overallStatus']) {
    assert.equal(hasKey(index, key), false, key);
  }
  assert.ok(index.withheldClaims.length > 0);
});

function hasKey(value, expected) {
  if (Array.isArray(value)) return value.some((entry) => hasKey(entry, expected));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) => key === expected || hasKey(entry, expected));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
