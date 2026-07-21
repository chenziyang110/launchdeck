import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LaunchdeckError } from '../errors.js';
import { canonicalDigest } from '../kernel/compatibility.js';
import { appendEvent } from './events.js';
import { withLock } from './locks.js';

export const JOURNAL_SCHEMA_VERSION = 1;
export const JOURNAL_STATES = Object.freeze([
  'prepared',
  'running',
  'succeeded',
  'failed',
  'refused',
  'indeterminate',
  'reconciled'
]);
export const TERMINAL_JOURNAL_STATES = Object.freeze([
  'succeeded',
  'failed',
  'refused',
  'reconciled'
]);
export const TERMINAL_RETENTION_DAYS = 30;

const OPERATION_ID_PATTERN = /^op_[A-Za-z0-9_-]{16,128}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const IMMUTABLE_FIELDS = new Set([
  'schemaVersion',
  'operationId',
  'operationName',
  'definitionVersion',
  'inputDigest',
  'requestSummary',
  'projectRef',
  'taskRef',
  'createdAt',
  'runtimeProvenance'
]);
const ALLOWED_TRANSITIONS = Object.freeze({
  prepared: new Set(['running', 'refused', 'failed', 'reconciled']),
  running: new Set(['succeeded', 'failed', 'indeterminate', 'reconciled']),
  succeeded: new Set(),
  failed: new Set(),
  refused: new Set(),
  indeterminate: new Set(['reconciled']),
  reconciled: new Set()
});
const SECRET_KEY_PATTERN = /(?:token|secret|password|passwd|pwd|credential|api[_-]?key|access[_-]?key|private[_-]?key|auth)/i;
const SECRET_VALUE_PATTERN = /(?:bearer\s+[a-z0-9._~+/=-]{12,}|[a-z0-9_-]*(?:token|secret|password)[a-z0-9_-]*)/i;
const REDACTED = '[REDACTED]';
const DAY_MS = 24 * 60 * 60 * 1000;

export function operationJournalPaths(env = process.env) {
  const homeDir = resolveHomeDir(env);
  const rootDir = path.join(homeDir, 'runtime', 'operations', 'v1');
  return Object.freeze({
    homeDir,
    rootDir,
    recordsDir: path.join(rootDir, 'records'),
    resultsDir: path.join(rootDir, 'results'),
    indexesDir: path.join(rootDir, 'indexes'),
    createdIndexesDir: path.join(rootDir, 'indexes', 'by-created'),
    recordPath(operationId) {
      return path.join(rootDir, 'records', `${requireOperationId(operationId)}.json`);
    },
    resultPath(operationId) {
      return path.join(rootDir, 'results', `${requireOperationId(operationId)}.json`);
    },
    createdIndexPath(date) {
      return path.join(rootDir, 'indexes', 'by-created', `${requireDateToken(date)}.jsonl`);
    }
  });
}

