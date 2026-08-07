import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  FASTAPI_ID,
  FASTAPI_NATIVE_LIMITS,
  FASTAPI_NATIVE_PHASES,
  getFastApiNativeContract,
  getPoetryAvailability,
  repositoryRoot,
  runFastApiNativeLifecycle
} from './fixtures/gallery-fastapi-native.js';

test('FastAPI native lifecycle contract is catalog-derived and externally isolated', () => {
  const contract = getFastApiNativeContract();

  assert.equal(contract.id, FASTAPI_ID);
  assert.equal(contract.stack, 'FastAPI');
  assert.equal(contract.sourcePath, 'examples/sample-projects/fastapi-inventory');
  assert.equal(contract.defaultPort, 8104);
  assert.deepEqual(contract.requiredPhases, FASTAPI_NATIVE_PHASES);
  assert.equal(contract.commands.install.at(0), 'poetry');
  assert.deepEqual(contract.commands.install.slice(1), [
    'install', '--no-interaction', '--no-ansi', '--sync'
  ]);
  assert.deepEqual(contract.commands.test, ['poetry', 'run', 'pytest']);
  assert.deepEqual(contract.commands.start, [
    'poetry', 'run', 'python', '-m', 'inventory_api'
  ]);
  assert.deepEqual(contract.health.expected, {
    status: 'ok',
    service: FASTAPI_ID,
    database: 'sqlite',
    seededItems: 3
  });
  assert.equal(contract.build.status, 'not-applicable');
  assert.ok(contract.isolation.externalFixture.includes('sibling'));
  assert.ok(Number.isFinite(FASTAPI_NATIVE_LIMITS.healthTimeoutMs));
  assert.ok(Number.isFinite(FASTAPI_NATIVE_LIMITS.healthAttempts));

  const sourceRoot = path.resolve(repositoryRoot, contract.sourcePath);
  assert.equal(fs.existsSync(sourceRoot), true);
  assert.equal(path.basename(sourceRoot), FASTAPI_ID);
});

const poetry = getPoetryAvailability();

test('FastAPI native install/test/seed/start/health/stop/cleanup lifecycle', {
  skip: poetry.available ? false : `Native prerequisite unavailable: ${poetry.reason}`
}, async () => {
  const receipt = await runFastApiNativeLifecycle();

  assert.equal(receipt.sampleId, FASTAPI_ID);
  assert.equal(receipt.phases.install.status, 'passed');
  assert.equal(receipt.phases.test.status, 'passed');
  assert.equal(receipt.phases.seed.status, 'passed');
  assert.equal(receipt.phases.seed.seededItems.count, 3);
  assert.equal(receipt.phases.start.status, 'passed');
  assert.equal(receipt.phases.health.status, 'passed');
  assert.equal(receipt.phases.health.response.statusCode, 200);
  assert.deepEqual(receipt.phases.health.response.body, {
    status: 'ok',
    service: FASTAPI_ID,
    database: 'sqlite',
    seededItems: 3
  });
  assert.equal(receipt.phases.stop.status, 'passed');
  assert.equal(receipt.phases.stop.processExited, true);
  assert.equal(receipt.phases.stop.portReleased, true);
  assert.equal(receipt.cleanup.ok, true);
  assert.equal(receipt.cleanup.sourceUnchanged, true);
  assert.deepEqual(receipt.cleanup.residueAfter, []);
  assert.equal(receipt.isolation.sourceMutated, false);
});
