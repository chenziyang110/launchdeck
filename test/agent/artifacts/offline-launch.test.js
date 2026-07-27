import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  createPinnedLauncherInvocation,
  launcherPaths
} from '../../../src/agent/artifacts/launcher.js';
import {
  createLauncherFixture,
  CURRENT_BUILD
} from '../../fixtures/agent-launcher/launcher-fixture.js';

test('installed launcher starts the pinned runtime offline after the npx-like installer parent exits', (t) => {
  const fixture = createLauncherFixture(t, 'offline-parent-exit');
  fixture.publishBuild(CURRENT_BUILD);
  const launcherModuleUrl = pathToFileURL(
    path.resolve('src/agent/artifacts/launcher.js')
  ).href;

  const parentOutput = execFileSync(process.execPath, [
    fixture.bootstrapScript,
    launcherModuleUrl,
    fixture.launchdeckHome,
    CURRENT_BUILD
  ], {
    cwd: process.cwd(),
    env: fixture.env,
    encoding: 'utf8'
  });
  const installedByParent = JSON.parse(parentOutput);
  const stable = launcherPaths(fixture.env);
  assert.deepEqual(installedByParent, stable);

  fs.rmSync(fixture.acquisitionRoot, { recursive: true, force: true });
  assert.equal(fs.existsSync(fixture.acquisitionRoot), false);

  const launcherSource = fs.readFileSync(stable.node, 'utf8');
  assert.doesNotMatch(launcherSource, /\bnpx\b|@latest|npm(?:-cache)?|node_modules/i);
  assert.doesNotMatch(
    launcherSource,
    new RegExp(escapeRegExp(fixture.acquisitionRoot), 'i')
  );

  const runtimeArgs = [
    'path with spaces/空 格',
    'quote"inside',
    'ampersand&caret^pipe|',
    '--literal'
  ];
  const invocation = createPinnedLauncherInvocation({
    env: fixture.env,
    platform: process.platform,
    buildIdentity: CURRENT_BUILD,
    runtimeArgs
  });
  const output = execFileSync(invocation.command, invocation.args, {
    cwd: fixture.root,
    env: {
      LAUNCHDECK_HOME: fixture.launchdeckHome,
      LAUNCHDECK_NODE: process.execPath,
      PATH: '',
      SystemRoot: process.env.SystemRoot ?? '',
      ComSpec: process.env.ComSpec ?? ''
    },
    encoding: 'utf8',
    windowsHide: true,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments === true
  });
  const observed = JSON.parse(output);

  assert.deepEqual(observed.args, runtimeArgs);
  assert.equal(observed.buildIdentity, CURRENT_BUILD);
  if (process.platform === 'win32') {
    assert.equal(invocation.transport, 'cmd-base64url');
    t.diagnostic('POSIX wrapper evidence is blocked on Windows and must be supplied by the POSIX platform lane.');
  } else {
    assert.equal(invocation.command, stable.posix);
    assert.equal(invocation.transport, 'posix-argv');
    t.diagnostic('Windows cmd wrapper evidence is blocked on this OS and must be supplied by the Windows platform lane.');
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