export function createOperationJournal(options = {}) {
  const env = options.env ?? process.env;
  const lockWaitMs = options.lockWaitMs;
  const paths = operationJournalPaths(env);
  const clock = options.clock ?? (() => new Date());
  const eventWriter = options.eventWriter ?? appendEvent;
  let faultInjector = options.faultInjector ?? null;

  return Object.freeze({
    paths,
    setFaultInjector(nextFaultInjector) {
      if (nextFaultInjector !== null && typeof nextFaultInjector !== 'function') {
        throw new TypeError('faultInjector must be a function or null.');
      }
      faultInjector = nextFaultInjector;
    },
    async prepare(input) {
      const normalized = normalizePreparedInput(input);
      return withOperationLock(normalized.operationId, async () => {
        if (fs.existsSync(paths.recordPath(normalized.operationId))) {
          const existing = readRecordForWrite(normalized.operationId);
          if (existing.inputDigest !== normalized.inputDigest) {
            throw journalError(
              'operation_id_digest_mismatch',
              `Operation '${normalized.operationId}' already exists with a different input digest.`,
              { operationId: normalized.operationId }
            );
          }
          await ensureCreationIndexEntry(existing);
          return { created: false, record: clone(existing) };
        }

        const now = nowIso(clock);
        const record = {
          schemaVersion: JOURNAL_SCHEMA_VERSION,
          operationId: normalized.operationId,
          operationName: normalized.operationName,
          definitionVersion: normalized.definitionVersion,
          inputDigest: normalized.inputDigest,
          requestSummary: redactValue(normalized.requestSummary),
          projectRef: clone(normalized.projectRef),
          taskRef: normalized.taskRef,
          state: 'prepared',
          effectsCertainty: 'none',
          effectEvidenceRefs: [],
          resourceRef: null,
          resultRef: null,
          resolvedOutcome: null,
          createdAt: now,
          startedAt: null,
          updatedAt: now,
          terminalAt: null,
          retainUntil: null,
          runtimeProvenance: redactValue(normalized.runtimeProvenance),
          revision: 1,
          lastError: null
        };
        await writeRecord(record);
        await ensureCreationIndexEntry(record);
        await emitLifecycleEvent(record);
        return { created: true, record: clone(record) };
      });
    },
    async get(operationId) {
      return clone(readRecordForWrite(operationId));
    },
    async diagnose(operationId) {
      const id = requireOperationId(operationId);
      const statePath = paths.recordPath(id);
      if (!fs.existsSync(statePath)) {
        return {
          readable: false,
          code: 'operation_record_missing_or_expired',
          operationId: id,
          statePath
        };
      }
      let raw;
      try {
        raw = readJson(statePath);
      } catch {
        return {
          readable: false,
          code: 'operation_record_invalid',
          operationId: id,
          statePath
        };
      }
      if (raw?.schemaVersion !== JOURNAL_SCHEMA_VERSION) {
        return {
          readable: false,
          code: 'operation_record_version_unsupported',
          operationId: id,
          statePath,
          foundVersion: raw?.schemaVersion,
          supportedVersion: JOURNAL_SCHEMA_VERSION
        };
      }
      try {
        validateRecord(raw, statePath);
      } catch {
        return {
          readable: false,
          code: 'operation_record_invalid',
          operationId: id,
          statePath
        };
      }
      return {
        readable: true,
        code: 'operation_record_readable',
        operationId: id,
        statePath,
        schemaVersion: raw.schemaVersion,
        state: raw.state,
        revision: raw.revision
      };
    },
    async transition(operationId, transition) {
      const id = requireOperationId(operationId);
      if (hasCurrentOperationLock(id, transition?.lockProof)) {
        return clone(await transitionLocked(id, transition));
      }
      return withOperationLock(id, async () => clone(await transitionLocked(id, transition)));
    },
    async recover(input = {}) {
      const operationId = requireOperationId(input.operationId);
      const inputDigest = requireDigest(input.inputDigest);
      return withOperationLock(operationId, async () => {
        const record = readRecordForWrite(operationId);
        if (record.inputDigest !== inputDigest) {
          throw journalError(
            'operation_id_digest_mismatch',
            `Operation '${operationId}' has a different input digest.`,
            { operationId }
          );
        }
        if (TERMINAL_JOURNAL_STATES.includes(record.state) || typeof input.reconcile !== 'function') {
          return clone(record);
        }
        const resolution = await input.reconcile(clone(record));
        if (!resolution) return clone(record);
        return clone(await transitionLocked(operationId, {
          expectedRevision: record.revision,
          to: 'reconciled',
          ...resolution
        }));
      });
    },
    async rebuildCreationIndexes() {
      return withIndexLock(() => rebuildCreationIndexesLocked());
    },
    async compact(input = {}) {
      const compactAt = normalizeDate(input.now ?? currentDate(clock), 'now');
      return withIndexLock(async () => {
        const prunedOperationIds = [];
        for (const recordPath of listRecordPaths()) {
          let record;
          try {
            record = readRecordPath(recordPath);
          } catch {
            continue;
          }
          if (!TERMINAL_JOURNAL_STATES.includes(record.state)) continue;
          if (!record.retainUntil || Date.parse(record.retainUntil) > compactAt.getTime()) continue;
          fs.rmSync(recordPath, { force: true });
          fs.rmSync(paths.resultPath(record.operationId), { force: true });
          prunedOperationIds.push(record.operationId);
        }
        const rebuilt = rebuildCreationIndexesLocked();
        return {
          prunedOperationIds: prunedOperationIds.sort(),
          rebuiltIndexCount: rebuilt.recordCount
        };
      });
    },
    async list(input = {}) {
      validateListInput(input);
      return withIndexLock(async () => {
        const indexRead = readCreationIndexEntries();
        const entries = indexRead.missing || indexRead.malformed
          ? (rebuildCreationIndexesLocked(), readCreationIndexEntries().entries)
          : indexRead.entries;
        const after = Date.parse(input.createdAfter);
        const before = Date.parse(input.createdBefore);
        const seen = new Set();
        const records = [];
        for (const entry of entries) {
          if (seen.has(entry.operationId)) continue;
          seen.add(entry.operationId);
          if (entry.projectId !== input.projectId) continue;
          if (entry.operationName !== input.operationName) continue;
          if ((entry.taskRef ?? null) !== (input.taskRef ?? null)) continue;
          const createdAt = Date.parse(entry.createdAt);
          if (createdAt < after || createdAt > before) continue;
          let record;
          try {
            record = readRecordForWrite(entry.operationId);
          } catch (error) {
            if (error?.code === 'operation_record_missing_or_expired') continue;
            throw error;
          }
          if (!input.states.includes(record.state)) continue;
          records.push(record);
        }
        records.sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt)
          || right.operationId.localeCompare(left.operationId)
        );
        return { records: clone(records.slice(0, input.limit ?? 20)), nextCursor: null };
      });
    }
  });

  async function transitionLocked(operationId, transition = {}) {
    const record = readRecordForWrite(operationId);
    for (const field of Object.keys(transition)) {
      if (IMMUTABLE_FIELDS.has(field)) {
        throw journalError(
          'operation_record_immutable_field',
          `Operation journal field '${field}' is immutable.`,
          { operationId, field }
        );
      }
    }
    if (transition.expectedRevision !== undefined && transition.expectedRevision !== record.revision) {
      throw journalError(
        'operation_revision_mismatch',
        `Operation '${operationId}' revision changed.`,
        { operationId, expectedRevision: transition.expectedRevision, actualRevision: record.revision }
      );
    }
    const nextState = requireState(transition.to);
    if (!ALLOWED_TRANSITIONS[record.state]?.has(nextState)) {
      throw journalError(
        'operation_transition_invalid',
        `Operation '${operationId}' cannot transition from ${record.state} to ${nextState}.`,
        { operationId, from: record.state, to: nextState }
      );
    }

    const now = nowIso(clock);
    const terminal = TERMINAL_JOURNAL_STATES.includes(nextState);
    let resultRef = record.resultRef;
    let wroteResult = false;
    if (transition.result !== undefined) {
      const result = redactValue(transition.result);
      resultRef = {
        path: path.posix.join('results', `${operationId}.json`),
        digest: canonicalDigest(result)
      };
      await atomicWriteJson(paths.resultPath(operationId), result);
      wroteResult = true;
    }
    const nextRecord = {
      ...record,
      state: nextState,
      effectsCertainty: transition.effectsCertainty ?? defaultEffectsCertainty(nextState, record.effectsCertainty),
      effectEvidenceRefs: redactValue(transition.effectEvidenceRefs ?? record.effectEvidenceRefs),
      resourceRef: transition.resourceRef === undefined ? record.resourceRef : redactValue(transition.resourceRef),
      resultRef,
      resolvedOutcome: nextState === 'reconciled'
        ? requireResolvedOutcome(transition.resolvedOutcome)
        : null,
      startedAt: nextState === 'running' ? (record.startedAt ?? now) : record.startedAt,
      updatedAt: now,
      terminalAt: terminal ? now : null,
      retainUntil: terminal ? new Date(Date.parse(now) + TERMINAL_RETENTION_DAYS * DAY_MS).toISOString() : null,
      revision: record.revision + 1,
      lastError: transition.lastError === undefined ? record.lastError : redactValue(transition.lastError)
    };
    validateTransitionSemantics(nextRecord);
    try {
      await writeRecord(nextRecord);
    } catch (error) {
      if (wroteResult) fs.rmSync(paths.resultPath(operationId), { force: true });
      throw error;
    }
    await emitLifecycleEvent(nextRecord);
    return nextRecord;
  }

  async function writeRecord(record) {
    validateRecord(record, paths.recordPath(record.operationId));
    await atomicWriteJson(paths.recordPath(record.operationId), record, async () => {
      if (faultInjector) await faultInjector({
        point: 'before_record_replace',
        operationId: record.operationId,
        nextRecord: clone(record)
      });
    });
  }

  async function ensureCreationIndexEntry(record) {
    const entry = creationEntry(record);
    await withIndexLock(async () => {
      const indexPath = paths.createdIndexPath(record.createdAt.slice(0, 10));
      const existing = fs.existsSync(indexPath) ? safeReadJsonLines(indexPath) : [];
      if (existing.some((candidate) => candidate.operationId === record.operationId)) return;
      fs.mkdirSync(path.dirname(indexPath), { recursive: true });
      fs.appendFileSync(indexPath, `${JSON.stringify(entry)}\n`, 'utf8');
    });
  }

  async function emitLifecycleEvent(record) {
    await eventWriter({
      homeDir: paths.homeDir,
      transactionId: record.operationId,
      operationId: record.operationId,
      type: `operation.${record.state}`,
      projectId: record.projectRef?.projectId,
      task: record.taskRef ?? undefined,
      status: record.state,
      journalState: record.state,
      effectsCertainty: record.effectsCertainty,
      evidenceRefs: record.effectEvidenceRefs,
      buildIdentity: record.runtimeProvenance?.buildIdentity,
      code: record.lastError?.code,
      message: `Operation ${record.operationName} is ${record.state}.`,
      data: {
        revision: record.revision,
        resourceRef: record.resourceRef,
        lastError: record.lastError
      }
    });
  }

  async function withOperationLock(operationId, callback) {
    return withLock({
      lockName: `operation-${requireOperationId(operationId)}`,
      env,
      transactionId: operationId,
      waitMs: lockWaitMs
    }, callback);
  }

  function hasCurrentOperationLock(operationId, proof) {
    const lockName = `operation-${operationId}`;
    if (proof?.lockName !== lockName || proof?.record?.ownerPid !== process.pid) return false;
    const lockPath = path.join(paths.homeDir, 'locks', `${lockName}.lock`);
    try {
      const persisted = readJson(lockPath);
      return persisted.lockName === proof.record.lockName
        && persisted.ownerPid === proof.record.ownerPid
        && persisted.transactionId === proof.record.transactionId
        && persisted.createdAt === proof.record.createdAt;
    } catch {
      return false;
    }
  }

  async function withIndexLock(callback) {
    return withLock({
      lockName: 'operation-journal-index',
      env,
      transactionId: 'operation-journal-index',
      waitMs: lockWaitMs
    }, callback);
  }

  function readRecordForWrite(operationId) {
    const id = requireOperationId(operationId);
    const recordPath = paths.recordPath(id);
    if (!fs.existsSync(recordPath)) {
      throw journalError(
        'operation_record_missing_or_expired',
        `Operation record '${id}' is missing or expired.`,
        { operationId: id }
      );
    }
    return readRecordPath(recordPath);
  }

  function readRecordPath(recordPath) {
    let record;
    try {
      record = readJson(recordPath);
    } catch (error) {
      throw journalError('operation_record_invalid', `Operation record is invalid: ${recordPath}`, {
        statePath: recordPath,
        causeMessage: error?.message
      });
    }
    if (record?.schemaVersion !== JOURNAL_SCHEMA_VERSION) {
      throw journalError(
        'operation_record_version_unsupported',
        `Operation record uses unsupported version ${record?.schemaVersion}.`,
        {
          operationId: record?.operationId,
          statePath: recordPath,
          foundVersion: record?.schemaVersion,
          supportedVersion: JOURNAL_SCHEMA_VERSION
        }
      );
    }
    validateRecord(record, recordPath);
    return record;
  }

  function rebuildCreationIndexesLocked() {
    const entriesByDate = new Map();
    const malformedRecordPaths = [];
    let recordCount = 0;
    for (const recordPath of listRecordPaths()) {
      try {
        const record = readRecordPath(recordPath);
        const date = record.createdAt.slice(0, 10);
        const entries = entriesByDate.get(date) ?? [];
        entries.push(creationEntry(record));
        entriesByDate.set(date, entries);
        recordCount += 1;
      } catch {
        malformedRecordPaths.push(recordPath);
      }
    }
    fs.rmSync(paths.createdIndexesDir, { recursive: true, force: true });
    for (const [date, entries] of entriesByDate) {
      entries.sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt)
        || left.operationId.localeCompare(right.operationId)
      );
      atomicWriteText(
        paths.createdIndexPath(date),
        `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`
      );
    }
    return {
      recordCount,
      indexCount: entriesByDate.size,
      malformedRecordPaths: malformedRecordPaths.sort()
    };
  }

  function listRecordPaths() {
    if (!fs.existsSync(paths.recordsDir)) return [];
    return fs.readdirSync(paths.recordsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(paths.recordsDir, entry.name))
      .sort();
  }

  function readCreationIndexEntries() {
    if (!fs.existsSync(paths.createdIndexesDir)) return { entries: [], missing: true, malformed: false };
    const indexPaths = fs.readdirSync(paths.createdIndexesDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => path.join(paths.createdIndexesDir, entry.name))
      .sort();
    if (indexPaths.length === 0) return { entries: [], missing: true, malformed: false };
    const entries = [];
    let malformed = false;
    for (const indexPath of indexPaths) {
      try {
        for (const entry of safeReadJsonLines(indexPath, true)) {
          if (!validCreationEntry(entry)) malformed = true;
          else entries.push(entry);
        }
      } catch {
        malformed = true;
      }
    }
    return { entries, missing: false, malformed };
  }
}

