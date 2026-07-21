import assert from 'node:assert/strict';
import test from 'node:test';
import { createObservationService } from '../../src/kernel/observations.js';

test('cursor binds kind, resource, normalized query, high-water snapshot, and expiry', () => {
  let now = Date.parse('2026-07-20T00:00:00.000Z');
  const observations = createObservationService({
    clock: () => new Date(now),
    cursorSecret: 'fixture-cursor-integrity-key',
    cursorTtlMs: 60_000
  });
  const query = { projectId: 'project-a', taskRef: 'dev', order: 'oldest-first' };
  const initial = [{ id: 1 }, { id: 2 }, { id: 3 }];

  const first = observations.page({
    kind: 'task-events', resourceId: 'project-a:dev', query, items: initial, limit: 2
  });
  assert.deepEqual(first.items, [{ id: 1 }, { id: 2 }]);
  assert.equal(typeof first.nextCursor, 'string');

  const second = observations.page({
    kind: 'task-events',
    resourceId: 'project-a:dev',
    query,
    items: [...initial, { id: 4 }],
    limit: 2,
    cursor: first.nextCursor
  });
  assert.deepEqual(second.items, [{ id: 3 }]);
  assert.equal(second.nextCursor, null, 'newer items remain outside the fixed snapshot');

  const fresh = observations.page({
    kind: 'task-events', resourceId: 'project-a:dev', query, items: [...initial, { id: 4 }], limit: 10
  });
  assert.deepEqual(fresh.items.map((item) => item.id), [1, 2, 3, 4]);

  assert.throws(() => observations.page({
    kind: 'task-logs', resourceId: 'project-a:dev', query, items: initial, limit: 2, cursor: first.nextCursor
  }), errorWithCode('cursor_scope_mismatch'));
  assert.throws(() => observations.page({
    kind: 'task-events', resourceId: 'project-b:dev', query, items: initial, limit: 2, cursor: first.nextCursor
  }), errorWithCode('cursor_scope_mismatch'));
  assert.throws(() => observations.page({
    kind: 'task-events', resourceId: 'project-a:dev', query: { ...query, taskRef: 'build' }, items: initial, limit: 2, cursor: first.nextCursor
  }), errorWithCode('cursor_query_mismatch'));
  assert.throws(() => observations.page({
    kind: 'task-events', resourceId: 'project-a:dev', query, items: initial, limit: 2, cursor: `${first.nextCursor}tampered`
  }), errorWithCode('cursor_invalid'));

  now += 60_001;
  assert.throws(() => observations.page({
    kind: 'task-events', resourceId: 'project-a:dev', query, items: initial, limit: 2, cursor: first.nextCursor
  }), errorWithCode('cursor_expired'));
});

test('log projection applies line and byte limits and redacts before response', () => {
  const observations = createObservationService({
    clock: () => new Date('2026-07-20T00:00:00.000Z'),
    cursorSecret: 'fixture-cursor-integrity-key'
  });
  const secret = 'Bearer abcdefghijklmnopqrstuvwxyz';
  const lines = [
    'normal line',
    `AUTH_TOKEN=${secret}`,
    'x'.repeat(100),
    'last line'
  ];

  const page = observations.pageLogLines({
    resourceId: 'project-a:dev',
    query: { projectId: 'project-a', taskRef: 'dev' },
    lines,
    limit: 3,
    maxBytes: 80
  });

  assert.ok(page.lines.length <= 3);
  assert.ok(Buffer.byteLength(page.lines.join('\n'), 'utf8') <= 80);
  assert.equal(JSON.stringify(page).includes('abcdefghijklmnopqrstuvwxyz'), false);
  assert.ok(page.lines.some((line) => line.includes('[REDACTED]')));
  assert.equal(typeof page.nextCursor, 'string');
});

test('JSON Lines projection reports malformed records without granting mutation authority', () => {
  const observations = createObservationService({
    clock: () => new Date('2026-07-20T00:00:00.000Z'),
    cursorSecret: 'fixture-cursor-integrity-key'
  });
  const projected = observations.pageJsonLines({
    kind: 'task-events',
    resourceId: 'project-a:dev',
    query: { projectId: 'project-a', taskRef: 'dev' },
    content: [JSON.stringify({ id: 1 }), '{ broken', JSON.stringify({ id: 2 })].join('\n'),
    limit: 20
  });

  assert.deepEqual(projected.items, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(projected.warnings.map((warning) => warning.code), ['observation_line_invalid_json']);
  assert.equal(projected.effects, undefined);
  assert.equal(JSON.stringify(projected).includes('operationName'), false);
});

function errorWithCode(code) {
  return (error) => error?.code === code;
}
