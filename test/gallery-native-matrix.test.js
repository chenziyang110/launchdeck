import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  GALLERY_NATIVE_PHASES,
  GALLERY_NATIVE_PLATFORMS,
  getGalleryNativeMatrix,
  repositoryRoot,
  runGalleryNativeLiveMatrix,
  runGalleryNativeMatrix
} from './fixtures/gallery-native-matrix.js';

const catalogPath = path.join(repositoryRoot, 'examples', 'sample-projects', 'catalog.json');
const liveMatrixEnabled = process.env.LAUNCHDECK_GALLERY_LIVE === '1';

test('native matrix is catalog-derived with exactly 20 Windows/Linux cells', () => {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const matrix = getGalleryNativeMatrix();
  const expectedCells = catalog.flatMap((sample) => GALLERY_NATIVE_PLATFORMS.map((platform) => ({
    cellId: `${platform.id}:${sample.id}`,
    sampleId: sample.id,
    platform: platform.id,
    runner: platform.runner,
    stack: sample.stack,
    sourcePath: sample.sourcePath,
    requirements: sample.requirements,
    ports: sample.ports
  })));

  assert.equal(catalog.length, 10);
  assert.equal(matrix.length, 20);
  assert.deepEqual(
    matrix.map((cell) => ({
      cellId: cell.cellId,
      sampleId: cell.sampleId,
      platform: cell.platform,
      runner: cell.runner,
      stack: cell.stack,
      sourcePath: cell.sourcePath,
      requirements: cell.prerequisite.requirements,
      ports: cell.ports
    })),
    expectedCells
  );
  assert.deepEqual([...new Set(matrix.map((cell) => cell.sampleId))], catalog.map((sample) => sample.id));
  assert.deepEqual([...new Set(matrix.map((cell) => cell.platform))], ['windows', 'linux']);

  for (const cell of matrix) {
    assert.equal(cell.skipAllowed, false, `${cell.cellId} must not permit skip-based success`);
    assert.equal(cell.prerequisite.required, true, `${cell.cellId} must account for prerequisites`);
    assert.ok(cell.prerequisite.checks.length > 0, `${cell.cellId} must define executable prerequisite checks`);
    assert.deepEqual(cell.requiredPhases, GALLERY_NATIVE_PHASES);
    assert.equal(cell.cleanup.required, true, `${cell.cellId} must require cleanup`);
    assert.equal(cell.cleanup.policy, 'finally');
    assert.ok(cell.cleanup.assertions.includes('source-unchanged'));
    assert.ok(cell.cleanup.assertions.includes('fixture-root-removed'));
  }
});

