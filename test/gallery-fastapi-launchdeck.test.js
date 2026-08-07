import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  FASTAPI_ID,
  FASTAPI_LAUNCHDECK_PHASES,
  createFastApiLaunchdeckFixture,
  getFastApiLaunchdeckContract,
  runFastApiLaunchdeckLifecycle
} from './fixtures/gallery-fastapi-launchdeck.js';

test('FastAPI Launchdeck fixture keeps config and runtime home external to packaged source', () => {
  const contract = getFastApiLaunchdeckContract();
  const fixture = createFastApiLaunchdeckFixture();

  try {
    assert.equal(contract.id, FASTAPI_ID);
    assert.equal(contract.sourcePath, 'examples/sample-projects/fastapi-inventory');
    assert.equal(contract.defaultPort, 8104);
    assert.deepEqual(contract.requiredPhases, FASTAPI_LAUNCHDECK_PHASES);
    assert.equal(path.dirname(fixture.configPath), fixture.projectRoot);
    assert.equal(fixture.configPath.startsWith(fixture.sourceRoot), false);
    assert.equal(fixture.homeDir.startsWith(fixture.sourceRoot), false);
    assert.match(fs.readFileSync(fixture.configPath, 'utf8'), /poetry run python -m inventory_api/);
    assert.equal(fs.existsSync(path.join(fixture.sourceRoot, '.launchdeck.yml')), false);
  } finally {
    const cleanup = fixture.cleanup();
    assert.equal(cleanup.ok, true);
    assert.equal(cleanup.sourceUnchanged, true);
  }
});

test('FastAPI Launchdeck lifecycle returns explicit contract-only phases without mutating source', () => {
  const receipt = runFastApiLaunchdeckLifecycle({ execute: false });

  assert.equal(receipt.sampleId, FASTAPI_ID);
  assert.deepEqual(Object.keys(receipt.phases), FASTAPI_LAUNCHDECK_PHASES);
  assert.equal(receipt.phases.doctor.status, 'contract-only');
  assert.equal(receipt.phases.cleanup.status, 'passed');
  assert.equal(receipt.sourceMutated, false);
  assert.equal(receipt.cleanup.sourceUnchanged, true);
});
