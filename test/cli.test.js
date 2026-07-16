import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..');
const cliPath = path.join(repoRoot, 'src', 'cli.js');

test('runs the local lifecycle flow end to end', async () => {
  const projectRoot = createTempProject();

  try {
    writeFile(
      projectRoot,
      '.launchdeck.yml',
      `version: 1
project:
  name: cli-smoke
tasks:
  build:
    command: node scripts/build.js
  test:
    command: node scripts/test.js
  dev:
    command: node scripts/dev.js
    longRunning: true
    ports: [43210]
clean:
  safe:
    - cache
  risky:
    - danger
`
    );
    writeFile(projectRoot, 'scripts/build.js', "require('fs').writeFileSync('build-output.txt', 'ok')\n");
    writeFile(projectRoot, 'scripts/test.js', "require('fs').writeFileSync('test-output.txt', 'ok')\n");
    writeFile(
      projectRoot,
      'scripts/dev.js',
      'setInterval(() => {}, 100)\n'
    );
    fs.mkdirSync(path.join(projectRoot, 'cache'));
    fs.writeFileSync(path.join(projectRoot, 'cache', 'value.txt'), 'cache');
    fs.mkdirSync(path.join(projectRoot, 'danger'));
    fs.writeFileSync(path.join(projectRoot, 'danger', 'value.txt'), 'danger');

    const doctor = runCli(['doctor', '--json'], projectRoot);
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.equal(parseJson(doctor.stdout).status, 'ok');

    const build = runCli(['build', '--json'], projectRoot);
    assert.equal(build.status, 0, build.stderr);
    assert.equal(parseJson(build.stdout).ok, true);
    assert.equal(fs.readFileSync(path.join(projectRoot, 'build-output.txt'), 'utf8'), 'ok');

    const unit = runCli(['test', '--json'], projectRoot);
    assert.equal(unit.status, 0, unit.stderr);
    assert.equal(parseJson(unit.stdout).ok, true);
    assert.equal(fs.readFileSync(path.join(projectRoot, 'test-output.txt'), 'utf8'), 'ok');

    const started = runCli(['dev', '--json'], projectRoot);
    assert.equal(started.status, 0, started.stderr);
    const startedPayload = parseJson(started.stdout);
    assert.equal(startedPayload.ok, true);
    assert.equal(startedPayload.process.name, 'dev');
    assert.equal(startedPayload.process.status, 'running');

    const duplicate = runCli(['dev', '--json'], projectRoot);
    assert.equal(duplicate.status, 0, duplicate.stderr);
    const duplicatePayload = parseJson(duplicate.stdout);
    assert.equal(duplicatePayload.ok, true);
    assert.equal(duplicatePayload.process.name, 'dev');
    assert.equal(duplicatePayload.process.spawned, false);
    assert.equal(duplicatePayload.process.pid, startedPayload.process.pid);

    await delay(350);

    const ps = runCli(['ps', '--json'], projectRoot);
    assert.equal(ps.status, 0, ps.stderr);
    const processes = parseJson(ps.stdout).processes;
    assert.equal(processes.length, 1);
    assert.equal(processes[0].name, 'dev');
    assert.equal(processes[0].status, 'running');

    const logs = runCli(['logs', 'dev', '--json'], projectRoot);
    assert.equal(logs.status, 0, logs.stderr);
    const logPayload = parseJson(logs.stdout);
    assert.equal(logPayload.task, 'dev');
    assert.equal(logPayload.logPath, path.join(projectRoot, '.launchdeck', 'logs', 'dev.log'));
    assert.match(logPayload.content, /command: node scripts\/dev\.js|command: node scripts\\dev\.js/);

    const stopped = runCli(['stop', 'dev', '--json'], projectRoot);
    assert.equal(stopped.status, 0, stopped.stderr);
    const stoppedPayload = parseJson(stopped.stdout);
    assert.equal(stoppedPayload.process.task, 'dev');
    assert.equal(stoppedPayload.process.status, 'stopped');

    const cleanDryRun = runCli(['clean', '--json'], projectRoot);
    assert.equal(cleanDryRun.status, 0, cleanDryRun.stderr);
    assert.equal(parseJson(cleanDryRun.stdout).dryRun, true);

    const cleanSafe = runCli(['clean', '--safe', '--json'], projectRoot);
    assert.equal(cleanSafe.status, 0, cleanSafe.stderr);
    assert.equal(fs.existsSync(path.join(projectRoot, 'cache')), false);
    assert.equal(fs.existsSync(path.join(projectRoot, 'danger')), true);

    const cleanAllWithoutConfirmation = runCli(['clean', '--all', '--json'], projectRoot);
    assert.equal(cleanAllWithoutConfirmation.status, 1);
    assert.equal(parseJson(cleanAllWithoutConfirmation.stdout).error.code, 'confirmation_required');

    const cleanAll = runCli(['clean', '--all', '--yes', '--json'], projectRoot);
    assert.equal(cleanAll.status, 0, cleanAll.stderr);
    assert.equal(fs.existsSync(path.join(projectRoot, 'danger')), false);
  } finally {
    runCli(['stop', 'dev', '--json'], projectRoot);
    removeTempProject(projectRoot);
  }
});

test('returns structured JSON errors for common CLI failures', () => {
  const projectRoot = createTempProject();

  try {
    const missingConfig = runCli(['doctor', '--json'], projectRoot);
    assert.equal(missingConfig.status, 1);
    assert.equal(parseJson(missingConfig.stdout).error.code, 'config_not_found');

    const init = runCli(['init', '--json'], projectRoot);
    assert.equal(init.status, 0, init.stderr);
    assert.equal(parseJson(init.stdout).ok, true);
    assert.equal(fs.existsSync(path.join(projectRoot, '.launchdeck.yml')), true);

    const existing = runCli(['init', '--json'], projectRoot);
    assert.equal(existing.status, 1);
    assert.equal(parseJson(existing.stdout).error.code, 'config_exists');

    const missingTask = runCli(['run', 'missing-task', '--json'], projectRoot);
    assert.equal(missingTask.status, 1);
    assert.equal(parseJson(missingTask.stdout).error.code, 'task_not_found');
  } finally {
    removeTempProject(projectRoot);
  }
});

function runCli(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true
  });
}

function parseJson(stdout) {
  return JSON.parse(stdout.trim());
}

function createTempProject() {
  return canonicalPath(fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-cli-')));
}

function removeTempProject(projectRoot) {
  const resolved = canonicalPath(projectRoot);
  const tempRoot = canonicalPath(os.tmpdir());
  if (resolved.startsWith(tempRoot) && path.basename(resolved).startsWith('launchdeck-cli-')) {
    removeWithRetry(resolved);
  }
}

function canonicalPath(value) {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function removeWithRetry(targetPath) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() <= deadline) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) {
        throw error;
      }
      sleepSync(100);
    }
  }
  throw lastError;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
