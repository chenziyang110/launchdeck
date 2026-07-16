import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createCliFixture } from './helpers/cli-fixture.js';

test('help documents the typed inspect target contract', () => {
  const fixture = createCliFixture();

  try {
    const result = fixture.runCli(['--help']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /launchdeck inspect <type:value>/);
    assert.match(result.stdout, /task:<project:task>/);
    assert.match(result.stdout, /port:<port>/);
    assert.match(result.stdout, /pid:<pid>/);
  } finally {
    fixture.cleanup();
  }
});

const CONTRACT_ERROR_CODES = new Set([
  'config_not_found',
  'config_exists',
  'config_invalid',
  'unsupported_config_version',
  'project_root_escape',
  'scan_root_not_found',
  'scan_root_invalid',
  'task_not_found',
  'task_not_managed',
  'task_already_running',
  'task_command_failed',
  'command_usage_error',
  'port_conflict',
  'project_not_found',
  'global_registry_invalid',
  'runtime_state_invalid',
  'process_not_found',
  'process_not_running',
  'stop_failed',
  'log_not_found',
  'partial_failure',
  'confirmation_required',
  'clean_target_empty',
  'clean_target_root',
  'clean_target_outside_project',
  'clean_target_ambiguous',
  'clean_failed',
  'unsupported_option',
  'platform_unsupported',
  'adapter_failed',
  'agent_adapter_unsupported',
  'agent_source_invalid',
  'agent_target_conflict',
  'internal_error'
]);

test('init --json creates a v1 config with a success envelope', () => {
  withFixture((fixture) => {
    const result = fixture.runCliJson(['init']);

    assert.equal(result.status, 0, result.stderr);
    assertSuccessEnvelope(result.json, 'init');
    assert.equal(result.json.created, true);
    assert.equal(result.json.path, fixture.path('.launchdeck.yml'));
    assert.equal(result.json.configPath, fixture.path('.launchdeck.yml'));
    assert.equal(fs.existsSync(fixture.path('.launchdeck.yml')), true);
  });
});

test('init --json refuses an existing or ancestor config with config_exists', () => {
  withFixture((fixture) => {
    fixture.writeConfig(validConfig());

    const result = fixture.runCliJson(['init']);

    assert.equal(result.status, 1);
    assertFailureEnvelope(result.json, 'init', 'config_exists');
    assert.equal(result.json.error.details.configPath, fixture.path('.launchdeck.yml'));
  });
});

test('doctor --json reports read-only checks and summary in a success envelope', () => {
  withFixture((fixture) => {
    fixture.writeConfig(validConfig());
    const beforeEntries = sortedRelativeEntries(fixture.projectRoot);

    const result = fixture.runCliJson(['doctor']);

    assert.equal(result.status, 0, result.stderr);
    assertSuccessEnvelope(result.json, 'doctor');
    assert.equal(Array.isArray(result.json.checks), true);
    assert.equal(typeof result.json.summary.ok, 'number');
    assert.equal(typeof result.json.summary.warn, 'number');
    assert.equal(typeof result.json.summary.error, 'number');
    assert.deepEqual(sortedRelativeEntries(fixture.projectRoot), beforeEntries);
  });
});

test('doctor --json classifies missing config as config_not_found', () => {
  withFixture((fixture) => {
    const result = fixture.runCliJson(['doctor']);

    assert.equal(result.status, 1);
    assertFailureEnvelope(result.json, 'doctor', 'config_not_found');
  });
});

test('tasks --json lists configured foreground and managed tasks without running them', () => {
  withFixture((fixture) => {
    fixture.writeConfig(validConfig());

    const result = fixture.runCliJson(['tasks']);

    assert.equal(result.status, 0, result.stderr);
    assertSuccessEnvelope(result.json, 'tasks');
    assert.equal(result.json.project.name, 'contract-project');
    assert.deepEqual(
      result.json.tasks.map((task) => [task.name, task.type]),
      [
        ['build', 'foreground'],
        ['fail', 'foreground'],
        ['dev', 'managed']
      ]
    );
    assert.equal(fs.existsSync(fixture.path('build-output.txt')), false);
  });
});

