import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createAgentLifecycleService } from '../../../src/agent/lifecycle-service.js';
import { createHostRegistry } from '../../../src/agent/hosts/index.js';
import { digestCanonical } from '../../../src/agent/digests.js';
import { launcherPaths } from '../../../src/agent/artifacts/launcher.js';

const BUILD = `sha256:${'1'.repeat(64)}`;
const PLAN = `sha256:${'2'.repeat(64)}`;
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

test('status and doctor share one read-only diagnostic snapshot without mutation', async () => {
  const trace = [];
  const service = createAgentLifecycleService({
    diagnostics: {
      async observe(input) {
        trace.push(`observe:${input.operation}`);
        return diagnosticResult({
          health: [{ targetId: 'codex:project:skill', state: 'drifted', severity: 'error' }]
        });
      }
    },
    transaction: {
      async execute() {
        trace.push('mutation');
        throw new Error('diagnostics must be read-only');
      }
    }
  });

  const status = await service.status({ scope: 'project', projectRoot: process.cwd() });
  const doctor = await service.doctor({ scope: 'project', projectRoot: process.cwd() });

  assert.deepEqual(trace, ['observe:status', 'observe:doctor']);
  assert.equal(status.schemaVersion, 1);
  assert.equal(status.command, 'agent status');
  assert.equal(status.ok, true);
  assert.equal(status.result.health[0].state, 'drifted');
  assert.equal(doctor.schemaVersion, 1);
  assert.equal(doctor.command, 'agent doctor');
  assert.equal(doctor.ok, true, 'doctor execution may succeed while nested health fails');
  assert.equal(doctor.result.health[0].severity, 'error');
});

test('default diagnostics inspects live receipt targets and reports missing or foreign ownership', async () => {
  const receiptTarget = {
    targetId: 'codex:project:skill',
    hostId: 'codex',
    scope: 'project',
    component: 'skill',
    path: `${process.cwd()}\\.agents\\skills\\launchdeck-agent`,
    desiredDigest: BUILD,
    ownership: 'launchdeck'
  };
  let inspections = 0;
  const registry = {
    get() {
      return {
        async inspect(target) {
          inspections += 1;
          return {
            ...target,
            exists: false,
            state: 'missing',
            ownership: 'unknown'
          };
        }
      };
    }
  };
  const service = createAgentLifecycleService({
    registry,
    receiptStore: {
      async readCurrent() {
        return { buildIdentity: BUILD, receiptId: 'receipt_live', targets: [receiptTarget] };
      }
    }
  });

  const status = await service.status({ scope: 'project', projectRoot: process.cwd() });
  const doctor = await service.doctor({ scope: 'project', projectRoot: process.cwd() });

  assert.equal(inspections, 2);
  assert.equal(status.result.targets[0].state, 'missing');
  assert.equal(status.result.health[0].severity, 'error');
  assert.equal(doctor.result.health[0].state, 'missing');
  assert.match(doctor.result.nextActions[0].command, /repair/);
});

test('default diagnostics verifies the receipt-owned stable launcher without a host adapter', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-runtime-diagnostics-'));
  const env = { LAUNCHDECK_HOME: path.join(root, 'home') };
  const runtimePath = launcherPaths(env).root;
  fs.mkdirSync(runtimePath, { recursive: true });
  const bytes = Buffer.from('#!/usr/bin/env node\n');
  fs.writeFileSync(path.join(runtimePath, 'launcher.js'), bytes);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const desiredDigest = digestCanonical({
    schemaVersion: 1,
    skillName: 'v1',
    files: [{
      path: 'launcher.js',
      bytes: bytes.length,
      sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
    }]
  });
  const service = createAgentLifecycleService({
    env,
    receiptStore: {
      async readCurrent() {
        return {
          buildIdentity: BUILD,
          receiptId: 'receipt_runtime',
          targets: [{
            targetId: 'launchdeck:project:runtime',
            ownershipBoundary: 'stable-launcher',
            desiredDigest
          }]
        };
      }
    }
  });

  const status = await service.status({ scope: 'project', projectRoot: root });

  assert.equal(status.result.targets[0].path, runtimePath);
  assert.equal(status.result.targets[0].observedDigest, desiredDigest);
  assert.equal(status.result.targets[0].state, 'healthy');
  assert.equal(status.result.health[0].severity, 'info');
});

