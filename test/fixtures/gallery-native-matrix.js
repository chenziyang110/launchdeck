import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { scheduler } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { loadCatalog } from '../../src/examples/catalog.js';

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(fixtureDirectory, '../..');

export const GALLERY_NATIVE_PLATFORMS = Object.freeze([
  Object.freeze({ id: 'windows', runner: 'windows-latest', nodePlatform: 'win32' }),
  Object.freeze({ id: 'linux', runner: 'ubuntu-latest', nodePlatform: 'linux' })
]);

export const GALLERY_NATIVE_PHASES = Object.freeze([
  'install',
  'build',
  'test',
  'start',
  'health',
  'stop',
  'cleanup'
]);

const FIXTURE_PREFIX = 'launchdeck-gallery-native-matrix-';
const OUTPUT_LIMIT = 32_768;
const CLEANUP_ASSERTIONS = Object.freeze([
  'source-unchanged',
  'project-root-removed',
  'fixture-root-removed',
  'no-residue-after-cleanup'
]);
const FORBIDDEN_FIXTURE_NAMES = new Set([
  '.launchdeck',
  '.launchdeck.json',
  '.launchdeck.yml',
  '.launchdeck.yaml',
  '.next',
  '.pytest_cache',
  '.scratch',
  '.venv',
  '__pycache__',
  'bin',
  'build',
  'dist',
  'node_modules',
  'obj',
  'scratch',
  'target'
]);

const STACK_PROFILES = Object.freeze({
  'Vite + React': profile({ checks: ['node', 'npm'], buildRequired: true }),
  'Next.js': profile({ checks: ['node', 'npm'], buildRequired: true }),
  NestJS: profile({ checks: ['node', 'npm'], buildRequired: true }),
  FastAPI: profile({ checks: ['python', 'poetry'], buildReason: 'Python package install materializes the native application.' }),
  Django: profile({ checks: ['python', 'poetry'], buildReason: 'Django has no separate native build phase.' }),
  Go: profile({ checks: ['go'], buildRequired: true }),
  'Spring Boot': profile({ checks: ['java', 'maven'], buildRequired: true }),
  'ASP.NET Core': profile({ checks: ['dotnet'], buildRequired: true }),
  'Docker Compose': profile({ checks: ['docker-compose', 'node-optional', 'npm-optional'], buildRequired: true }),
  'Node.js + Python monorepo': profile({
    checks: ['node', 'npm', 'python', 'poetry'],
    buildRequired: true
  })
});

