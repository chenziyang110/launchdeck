import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FASTAPI_NATIVE_PHASES,
  getFastApiNativeContract,
  getPoetryAvailability
} from './fixtures/gallery-fastapi-native.js';
import {
  FASTAPI_LAUNCHDECK_PHASES,
  getFastApiLaunchdeckContract,
  runFastApiLaunchdeckLifecycle
} from './fixtures/gallery-fastapi-launchdeck.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..');
const cliPath = path.join(repositoryRoot, 'src', 'cli.js');
const sourceRoot = path.join(
  repositoryRoot,
  'examples',
  'sample-projects',
  'fastapi-inventory'
);
const TEMP_PREFIX = 'launchdeck-quickstart-gallery-';
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/u;
const PROMPT_PATTERN = /(?:select an example|choose an example|search examples|press enter|[❯›])/iu;

test('quickstart materializes the real FastAPI list/copy consumer evidence', (t) => {
  const tempRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX)));
  const destination = path.join(tempRoot, 'fastapi-inventory');
  const isolatedHome = path.join(tempRoot, 'launchdeck-home');
  const sourceBefore = snapshotTree(sourceRoot);
  let evidence;
  let cleanupEvidence;

  try {
    const list = invokeExample(['example', 'list', '--json'], {
      isolatedHome
    });
    const listEnvelope = assertSingleJsonEnvelope(list, 'example list');
    const fastApiRow = listEnvelope.entries.find((entry) => entry.id === 'fastapi-inventory');

    assert.equal(list.status, 0, list.stderr);
    assert.equal(listEnvelope.schemaVersion, 1);
    assert.deepEqual(fastApiRow, {
      id: 'fastapi-inventory',
      title: 'FastAPI Inventory',
      stack: 'FastAPI',
      theme: 'inventory',
      requirements: [
        'Python 3.11, 3.12, or 3.13',
        'Poetry 2.x'
      ],
      ports: [8104],
      sourcePath: 'examples/sample-projects/fastapi-inventory'
    });
    assert.deepEqual(fs.readdirSync(tempRoot), [], 'example list must be side-effect free');

    const copy = invokeExample([
      'example',
      'copy',
      'fastapi-inventory',
      destination,
      '--json'
    ], { isolatedHome });
    const copyEnvelope = assertSingleJsonEnvelope(copy, 'example copy');

    assert.equal(copy.status, 0, copy.stderr);
    assert.equal(copyEnvelope.schemaVersion, 1);
    assert.equal(JSON.stringify(copyEnvelope).includes('fastapi-inventory'), true);
    assert.equal(envelopeStrings(copyEnvelope).includes(path.resolve(destination)), true);
    assert.deepEqual(
      fs.readdirSync(tempRoot).sort(),
      ['fastapi-inventory'],
      'copy must leave only the atomically published destination'
    );
    assert.equal(fs.existsSync(isolatedHome), false);

    const copied = snapshotTree(destination);
    assert.deepEqual(copied.entries, sourceBefore.entries);
    assert.equal(copied.digest, sourceBefore.digest);
    assertFastApiContents(destination, copied.entries);
    assert.deepEqual(snapshotTree(sourceRoot), sourceBefore);

    evidence = {
      invocation: [
        'launchdeck example list --json',
        'launchdeck example copy fastapi-inventory <owned-temp>/fastapi-inventory --json'
      ],
      runtime: {
        platform: process.platform,
        node: process.version,
        list: { exitCode: list.status, signal: list.signal, durationMs: list.durationMs },
        copy: { exitCode: copy.status, signal: copy.signal, durationMs: copy.durationMs }
      },
      sideEffect: {
        listCreatedEntries: 0,
        copyCreatedEntries: ['fastapi-inventory'],
        isolatedHomeCreated: false,
        stagingOrLockResidue: false,
        networkInstallInvoked: false,
        sourceDigestBefore: sourceBefore.digest,
        copyDigest: copied.digest,
        sourceUnchanged: true
      }
    };
  } finally {
    const sourceAfter = snapshotTree(sourceRoot);
    removeOwnedTempRoot(tempRoot);
    cleanupEvidence = {
      sourceDigestAfter: sourceAfter.digest,
      sourceUnchanged: sourceAfter.digest === sourceBefore.digest,
      ownedTempRemoved: !fs.existsSync(tempRoot)
    };
    assert.deepEqual(sourceAfter, sourceBefore);
    assert.equal(cleanupEvidence.ownedTempRemoved, true);
  }

  t.diagnostic(`T029 quickstart evidence ${JSON.stringify({ ...evidence, cleanup: cleanupEvidence })}`);
});

