import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createCliFixture,
  createTempProject,
  removeTempProject,
  runCliJson,
  writeConfig
} from './helpers/cli-fixture.js';

const runtimeLockPath = path.join(os.tmpdir(), 'launchdeck-managed-runtime-test.lock');
const runtimeLockStaleMs = 300_000;

test('project add and projects list use an idempotent isolated global registry', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const fixture = createCliFixture();
    try {
      writeManagedProject(fixture, { name: 'global-one', port: await getFreePort() });

      const added = fixture.runCliJson(['project', 'add'], { env });
      assert.equal(added.status, 0, added.stderr);
      assert.equal(added.json.project.name, 'global-one');
      assert.equal(added.json.project.projectRoot, fixture.projectRoot);
      assert.equal(added.json.project.configPath, fixture.path('.launchdeck.yml'));

      const repeated = fixture.runCliJson(['project', 'add'], { env });
      assert.equal(repeated.status, 0, repeated.stderr);
      assert.equal(repeated.json.project.id, added.json.project.id);

      const listed = runCliJson(['projects'], { cwd: homeDir, env });
      assert.equal(listed.status, 0, listed.stderr);
      assert.equal(listed.json.projects.length, 1);
      assert.equal(listed.json.projects[0].name, 'global-one');
      assert.equal(listed.json.projects[0].projectRoot, fixture.projectRoot);
    } finally {
      fixture.cleanup();
    }
  });
});

test('project add keeps aliases unique and idempotent for the same project root', async () => {
  await withGlobalHome(async ({ env }) => {
    const first = createCliFixture();
    const second = createCliFixture();
    try {
      writeManagedProject(first, { name: 'alias-first', port: await getFreePort() });
      writeManagedProject(second, { name: 'alias-second', port: await getFreePort() });

      const added = first.runCliJson(['project', 'add', first.projectRoot, '--alias', 'shared-alias'], { env });
      assert.equal(added.status, 0, added.stderr);
      assert.equal(payloadData(added.json).project.alias, 'shared-alias');
      assert.equal(payloadData(added.json).created, true);

      const repeated = first.runCliJson(['project', 'add', first.projectRoot, '--alias', 'shared-alias'], { env });
      assert.equal(repeated.status, 0, repeated.stderr);
      assert.equal(payloadData(repeated.json).project.projectId, payloadData(added.json).project.projectId);
      assert.equal(payloadData(repeated.json).updated, true);

      const collision = second.runCliJson(['project', 'add', second.projectRoot, '--alias', 'shared-alias'], { env });
      assert.equal(collision.status, 1);
      assert.equal(errorCode(collision.json), 'alias_conflict');
      assert.equal(payloadData(collision.json).details.alias, 'shared-alias');
      assert.equal(payloadData(collision.json).details.existingProjectId, payloadData(added.json).project.projectId);
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });
});

test('project repair updates path config and alias without changing project identity', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const original = createCliFixture();
    const moved = createCliFixture();
    try {
      writeManagedProject(original, { name: 'repair-original', port: await getFreePort() });
      writeManagedProject(moved, { name: 'repair-moved', port: await getFreePort() });

      const added = original.runCliJson(['project', 'add', original.projectRoot, '--alias', 'repair-old'], { env });
      assert.equal(added.status, 0, added.stderr);
      const projectId = payloadData(added.json).project.projectId;

      const repaired = runCliJson([
        'project',
        'repair',
        'repair-old',
        '--path',
        moved.projectRoot,
        '--config',
        moved.path('.launchdeck.yml'),
        '--alias',
        'repair-new'
      ], { cwd: homeDir, env });

      assert.equal(repaired.status, 0, repaired.stderr);
      assert.equal(payloadData(repaired.json).before.projectId, projectId);
      assert.equal(payloadData(repaired.json).before.alias, 'repair-old');
      assert.equal(payloadData(repaired.json).after.projectId, projectId);
      assert.equal(payloadData(repaired.json).after.alias, 'repair-new');
      assert.equal(payloadData(repaired.json).after.projectRoot, moved.projectRoot);
      assert.equal(payloadData(repaired.json).after.configPath, moved.path('.launchdeck.yml'));
      assert.deepEqual(payloadData(repaired.json).changes.sort(), ['alias', 'configPath', 'projectRoot'].sort());

      const listed = runCliJson(['projects'], { cwd: homeDir, env });
      assert.equal(listed.status, 0, listed.stderr);
      assert.equal(payloadData(listed.json).projects.length, 1);
      assert.equal(payloadData(listed.json).projects[0].projectId, projectId);
      assert.equal(payloadData(listed.json).projects[0].alias, 'repair-new');
    } finally {
      original.cleanup();
      moved.cleanup();
    }
  });
});

