import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createInstallerPayloadManifest
} from '../../src/agent/artifacts/manifest.js';
import { digestCanonical } from '../../src/agent/digests.js';
import {
  expectedInstallerPackageFiles,
  validateInstallerPackageInventory
} from '../../src/agent/artifacts/payload.js';
import {
  createIsolatedArtifactFixture
} from '../fixtures/agent-artifacts/isolated-artifact-fixture.js';

const packageJson = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);
const compatibilityManifest = JSON.parse(
  fs.readFileSync(
    new URL('../../agent/compatibility-manifest.json', import.meta.url),
    'utf8'
  )
);

test('npm files allowlist explicitly publishes the expanded installer payload', (t) => {
  createIsolatedArtifactFixture(t, 'package-allowlist');

  assert.equal(packageJson.files.includes('agent/installer-payload/'), true);
  assert.equal(packageJson.files.includes('.launchdeck/'), false);
  assert.equal(packageJson.files.some((entry) => entry.endsWith('.tgz')), false);
  assert.match(
    compatibilityManifest.componentDigests.stableLaunchers,
    /^sha256:[0-9a-f]{64}$/
  );
});

test('expected npm inventory is derived from the signed payload manifest, not a worktree walk', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'package-inventory');
  const manifest = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  const expected = expectedInstallerPackageFiles(manifest);

  assert.deepEqual(expected, [
    'package/agent/installer-payload/manifest.json',
    ...manifest.files.map((entry) => `package/agent/installer-payload/${entry.path}`)
  ].sort());
  assert.equal(Object.isFrozen(expected), true);

  assert.deepEqual(validateInstallerPackageInventory({
    source: 'npm-pack-json',
    packageFiles: expected,
    manifest
  }), {
    ok: true,
    missing: [],
    forbidden: [],
    unexpectedPayloadFiles: []
  });
  assert.throws(
    () => validateInstallerPackageInventory({
      source: 'filesystem-walk',
      packageFiles: expected,
      manifest
    }),
    { code: 'agent_package_inventory_source_invalid' }
  );
});

test('checked-in payload manifest stays canonical with a live rebuild from installer-payload bytes', () => {
  const checkedInManifest = JSON.parse(
    fs.readFileSync(new URL('../../agent/installer-payload/manifest.json', import.meta.url), 'utf8')
  );
  const bundledCompatibility = JSON.parse(
    fs.readFileSync(new URL('../../agent/installer-payload/compatibility.json', import.meta.url), 'utf8')
  );
  const rebuiltManifest = createInstallerPayloadManifest({
    payloadRoot: path.resolve('agent/installer-payload'),
    compatibilityManifest
  });

  assert.deepEqual(bundledCompatibility, compatibilityManifest);
  assert.equal(
    checkedInManifest.files.some((entry) => entry.path === 'compatibility.json'),
    true
  );
  assert.equal(
    digestCanonical(checkedInManifest),
    digestCanonical(rebuiltManifest)
  );
});

test('npm inventory rejects missing payload bytes, archives, caches, secrets, and Launchdeck runtime state', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'package-forbidden');
  const manifest = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  const expected = expectedInstallerPackageFiles(manifest);
  const packageFiles = expected
    .filter((entry) => !entry.endsWith('runtime/launchdeck-mcp.mjs'))
    .concat([
      'package/agent/installer-payload.tgz',
      'package/.npm/_cacache/index-v5/fixture',
      'package/.env',
      'package/.launchdeck/runtime/state.json',
      'package/agent/installer-payload/runtime/undeclared.mjs'
    ]);
  const validation = validateInstallerPackageInventory({
    source: 'npm-pack-json',
    packageFiles,
    manifest
  });

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.missing, [
    'package/agent/installer-payload/runtime/launchdeck-mcp.mjs'
  ]);
  assert.deepEqual([...validation.forbidden].sort(), [
    'package/.env',
    'package/.launchdeck/runtime/state.json',
    'package/.npm/_cacache/index-v5/fixture',
    'package/agent/installer-payload.tgz'
  ]);
  assert.deepEqual(validation.unexpectedPayloadFiles, [
    'package/agent/installer-payload/runtime/undeclared.mjs'
  ]);
});