test('quickstart links native lifecycle evidence without installing a missing toolchain', (t) => {
  const contract = getFastApiNativeContract({ rootDir: repositoryRoot });
  const poetry = getPoetryAvailability();
  const owningTest = readTestFile('test/gallery-fastapi-native.test.js');

  assert.equal(contract.id, 'fastapi-inventory');
  assert.deepEqual(contract.requiredPhases, FASTAPI_NATIVE_PHASES);
  assert.deepEqual(contract.commands.install, [
    'poetry', 'install', '--no-interaction', '--no-ansi', '--sync'
  ]);
  assert.deepEqual(contract.commands.test, ['poetry', 'run', 'pytest']);
  assert.deepEqual(contract.health.expected, {
    status: 'ok',
    service: 'fastapi-inventory',
    database: 'sqlite',
    seededItems: 3
  });
  assert.match(owningTest, /skip: poetry\.available \? false/);
  assert.match(owningTest, /runFastApiNativeLifecycle\(\)/);
  assert.equal(typeof poetry.available, 'boolean');
  assert.equal(poetry.available ? typeof poetry.version === 'string' : poetry.version === null, true);

  t.diagnostic(`T022 native evidence ${JSON.stringify({
    prerequisiteAvailable: poetry.available,
    prerequisiteReason: poetry.reason,
    phases: contract.requiredPhases,
    lifecycleExecutedByT029: false,
    networkInstallInvokedByT029: false
  })}`);
});

test('quickstart links the external Launchdeck lifecycle contract without a false runtime claim', (t) => {
  const contract = getFastApiLaunchdeckContract({ rootDir: repositoryRoot });
  const owningTest = readTestFile('test/gallery-fastapi-launchdeck.test.js');
  const receipt = runFastApiLaunchdeckLifecycle({
    rootDir: repositoryRoot,
    execute: false
  });

  assert.equal(contract.id, 'fastapi-inventory');
  assert.deepEqual(contract.requiredPhases, FASTAPI_LAUNCHDECK_PHASES);
  assert.match(owningTest, /runFastApiLaunchdeckLifecycle\(\{ execute: false \}\)/);
  assert.match(owningTest, /contract-only/);
  assert.deepEqual(Object.keys(receipt.phases), FASTAPI_LAUNCHDECK_PHASES);
  assert.equal(receipt.phases.doctor.status, 'contract-only');
  assert.equal(receipt.phases.cleanup.status, 'passed');
  assert.equal(receipt.cleanup.sourceUnchanged, true);
  assert.equal(receipt.cleanup.rootRemoved, true);
  assert.equal(receipt.sourceMutated, false);

  t.diagnostic(`T023 external Launchdeck evidence ${JSON.stringify({
    phases: contract.requiredPhases,
    contractFixtureExecuted: true,
    lifecycleExecutedByT029: false,
    sourceUnchanged: receipt.cleanup.sourceUnchanged,
    ownedTempRemoved: receipt.cleanup.rootRemoved
  })}`);
});

