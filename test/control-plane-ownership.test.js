import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTrustedSpawnOwnership,
  buildPortObservation,
  OWNERSHIP_CONFIDENCE,
  proveRunOwnership
} from '../src/control-plane/ownership.js';

test('matching listener pid with only liveness evidence is not verified owned', () => {
  const proof = proveRunOwnership(activeRun(), {
    listeners: [{ port: 4321, protocol: 'tcp', pid: 1234, source: 'test' }],
    processEvidence: { alive: true, source: 'liveness' },
    checkedAt: '2026-07-08T00:00:00.000Z'
  });

  assert.equal(proof.pidMatchesRun, true);
  assert.equal(proof.processAlive, true);
  assert.equal(proof.confidence, OWNERSHIP_CONFIDENCE.UNKNOWN);
  assert.notEqual(proof.confidence, OWNERSHIP_CONFIDENCE.VERIFIED_OWNED);
  assert.ok(proof.reasons.includes('run_record_matches_listener_pid'));
  assert.ok(proof.reasons.includes('trusted_process_evidence_unavailable_or_incomplete'));
});

test('matching listener pid with unavailable process evidence is not verified owned', () => {
  const proof = proveRunOwnership(activeRun(), {
    listeners: [{ port: 4321, protocol: 'tcp', pid: 1234, source: 'test' }],
    processEvidence: { alive: true, source: 'liveness', unavailable: true, error: 'ETIMEDOUT' },
    checkedAt: '2026-07-08T00:00:00.000Z'
  });

  assert.equal(proof.pidMatchesRun, true);
  assert.equal(proof.processAlive, true);
  assert.equal(proof.confidence, OWNERSHIP_CONFIDENCE.UNKNOWN);
  assert.notEqual(proof.confidence, OWNERSHIP_CONFIDENCE.VERIFIED_OWNED);
  assert.ok(proof.reasons.includes('trusted_process_evidence_unavailable_or_incomplete'));
});

test('matching listener pid plus trusted process evidence verifies ownership', () => {
  const run = activeRun();
  const proof = proveRunOwnership(run, {
    listeners: [{ port: 4321, protocol: 'tcp', pid: 1234, source: 'test' }],
    processEvidence: {
      alive: true,
      source: 'test',
      env: {
        LAUNCHDECK_RUN_ID: run.runId
      }
    },
    checkedAt: '2026-07-08T00:00:00.000Z'
  });

  assert.equal(proof.confidence, OWNERSHIP_CONFIDENCE.VERIFIED_OWNED);
  assert.equal(proof.envMarkerMatches, true);
});

test('matching live evidence can use the exact persisted Launchdeck spawn proof', () => {
  const run = activeRun();
  run.ownershipProof = trustedSpawnProof(run);
  const observed = proveRunOwnership(run, {
    listeners: [{ port: 4321, protocol: 'tcp', pid: 1234, source: 'test' }],
    processEvidence: { alive: true, source: 'liveness' },
    checkedAt: '2026-07-08T00:01:00.000Z'
  });

  const proof = applyTrustedSpawnOwnership(run, observed);

  assert.equal(observed.confidence, OWNERSHIP_CONFIDENCE.UNKNOWN);
  assert.equal(proof.confidence, OWNERSHIP_CONFIDENCE.VERIFIED_OWNED);
  assert.equal(proof.trustedOwnershipProof, run.ownershipProof);
  assert.ok(proof.reasons.includes('launchdeck_spawn_ownership_proof'));
});

test('mismatched persisted spawn proof never upgrades unknown live ownership', () => {
  const run = activeRun();
  run.ownershipProof = {
    ...trustedSpawnProof(run),
    pid: 9999
  };
  const observed = proveRunOwnership(run, {
    listeners: [{ port: 4321, protocol: 'tcp', pid: 1234, source: 'test' }],
    processEvidence: { alive: true, source: 'liveness' },
    checkedAt: '2026-07-08T00:01:00.000Z'
  });

  const proof = applyTrustedSpawnOwnership(run, observed);

  assert.equal(proof.confidence, OWNERSHIP_CONFIDENCE.UNKNOWN);
  assert.equal(proof.trustedOwnershipProof, undefined);
});

test('unknown declared ownership stays unknown in port observation conflicts', () => {
  const observation = buildPortObservation({
    port: 4321,
    listeners: [{ port: 4321, protocol: 'tcp', pid: undefined, source: 'bind_probe' }],
    declaredOwners: [{
      ownership: 'unknown',
      project: { projectId: 'project-1', name: 'Example' },
      task: 'dev',
      run: activeRun()
    }],
    checkedAt: '2026-07-08T00:00:00.000Z'
  });

  assert.equal(observation.ownerType, 'unknown');
  assert.equal(observation.conflicts.length, 1);
  assert.equal(observation.conflicts[0].type, 'unknown');
  assert.equal(observation.conflicts[0].severity, 'warning');
  assert.match(observation.conflicts[0].message, /incomplete listener evidence/i);
});

function activeRun() {
  return {
    runId: 'run_test_123',
    transactionId: 'tx_test_123',
    projectId: 'project-1',
    projectRoot: process.cwd(),
    task: 'dev',
    command: 'node scripts/dev.js',
    cwd: process.cwd(),
    pid: 1234,
    status: 'running',
    declaredPorts: [4321],
    startedAt: '2026-07-08T00:00:00.000Z'
  };
}

function trustedSpawnProof(run) {
  return {
    confidence: OWNERSHIP_CONFIDENCE.VERIFIED_OWNED,
    source: 'launchdeck-spawn',
    runId: run.runId,
    transactionId: run.transactionId,
    projectId: run.projectId,
    projectRoot: run.projectRoot,
    task: run.task,
    pid: run.pid,
    command: run.command,
    cwd: run.cwd,
    startedAt: run.startedAt,
    checkedAt: run.startedAt,
    createdAt: run.startedAt,
    reasons: ['launchdeck_spawned_process']
  };
}
