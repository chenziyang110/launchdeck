import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createManagedProjectFixture } from './helpers/control-plane-fixture.js';

test('start refuses an externally occupied declared port without stopping the external listener', async () => {
  const { server, port } = await listenOnFreePort();
  const fixture = createManagedProjectFixture({
    name: 'inspect-conflict-refusal',
    port
  });

  try {
    const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'inspect-conflict']);
    assert.equal(added.status, 0, added.stderr);

    const result = fixture.runCliJson(['start', 'inspect-conflict:dev']);

    assert.equal(result.status, 1);
    assert.equal(errorCode(result.json), 'port_conflict');
    assert.equal(payloadData(result.json).details.port, port);
    assert.equal(server.listening, true);
    assert.equal(await canConnect(port), true);
  } finally {
    fixture.cleanup();
    await closeServer(server);
  }
});

test('inspect-port remains compatible for an externally occupied declared port', async () => {
  const { server, port } = await listenOnFreePort();
  const fixture = createManagedProjectFixture({
    name: 'inspect-port-compat',
    port
  });

  try {
    const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'inspect-port-compat']);
    assert.equal(added.status, 0, added.stderr);

    const result = fixture.runGlobalCliJson(['inspect-port', String(port)]);
    const data = payloadData(result.json);

    assert.equal(result.status, 0, cliFailureMessage(result));
    assert.equal(result.json.command, 'inspect-port');
    assert.equal(data.port, port);
    assert.equal(data.ownerType, 'external');
    assert.equal(data.declaredOwners.length, 1);
    assert.equal(data.conflicts[0].type, 'external_port_occupied');
    assert.equal(server.listening, true);
  } finally {
    fixture.cleanup();
    await closeServer(server);
  }
});

test('inspect port:<port> explains external conflict as inspect-only with safe and blocked actions', async () => {
  const { server, port } = await listenOnFreePort();
  const fixture = createManagedProjectFixture({
    name: 'inspect-port-unified',
    port
  });

  try {
    const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'inspect-port-unified']);
    assert.equal(added.status, 0, added.stderr);

    const result = fixture.runGlobalCliJson(['inspect', `port:${port}`]);
    const data = payloadData(result.json);

    assert.equal(result.status, 0, cliFailureMessage(result));
    assert.equal(result.json.command, 'inspect');
    assertInspectSections(data);
    assertTargetRepresents(data, 'port', port);
    assertHasDiagnosticClassification(data);
    assertPortEvidenceIncludes(data, port);
    assertExternalOrUnknownOwnership(data);
    assertBlockedActionsInclude(data.blockedActions, 'stop');
    assertBlockedActionsInclude(data.blockedActions, 'kill');
    assertBlockedActionsInclude(data.blockedActions, 'restart');
    assertNoStopOrKillAction(data.safeActions);
    assert.equal(server.listening, true);
    assert.equal(await canConnect(port), true);
  } finally {
    fixture.cleanup();
    await closeServer(server);
  }
});

test('inspect pid:<pid> reports an external listener as inspect-only', async () => {
  const { server, port } = await listenOnFreePort();
  const fixture = createManagedProjectFixture({
    name: 'inspect-pid-unified',
    port
  });

  try {
    const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'inspect-pid-unified']);
    assert.equal(added.status, 0, added.stderr);

    const result = fixture.runGlobalCliJson(['inspect', `pid:${process.pid}`]);
    const data = payloadData(result.json);

    assert.equal(result.status, 0, cliFailureMessage(result));
    assert.equal(result.json.command, 'inspect');
    assertInspectSections(data);
    assertTargetRepresents(data, 'pid', process.pid);
    assertHasDiagnosticClassification(data);
    assertExternalOrUnknownOwnership(data);
    assertBlockedActionsInclude(data.blockedActions, 'stop');
    assertBlockedActionsInclude(data.blockedActions, 'kill');
    assertBlockedActionsInclude(data.blockedActions, 'restart');
    assertNoStopOrKillAction(data.safeActions);
    assert.equal(server.listening, true);
  } finally {
    fixture.cleanup();
    await closeServer(server);
  }
});

