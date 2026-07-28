import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createEvidenceCellFromEntrypoint,
  evidenceCellDigest,
  redactEvidenceValue,
  validateEvidenceCell,
  validateEvidenceCells,
  validateEvidencePaths,
  validateReviewMatrix
} from '../../../scripts/run-agent-installer-evidence.js';

test('accepts an exact immutable passed evidence cell', () => {
  const validation = validateEvidenceCell(validCell());

  assert.equal(validation.ok, true);
});

test('rejects readiness inferred from generated evidence', () => {
  const cell = validCell({
    readiness: {
      ...validCell().readiness,
      source: 'generated'
    }
  });

  const validation = validateEvidenceCell(cell);

  assert.equal(hasCode(validation, 'readiness_inferred'), true);
});

test('rejects mutable latest evidence candidates', () => {
  const cell = validCell({
    candidate: {
      ...validCell().candidate,
      uri: 'npm:launchdeck@latest'
    }
  });

  const validation = validateEvidenceCell(cell);

  assert.equal(hasCode(validation, 'candidate_uri_mutable'), true);
});

test('accepts failed pending and skipped cells when they do not claim ready', () => {
  for (const status of ['failed', 'pending', 'skipped']) {
    const validation = validateEvidenceCell(nonpassingCell(status));

    assert.equal(validation.ok, true, `${status} cell should remain visible and valid`);
  }
});

test('rejects nonpassed cells that claim ready', () => {
  const cell = validCell({
    status: 'pending',
    readiness: {
      ...validCell().readiness,
      claim: 'ready'
    }
  });

  const validation = validateEvidenceCell(cell);

  assert.equal(hasCode(validation, 'readiness_failed_closed'), true);
});

test('counts only passed ready cells as readiness support', () => {
  const validation = validateEvidenceCells([
    validCell({ cellId: 'cell_passedready0000001' }),
    nonpassingCell('failed', { cellId: 'cell_failedtyped0000001' }),
    nonpassingCell('pending', { cellId: 'cell_pendingtyped000001' }),
    nonpassingCell('skipped', { cellId: 'cell_skippedtyped000001' })
  ]);

  assert.equal(validation.ok, true);
  assert.equal(validation.counts.total, 4);
  assert.equal(validation.counts.valid, 4);
  assert.equal(validation.counts.invalid, 0);
  assert.equal(validation.counts.passedReady, 1);
  assert.deepEqual(validation.counts.nonpassing, {
    failed: 1,
    pending: 1,
    skipped: 1
  });
});

test('rejects an empty aggregate evidence set', () => {
  const validation = validateEvidenceCells([]);

  assert.equal(validation.ok, false);
  assert.equal(hasCode(validation, 'evidence_cells_empty'), true);
});

test('rejects aggregate inputs containing only ignored JSON sources', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-evidence-'));
  try {
    fs.writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify({
      kind: 'not-an-evidence-cell'
    }));

    const validation = validateEvidencePaths([directory]);

    assert.equal(validation.ok, false);
    assert.equal(validation.cellCount, 0);
    assert.equal(hasCode(validation, 'evidence_sources_ignored_only'), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects an aggregate that misses its declared exact cell count', () => {
  const validation = validateEvidenceCells(
    [validCell()],
    { expectedCount: 2 }
  );

  assert.equal(validation.ok, false);
  assert.equal(hasCode(validation, 'evidence_expected_count_mismatch'), true);
});

test('rejects missing declared required dimension values', () => {
  const validation = validateEvidenceCells(
    [validCell()],
    {
      requiredDimensions: {
        'environment.os.platform': ['windows', 'linux'],
        component: ['package', 'flask']
      }
    }
  );

  assert.equal(validation.ok, false);
  assert.equal(hasCode(validation, 'evidence_required_dimension_missing'), true);
  assert.equal(
    validation.errors.some((error) => error.message.includes('environment.os.platform=linux')),
    true
  );
  assert.equal(
    validation.errors.some((error) => error.message.includes('component=flask')),
    true
  );
});

test('requires declared dimensions to be covered by passed ready cells', () => {
  const validation = validateEvidenceCells(
    [
      validCell(),
      nonpassingCell('failed', {
        cellId: 'cell_failedlinux0000001',
        environment: {
          ...validCell().environment,
          os: {
            ...validCell().environment.os,
            platform: 'linux'
          }
        }
      })
    ],
    {
      expectedCount: 2,
      requiredDimensions: {
        'environment.os.platform': ['windows', 'linux']
      }
    }
  );

  assert.equal(validation.ok, false);
  assert.equal(hasCode(validation, 'evidence_required_dimension_missing'), true);
});