test('ps --all aggregates managed processes from registered projects', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const first = createCliFixture();
    const second = createCliFixture();
    try {
      writeManagedProject(first, { name: 'global-first', port: await getFreePort() });
      writeManagedProject(second, { name: 'global-second', port: await getFreePort() });
      assert.equal(first.runCliJson(['project', 'add'], { env }).status, 0);
      assert.equal(second.runCliJson(['project', 'add'], { env }).status, 0);

      assert.equal(first.runCliJson(['start', 'dev'], { env }).status, 0);
      assert.equal(second.runCliJson(['start', 'dev'], { env }).status, 0);
      await delay(250);

      const result = runCliJson(['ps', '--all'], { cwd: homeDir, env });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        result.json.processes.map((entry) => `${entry.project.name}:${entry.task}`).sort(),
        ['global-first:dev', 'global-second:dev']
      );
      assert.deepEqual(
        result.json.runs.map((entry) => `${entry.project.name}:${entry.task}`).sort(),
        ['global-first:dev', 'global-second:dev']
      );
      assert.equal(result.json.processes.every((entry) => entry.owner === 'launchdeck'), true);
    } finally {
      stopFixtureTasks(first, env, ['dev']);
      stopFixtureTasks(second, env, ['dev']);
      first.cleanup();
      second.cleanup();
    }
  });
});

test('ports reports declared ports and current Launchdeck-managed state', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const fixture = createCliFixture();
    const port = await getFreePort();
    try {
      writeManagedProject(fixture, { name: 'global-ports', port });
      assert.equal(fixture.runCliJson(['project', 'add'], { env }).status, 0);
      assert.equal(fixture.runCliJson(['start', 'dev'], { env }).status, 0);
      await delay(250);

      const result = runCliJson(['ports'], { cwd: homeDir, env });
      assert.equal(result.status, 0, result.stderr);
      const entry = result.json.ports.find((candidate) => candidate.port === port);
      assert.ok(entry);
      assert.equal(entry.project.name, 'global-ports');
      assert.equal(entry.task, 'dev');
      assert.equal(entry.process.status, 'running');
      assert.match(entry.ownership, /^launchdeck-/);
    } finally {
      stopFixtureTasks(fixture, env, ['global-ports:dev', 'dev']);
      fixture.cleanup();
    }
  });
});

test('ports prefer the newest active run record for a declared project task', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const fixture = createCliFixture();
    const port = await getFreePort();
    try {
      writeReadyProject(fixture, { name: 'global-newest-run', port });
      assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'newest-run'], { env }).status, 0);
      const started = fixture.runCliJson(['start', 'newest-run:dev'], { env });
      assert.equal(started.status, 0, started.stderr);
      const runIndex = readRunIndex(env.LAUNCHDECK_HOME);
      const currentRun = runIndex.runs.find((candidate) => candidate.runId === started.json.process.runId);
      assert.ok(currentRun);
      writeRunIndex(env.LAUNCHDECK_HOME, {
        ...runIndex,
        runs: [
          {
            ...currentRun,
            runId: 'run_older_active_duplicate',
            transactionId: 'tx_older_active_duplicate',
            pid: 1,
            status: 'running',
            startedAt: '2026-07-08T00:00:00.000Z',
            lastObservedAt: '2026-07-08T00:00:01.000Z'
          },
          currentRun
        ]
      });

      const result = runCliJson(['ports'], { cwd: homeDir, env });

      assert.equal(result.status, 0, result.stderr);
      const entry = result.json.ports.find((candidate) => candidate.port === port);
      assert.ok(entry);
      assert.equal(entry.run.runId, started.json.process.runId);
      assert.equal(entry.process.pid, started.json.process.pid);
      assert.notEqual(entry.ownership, 'conflict');
    } finally {
      stopFixtureTasks(fixture, env, ['newest-run:dev', 'dev'], { cwd: homeDir });
      fixture.cleanup();
    }
  });
});

