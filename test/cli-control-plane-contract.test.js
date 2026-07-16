import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ERROR_CODES, LaunchdeckError } from '../src/errors.js';
import { createFailureEnvelope, createSuccessEnvelope, toCompactJson } from '../src/output.js';
import { createControlPlaneFixture } from './helpers/control-plane-fixture.js';

const REQUIRED_CONTROL_PLANE_ERROR_CODES = [
  'alias_conflict',
  'config_invalid',
  'config_not_found',
  'duplicate_run',
  'external_process',
  'lock_busy',
  'ownership_not_verified',
  'port_conflict',
  'port_release_timeout',
  'project_has_active_runs',
  'project_not_found',
  'registry_lock_busy',
  'run_not_found',
  'start_in_progress',
  'state_version_unsupported',
  'task_lock_busy',
  'unknown_process_owner'
];

test('success envelope includes schemaVersion 1', () => {
  const envelope = createSuccessEnvelope('status', successPayload(), context());

  assert.equal(envelope.schemaVersion, 1);
});

test('success envelope nests structured payload under data', () => {
  const payload = successPayload();
  const envelope = createSuccessEnvelope('status', payload, context());

  assert.deepEqual(envelope.data, payload);
});

test('success envelope includes an empty next action list by default', () => {
  const envelope = createSuccessEnvelope('status', successPayload(), context());

  assert.deepEqual(envelope.next, []);
});

test('success envelope preserves legacy top-level payload mirrors', () => {
  const envelope = createSuccessEnvelope('status', successPayload(), context());

  assert.deepEqual(envelope.summary, { projects: 1, runs: 0 });
  assert.deepEqual(envelope.projects, [{ alias: 'demo', status: 'active' }]);
});

test('compact success envelope removes mirrors while preserving process control fields', () => {
  const processInfo = {
    project: {
      alias: 'demo',
      name: 'launchdeck-demo-api',
      projectRoot: '/workspace/demo'
    },
    task: 'dev',
    status: 'ready',
    pid: 1234,
    ports: [8888],
    runId: 'run_demo',
    spawned: false,
    readiness: {
      status: 'ready'
    },
    logPath: '/workspace/demo/.launchdeck/logs/dev.log'
  };
  const envelope = createSuccessEnvelope('ps', {
    scope: 'global',
    runs: [processInfo],
    processes: [processInfo],
    errors: []
  }, context());

  const compact = toCompactJson(envelope);

  assert.deepEqual(compact, {
    ok: true,
    schemaVersion: 1,
    command: 'ps',
    status: 'ok',
    scope: 'global',
    processes: [
      {
        project: 'demo',
        task: 'dev',
        status: 'ready',
        pid: 1234,
        ports: [8888],
        runId: 'run_demo',
        spawned: false,
        readiness: {
          status: 'ready'
        }
      }
    ],
    counts: {
      processes: 1
    }
  });
});

test('failure envelope exposes stable code message details and next at the contract surface', () => {
  const next = [
    {
      label: 'Inspect port',
      command: 'launchdeck inspect port:4173',
      reason: 'Shows the listener and Launchdeck declarations for this port.',
      risk: 'safe'
    }
  ];
  const error = new LaunchdeckError('port_conflict', 'Declared port is already occupied.', {
    port: 4173,
    ownerType: 'external'
  });

  const envelope = createFailureEnvelope('start', error, context(), { next });

  assert.deepEqual(
    pick(envelope, ['ok', 'schemaVersion', 'command', 'code', 'message', 'details', 'next']),
    {
      ok: false,
      schemaVersion: 1,
      command: 'start',
      code: 'port_conflict',
      message: 'Declared port is already occupied.',
      details: {
        port: 4173,
        ownerType: 'external'
      },
      next
    }
  );
});

test('compact failure envelope preserves code message details and concise safe next actions', () => {
  const error = new LaunchdeckError('confirmation_required', 'Risky clean requires confirmation.', {
    mode: 'all',
    targets: 2
  });
  const envelope = createFailureEnvelope('clean', error, context(), {
    next: [
      {
        label: 'Run safe clean',
        command: 'launchdeck clean --safe --json',
        reason: 'Runs only configured safe clean targets without prompting.',
        risk: 'safe'
      }
    ]
  });

  const compact = toCompactJson(envelope);

  assert.deepEqual(compact, {
    ok: false,
    schemaVersion: 1,
    command: 'clean',
    status: 'error',
    code: 'confirmation_required',
    message: 'Risky clean requires confirmation.',
    details: {
      mode: 'all',
      targets: 2
    },
    next: [
      {
        cmd: 'launchdeck clean --safe --json',
        risk: 'safe'
      }
    ]
  });
});

test('required control-plane error codes are public contract codes', () => {
  const missingCodes = REQUIRED_CONTROL_PLANE_ERROR_CODES.filter((code) => !ERROR_CODES.has(code));

  assert.deepEqual(missingCodes, []);
});

test('clean --all --json refuses without prompting and returns structured next actions', () => {
  const fixture = createControlPlaneFixture();

  try {
    writeCleanConfig(fixture);
    fixture.writeFile('dist/value.txt', 'safe');
    fixture.writeFile('node_modules/value.txt', 'risky');

    const result = fixture.runCliJson(['clean', '--all'], { input: '' });

    assert.equal(result.status, 1);
    assertNoInteractivePromptText(result.stderr);
    assertStdoutIsSingleJsonObject(result.stdout, result.json);
    assertNoInteractivePromptText(result.stdout);
    assert.equal(result.json.ok, false);
    assert.equal(result.json.schemaVersion, 1);
    assert.equal(result.json.code, 'confirmation_required');
    assert.equal(typeof result.json.message, 'string');
    assert.equal(typeof result.json.details, 'object');
    assert.equal(Array.isArray(result.json.next), true);
    assert.ok(result.json.next.length > 0);
    assert.equal(fs.existsSync(fixture.path('dist')), true);
    assert.equal(fs.existsSync(fixture.path('node_modules')), true);
  } finally {
    fixture.cleanup();
  }
});

function successPayload() {
  return {
    summary: { projects: 1, runs: 0 },
    projects: [{ alias: 'demo', status: 'active' }]
  };
}

function context() {
  return {
    projectRoot: '/workspace/demo',
    configPath: '/workspace/demo/.launchdeck.yml'
  };
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function assertNoInteractivePromptText(output) {
  assert.doesNotMatch(
    output,
    /(?:are you sure|continue\?|proceed\?|press enter|type yes|\[y\/n\]|\[y\/N\]|\(y\/n\)|\(y\/N\)|yes\/no)/i
  );
}

function assertStdoutIsSingleJsonObject(stdout, expectedJson) {
  const trimmed = stdout.trim();
  const parsed = JSON.parse(trimmed);

  assert.equal(trimmed.startsWith('{'), true);
  assert.equal(trimmed.endsWith('}'), true);
  assert.deepEqual(parsed, expectedJson);
}

function writeCleanConfig(fixture) {
  fixture.writeConfig({
    version: 1,
    project: {
      name: 'control-plane-contract'
    },
    tasks: {
      build: {
        command: 'node -e "process.exit(0)"',
        risk: 'low'
      }
    },
    clean: {
      safe: ['dist'],
      risky: ['node_modules']
    }
  });
}
