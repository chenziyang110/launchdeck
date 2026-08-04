import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { copyExample } from '../../src/examples/copy.js';
import { loadCatalog } from '../../src/examples/catalog.js';

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(fixtureDirectory, '../..');
export const FASTAPI_ID = 'fastapi-inventory';
export const FASTAPI_NATIVE_PHASES = Object.freeze([
  'install',
  'test',
  'seed',
  'start',
  'health',
  'stop',
  'cleanup'
]);

export const FASTAPI_NATIVE_LIMITS = Object.freeze({
  commandTimeoutMs: 120_000,
  healthTimeoutMs: 15_000,
  healthIntervalMs: 100,
  healthAttempts: 120,
  stopTimeoutMs: 10_000,
  portReleaseTimeoutMs: 5_000,
  portReleaseIntervalMs: 100
});

const FIXTURE_PREFIX = 'launchdeck-gallery-fastapi-native-';
const RUNTIME_NAMES = new Set([
  '.venv',
  '.pytest_cache',
  '__pycache__',
  'data',
  'dist',
  'build'
]);
const FORBIDDEN_SOURCE_NAMES = new Set([
  '.launchdeck',
  '.launchdeck.json',
  '.launchdeck.yml',
  '.launchdeck.yaml',
  'node_modules',
  '.venv',
  '__pycache__',
  '.pytest_cache',
  'data'
]);

const SEED_SCRIPT = [
  'import json',
  'from inventory_api.db import initialize_database, list_items, resolve_database_path',
  'database_path = resolve_database_path()',
  'initialize_database(database_path)',
  'items = list_items(database_path)',
  "print(json.dumps({'count': len(items), 'skus': [item['sku'] for item in items]}))"
].join('\n');

export function getFastApiNativeContract({ rootDir = repositoryRoot } = {}) {
  const catalog = loadCatalog({ rootDir });
  const entry = catalog.find((candidate) => candidate.id === FASTAPI_ID);
  if (!entry) throw new Error(`Catalog entry '${FASTAPI_ID}' is missing.`);

  return {
    id: entry.id,
    stack: entry.stack,
    sourcePath: entry.sourcePath,
    defaultPort: entry.ports[0],
    requiredPhases: [...FASTAPI_NATIVE_PHASES],
    commands: {
      install: ['poetry', 'install', '--no-interaction', '--no-ansi', '--sync'],
      test: ['poetry', 'run', 'pytest'],
      seed: ['poetry', 'run', 'python', '-c', '<deterministic seed script>'],
      start: ['poetry', 'run', 'python', '-m', 'inventory_api']
    },
    health: {
      path: '/health',
      expected: { status: 'ok', service: FASTAPI_ID, database: 'sqlite', seededItems: 3 }
    },
    build: {
      status: 'not-applicable',
      reason: 'FastAPI has no separate native build command; locked Poetry install materializes the package.'
    },
    isolation: {
      copy: 'unique temporary project copy',
      externalFixture: 'temporary sibling directory',
      forbiddenProjectArtifacts: [...FORBIDDEN_SOURCE_NAMES]
    }
  };
}

export function getPoetryAvailability({ command = 'poetry' } = {}) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    timeout: 5_000,
    windowsHide: true
  });
  if (result.status === 0) {
    return {
      available: true,
      command,
      version: (result.stdout ?? '').trim(),
      reason: null
    };
  }

  return {
    available: false,
    command,
    version: null,
    reason: result.error?.code === 'ENOENT'
      ? `${command} is not installed or is not on PATH.`
      : `${command} --version exited with ${result.status ?? 'an error'}.`
  };
}

export function createFastApiNativeFixture({ rootDir = repositoryRoot } = {}) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX)));
  const projectRoot = path.join(root, 'sample-copy');
  const externalFixtureRoot = path.join(root, 'external-fixture');
  fs.mkdirSync(externalFixtureRoot);

  try {
    const contract = getFastApiNativeContract({ rootDir });
    const sourceRoot = path.resolve(rootDir, contract.sourcePath);
    const sourceDigest = digestTree(sourceRoot);
    const copyReceipt = copyExample({
      id: FASTAPI_ID,
      destination: projectRoot,
      rootDir
    });
    const copyDigest = digestTree(projectRoot);
    const forbiddenEntries = findForbiddenEntries(projectRoot);

    if (sourceDigest !== copyDigest) {
      throw new Error('Fresh FastAPI copy does not match the packaged source tree.');
    }
    if (forbiddenEntries.length > 0) {
      throw new Error(`Fresh FastAPI copy contains forbidden entries: ${forbiddenEntries.join(', ')}`);
    }

    return {
      root,
      projectRoot,
      externalFixtureRoot,
      sourceRoot,
      sourceDigest,
      copyDigest,
      copyReceipt,
      port: null,
      cleanup() {
        return cleanupFixture(this);
      }
    };
  } catch (error) {
    removeFixtureRoot(root);
    throw error;
  }
}