test('inspect-port reports an occupied external port without claiming ownership', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const { server, port } = await listenOnFreePort();
    try {
      const result = runCliJson(['inspect-port', String(port)], { cwd: homeDir, env });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.json.port, port);
      assert.equal(result.json.ownerType, 'external');
      assert.equal(result.json.declaredOwners.length, 0);
      assert.equal(result.json.listeners.length > 0, true);
    } finally {
      await closeServer(server);
    }
  });
});

test('inspect-port reports ownership conflict when declared active run pid differs from listener', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const fixture = createCliFixture();
    const { server, port } = await listenOnFreePort();
    try {
      writeManagedProject(fixture, { name: 'global-owner-conflict', port });
      assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'owner-conflict'], { env }).status, 0);
      const project = runCliJson(['projects'], { cwd: homeDir, env }).json.projects[0];
      writeRunIndex(env.LAUNCHDECK_HOME, {
        version: 1,
        updatedAt: '2026-07-08T00:00:00.000Z',
        runs: [
          {
            runId: 'run_declared_active_mismatch',
            transactionId: 'tx_declared_active_mismatch',
            projectId: project.projectId,
            projectAlias: project.alias,
            projectRoot: fixture.projectRoot,
            task: 'dev',
            command: 'node scripts/dev.js',
            cwd: fixture.projectRoot,
            pid: 1,
            status: 'running',
            declaredPorts: [port],
            logPath: fixture.path('.launchdeck', 'logs', 'dev.log'),
            startedAt: '2026-07-08T00:00:00.000Z',
            lastObservedAt: '2026-07-08T00:00:01.000Z'
          }
        ]
      });

      const result = runCliJson(['inspect-port', String(port)], { cwd: homeDir, env });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.json.ownerType, 'conflict');
      assert.equal(result.json.declaredOwners[0].ownership, 'conflict');
      assert.equal(result.json.conflicts.length, 1);
      assert.equal(result.json.conflicts[0].type, 'ownership_conflict');
    } finally {
      await closeServer(server);
      fixture.cleanup();
    }
  });
});

test('start refuses an externally occupied declared port instead of creating a duplicate service', async () => {
  await withGlobalHome(async ({ env }) => {
    const fixture = createCliFixture();
    const { server, port } = await listenOnFreePort();
    try {
      writeManagedProject(fixture, { name: 'global-conflict', port });

      const result = fixture.runCliJson(['start', 'dev'], { env });

      assert.equal(result.status, 1);
      assert.equal(result.json.error.code, 'port_conflict');
      assert.equal(result.json.error.details.port, port);
    } finally {
      await closeServer(server);
      fixture.cleanup();
    }
  });
});

test('start project:task writes a global run index record with lifecycle identity', async () => {
  await withGlobalHome(async ({ env }) => {
    const fixture = createCliFixture();
    const port = await getFreePort();
    try {
      writeReadyProject(fixture, { name: 'global-run-index', port });
      assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'run-index'], { env }).status, 0);

      const started = fixture.runCliJson(['start', 'run-index:dev'], { env });

      assert.equal(started.status, 0, started.stderr);
      assert.match(started.json.process.runId, /^run_[A-Za-z0-9_-]+$/);
      assert.match(started.json.process.transactionId, /^tx_[A-Za-z0-9_-]+$/);
      const runIndex = readRunIndex(env.LAUNCHDECK_HOME);
      const run = runIndex.runs.find((candidate) => candidate.runId === started.json.process.runId);
      assert.equal(run.task, 'dev');
      assert.equal(run.projectAlias, 'run-index');
      assert.equal(run.projectRoot, fixture.projectRoot);
      assert.equal(run.pid, started.json.process.pid);
      assert.deepEqual(run.declaredPorts, [port]);
      assert.ok(['starting', 'running', 'ready'].includes(run.status));
    } finally {
      stopFixtureTasks(fixture, env, ['run-index:dev', 'dev']);
      fixture.cleanup();
    }
  });
});