test('real matrix consumer accounts for prerequisite failure and finally cleanup without silent skip', async (t) => {
  const matrix = getGalleryNativeMatrix();
  const unavailableCellId = 'linux:docker-compose-helpdesk';
  const invocations = [];

  const report = await runGalleryNativeMatrix({
    inspectPrerequisites: async (cell) => ({
      status: cell.cellId === unavailableCellId ? 'failed' : 'passed',
      checks: cell.prerequisite.checks.map((check) => ({
        id: check.id,
        invocation: [check.command, ...check.args],
        status: cell.cellId === unavailableCellId ? 'failed' : 'passed',
        exitCode: cell.cellId === unavailableCellId ? 127 : 0
      })),
      diagnostics: cell.cellId === unavailableCellId
        ? 'Docker Compose v2 is unavailable on the Linux runner.'
        : `prerequisites available for ${cell.cellId}`
    }),
    executeLifecycle: async ({ cell, fixture, env }) => {
      const marker = path.join(fixture.projectRoot, '.native-matrix-runtime.json');
      const invocation = [
        process.execPath,
        '--eval',
        'process.stdout.write(JSON.stringify({' +
          'node:process.version,pid:process.pid,cwd:process.cwd(),' +
          'cellId:process.env.NATIVE_CELL_ID,' +
          'isolatedLaunchdeckHome:process.env.LAUNCHDECK_HOME' +
        '}))'
      ];
      const consumer = spawnSync(invocation[0], invocation.slice(1), {
        cwd: fixture.projectRoot,
        env: { ...env, NATIVE_CELL_ID: cell.cellId },
        encoding: 'utf8',
        timeout: 5_000,
        windowsHide: true
      });
      assert.equal(consumer.status, 0, consumer.stderr);
      const runtimeDiagnostics = JSON.parse(consumer.stdout);
      fs.writeFileSync(marker, JSON.stringify({ invocation, runtimeDiagnostics, platform: cell.platform }));
      invocations.push({ cellId: cell.cellId, invocation, cwd: fixture.projectRoot });

      return {
        invocation,
        runtimeDiagnostics: {
          ...runtimeDiagnostics,
          ports: cell.ports
        },
        phases: Object.fromEntries(
          GALLERY_NATIVE_PHASES
            .filter((phase) => phase !== 'cleanup')
            .map((phase) => [phase, {
              status: phase === 'build' && !cell.build.required ? 'not-applicable' : 'passed',
              invocation,
              reason: phase === 'build' && !cell.build.required
                ? cell.build.reason
                : null
            }])
        )
      };
    }
  });

  assert.equal(report.denominator.catalogEntries, 10);
  assert.equal(report.denominator.platforms, 2);
  assert.equal(report.denominator.cells, 20);
  assert.deepEqual(report.platforms, ['windows', 'linux']);
  assert.equal(report.receipts.length, 20);
  if (report.summary.failed !== 1 || report.summary.cleanupFailed !== 0) {
    t.diagnostic(JSON.stringify({
      unexpectedReceipts: report.receipts
        .filter((receipt) => receipt.status === 'failed' && receipt.cellId !== unavailableCellId)
        .map((receipt) => ({
          cellId: receipt.cellId,
          failure: receipt.failure,
          prerequisite: receipt.prerequisite,
          cleanup: receipt.cleanup,
          isolation: receipt.isolation
        }))
    }));
  }
  assert.deepEqual(report.summary, {
    completed: 20,
    passed: 19,
    failed: 1,
    skipped: 0,
    prerequisiteAccounted: 20,
    prerequisiteFailed: 1,
    cleanupAccounted: 20,
    cleanupFailed: 0
  });
  assert.equal(invocations.length, 19);

  const unavailableReceipt = report.receipts.find((receipt) => receipt.cellId === unavailableCellId);
  assert.equal(unavailableReceipt.status, 'failed');
  assert.equal(unavailableReceipt.failure.code, 'native_prerequisite_unavailable');
  assert.equal(unavailableReceipt.prerequisite.status, 'failed');
  assert.equal(unavailableReceipt.phases.install.status, 'not-run');
  assert.match(unavailableReceipt.phases.install.reason, /prerequisite/i);
  assert.equal(unavailableReceipt.phases.cleanup.status, 'passed');

  for (const receipt of report.receipts) {
    assert.notEqual(receipt.status, 'skipped');
    assert.notEqual(receipt.prerequisite.status, 'skipped');
    assert.equal(receipt.cleanup.accounted, true, `${receipt.cellId} cleanup must be accounted`);
    assert.equal(receipt.cleanup.sourceUnchanged, true, `${receipt.cellId} source must remain unchanged`);
    assert.equal(receipt.cleanup.fixtureRootRemoved, true, `${receipt.cellId} fixture root must be removed`);
    assert.equal(fs.existsSync(receipt.isolation.fixtureRoot), false, `${receipt.cellId} left fixture residue`);
  }

  const executedReceipt = report.receipts.find((receipt) => receipt.cellId === 'windows:fastapi-inventory');
  assert.ok(executedReceipt.invocation.length > 0);
  assert.equal(executedReceipt.runtimeDiagnostics.node, process.version);
  assert.notEqual(executedReceipt.runtimeDiagnostics.pid, process.pid);
  assert.equal(executedReceipt.runtimeDiagnostics.cellId, executedReceipt.cellId);
  assert.equal(executedReceipt.runtimeDiagnostics.cwd, executedReceipt.isolation.projectRoot);
  assert.ok(executedReceipt.runtimeDiagnostics.isolatedLaunchdeckHome.startsWith(
    executedReceipt.isolation.externalFixtureRoot
  ));
  assert.ok(executedReceipt.cleanup.runtimeChanges.some((change) => (
    change.path === '.native-matrix-runtime.json' && change.kind === 'added'
  )));
  assert.deepEqual(executedReceipt.cleanup.residueAfter, []);

  t.diagnostic(JSON.stringify({
    consumer: 'runGalleryNativeMatrix',
    invocation: executedReceipt.invocation,
    runtime: executedReceipt.runtimeDiagnostics,
    sideEffects: {
      denominator: report.denominator,
      summary: report.summary,
      sourceUnchanged: report.receipts.every((receipt) => receipt.cleanup.sourceUnchanged),
      fixtureRootsRemoved: report.receipts.every((receipt) => receipt.cleanup.fixtureRootRemoved),
      residueAfter: report.receipts.flatMap((receipt) => receipt.cleanup.residueAfter)
    }
  }));
});