export async function runFastApiNativeLifecycle({
  rootDir = repositoryRoot,
  poetryCommand = 'poetry',
  port = null,
  limits = {},
  env: extraEnv = {}
} = {}) {
  const effectiveLimits = { ...FASTAPI_NATIVE_LIMITS, ...limits };
  const fixture = createFastApiNativeFixture({ rootDir });
  const availability = getPoetryAvailability({ command: poetryCommand });
  const receipt = {
    sampleId: FASTAPI_ID,
    platform: process.platform,
    runtime: { node: process.version, poetry: availability.version },
    isolation: {
      sourceRoot: fixture.sourceRoot,
      projectRoot: fixture.projectRoot,
      externalFixtureRoot: fixture.externalFixtureRoot,
      sourceDigest: fixture.sourceDigest,
      copyDigest: fixture.copyDigest,
      copyReceipt: fixture.copyReceipt,
      sourceMutated: false
    },
    port: null,
    phases: {
      build: {
        status: 'not-applicable',
        reason: 'FastAPI has no separate native build command.'
      }
    },
    prerequisite: availability
  };
  let service = null;
  let failure = null;
  let stopFailure = null;
  let cleanupFailure = null;

  try {
    if (!availability.available) {
      throw lifecycleError('native_prerequisite_unavailable', availability.reason);
    }

    fixture.port = port ?? await reserveTcpPort();
    receipt.port = fixture.port;
    const env = {
      ...process.env,
      ...extraEnv,
      PORT: String(fixture.port),
      INVENTORY_DB_PATH: path.join(fixture.projectRoot, 'data', 'inventory.db'),
      POETRY_VIRTUALENVS_IN_PROJECT: 'true',
      POETRY_CACHE_DIR: path.join(fixture.externalFixtureRoot, 'poetry-cache'),
      POETRY_CONFIG_DIR: path.join(fixture.externalFixtureRoot, 'poetry-config'),
      POETRY_DATA_DIR: path.join(fixture.externalFixtureRoot, 'poetry-data'),
      PYTHONUNBUFFERED: '1'
    };

    receipt.phases.install = await runCommandPhase({
      name: 'install',
      command: poetryCommand,
      args: ['install', '--no-interaction', '--no-ansi', '--sync'],
      cwd: fixture.projectRoot,
      env,
      timeoutMs: effectiveLimits.commandTimeoutMs
    });
    receipt.phases.test = await runCommandPhase({
      name: 'test',
      command: poetryCommand,
      args: ['run', 'pytest'],
      cwd: fixture.projectRoot,
      env,
      timeoutMs: effectiveLimits.commandTimeoutMs
    });
    receipt.phases.seed = await runCommandPhase({
      name: 'seed',
      command: poetryCommand,
      args: ['run', 'python', '-c', SEED_SCRIPT],
      cwd: fixture.projectRoot,
      env,
      timeoutMs: effectiveLimits.commandTimeoutMs
    });
    receipt.phases.seed.seededItems = parseSeedOutput(receipt.phases.seed.stdout);

    service = startService({
      command: poetryCommand,
      args: ['run', 'python', '-m', 'inventory_api'],
      cwd: fixture.projectRoot,
      env
    });
    receipt.phases.start = {
      status: 'passed',
      command: formatInvocation(poetryCommand, ['run', 'python', '-m', 'inventory_api']),
      pid: service.child.pid,
      startedAt: new Date().toISOString()
    };

    receipt.phases.health = await pollHealth({
      service,
      port: fixture.port,
      timeoutMs: effectiveLimits.healthTimeoutMs,
      intervalMs: effectiveLimits.healthIntervalMs,
      maxAttempts: effectiveLimits.healthAttempts
    });
    if (receipt.phases.health.status !== 'passed') {
      throw lifecycleError('health_check_failed', 'FastAPI health polling did not reach a seeded ready response.');
    }
  } catch (error) {
    failure = error;
  } finally {
    if (service) {
      try {
        receipt.phases.stop = await stopService({
          service,
          port: fixture.port,
          timeoutMs: effectiveLimits.stopTimeoutMs,
          portReleaseTimeoutMs: effectiveLimits.portReleaseTimeoutMs,
          portReleaseIntervalMs: effectiveLimits.portReleaseIntervalMs
        });
        if (receipt.phases.stop.status !== 'passed') {
          stopFailure = lifecycleError('stop_failed', 'FastAPI process or port cleanup did not complete.');
        }
      } catch (error) {
        stopFailure = error;
      }
    }

    try {
      receipt.cleanup = cleanupFixture(fixture);
      receipt.phases.cleanup = receipt.cleanup;
      if (!receipt.cleanup.ok) {
        cleanupFailure = lifecycleError('cleanup_failed', 'FastAPI temporary fixture cleanup left residue.');
      }
      receipt.isolation.sourceMutated = !receipt.cleanup.sourceUnchanged;
    } catch (error) {
      cleanupFailure = error;
      receipt.cleanup = { ok: false, error: error.message };
    }
  }

  const finalFailure = failure ?? stopFailure ?? cleanupFailure;
  if (finalFailure) {
    finalFailure.receipt = receipt;
    throw finalFailure;
  }
  return receipt;
}

