import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scheduler } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { copyExample } from '../../src/examples/copy.js';
import { loadCatalog } from '../../src/examples/catalog.js';

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(fixtureDirectory, '../..');

export const GALLERY_LAUNCHDECK_PLATFORMS = Object.freeze(['windows', 'linux']);
export const GALLERY_LAUNCHDECK_PHASES = Object.freeze([
  'doctor',
  'setup',
  'build',
  'test',
  'start',
  'health',
  'stop'
]);

const FIXTURE_PREFIX = 'launchdeck-gallery-matrix-';
const CLI_PATH = path.join(repositoryRoot, 'src', 'cli.js');
const COPY_EXCLUDED_NAMES = new Set(['.launchdeck', 'scratch']);
const OUTPUT_LIMIT = 32_768;

const SAMPLE_PROFILES = Object.freeze({
  'vite-react-habit-tracker': ({ ports }) => ({
    commands: {
      setup: 'npm ci',
      build: 'npm run build',
      test: 'npm test',
      start: `npm run start -- --port ${ports[0]}`
    },
    env: { PORT: String(ports[0]) },
    healthPaths: ['/health.json'],
    clean: ['dist', 'node_modules/.vite']
  }),
  'nextjs-blog-manager': ({ ports }) => ({
    commands: {
      setup: 'npm ci',
      build: 'npm run build',
      test: 'npm test',
      start: 'npm start'
    },
    env: { PORT: String(ports[0]) },
    healthPaths: ['/api/health'],
    clean: ['.next', '.data']
  }),
  'nestjs-url-shortener': ({ ports }) => ({
    commands: {
      setup: 'npm ci',
      build: 'npm run build',
      test: 'npm test',
      start: 'npm start'
    },
    env: { PORT: String(ports[0]) },
    healthPaths: ['/health'],
    clean: ['dist', 'data']
  }),
  'fastapi-inventory': ({ ports }) => ({
    commands: {
      setup: 'poetry install --no-interaction --no-ansi --sync',
      build: 'poetry run python -m compileall inventory_api',
      test: 'poetry run pytest',
      start: 'poetry run python -m inventory_api'
    },
    env: { PORT: String(ports[0]), PYTHONUNBUFFERED: '1' },
    healthPaths: ['/health'],
    clean: ['.pytest_cache', 'data', 'inventory_api/__pycache__', 'tests/__pycache__']
  }),
  'django-events': ({ ports }) => ({
    commands: {
      setup: 'poetry install --no-interaction --no-ansi --sync',
      build: 'poetry run python manage.py check',
      test: 'poetry run python manage.py test',
      start: 'poetry run events-server'
    },
    env: { PORT: String(ports[0]), PYTHONUNBUFFERED: '1' },
    healthPaths: ['/health'],
    clean: ['data', 'eventsite/__pycache__', 'events/__pycache__']
  }),
  'go-webhook-inbox': ({ ports }) => ({
    commands: {
      setup: 'go mod verify',
      build: 'go build ./...',
      test: 'go test ./...',
      start: 'go run ./cmd/inbox'
    },
    env: { PORT: String(ports[0]) },
    healthPaths: ['/health'],
    clean: ['data']
  }),
  'spring-boot-orders': ({ ports }) => ({
    commands: {
      setup: 'mvn -B -ntp -DskipTests dependency:go-offline',
      build: 'mvn -B -ntp -DskipTests package',
      test: 'mvn -B -ntp test',
      start: 'mvn -B -ntp spring-boot:run'
    },
    env: { PORT: String(ports[0]) },
    healthPaths: ['/health'],
    clean: ['data', 'target']
  }),
  'aspnet-library-catalog': ({ ports }) => ({
    commands: {
      setup: 'dotnet restore tests/LibraryCatalog.Tests.csproj --locked-mode',
      build: 'dotnet build --no-restore',
      test: 'dotnet run --no-restore --project tests/LibraryCatalog.Tests.csproj',
      start: 'dotnet run --no-build'
    },
    env: { PORT: String(ports[0]) },
    healthPaths: ['/health'],
    clean: ['bin', 'data', 'obj', 'tests/bin', 'tests/obj']
  }),
  'docker-compose-helpdesk': ({ ports }) => ({
    commands: {
      setup: 'docker compose config --quiet',
      build: 'docker compose build',
      test: process.platform === 'win32'
        ? 'docker compose run --rm --no-deps helpdesk C:/node/npm.cmd test'
        : 'docker compose run --rm --no-deps helpdesk npm test',
      start: 'docker compose up'
    },
    env: {
      HELPDESK_PORT: String(ports[0]),
      HELPDESK_DOCKERFILE: process.platform === 'win32' ? 'Dockerfile.windows' : 'Dockerfile',
      HELPDESK_DATA_FILE: process.platform === 'win32' ? 'C:/app/data/tickets.json' : '/app/data/tickets.json',
      HELPDESK_DATA_TARGET: process.platform === 'win32' ? 'C:/app/data' : '/app/data',
      HELPDESK_NODE_COMMAND: process.platform === 'win32' ? 'C:/node/node.exe' : 'node'
    },
    healthPaths: ['/health'],
    clean: ['data']
  }),
  'node-python-issue-tracker': ({ ports }) => ({
    commands: {
      setup: 'npm ci && poetry install --no-interaction --no-ansi --sync',
      build: 'node --check node/src/server.mjs && poetry run python -m compileall python/issue_tracker',
      test: 'npm run test:all',
      start: 'node .launchdeck-gallery/node-python-supervisor.mjs'
    },
    env: {
      NODE_PORT: String(ports[0]),
      PYTHON_PORT: String(ports[1]),
      PYTHONUNBUFFERED: '1'
    },
    healthPaths: ['/health', '/health'],
    clean: ['.launchdeck-gallery', 'data', 'python/issue_tracker/__pycache__', 'python/tests/__pycache__']
  })
});

