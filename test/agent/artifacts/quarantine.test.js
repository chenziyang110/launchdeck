import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createInstallerPayloadManifest } from '../../../src/agent/artifacts/manifest.js';
import { createArtifactStore } from '../../../src/agent/artifacts/store.js';
import {
  createIsolatedArtifactFixture,
  FIXTURE_BUILD_IDENTITY
} from '../../fixtures/agent-artifacts/isolated-artifact-fixture.js';

test('digest mismatch in staged payload is quarantined and never published or activated', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'quarantine-staged');
  const manifest = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  fs.appendFileSync(
    path.join(fixture.payloadRoot, 'runtime', 'launchdeck-mcp.mjs'),
    'export const stagedTamper = true;\n',
    'utf8'
  );
  const store = createArtifactStore({
    env: fixture.env,
    randomId: () => 'staged-mismatch'
  });

  assert.throws(
    () => store.install({
      operationId: 'op_0123456789abcdef',
      payloadRoot: fixture.payloadRoot,
      manifest
    }),
    { code: 'agent_artifact_integrity_failed' }
  );
  const observation = store.inspect(FIXTURE_BUILD_IDENTITY);
  assert.equal(observation.state, 'absent');
  assert.equal(observation.activationAllowed, false);
  const quarantine = store.listQuarantine();
  assert.equal(quarantine.length, 1);
  assert.equal(quarantine[0].buildIdentity, FIXTURE_BUILD_IDENTITY);
  assert.equal(quarantine[0].reason, 'payload-digest-mismatch');
  assert.equal(path.relative(fixture.launchdeckHome, quarantine[0].path).startsWith('..'), false);
});

test('corruption at a verified immutable path is moved to quarantine and cannot fall back to latest', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'quarantine-installed');
  const manifest = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  const store = createArtifactStore({ env: fixture.env });
  const installed = store.install({
    operationId: 'op_0123456789abcdef',
    payloadRoot: fixture.payloadRoot,
    manifest
  });
  fs.appendFileSync(
    path.join(installed.artifactPath, 'runtime', 'launchdeck-mcp.mjs'),
    'export const installedTamper = true;\n',
    'utf8'
  );

  const corrupt = store.inspect(FIXTURE_BUILD_IDENTITY);
  assert.equal(corrupt.state, 'corrupt');
  assert.equal(corrupt.activationAllowed, false);
  assert.equal(corrupt.code, 'agent_artifact_digest_mismatch');

  const quarantined = store.quarantine(FIXTURE_BUILD_IDENTITY, {
    operationId: 'op_fedcba9876543210',
    reason: 'verified-path-corruption'
  });
  assert.equal(quarantined.state, 'quarantined');
  assert.equal(quarantined.activationAllowed, false);
  assert.equal(fs.existsSync(installed.artifactPath), false);
  assert.equal(fs.existsSync(quarantined.path), true);
  assert.equal(store.resolveForActivation(FIXTURE_BUILD_IDENTITY), null);
});

test('rejected staged symlink records bounded quarantine metadata without following the link', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'quarantine-symlink');
  const manifest = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  const outside = path.join(fixture.root, 'outside-secret.txt');
  const link = path.join(fixture.payloadRoot, 'runtime', 'linked-secret.txt');
  fs.writeFileSync(outside, 'must-not-be-copied\n', 'utf8');
  try {
    fs.symlinkSync(outside, link, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip(`Symlink creation is unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const store = createArtifactStore({ env: fixture.env });

  const error = assert.throws(
    () => store.install({
      operationId: 'op_0123456789abcdef',
      payloadRoot: fixture.payloadRoot,
      manifest
    }),
    { code: 'agent_artifact_integrity_failed' }
  );
  assert.equal(error.details.sourceIntegrityCode, 'agent_payload_symlink_unsupported');
  assert.equal(fs.existsSync(error.details.quarantinePath), true);
  const entries = store.listQuarantine();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].reason, 'payload-symlink-unsupported');
  assert.equal(entries[0].contentRetained, false);
  assert.deepEqual(entries[0].mismatches, [{
    path: 'runtime/linked-secret.txt',
    reason: 'symlink-unsupported'
  }]);
  assert.deepEqual(
    fs.readdirSync(error.details.quarantinePath),
    ['quarantine.json']
  );
});