function normalizePreparedInput(input = {}) {
  const operationId = requireOperationId(input.operationId);
  const operationName = requireString(input.operationName, 'operationName', 128);
  const definitionVersion = requireString(input.definitionVersion, 'definitionVersion', 128);
  const inputDigest = requireDigest(input.inputDigest);
  if (!input.projectRef || typeof input.projectRef !== 'object' || Array.isArray(input.projectRef)) {
    throw journalError('operation_record_invalid', 'projectRef is required for a mutation journal record.');
  }
  const projectId = requireString(input.projectRef.projectId, 'projectRef.projectId', 256);
  const alias = input.projectRef.alias === undefined
    ? undefined
    : requireString(input.projectRef.alias, 'projectRef.alias', 256);
  return {
    operationId,
    operationName,
    definitionVersion,
    inputDigest,
    requestSummary: input.requestSummary ?? {},
    projectRef: alias === undefined ? { projectId } : { projectId, alias },
    taskRef: input.taskRef === null || input.taskRef === undefined
      ? null
      : requireString(input.taskRef, 'taskRef', 128),
    runtimeProvenance: input.runtimeProvenance ?? {}
  };
}

function validateRecord(record, statePath) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw journalError('operation_record_invalid', `Operation record is invalid: ${statePath}`, { statePath });
  }
  if (record.schemaVersion !== JOURNAL_SCHEMA_VERSION) {
    throw journalError('operation_record_version_unsupported', 'Operation record version is unsupported.', {
      statePath,
      foundVersion: record.schemaVersion,
      supportedVersion: JOURNAL_SCHEMA_VERSION
    });
  }
  requireOperationId(record.operationId);
  requireString(record.operationName, 'operationName', 128);
  requireString(record.definitionVersion, 'definitionVersion', 128);
  requireDigest(record.inputDigest);
  requireState(record.state);
  if (!Number.isInteger(record.revision) || record.revision < 1) {
    throw journalError('operation_record_invalid', 'Operation record revision is invalid.', { statePath });
  }
  for (const field of ['createdAt', 'updatedAt']) normalizeDate(record[field], field);
  if (!['none', 'confirmed', 'possible', 'unknown'].includes(record.effectsCertainty)) {
    throw journalError('operation_record_invalid', 'Operation effects certainty is invalid.', { statePath });
  }
  validateTransitionSemantics(record);
}