const SAMPLE_LIFECYCLES = Object.freeze({
  'vite-react-habit-tracker': ({ ports }) => nativeProfile({
    install: 'npm ci',
    build: 'npm run build',
    test: 'npm test',
    start: `npm run start -- --port ${ports[0]}`,
    env: { PORT: String(ports[0]) },
    healthPaths: ['/health.json']
  }),
  'nextjs-blog-manager': ({ ports }) => nativeProfile({
    install: 'npm install',
    build: 'npm run build',
    test: 'npm test',
    start: 'npm start',
    env: { PORT: String(ports[0]) },
    healthPaths: ['/api/health']
  }),
  'nestjs-url-shortener': ({ ports }) => nativeProfile({
    install: 'npm ci',
    build: 'npm run build',
    test: 'npm test',
    start: 'npm start',
    env: { PORT: String(ports[0]) },
    healthPaths: ['/health']
  }),
  'fastapi-inventory': ({ ports }) => nativeProfile({
    install: 'poetry install --no-interaction --no-ansi --sync',
    build: 'poetry run python -m compileall inventory_api',
    test: 'poetry run pytest',
    start: 'poetry run python -m inventory_api',
    env: { PORT: String(ports[0]), PYTHONUNBUFFERED: '1' },
    healthPaths: ['/health']
  }),
  'django-events': ({ ports }) => nativeProfile({
    install: 'poetry install --no-interaction --no-ansi --sync',
    build: 'poetry run python manage.py check',
    test: 'poetry run python manage.py test',
    start: 'poetry run events-server',
    env: { PORT: String(ports[0]), PYTHONUNBUFFERED: '1' },
    healthPaths: ['/health']
  }),
  'go-webhook-inbox': ({ ports, fixture }) => nativeProfile({
    install: 'go mod download && go mod verify',
    build: 'go build ./...',
    test: 'go test ./...',
    start: 'go run ./cmd/inbox',
    env: {
      PORT: String(ports[0]),
      INBOX_DATA_PATH: path.join(fixture.externalFixtureRoot, 'go-webhook-inbox-events.json')
    },
    healthPaths: ['/health']
  }),
  'spring-boot-orders': ({ ports }) => nativeProfile({
    install: 'mvn -B -ntp -DskipTests dependency:go-offline',
    build: 'mvn -B -ntp -DskipTests package',
    test: 'mvn -B -ntp test',
    start: 'mvn -B -ntp spring-boot:run',
    env: { PORT: String(ports[0]) },
    healthPaths: ['/health']
  }),
  'aspnet-library-catalog': ({ ports }) => nativeProfile({
    install: 'dotnet restore tests/LibraryCatalog.Tests.csproj --locked-mode',
    build: 'dotnet build --no-restore',
    test: 'dotnet run --no-restore --project tests/LibraryCatalog.Tests.csproj',
    start: 'dotnet run --no-build',
    env: { PORT: String(ports[0]) },
    healthPaths: ['/health']
  }),
  'docker-compose-helpdesk': ({ ports }) => nativeProfile({
    install: 'npm ci',
    build: 'docker compose build',
    test: 'docker compose run --rm --no-deps helpdesk npm test',
    start: 'docker compose up',
    stop: 'docker compose down --remove-orphans',
    env: { HELPDESK_PORT: String(ports[0]) },
    healthPaths: ['/health']
  }),
  'node-python-issue-tracker': ({ ports, fixture }) => nativeProfile({
    install: 'npm ci && poetry install --no-interaction --no-ansi --sync',
    build: 'node --check node/src/server.mjs && poetry run python -m compileall python/issue_tracker',
    test: 'npm run test:all',
    start: process.execPath === 'node'
      ? 'node .launchdeck-gallery/node-python-supervisor.mjs'
      : `${quoteForShell(process.execPath)} .launchdeck-gallery/node-python-supervisor.mjs`,
    env: {
      NODE_PORT: String(ports[0]),
      PYTHON_PORT: String(ports[1]),
      PYTHONUNBUFFERED: '1',
      ISSUE_STORE_PATH: path.join(fixture.externalFixtureRoot, 'node-issues.json'),
      ISSUE_DB_PATH: path.join(fixture.externalFixtureRoot, 'python-issues.sqlite3')
    },
    healthPaths: ['/health', '/health']
  })
});

export function getGalleryNativeMatrix({ rootDir = repositoryRoot } = {}) {
  const catalog = loadCatalog({ rootDir });
  return catalog.flatMap((sample) => GALLERY_NATIVE_PLATFORMS.map((platform) => {
    const stackProfile = STACK_PROFILES[sample.stack];
    if (!stackProfile) {
      throw new Error(`Native prerequisite profile is missing for catalog stack '${sample.stack}'.`);
    }

    return {
      cellId: `${platform.id}:${sample.id}`,
      sampleId: sample.id,
      platform: platform.id,
      runner: platform.runner,
      nodePlatform: platform.nodePlatform,
      title: sample.title,
      stack: sample.stack,
      theme: sample.theme,
      sourcePath: sample.sourcePath,
      ports: [...sample.ports],
      prerequisite: {
        required: true,
        requirements: [...sample.requirements],
        checks: stackProfile.checks.map((checkId) => createPrerequisiteCheck(checkId, platform))
      },
      build: {
        required: stackProfile.buildRequired,
        reason: stackProfile.buildRequired ? null : stackProfile.buildReason
      },
      requiredPhases: [...GALLERY_NATIVE_PHASES],
      cleanup: {
        required: true,
        policy: 'finally',
        assertions: [...CLEANUP_ASSERTIONS]
      },
      skipAllowed: false
    };
  }));
}

