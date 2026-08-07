import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { copyExample } from '../../src/examples/copy.js';
import { loadCatalog } from '../../src/examples/catalog.js';

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(fixtureDirectory, '../..');
export const FASTAPI_ID = 'fastapi-inventory';
export const FASTAPI_LAUNCHDECK_PHASES = Object.freeze([
  'copy',
  'config',
  'doctor',
  'setup',
  'build',
  'test',
  'start',
  'health',
  'stop',
  'cleanup'
]);

const FIXTURE_PREFIX = 'launchdeck-gallery-fastapi-launchdeck-';
const CLI_PATH = path.join(repositoryRoot, 'src', 'cli.js');

export function getFastApiLaunchdeckContract({ rootDir = repositoryRoot } = {}) {
  const catalog = loadCatalog({ rootDir });
  const entry = catalog.find((candidate) => candidate.id === FASTAPI_ID);
  if (!entry) throw new Error(`Catalog entry '${FASTAPI_ID}' is missing.`);

  return {
    id: entry.id,
    sourcePath: entry.sourcePath,
    defaultPort: entry.ports[0],
    requiredPhases: [...FASTAPI_LAUNCHDECK_PHASES],
    configLocation: 'isolated copied project, never the packaged source root',
    homeLocation: 'isolated LAUNCHDECK_HOME sibling directory',
    config: launchdeckConfig(entry.ports[0])
  };
}

export function createFastApiLaunchdeckFixture({ rootDir = repositoryRoot } = {}) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX)));
  const projectRoot = path.join(root, 'sample-copy');
  const homeDir = path.join(root, 'launchdeck-home');
  const externalFixtureRoot = path.join(root, 'external-fixture');
  fs.mkdirSync(externalFixtureRoot);

  try {
    const catalog = loadCatalog({ rootDir });
    const entry = catalog.find((candidate) => candidate.id === FASTAPI_ID);
    if (!entry) throw new Error(`Catalog entry '${FASTAPI_ID}' is missing.`);
    const sourceRoot = path.resolve(rootDir, entry.sourcePath);
    const sourceDigest = digestTree(sourceRoot);
    const copyReceipt = copyExample({
      id: FASTAPI_ID,
      destination: projectRoot,
      rootDir,
      catalog
    });
    const configPath = path.join(projectRoot, '.launchdeck.yml');
    fs.writeFileSync(configPath, launchdeckConfig(entry.ports[0]), 'utf8');

    return {
      root,
      projectRoot,
      homeDir,
      externalFixtureRoot,
      sourceRoot,
      sourceDigest,
      configPath,
      copyReceipt,
      cleanup() {
        const sourceUnchanged = digestTree(sourceRoot) === sourceDigest;
        fs.rmSync(root, { recursive: true, force: true });
        return {
          ok: sourceUnchanged && !fs.existsSync(root),
          sourceUnchanged,
          rootRemoved: !fs.existsSync(root),
          projectConfigRemoved: !fs.existsSync(configPath)
        };
      }
    };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

export function runFastApiLaunchdeckLifecycle({
  rootDir = repositoryRoot,
  execute = false,
  port = null
} = {}) {
  const fixture = createFastApiLaunchdeckFixture({ rootDir });
  const selectedPort = port ?? loadCatalog({ rootDir })
    .find((entry) => entry.id === FASTAPI_ID).ports[0];
  const receipt = {
    sampleId: FASTAPI_ID,
    platform: process.platform,
    projectRoot: fixture.projectRoot,
    sourceRoot: fixture.sourceRoot,
    externalFixtureRoot: fixture.externalFixtureRoot,
    homeDir: fixture.homeDir,
    configPath: fixture.configPath,
    sourceDigest: fixture.sourceDigest,
    phases: Object.fromEntries(FASTAPI_LAUNCHDECK_PHASES.map((phase) => [
      phase,
      { status: execute ? 'not-run' : 'contract-only' }
    ])),
    port: selectedPort,
    commands: []
  };

  try {
    if (execute) {
      for (const [phase, args] of [
        ['doctor', ['doctor', '--json']],
        ['setup', ['run', 'setup', '--json']],
        ['build', ['run', 'build', '--json']],
        ['test', ['run', 'test', '--json']]
      ]) {
        const result = invokeLaunchdeck(args, fixture, selectedPort);
        receipt.commands.push(result);
        receipt.phases[phase] = { status: result.status === 0 ? 'passed' : 'failed', result };
        if (result.status !== 0) break;
      }
    }
  } finally {
    receipt.cleanup = fixture.cleanup();
    receipt.phases.cleanup = { status: receipt.cleanup.ok ? 'passed' : 'failed', ...receipt.cleanup };
  }

  receipt.sourceMutated = receipt.cleanup.sourceUnchanged !== true;
  return receipt;
}

export const createGalleryFastApiLaunchdeckFixture = createFastApiLaunchdeckFixture;
export const runGalleryFastApiLaunchdeckLifecycle = runFastApiLaunchdeckLifecycle;

function invokeLaunchdeck(args, fixture, port) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: fixture.projectRoot,
    env: {
      ...process.env,
      LAUNCHDECK_HOME: fixture.homeDir,
      PORT: String(port),
      PYTHONUNBUFFERED: '1'
    },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000
  });
  return {
    command: ['node', CLI_PATH, ...args].join(' '),
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function launchdeckConfig(port) {
  return `version: 1
project:
  name: gallery-fastapi-inventory
tasks:
  setup:
    command: poetry install --no-interaction --no-ansi --sync
    description: Install the copied sample dependencies
    risk: medium
  build:
    command: python -m compileall inventory_api
    description: Compile the copied sample sources
  test:
    command: poetry run pytest
    description: Run the copied sample tests
  start:
    command: poetry run python -m inventory_api
    description: Start the copied sample API
    longRunning: true
    ports: [${port}]
    env:
      PORT: "${port}"
    log: .launchdeck/logs/start.log
clean:
  safe:
    - __pycache__
    - .pytest_cache
    - data
`;
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

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}