test('start project:task injects global run markers into the managed task environment', async () => {
  await withGlobalHome(async ({ env }) => {
    const fixture = createCliFixture();
    try {
      writeReadyProject(fixture, { name: 'global-env', port: await getFreePort() });
      assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'global-env'], { env }).status, 0);

      const started = fixture.runCliJson(['start', 'global-env:dev'], { env });
      assert.equal(started.status, 0, started.stderr);
      const marker = await readJsonWhenReady(fixture.path('tmp', 'ready-env.json'));

      assert.equal(marker.LAUNCHDECK_HOME, env.LAUNCHDECK_HOME);
      assert.equal(marker.LAUNCHDECK_TASK, 'dev');
      assert.equal(marker.LAUNCHDECK_RUN_ID, started.json.process.runId);
      assert.equal(marker.LAUNCHDECK_PROJECT_ID, started.json.project.id);
    } finally {
      stopFixtureTasks(fixture, env, ['global-env:dev', 'dev']);
      fixture.cleanup();
    }
  });
});

test('start project:task returns the existing run without spawning a second process', async () => {
  await withGlobalHome(async ({ env }) => {
    const fixture = createCliFixture();
    try {
      writeReadyProject(fixture, { name: 'global-idempotent', port: await getFreePort() });
      assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'global-idempotent'], { env }).status, 0);
      const first = fixture.runCliJson(['start', 'global-idempotent:dev'], { env });
      assert.equal(first.status, 0, first.stderr);

      const second = fixture.runCliJson(['start', 'global-idempotent:dev'], { env });

      assert.equal(second.status, 0, second.stderr);
      assert.equal(second.json.process.runId, first.json.process.runId);
      assert.equal(second.json.process.pid, first.json.process.pid);
      assert.equal(second.json.process.spawned, false);
      assert.equal(Number(fs.readFileSync(fixture.path('tmp', 'ready-start-count.txt'), 'utf8')), 1);
    } finally {
      stopFixtureTasks(fixture, env, ['global-idempotent:dev', 'dev']);
      fixture.cleanup();
    }
  });
});

test('start project:task reports HTTP readiness separately from process liveness', async () => {
  await withGlobalHome(async ({ env }) => {
    const fixture = createCliFixture();
    const port = await getFreePort();
    try {
      writeReadyProject(fixture, { name: 'global-http-ready', port });
      assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'http-ready'], { env }).status, 0);

      const started = fixture.runCliJson(['start', 'http-ready:dev'], { env });

      assert.equal(started.status, 0, started.stderr);
      assert.ok(started.json.readiness, 'start payload should include readiness state');
      assert.equal(started.json.readiness.kind, 'http');
      assert.equal(started.json.readiness.status, 'ready');
      assert.equal(started.json.process.status, 'ready');
      assert.equal(started.json.readiness.url, `http://127.0.0.1:${port}/health`);
    } finally {
      stopFixtureTasks(fixture, env, ['http-ready:dev', 'dev']);
      fixture.cleanup();
    }
  });
});

test('start project:task falls back to process-alive readiness when no port is declared', async () => {
  await withGlobalHome(async ({ env }) => {
    const fixture = createCliFixture();
    try {
      writeProcessAliveProject(fixture, { name: 'global-process-ready' });
      assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'process-ready'], { env }).status, 0);

      const started = fixture.runCliJson(['start', 'process-ready:dev'], { env });

      assert.equal(started.status, 0, started.stderr);
      assert.ok(started.json.readiness, 'start payload should include readiness state');
      assert.equal(started.json.readiness.kind, 'process-alive');
      assert.equal(started.json.readiness.status, 'ready');
      assert.equal(started.json.process.status, 'ready');
    } finally {
      stopFixtureTasks(fixture, env, ['process-ready:dev', 'dev']);
      fixture.cleanup();
    }
  });
});

test('status --all exposes safe next actions for active owned runs', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const fixture = createCliFixture();
    try {
      writeReadyProject(fixture, { name: 'global-status-actions', port: await getFreePort() });
      assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'status-actions'], { env }).status, 0);
      const started = fixture.runCliJson(['start', 'status-actions:dev'], { env });
      assert.equal(started.status, 0, started.stderr);

      const status = runCliJson(['status', '--all'], { cwd: homeDir, env });

      assert.equal(status.status, 0, status.stderr);
      assert.ok(Array.isArray(status.json.runs), 'status payload should include global runs');
      const run = status.json.runs.find((candidate) => candidate.runId === started.json.process.runId);
      assert.ok(run, 'status payload should include the started run');
      assert.equal(run.task, 'dev');
      assert.ok(run.next.some((action) => action.command.includes(`logs ${run.projectId}:dev`)));
      assert.ok(run.next.some((action) => action.command.includes(`stop ${run.projectId}:dev`)));
      assert.equal(run.next.some((action) => action.command.includes('inspect run:')), false);
    } finally {
      stopFixtureTasks(fixture, env, ['status-actions:dev', 'dev'], { cwd: homeDir });
      fixture.cleanup();
    }
  });
});