export function inspectGalleryNativePrerequisites(cell, { spawnSyncImpl = spawnSync } = {}) {
  const platformMatches = process.platform === cell.nodePlatform;
  const checks = cell.prerequisite.checks.map((check) => {
    const result = spawnSyncImpl(check.command, check.args, {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
      // npm is exposed as npm.cmd on Windows. Using the platform shell here
      // keeps prerequisite inspection aligned with the commands used by the
      // actual lifecycle runner and by the CI images.
      shell: process.platform === 'win32'
    });
    const passed = result.status === 0;
    return {
      id: check.id,
      requirement: check.requirement,
      required: check.required,
      invocation: [check.command, ...check.args],
      status: passed ? 'passed' : 'failed',
      exitCode: result.status,
      signal: result.signal ?? null,
      version: passed ? firstOutputLine(result.stdout || result.stderr) : null,
      diagnostics: passed
        ? null
        : result.error?.code === 'ENOENT'
          ? `${check.command} is not installed or is not on PATH.`
          : `${formatInvocation(check.command, check.args)} exited with ${result.status ?? 'an error'}.`
    };
  });
  const failedRequiredChecks = checks.filter((check) => check.required && check.status === 'failed');
  const diagnostics = [];
  if (!platformMatches) {
    diagnostics.push(`Cell requires ${cell.nodePlatform}; current Node platform is ${process.platform}.`);
  }
  diagnostics.push(...failedRequiredChecks.map((check) => check.diagnostics));

  return {
    status: platformMatches && failedRequiredChecks.length === 0 ? 'passed' : 'failed',
    platform: {
      expected: cell.nodePlatform,
      actual: process.platform,
      status: platformMatches ? 'passed' : 'failed'
    },
    requirements: [...cell.prerequisite.requirements],
    checks,
    diagnostics: diagnostics.filter(Boolean)
  };
}

export async function runGalleryNativeMatrix({
  rootDir = repositoryRoot,
  inspectPrerequisites = inspectGalleryNativePrerequisites,
  executeLifecycle = executeRealNativeLifecycle,
  cells = getGalleryNativeMatrix({ rootDir })
} = {}) {
  if (typeof inspectPrerequisites !== 'function') {
    throw new TypeError('inspectPrerequisites must be a function.');
  }
  if (typeof executeLifecycle !== 'function') {
    throw new TypeError('executeLifecycle must be a function that returns invocation, runtime diagnostics, and phases.');
  }

  const receipts = [];
  for (const cell of cells) {
    receipts.push(await runGalleryNativeCell({
      cell,
      rootDir,
      inspectPrerequisites,
      executeLifecycle
    }));
  }

  const skipped = receipts.filter(hasSkippedStatus).length;
  return {
    denominator: {
      catalogEntries: new Set(cells.map((cell) => cell.sampleId)).size,
      platforms: GALLERY_NATIVE_PLATFORMS.length,
      cells: cells.length
    },
    platforms: GALLERY_NATIVE_PLATFORMS.map((platform) => platform.id),
    receipts,
    summary: {
      completed: receipts.length,
      passed: receipts.filter((receipt) => receipt.status === 'passed').length,
      failed: receipts.filter((receipt) => receipt.status === 'failed').length,
      skipped,
      prerequisiteAccounted: receipts.filter((receipt) => ['passed', 'failed'].includes(receipt.prerequisite.status)).length,
      prerequisiteFailed: receipts.filter((receipt) => receipt.prerequisite.status === 'failed').length,
      cleanupAccounted: receipts.filter((receipt) => receipt.cleanup.accounted).length,
      cleanupFailed: receipts.filter((receipt) => receipt.cleanup.status === 'failed').length
    }
  };
}

export async function runGalleryNativeLiveMatrix({ rootDir = repositoryRoot } = {}) {
  const platform = currentGalleryNativePlatform();
  if (!['windows', 'linux'].includes(platform)) {
    throw lifecycleError('native_platform_unsupported', `Native gallery live matrix does not support ${process.platform}.`);
  }
  return runGalleryNativeMatrix({
    rootDir,
    cells: getGalleryNativeMatrix({ rootDir }).filter((cell) => cell.platform === platform)
  });
}

