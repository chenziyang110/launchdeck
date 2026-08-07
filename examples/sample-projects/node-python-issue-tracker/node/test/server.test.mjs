import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createIssueStore } from '../src/store.mjs';

const seedPath = path.resolve('data/seed.json');

test('seeds a deterministic issue collection and preserves it on reload', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'issue-tracker-node-'));
  const storePath = path.join(directory, 'issues.json');
  const firstStore = createIssueStore({ filePath: storePath, seedPath });
  const first = await firstStore.list();
  const secondStore = createIssueStore({ filePath: storePath, seedPath });

  assert.equal(first.length, 3);
  assert.deepEqual(await secondStore.list(), first);
  assert.equal(JSON.parse(await readFile(storePath, 'utf8')).version, 1);
});

test('creates and updates an issue in the JSON store', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'issue-tracker-node-'));
  const store = createIssueStore({ filePath: path.join(directory, 'issues.json'), seedPath });
  const created = await store.create({ title: 'Write an API example', labels: ['docs'] });
  const updated = await store.update(created.id, { status: 'closed' });

  assert.equal(created.status, 'open');
  assert.equal(updated.status, 'closed');
  assert.equal((await store.get(created.id)).title, 'Write an API example');
});