test('persisted receipt targets are detected and resolved before registered inspection', async () => {
  const receiptTarget = {
    targetId: 'codex:project:skill',
    hostId: 'codex',
    scope: 'project',
    component: 'skill',
    path: `${process.cwd()}\\.agents\\skills\\launchdeck-agent`,
    desiredDigest: BUILD,
    ownership: 'launchdeck'
  };
  const trace = [];
  const liveTarget = { ...receiptTarget };
  const adapter = {
    async detect(context) {
      trace.push(`detect:${context.scope}`);
      return [{ host: 'codex', version: '1.2.3', status: 'detected' }];
    },
    async resolveTargets(selection) {
      trace.push(`resolve:${selection.hostEvidence[0].version}`);
      return [liveTarget];
    },
    async inspect(target) {
      assert.equal(target, liveTarget);
      trace.push('inspect:live');
      return {
        ...target,
        exists: true,
        liveDigest: BUILD,
        ownership: 'launchdeck'
      };
    }
  };
  const service = createAgentLifecycleService({
    registry: { get: () => adapter },
    receiptStore: {
      async readCurrent() {
        return { buildIdentity: BUILD, receiptId: 'receipt_live', targets: [receiptTarget] };
      }
    }
  });

  const status = await service.status({
    scope: 'project',
    projectRoot: process.cwd(),
    homeDir: process.cwd()
  });

  assert.deepEqual(trace, ['detect:project', 'resolve:1.2.3', 'inspect:live']);
  assert.equal(status.result.targets[0].state, 'healthy');
  assert.equal(status.result.targets[0].ownership, 'launchdeck');
  assert.equal(status.result.health[0].severity, 'info');
});

test('default registered adapter rehydrates a deserialized receipt target with current host evidence', async () => {
  const projectRoot = process.cwd();
  const homeDir = process.cwd();
  const targetPath = path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent');
  const receiptTarget = {
    targetId: 'codex:project:skill',
    hostId: 'codex',
    scope: 'project',
    component: 'skill',
    path: targetPath,
    ownershipBoundary: 'launchdeck-agent',
    desiredDigest: BUILD,
    ownership: 'launchdeck'
  };
  const registry = createHostRegistry({
    matrix: {
      schemaVersion: 1,
      revision: 'diagnostics-reentry-v1',
      rows: [{
        rowId: `codex-0.96.0-${process.platform}-skill-project`,
        host: 'codex',
        exactVersion: '0.96.0',
        platform: process.platform,
        component: 'skill',
        scope: 'project',
        relativePath: '.agents/skills/launchdeck-agent',
        dialect: 'skill-directory',
        probe: 'codex --version',
        approvalBoundary: 'none',
        fixtureRevision: 'diagnostics-reentry-fixture-v1',
        realHostEvidenceRevision: 'diagnostics-reentry-live-v1',
        supportState: 'supported'
      }]
    },
    adapterOptions: {
      codex: {
        fs: { existsSync: () => false },
        probes: { version: 'codex-cli 0.96.0' }
      }
    }
  });
  const service = createAgentLifecycleService({
    registry,
    receiptStore: {
      async readCurrent() {
        return { buildIdentity: BUILD, receiptId: 'receipt_live', targets: [receiptTarget] };
      }
    }
  });

  const status = await service.status({ scope: 'project', projectRoot, homeDir });

  assert.equal(status.result.targets[0].state, 'missing');
  assert.equal(status.result.targets[0].inspectionCode, null);
  assert.equal(status.result.health[0].severity, 'error');
});

test('matching bytes do not promote foreign or unknown live ownership from receipt metadata', async () => {
  const receiptTarget = {
    targetId: 'codex:project:skill',
    hostId: 'codex',
    scope: 'project',
    component: 'skill',
    path: `${process.cwd()}\\.agents\\skills\\launchdeck-agent`,
    desiredDigest: BUILD,
    ownership: 'launchdeck'
  };

  for (const ownership of ['foreign', 'unknown']) {
    const service = createAgentLifecycleService({
      registry: {
        get() {
          return {
            async inspect() {
              return {
                ...receiptTarget,
                exists: true,
                liveDigest: BUILD,
                ownership
              };
            }
          };
        }
      },
      receiptStore: {
        async readCurrent() {
          return { buildIdentity: BUILD, receiptId: 'receipt_live', targets: [receiptTarget] };
        }
      }
    });

    const status = await service.status({ scope: 'project', projectRoot: process.cwd() });

    assert.equal(status.result.targets[0].state, 'divergent', ownership);
    assert.equal(status.result.targets[0].ownership, ownership);
    assert.equal(status.result.health[0].severity, 'error');
  }
});