async function runGalleryNativeCell({ cell, rootDir, inspectPrerequisites, executeLifecycle }) {
  const receipt = createReceipt(cell);
  let fixture = null;

  try {
    fixture = createGalleryNativeFixture({ cell, rootDir });
    receipt.isolation = {
      fixtureRoot: fixture.root,
      projectRoot: fixture.projectRoot,
      externalFixtureRoot: fixture.externalFixtureRoot,
      sourceRoot: fixture.sourceRoot,
      sourceDigest: fixture.sourceDigest,
      copyDigest: fixture.copyDigest,
      copyReceipt: fixture.copyReceipt
    };

    const prerequisite = normalizePrerequisiteReceipt(cell, await inspectPrerequisites(cell));
    receipt.prerequisite = prerequisite;
    if (prerequisite.status === 'failed') {
      receipt.failure = {
        code: 'native_prerequisite_unavailable',
        message: `Required native prerequisites are unavailable for ${cell.cellId}.`
      };
      setNotRunReason(receipt.phases, 'Native lifecycle not dispatched because prerequisite accounting failed.');
    } else {
      const env = {
        ...process.env,
        LAUNCHDECK_HOME: fixture.launchdeckHome
      };
      const lifecycle = normalizeLifecycleReceipt(cell, await executeLifecycle({ cell, fixture, env }));
      receipt.invocation = lifecycle.invocation;
      receipt.runtimeDiagnostics = lifecycle.runtimeDiagnostics;
      Object.assign(receipt.phases, lifecycle.phases);
      if (lifecycle.passed) {
        receipt.status = 'passed';
      } else {
        receipt.failure = {
          code: 'native_lifecycle_failed',
          message: `One or more required native phases failed for ${cell.cellId}.`
        };
      }
    }
  } catch (error) {
    receipt.failure ??= {
      code: error.code ?? 'native_matrix_cell_failed',
      message: error.message
    };
    receipt.runtimeDiagnostics ??= error.runtimeDiagnostics ?? {
      node: process.version,
      platform: process.platform,
      error: error.message
    };
  } finally {
    receipt.cleanup = cleanupWithAccounting(fixture);
    receipt.phases.cleanup = {
      status: receipt.cleanup.status,
      reason: receipt.cleanup.reason ?? null
    };
    if (receipt.cleanup.status === 'failed') {
      receipt.status = 'failed';
      receipt.failure ??= {
        code: 'cleanup_failed',
        message: `Native fixture cleanup failed for ${cell.cellId}.`
      };
    }
  }

  if (hasSkippedStatus(receipt)) {
    receipt.status = 'failed';
    receipt.failure = {
      code: 'silent_skip_forbidden',
      message: `Skipped status is forbidden for native matrix cell ${cell.cellId}.`
    };
  }
  return receipt;
}

function createReceipt(cell) {
  return {
    cellId: cell.cellId,
    sampleId: cell.sampleId,
    platform: cell.platform,
    runner: cell.runner,
    status: 'failed',
    invocation: [],
    runtimeDiagnostics: null,
    prerequisite: {
      status: 'pending',
      checks: [],
      diagnostics: 'Prerequisite inspection did not complete.'
    },
    phases: Object.fromEntries(GALLERY_NATIVE_PHASES.map((phase) => [phase, {
      status: 'not-run',
      reason: 'Native lifecycle was not dispatched.'
    }])),
    isolation: {
      fixtureRoot: null,
      projectRoot: null,
      externalFixtureRoot: null,
      sourceRoot: path.resolve(repositoryRoot, cell.sourcePath),
      sourceDigest: null,
      copyDigest: null,
      copyReceipt: null
    },
    cleanup: {
      accounted: false,
      status: 'pending',
      sourceUnchanged: false,
      fixtureRootRemoved: false,
      projectRootRemoved: false,
      runtimeChanges: [],
      residueAfter: []
    },
    failure: null
  };
}

function normalizePrerequisiteReceipt(cell, value) {
  if (!value || !['passed', 'failed'].includes(value.status)) {
    throw lifecycleError('prerequisite_accounting_invalid', `${cell.cellId} prerequisite status must be passed or failed.`);
  }
  if (!Array.isArray(value.checks) || value.checks.length !== cell.prerequisite.checks.length) {
    throw lifecycleError('prerequisite_accounting_invalid', `${cell.cellId} must report every prerequisite check.`);
  }

  const expected = new Map(cell.prerequisite.checks.map((check) => [check.id, check]));
  const checks = value.checks.map((check) => {
    const definition = expected.get(check.id);
    if (!definition || !['passed', 'failed'].includes(check.status) || !Array.isArray(check.invocation)) {
      throw lifecycleError('prerequisite_accounting_invalid', `${cell.cellId} has an invalid prerequisite check receipt.`);
    }
    return {
      ...check,
      requirement: check.requirement ?? definition.requirement,
      required: definition.required,
      invocation: [...check.invocation]
    };
  });
  const failedRequiredCheck = checks.some((check) => check.required && check.status === 'failed');

  return {
    ...value,
    status: value.status === 'passed' && !failedRequiredCheck ? 'passed' : 'failed',
    requirements: [...cell.prerequisite.requirements],
    checks
  };
}

