import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createLauncherVerificationCache,
  createPinnedLauncherInvocation,
  installStableLauncher,
  launcherPaths,
  resolvePinnedRuntime
} from '../../../src/agent/artifacts/launcher.js';
import {
  createLauncherFixture,
  CURRENT_BUILD,
  PREVIOUS_BUILD
} from '../../fixtures/agent-launcher/launcher-fixture.js';

test('stable launcher paths are absolute, Launchdeck-owned, and preserve argument boundaries on POSIX and Windows', async (t) => {
  const fixture = createLauncherFixture(t, 'stable-paths');
  fixture.publishBuild(CURRENT_BUILD);
  const installed = await installStableLauncher({
    env: fixture.env,
    buildIdentity: CURRENT_BUILD
  });
  const paths = launcherPaths(fixture.env);
  const trickyArgs = [
    'path with spaces/空 格',
    'quote"inside',
    'ampersand&caret^pipe|',
    '--looks-like-an-option'
  ];

  assert.deepEqual(installed, paths);
  for (const launcherPath of [paths.posix, paths.windows, paths.node]) {
    assert.equal(path.isAbsolute(launcherPath), true);
    assert.equal(isContained(paths.root, launcherPath), true);
    assert.equal(fs.existsSync(launcherPath), true);
  }
  if (process.platform !== 'win32') {
    assert.notEqual(fs.statSync(paths.posix).mode & 0o111, 0);
  }

  for (const platform of ['linux', 'darwin', 'win32']) {
    const invocationEnv = platform === 'win32'
      ? {
          ...fixture.env,
          ComSpec: 'C:\\Windows\\System32\\cmd.exe'
        }
      : fixture.env;
    const invocation = createPinnedLauncherInvocation({
      env: invocationEnv,
      platform,
      buildIdentity: CURRENT_BUILD,
      runtimeArgs: trickyArgs
    });
    if (platform === 'win32') {
      assert.equal(invocation.command, invocationEnv.ComSpec);
      assert.deepEqual(invocation.args.slice(0, 3), ['/d', '/s', '/c']);
      assert.equal(invocation.args[3].length < 8_000, true);
      assert.match(invocation.args[3], /^call "[^"]+" [A-Za-z0-9_-]+$/);
      const encoded = invocation.args[3].match(/ ([A-Za-z0-9_-]+)$/)?.[1];
      assert.ok(encoded);
      assert.deepEqual(
        JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
        {
          buildIdentity: CURRENT_BUILD,
          runtimeArgs: trickyArgs
        }
      );
      assert.equal(invocation.transport, 'cmd-base64url');
      assert.equal(invocation.windowsVerbatimArguments, true);
    } else {
      assert.equal(invocation.command, paths.posix);
      assert.deepEqual(invocation.args, [
        '--build',
        CURRENT_BUILD,
        '--',
        ...trickyArgs
      ]);
      assert.equal(invocation.transport, 'posix-argv');
    }
    assert.equal(invocation.shell, false);
    assert.equal(Object.isFrozen(invocation.args), true);
    assert.equal(Object.isFrozen(invocation), true);
  }

  const installedText = [
    fs.readFileSync(paths.posix, 'utf8'),
    fs.readFileSync(paths.windows, 'utf8'),
    fs.readFileSync(paths.node, 'utf8')
  ].join('\n');
  assert.doesNotMatch(installedText, /\bnpx\b|@latest|node_modules[\\/]\\.cache/i);
  assert.doesNotMatch(installedText, new RegExp(escapeRegExp(fixture.acquisitionRoot), 'i'));
});

test('Windows launcher invocation rejects encoded requests that exceed the cmd.exe command budget', () => {
  const env = {
    LAUNCHDECK_HOME: 'C:\\Launchdeck Home 空 格',
    ComSpec: 'C:\\Windows\\System32\\cmd.exe'
  };
  const accepted = createPinnedLauncherInvocation({
    env,
    platform: 'win32',
    buildIdentity: CURRENT_BUILD,
    runtimeArgs: ['x'.repeat(5_500)]
  });
  assert.equal(accepted.transport, 'cmd-base64url');
  assert.equal(accepted.args[3].length < 8_000, true);

  assert.throws(
    () => createPinnedLauncherInvocation({
      env,
      platform: 'win32',
      buildIdentity: CURRENT_BUILD,
      runtimeArgs: ['x'.repeat(6_000)]
    }),
    {
      code: 'agent_launcher_arguments_invalid'
    }
  );
});