test('inspect task:<alias:task> reports a Launchdeck-owned managed run with evidence and actions', async () => {
  const port = await getFreePort();
  const fixture = createManagedProjectFixture({
    name: 'inspect-task-owned',
    port
  });

  try {
    const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'inspect-task-owned']);
    assert.equal(added.status, 0, added.stderr);
    const started = fixture.runCliJson(['start', 'inspect-task-owned:dev']);
    assert.equal(started.status, 0, started.stderr);
    await delay(250);

    const result = fixture.runGlobalCliJson(['inspect', 'task:inspect-task-owned:dev']);
    const data = payloadData(result.json);

    assert.equal(result.status, 0, cliFailureMessage(result));
    assert.equal(result.json.command, 'inspect');
    assertInspectSections(data);
    assertTargetRepresents(data, 'task', 'inspect-task-owned:dev');
    assertHasDiagnosticClassification(data);
    assertProjectEvidenceIncludes(data, 'inspect-task-owned');
    assertTaskEvidenceIncludes(data, 'dev');
    assertRunEvidenceIncludes(data, started.json.process.runId);
    assertPortEvidenceIncludes(data, port);
    assertSafeActionsInclude(data.safeActions, 'launchdeck logs');
    assertSafeActionsInclude(data.safeActions, 'launchdeck stop');
    assert.deepEqual(data.blockedActions, []);
  } finally {
    fixture.cleanup();
  }
});

test('inspect pid:<pid> reports a Launchdeck-owned managed run when pid matches run evidence', async () => {
  const port = await getFreePort();
  const fixture = createManagedProjectFixture({
    name: 'inspect-owned-pid',
    port
  });

  try {
    const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'inspect-owned-pid']);
    assert.equal(added.status, 0, added.stderr);
    const started = fixture.runCliJson(['start', 'inspect-owned-pid:dev']);
    assert.equal(started.status, 0, started.stderr);
    await delay(250);

    const result = fixture.runGlobalCliJson(['inspect', `pid:${started.json.process.pid}`]);
    const data = payloadData(result.json);

    assert.equal(result.status, 0, cliFailureMessage(result));
    assert.equal(result.json.command, 'inspect');
    assertInspectSections(data);
    assertTargetRepresents(data, 'pid', started.json.process.pid);
    assertHasDiagnosticClassification(data);
    assertProjectEvidenceIncludes(data, 'inspect-owned-pid');
    assertRunEvidenceIncludes(data, started.json.process.runId);
    assertSafeActionsInclude(data.safeActions, 'launchdeck stop inspect-owned-pid:dev');
    assert.deepEqual(data.blockedActions, []);
  } finally {
    fixture.cleanup();
  }
});

function payloadData(payload) {
  return payload.data ?? payload;
}

function errorCode(payload) {
  return payload.code ?? payload.error?.code;
}

function cliFailureMessage(result) {
  return [
    `status=${result.status}`,
    `stdout=${result.stdout.trim()}`,
    `stderr=${result.stderr.trim()}`
  ].join('\n');
}

function assertInspectSections(data) {
  assert.equal(typeof data, 'object');
  assert.notEqual(data, null);
  assert.equal(Array.isArray(data.safeActions), true);
  assert.equal(Array.isArray(data.blockedActions), true);
  assert.ok('target' in data, `Expected inspect target, got ${JSON.stringify(data)}`);
  assert.ok('ownership' in data, `Expected inspect ownership, got ${JSON.stringify(data)}`);
}

function assertTargetRepresents(data, expectedType, expectedValue) {
  const target = data.target;
  assert.equal(typeof target, 'object');
  assert.notEqual(target, null);

  const targetText = JSON.stringify(target);
  assert.ok(
    targetText.includes(expectedType),
    `Expected target to represent ${expectedType}, got ${JSON.stringify(target)}`
  );
  assert.ok(
    targetText.includes(String(expectedValue)),
    `Expected target to represent ${expectedValue}, got ${JSON.stringify(target)}`
  );
}

