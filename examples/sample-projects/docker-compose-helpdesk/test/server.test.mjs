import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHelpdeskServer } from '../src/server.mjs';

async function withServer(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), 'helpdesk-http-'));
  const server = createHelpdeskServer({ dataFile: path.join(directory, 'tickets.json') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}

test('health and ticket API expose seeded data and accept a ticket', async () => {
  await withServer(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');

    const list = await fetch(`${baseUrl}/api/tickets`);
    assert.equal((await list.json()).count, 3);

    const created = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Can I get a monitor stand?',
        description: 'A monitor stand would make the shared desk more comfortable.',
        requesterEmail: 'casey@example.test',
        priority: 'low',
      }),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).id, 'ticket-004');
  });
});
