import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  JOURNAL_SCHEMA_VERSION,
  JOURNAL_STATES,
  TERMINAL_JOURNAL_STATES,
  createOperationJournal
} from '../../src/control-plane/operation-journal.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TIME = Date.parse('2026-07-20T00:00:00.000Z');

test('prepared record and derived creation index are durable before later transitions', async () => {
  await withJournal(async ({ journal, homeDir }) => {
    const prepared = await journal.prepare(operationInput('op_aaaaaaaaaaaaaaaaaaaaaaaa'));

    assert.equal(prepared.created, true);
    assert.deepEqual(JOURNAL_STATES, [
      'prepared', 'running', 'succeeded', 'failed', 'refused', 'indeterminate', 'reconciled'
    ]);
    assert.deepEqual(TERMINAL_JOURNAL_STATES, ['succeeded', 'failed', 'refused', 'reconciled']);
    assert.equal(prepared.record.schemaVersion, JOURNAL_SCHEMA_VERSION);
    assert.equal(prepared.record.state, 'prepared');
    assert.equal(prepared.record.effectsCertainty, 'none');
    assert.equal(prepared.record.revision, 1);
    assert.equal(prepared.record.startedAt, null);
    assert.equal(prepared.record.terminalAt, null);
    assert.equal(prepared.record.retainUntil, null);
    assert.equal(prepared.record.operationName, 'task.start');
    assert.equal(prepared.record.inputDigest, digest('a'));
    assert.deepEqual(prepared.record.projectRef, { projectId: 'project-a', alias: 'alpha' });
    assert.equal(prepared.record.taskRef, 'dev');

    const recordPath = path.join(
      homeDir, 'runtime', 'operations', 'v1', 'records', `${prepared.record.operationId}.json`
    );
    const indexPath = path.join(
      homeDir, 'runtime', 'operations', 'v1', 'indexes', 'by-created', '2026-07-20.jsonl'
    );
    assert.deepEqual(readJson(recordPath), prepared.record);

    const [entry] = readJsonLines(indexPath);
    assert.equal(entry.operationId, prepared.record.operationId);
    assert.equal(entry.operationName, 'task.start');
    assert.equal(entry.projectId, 'project-a');
    assert.equal(entry.taskRef, 'dev');
    assert.equal(entry.createdAt, '2026-07-20T00:00:00.000Z');
    assert.equal('state' in entry, false, 'derived index must not become operation-state authority');
  });
});

test('same operation ID is idempotent only for the same immutable request digest', async () => {
  await withJournal(async ({ journal }) => {
    const input = operationInput('op_bbbbbbbbbbbbbbbbbbbbbbbb');
    const first = await journal.prepare(input);
    const same = await journal.prepare({ ...input, requestSummary: { ignored: 'second summary' } });

    assert.equal(same.created, false);
    assert.deepEqual(same.record, first.record);
    await assert.rejects(
      journal.prepare({ ...input, inputDigest: digest('f') }),
      errorWithCode('operation_id_digest_mismatch')
    );
    assert.deepEqual(await journal.get(input.operationId), first.record);
  });
});

