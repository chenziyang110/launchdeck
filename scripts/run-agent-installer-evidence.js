#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(repoRoot, 'agent', 'evidence', 'agent-first', 'schema.json');
const evidenceSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const allowedCellStatuses = new Set(['passed', 'failed', 'pending', 'skipped']);
const blockedReadinessStatuses = new Set(['failed', 'pending', 'skipped']);
const forbiddenReadinessFields = new Set(['ready', 'overallReady', 'rollupReady', 'readinessInferred']);
const reviewEvidenceKinds = new Set([
  'structure_snapshot',
  'visual_capture',
  'runtime_diagnostics',
  'invocation',
  'side_effect'
]);
const secretKeyPattern = /(?:token|secret|password|passwd|pwd|credential|api[_-]?key|access[_-]?key|private[_-]?key|authorization|bearer)/i;
const secretValuePattern = /(?:bearer\s+[a-z0-9._~+/=-]{8,}|[a-z0-9_-]*(?:token|secret|password|credential)[a-z0-9_-]*)/i;
const livePathPattern = /(?:[A-Za-z]:[\\/]|\/Users\/|\/home\/|\/tmp\/|\\Users\\|AppData[\\/]|LOCALAPPDATA|USERPROFILE|HOME=)/;
const mutableCandidatePattern = /(?:@latest\b|\/latest\b|\blatest\b|\bmain\b|\bmaster\b|\bHEAD\b|snapshot|nightly|current)/i;

if (isMain()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = options.consume
      ? await consumeEntrypointFile(options)
      : validateEvidencePaths(options.validatePaths, options.expectations);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      ok: false,
      kind: 'agent-first-evidence-validation',
      error: {
        code: error?.code ?? 'agent_first_evidence_runner_failed',
        message: error?.message ?? 'Agent-first evidence validation failed.'
      }
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

export function validateEvidenceCell(cell, options = {}) {
  const errors = [];
  validateSchemaValue(cell, evidenceSchema, '', evidenceSchema, errors);
  if (errors.length === 0) validateEvidenceSemantics(cell, errors, options);
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

export function validateEvidenceCells(cells, expectations = {}) {
  const errors = [];
  const passedReadyCells = [];
  const counts = {
    total: Array.isArray(cells) ? cells.length : 0,
    valid: 0,
    invalid: 0,
    passedReady: 0,
    nonpassing: {
      failed: 0,
      pending: 0,
      skipped: 0
    }
  };
  if (!Array.isArray(cells)) {
    return Object.freeze({
      ok: false,
      errors: [diagnostic('', 'evidence_cells_invalid', 'Evidence cells must be an array.')],
      counts: Object.freeze(counts)
    });
  }
  if (cells.length === 0) {
    errors.push(diagnostic(
      '/cells',
      'evidence_cells_empty',
      'Aggregate evidence must contain at least one evidence cell.'
    ));
  }
  const byCellId = new Map();
  for (const [index, cell] of cells.entries()) {
    const validation = validateEvidenceCell(cell);
    if (validation.ok) {
      counts.valid += 1;
      if (cell.status === 'passed' && cell.readiness?.claim === 'ready') {
        counts.passedReady += 1;
        passedReadyCells.push(cell);
      }
      if (Object.hasOwn(counts.nonpassing, cell.status)) counts.nonpassing[cell.status] += 1;
    } else {
      counts.invalid += 1;
    }
    for (const error of validation.errors) {
      errors.push({ ...error, path: `/cells/${index}${error.path}` });
    }
    if (cell?.cellId) {
      if (byCellId.has(cell.cellId)) {
        errors.push(diagnostic(`/cells/${index}/cellId`, 'evidence_cell_duplicate', 'Evidence cell ids must be unique.'));
      } else {
        byCellId.set(cell.cellId, cell);
      }
    }
  }
  for (const [index, cell] of cells.entries()) {
    validateDependencies(cell, byCellId, errors, `/cells/${index}`);
  }
  validateEvidenceExpectations(expectations, passedReadyCells, counts, errors);
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    counts: deepFreeze(counts)
  });
}

export function validateEvidencePaths(inputPaths = [], expectations = {}) {
  const paths = inputPaths.length > 0
    ? inputPaths.map((entry) => path.resolve(entry))
    : [path.join(repoRoot, 'agent', 'evidence', 'agent-first')];
  const cells = [];
  const sources = [];
  const diagnostics = [];
  for (const sourcePath of paths) {
    if (!fs.existsSync(sourcePath)) {
      diagnostics.push(diagnostic(sourcePath, 'evidence_source_missing', 'Evidence source is missing.'));
      continue;
    }
    const files = fs.statSync(sourcePath).isDirectory()
      ? listJsonFiles(sourcePath)
      : [sourcePath];
    for (const filePath of files) {
      if (path.resolve(filePath) === path.resolve(schemaPath)) continue;
      const source = { path: redactedPath(filePath), status: 'validated', cellCount: 0 };
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const fileCells = Array.isArray(parsed?.cells)
          ? parsed.cells
          : (parsed?.kind === 'agent-first-evidence-cell' ? [parsed] : []);
        if (fileCells.length === 0) {
          source.status = 'ignored';
        } else {
          for (const cell of fileCells) {
            cells.push(cell);
            source.cellCount += 1;
          }
        }
      } catch (error) {
        source.status = 'invalid';
        diagnostics.push(diagnostic(redactedPath(filePath), 'evidence_json_invalid', error.message));
      }
      sources.push(source);
    }
  }
  if (sources.length > 0 && sources.every((source) => source.status === 'ignored')) {
    diagnostics.push(diagnostic(
      '/sources',
      'evidence_sources_ignored_only',
      'Aggregate evidence sources contained JSON files, but none contained evidence cells.'
    ));
  }
  const validation = validateEvidenceCells(cells, expectations);
  diagnostics.push(...validation.errors);
  const reviewMatrix = expectations.reviewMatrix
    ? validateReviewMatrixFiles({
        ...expectations.reviewMatrix,
        cells
      })
    : null;
  if (reviewMatrix) diagnostics.push(...reviewMatrix.errors);
  return Object.freeze({
    schemaVersion: 1,
    ok: diagnostics.length === 0,
    kind: 'agent-first-evidence-validation',
    sourceCount: sources.length,
    cellCount: cells.length,
    counts: validation.counts,
    ...(reviewMatrix ? { reviewMatrix: reviewMatrix.summary } : {}),
    sources,
    diagnostics
  });
}

