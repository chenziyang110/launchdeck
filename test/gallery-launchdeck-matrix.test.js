import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { loadCatalog } from '../src/examples/catalog.js';
import {
  GALLERY_LAUNCHDECK_PHASES,
  GALLERY_LAUNCHDECK_PLATFORMS,
  getGalleryLaunchdeckMatrix,
  runGalleryLaunchdeckCell,
  runGalleryLaunchdeckLiveMatrix
} from './fixtures/gallery-launchdeck-matrix.js';

const catalog = loadCatalog();
const matrix = getGalleryLaunchdeckMatrix();
const liveMatrixEnabled = process.env.LAUNCHDECK_GALLERY_LIVE === '1';

test('external Launchdeck matrix is the exact catalog-derived 10 x 2 denominator', () => {
  assert.deepEqual(GALLERY_LAUNCHDECK_PLATFORMS, ['windows', 'linux']);
  assert.deepEqual(GALLERY_LAUNCHDECK_PHASES, [
    'doctor',
    'setup',
    'build',
    'test',
    'start',
    'health',
    'stop'
  ]);
  assert.equal(catalog.length, 10);
  assert.equal(matrix.length, 20);
  assert.equal(new Set(matrix.map((cell) => cell.cellId)).size, 20);

  const expectedCells = GALLERY_LAUNCHDECK_PLATFORMS.flatMap((platform) =>
    catalog.map((entry) => `${platform}:${entry.id}`)
  ).sort();
  assert.deepEqual(matrix.map((cell) => cell.cellId).sort(), expectedCells);

  for (const cell of matrix) {
    const entry = catalog.find((candidate) => candidate.id === cell.sampleId);
    assert.ok(entry, `catalog row exists for ${cell.cellId}`);
    assert.equal(cell.sourcePath, entry.sourcePath);
    assert.deepEqual(cell.ports, entry.ports);
    assert.deepEqual(cell.requiredPhases, GALLERY_LAUNCHDECK_PHASES);
    assert.equal(Object.hasOwn(cell, 'skip'), false);
    assert.equal(Object.hasOwn(cell, 'skipped'), false);
    assert.equal(Object.hasOwn(cell, 'skipReason'), false);
    assert.match(cell.config, /^version: 1$/m);
    for (const taskName of ['setup', 'build', 'test', 'start']) {
      assert.match(cell.config, new RegExp(`^  ${taskName}:$`, 'm'));
    }
  }
});

