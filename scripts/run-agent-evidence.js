#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const schemaPath = path.join(repoRoot, 'agent', 'evidence', 'schema.json');
const evidenceSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const notExecutedStatuses = new Set(['not_executed', 'not_executed_host_owned']);
const forbiddenRollupFields = new Set(['ready', 'readiness', 'rollup', 'overallReady', 'overallStatus']);

export function validateEvidenceCell(cell) {
  const errors = [];
  validateSchemaValue(cell, evidenceSchema, '', evidenceSchema, errors);
  if (errors.length === 0) validateEvidenceSemantics(cell, errors);
  return { ok: errors.length === 0, errors };
}

export function recordEvidenceCell(targetPath, cell) {
  const validation = validateEvidenceCell(cell);
  if (!validation.ok) {
    const error = new Error(`Evidence cell is invalid: ${JSON.stringify(validation.errors)}`);
    error.code = 'evidence_cell_invalid';
    error.details = validation.errors;
    throw error;
  }
  const absolutePath = path.resolve(targetPath);
  const rawEvidenceErrors = validateRawEvidence(absolutePath, cell);
  if (rawEvidenceErrors.length > 0) {
    const error = new Error(`Raw evidence is invalid: ${JSON.stringify(rawEvidenceErrors)}`);
    error.code = 'evidence_raw_invalid';
    error.details = rawEvidenceErrors;
    throw error;
  }
  const content = `${JSON.stringify(cell, null, 2)}\n`;
  if (fs.existsSync(absolutePath)) {
    const existing = fs.readFileSync(absolutePath, 'utf8');
    if (canonicalJson(JSON.parse(existing)) === canonicalJson(cell)) {
      return { outcome: 'unchanged', path: absolutePath, cellId: cell.cellId, status: cell.status };
    }
    const error = new Error(`Evidence cell '${cell.cellId}' conflicts with ${absolutePath}.`);
    error.code = 'evidence_cell_conflict';
    throw error;
  }
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryPath, absolutePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
  return { outcome: 'created', path: absolutePath, cellId: cell.cellId, status: cell.status };
}

export function validateEvidencePaths(inputPaths) {
  const report = {
    schemaVersion: 1,
    mode: 'validate',
    sources: [],
    cells: [],
    diagnostics: []
  };
  for (const inputPath of inputPaths) {
    const absolutePath = path.resolve(inputPath);
    if (!fs.existsSync(absolutePath)) {
      report.sources.push({ path: absolutePath, status: 'missing', cellCount: 0 });
      report.diagnostics.push({ code: 'evidence_source_missing', path: absolutePath });
      continue;
    }
    const source = { path: absolutePath, status: 'validated', cellCount: 0 };
    report.sources.push(source);
    const files = collectEvidenceFiles(absolutePath, report.diagnostics);
    for (const filePath of files) {
      let cell;
      try {
        cell = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (error) {
        source.status = 'invalid';
        report.diagnostics.push({
          code: 'evidence_json_invalid',
          path: filePath,
          message: error.message
        });
        continue;
      }
      const validation = validateEvidenceCell(cell);
      if (!validation.ok) {
        source.status = 'invalid';
        report.diagnostics.push({
          code: 'evidence_cell_invalid',
          path: filePath,
          errors: validation.errors
        });
        continue;
      }
      const rawEvidenceErrors = validateRawEvidence(filePath, cell);
      if (rawEvidenceErrors.length > 0) {
        source.status = 'invalid';
        report.diagnostics.push({
          code: 'evidence_raw_invalid',
          path: filePath,
          errors: rawEvidenceErrors
        });
        continue;
      }
      source.cellCount += 1;
      report.cells.push({
        cellId: cell.cellId,
        status: cell.status,
        buildIdentity: cell.buildIdentity,
        surface: cell.surface,
        host: cell.host,
        platform: cell.platform,
        scenario: cell.scenario,
        evidenceFile: filePath
      });
    }
  }
  report.cells.sort((left, right) => compareText(left.cellId, right.cellId));
  return report;
}

function validateRawEvidence(cellPath, cell) {
  const errors = [];
  const cellDirectory = path.dirname(cellPath);
  for (const [index, reference] of cell.evidence.rawRefs.entries()) {
    const absolutePath = path.resolve(cellDirectory, reference.path);
    if (!isWithin(cellDirectory, absolutePath)) {
      errors.push({ path: `/evidence/rawRefs/${index}/path`, code: 'evidence_path_unbounded', message: 'Raw evidence path escapes the cell directory.' });
      continue;
    }
    if (!fs.existsSync(absolutePath)) {
      errors.push({ path: `/evidence/rawRefs/${index}/path`, code: 'raw_evidence_missing', message: `Raw evidence '${reference.path}' is missing.` });
      continue;
    }
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      errors.push({ path: `/evidence/rawRefs/${index}/path`, code: 'raw_evidence_not_regular_file', message: 'Raw evidence must be a regular non-symlink file.' });
      continue;
    }
    const observedDigest = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
    if (observedDigest !== reference.sha256) {
      errors.push({ path: `/evidence/rawRefs/${index}/sha256`, code: 'raw_evidence_digest_mismatch', message: `Raw evidence digest mismatch for '${reference.path}'.` });
    }
  }
  return errors;
}