function validateEvidenceExpectations(expectations, passedReadyCells, counts, errors) {
  if (!expectations || typeof expectations !== 'object' || Array.isArray(expectations)) {
    errors.push(diagnostic(
      '/expectations',
      'evidence_expectations_invalid',
      'Evidence expectations must be an object.'
    ));
    return;
  }

  if (expectations.expectedCount !== undefined) {
    if (!Number.isInteger(expectations.expectedCount) || expectations.expectedCount < 1) {
      errors.push(diagnostic(
        '/expectations/expectedCount',
        'evidence_expected_count_invalid',
        'Expected evidence count must be a positive integer.'
      ));
    } else if (counts.passedReady !== expectations.expectedCount) {
      errors.push(diagnostic(
        '/expectations/expectedCount',
        'evidence_expected_count_mismatch',
        `Expected ${expectations.expectedCount} passed ready evidence cells, but found ${counts.passedReady}.`
      ));
    }
  }

  if (expectations.requiredDimensions === undefined) return;
  if (
    !expectations.requiredDimensions
    || typeof expectations.requiredDimensions !== 'object'
    || Array.isArray(expectations.requiredDimensions)
  ) {
    errors.push(diagnostic(
      '/expectations/requiredDimensions',
      'evidence_required_dimensions_invalid',
      'Required evidence dimensions must be an object keyed by dotted cell paths.'
    ));
    return;
  }

  for (const [dimensionPath, expectedValues] of Object.entries(expectations.requiredDimensions)) {
    if (
      typeof dimensionPath !== 'string'
      || dimensionPath.length === 0
      || !Array.isArray(expectedValues)
      || expectedValues.length === 0
    ) {
      errors.push(diagnostic(
        `/expectations/requiredDimensions/${escapeJsonPointer(dimensionPath)}`,
        'evidence_required_dimension_invalid',
        'Each required dimension must declare at least one expected value.'
      ));
      continue;
    }
    for (const expectedValue of expectedValues) {
      const covered = passedReadyCells.some((cell) => (
        deepEqual(valueAtDottedPath(cell, dimensionPath), expectedValue)
      ));
      if (!covered) {
        errors.push(diagnostic(
          `/expectations/requiredDimensions/${escapeJsonPointer(dimensionPath)}`,
          'evidence_required_dimension_missing',
          `No valid passed ready evidence cell covers ${dimensionPath}=${String(expectedValue)}.`
        ));
      }
    }
  }
}