function normalizeLifecycleReceipt(cell, value) {
  if (!value || !Array.isArray(value.invocation) || value.invocation.length === 0) {
    throw lifecycleError('native_invocation_missing', `${cell.cellId} lifecycle must record its invocation.`);
  }
  if (!value.runtimeDiagnostics || typeof value.runtimeDiagnostics !== 'object') {
    throw lifecycleError('native_runtime_diagnostics_missing', `${cell.cellId} lifecycle must record runtime diagnostics.`);
  }
  if (!value.phases || typeof value.phases !== 'object') {
    throw lifecycleError('native_phase_accounting_invalid', `${cell.cellId} lifecycle must record native phases.`);
  }

  const phases = {};
  let passed = true;
  for (const phase of GALLERY_NATIVE_PHASES.filter((candidate) => candidate !== 'cleanup')) {
    const phaseReceipt = value.phases[phase];
    if (!phaseReceipt || !['passed', 'failed', 'not-applicable', 'not-run'].includes(phaseReceipt.status)) {
      const code = phaseReceipt?.status === 'skipped' ? 'silent_skip_forbidden' : 'native_phase_accounting_invalid';
      throw lifecycleError(code, `${cell.cellId} phase '${phase}' has no explicit terminal accounting.`);
    }
    if (phaseReceipt.status === 'not-applicable' && (phase !== 'build' || cell.build.required)) {
      passed = false;
    } else if (!['passed', 'not-applicable'].includes(phaseReceipt.status)) {
      passed = false;
    }
    phases[phase] = { ...phaseReceipt };
  }

  return {
    invocation: [...value.invocation],
    runtimeDiagnostics: { ...value.runtimeDiagnostics },
    phases,
    passed
  };
}

function createGalleryNativeFixture({ cell, rootDir }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX));
  const projectRoot = path.join(root, 'sample-copy');
  const externalFixtureRoot = path.join(root, 'external-fixture');
  const launchdeckHome = path.join(externalFixtureRoot, 'launchdeck-home');
  fs.mkdirSync(launchdeckHome, { recursive: true });

  try {
    const sourceRoot = path.resolve(rootDir, cell.sourcePath);
    const sourceDigest = digestTree(sourceRoot);
    fs.cpSync(sourceRoot, projectRoot, {
      recursive: true,
      errorOnExist: true,
      force: false
    });
    const copyDigest = digestTree(projectRoot);
    const forbiddenEntries = findForbiddenFixtureEntries(projectRoot);
    if (sourceDigest !== copyDigest) {
      throw new Error(`Fresh copy digest does not match source for ${cell.sampleId}.`);
    }
    if (forbiddenEntries.length > 0) {
      throw new Error(`Fresh copy contains forbidden runtime entries: ${forbiddenEntries.join(', ')}`);
    }
    const copyReceipt = {
      id: cell.sampleId,
      destination: projectRoot,
      method: 'fixture-owned-recursive-copy',
      digest: copyDigest
    };
    writeNativeFixtureSupportFiles(cell, projectRoot);

    return {
      root,
      projectRoot,
      externalFixtureRoot,
      launchdeckHome,
      sourceRoot,
      sourceDigest,
      copyDigest,
      copyReceipt,
      initialSnapshot: snapshotTree(projectRoot)
    };
  } catch (error) {
    removeFixtureRoot(root);
    throw error;
  }
}

