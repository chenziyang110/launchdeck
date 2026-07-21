import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOperationJournal } from '../../src/control-plane/operation-journal.js';

const DAY_MS = 24 * 60 * 60 * 1000;

test('terminal records and result blobs expire from terminalAt after the default 30-day horizon', async () => {
  let now = Date.parse('2026-01-01T00:00:00.000Z');
  await withJournal(() => new Date(now), async ({ journal, homeDir }) => {
    const operationId = 'op_terminalretention000001';
    await journal.prepare(operationInput(operationId));
    await journal.transition(operationId, { expectedRevision: 1, to: 'running' });
    const terminal = await journal.transition(operationId, {
      expectedRevision: 2,
      to: 'succeeded',
      effectsCertainty: 'confirmed',
      result: { outcome: { kind: 'succeeded', code: 'fixture_complete' } }
    });
    assert.equal(Date.parse(terminal.retainUntil) - Date.parse(terminal.terminalAt), 30 * DAY_MS);

    now += 30 * DAY_MS - 1;
    assert.deepEqual(await journal.compact({ now: new Date(now) }), { prunedOperationIds: [], rebuiltIndexCount: 1 });
    assert.equal((await journal.get(operationId)).state, 'succeeded');

    now += 2;
    const compacted = await journal.compact({ now: new Date(now) });
    assert.deepEqual(compacted, { prunedOperationIds: [operationId], rebuiltIndexCount: 0 });
    assert.equal(fs.existsSync(path.join(homeDir, 'runtime', 'operations', 'v1', 'records', `${operationId}.json`)), false);
    assert.equal(fs.existsSync(path.join(homeDir, 'runtime', 'operations', 'v1', 'results', `${operationId}.json`)), false);
    await assert.rejects(
      journal.recover({ operationId, inputDigest: `sha256:${'a'.repeat(64)}` }),
      errorWithCode('operation_record_missing_or_expired')
    );
  });
});

test('prepared, running, and indeterminate records are never age-pruned', async () => {
  let now = Date.parse('2016-01-01T00:00:00.000Z');
  await withJournal(() => new Date(now), async ({ journal }) => {
    const ids = {
      prepared: 'op_unresolvedprepared000001',
      running: 'op_unresolvedrunning0000001',
      indeterminate: 'op_unresolvedindeterm00001'
    };
    for (const operationId of Object.values(ids)) await journal.prepare(operationInput(operationId));
    await journal.transition(ids.running, { expectedRevision: 1, to: 'running' });
    await journal.transition(ids.indeterminate, { expectedRevision: 1, to: 'running' });
    await journal.transition(ids.indeterminate, {
      expectedRevision: 2,
      to: 'indeterminate',
      effectsCertainty: 'possible'
    });

    now += 10 * 365 * DAY_MS;
    const compacted = await journal.compact({ now: new Date(now) });
    assert.deepEqual(compacted.prunedOperationIds, []);
    for (const [state, operationId] of Object.entries(ids)) {
      const record = await journal.get(operationId);
      assert.equal(record.state, state);
      assert.equal(record.retainUntil, null);
    }
  });
});

test('missing or corrupt creation indexes rebuild exclusively from authoritative records', async () => {
  await withJournal(() => new Date('2026-07-20T00:00:00.000Z'), async ({ journal, homeDir }) => {
    const first = 'op_indexrecord000000000001';
    const second = 'op_indexrecord000000000002';
    await journal.prepare(operationInput(first));
    await journal.prepare(operationInput(second, { operationName: 'task.stop' }));
    await journal.transition(second, { expectedRevision: 1, to: 'refused', effectsCertainty: 'none' });

    const indexPath = path.join(
      homeDir, 'runtime', 'operations', 'v1', 'indexes', 'by-created', '2026-07-20.jsonl'
    );
    fs.writeFileSync(indexPath, [
      '{ corrupt json',
      JSON.stringify({
        operationId: 'op_invented00000000000001',
        operationName: 'task.start',
        projectId: 'project-a',
        taskRef: 'dev',
        createdAt: '2026-07-20T00:00:00.000Z',
        state: 'succeeded'
      })
    ].join('\n') + '\n');

    const rebuilt = await journal.rebuildCreationIndexes();
    assert.deepEqual(rebuilt, { recordCount: 2, indexCount: 1, malformedRecordPaths: [] });
    const entries = readJsonLines(indexPath);
    assert.deepEqual(entries.map((entry) => entry.operationId).sort(), [first, second]);
    assert.equal(entries.some((entry) => entry.operationId.includes('invented')), false);
    assert.equal(entries.some((entry) => 'state' in entry), false);

    const listed = await journal.list({
      projectId: 'project-a',
      operationName: 'task.stop',
      taskRef: 'dev',
      states: ['refused'],
      createdAfter: '2026-07-19T23:59:59.000Z',
      createdBefore: '2026-07-20T00:00:01.000Z',
      limit: 20
    });
    assert.deepEqual(listed.records.map((record) => record.operationId), [second]);
    assert.equal(listed.records[0].state, 'refused', 'state must be re-read from the record, not copied from the index');

    fs.rmSync(indexPath);
    assert.deepEqual(await journal.rebuildCreationIndexes(), {
      recordCount: 2,
      indexCount: 1,
      malformedRecordPaths: []
    });
    assert.equal(fs.existsSync(indexPath), true);
  });
});

test('malformed records are diagnosed during rebuild and never converted into index authority', async () => {
  await withJournal(() => new Date('2026-07-20T00:00:00.000Z'), async ({ journal, homeDir }) => {
    const validId = 'op_validrecord000000000001';
    await journal.prepare(operationInput(validId));
    const corruptPath = path.join(
      homeDir, 'runtime', 'operations', 'v1', 'records', 'op_corruptrecord00000001.json'
    );
    fs.writeFileSync(corruptPath, '{ not json\n');

    const rebuilt = await journal.rebuildCreationIndexes();
    assert.equal(rebuilt.recordCount, 1);
    assert.equal(rebuilt.indexCount, 1);
    assert.deepEqual(rebuilt.malformedRecordPaths, [corruptPath]);
    assert.equal(fs.existsSync(corruptPath), true, 'rebuild is diagnostic and preserves corrupt evidence');
  });
});

async function withJournal(clock, callback) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-journal-retention-'));
  const env = { ...process.env, LAUNCHDECK_HOME: homeDir };
  const journal = createOperationJournal({ env, clock });
  try {
    await callback({ journal, homeDir, env });
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

function operationInput(operationId, overrides = {}) {
  return {
    operationId,
    operationName: 'task.start',
    definitionVersion: '1.0.0',
    inputDigest: `sha256:${'a'.repeat(64)}`,
    requestSummary: { projectRef: 'alpha', taskRef: 'dev' },
    projectRef: { projectId: 'project-a', alias: 'alpha' },
    taskRef: 'dev',
    runtimeProvenance: {
      surface: 'mcp',
      runtimeKind: 'package-mcp',
      runtimeVersion: '0.1.0',
      stateHome: 'fixture-home',
      buildIdentity: `sha256:${'b'.repeat(64)}`
    },
    ...overrides
  };
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function errorWithCode(code) {
  return (error) => error?.code === code;
}
