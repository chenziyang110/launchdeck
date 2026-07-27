import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createInstallerPayloadManifest,
  verifyInstallerPayload
} from '../../../src/agent/artifacts/manifest.js';
import { listInstallerPayloadFiles } from '../../../src/agent/artifacts/payload.js';
import {
  createIsolatedArtifactFixture,
  FIXTURE_BUILD_IDENTITY
} from '../../fixtures/agent-artifacts/isolated-artifact-fixture.js';
import { computeBuildIdentity } from '../../../src/kernel/compatibility.js';
import { installerLauncherDigest } from '../../../scripts/build-agent-plugins.js';

const EXPECTED_FILES = [
  'launcher/launchdeck-mcp',
  'launcher/launchdeck-mcp.cmd',
  'launcher/launcher.js',
  'runtime/launchdeck-mcp.mjs',
  'skill/launchdeck-agent/SKILL.md',
  'skill/launchdeck-agent/references/operations.md'
];

test('expanded payload manifest has deterministic sorted inventory and one compatibility build identity', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'manifest');
  const first = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  const second = createInstallerPayloadManifest({
    compatibilityManifest: { ...fixture.compatibilityManifest },
    payloadRoot: fixture.payloadRoot
  });

  assert.equal(first.manifestVersion, 1);
  assert.equal(first.buildIdentity, FIXTURE_BUILD_IDENTITY);
  assert.equal(first.packageVersion, '0.1.0');
  assert.equal(first.nodeRange, '>=20');
  assert.deepEqual(first.files.map((entry) => entry.path), EXPECTED_FILES);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.files), true);

  for (const entry of first.files) {
    assert.match(entry.sha256, /^sha256:[0-9a-f]{64}$/);
    assert.equal(entry.bytes, fs.statSync(path.join(fixture.payloadRoot, ...entry.path.split('/'))).size);
    assert.equal(Object.isFrozen(entry), true);
  }
  assert.deepEqual(listInstallerPayloadFiles(fixture.payloadRoot), EXPECTED_FILES);
});

test('payload verification rejects changed, missing, extra, symlinked, and archive content', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'payload-verification');
  const manifest = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  assert.deepEqual(verifyInstallerPayload({
    payloadRoot: fixture.payloadRoot,
    manifest
  }), {
    ok: true,
    buildIdentity: FIXTURE_BUILD_IDENTITY,
    fileCount: EXPECTED_FILES.length,
    mismatches: []
  });

  const runtimePath = path.join(fixture.payloadRoot, 'runtime', 'launchdeck-mcp.mjs');
  fs.appendFileSync(runtimePath, 'export const tampered = true;\n', 'utf8');
  const changed = verifyInstallerPayload({ payloadRoot: fixture.payloadRoot, manifest });
  assert.equal(changed.ok, false);
  assert.equal(changed.code, 'agent_payload_digest_mismatch');
  assert.deepEqual(changed.mismatches.map((entry) => entry.path), ['runtime/launchdeck-mcp.mjs']);
  assert.equal(changed.mismatches[0].reason, 'digest-mismatch');

  fs.rmSync(runtimePath);
  const missing = verifyInstallerPayload({ payloadRoot: fixture.payloadRoot, manifest });
  assert.equal(missing.ok, false);
  assert.equal(missing.mismatches.some((entry) =>
    entry.path === 'runtime/launchdeck-mcp.mjs' && entry.reason === 'missing'
  ), true);

  fs.writeFileSync(path.join(fixture.payloadRoot, 'payload.tgz'), 'not-an-install-input', 'utf8');
  const extraArchive = verifyInstallerPayload({ payloadRoot: fixture.payloadRoot, manifest });
  assert.equal(extraArchive.ok, false);
  assert.equal(extraArchive.mismatches.some((entry) =>
    entry.path === 'payload.tgz' && entry.reason === 'undeclared'
  ), true);
});

test('payload inventory rejects path escape and symbolic links instead of following them', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'payload-boundary');
  const outside = path.join(fixture.root, 'outside-runtime.mjs');
  fs.writeFileSync(outside, 'export const outside = true;\n', 'utf8');
  const link = path.join(fixture.payloadRoot, 'runtime', 'linked-runtime.mjs');

  try {
    fs.symlinkSync(outside, link, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip(`Symlink creation is unavailable on this fixture host: ${error.code}`);
      return;
    }
    throw error;
  }

  assert.throws(
    () => listInstallerPayloadFiles(fixture.payloadRoot),
    { code: 'agent_payload_symlink_unsupported' }
  );
});

test('changing any stable launcher byte changes the published build identity input', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'launcher-build-identity');
  const firstLauncherDigest = installerLauncherDigest(fixture.payloadRoot);
  const firstIdentity = computeBuildIdentity({
    manifestVersion: 1,
    packageVersion: '0.1.0',
    componentDigests: {
      stableLaunchers: firstLauncherDigest
    }
  });

  fs.appendFileSync(
    path.join(fixture.payloadRoot, 'launcher', 'launchdeck-mcp.cmd'),
    '\r\n@rem changed launcher byte\r\n',
    'utf8'
  );
  const secondLauncherDigest = installerLauncherDigest(fixture.payloadRoot);
  const secondIdentity = computeBuildIdentity({
    manifestVersion: 1,
    packageVersion: '0.1.0',
    componentDigests: {
      stableLaunchers: secondLauncherDigest
    }
  });

  assert.notEqual(secondLauncherDigest, firstLauncherDigest);
  assert.notEqual(secondIdentity, firstIdentity);
});