test('accepts an exact frozen Review scenario and obligation matrix', () => {
  const fixture = reviewMatrixFixture();
  const validation = validateReviewMatrix({
    ...fixture,
    resolveEvidenceRef: (reference, context) => ({
      ok: true,
      sha256: fixture.evidenceSha256,
      document: {
        schemaVersion: 1,
        kind: 'agent-first-review-evidence',
        evidenceKind: reference.kind,
        reviewCycleId: fixture.expectedReviewCycleId,
        snapshotSha256: fixture.expectedSnapshotSha256,
        status: 'passed',
        scenarios: [{
          scenarioId: context.scenarioId,
          obligationIds: context.obligationIds
        }]
      }
    })
  });

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.summary, {
    requiredScenarioCount: 2,
    requiredObligationCount: 3,
    status: 'complete'
  });
});

test('rejects missing scenarios and incomplete frozen obligation coverage', () => {
  const fixture = reviewMatrixFixture();
  fixture.manifest.scenarios = fixture.manifest.scenarios.slice(0, 1);
  fixture.manifest.scenarios[0].obligationIds = ['RO-ONE'];
  const validation = validateReviewMatrix({
    ...fixture,
    resolveEvidenceRef: () => ({
      ok: true,
      sha256: fixture.evidenceSha256
    })
  });

  assert.equal(validation.ok, false);
  assert.equal(hasCode(validation, 'review_matrix_scenario_missing'), true);
  assert.equal(hasCode(validation, 'review_matrix_scenario_obligations_mismatch'), true);
  assert.equal(hasCode(validation, 'review_matrix_obligation_missing'), true);
});

test('rejects stale Review bindings and byte-mismatched matrix evidence', () => {
  const fixture = reviewMatrixFixture();
  fixture.manifest.reviewCycleId = digest('stale-cycle').slice(7);
  fixture.manifest.snapshotSha256 = digest('stale-snapshot').slice(7);
  const validation = validateReviewMatrix({
    ...fixture,
    resolveEvidenceRef: () => ({
      ok: true,
      sha256: digest('different-evidence').slice(7)
    })
  });

  assert.equal(validation.ok, false);
  assert.equal(hasCode(validation, 'review_matrix_cycle_mismatch'), true);
  assert.equal(hasCode(validation, 'review_matrix_snapshot_mismatch'), true);
  assert.equal(hasCode(validation, 'review_matrix_evidence_digest_mismatch'), true);
});