async function executeRealNativeLifecycle({ cell, fixture, env }) {
  const profileFactory = SAMPLE_LIFECYCLES[cell.sampleId];
  if (!profileFactory) {
    throw lifecycleError('native_profile_missing', `Native lifecycle profile is missing for ${cell.sampleId}.`);
  }
  const profile = profileFactory({ ports: cell.ports, fixture });
  const runtimeEnv = {
    ...env,
    ...profile.env,
    LAUNCHDECK_HOME: fixture.launchdeckHome
  };
  const phases = {};
  const invocation = [];
  const runtimeDiagnostics = {
    node: process.version,
    platform: process.platform,
    currentPlatform: currentGalleryNativePlatform(),
    sampleId: cell.sampleId,
    cellId: cell.cellId,
    projectRoot: fixture.projectRoot,
    commands: {},
    healthChecks: [],
    ownedProcess: null,
    portRelease: []
  };
  let child = null;

  try {
    for (const phase of ['install', 'build', 'test']) {
      if (phase === 'build' && !cell.build.required && !profile.commands.build) {
        phases.build = { status: 'not-applicable', reason: cell.build.reason };
        continue;
      }
      const result = runNativeShellCommand(profile.commands[phase], {
        cwd: fixture.projectRoot,
        env: runtimeEnv,
        timeout: phase === 'install' ? 600_000 : 300_000
      });
      invocation.push(result.command);
      runtimeDiagnostics.commands[phase] = result;
      phases[phase] = { status: result.status === 0 ? 'passed' : 'failed', result };
      if (result.status !== 0) {
        return completeNativeLifecycleReceipt({ cell, invocation, runtimeDiagnostics, phases });
      }
    }

    const startedProcess = startNativeProcess(profile.commands.start, {
      cwd: fixture.projectRoot,
      env: runtimeEnv
    });
    child = startedProcess.process;
    invocation.push(startedProcess.command);
    runtimeDiagnostics.ownedProcess = {
      pid: child.pid,
      command: startedProcess.command,
      started: true
    };
    phases.start = {
      status: 'passed',
      result: {
        command: startedProcess.command,
        pid: child.pid,
        cwd: fixture.projectRoot
      }
    };

    const healthChecks = [];
    for (const url of profile.healthPaths.map((healthPath, index) =>
      `http://127.0.0.1:${cell.ports[index] ?? cell.ports[0]}${healthPath}`
    )) {
      healthChecks.push(await probeHttpHealth({ url }));
    }
    runtimeDiagnostics.healthChecks = healthChecks;
    phases.health = {
      status: healthChecks.every((check) => check.ok === true) ? 'passed' : 'failed',
      checks: healthChecks
    };
  } finally {
    const stopReceipt = await stopNativeProcess({
      child,
      stopCommand: profile.commands.stop,
      cwd: fixture.projectRoot,
      env: runtimeEnv
    });
    if (stopReceipt.command) invocation.push(stopReceipt.command);
    phases.stop = {
      status: stopReceipt.status === 0 ? 'passed' : 'failed',
      result: stopReceipt
    };
    const portRelease = [];
    for (const port of cell.ports) {
      portRelease.push(await verifyPortReleased({ port }));
    }
    runtimeDiagnostics.portRelease = portRelease;
    if (portRelease.some((check) => check.released !== true)) {
      phases.stop = {
        status: 'failed',
        result: {
          ...stopReceipt,
          portRelease
        }
      };
    }
  }

  return completeNativeLifecycleReceipt({ cell, invocation, runtimeDiagnostics, phases });
}

function completeNativeLifecycleReceipt({ cell, invocation, runtimeDiagnostics, phases }) {
  for (const phase of GALLERY_NATIVE_PHASES.filter((candidate) => candidate !== 'cleanup')) {
    phases[phase] ??= {
      status: 'not-run',
      reason: `${phase} did not run because an earlier native lifecycle phase did not pass.`
    };
  }
  if (cell.build.required === false && phases.build.status === 'not-run') {
    phases.build = { status: 'not-applicable', reason: cell.build.reason };
  }
  return { invocation, runtimeDiagnostics, phases };
}

function nativeProfile({ install, build, test, start, stop = null, env = {}, healthPaths }) {
  return Object.freeze({
    commands: Object.freeze({ install, build, test, start, stop }),
    env: Object.freeze({ ...env }),
    healthPaths: Object.freeze([...healthPaths])
  });
}

function runNativeShellCommand(command, { cwd, env, timeout }) {
  const result = spawnSync(command, {
    cwd,
    env,
    shell: true,
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: OUTPUT_LIMIT * 2
  });
  return {
    command,
    cwd,
    status: result.status ?? 1,
    signal: result.signal ?? null,
    stdout: boundedOutput(result.stdout),
    stderr: boundedOutput(result.stderr),
    diagnostics: result.error ? errorRecord(result.error) : null
  };
}

