import assert from 'node:assert/strict';
import test from 'node:test';
import { createCliFixture } from './helpers/cli-fixture.js';

const EXAMPLE_ERROR_CODES = new Set([
  'command_usage_error',
  'example_catalog_invalid',
  'example_not_found',
  'example_selection_cancelled',
  'example_destination_exists',
  'example_source_invalid',
  'example_copy_failed',
  'example_publish_failed'
]);

test('example copy exposes a stable typed unknown-ID outcome', () => {
  const fixture = createCliFixture();

  try {
    const result = fixture.runCliJson(['example', 'copy', 'missing-example', fixture.path('destination')]);
    assert.equal(result.status, 1);
    assert.equal(result.json.schemaVersion, 1);
    assert.equal(result.json.command, 'example copy');
    assert.equal(EXAMPLE_ERROR_CODES.has(result.json.error.code), true);
    assert.equal(result.json.error.code, 'example_not_found');
  } finally {
    fixture.cleanup();
  }
});