export function validateReviewMatrix(input = {}) {
  const errors = [];
  const manifest = input.manifest;
  const contract = input.contract;
  const cells = Array.isArray(input.cells) ? input.cells : [];
  const passedReadyCellIds = new Set(cells
    .filter((cell) => cell?.status === 'passed' && cell?.readiness?.claim === 'ready')
    .map((cell) => cell.cellId));
  if (!isPlainObject(manifest)) {
    errors.push(diagnostic('/reviewMatrix', 'review_matrix_invalid', 'Review matrix manifest must be an object.'));
    return reviewMatrixResult(errors, 0, 0);
  }
  if (!isPlainObject(contract)) {
    errors.push(diagnostic('/reviewContract', 'review_matrix_contract_invalid', 'Review matrix contract must be an object.'));
    return reviewMatrixResult(errors, 0, 0);
  }
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'agent-first-review-matrix') {
    errors.push(diagnostic(
      '/reviewMatrix',
      'review_matrix_identity_invalid',
      'Review matrix manifest must declare schemaVersion 1 and kind agent-first-review-matrix.'
    ));
  }
  if (
    typeof input.expectedReviewCycleId !== 'string'
    || manifest.reviewCycleId !== input.expectedReviewCycleId
  ) {
    errors.push(diagnostic(
      '/reviewMatrix/reviewCycleId',
      'review_matrix_cycle_mismatch',
      'Review matrix manifest is not bound to the expected Review cycle.'
    ));
  }
  if (
    typeof input.expectedSnapshotSha256 !== 'string'
    || manifest.snapshotSha256 !== input.expectedSnapshotSha256
    || contract.implementation_fingerprint !== input.expectedSnapshotSha256
  ) {
    errors.push(diagnostic(
      '/reviewMatrix/snapshotSha256',
      'review_matrix_snapshot_mismatch',
      'Review matrix, contract, and expected implementation snapshot must match exactly.'
    ));
  }

  const requiredScenarios = asArray(contract.system_review_scenarios)
    .filter((scenario) => scenario?.required === true);
  const requiredObligations = asArray(contract.review_obligations)
    .filter((obligation) => obligation?.required === true);
  if (requiredScenarios.length === 0 || requiredObligations.length === 0) {
    errors.push(diagnostic(
      '/reviewContract',
      'review_matrix_denominator_empty',
      'Review contract must contain required system scenarios and obligations.'
    ));
  }
  const scenarioById = new Map(requiredScenarios.map((scenario) => [scenario.id, scenario]));
  const obligationById = new Map(requiredObligations.map((obligation) => [obligation.id, obligation]));
  if (scenarioById.size !== requiredScenarios.length || obligationById.size !== requiredObligations.length) {
    errors.push(diagnostic(
      '/reviewContract',
      'review_matrix_contract_duplicate',
      'Review contract scenario and obligation identities must be unique.'
    ));
  }

  const rows = asArray(manifest.scenarios);
  const rowById = new Map();
  for (const [index, row] of rows.entries()) {
    const pointer = `/reviewMatrix/scenarios/${index}`;
    if (!isPlainObject(row) || typeof row.scenarioId !== 'string') {
      errors.push(diagnostic(pointer, 'review_matrix_scenario_invalid', 'Each matrix row must name one scenarioId.'));
      continue;
    }
    if (rowById.has(row.scenarioId)) {
      errors.push(diagnostic(`${pointer}/scenarioId`, 'review_matrix_scenario_duplicate', `Duplicate scenario ${row.scenarioId}.`));
      continue;
    }
    rowById.set(row.scenarioId, row);
    const scenario = scenarioById.get(row.scenarioId);
    if (!scenario) {
      errors.push(diagnostic(`${pointer}/scenarioId`, 'review_matrix_scenario_extra', `Unexpected scenario ${row.scenarioId}.`));
      continue;
    }
    validateReviewMatrixObligations({
      row,
      pointer,
      scenarioId: row.scenarioId,
      requiredObligations,
      obligationById,
      errors
    });
    validateReviewMatrixEvidence({
      row,
      pointer,
      scenario,
      manifest,
      passedReadyCellIds,
      resolveEvidenceRef: input.resolveEvidenceRef,
      errors
    });
  }
  for (const scenarioId of scenarioById.keys()) {
    if (!rowById.has(scenarioId)) {
      errors.push(diagnostic(
        '/reviewMatrix/scenarios',
        'review_matrix_scenario_missing',
        `Required scenario ${scenarioId} is missing from the Review matrix.`
      ));
    }
  }

  const coveredObligationIds = new Set(rows.flatMap((row) => asArray(row?.obligationIds)));
  for (const obligationId of obligationById.keys()) {
    if (!coveredObligationIds.has(obligationId)) {
      errors.push(diagnostic(
        '/reviewMatrix/scenarios',
        'review_matrix_obligation_missing',
        `Required obligation ${obligationId} is missing from the Review matrix.`
      ));
    }
  }
  for (const obligationId of coveredObligationIds) {
    if (!obligationById.has(obligationId)) {
      errors.push(diagnostic(
        '/reviewMatrix/scenarios',
        'review_matrix_obligation_extra',
        `Unexpected obligation ${obligationId} is present in the Review matrix.`
      ));
    }
  }
  return reviewMatrixResult(errors, scenarioById.size, obligationById.size);
}

function validateReviewMatrixFiles(input) {
  const matrixPath = path.resolve(input.matrixPath);
  const contractPath = path.resolve(input.contractPath);
  const errors = [];
  let manifest;
  let contract;
  for (const [label, filePath] of [['review matrix', matrixPath], ['review contract', contractPath]]) {
    if (!fs.existsSync(filePath)) {
      errors.push(diagnostic(filePath, 'review_matrix_file_missing', `${label} file is missing.`));
      continue;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (label === 'review matrix') manifest = parsed;
      else contract = parsed;
    } catch (error) {
      errors.push(diagnostic(redactedPath(filePath), 'review_matrix_json_invalid', error.message));
    }
  }
  if (errors.length > 0) return reviewMatrixResult(errors, 0, 0);
  const evidenceRoot = path.dirname(contractPath);
  return validateReviewMatrix({
    manifest,
    contract,
    cells: input.cells,
    expectedReviewCycleId: input.expectedReviewCycleId,
    expectedSnapshotSha256: input.expectedSnapshotSha256,
    resolveEvidenceRef: (reference) => resolveMatrixEvidenceRef(evidenceRoot, reference)
  });
}

function validateReviewMatrixObligations({
  row,
  pointer,
  scenarioId,
  requiredObligations,
  obligationById,
  errors
}) {
  const actual = asArray(row.obligationIds);
  const expected = requiredObligations
    .filter((obligation) => asArray(obligation.scenario_ids).includes(scenarioId))
    .map((obligation) => obligation.id)
    .sort();
  const normalized = [...new Set(actual)].sort();
  if (normalized.length !== actual.length) {
    errors.push(diagnostic(
      `${pointer}/obligationIds`,
      'review_matrix_obligation_duplicate',
      `Scenario ${scenarioId} contains duplicate obligation ids.`
    ));
  }
  if (!deepEqual(normalized, expected)) {
    errors.push(diagnostic(
      `${pointer}/obligationIds`,
      'review_matrix_scenario_obligations_mismatch',
      `Scenario ${scenarioId} must cover its exact frozen obligation set.`
    ));
  }
  for (const obligationId of normalized) {
    if (!obligationById.has(obligationId)) {
      errors.push(diagnostic(
        `${pointer}/obligationIds`,
        'review_matrix_obligation_extra',
        `Unexpected obligation ${obligationId}.`
      ));
    }
  }
}

