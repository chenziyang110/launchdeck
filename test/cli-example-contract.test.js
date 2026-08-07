import assert from 'node:assert/strict';
import test from 'node:test';
import { createCliFixture } from './helpers/cli-fixture.js';

test('example list JSON is a single schemaVersion 1 catalog-derived object', () => {
  const fixture = createCliFixture();

  try {
    const result = fixture.runCliJson(['example', 'list', '--json']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.schemaVersion, 1);
    assert.equal(result.json.command, 'example list');
    assert.equal(Array.isArray(result.json.entries), true);
    assert.equal(result.json.entries.length, 10);
    assert.deepEqual(result.json.entries.map((entry) => entry.id), [
      'vite-react-habit-tracker',
      'nextjs-blog-manager',
      'nestjs-url-shortener',
      'fastapi-inventory',
      'django-events',
      'go-webhook-inbox',
      'spring-boot-orders',
      'aspnet-library-catalog',
      'docker-compose-helpdesk',
      'node-python-issue-tracker'
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('example list compact JSON remains one object and keeps the catalog denominator', () => {
  const fixture = createCliFixture();

  try {
    const result = fixture.runCli(['example', 'list', '--json', '--compact', '--no-color']);
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 1);
    const payload = JSON.parse(lines[0]);
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.entries.length, 10);
  } finally {
    fixture.cleanup();
  }
});