function validateEvidenceSemantics(cell, errors) {
  rejectForbiddenRollups(cell, '', errors);
  const expectedInvalidationKeys = {
    buildIdentity: cell.buildIdentity,
    evidenceSchemaVersion: cell.schemaVersion,
    hostVersions: cell.host.versions,
    os: cell.platform.os,
    osVersion: cell.platform.version,
    osBuild: cell.platform.build,
    architecture: cell.platform.architecture,
    nodeVersion: cell.runtime.nodeVersion,
    fixtureDigest: cell.fixture.digest,
    harnessDigest: cell.fixture.harnessDigest
  };
  for (const [key, expected] of Object.entries(expectedInvalidationKeys)) {
    if (canonicalJson(cell.invalidation.keys[key]) !== canonicalJson(expected)) {
      errors.push({
        path: `/invalidation/keys/${key}`,
        code: 'invalidation_key_mismatch',
        message: `Expected the exact ${key} evidence dimension.`
      });
    }
  }

  validateHostDimensions(cell.host, errors);
  const isNotExecuted = notExecutedStatuses.has(cell.status);
  if (['passed', 'failed', 'stale'].includes(cell.status)
    && [cell.platform.version, cell.platform.architecture, cell.runtime.nodeExecutable, cell.runtime.nodeVersion].some((value) => value === null)) {
    errors.push({ path: '/platform', code: 'exact_environment_required', message: `${cell.status} evidence requires exact platform, architecture, and Node dimensions.` });
  }
  if (isNotExecuted) {
    if (cell.execution.startedAt !== null || cell.execution.completedAt !== null
      || cell.execution.actions.length > 0 || cell.execution.commands.length > 0
      || cell.evidence.rawRefs.length > 0) {
      errors.push({ path: '/execution', code: 'not_executed_has_evidence', message: 'A not-executed cell cannot contain execution receipts.' });
    }
  } else {
    if (!cell.execution.startedAt || !cell.execution.completedAt || cell.execution.actions.length === 0) {
      errors.push({ path: '/execution', code: 'executed_receipt_incomplete', message: 'An executed cell requires timestamps and actions.' });
    }
    if (cell.evidence.rawRefs.length === 0) {
      errors.push({ path: '/evidence/rawRefs', code: 'raw_evidence_required', message: 'An executed cell requires immutable raw evidence.' });
    }
  }

  if (cell.status === 'stale') {
    if (cell.invalidation.state !== 'invalidated' || !cell.invalidation.invalidatedAt || cell.invalidation.reasons.length === 0) {
      errors.push({ path: '/invalidation', code: 'stale_invalidation_required', message: 'A stale cell requires exact invalidation evidence.' });
    }
  } else if (cell.invalidation.state !== 'current' || cell.invalidation.invalidatedAt !== null) {
    errors.push({ path: '/invalidation', code: 'status_invalidation_mismatch', message: 'Only a stale cell may be marked invalidated.' });
  }

  const rawRefIds = new Set();
  for (const [index, reference] of cell.evidence.rawRefs.entries()) {
    if (rawRefIds.has(reference.id)) {
      errors.push({ path: `/evidence/rawRefs/${index}/id`, code: 'duplicate_evidence_ref', message: 'Raw evidence IDs must be unique.' });
    }
    rawRefIds.add(reference.id);
    if (path.isAbsolute(reference.path) || reference.path.split(/[\\/]+/).includes('..')) {
      errors.push({ path: `/evidence/rawRefs/${index}/path`, code: 'evidence_path_unbounded', message: 'Raw evidence paths must be bounded relative paths.' });
    }
  }
  for (const [assertionIndex, assertion] of cell.result.assertions.entries()) {
    for (const evidenceRef of assertion.evidenceRefs) {
      if (!rawRefIds.has(evidenceRef)) {
        errors.push({
          path: `/result/assertions/${assertionIndex}/evidenceRefs`,
          code: 'evidence_ref_missing',
          message: `Assertion references missing raw evidence '${evidenceRef}'.`
        });
      }
    }
  }
}