function validateReviewMatrixEvidence({
  row,
  pointer,
  scenario,
  manifest,
  passedReadyCellIds,
  resolveEvidenceRef,
  errors
}) {
  const evidence = asArray(row.evidence);
  const requiredKinds = new Set(asArray(scenario.required_evidence));
  const coveredKinds = new Set();
  for (const [index, reference] of evidence.entries()) {
    const evidencePointer = `${pointer}/evidence/${index}`;
    if (!isPlainObject(reference) || typeof reference.kind !== 'string' || typeof reference.path !== 'string') {
      errors.push(diagnostic(
        evidencePointer,
        'review_matrix_evidence_invalid',
        'Matrix evidence must include kind, path, and artifactSha256.'
      ));
      continue;
    }
    if (!reviewEvidenceKinds.has(reference.kind)) {
      errors.push(diagnostic(
        `${evidencePointer}/kind`,
        'review_matrix_evidence_kind_invalid',
        `Unknown Review evidence kind ${reference.kind}.`
      ));
      continue;
    }
    coveredKinds.add(reference.kind);
    if (!/^[0-9a-f]{64}$/.test(String(reference.artifactSha256 ?? ''))) {
      errors.push(diagnostic(
        `${evidencePointer}/artifactSha256`,
        'review_matrix_evidence_digest_invalid',
        'Matrix evidence artifactSha256 must be a lowercase SHA-256 hex digest.'
      ));
    }
    if (reference.cellId !== undefined && !passedReadyCellIds.has(reference.cellId)) {
      errors.push(diagnostic(
        `${evidencePointer}/cellId`,
        'review_matrix_cell_not_ready',
        `Evidence cell ${String(reference.cellId)} is not a valid passed ready cell.`
      ));
    }
    if (typeof resolveEvidenceRef === 'function') {
      const resolved = resolveEvidenceRef(reference, {
        scenarioId: scenario.id,
        obligationIds: asArray(row.obligationIds),
        reviewCycleId: manifest.reviewCycleId,
        snapshotSha256: manifest.snapshotSha256
      });
      if (!resolved.ok) {
        errors.push(diagnostic(`${evidencePointer}/path`, resolved.code, resolved.message));
      } else if (resolved.sha256 !== reference.artifactSha256) {
        errors.push(diagnostic(
          `${evidencePointer}/artifactSha256`,
          'review_matrix_evidence_digest_mismatch',
          `Evidence digest does not match ${reference.path}.`
        ));
      } else {
        validateResolvedReviewEvidence({
          document: resolved.document,
          reference,
          scenario,
          obligationIds: asArray(row.obligationIds),
          manifest,
          pointer: evidencePointer,
          errors
        });
      }
    }
  }
  for (const kind of requiredKinds) {
    if (!coveredKinds.has(kind)) {
      errors.push(diagnostic(
        `${pointer}/evidence`,
        'review_matrix_evidence_kind_missing',
        `Scenario ${scenario.id} is missing required ${kind} evidence.`
      ));
    }
  }
}

function validateResolvedReviewEvidence({
  document,
  reference,
  scenario,
  obligationIds,
  manifest,
  pointer,
  errors
}) {
  if (
    !isPlainObject(document)
    || document.schemaVersion !== 1
    || document.kind !== 'agent-first-review-evidence'
  ) {
    errors.push(diagnostic(
      `${pointer}/path`,
      'review_matrix_evidence_document_invalid',
      'Review evidence must be a schemaVersion 1 agent-first-review-evidence document.'
    ));
    return;
  }
  if (document.evidenceKind !== reference.kind) {
    errors.push(diagnostic(
      `${pointer}/kind`,
      'review_matrix_evidence_kind_mismatch',
      `Evidence document kind does not match ${reference.kind}.`
    ));
  }
  if (
    document.reviewCycleId !== manifest.reviewCycleId
    || document.snapshotSha256 !== manifest.snapshotSha256
  ) {
    errors.push(diagnostic(
      `${pointer}/path`,
      'review_matrix_evidence_binding_mismatch',
      'Evidence document is not bound to the matrix Review cycle and source snapshot.'
    ));
  }
  if (document.status !== 'passed') {
    errors.push(diagnostic(
      `${pointer}/path`,
      'review_matrix_evidence_not_passing',
      'Only passed Review evidence may cover a required scenario.'
    ));
  }
  const claim = asArray(document.scenarios).find(
    (entry) => entry?.scenarioId === scenario.id
  );
  if (!claim) {
    errors.push(diagnostic(
      `${pointer}/path`,
      'review_matrix_evidence_scenario_missing',
      `Evidence document does not claim scenario ${scenario.id}.`
    ));
    return;
  }
  const claimedObligations = [...new Set(asArray(claim.obligationIds))].sort();
  const expectedObligations = [...new Set(obligationIds)].sort();
  if (!deepEqual(claimedObligations, expectedObligations)) {
    errors.push(diagnostic(
      `${pointer}/path`,
      'review_matrix_evidence_obligations_mismatch',
      `Evidence document must bind the exact obligation set for scenario ${scenario.id}.`
    ));
  }
}

