import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

import { loadCatalog } from '../../src/examples/catalog.js';
import {
  GALLERY_LAUNCHDECK_PHASES,
  GALLERY_LAUNCHDECK_PLATFORMS,
  getGalleryLaunchdeckMatrix
} from '../fixtures/gallery-launchdeck-matrix.js';
import {
  GALLERY_NATIVE_PHASES,
  GALLERY_NATIVE_PLATFORMS,
  getGalleryNativeMatrix
} from '../fixtures/gallery-native-matrix.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = loadCatalog({ rootDir: repositoryRoot });
const nativeMatrix = getGalleryNativeMatrix({ rootDir: repositoryRoot });
const launchdeckMatrix = getGalleryLaunchdeckMatrix({ rootDir: repositoryRoot });

test('release denominator is exactly 20 native plus 20 external Launchdeck cells', () => {
  const sampleIds = catalog.map((entry) => entry.id);
  const expectedCellIds = ['windows', 'linux'].flatMap((platform) =>
    sampleIds.map((sampleId) => `${platform}:${sampleId}`)
  ).sort();

  assert.equal(catalog.length, 10);
  assert.deepEqual(GALLERY_NATIVE_PLATFORMS.map((platform) => platform.id), ['windows', 'linux']);
  assert.deepEqual(GALLERY_LAUNCHDECK_PLATFORMS, ['windows', 'linux']);
  assert.equal(nativeMatrix.length, 20);
  assert.equal(launchdeckMatrix.length, 20);
  assert.deepEqual(nativeMatrix.map((cell) => cell.cellId).sort(), expectedCellIds);
  assert.deepEqual(launchdeckMatrix.map((cell) => cell.cellId).sort(), expectedCellIds);

  const releaseCells = [
    ...nativeMatrix.map((cell) => `native:${cell.cellId}`),
    ...launchdeckMatrix.map((cell) => `launchdeck:${cell.cellId}`)
  ];
  assert.equal(releaseCells.length, 40);
  assert.equal(new Set(releaseCells).size, 40);

  for (const sampleId of sampleIds) {
    assert.equal(
      releaseCells.filter((cellId) => cellId.endsWith(`:${sampleId}`)).length,
      4,
      `${sampleId} must contribute two native and two Launchdeck cells`
    );
  }

  for (const cell of nativeMatrix) {
    assert.equal(cell.skipAllowed, false, `${cell.cellId} cannot silently skip`);
    assert.equal(cell.prerequisite.required, true, `${cell.cellId} must fail closed on prerequisites`);
    assert.equal(cell.cleanup.required, true, `${cell.cellId} must clean up in finally`);
    assert.deepEqual(cell.requiredPhases, GALLERY_NATIVE_PHASES);
  }

  for (const cell of launchdeckMatrix) {
    assert.equal(Object.hasOwn(cell, 'skip'), false, `${cell.cellId} cannot define skip`);
    assert.equal(Object.hasOwn(cell, 'skipped'), false, `${cell.cellId} cannot define skipped`);
    assert.equal(Object.hasOwn(cell, 'skipReason'), false, `${cell.cellId} cannot define skipReason`);
    assert.deepEqual(cell.requiredPhases, GALLERY_LAUNCHDECK_PHASES);
  }
});

test('CI consumes the exact denominator with a fail-closed Docker prerequisite', () => {
  const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'ci.yml');
  const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));
  const galleryJob = workflow.jobs.gallery;

  assert.ok(galleryJob, 'CI must define the gallery compatibility job');
  assert.deepEqual(galleryJob.strategy.matrix.os, ['windows-latest', 'ubuntu-latest']);
  assert.equal(galleryJob.strategy.matrix.os.includes('macos-latest'), false);
  assert.notEqual(galleryJob['continue-on-error'], true);

  const dockerStepIndex = galleryJob.steps.findIndex((step) =>
    /Docker and Docker Compose prerequisites/u.test(step.name ?? '')
  );
  const nativeStepIndex = galleryJob.steps.findIndex((step) =>
    String(step.run ?? '').includes('test/gallery-native-matrix.test.js')
  );
  const launchdeckStepIndex = galleryJob.steps.findIndex((step) =>
    String(step.run ?? '').includes('test/gallery-launchdeck-matrix.test.js')
  );

  assert.ok(dockerStepIndex >= 0, 'Docker prerequisite step must exist');
  assert.ok(dockerStepIndex < nativeStepIndex, 'Docker prerequisite must precede the native matrix');
  assert.ok(nativeStepIndex < launchdeckStepIndex, 'Both matrix consumers must run in a stable order');

  const dockerStep = galleryJob.steps[dockerStepIndex];
  assert.notEqual(dockerStep['continue-on-error'], true);
  assert.equal(Object.hasOwn(dockerStep, 'if'), false, 'Docker prerequisite cannot be conditionally skipped');
  assert.match(dockerStep.run, /docker version/u);
  assert.match(dockerStep.run, /docker info/u);
  assert.match(dockerStep.run, /docker compose version/u);
});

test('matrix evidence keeps source-purity and residue assertions in the release gate', () => {
  const nativeTest = fs.readFileSync(
    path.join(repositoryRoot, 'test', 'gallery-native-matrix.test.js'),
    'utf8'
  );
  const launchdeckTest = fs.readFileSync(
    path.join(repositoryRoot, 'test', 'gallery-launchdeck-matrix.test.js'),
    'utf8'
  );

  for (const source of [nativeTest, launchdeckTest]) {
    assert.match(source, /sourceUnchanged/u);
    assert.match(source, /residue/u);
    assert.doesNotMatch(source, /\btest\.skip\s*\(/u);
  }
  assert.match(nativeTest, /skipped:\s*0/u);
  assert.match(launchdeckTest, /JSON\.stringify\(receipt\)\.includes\('skipped'\), false/u);
});