for (const cell of matrix) {
  test(`${cell.cellId} runs every Launchdeck phase and returns a residue-free receipt`, async () => {
    const invocations = [];
    const healthRequests = [];
    const releasedPorts = [];

    const receipt = await runGalleryLaunchdeckCell({
      cell,
      consumer: {
        kind: 'external-doctor-with-deterministic-lifecycle-adapter',
        platform: cell.platform,
        async invokeLaunchdeck(invocation) {
          invocations.push(invocation);
          assert.equal(path.resolve(invocation.env.LAUNCHDECK_HOME), path.resolve(invocation.homeDir));
          assert.equal(path.resolve(invocation.cwd), path.resolve(invocation.projectRoot));
          assert.equal(invocation.args.at(-2), '--json');
          assert.equal(invocation.args.at(-1), '--compact');

          fs.mkdirSync(invocation.homeDir, { recursive: true });
          fs.writeFileSync(
            path.join(invocation.homeDir, `${invocation.phase}.marker`),
            invocation.cellId,
            'utf8'
          );
          if (invocation.phase === 'start') {
            fs.mkdirSync(path.join(invocation.projectRoot, '.launchdeck', 'runtime'), { recursive: true });
            fs.writeFileSync(
              path.join(invocation.projectRoot, '.launchdeck', 'runtime', 'state.json'),
              `${JSON.stringify({ status: 'running', cellId: invocation.cellId })}\n`,
              'utf8'
            );
          }

          if (invocation.phase === 'doctor') {
            const result = spawnSync(invocation.executable, [invocation.cliPath, ...invocation.args], {
              cwd: invocation.cwd,
              env: invocation.env,
              encoding: 'utf8',
              windowsHide: true,
              timeout: 30_000
            });
            const envelope = JSON.parse(result.stdout);
            assert.equal(result.status, 0, result.stderr);
            assert.equal(envelope.ok, true);
            assert.equal(envelope.command, 'doctor');
            assert.equal(envelope.project, `gallery-${cell.sampleId}`);
            const configLoaded = envelope.checks.find((check) => check.code === 'config_loaded');
            assert.ok(configLoaded);
            assert.equal(configLoaded.status, 'pass');
            assert.equal(
              path.resolve(configLoaded.message.replace(/^Loaded /u, '')),
              path.resolve(invocation.projectRoot, '.launchdeck.yml')
            );
            return {
              status: result.status,
              stdout: result.stdout,
              stderr: result.stderr,
              diagnostics: {
                consumer: 'external-launchdeck-cli',
                envelope
              }
            };
          }

          return {
            status: 0,
            stdout: `${JSON.stringify({ ok: true, command: invocation.phase })}\n`,
            stderr: '',
            diagnostics: { adapter: 'deterministic-test-adapter' }
          };
        },
        async probeHealth(request) {
          healthRequests.push(request);
          return {
            ok: true,
            status: 200,
            url: request.url,
            body: { status: 'ok', sampleId: cell.sampleId }
          };
        },
        async verifyPortReleased(request) {
          releasedPorts.push(request.port);
          return { released: true, port: request.port };
        }
      }
    });

    assert.equal(receipt.cellId, cell.cellId);
    assert.equal(receipt.sampleId, cell.sampleId);
    assert.equal(receipt.targetPlatform, cell.platform);
    assert.deepEqual(Object.keys(receipt.phases), GALLERY_LAUNCHDECK_PHASES);
    assert.deepEqual(
      Object.values(receipt.phases).map((phase) => phase.status),
      GALLERY_LAUNCHDECK_PHASES.map(() => 'passed')
    );
    assert.deepEqual(invocations.map((entry) => entry.phase), [
      'doctor',
      'setup',
      'build',
      'test',
      'start',
      'stop'
    ]);
    assert.deepEqual(healthRequests.map((entry) => entry.url), cell.healthUrls);
    assert.deepEqual(releasedPorts.sort((left, right) => left - right), [...cell.ports].sort((left, right) => left - right));
    assert.equal(JSON.stringify(receipt).includes('skipped'), false);
    assert.equal(receipt.cleanup.sourceUnchanged, true);
    assert.equal(receipt.cleanup.rootRemoved, true);
    assert.equal(receipt.cleanup.projectConfigRemoved, true);
    assert.equal(receipt.cleanup.homeRemoved, true);
    assert.equal(receipt.cleanup.residueFree, true);
    assert.equal(receipt.sourceMutated, false);
    assert.equal(receipt.receiptEvidence.written, true);
    assert.equal(receipt.receiptEvidence.removedByCleanup, true);
    assert.equal(receipt.sideEffects.isolatedHomeUsed, true);
    assert.equal(receipt.sideEffects.sourceUnchanged, true);
    assert.equal(receipt.sideEffects.residueFree, true);
    assert.equal(receipt.phases.doctor.result.diagnostics.consumer, 'external-launchdeck-cli');
    assert.deepEqual(receipt.copyPolicy.excludedNames, ['.launchdeck', 'scratch']);
    assert.equal(receipt.copyPolicy.scratchAbsent, true);
    assert.equal(receipt.copyPolicy.launchdeckStateAbsent, true);
    assert.equal(receipt.copyPolicy.verified, true);
    assert.ok(receipt.copyAttempts.length >= 1 && receipt.copyAttempts.length <= 2);
    assert.equal(receipt.copyAttempts.at(-1).status, 'passed');
    assert.equal(
      receipt.copyAttempts.filter((attempt) => attempt.status === 'failed')
        .every((attempt) => attempt.retryable === true),
      true
    );
    assert.equal(fs.existsSync(receipt.projectRoot), false);
    assert.equal(fs.existsSync(receipt.homeDir), false);
    assert.equal(fs.existsSync(path.join(receipt.sourceRoot, '.launchdeck.yml')), false);
    assert.equal(fs.existsSync(path.join(receipt.sourceRoot, '.launchdeck')), false);
  });
}