function resolveMatrixEvidenceRef(root, reference) {
  const candidate = path.resolve(root, reference.path);
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return {
      ok: false,
      code: 'review_matrix_evidence_path_escape',
      message: 'Review matrix evidence must stay inside the feature directory.'
    };
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    return {
      ok: false,
      code: 'review_matrix_evidence_missing',
      message: `Review matrix evidence is missing: ${reference.path}.`
    };
  }
  const bytes = fs.readFileSync(candidate);
  let document;
  try {
    document = JSON.parse(bytes.toString('utf8'));
  } catch {
    return {
      ok: false,
      code: 'review_matrix_evidence_json_invalid',
      message: `Review matrix evidence is not valid JSON: ${reference.path}.`
    };
  }
  return {
    ok: true,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    document
  };
}

function reviewMatrixResult(errors, requiredScenarioCount, requiredObligationCount) {
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    summary: deepFreeze({
      requiredScenarioCount,
      requiredObligationCount,
      status: errors.length === 0 ? 'complete' : 'incomplete'
    })
  });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function valueAtDottedPath(value, dottedPath) {
  return dottedPath.split('.').reduce((current, segment) => {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment)) return undefined;
    return current[segment];
  }, value);
}

function escapeJsonPointer(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

export async function createEvidenceCellFromEntrypoint(input = {}) {
  const consumer = await entrypointConsumer(input.entrypoint);
  const entrypointEvidence = input.evidence ?? {};
  const evaluatedContract = consumer.evaluate(entrypointEvidence);
  const initialStatus = entrypointEvidence.ok === true && evaluatedContract.ok === true ? 'passed' : 'failed';
  const binding = bindEntrypointProvenance({
    evidence: entrypointEvidence,
    input,
    status: initialStatus
  });
  const status = binding.ok ? initialStatus : 'failed';
  const contract = {
    ...evaluatedContract,
    provenanceBinding: binding
  };
  const base = {
    schemaVersion: 1,
    kind: 'agent-first-evidence-cell',
    cellId: input.cellId ?? cellIdFor({
      ...input,
      ...binding.fields
    }),
    status,
    identity: binding.fields.identity,
    environment: binding.fields.environment,
    host: binding.fields.host,
    scope: binding.fields.scope,
    component: binding.fields.component,
    scenario: binding.fields.scenario,
    command: binding.fields.command,
    result: resultFromContract(binding.fields.result, status, contract),
    candidate: binding.fields.candidate,
    readiness: status === 'passed'
      ? (binding.fields.readiness ?? readinessFromContract(contract))
      : readinessFromContract(contract, 'not-ready'),
    evidence: binding.fields.evidence,
    dependencies: input.dependencies ?? [],
    redaction: input.redaction ?? {
      secretsRedacted: true,
      livePathsRedacted: true,
      placeholders: ['<PROJECT>', '<LAUNCHDECK_HOME>']
    }
  };
  const cell = redactEvidenceValue(base);
  const validation = validateEvidenceCell(cell);
  if (!validation.ok) {
    const error = new Error(`Entrypoint evidence cell is invalid: ${validation.errors.map((entry) => entry.code).join(', ')}`);
    error.code = 'agent_first_evidence_cell_invalid';
    error.validation = validation;
    throw error;
  }
  return Object.freeze({
    cell: Object.freeze(cell),
    contract: Object.freeze(contract)
  });
}

function bindEntrypointProvenance({ evidence, input, status }) {
  const provenance = evidence?.provenance;
  const requiredFields = [
    'identity',
    'environment',
    'host',
    'scope',
    'component',
    'scenario',
    'command',
    'result',
    'candidate',
    'evidence'
  ];
  const fallbackFields = fieldsFromInput(input);
  if (status !== 'passed') {
    return deepFreeze({
      ok: true,
      source: provenance ? 'producer-provenance' : 'caller-metadata-for-nonpassing-cell',
      diagnostics: [],
      fields: fieldsFromProvenance(provenance, fallbackFields)
    });
  }
  const diagnostics = [];
  if (!provenance || typeof provenance !== 'object') {
    diagnostics.push(diagnostic('/provenance', 'provenance_missing', 'Passing entrypoint evidence must carry producer-observed provenance.'));
    return deepFreeze({
      ok: false,
      source: 'missing-producer-provenance',
      diagnostics,
      fields: fallbackFields
    });
  }
  if (provenance.observed !== true) {
    diagnostics.push(diagnostic('/provenance/observed', 'provenance_not_observed', 'Producer provenance must be observed, not inferred.'));
  }
  const canonicalFields = fieldsFromProvenance(provenance, fallbackFields);
  for (const field of requiredFields) {
    if (!hasUsableValue(provenance[field])) {
      diagnostics.push(diagnostic(`/provenance/${field}`, 'provenance_required_field_missing', `Producer provenance is missing ${field}.`));
    }
    const inputField = field === 'evidence' ? input.rawEvidence : input[field];
    if (inputField !== undefined && hasUsableValue(provenance[field]) && !deepEqual(inputField, provenance[field])) {
      diagnostics.push(diagnostic(`/${field}`, 'provenance_mismatch', `Caller ${field} does not match producer-observed provenance.`));
    }
  }
  return deepFreeze({
    ok: diagnostics.length === 0,
    source: 'producer-provenance',
    diagnostics,
    fields: canonicalFields
  });
}

function fieldsFromInput(input) {
  return {
    identity: input.identity,
    environment: input.environment,
    host: input.host,
    scope: input.scope,
    component: input.component,
    scenario: input.scenario,
    command: input.command,
    result: input.result,
    candidate: input.candidate,
    readiness: input.readiness,
    evidence: input.rawEvidence ?? { rawRefs: [] }
  };
}

function fieldsFromProvenance(provenance, fallback) {
  if (!provenance || typeof provenance !== 'object') return fallback;
  return {
    identity: provenance.identity ?? fallback.identity,
    environment: provenance.environment ?? fallback.environment,
    host: provenance.host ?? fallback.host,
    scope: provenance.scope ?? fallback.scope,
    component: provenance.component ?? fallback.component,
    scenario: provenance.scenario ?? fallback.scenario,
    command: provenance.command ?? fallback.command,
    result: provenance.result ?? fallback.result,
    candidate: provenance.candidate ?? fallback.candidate,
    readiness: provenance.readiness ?? fallback.readiness,
    evidence: provenance.evidence ?? fallback.evidence
  };
}

function hasUsableValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function redactEvidenceValue(value) {
  if (Array.isArray(value)) return value.map((entry) => redactEvidenceValue(entry));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') return redactString(value);
    return value;
  }
  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (secretKeyPattern.test(key) && key !== 'secretsRedacted') {
      next[key] = '[REDACTED]';
    } else {
      next[key] = redactEvidenceValue(child);
    }
  }
  return next;
}

