import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { repoRoot } from '../helpers/cli-fixture.js';
import { copyExample } from '../../src/examples/copy.js';
import { loadCatalog } from '../../src/examples/catalog.js';

const catalog = loadCatalog({ rootDir: repoRoot });

test('copy publishes a complete sample tree and leaves no staging residue', () => {
  const workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-example-copy-')));
  const destination = path.join(workspace, 'fastapi-inventory');

  try {
    const receipt = copyExample({
      id: 'fastapi-inventory',
      destination,
      rootDir: repoRoot,
      catalog
    });

    assert.equal(receipt.id, 'fastapi-inventory');
    assert.equal(receipt.destination, path.resolve(destination));
    assert.equal(fs.existsSync(path.join(destination, 'LICENSE')), true);
    assert.equal(fs.existsSync(path.join(destination, 'README.md')), true);
    assert.deepEqual(
      fs.readdirSync(workspace).filter((entry) => entry.includes('launchdeck-staging')),
      []
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('copy rejects every existing destination before mutation', () => {
  const workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-example-conflict-')));
  const destination = path.join(workspace, 'existing');

  try {
    fs.mkdirSync(destination);
    assert.throws(
      () => copyExample({ id: 'fastapi-inventory', destination, rootDir: repoRoot, catalog }),
      (error) => error.code === 'example_destination_exists'
    );
    assert.deepEqual(fs.readdirSync(destination), []);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('copy cleans owned staging after copy failure', () => {
  const workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-example-copy-fail-')));
  const destination = path.join(workspace, 'failed');

  try {
    assert.throws(
      () => copyExample({
        id: 'fastapi-inventory',
        destination,
        rootDir: repoRoot,
        catalog,
        copyTree() {
          throw new Error('injected copy failure');
        }
      }),
      (error) => error.code === 'example_copy_failed'
    );
    assert.equal(fs.existsSync(destination), false);
    assert.equal(
      fs.readdirSync(workspace).some((entry) => entry.includes('launchdeck-staging') || entry.includes('launchdeck-copy.lock')),
      false
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('copy cleans owned staging after atomic publish failure', () => {
  const workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-example-rename-')));
  const destination = path.join(workspace, 'rename-failed');
  let attempts = 0;

  try {
    assert.throws(
      () => copyExample({
        id: 'fastapi-inventory',
        destination,
        rootDir: repoRoot,
        catalog,
        rename() {
          attempts += 1;
          const error = new Error('injected rename failure');
          error.code = 'EXDEV';
          throw error;
        }
      }),
      (error) => error.code === 'example_publish_failed'
    );
    assert.equal(attempts, 1);
    assert.equal(fs.existsSync(destination), false);
    assert.equal(
      fs.readdirSync(workspace).some((entry) => entry.includes('launchdeck-staging') || entry.includes('launchdeck-copy.lock')),
      false
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('copy retries transient Windows publish contention while ownership remains safe', () => {
  const workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-example-rename-retry-')));
  const destination = path.join(workspace, 'rename-retried');
  let attempts = 0;

  try {
    const receipt = copyExample({
      id: 'django-events',
      destination,
      rootDir: repoRoot,
      catalog,
      rename(from, to) {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error('injected transient Windows rename contention');
          error.code = 'EPERM';
          throw error;
        }
        fs.renameSync(from, to);
      }
    });

    assert.equal(attempts, 2);
    assert.equal(receipt.id, 'django-events');
    assert.equal(receipt.destination, path.resolve(destination));
    assert.equal(fs.existsSync(path.join(destination, 'manage.py')), true);
    assert.equal(
      fs.readdirSync(workspace).some((entry) => entry.includes('launchdeck-staging') || entry.includes('launchdeck-copy.lock')),
      false
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('copy rejects a catalog source that escapes the packaged source root', () => {
  const entry = catalog.find((candidate) => candidate.id === 'fastapi-inventory');
  assert.throws(
    () => copyExample({
      id: entry.id,
      destination: path.join(os.tmpdir(), 'launchdeck-invalid-source'),
      rootDir: repoRoot,
      catalog: [{ ...entry, sourcePath: '../outside' }]
    }),
    (error) => error.code === 'example_source_invalid'
  );
});
