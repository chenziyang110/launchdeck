import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  isDirectCliExecution,
  resolveProbeInvocation,
  resolveProbeInvocations,
  runProbeInvocations
} from '../../src/cli.js';

test('CLI direct-execution detection resolves an npm symlink before comparing paths', () => {
  const modulePath = '/opt/project/node_modules/launchdeck/src/cli.js';
  const binPath = '/opt/project/node_modules/.bin/launchdeck';

  assert.equal(isDirectCliExecution(`file://${modulePath}`, binPath, {
    platform: 'linux',
    fileURLToPath: (value) => new URL(value).pathname,
    realpathSync(candidate) {
      return candidate === binPath ? modulePath : candidate;
    }
  }), true);
});

test('CLI direct-execution detection does not activate for a different real module', () => {
  const modulePath = '/opt/project/node_modules/launchdeck/src/cli.js';
  const otherPath = '/opt/project/bin/other.js';

  assert.equal(isDirectCliExecution(`file://${modulePath}`, otherPath, {
    platform: 'linux',
    fileURLToPath: (value) => new URL(value).pathname,
    realpathSync: (candidate) => candidate
  }), false);
});

test('Windows probes prefer a later native executable over an earlier npm shim', () => {
  const npmDirectory = 'C:\\Users\\agent\\AppData\\Roaming\\npm';
  const nativeDirectory = 'C:\\Program Files\\Codex\\resources';
  const existing = new Set([
    path.win32.join(npmDirectory, 'codex'),
    path.win32.join(npmDirectory, 'codex.cmd'),
    path.win32.join(nativeDirectory, 'codex'),
    path.win32.join(nativeDirectory, 'codex.exe')
  ].map((candidate) => candidate.toLowerCase()));

  const invocation = resolveProbeInvocation('codex', ['--version'], {
    platform: 'win32',
    env: {
      PATH: `${npmDirectory};${nativeDirectory}`,
      ComSpec: 'C:\\Windows\\System32\\cmd.exe'
    },
    existsSync: (candidate) => existing.has(candidate.toLowerCase())
  });

  assert.equal(invocation.command, path.win32.join(nativeDirectory, 'codex.exe'));
  assert.deepEqual(invocation.args, ['--version']);
  assert.equal(invocation.shell, false);
});

test('Windows probes use an explicit command processor only when no native executable exists', () => {
  const npmDirectory = 'C:\\Users\\agent\\AppData\\Roaming\\npm';
  const shim = path.win32.join(npmDirectory, 'claude.cmd');
  const invocation = resolveProbeInvocation('claude', ['mcp', 'list', '--json'], {
    platform: 'win32',
    env: {
      PATH: npmDirectory,
      ComSpec: 'C:\\Windows\\System32\\cmd.exe'
    },
    existsSync: (candidate) => candidate.toLowerCase() === shim.toLowerCase()
  });

  assert.equal(invocation.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(invocation.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.match(invocation.args[3], /claude\.cmd/i);
  assert.match(invocation.args[3], /mcp list --json$/);
  assert.equal(invocation.shell, false);
});

test('Windows probes retry a command shim when the preferred native binary cannot be spawned', () => {
  const npmDirectory = 'C:\\Users\\agent\\AppData\\Roaming\\npm';
  const nativeDirectory = 'C:\\Program Files\\WindowsApps\\Codex\\resources';
  const existing = new Set([
    path.win32.join(npmDirectory, 'codex.cmd'),
    path.win32.join(nativeDirectory, 'codex.exe')
  ].map((candidate) => candidate.toLowerCase()));
  const invocations = resolveProbeInvocations('codex', ['--version'], {
    platform: 'win32',
    env: {
      PATH: `${npmDirectory};${nativeDirectory}`,
      ComSpec: 'C:\\Windows\\System32\\cmd.exe'
    },
    existsSync: (candidate) => existing.has(candidate.toLowerCase())
  });
  const attempted = [];
  const result = runProbeInvocations(invocations, {
    spawnSync(command) {
      attempted.push(command);
      return attempted.length === 1
        ? { status: null, error: Object.assign(new Error('blocked'), { code: 'EPERM' }) }
        : { status: 0, stdout: 'codex-cli 0.145.0\n', stderr: '' };
    }
  });

  assert.equal(invocations.length, 2);
  assert.equal(attempted.length, 2);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'codex-cli 0.145.0\n');
});