function validateTransitionSemantics(record) {
  const terminal = TERMINAL_JOURNAL_STATES.includes(record.state);
  if (terminal && (!record.terminalAt || !record.retainUntil)) {
    throw journalError('operation_record_invalid', 'Terminal journal records require terminalAt and retainUntil.');
  }
  if (!terminal && (record.terminalAt !== null || record.retainUntil !== null)) {
    throw journalError('operation_record_invalid', 'Unresolved journal records cannot have an expiry horizon.');
  }
  if (record.state === 'reconciled' && !['succeeded', 'failed', 'partial', 'refused'].includes(record.resolvedOutcome)) {
    throw journalError('operation_record_invalid', 'Reconciled records require a resolved outcome.');
  }
}

function validateListInput(input) {
  requireString(input.projectId, 'projectId', 256);
  requireString(input.operationName, 'operationName', 128);
  normalizeDate(input.createdAfter, 'createdAfter');
  normalizeDate(input.createdBefore, 'createdBefore');
  if (Date.parse(input.createdBefore) <= Date.parse(input.createdAfter)) {
    throw journalError('operation_query_invalid', 'createdBefore must be after createdAfter.');
  }
  if (!Array.isArray(input.states) || input.states.length === 0) {
    throw journalError('operation_query_invalid', 'states must contain at least one journal state.');
  }
  for (const state of input.states) requireState(state);
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw journalError('operation_query_invalid', 'limit must be between 1 and 20.');
  }
}

