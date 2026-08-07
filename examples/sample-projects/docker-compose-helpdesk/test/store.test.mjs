import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { addTicket, ensureStore, loadSeedState } from '../src/store.mjs';

test('seed state is deterministic', async () => {
  const first = await loadSeedState();
  const second = await loadSeedState();
  assert.deepEqual(first, second);
  assert.equal(first.tickets.length, 3);
  assert.deepEqual(first.tickets.map((ticket) => ticket.id), ['ticket-001', 'ticket-002', 'ticket-003']);
});

test('the store seeds once and persists new tickets', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'helpdesk-store-'));
  const dataFile = path.join(directory, 'tickets.json');
  try {
    const seeded = await ensureStore(dataFile);
    assert.equal(seeded.tickets.length, 3);
    const created = await addTicket(dataFile, {
      title: 'Test ticket',
      description: 'A ticket created by the native test.',
      requesterEmail: 'test@example.test',
      priority: 'normal',
    });
    assert.equal(created.id, 'ticket-004');
    const persisted = await ensureStore(dataFile);
    assert.equal(persisted.tickets.length, 4);
    assert.equal(persisted.tickets.at(-1).title, 'Test ticket');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
