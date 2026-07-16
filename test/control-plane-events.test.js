import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createLaunchdeckHome } from './helpers/control-plane-fixture.js';

test('appendEvent writes a JSON Lines event with generated identity and lifecycle fields', async () => {
  await withLaunchdeckHome(async ({ homeDir }) => {
    const { appendEvent } = await import('../src/control-plane/events.js');

    const written = await appendEvent({
      homeDir,
      level: 'info',
      type: 'run.started',
      projectId: 'proj_demo',
      alias: 'demo',
      task: 'dev',
      runId: 'run_demo',
      status: 'running',
      code: 'started',
      message: 'Task started.',
      data: {
        pid: 12345,
        ports: [4173]
      },
      next: []
    });

    const eventPath = path.join(homeDir, 'events', 'events.jsonl');
    const lines = readJsonLines(eventPath);

    assert.equal(lines.length, 1);
    assert.equal(lines[0].schemaVersion, 1);
    assert.match(lines[0].eventId, /^evt_[A-Za-z0-9_-]+$/);
    assert.match(lines[0].transactionId, /^tx_[A-Za-z0-9_-]+$/);
    assert.equal(Number.isNaN(Date.parse(lines[0].timestamp)), false);
    assert.equal(lines[0].level, 'info');
    assert.equal(lines[0].type, 'run.started');
    assert.equal(lines[0].projectId, 'proj_demo');
    assert.equal(lines[0].alias, 'demo');
    assert.equal(lines[0].task, 'dev');
    assert.equal(lines[0].runId, 'run_demo');
    assert.equal(lines[0].status, 'running');
    assert.equal(lines[0].code, 'started');
    assert.equal(lines[0].message, 'Task started.');
    assert.deepEqual(lines[0].data, { pid: 12345, ports: [4173] });
    assert.deepEqual(lines[0].next, []);
    assert.deepEqual(written, lines[0]);
  });
});

test('appendEvent preserves the caller transactionId across appended JSON Lines records', async () => {
  await withLaunchdeckHome(async ({ homeDir }) => {
    const { appendEvent } = await import('../src/control-plane/events.js');

    await appendEvent({
      homeDir,
      transactionId: 'tx_existing_lifecycle',
      level: 'info',
      type: 'start.requested',
      projectId: 'proj_demo',
      task: 'dev',
      message: 'Start requested.'
    });
    await appendEvent({
      homeDir,
      transactionId: 'tx_existing_lifecycle',
      level: 'info',
      type: 'run.ready',
      projectId: 'proj_demo',
      task: 'dev',
      runId: 'run_demo',
      status: 'ready',
      message: 'Task is ready.'
    });

    const eventPath = path.join(homeDir, 'events', 'events.jsonl');
    const lines = readJsonLines(eventPath);

    assert.deepEqual(lines.map((event) => event.transactionId), [
      'tx_existing_lifecycle',
      'tx_existing_lifecycle'
    ]);
  });
});

test('appendEvent redacts secret-looking env and config fields before persistence', async () => {
  await withLaunchdeckHome(async ({ homeDir }) => {
    const { appendEvent } = await import('../src/control-plane/events.js');
    const apiToken = 'ld_api_token_should_not_persist';
    const databasePassword = 'ld_database_password_should_not_persist';
    const nestedSecret = 'ld_nested_secret_should_not_persist';

    await appendEvent({
      homeDir,
      level: 'warning',
      type: 'config.loaded',
      projectId: 'proj_demo',
      alias: 'demo',
      message: 'Config loaded with redacted metadata.',
      data: {
        env: {
          API_TOKEN: apiToken,
          NORMAL_SETTING: 'visible'
        },
        config: {
          databasePassword,
          nested: {
            clientSecret: nestedSecret
          }
        }
      }
    });

    const eventPath = path.join(homeDir, 'events', 'events.jsonl');
    const persisted = fs.readFileSync(eventPath, 'utf8');
    const [event] = readJsonLines(eventPath);

    assert.equal(persisted.includes(apiToken), false);
    assert.equal(persisted.includes(databasePassword), false);
    assert.equal(persisted.includes(nestedSecret), false);
    assert.equal(event.data.env.API_TOKEN, '[REDACTED]');
    assert.equal(event.data.env.NORMAL_SETTING, 'visible');
    assert.equal(event.data.config.databasePassword, '[REDACTED]');
    assert.equal(event.data.config.nested.clientSecret, '[REDACTED]');
  });
});

test('readEvents returns valid events and parse diagnostics when the JSONL file contains a corrupt line', async () => {
  await withLaunchdeckHome(async ({ homeDir }) => {
    const { readEvents } = await import('../src/control-plane/events.js');
    const eventDir = path.join(homeDir, 'events');
    const eventPath = path.join(eventDir, 'events.jsonl');
    fs.mkdirSync(eventDir, { recursive: true });
    fs.writeFileSync(
      eventPath,
      [
        JSON.stringify({
          schemaVersion: 1,
          eventId: 'evt_valid_before',
          transactionId: 'tx_read',
          timestamp: '2026-07-08T00:00:00.000Z',
          level: 'info',
          type: 'run.started',
          projectId: 'proj_demo',
          task: 'dev',
          message: 'Task started.',
          next: []
        }),
        '{ not json',
        JSON.stringify({
          schemaVersion: 1,
          eventId: 'evt_valid_after',
          transactionId: 'tx_read',
          timestamp: '2026-07-08T00:00:01.000Z',
          level: 'warning',
          type: 'run.failed',
          projectId: 'proj_demo',
          task: 'dev',
          status: 'failed',
          code: 'readiness_failed',
          message: 'Readiness failed.',
          next: []
        })
      ].join('\n') + '\n'
    );

    const result = await readEvents({ homeDir });

    assert.deepEqual(result.events.map((event) => event.eventId), [
      'evt_valid_before',
      'evt_valid_after'
    ]);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].line, 2);
    assert.equal(result.warnings[0].code, 'event_line_invalid_json');
    assert.equal(result.errors.length, 0);
  });
});

test('appendEvent preserves next actions in persisted event records', async () => {
  await withLaunchdeckHome(async ({ homeDir }) => {
    const { appendEvent } = await import('../src/control-plane/events.js');
    const next = [
      {
        label: 'Inspect port',
        command: 'launchdeck inspect port:4173',
        reason: 'Shows the listener and Launchdeck declarations for this port.',
        risk: 'safe'
      },
      {
        label: 'Force stop owned task',
        command: 'launchdeck force-stop demo:dev --json',
        reason: 'Only use after ownership is verified.',
        risk: 'dangerous'
      }
    ];

    await appendEvent({
      homeDir,
      level: 'error',
      type: 'start.refused',
      projectId: 'proj_demo',
      alias: 'demo',
      task: 'dev',
      status: 'failed',
      code: 'port_conflict',
      message: 'Declared port is already occupied.',
      data: {
        port: 4173
      },
      next
    });

    const eventPath = path.join(homeDir, 'events', 'events.jsonl');
    const [event] = readJsonLines(eventPath);

    assert.deepEqual(event.next, next);
  });
});

async function withLaunchdeckHome(callback) {
  const fixture = createLaunchdeckHome();
  try {
    await callback(fixture);
  } finally {
    fixture.cleanup();
  }
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