function creationEntry(record) {
  return omitUndefined({
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    operationId: record.operationId,
    operationName: record.operationName,
    projectId: record.projectRef.projectId,
    taskRef: record.taskRef ?? undefined,
    createdAt: record.createdAt
  });
}

function validCreationEntry(entry) {
  return entry?.schemaVersion === JOURNAL_SCHEMA_VERSION
    && OPERATION_ID_PATTERN.test(entry.operationId ?? '')
    && typeof entry.operationName === 'string'
    && typeof entry.projectId === 'string'
    && Number.isFinite(Date.parse(entry.createdAt));
}

function defaultEffectsCertainty(nextState, current) {
  if (nextState === 'prepared' || nextState === 'running' || nextState === 'refused') return 'none';
  return current ?? 'unknown';
}

function requireResolvedOutcome(value) {
  if (!['succeeded', 'failed', 'partial', 'refused'].includes(value)) {
    throw journalError('operation_record_invalid', 'resolvedOutcome is required for reconciliation.');
  }
  return value;
}

function requireState(value) {
  if (!JOURNAL_STATES.includes(value)) {
    throw journalError('operation_record_invalid', `Invalid operation journal state '${value}'.`);
  }
  return value;
}

function requireOperationId(value) {
  const operationId = String(value ?? '');
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    throw journalError('operation_id_invalid', 'A valid operationId is required.');
  }
  return operationId;
}

