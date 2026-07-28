import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createControlPlaneFixture } from './helpers/control-plane-fixture.js';

test('capabilities --json --compact preserves build, contract, policy, state, and executable identity', () => {
  const fixture = createControlPlaneFixture();
  try {
    const result = fixture.runGlobalCliJson(['capabilities', '--compact']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(singleJsonLineCount(result.stdout), 1);
    const capabilities = result.json.capabilities;
    assert.equal(capabilities.identity.product, 'Launchdeck');
    assert.equal(capabilities.identity.package.name, 'launchdeck');
    assert.match(capabilities.identity.package.version, /^\d+\.\d+\.\d+/);
    assert.match(capabilities.identity.buildIdentity, /^sha256:[a-f0-9]{64}$/);
    assert.equal(capabilities.contracts.agentProtocol.current, '1.0.0');
    assert.equal(capabilities.contracts.cliSchema.current, 1);
    assert.equal(capabilities.contracts.configSchema.current, 1);
    assert.equal(capabilities.riskPolicy.boundary, 'low-only');
    assert.ok(capabilities.operations.some((operation) => operation.name === 'capabilities.get'));
    assert.equal(capabilities.state.scope, 'global');
    assert.equal(capabilities.state.home, fixture.homeDir);
    assert.equal(path.resolve(capabilities.executable.path), path.resolve('src/cli.js'));
    assert.equal(path.resolve(capabilities.executable.runtimePath), path.resolve(process.execPath));
    assert.equal(result.json.agentResult, undefined);
  } finally {
    fixture.cleanup();
  }
});

test('status --all --json --compact bounds a large run index and exposes filter-aware pagination', () => {
  const fixture = createControlPlaneFixture();
  try {
    fixture.writeConfig({
      version: 1,
      project: { name: 'bounded-status' },
      tasks: {
        api: { command: 'node -e "process.exit(0)"', risk: 'low' },
        worker: { command: 'node -e "process.exit(0)"', risk: 'low' }
      },
      clean: { safe: [], risky: [] }
    });
    const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', 'bounded']);
    assert.equal(added.status, 0, added.stderr);
    const project = added.json.project;
    writeRunIndex(fixture.homeDir, Array.from({ length: 240 }, (_, index) => syntheticRun({
      index,
      project,
      projectRoot: fixture.projectRoot
    })));

    const bounded = fixture.runGlobalCliJson(['status', '--all', '--compact']);
    assert.equal(bounded.status, 0, bounded.stderr);
    assert.equal(singleJsonLineCount(bounded.stdout), 1);
    assert.equal(bounded.json.runs.length, 50);
    assert.equal(bounded.json.processes.length, 50);
    assert.deepEqual(bounded.json.pagination, {
      cursor: null,
      limit: 50,
      returned: 50,
      total: 240,
      truncated: true,
      nextCursor: '50'
    });
    assert.equal(bounded.json.summary.scope, 'page');
    assert.equal(bounded.json.summary.runs.total, bounded.json.runs.length);
    assert.equal(bounded.json.summary.processes.total, bounded.json.processes.length);

    const filtered = fixture.runGlobalCliJson([
      'status', '--all', '--compact',
      '--project', 'bounded', '--task', 'api', '--active', '--limit', '7'
    ]);
    assert.equal(filtered.status, 0, filtered.stderr);
    assert.equal(filtered.json.runs.length, 7);
    assert.ok(filtered.json.runs.every((run) => run.project === 'bounded'));
    assert.ok(filtered.json.runs.every((run) => run.task === 'api'));
    assert.ok(filtered.json.runs.every((run) => ['ready', 'running', 'starting'].includes(run.status)));
    assert.deepEqual(filtered.json.filters, {
      project: 'bounded',
      task: 'api',
      active: true
    });
    assert.equal(filtered.json.pagination.total, 40);
    assert.equal(filtered.json.pagination.returned, 7);
    assert.equal(filtered.json.pagination.truncated, true);

    const nextPage = fixture.runGlobalCliJson([
      'status', '--all', '--compact',
      '--project', 'bounded', '--task', 'api', '--active', '--limit', '7',
      '--cursor', filtered.json.pagination.nextCursor
    ]);
    assert.equal(nextPage.status, 0, nextPage.stderr);
    assert.equal(nextPage.json.pagination.cursor, '7');
    assert.equal(nextPage.json.pagination.total, 40);
    assert.equal(nextPage.json.pagination.returned, 7);
    assert.equal(
      nextPage.json.runs.some((run) => filtered.json.runs.some((first) => first.runId === run.runId)),
      false
    );
  } finally {
    fixture.cleanup();
  }
});

function syntheticRun({ index, project, projectRoot }) {
  const active = index % 3 === 0;
  return {
    runId: `run_bounded_${String(index).padStart(3, '0')}`,
    transactionId: `tx_bounded_${String(index).padStart(3, '0')}`,
    projectId: project.projectId,
    projectAlias: project.alias,
    projectRoot,
    configPath: path.join(projectRoot, '.launchdeck.yml'),
    task: index % 2 === 0 ? 'api' : 'worker',
    command: 'node -e "process.exit(0)"',
    cwd: projectRoot,
    pid: active ? process.pid : 2_147_483_647,
    status: active ? 'running' : 'stopped',
    declaredPorts: [],
    logPath: path.join(projectRoot, '.launchdeck', 'logs', `${index}.log`),
    startedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, index)).toISOString(),
    lastObservedAt: new Date(Date.UTC(2026, 6, 1, 0, 1, index)).toISOString()
  };
}

function writeRunIndex(homeDir, runs) {
  const runsPath = path.join(homeDir, 'runtime', 'runs.json');
  fs.mkdirSync(path.dirname(runsPath), { recursive: true });
  fs.writeFileSync(runsPath, `${JSON.stringify({
    version: 1,
    updatedAt: '2026-07-01T00:10:00.000Z',
    runs
  }, null, 2)}\n`);
}

function singleJsonLineCount(stdout) {
  return stdout.trim().split(/\r?\n/).length;
}
