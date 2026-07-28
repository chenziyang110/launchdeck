import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveStartTaskName } from '../src/cli.js';
import { mapCliInvocation } from '../src/adapters/cli-operation-map.js';
import { createCliFixture } from './helpers/cli-fixture.js';

test('start task selection follows explicit, project default, start, dev, then unique managed task precedence', () => {
  const tasks = {
    explicit: managedTask(),
    preferred: managedTask(),
    start: managedTask(),
    dev: managedTask(),
    build: commandTask()
  };

  assert.equal(resolveStartTaskName(config(tasks, 'preferred'), 'explicit'), 'explicit');
  assert.equal(resolveStartTaskName(config(tasks, 'preferred')), 'preferred');
  assert.equal(resolveStartTaskName(config(tasks)), 'start');
  assert.equal(resolveStartTaskName(config({ dev: managedTask(), web: managedTask() })), 'dev');
  assert.equal(resolveStartTaskName(config({ build: commandTask(), web: managedTask() })), 'web');
});

test('bare up directly starts the configured project default task', () => {
  const fixture = createCliFixture();
  try {
    fixture.writeScript('scripts/server.js', 'setInterval(() => {}, 1000);');
    fixture.writeConfig(config({
      preferred: managedTask('node scripts/server.js'),
      start: managedTask('node scripts/server.js'),
      dev: managedTask('node scripts/server.js')
    }, 'preferred'));

    const result = fixture.runCliJson(['up']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.command, 'up');
    assert.equal(result.json.task, 'preferred');
    assert.equal(result.json.process.name, 'preferred');
  } finally {
    fixture.runCliJson(['down', 'preferred']);
    fixture.cleanup();
  }
});

test('ambiguous bare up refuses before dispatch and lists deterministic available tasks', () => {
  const fixture = createCliFixture();
  try {
    fixture.writeConfig(config({
      api: managedTask(),
      build: commandTask(),
      web: managedTask()
    }));

    const result = fixture.runCliJson(['up']);

    assert.equal(result.status, 1);
    assert.equal(result.json.command, 'up');
    assert.equal(result.json.code, 'task_not_found');
    assert.deepEqual(result.json.availableTasks, ['api', 'build', 'web']);
    assert.deepEqual(result.json.error.details.availableTasks, ['api', 'build', 'web']);
    assert.deepEqual(result.json.effect, {
      certainty: 'none',
      changed: false,
      dispatch: 'not_dispatched'
    });
    assert.equal(result.json.error.details.effect.dispatch, 'not_dispatched');
  } finally {
    fixture.cleanup();
  }
});

test('unknown explicit task and config/input rejection prove no mutation was dispatched', () => {
  const fixture = createCliFixture();
  try {
    fixture.writeConfig(config({ start: managedTask(), build: commandTask() }));

    const missing = fixture.runCliJson(['up', 'missing']);
    assert.equal(missing.status, 1);
    assert.deepEqual(missing.json.availableTasks, ['build', 'start']);
    assert.deepEqual(missing.json.effect, noDispatchEffect());

    const compactMissing = fixture.runCliJson(['up', 'missing', '--compact']);
    assert.equal(compactMissing.status, 1);
    assert.deepEqual(compactMissing.json.availableTasks, ['build', 'start']);
    assert.deepEqual(compactMissing.json.effect, noDispatchEffect());

    const invalidInput = fixture.runCliJson(['inspect']);
    assert.equal(invalidInput.status, 1);
    assert.deepEqual(invalidInput.json.effect, noDispatchEffect());

    fixture.writeConfig('version: 1\nproject: [invalid\n');
    const invalidConfig = fixture.runCliJson(['up']);
    assert.equal(invalidConfig.status, 1);
    assert.equal(invalidConfig.json.code, 'config_invalid');
    assert.deepEqual(invalidConfig.json.effect, noDispatchEffect());
  } finally {
    fixture.cleanup();
  }
});

test('CLI operation mapping consumes the resolved start target and never invents dev', () => {
  const context = { agentEligible: true, projectRef: 'alpha', taskRef: 'start' };
  assert.deepEqual(mapCliInvocation({ positionals: ['up'], options: {}, context }), {
    operation: 'task.start',
    input: { projectRef: 'alpha', taskRef: 'start' }
  });
  assert.deepEqual(mapCliInvocation({
    positionals: ['start'],
    options: {},
    context: { agentEligible: true, projectRef: 'alpha' }
  }), {
    operation: 'task.start',
    input: { projectRef: 'alpha' }
  });
});

function config(tasks, defaultTask = undefined) {
  return {
    version: 1,
    project: {
      name: 'selection-project',
      ...(defaultTask ? { defaultTask } : {})
    },
    tasks,
    clean: { safe: [], risky: [] }
  };
}

function managedTask(command = 'node -e "setInterval(() => {}, 1000)"') {
  return { command, longRunning: true, risk: 'low' };
}

function commandTask() {
  return { command: 'node -e "process.exit(0)"', risk: 'low' };
}

function noDispatchEffect() {
  return { certainty: 'none', changed: false, dispatch: 'not_dispatched' };
}