test('real consumer refuses an OS/sample mismatch instead of reporting a skipped cell', async () => {
  const mismatchedPlatform = process.platform === 'win32' ? 'linux' : 'windows';
  const cell = matrix.find((candidate) => candidate.platform === mismatchedPlatform);

  await assert.rejects(
    runGalleryLaunchdeckCell({ cell }),
    (error) => {
      assert.equal(error.code, 'gallery_platform_mismatch');
      assert.equal(error.receipt.cellId, cell.cellId);
      assert.equal(error.receipt.cleanup.sourceUnchanged, true);
      assert.equal(error.receipt.cleanup.residueFree, true);
      assert.equal(JSON.stringify(error.receipt).includes('skipped'), false);
      return true;
    }
  );
});

if (liveMatrixEnabled) {
  test('live external Launchdeck matrix runs current platform cells with the real consumer', async (t) => {
    let report;
    try {
      report = await runGalleryLaunchdeckLiveMatrix();
    } catch (error) {
      t.diagnostic(JSON.stringify({
        code: error?.code,
        message: error?.message,
        receipt: error?.receipt ? {
          cellId: error.receipt.cellId,
          phases: error.receipt.phases,
          cleanup: error.receipt.cleanup,
          sideEffects: error.receipt.sideEffects,
          portRelease: error.receipt.portRelease
        } : null
      }, null, 2));
      throw error;
    }

    assert.equal(report.denominator.catalogEntries, 10);
    assert.equal(report.denominator.platforms, 1);
    assert.equal(report.denominator.cells, 10);
    assert.equal(report.receipts.length, 10);
    assert.equal(report.platform, process.platform === 'win32' ? 'windows' : 'linux');
    assert.deepEqual(report.summary, {
      completed: 10,
      passed: 10,
      failed: 0,
      cleanupAccounted: 10,
      cleanupFailed: 0,
      portReleaseAccounted: 10
    });

    for (const receipt of report.receipts) {
      assert.equal(receipt.consumer.kind, 'external-launchdeck-cli');
      assert.equal(receipt.targetPlatform, report.platform);
      assert.deepEqual(Object.keys(receipt.phases), GALLERY_LAUNCHDECK_PHASES);
      assert.deepEqual(
        Object.values(receipt.phases).map((phase) => phase.status),
        GALLERY_LAUNCHDECK_PHASES.map(() => 'passed')
      );
      assert.equal(receipt.cleanup.sourceUnchanged, true);
      assert.equal(receipt.cleanup.sourcePure, true);
      assert.equal(receipt.cleanup.rootRemoved, true);
      assert.equal(receipt.cleanup.projectConfigRemoved, true);
      assert.equal(receipt.cleanup.homeRemoved, true);
      assert.equal(receipt.cleanup.residueFree, true);
      assert.equal(receipt.sideEffects.isolatedHomeUsed, true);
      assert.equal(receipt.sideEffects.sourceUnchanged, true);
      assert.equal(receipt.sideEffects.residueFree, true);
      assert.equal(receipt.portRelease.length, receipt.ports.length);
      assert.equal(receipt.portRelease.every((check) => check.released === true), true);
      assert.equal(fs.existsSync(receipt.projectRoot), false);
      assert.equal(fs.existsSync(receipt.homeDir), false);
    }
  });
}