export function evidenceCellDigest(cell) {
  return sha256Json(cell);
}

function validateEvidenceSemantics(cell, errors) {
  rejectForbiddenReadinessFields(cell, errors);
  rejectUnredactedSecretsAndPaths(cell, errors);

  if (cell.readiness.claim === 'ready') {
    if (cell.status !== 'passed') {
      errors.push(diagnostic('/readiness/claim', 'readiness_failed_closed', 'Ready claims require a passed cell status.'));
    }
    if (cell.readiness.source !== 'observed' || cell.readiness.inferred !== false) {
      errors.push(diagnostic('/readiness/source', 'readiness_inferred', 'Ready claims must come from observed evidence, not inference or generation.'));
    }
    for (const [index, check] of cell.readiness.checks.entries()) {
      if (blockedReadinessStatuses.has(check.status)) {
        errors.push(diagnostic(`/readiness/checks/${index}/status`, 'readiness_check_not_passing', 'Failed, pending, and skipped checks cannot aggregate as ready.'));
      }
    }
  } else if (cell.status === 'passed') {
    errors.push(diagnostic('/readiness/claim', 'passed_cell_not_ready', 'Passed evidence cells must carry an observed ready claim to support readiness aggregation.'));
  }
  if (cell.candidate.immutable !== true || cell.candidate.mutable !== false) {
    errors.push(diagnostic('/candidate', 'candidate_mutable', 'Evidence candidates must be immutable.'));
  }
  if (mutableCandidatePattern.test(cell.candidate.uri)) {
    errors.push(diagnostic('/candidate/uri', 'candidate_uri_mutable', 'Evidence candidates cannot reference latest/current/head mutable locations.'));
  }
  if (cell.scope.kind !== cell.scope.identity.split(':')[0]) {
    errors.push(diagnostic('/scope/identity', 'scope_identity_mismatch', 'Scope identity must match the selected scope kind.'));
  }
  if (!allowedCellStatuses.has(cell.status)) {
    errors.push(diagnostic('/status', 'evidence_status_invalid', 'Evidence status is invalid.'));
  }
}

function validateDependencies(cell, byCellId, errors, basePath) {
  if (!cell || typeof cell !== 'object') return;
  for (const [index, dependency] of (cell.dependencies ?? []).entries()) {
    const dependencyPath = `${basePath}/dependencies/${index}`;
    const referenced = byCellId.get(dependency.cellId);
    if (!referenced) {
      errors.push(diagnostic(`${dependencyPath}/cellId`, 'dependency_cell_missing', 'Dependent evidence cell is missing.'));
      continue;
    }
    const expectedDigest = evidenceCellDigest(referenced);
    if (dependency.cellSha256 !== expectedDigest) {
      errors.push(diagnostic(`${dependencyPath}/cellSha256`, 'dependency_cell_digest_mismatch', 'Dependent evidence digest changed and invalidates this cell.'));
    }
    const binds = dependency.binds;
    const mismatches = [
      ['buildIdentity', cell.identity.buildIdentity],
      ['hostId', cell.host.id],
      ['hostVersion', cell.host.version],
      ['osPlatform', cell.environment.os.platform],
      ['osVersion', cell.environment.os.version],
      ['scopeKind', cell.scope.kind],
      ['scopeIdentity', cell.scope.identity],
      ['component', cell.component]
    ].filter(([field, value]) => binds[field] !== value);
    if (mismatches.length > 0) {
      errors.push(diagnostic(dependencyPath, 'dependency_identity_mismatch', `Dependency crosses immutable cell dimensions: ${mismatches.map(([field]) => field).join(', ')}.`));
    }
  }
}

