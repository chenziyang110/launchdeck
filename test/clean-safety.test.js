import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createCliFixture } from './helpers/cli-fixture.js';

test('clean --json returns a dry-run plan without deleting configured targets', () => {
  const fixture = createCliFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['dist'],
      risky: ['node_modules']
    });
    fixture.writeFile('dist/value.txt', 'safe');
    fixture.writeFile('node_modules/value.txt', 'risky');

    const result = fixture.runCliJson(['clean']);

    assert.equal(result.status, 0, result.stderr);
    assertCleanEnvelope(result.json, fixture, {
      ok: true,
      status: 'ok'
    });
    assert.equal(result.json.dryRun, true);
    assert.equal(result.json.mode, 'dry-run');
    assertTarget(result.json.targets, 'dist', {
      kind: 'safe',
      status: 'planned',
      exists: true
    });
    assertTarget(result.json.targets, 'node_modules', {
      kind: 'risky',
      status: 'planned',
      exists: true
    });
    assert.deepEqual(result.json.removed, []);
    assert.equal(fs.existsSync(fixture.path('dist')), true);
    assert.equal(fs.existsSync(fixture.path('node_modules')), true);
  } finally {
    fixture.cleanup();
  }
});

test('clean --safe --json removes safe targets and skips missing safe targets without deleting risky targets', () => {
  const fixture = createCliFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['dist', 'missing-cache'],
      risky: ['node_modules']
    });
    fixture.writeFile('dist/value.txt', 'safe');
    fixture.writeFile('node_modules/value.txt', 'risky');

    const result = fixture.runCliJson(['clean', '--safe']);

    assert.equal(result.status, 0, result.stderr);
    assertCleanEnvelope(result.json, fixture, {
      ok: true,
      status: 'ok'
    });
    assert.equal(result.json.dryRun, false);
    assert.equal(result.json.mode, 'safe');
    assertTarget(result.json.targets, 'dist', {
      kind: 'safe',
      status: 'planned',
      exists: true
    });
    assertTarget(result.json.targets, 'missing-cache', {
      kind: 'safe',
      status: 'skipped_missing',
      exists: false
    });
    assertCleanResult(result.json.removed, 'dist', {
      status: 'removed',
      existed: true
    });
    assertCleanResult(result.json.removed, 'missing-cache', {
      status: 'skipped_missing',
      existed: false
    });
    assert.equal(fs.existsSync(fixture.path('dist')), false);
    assert.equal(fs.existsSync(fixture.path('missing-cache')), false);
    assert.equal(fs.existsSync(fixture.path('node_modules')), true);
  } finally {
    fixture.cleanup();
  }
});

test('clean --all --json requires confirmation and does not delete risky targets', () => {
  const fixture = createCliFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['dist'],
      risky: ['node_modules']
    });
    fixture.writeFile('dist/value.txt', 'safe');
    fixture.writeFile('node_modules/value.txt', 'risky');

    const result = fixture.runCliJson(['clean', '--all']);

    assert.equal(result.status, 1);
    assertCleanEnvelope(result.json, fixture, {
      ok: false,
      status: 'error'
    });
    assert.equal(result.json.dryRun, true);
    assert.equal(result.json.mode, 'all');
    assertTarget(result.json.targets, 'dist', {
      kind: 'safe',
      status: 'planned',
      exists: true
    });
    assertTarget(result.json.targets, 'node_modules', {
      kind: 'risky',
      status: 'planned',
      exists: true
    });
    assert.deepEqual(result.json.removed, []);
    assert.equal(result.json.error.code, 'confirmation_required');
    assert.equal(fs.existsSync(fixture.path('dist')), true);
    assert.equal(fs.existsSync(fixture.path('node_modules')), true);
  } finally {
    fixture.cleanup();
  }
});

test('clean --all --yes --json removes safe and risky targets', () => {
  const fixture = createCliFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['dist'],
      risky: ['node_modules']
    });
    fixture.writeFile('dist/value.txt', 'safe');
    fixture.writeFile('node_modules/value.txt', 'risky');

    const result = fixture.runCliJson(['clean', '--all', '--yes']);

    assert.equal(result.status, 0, result.stderr);
    assertCleanEnvelope(result.json, fixture, {
      ok: true,
      status: 'ok'
    });
    assert.equal(result.json.dryRun, false);
    assert.equal(result.json.mode, 'all');
    assertCleanResult(result.json.removed, 'dist', {
      status: 'removed',
      existed: true
    });
    assertCleanResult(result.json.removed, 'node_modules', {
      status: 'removed',
      existed: true
    });
    assert.equal(fs.existsSync(fixture.path('dist')), false);
    assert.equal(fs.existsSync(fixture.path('node_modules')), false);
  } finally {
    fixture.cleanup();
  }
});