test('transitions are atomic, revisioned, immutable, and terminal states cannot resume', async () => {
  let failRunningCommit = true;
  await withJournal(async ({ journal, homeDir }) => {
    const input = operationInput('op_cccccccccccccccccccccccc');
    await journal.prepare(input);

    journal.setFaultInjector(({ point, nextRecord }) => {
      if (point === 'before_record_replace' && nextRecord.state === 'running' && failRunningCommit) {
        failRunningCommit = false;
        throw Object.assign(new Error('simulated atomic replacement crash'), { code: 'simulated_crash' });
      }
    });
    await assert.rejects(
      journal.transition(input.operationId, { expectedRevision: 1, to: 'running' }),
      errorWithCode('simulated_crash')
    );
    assert.equal((await journal.get(input.operationId)).state, 'prepared');
    assert.deepEqual(findFiles(homeDir, /\.tmp$/), []);

    const running = await journal.transition(input.operationId, {
      expectedRevision: 1,
      to: 'running'
    });
    assert.equal(running.state, 'running');
    assert.equal(running.revision, 2);
    assert.equal(running.startedAt, '2026-07-20T00:00:00.000Z');

    const succeeded = await journal.transition(input.operationId, {
      expectedRevision: 2,
      to: 'succeeded',
      effectsCertainty: 'confirmed',
      effectEvidenceRefs: ['run:run-a'],
      resourceRef: { kind: 'task', id: 'dev', runId: 'run-a' },
      result: { outcome: { kind: 'succeeded', code: 'task_started' } }
    });
    assert.equal(succeeded.revision, 3);
    assert.equal(succeeded.terminalAt, '2026-07-20T00:00:00.000Z');
    assert.equal(Date.parse(succeeded.retainUntil) - Date.parse(succeeded.terminalAt), 30 * DAY_MS);
    assert.match(succeeded.resultRef.path, /^results\/op_[A-Za-z0-9_-]+\.json$/);
    assert.match(succeeded.resultRef.digest, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(readJson(path.join(homeDir, 'runtime', 'operations', 'v1', succeeded.resultRef.path)), {
      outcome: { kind: 'succeeded', code: 'task_started' }
    });

    await assert.rejects(
      journal.transition(input.operationId, { expectedRevision: 3, to: 'running' }),
      errorWithCode('operation_transition_invalid')
    );
    await assert.rejects(
      journal.transition(input.operationId, {
        expectedRevision: 3,
        to: 'succeeded',
        operationName: 'task.stop'
      }),
      errorWithCode('operation_record_immutable_field')
    );
    assert.deepEqual(await journal.get(input.operationId), succeeded);
  });
});

test('journal lifecycle events are operation-correlated and redact secret-looking summaries', async () => {
  await withJournal(async ({ journal, homeDir }) => {
    const secret = 'journal_token_should_never_persist';
    const input = operationInput('op_dddddddddddddddddddddddd', {
      requestSummary: { taskRef: 'dev', API_TOKEN: secret }
    });
    await journal.prepare(input);
    await journal.transition(input.operationId, { expectedRevision: 1, to: 'running' });
    await journal.transition(input.operationId, {
      expectedRevision: 2,
      to: 'failed',
      effectsCertainty: 'none',
      lastError: { code: 'fixture_failure', secret }
    });

    const persisted = fs.readFileSync(path.join(homeDir, 'events', 'events.jsonl'), 'utf8');
    assert.equal(persisted.includes(secret), false);
    const events = persisted.trim().split(/\r?\n/).map(JSON.parse);
    assert.deepEqual(events.map((event) => event.type), [
      'operation.prepared', 'operation.running', 'operation.failed'
    ]);
    assert.deepEqual(events.map((event) => event.operationId), [input.operationId, input.operationId, input.operationId]);
    assert.deepEqual(events.map((event) => event.transactionId), [input.operationId, input.operationId, input.operationId]);
    assert.deepEqual(events.map((event) => event.journalState), ['prepared', 'running', 'failed']);
  });
});

test('unsupported newer records permit bounded diagnosis but block every write path', async () => {
  await withJournal(async ({ journal, homeDir }) => {
    const operationId = 'op_eeeeeeeeeeeeeeeeeeeeeeee';
    const recordPath = path.join(homeDir, 'runtime', 'operations', 'v1', 'records', `${operationId}.json`);
    fs.mkdirSync(path.dirname(recordPath), { recursive: true });
    fs.writeFileSync(recordPath, `${JSON.stringify({
      schemaVersion: JOURNAL_SCHEMA_VERSION + 1,
      operationId,
      operationName: 'task.start',
      inputDigest: digest('e'),
      state: 'running',
      privateFutureField: 'must-not-leak'
    }, null, 2)}\n`);

    const diagnosis = await journal.diagnose(operationId);
    assert.deepEqual(diagnosis, {
      readable: false,
      code: 'operation_record_version_unsupported',
      operationId,
      statePath: recordPath,
      foundVersion: JOURNAL_SCHEMA_VERSION + 1,
      supportedVersion: JOURNAL_SCHEMA_VERSION
    });
    assert.equal(JSON.stringify(diagnosis).includes('privateFutureField'), false);
    await assert.rejects(journal.get(operationId), errorWithCode('operation_record_version_unsupported'));
    await assert.rejects(
      journal.transition(operationId, { expectedRevision: 1, to: 'failed', effectsCertainty: 'none' }),
      errorWithCode('operation_record_version_unsupported')
    );
    await assert.rejects(
      journal.prepare(operationInput(operationId, { inputDigest: digest('e') })),
      errorWithCode('operation_record_version_unsupported')
    );
    assert.equal(readJson(recordPath).privateFutureField, 'must-not-leak');
  });
});

function operationInput(operationId, overrides = {}) {
  return {
    operationId,
    operationName: 'task.start',
    definitionVersion: '1.0.0',
    inputDigest: digest('a'),
    requestSummary: { projectRef: 'alpha', taskRef: 'dev' },
    projectRef: { projectId: 'project-a', alias: 'alpha' },
    taskRef: 'dev',
    runtimeProvenance: provenance(),
    ...overrides
  };
}

function provenance() {
  return {
    surface: 'mcp',
    runtimeKind: 'package-mcp',
    runtimeVersion: '0.1.0',
    stateHome: 'fixture-home',
    buildIdentity: `sha256:${'b'.repeat(64)}`
  };
}

function digest(seed) {
  return `sha256:${String(seed).padEnd(64, seed).slice(0, 64)}`;
}

function errorWithCode(code) {
  return (error) => error?.code === code;
}

async function withJournal(callback, options = {}) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-operation-journal-'));
  const env = { ...process.env, LAUNCHDECK_HOME: homeDir };
  const clock = options.clock ?? (() => new Date(BASE_TIME));
  const journal = createOperationJournal({ env, clock });
  try {
    await callback({ journal, homeDir, env });
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function findFiles(root, pattern) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}