function validateSchemaValue(value, schema, pointer, root, errors) {
  if (schema.$ref) {
    return validateSchemaValue(value, resolveRef(root, schema.$ref), pointer, root, errors);
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(diagnostic(pointer, 'schema_const_mismatch', `Expected constant ${JSON.stringify(schema.const)}.`));
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(diagnostic(pointer, 'schema_enum_mismatch', 'Value is not one of the allowed enum values.'));
    return;
  }
  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(diagnostic(pointer, 'schema_type_mismatch', `Expected ${schema.type}.`));
    return;
  }
  if (schema.type === 'string') {
    if (schema.minLength && value.length < schema.minLength) {
      errors.push(diagnostic(pointer, 'schema_string_too_short', 'String is shorter than the required length.'));
    }
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) {
      errors.push(diagnostic(pointer, 'schema_pattern_mismatch', 'String does not match the required pattern.'));
    }
  }
  if (schema.type === 'integer' && typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push(diagnostic(pointer, 'schema_number_too_small', 'Number is below the required minimum.'));
  }
  if (schema.type === 'array') {
    if (schema.minItems && value.length < schema.minItems) {
      errors.push(diagnostic(pointer, 'schema_array_too_short', 'Array has too few items.'));
    }
    for (const [index, item] of value.entries()) {
      validateSchemaValue(item, schema.items ?? {}, `${pointer}/${index}`, root, errors);
    }
  }
  if (schema.type === 'object') {
    const required = schema.required ?? [];
    for (const field of required) {
      if (!Object.hasOwn(value, field)) {
        errors.push(diagnostic(`${pointer}/${field}`, 'schema_required_missing', 'Required field is missing.'));
      }
    }
    const allowed = new Set(Object.keys(schema.properties ?? {}));
    if (schema.additionalProperties === false) {
      for (const field of Object.keys(value)) {
        if (!allowed.has(field)) {
          errors.push(diagnostic(`${pointer}/${field}`, 'schema_additional_property', 'Additional properties are not allowed.'));
        }
      }
    }
    for (const [field, childSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, field)) {
        validateSchemaValue(value[field], childSchema, `${pointer}/${field}`, root, errors);
      }
    }
  }
}

function rejectForbiddenReadinessFields(value, errors, pointer = '') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectForbiddenReadinessFields(entry, errors, `${pointer}/${index}`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${key}`;
    if (forbiddenReadinessFields.has(key)) {
      errors.push(diagnostic(childPointer, 'readiness_field_forbidden', 'Readiness cannot be inferred from rollup fields.'));
    }
    rejectForbiddenReadinessFields(child, errors, childPointer);
  }
}

function rejectUnredactedSecretsAndPaths(value, errors, pointer = '') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectUnredactedSecretsAndPaths(entry, errors, `${pointer}/${index}`));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      if (secretValuePattern.test(value) && value !== '[REDACTED]') {
        errors.push(diagnostic(pointer, 'secret_not_redacted', 'Evidence contains an unredacted secret-like value.'));
      }
      if (livePathPattern.test(value)) {
        errors.push(diagnostic(pointer, 'live_path_not_redacted', 'Evidence contains an unredacted live path.'));
      }
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${key}`;
    if (secretKeyPattern.test(key) && key !== 'secretsRedacted' && child !== '[REDACTED]') {
      errors.push(diagnostic(childPointer, 'secret_not_redacted', 'Secret-like evidence fields must be redacted.'));
    }
    rejectUnredactedSecretsAndPaths(child, errors, childPointer);
  }
}

async function consumeEntrypointFile(options) {
  const evidence = JSON.parse(fs.readFileSync(options.input, 'utf8'));
  const metadata = options.metadata
    ? JSON.parse(fs.readFileSync(options.metadata, 'utf8'))
    : {};
  const result = await createEvidenceCellFromEntrypoint({
    ...metadata,
    entrypoint: options.consume,
    evidence
  });
  return {
    schemaVersion: 1,
    ok: true,
    kind: 'agent-first-evidence-consume',
    entrypoint: options.consume,
    cell: result.cell,
    contract: result.contract
  };
}

async function entrypointConsumer(entrypoint) {
  if (entrypoint === 'package') {
    const { evaluatePackageEvidenceContract } = await safeImport('./run-agent-installer-package-evidence.js');
    return { evaluate: evaluatePackageEvidenceContract };
  }
  if (entrypoint === 'flask') {
    const { evaluateAgentFirstFlaskEvidence } = await safeImport('./run-agent-first-flask-evidence.js');
    return { evaluate: evaluateAgentFirstFlaskEvidence };
  }
  const error = new Error(`Unsupported entrypoint evidence consumer: ${entrypoint}`);
  error.code = 'agent_first_evidence_consumer_unknown';
  throw error;
}

async function safeImport(specifier) {
  const originalArgv1 = process.argv[1];
  if (!originalArgv1) process.argv[1] = fileURLToPath(import.meta.url);
  try {
    return await import(specifier);
  } finally {
    if (!originalArgv1) delete process.argv[1];
  }
}

function readinessFromContract(contract, claim = null) {
  const checks = Object.entries(contract?.checks ?? { contract: contract?.ok === true })
    .map(([name, passed]) => ({
      name,
      status: passed === true ? 'passed' : 'failed',
      digest: sha256Json({ name, passed })
    }));
  return {
    claim: claim ?? (contract?.ok === true ? 'ready' : 'not-ready'),
    source: 'observed',
    inferred: false,
    checks: checks.length > 0 ? checks : [{
      name: 'contract',
      status: 'failed',
      digest: sha256Json(contract ?? {})
    }]
  };
}

