import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  recordEvidenceCell,
  validateEvidenceCell,
  validateEvidencePaths
} from '../../scripts/run-agent-evidence.js';
import { createReadinessCell, createStatusCell } from './helpers/readiness-fixture.js';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const runnerPath = path.join(repoRoot, 'scripts', 'run-agent-evidence.js');
const requiredDimensions = [
  'buildIdentity',
  'componentDigests',
  'surface',
  'host',
  'platform',
  'runtime',
  'scenario',
  'fixture',
  'execution',
  'result',
  'evidence',
  'invalidation'
];

test('exact readiness cell accepts every required dimension and immutable raw evidence', () => {
  const validation = validateEvidenceCell(createReadinessCell());
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
});

test('schema rejects every missing readiness dimension independently', () => {
  for (const dimension of requiredDimensions) {
    const cell = createReadinessCell();
    delete cell[dimension];
    const validation = validateEvidenceCell(cell);
    assert.equal(validation.ok, false, dimension);
    assert.equal(validation.errors.some((entry) => entry.path === `/${dimension}`), true, dimension);
  }
});

test('all non-ready terminal and not-executed states remain valid visible cells', () => {
  const statuses = [
    'not_executed',
    'not_executed_host_owned',
    'passed',
    'failed',
    'blocked',
    'unsupported',
    'stale'
  ];
  for (const status of statuses) {
    const validation = validateEvidenceCell(createStatusCell(status));
    assert.equal(validation.ok, true, `${status}: ${JSON.stringify(validation.errors)}`);
  }
});

test('blocked cells may expose unobserved environment dimensions but passing cells may not', () => {
  const blocked = createStatusCell('blocked');
  blocked.platform.version = null;
  blocked.platform.build = null;
  blocked.platform.architecture = null;
  blocked.runtime.nodeExecutable = null;
  blocked.runtime.nodeVersion = null;
  blocked.invalidation.keys.osVersion = null;
  blocked.invalidation.keys.osBuild = null;
  blocked.invalidation.keys.architecture = null;
  blocked.invalidation.keys.nodeVersion = null;
  assert.equal(validateEvidenceCell(blocked).ok, true);

  const passing = structuredClone(blocked);
  passing.status = 'passed';
  const validation = validateEvidenceCell(passing);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((entry) => entry.code === 'exact_environment_required'), true);
});

test('broad readiness and roll-up fields are rejected instead of inferred', () => {
  for (const field of ['ready', 'readiness', 'rollup', 'overallReady', 'overallStatus']) {
    const validation = validateEvidenceCell({ ...createReadinessCell(), [field]: true });
    assert.equal(validation.ok, false, field);
    assert.equal(validation.errors.some((entry) => entry.code === 'additional_property'), true, field);
  }
});

test('invalidation keys must bind the exact build host OS runtime and fixture dimensions', () => {
  const mismatches = [
    ['buildIdentity', 'sha256:0000000000000000000000000000000000000000000000000000000000000000'],
    ['os', 'linux'],
    ['architecture', 'arm64'],
    ['nodeVersion', '20.0.0'],
    ['fixtureDigest', 'sha256:0000000000000000000000000000000000000000000000000000000000000000']
  ];
  for (const [key, value] of mismatches) {
    const cell = createReadinessCell({ invalidation: { keys: { [key]: value } } });
    const validation = validateEvidenceCell(cell);
    assert.equal(validation.ok, false, key);
    assert.equal(validation.errors.some((entry) => entry.code === 'invalidation_key_mismatch'), true, key);
  }
});

test('recording is atomic, idempotent, and refuses divergent replacement', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-evidence-record-'));
  try {
    const target = path.join(root, 'cell.json');
    const digest = writeRawReceipt(root);
    const cell = createReadinessCell();
    cell.evidence.rawRefs[0].sha256 = digest;
    assert.equal(recordEvidenceCell(target, cell).outcome, 'created');
    assert.equal(recordEvidenceCell(target, cell).outcome, 'unchanged');
    const divergent = structuredClone(cell);
    divergent.result.summary = 'divergent';
    assert.throws(
      () => recordEvidenceCell(target, divergent),
      (error) => error.code === 'evidence_cell_conflict'
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), cell);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('path validation keeps exact statuses and reports missing sources without a ready boolean', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-evidence-validate-'));
  try {
    const digest = writeRawReceipt(root);
    for (const status of ['passed', 'failed', 'blocked', 'unsupported', 'stale', 'not_executed']) {
      const cell = createStatusCell(status);
      if (cell.evidence.rawRefs.length > 0) cell.evidence.rawRefs[0].sha256 = digest;
      fs.writeFileSync(path.join(root, `${status}.json`), `${JSON.stringify(cell, null, 2)}\n`);
    }
    const report = validateEvidencePaths([root, path.join(root, 'missing')]);
    assert.deepEqual(report.cells.map((entry) => entry.status).sort(), [
      'blocked', 'failed', 'not_executed', 'passed', 'stale', 'unsupported'
    ]);
    assert.equal(report.sources.some((entry) => entry.status === 'missing'), true);
    assert.equal(hasForbiddenRollupKey(report), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('path validation detects a changed raw receipt by digest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-evidence-tamper-'));
  try {
    const digest = writeRawReceipt(root);
    const cellPath = path.join(root, 'cell.json');
    const cell = createReadinessCell();
    cell.evidence.rawRefs[0].sha256 = digest;
    fs.writeFileSync(cellPath, `${JSON.stringify(cell, null, 2)}\n`);
    fs.writeFileSync(path.join(root, 'raw', 'stdio-transcript.jsonl'), '{"tampered":true}\n');
    const report = validateEvidencePaths([root]);
    assert.equal(report.cells.length, 0);
    assert.equal(report.diagnostics.some((entry) => (
      entry.code === 'evidence_raw_invalid'
      && entry.errors.some((error) => error.code === 'raw_evidence_digest_mismatch')
    )), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI emits one machine-readable report and fails validation on a missing path', () => {
  const result = spawnSync(process.execPath, [runnerPath, '--validate', 'does-not-exist'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.sources[0].status, 'missing');
  assert.equal(hasForbiddenRollupKey(report), false);
  assert.equal(result.stderr, '');
});

function hasForbiddenRollupKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenRollupKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) => (
    ['ready', 'readiness', 'rollup', 'overallReady', 'overallStatus'].includes(key)
    || hasForbiddenRollupKey(entry)
  ));
}

function writeRawReceipt(root) {
  const content = '{"jsonrpc":"2.0","id":1,"result":{}}\n';
  const rawDir = path.join(root, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'stdio-transcript.jsonl'), content);
  return crypto.createHash('sha256').update(content).digest('hex');
}