test('status --all uses stable project id next actions after alias repair', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const fixture = createCliFixture();
    try {
      writeReadyProject(fixture, { name: 'global-stable-next', port: await getFreePort() });
      assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'old-alias'], { env }).status, 0);
      const started = fixture.runCliJson(['start', 'old-alias:dev'], { env });
      assert.equal(started.status, 0, started.stderr);
      const projectId = started.json.project.id;
      assert.equal(fixture.runCliJson(['project', 'repair', 'old-alias', '--alias', 'new-alias'], { env }).status, 0);

      const status = runCliJson(['status', '--all'], { cwd: homeDir, env });

      assert.equal(status.status, 0, status.stderr);
      const run = status.json.runs.find((candidate) => candidate.runId === started.json.process.runId);
      assert.ok(run, 'status payload should include the started run');
      assert.ok(run.next.some((action) => action.command.includes(`logs ${projectId}:dev`)));
      assert.ok(run.next.some((action) => action.command.includes(`stop ${projectId}:dev`)));
      assert.equal(run.next.some((action) => action.command.includes('old-alias:dev')), false);
      assert.equal(runCliJson(['logs', `${projectId}:dev`, '--lines', '5'], { cwd: homeDir, env }).status, 0);
    } finally {
      stopFixtureTasks(fixture, env, ['new-alias:dev', 'old-alias:dev', 'dev'], { cwd: homeDir });
      fixture.cleanup();
    }
  });
});

test('status --all summarizes registered projects, processes, ports, and conflicts', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const running = createCliFixture();
    const conflicted = createCliFixture();
    const { server, port: occupiedPort } = await listenOnFreePort();
    try {
      writeManagedProject(running, { name: 'status-running', port: await getFreePort() });
      writeManagedProject(conflicted, { name: 'status-conflicted', port: occupiedPort });
      assert.equal(running.runCliJson(['project', 'add'], { env }).status, 0);
      assert.equal(conflicted.runCliJson(['project', 'add'], { env }).status, 0);
      assert.equal(running.runCliJson(['start', 'dev'], { env }).status, 0);
      await delay(250);

      const result = runCliJson(['status', '--all'], { cwd: homeDir, env });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.json.command, 'status');
      assert.equal(result.json.scope, 'global');
      assert.equal(result.json.summary.projects.total, 2);
      assert.equal(result.json.summary.processes.running, 1);
      assert.equal(result.json.summary.ports.declared, 2);
      assert.equal(result.json.summary.ports.conflicts, 1);
      assert.equal(result.json.conflicts.length, 1);
      assert.equal(result.json.conflicts[0].port, occupiedPort);
      assert.equal(result.json.conflicts[0].type, 'external_port_occupied');
      assert.deepEqual(
        result.json.projects.map((project) => [project.name, project.status]).sort(),
        [
          ['status-conflicted', 'conflict'],
          ['status-running', 'running']
        ]
      );
    } finally {
      stopFixtureTasks(running, env, ['dev']);
      await closeServer(server);
      running.cleanup();
      conflicted.cleanup();
    }
  });
});

test('start project:task fails before spawn when global run index is not writable', async () => {
  await withGlobalHome(async ({ env }) => {
    const fixture = createCliFixture();
    try {
      writeProcessAliveProject(fixture, { name: 'global-run-index-unwritable' });
      assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'unwritable-index'], { env }).status, 0);
      fs.writeFileSync(path.join(env.LAUNCHDECK_HOME, 'runtime'), 'not a directory');

      const started = fixture.runCliJson(['start', 'unwritable-index:dev'], { env });

      assert.equal(started.status, 1);
      assert.equal(fs.existsSync(fixture.path('tmp', 'process-alive-env.json')), false);
      assert.equal(fs.existsSync(fixture.path('.launchdeck', 'runtime', 'state.json')), false);
    } finally {
      stopFixtureTasks(fixture, env, ['unwritable-index:dev', 'dev']);
      fixture.cleanup();
    }
  });
});