export function getGalleryLaunchdeckMatrix({ rootDir = repositoryRoot } = {}) {
  const catalog = loadCatalog({ rootDir });
  return GALLERY_LAUNCHDECK_PLATFORMS.flatMap((platform) => catalog.map((entry) => {
    const profile = profileFor(entry);
    return deepFreeze({
      cellId: `${platform}:${entry.id}`,
      platform,
      sampleId: entry.id,
      sourcePath: entry.sourcePath,
      ports: [...entry.ports],
      healthUrls: profile.healthPaths.map((healthPath, index) =>
        `http://127.0.0.1:${entry.ports[index] ?? entry.ports[0]}${healthPath}`
      ),
      taskCommands: { ...profile.commands },
      taskEnv: { ...profile.env },
      requiredPhases: [...GALLERY_LAUNCHDECK_PHASES],
      config: launchdeckConfig(entry, profile)
    });
  }));
}

export function createGalleryLaunchdeckFixture({
  cell,
  sampleId,
  platform,
  rootDir = repositoryRoot
} = {}) {
  const selectedCell = resolveCell({ cell, sampleId, platform, rootDir });
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX)));
  const projectRoot = path.join(root, 'sample-copy');
  const homeDir = path.join(root, 'launchdeck-home');
  const externalFixtureRoot = path.join(root, 'external-fixture');
  const scratchRoot = path.join(root, 'scratch');
  fs.mkdirSync(externalFixtureRoot);
  fs.mkdirSync(scratchRoot);

  try {
    const sourceRoot = path.resolve(rootDir, selectedCell.sourcePath);
    const sourceDigest = digestTree(sourceRoot);
    const sourceResidueBefore = findSourceResidue(sourceRoot);
    const copied = copyExampleWithBoundedPublishRetry({
      id: selectedCell.sampleId,
      destination: projectRoot,
      rootDir,
      copyTree: copyTreeWithoutFixtureState
    });
    const copyReceipt = copied.receipt;
    const copyAttempts = copied.attempts;
    const copyDigest = digestTree(projectRoot);
    const copyPolicy = {
      excludedNames: [...COPY_EXCLUDED_NAMES].sort(),
      scratchAbsent: !fs.existsSync(path.join(projectRoot, 'scratch')),
      launchdeckStateAbsent: !fs.existsSync(path.join(projectRoot, '.launchdeck')),
      verified: !fs.existsSync(path.join(projectRoot, 'scratch')) &&
        !fs.existsSync(path.join(projectRoot, '.launchdeck'))
    };
    writeFixtureSupportFiles(selectedCell, projectRoot);
    const configPath = path.join(projectRoot, '.launchdeck.yml');
    fs.writeFileSync(configPath, selectedCell.config, 'utf8');

    let cleaned = false;
    return {
      cell: selectedCell,
      root,
      projectRoot,
      homeDir,
      externalFixtureRoot,
      scratchRoot,
      sourceRoot,
      sourceDigest,
      sourceResidueBefore,
      copyDigest,
      configPath,
      copyReceipt,
      copyAttempts,
      copyPolicy,
      cleanup() {
        let sourceDigestAfter = null;
        let sourceResidueAfter = [];
        let verificationError = null;
        let removalError = null;
        try {
          sourceDigestAfter = digestTree(sourceRoot);
          sourceResidueAfter = findSourceResidue(sourceRoot);
        } catch (error) {
          verificationError = errorRecord(error);
        } finally {
          if (!cleaned) {
            try {
              assertOwnedFixtureRoot(root);
              fs.rmSync(root, { recursive: true, force: true });
              cleaned = true;
            } catch (error) {
              removalError = errorRecord(error);
            }
          }
        }
        const sourceUnchanged = verificationError === null && sourceDigestAfter === sourceDigest;
        const rootRemoved = !fs.existsSync(root);
        const projectConfigRemoved = !fs.existsSync(configPath);
        const homeRemoved = !fs.existsSync(homeDir);
        const sourcePure = verificationError === null && sourceResidueAfter.length === 0;
        return {
          ok: sourceUnchanged && sourcePure && rootRemoved && projectConfigRemoved && homeRemoved && removalError === null,
          sourceUnchanged,
          sourcePure,
          sourceDigestAfter,
          sourceResidueBefore,
          sourceResidueAfter,
          rootRemoved,
          projectConfigRemoved,
          homeRemoved,
          residueFree: rootRemoved && sourcePure,
          verificationError,
          removalError
        };
      }
    };
  } catch (error) {
    assertOwnedFixtureRoot(root);
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export async function runGalleryLaunchdeckCell({
  cell,
  sampleId,
  platform,
  rootDir = repositoryRoot,
  consumer = undefined
} = {}) {
  const selectedCell = resolveCell({ cell, sampleId, platform, rootDir });
  const fixture = createGalleryLaunchdeckFixture({ cell: selectedCell, rootDir });
  const selectedConsumer = consumer ?? realLaunchdeckConsumer();
  const receipt = createReceipt(selectedCell, fixture, selectedConsumer);
  let failure = null;
  let startAttempted = false;

  try {
    assertConsumer(selectedConsumer, selectedCell);

    for (const phase of ['doctor', 'setup', 'build', 'test']) {
      await executeLaunchdeckPhase(phase, selectedConsumer, selectedCell, fixture, receipt);
    }

    startAttempted = true;
    await executeLaunchdeckPhase('start', selectedConsumer, selectedCell, fixture, receipt);
    await executeHealthPhase(selectedConsumer, selectedCell, fixture, receipt);
  } catch (error) {
    failure = normalizeFailure(error, selectedCell);
  } finally {
    if (startAttempted) {
      try {
        await executeLaunchdeckPhase('stop', selectedConsumer, selectedCell, fixture, receipt);
        await cleanupExternalResources(selectedConsumer, selectedCell, fixture, receipt);
        await verifyReleasedPorts(selectedConsumer, selectedCell, fixture, receipt);
      } catch (error) {
        failure ??= normalizeFailure(error, selectedCell);
      }
    } else {
      receipt.phases.stop = {
        status: 'blocked',
        diagnostics: { reason: 'lifecycle_did_not_reach_start' }
      };
    }

    markBlockedPhases(receipt, failure);
    try {
      receipt.receiptEvidence = persistReceipt(fixture, receipt);
    } catch (error) {
      failure ??= normalizeFailure(error, selectedCell);
      receipt.receiptEvidence = {
        path: path.join(fixture.externalFixtureRoot, 'launchdeck-receipt.json'),
        written: false,
        bytes: 0,
        digest: null,
        error: errorRecord(error),
        removedByCleanup: false
      };
    }
    try {
      receipt.cleanup = fixture.cleanup();
    } catch (error) {
      failure ??= normalizeFailure(error, selectedCell);
      receipt.cleanup = {
        ok: false,
        sourceUnchanged: false,
        sourcePure: false,
        rootRemoved: !fs.existsSync(fixture.root),
        projectConfigRemoved: !fs.existsSync(fixture.configPath),
        homeRemoved: !fs.existsSync(fixture.homeDir),
        residueFree: !fs.existsSync(fixture.root),
        error: errorRecord(error)
      };
    }
    receipt.receiptEvidence.removedByCleanup = !fs.existsSync(receipt.receiptEvidence.path);
    receipt.sourceMutated = receipt.cleanup.sourceUnchanged !== true;
    receipt.sideEffects = {
      temporaryCopyCreated: true,
      externalConfigCreated: true,
      isolatedHomeUsed: receipt.invocations.every((entry) => entry.env.LAUNCHDECK_HOME === fixture.homeDir),
      receiptWritten: receipt.receiptEvidence.written,
      receiptRemoved: receipt.receiptEvidence.removedByCleanup,
      sourceUnchanged: receipt.cleanup.sourceUnchanged,
      sourcePure: receipt.cleanup.sourcePure,
      residueFree: receipt.cleanup.residueFree
    };
    if (!receipt.cleanup.ok) {
      failure ??= galleryError(
        'gallery_cleanup_failed',
        `Cleanup or source-purity verification failed for '${selectedCell.cellId}'.`
      );
    }
  }

  if (failure) {
    failure.receipt = receipt;
    throw failure;
  }
  return receipt;
}

export async function runGalleryLaunchdeckLiveMatrix({ rootDir = repositoryRoot } = {}) {
  const platform = currentGalleryPlatform();
  if (!GALLERY_LAUNCHDECK_PLATFORMS.includes(platform)) {
    throw galleryError('gallery_platform_unsupported', `Launchdeck gallery live matrix does not support ${process.platform}.`);
  }

  const cells = getGalleryLaunchdeckMatrix({ rootDir }).filter((cell) => cell.platform === platform);
  const receipts = [];
  for (const cell of cells) {
    receipts.push(await runGalleryLaunchdeckCell({ cell, rootDir }));
  }
  return {
    denominator: {
      catalogEntries: new Set(cells.map((cell) => cell.sampleId)).size,
      platforms: 1,
      cells: cells.length
    },
    platform,
    receipts,
    summary: {
      completed: receipts.length,
      passed: receipts.length,
      failed: 0,
      cleanupAccounted: receipts.filter((receipt) => receipt.cleanup).length,
      cleanupFailed: receipts.filter((receipt) => receipt.cleanup?.ok !== true).length,
      portReleaseAccounted: receipts.filter((receipt) => receipt.portRelease.length === receipt.ports.length).length
    }
  };
}

function profileFor(entry) {
  const factory = SAMPLE_PROFILES[entry.id];
  if (!factory) {
    throw galleryError('gallery_profile_missing', `Launchdeck profile is missing for '${entry.id}'.`);
  }
  return factory(entry);
}

function resolveCell({ cell, sampleId, platform, rootDir }) {
  if (cell) return cell;
  const selectedPlatform = platform ?? currentGalleryPlatform();
  const selected = getGalleryLaunchdeckMatrix({ rootDir }).find((candidate) =>
    candidate.sampleId === sampleId && candidate.platform === selectedPlatform
  );
  if (!selected) {
    throw galleryError(
      'gallery_cell_not_found',
      `Launchdeck matrix cell '${selectedPlatform}:${sampleId ?? ''}' does not exist.`
    );
  }
  return selected;
}

function launchdeckConfig(entry, profile) {
  const task = (name, { longRunning = false } = {}) => {
    const lines = [
      `  ${name}:`,
      `    command: ${yamlString(profile.commands[name])}`,
      `    description: ${yamlString(`${name} ${entry.id} in an isolated gallery copy`)}`,
      '    risk: medium'
    ];
    if (longRunning) {
      lines.push('    longRunning: true');
      lines.push(`    ports: [${entry.ports.join(', ')}]`);
      lines.push('    env:');
      for (const [key, value] of Object.entries(profile.env)) {
        lines.push(`      ${key}: ${yamlString(value)}`);
      }
      lines.push('    log: .launchdeck/logs/start.log');
    }
    return lines.join('\n');
  };

  return `version: 1
project:
  name: gallery-${entry.id}
tasks:
${task('setup')}
${task('build')}
${task('test')}
${task('start', { longRunning: true })}
clean:
  safe:
${profile.clean.map((entryPath) => `    - ${yamlString(entryPath)}`).join('\n')}
`;
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function writeFixtureSupportFiles(cell, projectRoot) {
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

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(command, ['start'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.NODE_PORT }
  }),
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

function createReceipt(cell, fixture, consumer) {
  return {
    schemaVersion: 1,
    kind: 'launchdeck-gallery-cell-receipt',
    cellId: cell.cellId,
    sampleId: cell.sampleId,
    targetPlatform: cell.platform,
    runtimePlatform: currentGalleryPlatform(),
    consumer: {
      kind: consumer?.kind ?? 'unknown',
      platform: consumer?.platform ?? null
    },
    projectRoot: fixture.projectRoot,
    sourceRoot: fixture.sourceRoot,
    externalFixtureRoot: fixture.externalFixtureRoot,
    homeDir: fixture.homeDir,
    configPath: fixture.configPath,
    sourceDigest: fixture.sourceDigest,
    copyDigest: fixture.copyDigest,
    copyAttempts: fixture.copyAttempts,
    copyPolicy: fixture.copyPolicy,
    configDigest: digestText(cell.config),
    ports: [...cell.ports],
    phases: Object.fromEntries(GALLERY_LAUNCHDECK_PHASES.map((phase) => [
      phase,
      { status: 'pending' }
    ])),
    invocations: [],
    commands: [],
    healthChecks: [],
    portRelease: []
  };
}

function assertConsumer(consumer, cell) {
  if (!consumer || typeof consumer.invokeLaunchdeck !== 'function' ||
      typeof consumer.probeHealth !== 'function' ||
      typeof consumer.verifyPortReleased !== 'function') {
    throw galleryError('gallery_consumer_invalid', 'Launchdeck matrix consumer is incomplete.');
  }
  if (consumer.platform !== cell.platform) {
    throw galleryError(
      'gallery_platform_mismatch',
      `Cell '${cell.cellId}' requires ${cell.platform}, but the consumer is ${consumer.platform ?? 'unknown'}.`
    );
  }
}

async function executeLaunchdeckPhase(phase, consumer, cell, fixture, receipt) {
  const args = launchdeckArgs(phase);
  const invocation = {
    cellId: cell.cellId,
    phase,
    executable: process.execPath,
    cliPath: CLI_PATH,
    args,
    command: formatCommand([process.execPath, CLI_PATH, ...args]),
    cwd: fixture.projectRoot,
    projectRoot: fixture.projectRoot,
    homeDir: fixture.homeDir,
    env: {
      ...process.env,
      ...cell.taskEnv,
      LAUNCHDECK_HOME: fixture.homeDir
    }
  };

  let rawResult;
  try {
    rawResult = await consumer.invokeLaunchdeck(invocation);
  } catch (error) {
    rawResult = {
      status: 1,
      stdout: '',
      stderr: error?.message ?? String(error),
      diagnostics: { code: error?.code ?? 'consumer_invocation_failed' }
    };
  }
  const result = normalizeInvocationResult(rawResult, invocation);
  receipt.invocations.push(result);
  receipt.commands.push(result.command);
  receipt.phases[phase] = {
    status: result.status === 0 ? 'passed' : 'failed',
    result
  };
  if (result.status !== 0) {
    throw galleryError(
      'gallery_phase_failed',
      `Launchdeck ${phase} failed for '${cell.cellId}' with status ${result.status}.`
    );
  }
}

async function executeHealthPhase(consumer, cell, fixture, receipt) {
  const checks = [];
  for (const url of cell.healthUrls) {
    let check;
    try {
      check = await consumer.probeHealth({
        cellId: cell.cellId,
        sampleId: cell.sampleId,
        targetPlatform: cell.platform,
        url,
        projectRoot: fixture.projectRoot,
        homeDir: fixture.homeDir
      });
    } catch (error) {
      check = {
        ok: false,
        url,
        error: { code: error?.code ?? 'health_probe_failed', message: error?.message ?? String(error) }
      };
    }
    checks.push(deepFreeze({ ...check, url: check?.url ?? url }));
  }
  receipt.healthChecks = checks;
  receipt.phases.health = {
    status: checks.length === cell.healthUrls.length && checks.every((check) => check.ok === true)
      ? 'passed'
      : 'failed',
    checks
  };
  if (receipt.phases.health.status !== 'passed') {
    throw galleryError('gallery_health_failed', `Health verification failed for '${cell.cellId}'.`);
  }
}

async function verifyReleasedPorts(consumer, cell, fixture, receipt) {
  const checks = [];
  for (const port of cell.ports) {
    const result = await consumer.verifyPortReleased({
      cellId: cell.cellId,
      sampleId: cell.sampleId,
      targetPlatform: cell.platform,
      port,
      projectRoot: fixture.projectRoot,
      homeDir: fixture.homeDir
    });
    checks.push({ ...result, port: result?.port ?? port });
  }
  receipt.portRelease = checks;
  if (checks.some((check) => check.released !== true)) {
    throw galleryError('gallery_port_residue', `A declared port remained occupied for '${cell.cellId}'.`);
  }
}

async function cleanupExternalResources(consumer, cell, fixture, receipt) {
  if (typeof consumer.cleanupCell !== 'function') return;
  const result = await consumer.cleanupCell({
    cellId: cell.cellId,
    sampleId: cell.sampleId,
    targetPlatform: cell.platform,
    projectRoot: fixture.projectRoot,
    homeDir: fixture.homeDir,
    env: {
      ...process.env,
      ...cell.taskEnv,
      LAUNCHDECK_HOME: fixture.homeDir
    }
  });
  receipt.externalCleanup = result;
  if (result?.status !== 0) {
    throw galleryError(
      'gallery_external_cleanup_failed',
      `External resource cleanup failed for '${cell.cellId}'.`
    );
  }
}

function launchdeckArgs(phase) {
  if (phase === 'doctor') return ['doctor', '--json', '--compact'];
  if (phase === 'start') return ['start', 'start', '--json', '--compact'];
  if (phase === 'stop') return ['stop', 'start', '--json', '--compact'];
  return ['run', phase, '--json', '--compact'];
}

function normalizeInvocationResult(result, invocation) {
  const status = Number.isInteger(result?.status) ? result.status : 1;
  const stdout = boundedOutput(result?.stdout);
  const stderr = boundedOutput(result?.stderr);
  return deepFreeze({
    phase: invocation.phase,
    command: invocation.command,
    argv: [invocation.executable, invocation.cliPath, ...invocation.args],
    cwd: invocation.cwd,
    env: {
      LAUNCHDECK_HOME: invocation.homeDir,
      ...Object.fromEntries(Object.keys(invocation.env)
        .filter((key) => key in invocation.env && key !== 'LAUNCHDECK_HOME' && key in (invocation.env ?? {}))
        .filter((key) => ['PORT', 'NODE_PORT', 'PYTHON_PORT', 'HELPDESK_PORT', 'PYTHONUNBUFFERED'].includes(key))
        .map((key) => [key, invocation.env[key]]))
    },
    status,
    signal: result?.signal ?? null,
    stdout,
    stderr,
    diagnostics: result?.diagnostics ?? parseJson(stdout)
  });
}

function realLaunchdeckConsumer() {
  return {
    kind: 'external-launchdeck-cli',
    platform: currentGalleryPlatform(),
    invokeLaunchdeck(invocation) {
      const timeout = ['setup', 'build', 'test'].includes(invocation.phase) ? 600_000 : 120_000;
      const result = spawnSync(invocation.executable, [invocation.cliPath, ...invocation.args], {
        cwd: invocation.cwd,
        env: invocation.env,
        encoding: 'utf8',
        windowsHide: true,
        timeout,
        maxBuffer: OUTPUT_LIMIT * 2
      });
      return {
        status: result.status ?? 1,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        diagnostics: result.error ? {
          code: result.error.code ?? result.error.name,
          message: result.error.message
        } : undefined
      };
    },
    probeHealth: probeHttpHealth,
    verifyPortReleased,
    cleanupCell({ sampleId, projectRoot, env }) {
      if (sampleId !== 'docker-compose-helpdesk') {
        return { status: 0, required: false };
      }
      const result = spawnSync('docker', ['compose', 'down', '--remove-orphans'], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 120_000,
        maxBuffer: OUTPUT_LIMIT * 2
      });
      return {
        status: result.status ?? 1,
        required: true,
        command: 'docker compose down --remove-orphans',
        stdout: boundedOutput(result.stdout),
        stderr: boundedOutput(result.stderr),
        diagnostics: result.error ? errorRecord(result.error) : null
      };
    }
  };
}

async function probeHttpHealth({ url }) {
  const attempts = [];
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      const text = await response.text();
      const body = parseJson(text) ?? text;
      attempts.push({ attempt, status: response.status });
      if (response.ok) {
        return { ok: true, status: response.status, url, body, attempts };
      }
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
    if (!(await canConnect(port))) {
      return { released: true, port, attempts: attempt };
    }
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

function persistReceipt(fixture, receipt) {
  const receiptPath = path.join(fixture.externalFixtureRoot, 'launchdeck-receipt.json');
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  fs.writeFileSync(receiptPath, serialized, 'utf8');
  return {
    path: receiptPath,
    written: fs.existsSync(receiptPath),
    bytes: Buffer.byteLength(serialized),
    digest: digestText(serialized),
    removedByCleanup: false
  };
}

function markBlockedPhases(receipt, failure) {
  for (const phase of GALLERY_LAUNCHDECK_PHASES) {
    if (receipt.phases[phase].status === 'pending') {
      receipt.phases[phase] = {
        status: 'blocked',
        diagnostics: { cause: failure?.code ?? 'lifecycle_incomplete' }
      };
    }
  }
}

function normalizeFailure(error, cell) {
  if (error instanceof Error) return error;
  return galleryError('gallery_cell_failed', `Launchdeck matrix cell '${cell.cellId}' failed: ${String(error)}`);
}

function copyTreeWithoutFixtureState(sourceRoot, destinationRoot) {
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const normalizedName = entry.name.toLowerCase();
    if (COPY_EXCLUDED_NAMES.has(normalizedName) || normalizedName.startsWith('.launchdeck.')) {
      continue;
    }
    const sourcePath = path.join(sourceRoot, entry.name);
    const destinationPath = path.join(destinationRoot, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destinationPath);
      copyTreeWithoutFixtureState(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
    } else {
      throw galleryError('gallery_source_type_invalid', `Unsupported source entry '${sourcePath}'.`);
    }
  }
}

function copyExampleWithBoundedPublishRetry(request) {
  const attempts = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const receipt = copyExample(request);
      attempts.push({ attempt, status: 'passed' });
      return { receipt, attempts };
    } catch (error) {
      const retryable = attempt === 1 && safePublishRetry(error, request.destination);
      attempts.push({
        attempt,
        status: 'failed',
        code: error?.code ?? 'unknown_error',
        phase: error?.details?.phase ?? null,
        cause: error?.details?.cause ?? null,
        cleanup: error?.details?.cleanup ?? null,
        retryable
      });
      if (!retryable) {
        error.copyAttempts = attempts;
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  throw galleryError('gallery_copy_failed', `Unable to copy '${request.id}'.`);
}

function safePublishRetry(error, destination) {
  if (error?.code !== 'example_publish_failed' || fs.existsSync(destination)) return false;
  const cleanup = error?.details?.cleanup;
  if (!cleanup || typeof cleanup !== 'object') return false;
  const safeStatuses = new Set(['absent', 'removed', 'not-owned']);
  return ['staging', 'destination', 'lock'].every((key) => safeStatuses.has(cleanup[key]?.status));
}

function findSourceResidue(sourceRoot) {
  return walk(sourceRoot)
    .map((entryPath) => path.relative(sourceRoot, entryPath).replaceAll(path.sep, '/'))
    .filter((relativePath) => relativePath.split('/').some((segment) => {
      const normalized = segment.toLowerCase();
      return normalized === '.launchdeck' || normalized.startsWith('.launchdeck.');
    }))
    .sort();
}

function digestTree(directory) {
  const hash = crypto.createHash('sha256');
  for (const file of walk(directory).sort()) {
    const relative = path.relative(directory, file).replaceAll(path.sep, '/');
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function digestText(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}

function assertOwnedFixtureRoot(root) {
  const resolvedRoot = path.resolve(root);
  const temporaryRoot = fs.realpathSync.native(path.resolve(os.tmpdir()));
  if (path.dirname(resolvedRoot) !== temporaryRoot || !path.basename(resolvedRoot).startsWith(FIXTURE_PREFIX)) {
    throw galleryError('gallery_cleanup_refused', `Refusing to remove unowned fixture root '${resolvedRoot}'.`);
  }
}

function currentGalleryPlatform() {
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

function formatCommand(parts) {
  return parts.map((part) => /[\s"]/u.test(part) ? JSON.stringify(part) : part).join(' ');
}

function galleryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function errorRecord(error) {
  return {
    code: error?.code ?? error?.name ?? 'unknown_error',
    message: error?.message ?? String(error)
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
