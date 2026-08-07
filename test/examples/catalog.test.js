import assert from 'node:assert/strict';
import test from 'node:test';
import { repoRoot } from '../helpers/cli-fixture.js';
import { loadCatalog } from '../../src/examples/catalog.js';

const EXPECTED_IDS = [
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
];

test('catalog loader returns the exact ten approved entries and stable fields', () => {
  const entries = loadCatalog({ rootDir: repoRoot });

  assert.deepEqual(entries.map((entry) => entry.id), EXPECTED_IDS);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 10);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), [
      'id',
      'ports',
      'requirements',
      'sourcePath',
      'stack',
      'theme',
      'title'
    ]);
    assert.equal(typeof entry.sourcePath, 'string');
    assert.ok(Array.isArray(entry.ports));
  }
});