export const createGalleryFastApiNativeFixture = createFastApiNativeFixture;
export const runGalleryFastApiNativeLifecycle = runFastApiNativeLifecycle;

async function runCommandPhase({ name, command, args, cwd, env, timeoutMs }) {
  const result = await runCommand({ command, args, cwd, env, timeoutMs });
  const phase = {
    name,
    status: result.status,
    command: formatInvocation(command, args),
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: result.durationMs,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr)
  };
  if (phase.status !== 'passed') {
    const error = lifecycleError(`${name}_failed`, `${name} command failed.`);
    error.phase = phase;
    throw error;
  }
  return phase;
}

function runCommand({ command, args, cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const finish = (exitCode, signal, error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve({
        status: !timedOut && !error && exitCode === 0 ? 'passed' : 'failed',
        exitCode,
        signal,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: error ? `${stderr}\n${error.message}`.trim() : stderr
      });
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => finish(null, null, error));
    child.once('close', (exitCode, signal) => finish(exitCode, signal));
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      terminateProcessTree({ child }).catch(() => {});
    }, timeoutMs);
  });
}

function startService({ command, args, cwd, env }) {
  const child = spawn(command, args, {
    cwd,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitPromise = new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
    child.once('error', (error) => resolve({ code: null, signal: null, error }));
  });
  return { child, exitPromise, getOutput: () => ({ stdout, stderr }) };
}

async function pollHealth({ service, port, timeoutMs, intervalMs, maxAttempts }) {
  const startedAt = Date.now();
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts && Date.now() - startedAt <= timeoutMs; attempt += 1) {
    if (service.child.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(Math.min(1_000, timeoutMs))
      });
      const bodyText = await response.text();
      let body;
      try { body = JSON.parse(bodyText); } catch { body = bodyText; }
      attempts.push({ attempt, statusCode: response.status, body });
      if (response.ok && body?.status === 'ok' && body?.seededItems === 3) {
        return {
          status: 'passed',
          path: '/health',
          response: { statusCode: response.status, body },
          attempts,
          durationMs: Date.now() - startedAt
        };
      }
    } catch (error) {
      attempts.push({ attempt, error: error.name ?? error.message });
    }
    await delay(intervalMs);
  }
  return {
    status: 'failed',
    path: '/health',
    attempts,
    durationMs: Date.now() - startedAt,
    processOutput: service.getOutput()
  };
}

async function stopService({ service, port, timeoutMs, portReleaseTimeoutMs, portReleaseIntervalMs }) {
  await terminateProcessTree(service);
  const exit = await waitForExit(service.exitPromise, timeoutMs);
  const portReleased = await waitForPortReleased(port, portReleaseTimeoutMs, portReleaseIntervalMs);
  const output = service.getOutput();
  return {
    status: exit.exited && portReleased ? 'passed' : 'failed',
    processExited: exit.exited,
    exitCode: exit.code,
    signal: exit.signal,
    portReleased,
    stdout: trimOutput(output.stdout),
    stderr: trimOutput(output.stderr)
  };
}