test('clean --safe --json refuses project-root clean targets without deleting approved targets', () => {
  const fixture = createCliFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['dist', '.'],
      risky: []
    });
    fixture.writeFile('dist/value.txt', 'safe');

    const result = fixture.runCliJson(['clean', '--safe']);

    assert.equal(result.status, 1);
    assertCleanEnvelope(result.json, fixture, {
      ok: false,
      status: 'error'
    });
    assert.equal(result.json.dryRun, true);
    assert.equal(result.json.mode, 'safe');
    assert.equal(result.json.error.code, 'clean_target_root');
    assertTarget(result.json.targets, 'dist', {
      kind: 'safe',
      status: 'planned',
      exists: true
    });
    assertTarget(result.json.targets, '.', {
      kind: 'safe',
      status: 'refused',
      refusalCode: 'clean_target_root'
    });
    assert.deepEqual(result.json.removed, []);
    assert.equal(fs.existsSync(fixture.path('dist')), true);
  } finally {
    fixture.cleanup();
  }
});

test('clean --safe --json refuses out-of-root clean targets without deleting approved targets', () => {
  const fixture = createCliFixture();

  try {
    writeCleanConfig(fixture, {
      safe: ['dist', '..'],
      risky: []
    });
    fixture.writeFile('dist/value.txt', 'safe');

    const result = fixture.runCliJson(['clean', '--safe']);

    assert.equal(result.status, 1);
    assertCleanEnvelope(result.json, fixture, {
      ok: false,
      status: 'error'
    });
    assert.equal(result.json.dryRun, true);
    assert.equal(result.json.mode, 'safe');
    assert.equal(result.json.error.code, 'clean_target_outside_project');
    assertTarget(result.json.targets, 'dist', {
      kind: 'safe',
      status: 'planned',
      exists: true
    });
    assertTarget(result.json.targets, '..', {
      kind: 'safe',
      status: 'refused',
      refusalCode: 'clean_target_outside_project'
    });
    assert.deepEqual(result.json.removed, []);
    assert.equal(fs.existsSync(fixture.path('dist')), true);
  } finally {
    fixture.cleanup();
  }
});

test('clean --safe --json refuses absolute clean targets as ambiguous without deleting approved targets', () => {
  const fixture = createCliFixture();

  try {
    const absoluteTarget = fixture.path('absolute-cache');
    writeCleanConfig(fixture, {
      safe: ['dist', absoluteTarget],
      risky: []
    });
    fixture.writeFile('dist/value.txt', 'safe');
    fixture.writeFile('absolute-cache/value.txt', 'ambiguous');

    const result = fixture.runCliJson(['clean', '--safe']);

    assert.equal(result.status, 1);
    assertCleanEnvelope(result.json, fixture, {
      ok: false,
      status: 'error'
    });
    assert.equal(result.json.dryRun, true);
    assert.equal(result.json.mode, 'safe');
    assert.equal(result.json.error.code, 'clean_target_ambiguous');
    assertTarget(result.json.targets, 'dist', {
      kind: 'safe',
      status: 'planned',
      exists: true
    });
    assertTarget(result.json.targets, absoluteTarget, {
      kind: 'safe',
      status: 'refused',
      refusalCode: 'clean_target_ambiguous'
    });
    assert.deepEqual(result.json.removed, []);
    assert.equal(fs.existsSync(fixture.path('dist')), true);
    assert.equal(fs.existsSync(absoluteTarget), true);
  } finally {
    fixture.cleanup();
  }
});

function writeCleanConfig(fixture, clean) {
  fixture.writeConfig({
    version: 1,
    project: {
      name: 'clean-safety'
    },
    tasks: {
      build: {
        command: 'node -e "process.exit(0)"'
      }
    },
    clean
  });
}

function assertCleanEnvelope(payload, fixture, expected) {
  assert.equal(payload.ok, expected.ok);
  assert.equal(payload.command, 'clean');
  assert.equal(payload.status, expected.status);
  assert.equal(payload.projectRoot, fixture.projectRoot);
  assert.equal(payload.configPath, fixture.path('.launchdeck.yml'));
  assert.equal(Array.isArray(payload.targets), true);
  assert.equal(Array.isArray(payload.removed), true);
  assert.equal(typeof payload.dryRun, 'boolean');
  assert.equal(typeof payload.mode, 'string');
  if (expected.ok) {
    assert.equal(payload.error, undefined);
  } else {
    assert.equal(typeof payload.error?.code, 'string');
    assert.equal(typeof payload.error?.message, 'string');
  }
}

function assertTarget(targets, rawPath, expected) {
  const target = findCleanRecord(targets, rawPath);
  assert.equal(target.kind, expected.kind);
  assert.equal(target.rawPath ?? target.path, rawPath);
  assert.equal(target.status, expected.status);
  if ('exists' in expected) {
    assert.equal(target.exists, expected.exists);
  }
  if ('refusalCode' in expected) {
    assert.equal(target.refusalCode, expected.refusalCode);
  }
}

function assertCleanResult(results, rawPath, expected) {
  const result = findCleanRecord(results, rawPath);
  assert.equal(result.rawPath ?? result.path, rawPath);
  assert.equal(result.status, expected.status);
  assert.equal(result.existed, expected.existed);
}

function findCleanRecord(records, rawPath) {
  assert.equal(Array.isArray(records), true);
  const record = records.find((entry) => (entry.rawPath ?? entry.path) === rawPath);
  assert.ok(record, `Expected clean record for ${rawPath}`);
  return record;
}