function startNativeProcess(command, { cwd, env }) {
  const child = spawn(command, {
    cwd,
    env,
    shell: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  return { command, process: child };
}

async function stopNativeProcess({ child, stopCommand, cwd, env }) {
  let stopResult = null;
  if (stopCommand) {
    stopResult = runNativeShellCommand(stopCommand, { cwd, env, timeout: 120_000 });
  }
  if (child) await terminateProcess(child);
  return {
    command: stopCommand ?? null,
    status: stopResult?.status ?? 0,
    signal: stopResult?.signal ?? null,
    stdout: stopResult?.stdout ?? '',
    stderr: stopResult?.stderr ?? '',
    diagnostics: stopResult?.diagnostics ?? null,
    ownedProcessExited: child ? child.exitCode !== null || child.signalCode !== null || child.killed : true
  };
}

async function terminateProcess(child) {
  const exited = new Promise((resolve) => child.once('exit', resolve));
  if (process.platform === 'win32') {
    // A shell-launched command can outlive its immediate cmd.exe wrapper
    // (notably `go run` and Docker Compose). Always request tree termination
    // before consulting ChildProcess exit state so descendants cannot leak.
    for (let attempt = 0; attempt < 3 && child.exitCode === null && child.signalCode === null; attempt += 1) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000
      });
      if (child.exitCode !== null || child.signalCode !== null) break;
      await scheduler.wait(250);
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
  await Promise.race([exited, scheduler.wait(10_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([exited, scheduler.wait(5_000)]);
  }
}

async function probeHttpHealth({ url }) {
  const attempts = [];
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      const text = await response.text();
      attempts.push({ attempt, status: response.status });
      if (response.ok) return { ok: true, status: response.status, url, body: parseJson(text) ?? text, attempts };
    } catch (error) {
      attempts.push({
        attempt,
        error: { code: error?.code ?? error?.name ?? 'health_probe_failed', message: error?.message }
      });
    }
    await scheduler.wait(500);
  }
  return { ok: false, status: null, url, attempts };
}

async function verifyPortReleased({ port }) {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    if (!(await canConnect(port))) return { released: true, port, attempts: attempt };
    await scheduler.wait(250);
  }
  return { released: false, port, attempts: 40 };
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (connected) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

function writeNativeFixtureSupportFiles(cell, projectRoot) {
  if (cell.sampleId !== 'node-python-issue-tracker') return;
  const supportRoot = path.join(projectRoot, '.launchdeck-gallery');
  fs.mkdirSync(supportRoot);
  fs.writeFileSync(
    path.join(supportRoot, 'node-python-supervisor.mjs'),
    nodePythonSupervisorSource(),
    'utf8'
  );
}

function nodePythonSupervisorSource() {
  return `import { spawn } from 'node:child_process';

const nodeCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(nodeCommand, ['start'], { stdio: 'inherit', env: { ...process.env, PORT: process.env.NODE_PORT } }),
  spawn('poetry', ['run', 'issue-server'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.PYTHON_PORT, PYTHONUNBUFFERED: '1' }
  })
];

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop();
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (!stopping && code !== 0) {
      console.error(\`child exited with code \${code ?? 'null'} signal \${signal ?? 'none'}\`);
      stop();
      process.exitCode = code ?? 1;
    }
  });
}

await Promise.all(children.map((child) => new Promise((resolve) => child.once('exit', resolve))));
`;
}

function cleanupWithAccounting(fixture) {
  if (!fixture) {
    return {
      accounted: true,
      status: 'failed',
      reason: 'Fixture creation failed before an owned root was available.',
      sourceUnchanged: false,
      fixtureRootRemoved: true,
      projectRootRemoved: true,
      runtimeChanges: [],
      residueAfter: []
    };
  }

  let runtimeChanges = [];
  let sourceUnchanged = false;
  let cleanupError = null;
  try {
    runtimeChanges = diffSnapshots(fixture.initialSnapshot, snapshotTree(fixture.projectRoot));
    sourceUnchanged = digestTree(fixture.sourceRoot) === fixture.sourceDigest;
    removeFixtureRoot(fixture.root);
  } catch (error) {
    cleanupError = error;
  }

  const residueAfter = fs.existsSync(fixture.root)
    ? walk(fixture.root).map((entry) => path.relative(fixture.root, entry).replaceAll(path.sep, '/'))
    : [];
  const fixtureRootRemoved = !fs.existsSync(fixture.root);
  const projectRootRemoved = !fs.existsSync(fixture.projectRoot);
  const passed = !cleanupError && sourceUnchanged && fixtureRootRemoved && projectRootRemoved && residueAfter.length === 0;

  return {
    accounted: true,
    status: passed ? 'passed' : 'failed',
    reason: cleanupError?.message ?? (!sourceUnchanged ? 'Repository sample source changed during native execution.' : null),
    sourceUnchanged,
    fixtureRootRemoved,
    projectRootRemoved,
    runtimeChanges,
    residueAfter
  };
}

function profile({ checks, buildRequired = false, buildReason = null }) {
  return Object.freeze({ checks: Object.freeze(checks), buildRequired, buildReason });
}

function createPrerequisiteCheck(id, platform) {
  const pythonCommand = platform.id === 'windows' ? 'python' : 'python3';
  const definitions = {
    node: { command: 'node', args: ['--version'], requirement: 'Node.js runtime', required: true },
    npm: { command: 'npm', args: ['--version'], requirement: 'npm CLI', required: true },
    python: { command: pythonCommand, args: ['--version'], requirement: 'Python runtime', required: true },
    poetry: { command: 'poetry', args: ['--version'], requirement: 'Poetry CLI', required: true },
    go: { command: 'go', args: ['version'], requirement: 'Go toolchain', required: true },
    java: { command: 'java', args: ['-version'], requirement: 'Java runtime', required: true },
    maven: { command: 'mvn', args: ['--version'], requirement: 'Maven CLI', required: true },
    dotnet: { command: 'dotnet', args: ['--version'], requirement: '.NET SDK', required: true },
    'docker-compose': {
      command: 'docker',
      args: ['compose', 'version'],
      requirement: 'Docker Engine with Docker Compose v2',
      required: true
    },
    'node-optional': { command: 'node', args: ['--version'], requirement: 'Optional host-native Node.js runtime', required: false },
    'npm-optional': { command: 'npm', args: ['--version'], requirement: 'Optional host-native npm CLI', required: false }
  };
  return { id, ...definitions[id] };
}

function setNotRunReason(phases, reason) {
  for (const phase of GALLERY_NATIVE_PHASES) {
    if (phase !== 'cleanup') phases[phase] = { status: 'not-run', reason };
  }
}

function hasSkippedStatus(receipt) {
  if (receipt.status === 'skipped' || receipt.prerequisite.status === 'skipped') return true;
  return Object.values(receipt.phases).some((phase) => phase.status === 'skipped');
}

function snapshotTree(directory) {
  const snapshot = new Map();
  for (const entry of walk(directory)) {
    const relative = path.relative(directory, entry).replaceAll(path.sep, '/');
    const stat = fs.lstatSync(entry);
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not allowed in native fixture: ${relative}`);
    if (stat.isFile()) snapshot.set(relative, digestFile(entry));
  }
  return snapshot;
}

function diffSnapshots(before, after) {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  return paths.flatMap((entryPath) => {
    if (!before.has(entryPath)) return [{ path: entryPath, kind: 'added' }];
    if (!after.has(entryPath)) return [{ path: entryPath, kind: 'deleted' }];
    if (before.get(entryPath) !== after.get(entryPath)) return [{ path: entryPath, kind: 'modified' }];
    return [];
  });
}

function findForbiddenFixtureEntries(projectRoot) {
  return walk(projectRoot)
    .filter((entry) => {
      const base = path.basename(entry).toLowerCase();
      return FORBIDDEN_FIXTURE_NAMES.has(base)
        || ['.db', '.sqlite', '.sqlite3', '.log'].some((suffix) => base.endsWith(suffix));
    })
    .map((entry) => path.relative(projectRoot, entry).replaceAll(path.sep, '/'));
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

function digestFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
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
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, resolved);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith(FIXTURE_PREFIX) ||
      relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean non-owned native matrix fixture root: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

function lifecycleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function currentGalleryNativePlatform() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'linux') return 'linux';
  return process.platform;
}

function boundedOutput(value) {
  const text = String(value ?? '');
  return text.length <= OUTPUT_LIMIT ? text : text.slice(text.length - OUTPUT_LIMIT);
}

function parseJson(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function errorRecord(error) {
  return {
    code: error?.code ?? error?.name ?? 'unknown_error',
    message: error?.message ?? String(error)
  };
}

function quoteForShell(value) {
  return /\s/u.test(value) ? JSON.stringify(value) : value;
}

function firstOutputLine(value) {
  return String(value ?? '').trim().split(/\r?\n/, 1)[0] || null;
}

function formatInvocation(command, args) {
  return [command, ...args].map((part) => /\s/.test(part) ? JSON.stringify(part) : part).join(' ');
}