test('conflicts reports externally occupied declared ports without stopping anything', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const fixture = createCliFixture();
    const { server, port } = await listenOnFreePort();
    try {
      writeManagedProject(fixture, { name: 'global-external-conflict', port });
      assert.equal(fixture.runCliJson(['project', 'add'], { env }).status, 0);

      const result = runCliJson(['conflicts'], { cwd: homeDir, env });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.json.command, 'conflicts');
      assert.equal(result.json.conflicts.length, 1);
      assert.equal(result.json.conflicts[0].port, port);
      assert.equal(result.json.conflicts[0].type, 'external_port_occupied');
      assert.equal(result.json.conflicts[0].project.name, 'global-external-conflict');
      assert.equal(result.json.conflicts[0].task, 'dev');
      assert.equal(server.listening, true);
    } finally {
      await closeServer(server);
      fixture.cleanup();
    }
  });
});

test('project remove deletes only the registry entry', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const fixture = createCliFixture();
    try {
      writeManagedProject(fixture, { name: 'global-removable', port: await getFreePort() });
      assert.equal(fixture.runCliJson(['project', 'add'], { env }).status, 0);
      const configPath = fixture.path('.launchdeck.yml');

      const removed = runCliJson(['project', 'remove', 'global-removable'], { cwd: homeDir, env });

      assert.equal(removed.status, 0, removed.stderr);
      assert.equal(removed.json.removed.name, 'global-removable');
      assert.equal(fs.existsSync(configPath), true);

      const listed = runCliJson(['projects'], { cwd: homeDir, env });
      assert.equal(listed.status, 0, listed.stderr);
      assert.equal(listed.json.projects.length, 0);
    } finally {
      fixture.cleanup();
    }
  });
});

test('project remove refuses to unregister a project with active owned runs', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const fixture = createCliFixture();
    try {
      writeManagedProject(fixture, { name: 'global-active-remove', port: await getFreePort() });
      assert.equal(fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'active-remove'], { env }).status, 0);
      assert.equal(fixture.runCliJson(['start', 'dev'], { env }).status, 0);
      await delay(250);

      const removed = runCliJson(['project', 'remove', 'active-remove'], { cwd: homeDir, env });

      assert.equal(removed.status, 1);
      assert.equal(errorCode(removed.json), 'project_has_active_runs');
      assert.ok(payloadData(removed.json).next.some((action) => action.command.includes('launchdeck status --all')));
      assert.ok(payloadData(removed.json).next.some((action) => action.command.includes('launchdeck stop active-remove:dev')));

      const listed = runCliJson(['projects'], { cwd: homeDir, env });
      assert.equal(listed.status, 0, listed.stderr);
      assert.equal(payloadData(listed.json).projects.length, 1);
      assert.equal(payloadData(listed.json).projects[0].alias, 'active-remove');
    } finally {
      stopFixtureTasks(fixture, env, ['active-remove:dev', 'dev']);
      fixture.cleanup();
    }
  });
});

