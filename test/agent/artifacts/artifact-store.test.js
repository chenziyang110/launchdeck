import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createInstallerPayloadManifest } from '../../../src/agent/artifacts/manifest.js';
import {
  artifactPathForBuild,
  createArtifactStore
} from '../../../src/agent/artifacts/store.js';
import {
  createIsolatedArtifactFixture,
  FIXTURE_BUILD_IDENTITY
} from '../../fixtures/agent-artifacts/isolated-artifact-fixture.js';

test('verified payload publishes atomically to the immutable sha256 path and identical reinstall is a no-op', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'store-install');
  const manifest = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  const store = createArtifactStore({
    env: fixture.env,
    randomId: () => 'fixture-transaction'
  });

  const installed = store.install({
    operationId: 'op_0123456789abcdef',
    payloadRoot: fixture.payloadRoot,
    manifest
  });
  const expectedPath = path.join(
    fixture.launchdeckHome,
    'installer',
    'artifacts',
    'v1',
    'sha256',
    'b'.repeat(64)
  );

  assert.equal(installed.status, 'installed');
  assert.equal(installed.state, 'verified');
  assert.equal(installed.buildIdentity, FIXTURE_BUILD_IDENTITY);
  assert.equal(installed.artifactPath, expectedPath);
  assert.equal(artifactPathForBuild(FIXTURE_BUILD_IDENTITY, fixture.env), expectedPath);
  assert.equal(fs.existsSync(path.join(expectedPath, 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(expectedPath, 'runtime', 'launchdeck-mcp.mjs')), true);
  assert.equal(Object.isFrozen(installed), true);
  assert.equal(listTemporaryEntries(fixture.launchdeckHome).length, 0);

  const before = treeSnapshot(expectedPath);
  const repeated = store.install({
    operationId: 'op_0123456789abcdef',
    payloadRoot: fixture.payloadRoot,
    manifest
  });
  assert.equal(repeated.status, 'noop');
  assert.equal(repeated.artifactPath, expectedPath);
  assert.deepEqual(treeSnapshot(expectedPath), before, 'verified bytes never change in place');
});

test('artifact paths accept only logical sha256 identity and cannot resolve outside the store', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'store-paths');

  for (const invalid of [
    'latest',
    '../outside',
    `sha256:${'B'.repeat(64)}`,
    `sha256:${'a'.repeat(63)}`,
    `sha512:${'a'.repeat(64)}`
  ]) {
    assert.throws(
      () => artifactPathForBuild(invalid, fixture.env),
      { code: 'agent_build_identity_invalid' },
      invalid
    );
  }
  assert.equal(fs.readdirSync(fixture.launchdeckHome).length, 0);
});

test('different bytes cannot replace an already verified build identity', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'store-immutable');
  const manifest = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  const store = createArtifactStore({ env: fixture.env });
  const first = store.install({
    operationId: 'op_0123456789abcdef',
    payloadRoot: fixture.payloadRoot,
    manifest
  });
  const before = treeSnapshot(first.artifactPath);
  fs.appendFileSync(
    path.join(fixture.payloadRoot, 'runtime', 'launchdeck-mcp.mjs'),
    'export const changedSource = true;\n',
    'utf8'
  );

  assert.throws(
    () => store.install({
      operationId: 'op_fedcba9876543210',
      payloadRoot: fixture.payloadRoot,
      manifest
    }),
    { code: 'agent_artifact_integrity_failed' }
  );
  assert.deepEqual(treeSnapshot(first.artifactPath), before);
});

test('a different valid manifest cannot reuse an already verified build identity', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'store-identity-collision');
  const firstManifest = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  const store = createArtifactStore({ env: fixture.env });
  store.install({
    operationId: 'op_0123456789abcdef',
    payloadRoot: fixture.payloadRoot,
    manifest: firstManifest
  });

  fs.appendFileSync(
    path.join(fixture.payloadRoot, 'launcher', 'launcher.js'),
    'export const secondValidLauncher = true;\n',
    'utf8'
  );
  const secondManifest = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  assert.notDeepEqual(secondManifest, firstManifest);
  assert.equal(secondManifest.buildIdentity, firstManifest.buildIdentity);

  assert.throws(
    () => store.install({
      operationId: 'op_fedcba9876543210',
      payloadRoot: fixture.payloadRoot,
      manifest: secondManifest
    }),
    { code: 'agent_artifact_identity_collision' }
  );
});

test('artifact publication rejects a linked intermediate store root', (t) => {
  const fixture = createIsolatedArtifactFixture(t, 'store-root-link');
  const manifest = createInstallerPayloadManifest({
    payloadRoot: fixture.payloadRoot,
    compatibilityManifest: fixture.compatibilityManifest
  });
  const externalRoot = path.join(fixture.root, 'external-artifacts');
  const linkedRoot = path.join(
    fixture.launchdeckHome,
    'installer',
    'artifacts',
    'v1',
    'sha256'
  );
  fs.mkdirSync(externalRoot, { recursive: true });
  fs.mkdirSync(path.dirname(linkedRoot), { recursive: true });
  try {
    fs.symlinkSync(
      externalRoot,
      linkedRoot,
      process.platform === 'win32' ? 'junction' : 'dir'
    );
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip(`Directory link creation is unavailable: ${error.code}`);
      return;
    }
    throw error;
  }

  const store = createArtifactStore({ env: fixture.env });
  assert.throws(
    () => store.install({
      operationId: 'op_0123456789abcdef',
      payloadRoot: fixture.payloadRoot,
      manifest
    }),
    { code: 'agent_artifact_path_escape' }
  );
  assert.deepEqual(fs.readdirSync(externalRoot), []);
});

function treeSnapshot(root) {
  return fs.readdirSync(root, { recursive: true })
    .map((entry) => String(entry))
    .sort()
    .map((entry) => {
      const absolute = path.join(root, entry);
      const stat = fs.statSync(absolute);
      return stat.isDirectory()
        ? { path: entry.replaceAll('\\', '/'), kind: 'directory' }
        : {
            path: entry.replaceAll('\\', '/'),
            kind: 'file',
            bytes: stat.size,
            content: fs.readFileSync(absolute).toString('base64')
          };
    });
}

function listTemporaryEntries(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => /\.tmp(?:[\\/]|$)/.test(entry) || entry.includes('fixture-transaction'));
}
