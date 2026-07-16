import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createControlPlaneFixture } from './helpers/control-plane-fixture.js';
import { createTempProject, removeTempProject } from './helpers/cli-fixture.js';

test('clean --safe refuses path escapes without deleting approved targets', () => {
  const fixture = createControlPlaneFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['dist', '..'],
      risky: []
    });
    fixture.writeFile('dist/value.txt', 'keep');

    const result = fixture.runCliJson(['clean', '--safe']);

    assert.equal(result.status, 1);
    assertFailure(result.json, fixture, 'clean_target_outside_project');
    assertTarget(result.json.targets, '..', {
      status: 'refused',
      refusalCode: 'clean_target_outside_project'
    });
    assert.equal(fs.existsSync(fixture.path('dist', 'value.txt')), true);
    assert.deepEqual(result.json.removed, []);
  } finally {
    fixture.cleanup();
  }
});

test('clean --safe refuses symlink escapes without deleting approved targets', { skip: symlinkSkipReason() }, () => {
  const fixture = createControlPlaneFixture();
  const outsideRoot = createTempProject({ prefix: 'launchdeck-cli-clean-outside-' });

  try {
    writeCleanConfig(fixture, {
      safe: ['dist', 'linked-cache'],
      risky: []
    });
    fixture.writeFile('dist/value.txt', 'keep');
    fs.writeFileSync(path.join(outsideRoot, 'outside.txt'), 'outside');
    fs.symlinkSync(outsideRoot, fixture.path('linked-cache'), symlinkTypeForDirectory());

    const result = fixture.runCliJson(['clean', '--safe']);

    assert.equal(result.status, 1);
    assertFailure(result.json, fixture, 'clean_target_outside_project');
    assertTarget(result.json.targets, 'linked-cache', {
      status: 'refused',
      refusalCode: 'clean_target_outside_project'
    });
    assert.equal(fs.existsSync(fixture.path('dist', 'value.txt')), true);
    assert.equal(fs.existsSync(path.join(outsideRoot, 'outside.txt')), true);
    assert.deepEqual(result.json.removed, []);
  } finally {
    fixture.cleanup();
    removeTempProject(outsideRoot);
  }
});

test('clean --safe refuses project-root targets without deleting approved targets', () => {
  const fixture = createControlPlaneFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['dist', '.'],
      risky: []
    });
    fixture.writeFile('dist/value.txt', 'keep');

    const result = fixture.runCliJson(['clean', '--safe']);

    assert.equal(result.status, 1);
    assertFailure(result.json, fixture, 'clean_target_root');
    assertTarget(result.json.targets, '.', {
      status: 'refused',
      refusalCode: 'clean_target_root'
    });
    assert.equal(fs.existsSync(fixture.path('dist', 'value.txt')), true);
    assert.deepEqual(result.json.removed, []);
  } finally {
    fixture.cleanup();
  }
});

test('clean --safe refuses unknown empty targets without deleting approved targets', () => {
  const fixture = createControlPlaneFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['dist', '  '],
      risky: []
    });
    fixture.writeFile('dist/value.txt', 'keep');

    const result = fixture.runCliJson(['clean', '--safe']);

    assert.equal(result.status, 1);
    assertFailure(result.json, fixture, 'clean_target_empty');
    assert.equal(fs.existsSync(fixture.path('dist', 'value.txt')), true);
    assert.equal(result.json.targets, undefined);
    assert.equal(result.json.removed, undefined);
  } finally {
    fixture.cleanup();
  }
});

test('clean --safe preserves running evidence inside clean targets', () => {
  const fixture = createControlPlaneFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['cache', '.launchdeck/logs'],
      risky: []
    });
    const runningLogPath = fixture.path('.launchdeck', 'logs', 'dev.log');
    fixture.writeFile('cache/value.txt', 'remove');
    fixture.writeFile('.launchdeck/logs/dev.log', 'running evidence');
    fixture.writeFile('.launchdeck/logs/old.log', 'remove');
    writeLocalRuntimeState(fixture, {
      dev: {
        name: 'dev',
        task: 'dev',
        command: 'node scripts/dev.js',
        cwd: fixture.projectRoot,
        status: 'running',
        pid: process.pid,
        logPath: runningLogPath,
        ports: [],
        startedAt: '2026-07-09T00:00:00.000Z',
        lastRefresh: '2026-07-09T00:00:00.000Z'
      }
    });

    const result = fixture.runCliJson(['clean', '--safe']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(fixture.path('cache')), false);
    assert.equal(fs.existsSync(runningLogPath), true);
    assert.equal(fs.readFileSync(runningLogPath, 'utf8'), 'running evidence');
    assert.equal(fs.existsSync(fixture.path('.launchdeck', 'logs', 'old.log')), false);
    assertCleanResult(result.json.removed, '.launchdeck/logs', {
      status: 'partially_removed',
      protectedPath: runningLogPath
    });
  } finally {
    fixture.cleanup();
  }
});