test('project scan explicitly discovers configs while skipping heavy generated dirs', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const workspace = createTempProject({ prefix: 'launchdeck-cli-scan-' });
    try {
      const appRoot = path.join(workspace, 'apps', 'alpha');
      const ignoredRoot = path.join(workspace, 'node_modules', 'ignored-package');
      const beyondMaxDepthRoot = path.join(workspace, 'a', 'b', 'c', 'd', 'e', 'too-deep');
      fs.mkdirSync(appRoot, { recursive: true });
      fs.mkdirSync(ignoredRoot, { recursive: true });
      fs.mkdirSync(beyondMaxDepthRoot, { recursive: true });
      writeConfig(appRoot, configWithManagedTask({ name: 'scan-alpha', port: await getFreePort() }));
      writeConfig(ignoredRoot, configWithManagedTask({ name: 'scan-ignored', port: await getFreePort() }));
      writeConfig(beyondMaxDepthRoot, configWithManagedTask({ name: 'scan-too-deep', port: await getFreePort() }));

      const scanned = runCliJson(['project', 'scan', workspace], { cwd: homeDir, env });
      const repeated = runCliJson(['project', 'scan', workspace], { cwd: homeDir, env });
      const listed = runCliJson(['projects'], { cwd: homeDir, env });

      assert.equal(scanned.status, 0, scanned.stderr);
      assert.equal(repeated.status, 0, repeated.stderr);
      assert.equal(scanned.json.maxDepth, 5);
      assert.equal(scanned.json.maxDirs, 2_000);
      assert.equal(scanned.json.maxProjects, 100);
      assert.equal(scanned.json.truncated, false);
      assert.equal(scanned.json.found.some((project) => project.projectRoot === beyondMaxDepthRoot), false);
      assert.ok(scanned.json.ignored.some((entry) =>
        entry.path === path.join(workspace, 'node_modules') && entry.reason === 'generated_or_heavy'
      ));
      assert.deepEqual(scanned.json.registered.map((project) => project.name), ['scan-alpha']);
      assert.equal(listed.json.projects.length, 1);
      assert.equal(listed.json.projects[0].name, 'scan-alpha');
    } finally {
      removeTempProject(workspace);
    }
  });
});

test('logs project:task reads a registered project task log', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const fixture = createCliFixture();
    try {
      writeManagedProject(fixture, { name: 'global-logs', port: await getFreePort() });
      assert.equal(fixture.runCliJson(['project', 'add'], { env }).status, 0);
      assert.equal(fixture.runCliJson(['start', 'dev'], { env }).status, 0);
      await delay(250);

      const result = runCliJson(['logs', 'global-logs:dev', '--lines', '20'], { cwd: homeDir, env });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.json.command, 'logs');
      assert.equal(result.json.project.name, 'global-logs');
      assert.equal(result.json.task, 'dev');
      assert.equal(result.json.logPath, fixture.path('.launchdeck', 'logs', 'dev.log'));
      assert.match(result.json.content, /\[launchdeck\] starting dev/);
    } finally {
      stopFixtureTasks(fixture, env, ['global-logs:dev', 'dev']);
      fixture.cleanup();
    }
  });
});

test('logs --follow fails explicitly instead of starting an unbounded watcher', async () => {
  await withGlobalHome(async ({ homeDir, env }) => {
    const result = runCliJson(['logs', 'any-project:dev', '--follow'], { cwd: homeDir, env });

    assert.equal(result.status, 1);
    assert.equal(result.json.error.code, 'unsupported_option');
  });
});

async function withGlobalHome(callback) {
  return await withRuntimeLock(async () => {
    const homeDir = createTempProject({ prefix: 'launchdeck-cli-home-' });
    try {
      await callback({
        homeDir,
        env: {
          LAUNCHDECK_HOME: homeDir
        }
      });
    } finally {
      removeTempProject(homeDir);
    }
  });
}

async function withRuntimeLock(callback) {
  const lockHandle = await acquireRuntimeLock();
  try {
    return await callback();
  } finally {
    releaseRuntimeLock(lockHandle);
  }
}