test('default diagnostics derives the canonical project scope before reading the current receipt', async () => {
  let scopeReference;
  const service = createAgentLifecycleService({
    receiptStore: {
      async readCurrent(candidate) {
        scopeReference = candidate;
        return {
          buildIdentity: BUILD,
          receiptId: 'receipt_scoped',
          targets: []
        };
      }
    }
  });

  const status = await service.status({
    scope: 'project',
    projectRoot: process.cwd()
  });

  assert.equal(status.result.receiptId, 'receipt_scoped');
  assert.equal(status.result.entrypoints.scope, 'project');
  assert.equal(status.result.entrypoints.buildIdentity, BUILD);
  assert.match(status.result.entrypoints.cli.path.replaceAll('\\', '/'), /\/src\/cli\.js$/);
  assert.deepEqual(status.result.entrypoints.mcp.args, ['mcp', 'serve']);
  assert.match(status.result.entrypoints.runtime.path, new RegExp(BUILD.slice('sha256:'.length)));
  assert.equal(scopeReference.scope, 'project');
  assert.equal(scopeReference.projectIdentity, process.cwd());
  assert.match(scopeReference.scopeIdentity, /^project:sha256:[0-9a-f]{64}$/);
});

test('minimal durable receipt target is re-resolved and proven healthy from live digest evidence', async () => {
  const receiptTarget = {
    targetId: 'codex:project:skill',
    ownershipBoundary: 'launchdeck-agent',
    desiredDigest: BUILD
  };
  const liveTarget = {
    targetId: receiptTarget.targetId,
    hostId: 'codex',
    scope: 'project',
    component: 'skill',
    path: path.join(process.cwd(), '.agents', 'skills', 'launchdeck-agent'),
    ownershipBoundary: receiptTarget.ownershipBoundary
  };
  const adapter = {
    async detect() {
      return [{ host: 'codex', version: '1.2.3', status: 'detected' }];
    },
    async resolveTargets(selection) {
      assert.deepEqual(selection.components, ['skill']);
      return [liveTarget];
    },
    async inspect(target) {
      assert.equal(target, liveTarget);
      return {
        status: 'present',
        path: target.path,
        contentDigest: BUILD,
        ownershipBoundary: target.ownershipBoundary
      };
    }
  };
  const service = createAgentLifecycleService({
    registry: { get: () => adapter },
    receiptStore: {
      async readCurrent() {
        return {
          buildIdentity: BUILD,
          receiptId: 'receipt_minimal',
          targets: [receiptTarget]
        };
      }
    }
  });

  const status = await service.status({
    scope: 'project',
    projectRoot: process.cwd(),
    homeDir: process.cwd()
  });

  assert.equal(status.result.receiptId, 'receipt_minimal');
  assert.equal(status.result.targets[0].hostId, 'codex');
  assert.equal(status.result.targets[0].component, 'skill');
  assert.equal(status.result.targets[0].path, liveTarget.path);
  assert.equal(status.result.targets[0].state, 'healthy');
  assert.equal(status.result.targets[0].ownership, 'launchdeck');
  assert.equal(status.result.health[0].severity, 'info');
});

test('an uninstall tombstone plus an absent re-resolved target is healthy and offers setup', async () => {
  const receiptTarget = {
    targetId: 'codex:project:skill',
    ownershipBoundary: 'launchdeck-agent',
    desiredDigest: EMPTY
  };
  const liveTarget = {
    targetId: receiptTarget.targetId,
    hostId: 'codex',
    scope: 'project',
    component: 'skill',
    path: path.join(process.cwd(), '.agents', 'skills', 'launchdeck-agent'),
    ownershipBoundary: receiptTarget.ownershipBoundary
  };
  const service = createAgentLifecycleService({
    registry: {
      get() {
        return {
          async detect() {
            return [{ host: 'codex', version: '1.2.3', status: 'detected' }];
          },
          async resolveTargets() {
            return [liveTarget];
          },
          async inspect() {
            return {
              status: 'absent',
              path: liveTarget.path,
              contentDigest: null,
              ownershipBoundary: liveTarget.ownershipBoundary
            };
          }
        };
      }
    },
    receiptStore: {
      async readCurrent() {
        return {
          buildIdentity: BUILD,
          receiptId: 'receipt_uninstalled',
          targets: [receiptTarget]
        };
      }
    }
  });

  const status = await service.status({
    scope: 'project',
    projectRoot: process.cwd(),
    homeDir: process.cwd()
  });

  assert.equal(status.result.targets[0].state, 'absent');
  assert.equal(status.result.targets[0].ownership, 'launchdeck');
  assert.equal(status.result.health[0].severity, 'info');
  assert.deepEqual(status.result.nextActions, [{ command: 'launchdeck agent setup' }]);
});

function diagnosticResult(overrides = {}) {
  return {
    outcome: 'succeeded',
    effectCertainty: 'complete',
    scope: 'project',
    projectIdentity: process.cwd(),
    buildIdentity: BUILD,
    operationId: null,
    planDigest: PLAN,
    receiptId: null,
    targets: [],
    health: [],
    effects: [],
    nextActions: [{ command: 'launchdeck agent repair' }],
    error: null,
    ...overrides
  };
}