test('clean --safe preserves latest failure evidence inside clean targets', () => {
  const fixture = createControlPlaneFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['cache', '.launchdeck/logs'],
      risky: []
    });
    const failedLogPath = fixture.path('.launchdeck', 'logs', 'dev.failed.log');
    fixture.writeFile('cache/value.txt', 'remove');
    fixture.writeFile('.launchdeck/logs/dev.failed.log', 'failure evidence');
    fixture.writeFile('.launchdeck/logs/old.log', 'remove');
    writeRunIndex(fixture, [
      {
        runId: 'run_failed_latest',
        projectRoot: fixture.projectRoot,
        task: 'dev',
        status: 'failed',
        logPath: failedLogPath
      }
    ]);
    writeEvent(fixture, {
      eventId: 'evt_failed_latest',
      transactionId: 'tx_failed_latest',
      timestamp: '2026-07-09T00:00:00.000Z',
      level: 'error',
      type: 'run.failed',
      status: 'failed',
      projectId: 'project-clean-retention',
      alias: 'clean-retention',
      task: 'dev',
      runId: 'run_failed_latest',
      message: 'Run failed.',
      data: { logPath: failedLogPath },
      next: []
    });

    const result = fixture.runCliJson(['clean', '--safe']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(fixture.path('cache')), false);
    assert.equal(fs.existsSync(failedLogPath), true);
    assert.equal(fs.readFileSync(failedLogPath, 'utf8'), 'failure evidence');
    assert.equal(fs.existsSync(fixture.path('.launchdeck', 'logs', 'old.log')), false);
    assert.match(fs.readFileSync(eventsPath(fixture), 'utf8'), /evt_failed_latest/);
    assertCleanResult(result.json.removed, '.launchdeck/logs', {
      status: 'partially_removed',
      protectedPath: failedLogPath
    });
  } finally {
    fixture.cleanup();
  }
});

test('reset remains absent and does not perform clean or destructive reset behavior', () => {
  const fixture = createControlPlaneFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['cache'],
      risky: []
    });
    fixture.writeFile('cache/value.txt', 'must remain');

    const result = fixture.runCliJson(['reset']);

    assert.equal(result.status, 1);
    assert.equal(result.json.ok, false);
    assert.equal(result.json.command, 'reset');
    assert.match(result.json.error.code, /^(unknown_command|command_usage_error)$/);
    assert.equal(fs.existsSync(fixture.path('cache', 'value.txt')), true);
  } finally {
    fixture.cleanup();
  }
});

function writeCleanConfig(fixture, clean) {
  fixture.writeConfig({
    version: 1,
    project: {
      name: 'clean-control-plane'
    },
    tasks: {
      build: {
        command: 'node scripts/build.js'
      }
    },
    clean
  });
}

function writeLocalRuntimeState(fixture, processes) {
  fixture.writeFile('.launchdeck/runtime/state.json', `${JSON.stringify({
    version: 1,
    projectRoot: fixture.projectRoot,
    updatedAt: '2026-07-09T00:00:00.000Z',
    processes
  }, null, 2)}\n`);
}

function writeRunIndex(fixture, runs) {
  fs.mkdirSync(path.join(fixture.homeDir, 'runtime'), { recursive: true });
  fs.writeFileSync(path.join(fixture.homeDir, 'runtime', 'runs.json'), `${JSON.stringify({
    version: 1,
    updatedAt: '2026-07-09T00:00:00.000Z',
    runs
  }, null, 2)}\n`);
}

function writeEvent(fixture, event) {
  fs.mkdirSync(path.dirname(eventsPath(fixture)), { recursive: true });
  fs.appendFileSync(eventsPath(fixture), `${JSON.stringify({ schemaVersion: 1, ...event })}\n`);
}

function eventsPath(fixture) {
  return path.join(fixture.homeDir, 'events', 'events.jsonl');
}

function assertFailure(payload, fixture, code) {
  assert.equal(payload.ok, false);
  assert.equal(payload.command, 'clean');
  assert.equal(payload.status, 'error');
  if (payload.projectRoot !== undefined) {
    assert.equal(payload.projectRoot, fixture.projectRoot);
  }
  if (payload.configPath !== undefined) {
    assert.equal(payload.configPath, fixture.path('.launchdeck.yml'));
  }
  assert.equal(payload.error.code, code);
  if (payload.dryRun !== undefined) {
    assert.equal(payload.dryRun, true);
  }
  if (payload.targets !== undefined) {
    assert.equal(Array.isArray(payload.targets), true);
  }
  if (payload.removed !== undefined) {
    assert.equal(Array.isArray(payload.removed), true);
  }
}

function assertTarget(targets, rawPath, expected) {
  const target = rawPath === undefined
    ? targets.find((entry) => entry.rawPath === undefined)
    : targets.find((entry) => (entry.rawPath ?? entry.path) === rawPath);
  assert.ok(target, `Expected clean target ${String(rawPath)} in ${JSON.stringify(targets)}`);
  assert.equal(target.status, expected.status);
  assert.equal(target.refusalCode, expected.refusalCode);
}

function assertCleanResult(results, rawPath, expected) {
  const result = results.find((entry) => (entry.rawPath ?? entry.path) === rawPath);
  assert.ok(result, `Expected clean result ${rawPath} in ${JSON.stringify(results)}`);
  assert.equal(result.status, expected.status);
  assert.ok(
    result.protectedPaths?.some((protectedPath) => samePath(protectedPath, expected.protectedPath)),
    `Expected ${expected.protectedPath} in ${JSON.stringify(result.protectedPaths)}`
  );
}

function samePath(left, right) {
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);
  return process.platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function symlinkSkipReason() {
  if (process.platform !== 'win32') {
    return false;
  }
  try {
    const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-cli-symlink-probe-'));
    const target = path.join(probeRoot, 'target');
    const link = path.join(probeRoot, 'link');
    fs.mkdirSync(target);
    fs.symlinkSync(target, link, 'junction');
    fs.rmSync(probeRoot, { recursive: true, force: true });
    return false;
  } catch {
    return 'Windows symlink/junction creation is not available in this environment.';
  }
}

function symlinkTypeForDirectory() {
  return process.platform === 'win32' ? 'junction' : 'dir';
}