test('run <task> --json emits a success envelope for a foreground task', () => {
  withFixture((fixture) => {
    fixture.writeConfig(validConfig());

    const result = fixture.runCliJson(['run', 'build']);

    assert.equal(result.status, 0, result.stderr);
    assertSuccessEnvelope(result.json, 'run');
    assert.equal(result.json.task, 'build');
    assert.equal(result.json.code, 0);
    assert.equal(fs.readFileSync(fixture.path('build-output.txt'), 'utf8'), 'built');
  });
});

test('run <task> --json --compact emits a smaller success envelope without payload mirrors', () => {
  withFixture((fixture) => {
    fixture.writeConfig(validConfig());

    const normal = fixture.runCli(['run', 'build', '--json']);
    const compactResult = fixture.runCli(['run', 'build', '--json', '--compact']);
    const compact = JSON.parse(compactResult.stdout.trim());

    assert.equal(normal.status, 0, normal.stderr);
    assert.equal(compactResult.status, 0, compactResult.stderr);
    assert.equal(compact.ok, true);
    assert.equal(compact.schemaVersion, 1);
    assert.equal(compact.command, 'run');
    assert.equal(compact.status, 'ok');
    assert.equal(compact.task, 'build');
    assert.equal(compact.exitCode, 0);
    assert.equal(compact.data, undefined);
    assert.equal(compact.projectRoot, undefined);
    assert.equal(compact.configPath, undefined);
    assert.equal(compactResult.stdout.length < normal.stdout.length, true);
  });
});

test('run <task> --json emits exactly one JSON object when a foreground task writes stdout', () => {
  withFixture((fixture) => {
    fixture.writeConfig(configWithNoisyForegroundTask());

    const result = fixture.runCli(['run', 'noisy', '--json']);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(result.status, 0, result.stderr);
    assertSuccessEnvelope(payload, 'run');
    assert.equal(payload.task, 'noisy');
    assert.equal(payload.code, 0);
  });
});

test('run <task> --json emits task_not_found for an unknown task', () => {
  withFixture((fixture) => {
    fixture.writeConfig(validConfig());

    const result = fixture.runCliJson(['run', 'missing']);

    assert.equal(result.status, 1);
    assertFailureEnvelope(result.json, 'run', 'task_not_found');
    assert.equal(result.json.error.details.task, 'missing');
  });
});

test('doctor --json --compact reports a compact structured failure without treating compact as positional', () => {
  withFixture((fixture) => {
    const result = fixture.runCli(['doctor', '--json', '--compact']);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(result.status, 1);
    assert.deepEqual(
      pick(payload, ['ok', 'schemaVersion', 'command', 'status', 'code']),
      {
        ok: false,
        schemaVersion: 1,
        command: 'doctor',
        status: 'error',
        code: 'config_not_found'
      }
    );
    assert.equal(typeof payload.message, 'string');
    assert.equal(payload.data, undefined);
    assert.equal(payload.error, undefined);
  });
});

test('logs --json --compact keeps the default dev task instead of treating compact as a task', () => {
  withFixture((fixture) => {
    fixture.writeConfig(validConfig());
    fixture.writeFile('.launchdeck/logs/dev.log', 'ready\n');

    const result = fixture.runCli(['logs', '--json', '--compact']);
    const payload = JSON.parse(result.stdout.trim());

    assert.equal(result.status, 0, result.stderr);
    assert.equal(payload.ok, true);
    assert.equal(payload.command, 'logs');
    assert.equal(payload.task, 'dev');
    assert.match(payload.content, /ready/);
  });
});