test('validates a byte-bound Review matrix through aggregate evidence paths', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-review-matrix-'));
  try {
    const fixture = reviewMatrixFixture();
    const evidenceDirectory = path.join(directory, 'review-evidence');
    const cellsDirectory = path.join(directory, 'cells');
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    fs.mkdirSync(cellsDirectory, { recursive: true });
    for (const scenario of fixture.manifest.scenarios) {
      scenario.evidence = scenario.evidence.map((reference) => {
        const proofPath = path.join(evidenceDirectory, `${reference.kind}.json`);
        const existing = fs.existsSync(proofPath)
          ? JSON.parse(fs.readFileSync(proofPath, 'utf8'))
          : {
              schemaVersion: 1,
              kind: 'agent-first-review-evidence',
              evidenceKind: reference.kind,
              reviewCycleId: fixture.expectedReviewCycleId,
              snapshotSha256: fixture.expectedSnapshotSha256,
              status: 'passed',
              scenarios: []
            };
        existing.scenarios.push({
          scenarioId: scenario.scenarioId,
          obligationIds: scenario.obligationIds
        });
        fs.writeFileSync(proofPath, JSON.stringify(existing));
        return {
          ...reference,
          path: `review-evidence/${reference.kind}.json`
        };
      });
    }
    for (const scenario of fixture.manifest.scenarios) {
      scenario.evidence = scenario.evidence.map((reference) => {
        const proofPath = path.join(directory, reference.path);
        return {
          ...reference,
          artifactSha256: crypto.createHash('sha256').update(fs.readFileSync(proofPath)).digest('hex')
        };
      });
    }
    const contractPath = path.join(directory, 'implementation-handoff.json');
    const matrixPath = path.join(directory, 'review-matrix.json');
    fs.writeFileSync(contractPath, JSON.stringify(fixture.contract));
    fs.writeFileSync(matrixPath, JSON.stringify(fixture.manifest));
    fs.writeFileSync(path.join(cellsDirectory, 'cell.json'), JSON.stringify(validCell()));

    const validation = validateEvidencePaths([cellsDirectory], {
      expectedCount: 1,
      reviewMatrix: {
        matrixPath,
        contractPath,
        expectedReviewCycleId: fixture.expectedReviewCycleId,
        expectedSnapshotSha256: fixture.expectedSnapshotSha256
      }
    });

    assert.equal(validation.ok, true);
    assert.deepEqual(validation.reviewMatrix, {
      requiredScenarioCount: 2,
      requiredObligationCount: 3,
      status: 'complete'
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects byte-bound evidence that does not claim the exact scenario contract', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-review-evidence-'));
  try {
    const fixture = reviewMatrixFixture();
    const evidenceDirectory = path.join(directory, 'review-evidence');
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    for (const kind of ['invocation', 'runtime_diagnostics', 'side_effect']) {
      const proofPath = path.join(evidenceDirectory, `${kind}.json`);
      fs.writeFileSync(proofPath, JSON.stringify({
        schemaVersion: 1,
        kind: 'agent-first-review-evidence',
        evidenceKind: kind,
        reviewCycleId: fixture.expectedReviewCycleId,
        snapshotSha256: fixture.expectedSnapshotSha256,
        status: 'passed',
        scenarios: [{
          scenarioId: 'SR-ONE',
          obligationIds: ['RO-ONE']
        }]
      }));
      const artifactSha256 = crypto.createHash('sha256').update(fs.readFileSync(proofPath)).digest('hex');
      for (const scenario of fixture.manifest.scenarios) {
        const reference = scenario.evidence.find((entry) => entry.kind === kind);
        reference.path = `review-evidence/${kind}.json`;
        reference.artifactSha256 = artifactSha256;
      }
    }
    const contractPath = path.join(directory, 'implementation-handoff.json');
    const matrixPath = path.join(directory, 'review-matrix.json');
    fs.writeFileSync(contractPath, JSON.stringify(fixture.contract));
    fs.writeFileSync(matrixPath, JSON.stringify(fixture.manifest));

    const validation = validateEvidencePaths([], {
      expectedCount: 0,
      reviewMatrix: {
        matrixPath,
        contractPath,
        expectedReviewCycleId: fixture.expectedReviewCycleId,
        expectedSnapshotSha256: fixture.expectedSnapshotSha256
      }
    });

    assert.equal(validation.ok, false);
    assert.equal(hasCode(validation, 'review_matrix_evidence_obligations_mismatch'), true);
    assert.equal(hasCode(validation, 'review_matrix_evidence_scenario_missing'), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects cross-build cross-host cross-version cross-scope dependency reuse', () => {
  const dependency = validCell({ cellId: 'cell_dependency0000000001' });
  const dependent = validCell({
    cellId: 'cell_dependent0000000001',
    dependencies: [{
      cellId: dependency.cellId,
      cellSha256: evidenceCellDigest(dependency),
      binds: {
        buildIdentity: digest('other-build'),
        hostId: 'claude-code',
        hostVersion: '1.5.0',
        osPlatform: 'linux',
        osVersion: '6.8.0',
        scopeKind: 'user',
        scopeIdentity: `user:${digest('user-scope')}`,
        component: 'mcp'
      }
    }]
  });

  const validation = validateEvidenceCells([dependency, dependent]);

  assert.equal(hasCode(validation, 'dependency_identity_mismatch'), true);
});

test('rejects dependent evidence when referenced cell bytes change', () => {
  const dependency = validCell({ cellId: 'cell_dependency0000000002' });
  const changedDependency = validCell({
    cellId: dependency.cellId,
    candidate: {
      ...dependency.candidate,
      byteLength: dependency.candidate.byteLength + 1
    }
  });
  const dependent = validCell({
    cellId: 'cell_dependent0000000002',
    dependencies: [{
      cellId: dependency.cellId,
      cellSha256: evidenceCellDigest(dependency),
      binds: bindsFor(dependency)
    }]
  });

  const validation = validateEvidenceCells([changedDependency, dependent]);

  assert.equal(hasCode(validation, 'dependency_cell_digest_mismatch'), true);
});

test('redacts secret-like values and live paths before validation', () => {
  const redacted = redactEvidenceValue({
    token: 'bearer abcdefghijklmnop',
    path: 'C:\\Users\\alice\\project'
  });

  assert.deepEqual(redacted, {
    token: '[REDACTED]',
    path: '<PATH>'
  });
});

test('rejects unredacted secret-like evidence values', () => {
  const cell = validCell({
    scenario: {
      ...validCell().scenario,
      revision: 'secret-token-value'
    }
  });

  const validation = validateEvidenceCell(cell);

  assert.equal(hasCode(validation, 'secret_not_redacted'), true);
});

test('package entrypoint consumer returns a typed failed cell when package contract is not passing', async () => {
  const result = await createEvidenceCellFromEntrypoint({
    entrypoint: 'package',
    evidence: { schemaVersion: 1, ok: false, kind: 'agent-installer-package-evidence' },
    ...cellMetadata()
  });

  assert.equal(result.cell.status, 'failed');
  assert.equal(result.cell.readiness.claim, 'not-ready');
  assert.equal(validateEvidenceCell(result.cell).ok, true);
});

test('package entrypoint consumer derives passed cell fields from observed producer provenance', async () => {
  const baseCell = validCell();
  const producerCell = validCell({
    identity: {
      ...baseCell.identity,
      packageDigest: baseCell.candidate.sha256
    }
  });
  const result = await createEvidenceCellFromEntrypoint({
    entrypoint: 'package',
    evidence: packageEvidenceForCell(producerCell),
    cellId: 'cell_packageproducer0001'
  });

  assert.equal(result.cell.status, 'passed');
  assert.deepEqual(result.cell.identity, producerCell.identity);
  assert.deepEqual(result.cell.candidate, result.contract.provenanceBinding.fields.candidate);
  assert.equal(result.contract.provenanceBinding.ok, true);
});

test('entrypoint consumer derives distinct default cell ids from producer-observed environments', async () => {
  const windowsCell = validCell();
  const linuxCell = validCell({
    environment: {
      os: {
        platform: 'linux',
        version: '6.6.87.2-microsoft-standard-WSL2',
        arch: 'x64'
      },
      node: {
        version: '20.20.2'
      }
    }
  });

  const windows = await createEvidenceCellFromEntrypoint({
    entrypoint: 'package',
    evidence: packageEvidenceForCell(windowsCell)
  });
  const linux = await createEvidenceCellFromEntrypoint({
    entrypoint: 'package',
    evidence: packageEvidenceForCell(linuxCell)
  });

  assert.notEqual(windows.cell.cellId, linux.cell.cellId);
  assert.equal(windows.cell.environment.os.platform, 'windows');
  assert.equal(linux.cell.environment.os.platform, 'linux');
});

test('package entrypoint consumer refuses forged passed metadata that differs from producer provenance', async () => {
  const producerCell = validCell();
  const result = await createEvidenceCellFromEntrypoint({
    entrypoint: 'package',
    evidence: packageEvidenceForCell(producerCell),
    cellId: 'cell_packageforged00001',
    ...cellMetadata(),
    identity: {
      ...producerCell.identity,
      buildIdentity: digest('forged-build')
    },
    candidate: {
      ...producerCell.candidate,
      sha256: digest('forged-candidate')
    }
  });

  assert.equal(result.cell.status, 'failed');
  assert.equal(result.cell.readiness.claim, 'not-ready');
  assert.equal(result.cell.identity.buildIdentity, producerCell.identity.buildIdentity);
  assert.equal(hasCode(result.contract.provenanceBinding, 'provenance_mismatch'), true);
});

test('package entrypoint consumer marks missing passed provenance not ready', async () => {
  const result = await createEvidenceCellFromEntrypoint({
    entrypoint: 'package',
    evidence: {
      ...packageEvidenceForCell(validCell()),
      provenance: undefined
    },
    ...cellMetadata()
  });

  assert.equal(result.cell.status, 'failed');
  assert.equal(result.cell.readiness.claim, 'not-ready');
  assert.equal(result.contract.checks.producerProvenanceComplete, false);
});

test('flask entrypoint consumer accepts the normalized producer envelope with its bound producer body', async () => {
  const producerCell = flaskCell();
  const producerBody = flaskEvidenceForCell(producerCell);
  const result = await createEvidenceCellFromEntrypoint({
    entrypoint: 'flask',
    evidence: {
      schemaVersion: 1,
      kind: 'agent-first-flask-evidence',
      ok: true,
      setup: { ok: true, outcome: 'succeeded' },
      installedAgent: producerBody.agentAuthored,
      lifecycle: {
        up: producerBody.up,
        status: producerBody.status,
        logs: producerBody.logs,
        down: producerBody.down
      },
      http: {
        statusCode: producerBody.page.statusCode,
        containsFlaskPage: true
      },
      provenance: producerBody.provenance,
      producerBody
    },
    cellId: 'cell_flaskproducer00001'
  });

  assert.equal(result.cell.status, 'passed');
  assert.equal(result.cell.readiness.claim, 'ready');
  assert.equal(result.contract.provenanceBinding.ok, true);
});

test('flask entrypoint consumer refuses forged passed metadata that differs from producer provenance', async () => {
  const producerCell = flaskCell();
  const result = await createEvidenceCellFromEntrypoint({
    entrypoint: 'flask',
    evidence: flaskEvidenceForCell(producerCell),
    cellId: 'cell_flaskforged000001',
    ...cellMetadata(),
    identity: {
      ...producerCell.identity,
      buildIdentity: digest('forged-flask-build')
    }
  });

  assert.equal(result.cell.status, 'failed');
  assert.equal(result.cell.readiness.claim, 'not-ready');
  assert.equal(result.cell.identity.buildIdentity, producerCell.identity.buildIdentity);
  assert.equal(hasCode(result.contract.provenanceBinding, 'provenance_mismatch'), true);
});

function validCell(overrides = {}) {
  const base = {
    schemaVersion: 1,
    kind: 'agent-first-evidence-cell',
    cellId: 'cell_valid0000000000001',
    status: 'passed',
    identity: {
      buildIdentity: digest('build'),
      sourceRevision: 'source-revision-1',
      packageDigest: digest('package'),
      payloadDigest: digest('payload')
    },
    environment: {
      os: {
        platform: 'windows',
        version: '10.0.26100',
        arch: 'x64'
      },
      node: {
        version: '24.14.0'
      }
    },
    host: {
      id: 'codex',
      version: '0.96.0',
      versionEvidenceDigest: digest('codex-version'),
      capabilityMatrixRevision: 'matrix-v1'
    },
    scope: {
      kind: 'project',
      identity: `project:${digest('project-scope')}`
    },
    component: 'package',
    scenario: {
      id: 'package-offline-launcher',
      kind: 'package',
      revision: 'scenario-v1'
    },
    command: {
      entrypoint: 'npx launchdeck agent setup',
      argv: ['launchdeck', 'agent', 'setup', '--json', '--yes'],
      cwd: '<PROJECT>'
    },
    result: {
      exitCode: 0,
      outcome: 'succeeded',
      effectCertainty: 'complete',
      stdoutSha256: digest('stdout'),
      stderrSha256: digest('stderr')
    },
    candidate: {
      kind: 'npm-tarball',
      uri: 'npm:launchdeck@sha256-immutable',
      sha256: digest('candidate'),
      byteLength: 1234,
      manifestDigest: digest('manifest'),
      immutable: true,
      mutable: false
    },
    readiness: {
      claim: 'ready',
      source: 'observed',
      inferred: false,
      checks: [{
        name: 'offline-launcher',
        status: 'passed',
        digest: digest('offline-launcher')
      }]
    },
    evidence: {
      rawRefs: [{
        path: 'raw/package-evidence.json',
        sha256: digest('raw'),
        byteLength: 321
      }]
    },
    dependencies: [],
    redaction: {
      secretsRedacted: true,
      livePathsRedacted: true,
      placeholders: ['<PROJECT>', '<LAUNCHDECK_HOME>']
    }
  };
  return mergeCell(base, overrides);
}

function reviewMatrixFixture() {
  const reviewCycleId = digest('review-cycle').slice(7);
  const snapshotSha256 = digest('review-snapshot').slice(7);
  const evidenceSha256 = digest('matrix-evidence').slice(7);
  const requiredEvidence = ['invocation', 'runtime_diagnostics', 'side_effect'];
  const evidence = requiredEvidence.map((kind) => ({
    kind,
    path: 'review-evidence/proof.json',
    artifactSha256: evidenceSha256
  }));
  return {
    expectedReviewCycleId: reviewCycleId,
    expectedSnapshotSha256: snapshotSha256,
    evidenceSha256,
    cells: [],
    contract: {
      implementation_fingerprint: snapshotSha256,
      system_review_scenarios: [
        {
          id: 'SR-ONE',
          required: true,
          required_evidence: requiredEvidence
        },
        {
          id: 'SR-TWO',
          required: true,
          required_evidence: requiredEvidence
        }
      ],
      review_obligations: [
        {
          id: 'RO-ONE',
          required: true,
          scenario_ids: ['SR-ONE']
        },
        {
          id: 'RO-BOTH',
          required: true,
          scenario_ids: ['SR-ONE', 'SR-TWO']
        },
        {
          id: 'RO-TWO',
          required: true,
          scenario_ids: ['SR-TWO']
        }
      ]
    },
    manifest: {
      schemaVersion: 1,
      kind: 'agent-first-review-matrix',
      reviewCycleId,
      snapshotSha256,
      scenarios: [
        {
          scenarioId: 'SR-ONE',
          obligationIds: ['RO-ONE', 'RO-BOTH'],
          evidence
        },
        {
          scenarioId: 'SR-TWO',
          obligationIds: ['RO-BOTH', 'RO-TWO'],
          evidence
        }
      ]
    }
  };
}

function nonpassingCell(status, overrides = {}) {
  const checkStatus = status === 'failed' ? 'failed' : status;
  return validCell({
    status,
    result: {
      ...validCell().result,
      exitCode: status === 'failed' ? 1 : 0,
      outcome: status
    },
    readiness: {
      claim: 'not-ready',
      source: 'observed',
      inferred: false,
      checks: [{
        name: `${status}-evidence`,
        status: checkStatus,
        digest: digest(`${status}-evidence`)
      }]
    },
    ...overrides
  });
}

function flaskCell(overrides = {}) {
  return validCell({
    component: 'flask',
    scenario: {
      id: 'agent-first-flask-lifecycle',
      kind: 'flask',
      revision: digest('flask-revision')
    },
    command: {
      entrypoint: 'launchdeck flask lifecycle',
      argv: ['launchdeck', 'up', 'status --all', 'logs start', 'down'],
      cwd: '<PROJECT>'
    },
    candidate: {
      kind: 'scenario',
      uri: `flask:${digest('flask-build')}`,
      sha256: digest('flask-candidate'),
      byteLength: 2345,
      manifestDigest: digest('flask-manifest'),
      immutable: true,
      mutable: false
    },
    ...overrides
  });
}

function cellMetadata() {
  const cell = validCell();
  return {
    cellId: 'cell_entrypoint00000001',
    identity: cell.identity,
    environment: cell.environment,
    host: cell.host,
    scope: cell.scope,
    component: cell.component,
    scenario: cell.scenario,
    command: cell.command,
    result: cell.result,
    candidate: cell.candidate,
    rawEvidence: cell.evidence,
    redaction: cell.redaction
  };
}

function packageEvidenceForCell(cell) {
  const evidence = {
    schemaVersion: 1,
    ok: true,
    kind: 'agent-installer-package-evidence',
    isolation: {
      projectTreeDigest: digest('project-tree'),
      liveUserStateTouched: false
    },
    package: {
      tarballSha256: cell.candidate.sha256,
      tarballByteLength: cell.candidate.byteLength,
      inventory: {
        ok: true
      }
    },
    payloadInventory: {
      expectedPayloadFilesPresent: true,
      digest: cell.identity.payloadDigest
    },
    npx: {
      dryRun: {
        result: {
          outcome: 'planned'
        }
      },
      jsonApprovalRefusal: {
        result: {
          outcome: 'refused'
        }
      },
      approved: {
        status: 0,
        stdoutSha256: cell.result.stdoutSha256,
        stderrSha256: cell.result.stderrSha256,
        result: {
          buildIdentity: cell.identity.buildIdentity,
          outcome: 'succeeded',
          effectCertainty: 'complete'
        }
      }
    },
    installed: {
      repeat: {
        result: {
          buildIdentity: cell.identity.buildIdentity,
          outcome: 'noop'
        }
      }
    },
    compatibility: {
      paths: {
        schemaVersion: 1
      },
      skillInstallDryRun: {
        result: {
          outcome: 'planned'
        }
      }
    },
    offlineAfterNpx: {
      cacheRemoved: true,
      launcher: {
        status: 0
      }
    },
    quoting: {
      projectPathIncludesSpace: true,
      shellUsed: false
    },
    producer: {
      environment: cell.environment,
      host: fixtureHost('package-adapter-fixture'),
      sourceRevision: cell.identity.sourceRevision,
      manifestDigest: cell.candidate.manifestDigest
    }
  };
  return {
    ...evidence,
    provenance: packageProvenanceForEvidence(evidence)
  };
}

function flaskEvidenceForCell(cell) {
  const evidence = {
    schemaVersion: 1,
    ok: true,
    kind: 'agent-first-flask-evidence',
    setup: {
      ok: true,
      result: {
        outcome: 'succeeded'
      }
    },
    agentAuthored: {
      installerLeftConfigAbsent: true,
      configAuthored: true,
      author: 'deterministic-installed-agent-fixture',
      interactiveHost: false,
      llmReasoning: false,
      parentBoundary: {
        parentAuthoredConfig: false,
        configAbsentBeforeChild: true,
        installedSkill: {
          valid: true
        }
      },
      installedSkill: {
        valid: true,
        contentSha256: digest('installed-skill'),
        files: []
      },
      buildIdentity: cell.identity.buildIdentity,
      configSha256: digest('flask-config'),
      validation: {
        schemaVersion: 1,
        ok: true,
        command: 'config validate',
        outcome: 'succeeded'
      },
      configInputs: {
        files: ['pyproject.toml', 'src/flask_demo/app.py', 'README.md'],
        projectName: 'flask-demo',
        moduleName: 'flask_demo',
        startCommand: 'python -m flask_demo',
        pyprojectSha256: digest('pyproject'),
        appSha256: digest('app'),
        readmeSha256: digest('readme')
      },
      mcpProof: {
        ok: true,
        buildIdentity: cell.identity.buildIdentity,
        tools: ['capabilities.get'],
        server: {
          path: 'src/mcp/stdio-server.js',
          sha256: cell.identity.packageDigest
        }
      }
    },
    up: {
      ok: true
    },
    status: {
      ok: true,
      command: 'status --all'
    },
    logs: {
      ok: true,
      task: 'start',
      logPath: '<PROJECT>/.launchdeck/logs/start.log',
      content: 'Serving Flask app on 127.0.0.1'
    },
    down: {
      ok: true
    },
    page: {
      statusCode: 200,
      body: 'Flask Notes API Notes workspace'
    },
    paths: {
      root: '<PROJECT>',
      homeDir: '<PROJECT>/launchdeck home',
      projectRoot: '<PROJECT>'
    },
    port: 5055,
    producer: {
      environment: cell.environment,
      host: fixtureHost('deterministic-installed-agent-fixture')
    }
  };
  return {
    ...evidence,
    provenance: flaskProvenanceForEvidence(evidence)
  };
}

function fixtureHost(version) {
  return {
    id: 'none',
    version,
    versionEvidenceDigest: digest(version),
    capabilityMatrixRevision: version
  };
}

function packageProvenanceForEvidence(evidence) {
  const producerJson = stableJson(omit(evidence, ['provenance', 'contract', 'ok']));
  return {
    schemaVersion: 1,
    kind: 'agent-first-evidence-provenance',
    entrypoint: 'package',
    observed: true,
    identity: {
      buildIdentity: evidence.npx.approved.result.buildIdentity,
      sourceRevision: evidence.producer.sourceRevision,
      packageDigest: evidence.package.tarballSha256,
      payloadDigest: evidence.payloadInventory.digest
    },
    environment: evidence.producer.environment,
    host: evidence.producer.host,
    scope: {
      kind: 'project',
      identity: `project:sha256:${sha256Hex(stableJson({
        projectFiles: evidence.isolation.projectTreeDigest,
        setupScope: 'project'
      }))}`
    },
    component: 'package',
    scenario: {
      id: 'package-offline-launcher',
      kind: 'package',
      revision: evidence.producer.manifestDigest
    },
    command: {
      entrypoint: 'npx launchdeck agent setup',
      argv: [
        'launchdeck',
        'agent',
        'setup',
        '--component',
        'runtime',
        '--scope',
        'project',
        '--project',
        '<PROJECT>',
        '--json',
        '--yes'
      ],
      cwd: '<PROJECT>'
    },
    result: {
      exitCode: evidence.npx.approved.status,
      outcome: evidence.npx.approved.result.outcome,
      effectCertainty: evidence.npx.approved.result.effectCertainty,
      stdoutSha256: evidence.npx.approved.stdoutSha256,
      stderrSha256: evidence.npx.approved.stderrSha256
    },
    candidate: {
      kind: 'npm-tarball',
      uri: `npm:launchdeck@${evidence.package.tarballSha256}`,
      sha256: evidence.package.tarballSha256,
      byteLength: evidence.package.tarballByteLength,
      manifestDigest: evidence.producer.manifestDigest,
      immutable: true,
      mutable: false
    },
    evidence: {
      rawRefs: [{
        path: 'producer/package-evidence.json',
        sha256: digest(producerJson),
        byteLength: Buffer.byteLength(producerJson)
      }]
    }
  };
}

function flaskProvenanceForEvidence(evidence) {
  const configInputs = evidence.agentAuthored.configInputs;
  const lifecycle = {
    up: summarizeEnvelope(evidence.up),
    status: summarizeEnvelope(evidence.status),
    logs: summarizeEnvelope(evidence.logs),
    down: summarizeEnvelope(evidence.down)
  };
  const candidateInput = {
    configSha256: evidence.agentAuthored.configSha256,
    configInputs,
    lifecycle,
    http: {
      statusCode: evidence.page.statusCode,
      bodySha256: digest(evidence.page.body)
    }
  };
  const manifestInput = {
    installedSkill: {
      contentSha256: evidence.agentAuthored.installedSkill.contentSha256,
      files: evidence.agentAuthored.installedSkill.files
    },
    mcpServer: evidence.agentAuthored.mcpProof.server,
    configInputs
  };
  const producerJson = stableJson(omit(evidence, ['provenance', 'contract', 'ok']));
  return {
    schemaVersion: 1,
    kind: 'agent-first-evidence-provenance',
    entrypoint: 'flask',
    observed: true,
    identity: {
      buildIdentity: evidence.agentAuthored.buildIdentity,
      sourceRevision: `flask:${configInputs.projectName}`,
      packageDigest: evidence.agentAuthored.mcpProof.server.sha256,
      payloadDigest: digest(stableJson(configInputs))
    },
    environment: evidence.producer.environment,
    host: evidence.producer.host,
    scope: {
      kind: 'project',
      identity: `project:sha256:${sha256Hex(stableJson({ configInputs, projectRoot: '<PROJECT>' }))}`
    },
    component: 'flask',
    scenario: {
      id: 'agent-first-flask-lifecycle',
      kind: 'flask',
      revision: digest(stableJson(manifestInput))
    },
    command: {
      entrypoint: 'launchdeck flask lifecycle',
      argv: ['launchdeck', 'up', 'status --all', 'logs start', 'down'],
      cwd: '<PROJECT>'
    },
    result: {
      exitCode: 0,
      outcome: 'succeeded',
      effectCertainty: 'complete',
      stdoutSha256: digest(stableJson(lifecycle)),
      stderrSha256: digest(stableJson(evidence.logs))
    },
    candidate: {
      kind: 'scenario',
      uri: `flask:${evidence.agentAuthored.buildIdentity}`,
      sha256: digest(stableJson(candidateInput)),
      byteLength: Buffer.byteLength(stableJson(candidateInput)),
      manifestDigest: digest(stableJson(manifestInput)),
      immutable: true,
      mutable: false
    },
    evidence: {
      rawRefs: [{
        path: 'producer/flask-evidence.json',
        sha256: digest(producerJson),
        byteLength: Buffer.byteLength(producerJson)
      }]
    }
  };
}

function summarizeEnvelope(envelope) {
  return {
    schemaVersion: envelope.schemaVersion,
    ok: envelope.ok,
    command: envelope.command,
    outcome: envelope.result?.outcome ?? envelope.status ?? null
  };
}

function bindsFor(cell) {
  return {
    buildIdentity: cell.identity.buildIdentity,
    hostId: cell.host.id,
    hostVersion: cell.host.version,
    osPlatform: cell.environment.os.platform,
    osVersion: cell.environment.os.version,
    scopeKind: cell.scope.kind,
    scopeIdentity: cell.scope.identity,
    component: cell.component
  };
}

function mergeCell(base, overrides) {
  const copy = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    copy[key] = value;
  }
  return copy;
}

function hasCode(validation, code) {
  return (validation.errors ?? validation.diagnostics ?? []).some((error) => error.code === code);
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function omit(value, fields) {
  const copy = { ...(value ?? {}) };
  for (const field of fields) delete copy[field];
  return copy;
}