function requireDigest(value) {
  const digest = String(value ?? '');
  if (!DIGEST_PATTERN.test(digest)) {
    throw journalError('operation_digest_invalid', 'A canonical sha256 input digest is required.');
  }
  return digest;
}

function requireString(value, label, maxLength) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > maxLength) {
    throw journalError('operation_record_invalid', `${label} is invalid.`);
  }
  return normalized;
}

function requireDateToken(value) {
  const date = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError('A YYYY-MM-DD date is required.');
  return date;
}

function normalizeDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw journalError('operation_record_invalid', `${label} must be a valid date.`);
  }
  return date;
}

function currentDate(clock) {
  const value = clock();
  return value instanceof Date ? value : new Date(value);
}

function nowIso(clock) {
  return normalizeDate(currentDate(clock), 'clock').toISOString();
}

async function atomicWriteJson(filePath, value, beforeReplace) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await beforeReplace?.();
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function atomicWriteText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function safeReadJsonLines(filePath, strict = false) {
  const entries = [];
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      if (strict) throw error;
    }
  }
  return entries;
}

function redactValue(value, key = '') {
  if (key && SECRET_KEY_PATTERN.test(key)) return REDACTED;
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactValue(entryValue, entryKey)
    ]));
  }
  if (typeof value === 'string' && SECRET_VALUE_PATTERN.test(value)) return REDACTED;
  return value;
}

function resolveHomeDir(env) {
  if (env.LAUNCHDECK_HOME) return path.resolve(env.LAUNCHDECK_HOME);
  if (process.platform === 'win32' && env.LOCALAPPDATA) return path.join(env.LOCALAPPDATA, 'Launchdeck');
  if (env.XDG_STATE_HOME) return path.join(env.XDG_STATE_HOME, 'launchdeck');
  return path.join(os.homedir(), '.local', 'state', 'launchdeck');
}

function journalError(code, message, details = undefined) {
  return new LaunchdeckError(code, message, details);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