async function acquireRuntimeLock() {
  const deadline = Date.now() + 180_000;
  while (Date.now() <= deadline) {
    try {
      const lockHandle = fs.openSync(runtimeLockPath, 'wx');
      fs.writeFileSync(lockHandle, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return lockHandle;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
      removeStaleRuntimeLock();
      await delay(50);
    }
  }
  throw new Error(`Timed out waiting for Launchdeck managed runtime test lock: ${runtimeLockPath}`);
}

function removeStaleRuntimeLock() {
  try {
    const stats = fs.statSync(runtimeLockPath);
    if (Date.now() - stats.mtimeMs > runtimeLockStaleMs) {
      fs.rmSync(runtimeLockPath, { force: true });
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

function releaseRuntimeLock(lockHandle) {
  fs.closeSync(lockHandle);
  fs.rmSync(runtimeLockPath, { force: true });
}

function stopFixtureTasks(fixture, env, selectors, options = {}) {
  for (const selector of selectors) {
    const runOptions = {
      env,
      timeout: 5_000
    };
    if (options.cwd) {
      runOptions.cwd = options.cwd;
    }
    fixture.runCli(['stop', selector, '--json'], runOptions);
  }
  killFixtureProcesses(fixture);
}

function killFixtureProcesses(fixture) {
  const statePath = fixture.path('.launchdeck', 'runtime', 'state.json');
  if (!fs.existsSync(statePath)) {
    return;
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return;
  }

  for (const processInfo of Object.values(state.processes ?? {})) {
    const pid = Number(processInfo?.pid);
    if (!Number.isInteger(pid) || pid <= 0) {
      continue;
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
    }
  }
  waitForFixtureProcessesToExit(Object.values(state.processes ?? {}).map((processInfo) => Number(processInfo?.pid)));
}

function waitForFixtureProcessesToExit(pids) {
  const livePids = pids.filter((pid) => Number.isInteger(pid) && pid > 0);
  const deadline = Date.now() + 2_000;
  while (Date.now() <= deadline) {
    const stillRunning = livePids.some((pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });
    if (!stillRunning) {
      return;
    }
    sleepSync(50);
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function configWithManagedTask({ name, port }) {
  return {
    version: 1,
    project: {
      name
    },
    tasks: {
      dev: {
        command: 'node scripts/dev.js',
        longRunning: true,
        ports: [port],
        risk: 'low'
      }
    },
    clean: {
      safe: [],
      risky: []
    }
  };
}

function writeManagedProject(fixture, options) {
  fixture.writeConfig(configWithManagedTask(options));
  fixture.writeScript(
    'scripts/dev.js',
    'setInterval(() => {}, 1000);'
  );
}

function writeReadyProject(fixture, { name, port }) {
  fixture.writeConfig({
    version: 1,
    project: {
      name
    },
    tasks: {
      dev: {
        command: `node scripts/ready-http.js ${port}`,
        longRunning: true,
        ports: [port],
        ready: {
          type: 'http',
          url: `http://127.0.0.1:${port}/health`,
          timeoutMs: 2_000
        },
        risk: 'low'
      }
    },
    clean: {
      safe: [],
      risky: []
    }
  });
  fixture.writeScript('scripts/ready-http.js', `
import fs from 'node:fs';
import http from 'node:http';
const port = Number(process.argv[2]);
fs.mkdirSync('tmp', { recursive: true });
const countPath = 'tmp/ready-start-count.txt';
const current = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, 'utf8')) : 0;
fs.writeFileSync(countPath, String(current + 1));
fs.writeFileSync('tmp/ready-env.json', JSON.stringify({
  LAUNCHDECK_HOME: process.env.LAUNCHDECK_HOME,
  LAUNCHDECK_PROJECT_ID: process.env.LAUNCHDECK_PROJECT_ID,
  LAUNCHDECK_RUN_ID: process.env.LAUNCHDECK_RUN_ID,
  LAUNCHDECK_TASK: process.env.LAUNCHDECK_TASK
}));
const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(404);
  response.end();
});
server.listen(port, '127.0.0.1');
`);
}

function writeProcessAliveProject(fixture, { name }) {
  fixture.writeConfig({
    version: 1,
    project: {
      name
    },
    tasks: {
      dev: {
        command: 'node scripts/process-alive.js',
        longRunning: true,
        risk: 'low'
      }
    },
    clean: {
      safe: [],
      risky: []
    }
  });
  fixture.writeScript('scripts/process-alive.js', 'setInterval(() => {}, 1000);');
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
    const server = net.createServer();
    const available = await new Promise((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
    });
    if (available) {
      return;
    }
    await delay(50);
  }
  throw new Error(`Port ${port} did not become available for test setup.`);
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function readRunIndex(homeDir) {
  return JSON.parse(fs.readFileSync(path.join(homeDir, 'runtime', 'runs.json'), 'utf8'));
}

function writeRunIndex(homeDir, runIndex) {
  const runsPath = path.join(homeDir, 'runtime', 'runs.json');
  fs.mkdirSync(path.dirname(runsPath), { recursive: true });
  fs.writeFileSync(runsPath, `${JSON.stringify(runIndex, null, 2)}\n`);
}

async function readJsonWhenReady(filePath) {
  const deadline = Date.now() + 2_000;
  while (Date.now() <= deadline) {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for fixture JSON: ${filePath}`);
}

function payloadData(payload) {
  return payload.data ?? payload;
}

function errorCode(payload) {
  return payload.code ?? payload.error?.code;
}