async function terminateProcessTree(service) {
  const { child } = service;
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true
    });
    if (result.status !== 0 && child.exitCode === null) child.kill();
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  await delay(250);
  if (child.exitCode === null) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

function waitForExit(exitPromise, timeoutMs) {
  return new Promise((resolve) => {
    const timeoutHandle = setTimeout(() => resolve({ exited: false, code: null, signal: 'timeout' }), timeoutMs);
    exitPromise.then((exit) => {
      clearTimeout(timeoutHandle);
      resolve({ exited: true, code: exit.code, signal: exit.signal });
    });
  });
}

async function reserveTcpPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error('Unable to reserve a local TCP port.');
  return port;
}

async function waitForPortReleased(port, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!(await isPortListening(port))) return true;
    await delay(intervalMs);
  }
  return false;
}

function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (listening) => {
      socket.destroy();
      resolve(listening);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

function parseSeedOutput(stdout) {
  const line = stdout.trim().split(/\r?\n/).findLast((candidate) => candidate.trim().startsWith('{'));
  if (!line) throw lifecycleError('seed_output_invalid', 'Seed command did not emit JSON evidence.');
  const parsed = JSON.parse(line);
  if (parsed.count !== 3 || !Array.isArray(parsed.skus) || parsed.skus.length !== 3) {
    throw lifecycleError('seed_output_invalid', 'Seed command did not create the three deterministic records.');
  }
  return parsed;
}

export function findRuntimeResidue(projectRoot) {
  if (!fs.existsSync(projectRoot)) return [];
  return walk(projectRoot).filter((entry) => {
    const base = path.basename(entry).toLowerCase();
    return RUNTIME_NAMES.has(base)
      || ['.db', '.sqlite', '.sqlite3', '.log'].some((suffix) => base.endsWith(suffix));
  }).map((entry) => path.relative(projectRoot, entry).replaceAll(path.sep, '/'));
}

function findForbiddenEntries(projectRoot) {
  return walk(projectRoot)
    .filter((entry) => FORBIDDEN_SOURCE_NAMES.has(path.basename(entry).toLowerCase()))
    .map((entry) => path.relative(projectRoot, entry).replaceAll(path.sep, '/'));
}

function cleanupFixture(fixture) {
  const runtimeResidueBefore = findRuntimeResidue(fixture.projectRoot);
  const sourceDigestAfter = digestTree(fixture.sourceRoot);
  const sourceUnchanged = sourceDigestAfter === fixture.sourceDigest;
  removeFixtureRoot(fixture.root);
  const residueAfter = fs.existsSync(fixture.root) ? walk(fixture.root) : [];
  return {
    ok: sourceUnchanged && residueAfter.length === 0 && !fs.existsSync(fixture.projectRoot),
    sourceUnchanged,
    runtimeResidueBefore,
    residueAfter: residueAfter.map((entry) => path.relative(fixture.root, entry)),
    projectRootRemoved: !fs.existsSync(fixture.projectRoot),
    fixtureRootRemoved: !fs.existsSync(fixture.root)
  };
}

function digestTree(directory) {
  const hash = crypto.createHash('sha256');
  for (const file of walk(directory).sort()) {
    const relative = path.relative(directory, file).replaceAll(path.sep, '/');
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not allowed in sample tree: ${relative}`);
    if (!stat.isFile()) continue;
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return [entryPath, ...walk(entryPath)];
    return [entryPath];
  });
}

function removeFixtureRoot(root) {
  const resolved = path.resolve(root);
  const tempRoot = fs.realpathSync.native(path.resolve(os.tmpdir()));
  const relative = path.relative(tempRoot, resolved);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith(FIXTURE_PREFIX) ||
      relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean non-owned FastAPI fixture root: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function lifecycleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function formatInvocation(command, args) {
  return [command, ...args].map((part) => /\s/.test(part) ? JSON.stringify(part) : part).join(' ');
}

function trimOutput(value) {
  const output = String(value ?? '');
  return output.length > 8_000 ? `${output.slice(-8_000)}\n[truncated]` : output;
}
