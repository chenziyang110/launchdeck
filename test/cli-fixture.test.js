import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { controlPlanePaths } from '../src/control-plane/state.js';
import {
  createCliFixture,
  createTempProject,
  removeTempProject
} from './helpers/cli-fixture.js';

test('createCliFixture gives each fixture an isolated Launchdeck home and removes only owned directories', () => {
  const first = createCliFixture();
  const second = createCliFixture();
  const firstHome = first.launchdeckHome;
  const secondHome = second.launchdeckHome;

  try {
    assert.notEqual(firstHome, secondHome);
    assert.equal(first.env.LAUNCHDECK_HOME, firstHome);
    assert.equal(second.env.LAUNCHDECK_HOME, secondHome);

    writeMinimalProject(first, 'fixture-home-first');
    const added = first.runCliJson(['project', 'add']);

    assert.equal(added.status, 0, added.stderr);
    assert.equal(fs.existsSync(controlPlanePaths(first.env).registryPath), true);
    assert.equal(fs.existsSync(controlPlanePaths(second.env).registryPath), false);
  } finally {
    first.cleanup();
    second.cleanup();
  }

  assert.equal(fs.existsSync(first.projectRoot), false);
  assert.equal(fs.existsSync(firstHome), false);
  assert.equal(fs.existsSync(second.projectRoot), false);
  assert.equal(fs.existsSync(secondHome), false);
});

test('explicit LAUNCHDECK_HOME wins and fixture cleanup never deletes the caller-owned home', () => {
  const externalHome = createTempProject({ prefix: 'launchdeck-cli-external-home-' });
  const fixture = createCliFixture();
  const ownedHome = fixture.launchdeckHome;

  try {
    writeMinimalProject(fixture, 'fixture-home-override');
    const added = fixture.runCliJson(['project', 'add'], {
      env: { LAUNCHDECK_HOME: externalHome }
    });

    assert.equal(added.status, 0, added.stderr);
    assert.equal(fs.existsSync(controlPlanePaths({ LAUNCHDECK_HOME: externalHome }).registryPath), true);
    assert.equal(fs.existsSync(controlPlanePaths(fixture.env).registryPath), false);

    fixture.cleanup();

    assert.equal(fs.existsSync(ownedHome), false);
    assert.equal(fs.existsSync(externalHome), true);
  } finally {
    fixture.cleanup();
    if (fs.existsSync(externalHome)) {
      removeTempProject(externalHome);
    }
  }
});

test('fixture-level explicit LAUNCHDECK_HOME is caller-owned and preserved on cleanup', () => {
  const externalHome = createTempProject({ prefix: 'launchdeck-cli-external-home-' });
  const fixture = createCliFixture({
    env: { LAUNCHDECK_HOME: externalHome }
  });

  try {
    assert.equal(path.resolve(fixture.launchdeckHome), path.resolve(externalHome));
    writeMinimalProject(fixture, 'fixture-home-option');
    assert.equal(fixture.runCliJson(['project', 'add']).status, 0);

    fixture.cleanup();

    assert.equal(fs.existsSync(externalHome), true);
  } finally {
    fixture.cleanup();
    if (fs.existsSync(externalHome)) {
      removeTempProject(externalHome);
    }
  }
});

function writeMinimalProject(fixture, name) {
  fixture.writeConfig({
    version: 1,
    project: { name },
    tasks: {
      check: {
        command: 'node --version',
        longRunning: false,
        ports: [],
        risk: 'low'
      }
    },
    clean: { safe: [], risky: [] }
  });
}