function validateHostDimensions(host, errors) {
  const keys = Object.keys(host.versions).sort(compareText);
  const expected = host.kind === 'standalone'
    ? []
    : host.kind === 'cross_host'
      ? ['claude', 'codex']
      : [host.kind];
  if (canonicalJson(keys) !== canonicalJson(expected)) {
    errors.push({ path: '/host/versions', code: 'host_version_mismatch', message: `Host kind '${host.kind}' requires exact matching version keys.` });
  }
  if (host.kind === 'standalone' && host.scope !== 'standalone') {
    errors.push({ path: '/host/scope', code: 'host_scope_mismatch', message: 'Standalone evidence requires standalone scope.' });
  }
}

function validateSchemaValue(value, schema, currentPath, rootSchema, errors) {
  if (schema.$ref) {
    validateSchemaValue(value, resolveLocalRef(rootSchema, schema.$ref), currentPath, rootSchema, errors);
    return;
  }
  if (Object.hasOwn(schema, 'const') && canonicalJson(value) !== canonicalJson(schema.const)) {
    errors.push({ path: currentPath || '/', code: 'const_mismatch', message: `Expected ${JSON.stringify(schema.const)}.` });
    return;
  }
  if (schema.enum && !schema.enum.some((entry) => canonicalJson(entry) === canonicalJson(value))) {
    errors.push({ path: currentPath || '/', code: 'enum_mismatch', message: `Expected one of ${schema.enum.join(', ')}.` });
    return;
  }
  if (schema.type && !matchesType(value, schema.type)) {
    errors.push({ path: currentPath || '/', code: 'type_mismatch', message: `Expected type ${JSON.stringify(schema.type)}.` });
    return;
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push({ path: currentPath || '/', code: 'min_length', message: `Expected at least ${schema.minLength} characters.` });
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push({ path: currentPath || '/', code: 'max_length', message: `Expected at most ${schema.maxLength} characters.` });
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) errors.push({ path: currentPath || '/', code: 'pattern_mismatch', message: `Value does not match ${schema.pattern}.` });
    if (schema.format === 'date-time' && !isDateTime(value)) errors.push({ path: currentPath || '/', code: 'format_mismatch', message: 'Expected an RFC 3339 date-time.' });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push({ path: currentPath || '/', code: 'min_items', message: `Expected at least ${schema.minItems} items.` });
    if (schema.uniqueItems && new Set(value.map(canonicalJson)).size !== value.length) errors.push({ path: currentPath || '/', code: 'duplicate_item', message: 'Array items must be unique.' });
    if (schema.items) value.forEach((entry, index) => validateSchemaValue(entry, schema.items, `${currentPath}/${index}`, rootSchema, errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) errors.push({ path: `${currentPath}/${required}` || '/', code: 'required', message: `Missing required property '${required}'.` });
    }
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) errors.push({ path: currentPath || '/', code: 'min_properties', message: `Expected at least ${schema.minProperties} properties.` });
    for (const [key, entry] of Object.entries(value)) {
      const propertySchema = schema.properties?.[key];
      if (propertySchema) {
        validateSchemaValue(entry, propertySchema, `${currentPath}/${escapePointer(key)}`, rootSchema, errors);
      } else if (schema.additionalProperties === false) {
        errors.push({ path: `${currentPath}/${escapePointer(key)}`, code: 'additional_property', message: `Unknown property '${key}'.` });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateSchemaValue(entry, schema.additionalProperties, `${currentPath}/${escapePointer(key)}`, rootSchema, errors);
      }
    }
    if (schema.propertyNames?.pattern) {
      const pattern = new RegExp(schema.propertyNames.pattern);
      for (const key of Object.keys(value)) {
        if (!pattern.test(key)) errors.push({ path: `${currentPath}/${escapePointer(key)}`, code: 'property_name_mismatch', message: `Property name does not match ${schema.propertyNames.pattern}.` });
      }
    }
  }
}