if (liveMatrixEnabled) {
  test('live native matrix runs the current platform sample lifecycle without deterministic adapters', async (t) => {
    const report = await runGalleryNativeLiveMatrix();

    if (report.summary.failed !== 0) {
      t.diagnostic(JSON.stringify({
        failed: report.receipts
          .filter((receipt) => receipt.status === 'failed')
          .map((receipt) => ({
            cellId: receipt.cellId,
            failure: receipt.failure,
            prerequisite: receipt.prerequisite,
            phases: receipt.phases,
            runtimeDiagnostics: receipt.runtimeDiagnostics,
            cleanup: receipt.cleanup
          }))
      }, null, 2));
    }

    assert.equal(report.denominator.catalogEntries, 10);
    assert.equal(report.denominator.platforms, 2);
    assert.equal(report.denominator.cells, 10);
    assert.equal(report.receipts.length, 10);
    assert.equal(new Set(report.receipts.map((receipt) => receipt.platform)).size, 1);
    assert.equal(report.receipts[0].platform, process.platform === 'win32' ? 'windows' : 'linux');
    assert.deepEqual(report.summary, {
      completed: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      prerequisiteAccounted: 10,
      prerequisiteFailed: 0,
      cleanupAccounted: 10,
      cleanupFailed: 0
    });

    for (const receipt of report.receipts) {
      assert.equal(receipt.prerequisite.status, 'passed', `${receipt.cellId} prerequisite must pass or fail closed`);
      assert.deepEqual(
        Object.keys(receipt.phases),
        GALLERY_NATIVE_PHASES,
        `${receipt.cellId} must account for every native phase`
      );
      for (const phase of ['install', 'build', 'test', 'start', 'health', 'stop']) {
        assert.equal(receipt.phases[phase].status, 'passed', `${receipt.cellId} ${phase} must pass`);
      }
      assert.equal(receipt.cleanup.accounted, true);
      assert.equal(receipt.cleanup.sourceUnchanged, true);
      assert.equal(receipt.cleanup.fixtureRootRemoved, true);
      assert.equal(receipt.cleanup.projectRootRemoved, true);
      assert.deepEqual(receipt.cleanup.residueAfter, []);
      assert.equal(fs.existsSync(receipt.isolation.fixtureRoot), false);
      assert.ok(receipt.runtimeDiagnostics.ownedProcess?.started, `${receipt.cellId} must start an owned process`);
      assert.equal(
        receipt.runtimeDiagnostics.portRelease.every((check) => check.released === true),
        true,
        `${receipt.cellId} must release declared ports`
      );
    }
  });
}