test('run <task> --json includes projectRoot and configPath for config-resolved task_not_found', () => {
  withFixture((fixture) => {
    fixture.writeConfig(validConfig());

    const result = fixture.runCliJson(['run', 'missing']);

    assert.equal(result.status, 1);
    assertFailureEnvelope(result.json, 'run', 'task_not_found');
    assert.equal(result.json.projectRoot, fixture.projectRoot);
    assert.equal(result.json.configPath, fixture.path('.launchdeck.yml'));
  });
});

test('run <task> --json preserves a foreground child exit code in the failure envelope', () => {
  withFixture((fixture) => {
    fixture.writeConfig(validConfig());

    const result = fixture.runCliJson(['run', 'fail']);

    assert.equal(result.status, 7);
    assertFailureEnvelope(result.json, 'run', 'task_command_failed');
    assert.equal(result.json.task, 'fail');
    assert.equal(result.json.code, 7);
  });
});

test('run <task> preserves a foreground child exit code without JSON output', () => {
  withFixture((fixture) => {
    fixture.writeConfig(validConfig());

    const result = fixture.runCli(['run', 'fail']);

    assert.equal(result.status, 7);
  });
});

test('lifecycle aliases execute matching foreground tasks through the run contract', () => {
  withFixture((fixture) => {
    fixture.writeConfig(validConfig());

    const result = fixture.runCliJson(['build']);

    assert.equal(result.status, 0, result.stderr);
    assertSuccessEnvelope(result.json, 'run');
    assert.equal(result.json.task, 'build');
    assert.equal(result.json.alias, 'build');
    assert.equal(fs.readFileSync(fixture.path('build-output.txt'), 'utf8'), 'built');
  });
});

test('JSON failure envelopes use stable public error codes', () => {
  withFixture((fixture) => {
    const result = fixture.runCliJson(['run', 'missing']);

    assert.equal(result.status, 1);
    assertFailureEnvelope(result.json, 'run', 'config_not_found');
    assert.equal(CONTRACT_ERROR_CODES.has(result.json.error.code), true);
  });
});

function withFixture(callback) {
  const fixture = createCliFixture();
  try {
    callback(fixture);
  } finally {
    fixture.cleanup();
  }
}

function validConfig() {
  return {
    version: 1,
    project: {
      name: 'contract-project'
    },
    tasks: {
      build: {
        command: 'node -e "require(\'fs\').writeFileSync(\'build-output.txt\', \'built\')"',
        risk: 'low'
      },
      fail: {
        command: 'node -e "process.exit(7)"',
        risk: 'low'
      },
      dev: {
        command: 'node scripts/dev.js',
        longRunning: true,
        risk: 'low',
        ports: [4173]
      }
    },
    clean: {
      safe: ['dist'],
      risky: ['node_modules']
    }
  };
}

function configWithNoisyForegroundTask() {
  const config = validConfig();
  config.tasks.noisy = {
    command: 'node -e "console.log(\'child stdout\')"',
    risk: 'low'
  };
  return config;
}

function assertSuccessEnvelope(payload, command) {
  assert.equal(payload.ok, true);
  assert.equal(payload.command, command);
  assert.equal(payload.status, 'ok');
  assert.equal(typeof payload.projectRoot, 'string');
  assert.equal(typeof payload.configPath, 'string');
}

function assertFailureEnvelope(payload, command, code) {
  assert.equal(payload.ok, false);
  assert.equal(payload.command, command);
  assert.equal(payload.status, 'error');
  assert.equal(payload.error.code, code);
  assert.equal(CONTRACT_ERROR_CODES.has(payload.error.code), true);
  assert.equal(typeof payload.error.message, 'string');
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function sortedRelativeEntries(root) {
  const entries = [];
  collectRelativeEntries(root, '.', entries);
  return entries.sort();
}

function collectRelativeEntries(root, relativeDir, entries) {
  const absoluteDir = path.join(root, relativeDir);
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    entries.push(`${entry.isDirectory() ? 'dir' : 'file'}:${relativePath}`);
    if (entry.isDirectory()) {
      collectRelativeEntries(root, relativePath, entries);
    }
  }
}