function collectEvidenceFiles(inputPath, diagnostics) {
  const stat = fs.lstatSync(inputPath);
  if (stat.isSymbolicLink()) {
    diagnostics.push({ code: 'evidence_symlink_refused', path: inputPath });
    return [];
  }
  if (stat.isFile()) return path.extname(inputPath).toLowerCase() === '.json' ? [inputPath] : [];
  if (!stat.isDirectory()) return [];
  const files = [];
  for (const entry of fs.readdirSync(inputPath, { withFileTypes: true }).sort((left, right) => compareText(left.name, right.name))) {
    const absolutePath = path.join(inputPath, entry.name);
    if (entry.isSymbolicLink()) {
      diagnostics.push({ code: 'evidence_symlink_refused', path: absolutePath });
    } else if (entry.isDirectory() && entry.name !== 'raw') {
      files.push(...collectEvidenceFiles(absolutePath, diagnostics));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.json') {
      files.push(absolutePath);
    }
  }
  return files;
}

function rejectForbiddenRollups(value, currentPath, errors) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectForbiddenRollups(entry, `${currentPath}/${index}`, errors));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenRollupFields.has(key)) {
      errors.push({ path: `${currentPath}/${key}`, code: 'unsupported_rollup', message: `Broad evidence field '${key}' is forbidden.` });
    }
    rejectForbiddenRollups(entry, `${currentPath}/${key}`, errors);
  }
}

function resolveLocalRef(rootSchema, reference) {
  if (!reference.startsWith('#/')) throw new Error(`Only local schema refs are supported: ${reference}`);
  return reference.slice(2).split('/').reduce((value, token) => value[token.replaceAll('~1', '/').replaceAll('~0', '~')], rootSchema);
}

function matchesType(value, types) {
  const accepted = Array.isArray(types) ? types : [types];
  return accepted.some((type) => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    if (type === 'integer') return Number.isInteger(value);
    return typeof value === type;
  });
}

function isDateTime(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function escapePointer(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function parseCli(argv) {
  if (argv.length === 0 || argv.includes('--help')) return { mode: 'help' };
  if (argv[0] === '--validate') {
    if (argv.length < 2) throw cliError('evidence_paths_required', '--validate requires at least one file or directory.');
    return { mode: 'validate', paths: argv.slice(1) };
  }
  if (argv[0] === '--record') {
    const inputIndex = argv.indexOf('--input');
    if (argv.length < 4 || inputIndex < 0 || !argv[1] || !argv[inputIndex + 1]) {
      throw cliError('evidence_record_arguments_invalid', '--record <target> --input <cell.json> is required.');
    }
    return { mode: 'record', target: argv[1], input: argv[inputIndex + 1] };
  }
  throw cliError('evidence_command_invalid', 'Use --validate <paths...> or --record <target> --input <cell.json>.');
}

function cliError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function runCli(argv) {
  try {
    const parsed = parseCli(argv);
    if (parsed.mode === 'help') {
      process.stdout.write('Usage: node scripts/run-agent-evidence.js --validate <paths...>\n       node scripts/run-agent-evidence.js --record <target> --input <cell.json>\n');
      return;
    }
    if (parsed.mode === 'validate') {
      const report = validateEvidencePaths(parsed.paths);
      process.stdout.write(`${JSON.stringify(report)}\n`);
      if (report.diagnostics.length > 0 || report.sources.some((entry) => entry.status !== 'validated')) process.exitCode = 1;
      return;
    }
    const cell = JSON.parse(fs.readFileSync(path.resolve(parsed.input), 'utf8'));
    const result = recordEvidenceCell(parsed.target, cell);
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, mode: 'record', ...result })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: 'error',
      error: { code: error.code ?? 'evidence_runner_failed', message: error.message, details: error.details ?? null }
    })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli(process.argv.slice(2));
}
