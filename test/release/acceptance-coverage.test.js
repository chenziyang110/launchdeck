import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '../..');
const FINAL_TASKS = Object.freeze(['T029', 'T030']);

const acceptanceReviews = Object.freeze([
  review('AC-001', 'RS-AC-001', 'test/repository-contract.test.js',
    'gallery source inventory is exactly the approved ten-project denominator'),
  review('AC-002', 'RS-AC-002', 'test/packaging/gallery-package.test.js',
    'repository and packed gallery trees contain no forbidden dependency, build, runtime, or evaluation files'),
  review('AC-003', 'RS-AC-003', 'test/gallery-launchdeck-matrix.test.js',
    'external Launchdeck matrix is the exact catalog-derived 10 x 2 denominator'),
  review('AC-004', 'RS-AC-004', 'test/cli-example-contract.test.js',
    'example list JSON is a single schemaVersion 1 catalog-derived object'),
  review('AC-005', 'RS-AC-005', 'test/examples/copy-filesystem.test.js',
    'copy publishes a complete sample tree and leaves no staging residue'),
  review('AC-006', 'RS-AC-006', 'test/packaging/gallery-package.test.js',
    'real npm pack contains the exact catalog and catalog-derived source inventory'),
  review('AC-007', 'RS-AC-007', 'test/docs-gallery.test.js',
    'README documents the catalog-derived gallery and both example commands'),
  review('AC-008', 'RS-AC-008', 'test/gallery-native-matrix.test.js',
    'native matrix is catalog-derived with exactly 20 Windows/Linux cells'),
  review('AC-009', 'RS-AC-009', 'test/gallery-launchdeck-matrix.test.js',
    'real consumer refuses an OS/sample mismatch instead of reporting a skipped cell'),
  review('AC-010', 'RS-AC-010', 'test/cli-example-contract.test.js',
    'example list compact JSON remains one object and keeps the catalog denominator'),
  review('AC-011', 'RS-AC-011', 'test/examples/copy-filesystem.test.js',
    'copy cleans owned staging after atomic publish failure'),
  review('AC-012', 'RS-AC-012', 'test/release/gallery-denominator.test.js',
    'CI consumes the exact denominator with a fail-closed Docker prerequisite')
]);

const humanScenarios = Object.freeze([
  human('HA-001', 'RS-AC-001', 'test/cli-example-contract.test.js',
    'example list JSON is a single schemaVersion 1 catalog-derived object'),
  human('HA-002', 'RS-AC-002', 'test/quickstart-gallery.test.js',
    'quickstart materializes the real FastAPI list/copy consumer evidence'),
  human('HA-003', 'RS-AC-003', 'test/quickstart-gallery.test.js',
    'quickstart links the external Launchdeck lifecycle contract without a false runtime claim'),
  human('HA-004', 'RS-AC-004', 'test/cli-example-outcomes.test.js',
    'example copy exposes a stable typed unknown-ID outcome'),
  human('HA-005', 'RS-AC-005', 'test/examples/copy-filesystem.test.js',
    'copy rejects every existing destination before mutation'),
  human('HA-006', 'RS-AC-007', 'test/docs-gallery.test.js',
    'README states that gallery copies are source-only and outside evaluation scoring'),
  human('HA-007', 'RS-AC-010', 'test/cli-example-contract.test.js',
    'example list compact JSON remains one object and keeps the catalog denominator'),
  human('HA-008', 'RS-AC-011', 'test/examples/copy-filesystem.test.js',
    'copy cleans owned staging after copy failure')
]);

const capabilities = Object.freeze([
  obligation('CAP-001', 'author-gallery-catalog', ['T012', 'T013'],
    'test/repository-contract.test.js',
    'gallery source inventory is exactly the approved ten-project denominator'),
  obligation('CAP-002', 'deliver-standalone-samples', ['T013', 'T022'],
    'test/gallery-fastapi-native.test.js',
    'FastAPI native lifecycle contract is catalog-derived and externally isolated'),
  obligation('CAP-003', 'verify-launchdeck-compatibility', ['T023', 'T025', 'T028'],
    'test/gallery-fastapi-launchdeck.test.js',
    'FastAPI Launchdeck fixture keeps config and runtime home external to packaged source'),
  obligation('CAP-004', 'list-examples', ['T014', 'T018', 'T019'],
    'test/cli-example-contract.test.js',
    'example list JSON is a single schemaVersion 1 catalog-derived object'),
  obligation('CAP-005', 'copy-example-safely', ['T015', 'T016', 'T018', 'T019'],
    'test/examples/copy-filesystem.test.js',
    'copy publishes a complete sample tree and leaves no staging residue'),
  obligation('CAP-006', 'publish-and-gate-gallery', ['T020', 'T021', 'T027', 'T028'],
    'test/packaging/gallery-package.test.js',
    'real npm pack stays within the packed and unpacked size contract')
]);