function resultFromContract(result, status, contract) {
  if (status === 'passed') return result;
  return {
    ...(result ?? {}),
    exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : 1,
    outcome: 'failed',
    effectCertainty: result?.effectCertainty ?? 'none',
    stdoutSha256: result?.stdoutSha256 ?? sha256Json(contract ?? {}),
    stderrSha256: result?.stderrSha256 ?? sha256Json(contract?.failures ?? [])
  };
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function deepEqual(left, right) {
  return stableJson(left) === stableJson(right);
}

function parseArgs(argv) {
  const options = {
    validatePaths: [],
    consume: null,
    input: null,
    metadata: null,
    expectations: {
      requiredDimensions: {}
    },
    reviewMatrixPath: null,
    reviewContractPath: null,
    reviewCycleId: null,
    snapshotSha256: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--validate') {
      options.validatePaths.push(argv[++index]);
    } else if (arg === '--expect-count') {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1) {
        throw Object.assign(new Error('--expect-count requires a positive integer.'), {
          code: 'agent_first_evidence_args_invalid'
        });
      }
      options.expectations.expectedCount = value;
    } else if (arg === '--require-dimension') {
      const declaration = argv[++index] ?? '';
      const separator = declaration.indexOf('=');
      if (separator < 1 || separator === declaration.length - 1) {
        throw Object.assign(new Error('--require-dimension requires <dotted-path>=<value>.'), {
          code: 'agent_first_evidence_args_invalid'
        });
      }
      const dimensionPath = declaration.slice(0, separator);
      const expectedValue = declaration.slice(separator + 1);
      options.expectations.requiredDimensions[dimensionPath] ??= [];
      options.expectations.requiredDimensions[dimensionPath].push(expectedValue);
    } else if (arg === '--review-matrix') {
      options.reviewMatrixPath = argv[++index];
    } else if (arg === '--review-contract') {
      options.reviewContractPath = argv[++index];
    } else if (arg === '--review-cycle-id') {
      options.reviewCycleId = argv[++index];
    } else if (arg === '--snapshot') {
      options.snapshotSha256 = argv[++index];
    } else if (arg === '--consume') {
      options.consume = argv[++index];
    } else if (arg === '--input') {
      options.input = argv[++index];
    } else if (arg === '--metadata') {
      options.metadata = argv[++index];
    } else if (arg === '--json') {
      // The runner always emits JSON; accept the flag for CLI consistency.
    } else {
      throw Object.assign(new Error(`Unknown argument: ${arg}`), {
        code: 'agent_first_evidence_args_invalid'
      });
    }
  }
  if (options.consume && !options.input) {
    throw Object.assign(new Error('--consume requires --input.'), {
      code: 'agent_first_evidence_args_invalid'
    });
  }
  const reviewMatrixValues = [
    options.reviewMatrixPath,
    options.reviewContractPath,
    options.reviewCycleId,
    options.snapshotSha256
  ];
  if (reviewMatrixValues.some(Boolean) && reviewMatrixValues.some((value) => !value)) {
    throw Object.assign(new Error(
      '--review-matrix requires --review-contract, --review-cycle-id, and --snapshot.'
    ), {
      code: 'agent_first_evidence_args_invalid'
    });
  }
  if (options.reviewMatrixPath) {
    options.expectations.reviewMatrix = {
      matrixPath: options.reviewMatrixPath,
      contractPath: options.reviewContractPath,
      expectedReviewCycleId: options.reviewCycleId,
      expectedSnapshotSha256: options.snapshotSha256
    };
  }
  return options;
}

function listJsonFiles(root) {
  const files = [];
  walk(root, files);
  return files.filter((filePath) => filePath.endsWith('.json')).sort();
}

function walk(current, files) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile()) files.push(absolute);
  }
}

function matchesType(value, type) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported schema ref: ${ref}`);
  return ref.slice(2).split('/').reduce((current, part) => current?.[part], root);
}

function redactString(value) {
  if (secretValuePattern.test(value)) return '[REDACTED]';
  if (livePathPattern.test(value)) return redactedPath(value);
  return value;
}

function redactedPath(value) {
  const text = String(value ?? '');
  if (!text) return '<PATH>';
  const normalized = text.replaceAll('\\', '/');
  if (normalized.includes('/agent/evidence/')) {
    return `<REPO>/${normalized.split('/agent/evidence/').pop()}`;
  }
  if (normalized.includes('/launchdeck/')) {
    return `<REPO>/${normalized.split('/launchdeck/').pop()}`;
  }
  return '<PATH>';
}

function sha256Json(value) {
  return sha256Text(stableJson(value));
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function cellIdFor(input) {
  return `cell_${sha256Json({
    entrypoint: input.entrypoint,
    identity: input.identity,
    environment: input.environment,
    host: input.host,
    scope: input.scope,
    component: input.component,
    scenario: input.scenario,
    candidate: input.candidate
  }).slice('sha256:'.length, 'sha256:'.length + 32)}`;
}

function diagnostic(pathValue, code, message) {
  return Object.freeze({
    path: pathValue || '',
    code,
    message
  });
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