function invokeExample(args, { isolatedHome }) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '0',
      LAUNCHDECK_HOME: isolatedHome,
      NO_COLOR: '1',
      TERM: 'dumb'
    },
    encoding: 'utf8',
    input: '',
    timeout: 15_000,
    windowsHide: true
  });
  return {
    ...result,
    durationMs: Date.now() - startedAt,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

function assertSingleJsonEnvelope(result, expectedCommand) {
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null);
  const output = result.stdout.trim();
  assert.notEqual(output, '');
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, ANSI_PATTERN);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, PROMPT_PATTERN);
  assert.equal((output.match(/"schemaVersion"\s*:/g) ?? []).length, 1);
  const envelope = JSON.parse(output);
  assert.equal(typeof envelope, 'object');
  assert.equal(Array.isArray(envelope), false);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.command, expectedCommand);
  return envelope;
}

function assertFastApiContents(projectRoot, inventory) {
  const relativePaths = inventory.map((entry) => entry.path);
  const license = fs.readFileSync(path.join(projectRoot, 'LICENSE'), 'utf8');
  const lock = fs.readFileSync(path.join(projectRoot, 'poetry.lock'), 'utf8');
  const pyproject = fs.readFileSync(path.join(projectRoot, 'pyproject.toml'), 'utf8');
  const seed = fs.readFileSync(path.join(projectRoot, 'inventory_api', 'seed.py'), 'utf8');
  const api = fs.readFileSync(path.join(projectRoot, 'inventory_api', 'main.py'), 'utf8');
  const nativeTests = fs.readFileSync(path.join(projectRoot, 'tests', 'test_inventory.py'), 'utf8');
  const authoredSource = `${pyproject}\n${seed}\n${api}\n${nativeTests}`;

  assert.match(license, /MIT License/);
  assert.ok(lock.length > 1_000, 'Poetry lock data must be materialized');
  assert.match(lock, /(?:lock-version|content-hash)\s*=/);
  assert.match(pyproject, /fastapi = "0\.115\.6"/);
  assert.match(pyproject, /pytest = "8\.3\.4"/);
  assert.match(seed, /KB-1001/);
  assert.match(seed, /HB-1002/);
  assert.match(seed, /LS-1003/);
  assert.match(nativeTests, /test_seed_is_deterministic_and_sorted/);
  assert.match(api, /@application\.get\("\/health"/);
  assert.match(api, /@application\.get\("\/api\/items"/);
  assert.match(api, /os\.environ\.get\("PORT", "8104"\)/);
  assert.equal(
    relativePaths.some((entry) => entry.toLowerCase().split('/').some(
      (segment) => segment === '.launchdeck' || segment.startsWith('.launchdeck.')
    )),
    false
  );
  assert.doesNotMatch(authoredSource, /\blaunchdeck\b/i);
  assert.doesNotMatch(authoredSource, /\b(?:answer[-_ ]?key|evaluation|scorecard|telemetry)\b/i);
}

function snapshotTree(directory) {
  const entries = walk(directory).map((file) => {
    const relative = path.relative(directory, file).replaceAll(path.sep, '/');
    return {
      path: relative,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify(entries))
    .digest('hex');
  return { digest: `sha256:${digest}`, entries };
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Quickstart evidence refuses symlink: ${entryPath}`);
    }
    if (entry.isDirectory()) return walk(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}

function envelopeStrings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(envelopeStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(envelopeStrings);
  return [];
}

function readTestFile(relativePath) {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  assert.equal(path.relative(repositoryRoot, absolutePath).startsWith('..'), false);
  const content = fs.readFileSync(absolutePath, 'utf8');
  assert.ok(content.length > 0, `${relativePath} must not be empty`);
  return content;
}

function removeOwnedTempRoot(tempRoot) {
  const resolved = path.resolve(tempRoot);
  const tempParent = fs.realpathSync.native(path.resolve(os.tmpdir()));
  assert.equal(path.dirname(resolved), tempParent);
  assert.equal(path.basename(resolved).startsWith(TEMP_PREFIX), true);
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