const mustPreserve = Object.freeze([
  obligation('MP-001', 'exact-ten-approved-projects', ['T013'],
    'test/repository-contract.test.js',
    'gallery source inventory is exactly the approved ten-project denominator'),
  obligation('MP-002', 'standalone-native-behavior', ['T013', 'T022'],
    'test/gallery-fastapi-native.test.js',
    'FastAPI native lifecycle contract is catalog-derived and externally isolated'),
  obligation('MP-003', 'source-purity-and-determinism', ['T013', 'T024'],
    'test/release/gallery-denominator.test.js',
    'matrix evidence keeps source-purity and residue assertions in the release gate'),
  obligation('MP-004', 'human-and-json-list-contract', ['T014', 'T018'],
    'test/cli-example-contract.test.js',
    'example list JSON is a single schemaVersion 1 catalog-derived object'),
  obligation('MP-005', 'stable-cli-outcomes', ['T017', 'T019'],
    'test/cli-example-outcomes.test.js',
    'example copy exposes a stable typed unknown-ID outcome'),
  obligation('MP-006', 'atomic-copy-and-cleanup', ['T015', 'T018'],
    'test/examples/copy-filesystem.test.js',
    'copy cleans owned staging after atomic publish failure'),
  obligation('MP-007', 'real-package-inventory', ['T020', 'T021', 'T027'],
    'test/packaging/gallery-package.test.js',
    'real npm pack contains the exact catalog and catalog-derived source inventory'),
  obligation('MP-008', 'package-size-bounds', ['T020', 'T021'],
    'test/packaging/gallery-package.test.js',
    'real npm pack stays within the packed and unpacked size contract'),
  obligation('MP-009', 'catalog-derived-documentation', ['T027'],
    'test/docs-gallery.test.js',
    'README documents the catalog-derived gallery and both example commands'),
  obligation('MP-010', 'external-launchdeck-only', ['T022', 'T023', 'T028'],
    'test/gallery-fastapi-launchdeck.test.js',
    'FastAPI Launchdeck fixture keeps config and runtime home external to packaged source')
]);

const consequences = Object.freeze([
  obligation('CA-001', 'package-weight-and-release-effects', ['T020', 'T021', 'T027'],
    'test/packaging/gallery-package.test.js',
    'real npm pack stays within the packed and unpacked size contract'),
  obligation('CA-002', 'lifecycle-process-port-and-cleanup', ['T022', 'T023', 'T028'],
    'test/release/gallery-denominator.test.js',
    'matrix evidence keeps source-purity and residue assertions in the release gate'),
  obligation('CA-003', 'copy-destination-and-rollback-effects', ['T015', 'T016', 'T019'],
    'test/examples/copy-filesystem.test.js',
    'copy cleans owned staging after copy failure'),
  obligation('CA-004', 'catalog-source-and-consumer-drift', ['T013', 'T019', 'T027'],
    'test/packaging/gallery-package.test.js',
    'repository sources, successful copies, and tarball sources have matching digests')
]);

test('twelve acceptance criteria each have one dedicated system review scenario', () => {
  assert.equal(acceptanceReviews.length, 12);
  assertUnique(acceptanceReviews.map((entry) => entry.acceptanceId), 'acceptance IDs');
  assertUnique(acceptanceReviews.map((entry) => entry.reviewScenarioId), 'review scenario IDs');
  assert.deepEqual(
    acceptanceReviews.map((entry) => entry.acceptanceId),
    sequence('AC', 12)
  );
  assert.deepEqual(
    acceptanceReviews.map((entry) => entry.reviewScenarioId),
    sequence('RS-AC', 12)
  );

  for (const entry of acceptanceReviews) {
    assert.deepEqual(entry.finalTaskIds, FINAL_TASKS);
    assertEvidence(entry.evidence);
  }
});

test('human acceptance universe is non-empty and contains all eight required linked journeys', () => {
  assert.ok(humanScenarios.length > 0);
  assert.equal(humanScenarios.length, 8);
  assertUnique(humanScenarios.map((entry) => entry.id), 'human scenario IDs');
  assert.deepEqual(humanScenarios.map((entry) => entry.id), sequence('HA', 8));

  const reviewIds = new Set(acceptanceReviews.map((entry) => entry.reviewScenarioId));
  for (const scenario of humanScenarios) {
    assert.equal(reviewIds.has(scenario.reviewScenarioId), true);
    assert.deepEqual(scenario.finalTaskIds, FINAL_TASKS);
    assertEvidence(scenario.evidence);
  }
});