function assertHasDiagnosticClassification(data) {
  assert.ok(
    typeof data.classification === 'string' || typeof data.status === 'string',
    `Expected inspect classification or status, got ${JSON.stringify(data)}`
  );
}

function assertPortEvidenceIncludes(data, expectedPort) {
  const evidence = [
    ...arrayField(data.ports),
    ...arrayField(data.listeners),
    ...arrayField(data.conflicts),
    ...arrayField(data.evidence)
  ];
  assert.ok(
    evidence.some((entry) => objectValuesInclude(entry, expectedPort)),
    `Expected inspect evidence to include port ${expectedPort}, got ${JSON.stringify(data)}`
  );
}

function assertProjectEvidenceIncludes(data, expectedAlias) {
  assert.ok(
    objectValuesInclude(data.project, expectedAlias) || arrayField(data.evidence).some((entry) => objectValuesInclude(entry, expectedAlias)),
    `Expected inspect evidence to include project ${expectedAlias}, got ${JSON.stringify(data)}`
  );
}

function assertTaskEvidenceIncludes(data, expectedTask) {
  assert.ok(
    objectValuesInclude(data.task, expectedTask) || arrayField(data.evidence).some((entry) => objectValuesInclude(entry, expectedTask)),
    `Expected inspect evidence to include task ${expectedTask}, got ${JSON.stringify(data)}`
  );
}

function assertRunEvidenceIncludes(data, expectedRunId) {
  assert.ok(
    objectValuesInclude(data.run, expectedRunId) || arrayField(data.evidence).some((entry) => objectValuesInclude(entry, expectedRunId)),
    `Expected inspect evidence to include run ${expectedRunId}, got ${JSON.stringify(data)}`
  );
}

function assertExternalOrUnknownOwnership(data) {
  const ownershipText = JSON.stringify(data.ownership ?? data).toLowerCase();
  assert.ok(
    /\b(external|unknown|unverified|not[-_ ]?verified|fail[-_ ]?closed)\b/.test(ownershipText),
    `Expected external or unknown ownership, got ${JSON.stringify(data.ownership)}`
  );
  assert.equal(/\bverified[-_ ]?owned\b/.test(ownershipText), false);
}

function assertSafeActionsInclude(actions, expected) {
  assert.equal(Array.isArray(actions), true);
  assert.ok(
    actions.some((action) => actionCommand(action).includes(expected)),
    `Expected safeActions to include ${expected}, got ${JSON.stringify(actions)}`
  );
}

function assertBlockedActionsInclude(actions, expected) {
  assert.equal(Array.isArray(actions), true);
  assert.ok(
    actions.some((action) => actionText(action).includes(expected)),
    `Expected blockedActions to include ${expected}, got ${JSON.stringify(actions)}`
  );
}

function assertNoStopOrKillAction(actions) {
  const unsafe = actions.filter((action) => /\b(stop|force-stop|kill|restart)\b/i.test(actionCommand(action)));
  assert.deepEqual(unsafe, []);
}

function arrayField(value) {
  return Array.isArray(value) ? value : [];
}

function objectValuesInclude(value, expected) {
  return JSON.stringify(value ?? '').includes(String(expected));
}

function actionCommand(action) {
  if (typeof action === 'string') {
    return action;
  }
  return String(action?.command ?? action?.label ?? '');
}

function actionText(action) {
  if (typeof action === 'string') {
    return action;
  }
  return JSON.stringify(action ?? '');
}

async function getFreePort() {
  const { server, port } = await listenOnFreePort();
  await closeServer(server);
  await waitForPortFree(port);
  return port;
}

function listenOnFreePort() {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve({
        server,
        port: server.address().port
      });
    });
  });
}

async function waitForPortFree(port) {
  const deadline = Date.now() + 2_000;
  while (Date.now() <= deadline) {
    const available = await canListen(port);
    if (available) {
      return;
    }
    await delay(50);
  }
  throw new Error(`Port ${port} did not become available for test setup.`);
}

function canListen(port) {
  const server = net.createServer();
  return new Promise((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