test('stable launcher installation is digest-bound to one verified immutable build', async (t) => {
  const fixture = createLauncherFixture(t, 'launcher-provenance');
  const buildPath = fixture.publishBuild(CURRENT_BUILD);
  fs.appendFileSync(
    path.join(buildPath, 'launcher', 'launcher.js'),
    '\n// changed after artifact publication\n',
    'utf8'
  );

  await assert.rejects(
    async () => installStableLauncher({
      env: fixture.env,
      buildIdentity: CURRENT_BUILD
    }),
    { code: 'agent_launcher_digest_mismatch' }
  );
  assert.equal(fs.existsSync(launcherPaths(fixture.env).node), false);
});

test('launcher resolves only the exact logical build and never falls back to latest, global PATH, or another installed build', (t) => {
  const fixture = createLauncherFixture(t, 'exact-build');
  fixture.publishBuild(PREVIOUS_BUILD);

  for (const invalid of [
    'latest',
    '../outside',
    `sha256:${'A'.repeat(64)}`,
    `sha256:${'a'.repeat(63)}`,
    `sha512:${'a'.repeat(64)}`
  ]) {
    assert.throws(
      () => resolvePinnedRuntime({
        env: {
          ...fixture.env,
          PATH: path.join(fixture.root, 'fake-global-bin')
        },
        buildIdentity: invalid
      }),
      { code: 'agent_build_identity_invalid' },
      invalid
    );
  }

  assert.throws(
    () => resolvePinnedRuntime({
      env: {
        ...fixture.env,
        PATH: path.join(fixture.root, 'fake-global-bin')
      },
      buildIdentity: CURRENT_BUILD
    }),
    { code: 'agent_launcher_build_missing' }
  );
});

test('launcher verifies manifest and runtime digests and uses a cache scoped to exact immutable metadata', (t) => {
  const fixture = createLauncherFixture(t, 'digest-cache');
  const currentPath = fixture.publishBuild(CURRENT_BUILD);
  fixture.publishBuild(PREVIOUS_BUILD);
  const cache = createLauncherVerificationCache();

  const verified = resolvePinnedRuntime({
    env: fixture.env,
    buildIdentity: CURRENT_BUILD,
    cache
  });
  const cached = resolvePinnedRuntime({
    env: fixture.env,
    buildIdentity: CURRENT_BUILD,
    cache
  });
  const otherBuild = resolvePinnedRuntime({
    env: fixture.env,
    buildIdentity: PREVIOUS_BUILD,
    cache
  });

  assert.equal(verified.verification, 'verified');
  assert.equal(cached.verification, 'cache-hit');
  assert.equal(cached.runtimePath, verified.runtimePath);
  assert.equal(otherBuild.verification, 'verified', 'cache entries never cross build identities');
  assert.equal(otherBuild.buildIdentity, PREVIOUS_BUILD);

  fs.writeFileSync(
    path.join(currentPath, 'runtime', 'launchdeck-mcp.mjs'),
    'process.stdout.write("tampered runtime");\n',
    'utf8'
  );
  assert.throws(
    () => resolvePinnedRuntime({
      env: fixture.env,
      buildIdentity: CURRENT_BUILD,
      cache
    }),
    { code: 'agent_launcher_digest_mismatch' }
  );
});

test('launcher rejects a canonical-looking artifact path whose real bytes escape the artifact root', (t) => {
  const fixture = createLauncherFixture(t, 'containment');
  fixture.publishBuild(CURRENT_BUILD);
  const escaped = fixture.replaceBuildWithEscapeLink(CURRENT_BUILD);

  assert.equal(isContained(path.dirname(escaped.canonical), escaped.canonical), true);
  assert.equal(isContained(path.dirname(escaped.canonical), fs.realpathSync(escaped.canonical)), false);
  assert.throws(
    () => resolvePinnedRuntime({
      env: fixture.env,
      buildIdentity: CURRENT_BUILD
    }),
    { code: 'agent_artifact_path_escape' }
  );
});

test('library and self-contained launchers reject a linked intermediate artifact root', (t) => {
  const fixture = createLauncherFixture(t, 'launcher-root-link');
  const externalRoot = path.join(fixture.root, 'external-launch-root');
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
  fixture.publishBuild(CURRENT_BUILD);

  assert.throws(
    () => resolvePinnedRuntime({
      env: fixture.env,
      buildIdentity: CURRENT_BUILD
    }),
    { code: 'agent_artifact_path_escape' }
  );
  const standalone = spawnSync(process.execPath, [
    path.join(fixture.launcherSourceRoot, 'launcher.js'),
    '--build',
    CURRENT_BUILD,
    '--'
  ], {
    env: fixture.env,
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(standalone.status, 1);
  assert.match(standalone.stderr, /agent_launcher_path_escape/);
});

function isContained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