test('six capability operations have concrete producer tasks and test evidence', () => {
  assertObligationUniverse(capabilities, sequence('CAP', 6));
  assertUnique(capabilities.map((entry) => entry.operation), 'capability operations');
});

test('ten must-preserve and four consequence obligations are explicitly covered', () => {
  assertObligationUniverse(mustPreserve, sequence('MP', 10));
  assertObligationUniverse(consequences, sequence('CA', 4));
});

test('T029 and T030 own every final review and human obligation without a catch-all', (t) => {
  const finalReviewLinks = acceptanceReviews.flatMap((entry) => entry.finalTaskIds.map(
    (taskId) => `${taskId}:${entry.reviewScenarioId}`
  ));
  const finalHumanLinks = humanScenarios.flatMap((entry) => entry.finalTaskIds.map(
    (taskId) => `${taskId}:${entry.id}`
  ));

  assert.equal(finalReviewLinks.length, 24);
  assert.equal(finalHumanLinks.length, 16);
  assertUnique(finalReviewLinks, 'final review links');
  assertUnique(finalHumanLinks, 'final human links');

  for (const taskId of FINAL_TASKS) {
    assert.equal(finalReviewLinks.filter((link) => link.startsWith(`${taskId}:`)).length, 12);
    assert.equal(finalHumanLinks.filter((link) => link.startsWith(`${taskId}:`)).length, 8);
  }

  t.diagnostic(`T029 coverage counts ${JSON.stringify({
    acceptance: acceptanceReviews.length,
    human: humanScenarios.length,
    capabilities: capabilities.length,
    mustPreserve: mustPreserve.length,
    consequences: consequences.length,
    finalReviewLinks: finalReviewLinks.length,
    finalHumanLinks: finalHumanLinks.length
  })}`);
});

function review(acceptanceId, reviewScenarioId, file, scenario) {
  return Object.freeze({
    acceptanceId,
    reviewScenarioId,
    finalTaskIds: FINAL_TASKS,
    evidence: Object.freeze([evidence(file, scenario)])
  });
}

function human(id, reviewScenarioId, file, scenario) {
  return Object.freeze({
    id,
    reviewScenarioId,
    finalTaskIds: FINAL_TASKS,
    evidence: Object.freeze([evidence(file, scenario)])
  });
}

function obligation(id, operation, producerTaskIds, file, scenario) {
  return Object.freeze({
    id,
    operation,
    producerTaskIds: Object.freeze([...producerTaskIds]),
    finalTaskIds: FINAL_TASKS,
    evidence: Object.freeze([evidence(file, scenario)])
  });
}

function evidence(file, scenario) {
  return Object.freeze({ file, scenario });
}

function assertObligationUniverse(universe, expectedIds) {
  assert.equal(universe.length, expectedIds.length);
  assert.deepEqual(universe.map((entry) => entry.id), expectedIds);
  assertUnique(universe.map((entry) => entry.id), `${expectedIds[0].split('-')[0]} IDs`);

  for (const entry of universe) {
    assert.ok(entry.operation.length > 0);
    assert.ok(entry.producerTaskIds.length > 0, `${entry.id} needs a concrete producer task`);
    assert.equal(entry.producerTaskIds.some((taskId) => !FINAL_TASKS.includes(taskId)), true);
    assertUnique(entry.producerTaskIds, `${entry.id} producer task IDs`);
    assert.deepEqual(entry.finalTaskIds, FINAL_TASKS);
    assertEvidence(entry.evidence);
  }
}

function assertEvidence(entries) {
  assert.ok(entries.length > 0, 'evidence cannot be empty');
  for (const entry of entries) {
    assert.ok(entry.file.startsWith('test/'));
    assert.ok(entry.scenario.length > 0);
    const absolutePath = path.resolve(repositoryRoot, entry.file);
    const relative = path.relative(repositoryRoot, absolutePath);
    assert.equal(relative.startsWith('..') || path.isAbsolute(relative), false);
    assert.equal(fs.existsSync(absolutePath), true, `${entry.file} must exist`);
    const content = fs.readFileSync(absolutePath, 'utf8');
    assert.ok(content.length > 0, `${entry.file} must not be empty`);
    assert.equal(
      content.includes(`test('${entry.scenario}'`),
      true,
      `${entry.file} must contain scenario '${entry.scenario}'`
    );
  }
}

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

function sequence(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(3, '0')}`);
}
