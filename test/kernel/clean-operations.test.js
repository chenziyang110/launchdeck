import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOperationJournal } from '../../src/control-plane/operation-journal.js';
import { createApplicationKernel } from '../../src/kernel/application-kernel.js';
import { createCleanHandlers } from '../../src/kernel/operations/clean.js';

test('clean.plan returns one canonical project-bound safe snapshot and stable digest without effects', async () => {
  let planCalls = 0;
  await withCleanHarness({
    createPlan: async () => {
      planCalls += 1;
      return planCalls === 1
        ? cleanPlanFixture({ reverse: true })
        : cleanPlanFixture({ reverse: false });
    }
  }, async ({ execute }) => {
    const first = await execute('clean.plan');
    const second = await execute('clean.plan');

    assert.equal(planCalls, 2);
    assert.equal(first.outcome.kind, 'succeeded');
    assert.equal(first.outcome.code, 'clean_plan_created');
    assert.equal(first.resource.kind, 'cleanPlan');
    assert.equal(first.resource.status, 'planned');
    assert.match(first.resource.id, /^sha256:[0-9a-f]{64}$/);
    assert.equal(first.resource.data.planDigest, first.resource.id);
    assert.equal(second.resource.data.planDigest, first.resource.data.planDigest);
    assert.deepEqual(first.resource.data.targets.map((entry) => entry.rawPath), ['cache', 'dist']);
    assert.deepEqual(first.resource.data.protectedPaths, [
      'F:/fixtures/project-a/.launchdeck/logs/failed.log',
      'F:/fixtures/project-a/.launchdeck/logs/running.log'
    ]);
    assert.deepEqual(first.effects, { certainty: 'none', changed: false, evidenceRefs: [] });
    assert.equal(first.error, null);
  });
});

test('clean.applySafe recomputes under mutation locks and applies only a fresh matching safe plan', async () => {
  const observations = { planCalls: 0, applyCalls: 0, planObservedUnderLock: false };
  await withCleanHarness({
    createPlan: async ({ lockHeld }) => {
      observations.planCalls += 1;
      if (observations.planCalls > 1) observations.planObservedUnderLock = lockHeld;
      return cleanPlanFixture();
    },
    applySafe: async ({ operationId, plan, lockHeld }) => {
      observations.applyCalls += 1;
      assert.equal(lockHeld, true);
      assert.match(operationId, /^op_[A-Za-z0-9_-]{16,128}$/);
      assert.deepEqual(plan.protectedPaths, [
        'F:/fixtures/project-a/.launchdeck/logs/failed.log',
        'F:/fixtures/project-a/.launchdeck/logs/running.log'
      ]);
      return {
        removed: [
          { ...plan.targets[0], status: 'removed', existed: true },
          { ...plan.targets[1], status: 'partially_removed', existed: true }
        ],
        changed: true,
        evidenceRefs: ['clean:receipt:1']
      };
    }
  }, async ({ execute, journal }) => {
    const preview = await execute('clean.plan');
    const applied = await execute('clean.applySafe', { planDigest: preview.resource.data.planDigest });

    assert.equal(observations.planCalls, 2);
    assert.equal(observations.planObservedUnderLock, true);
    assert.equal(observations.applyCalls, 1);
    assert.equal(applied.outcome.kind, 'succeeded');
    assert.equal(applied.outcome.code, 'clean_safe_applied');
    assert.equal(applied.operation.journalStatus, 'succeeded');
    assert.equal((await journal.get(applied.operation.id)).state, 'succeeded');
    assert.equal(applied.resource.kind, 'cleanResult');
    assert.equal(applied.resource.status, 'applied');
    assert.equal(applied.resource.data.planDigest, preview.resource.data.planDigest);
    assert.deepEqual(applied.resource.data.removed.map((entry) => entry.status), ['removed', 'partially_removed']);
    assert.deepEqual(applied.effects, {
      certainty: 'confirmed',
      changed: true,
      evidenceRefs: ['clean:receipt:1']
    });
  });
});

test('clean.applySafe refuses stale plan digests before deletion with no effects', async () => {
  let currentPlan = cleanPlanFixture();
  let applyCalls = 0;
  await withCleanHarness({
    createPlan: async () => currentPlan,
    applySafe: async () => {
      applyCalls += 1;
      return { removed: [], changed: true };
    }
  }, async ({ execute, journal }) => {
    const preview = await execute('clean.plan');
    currentPlan = cleanPlanFixture({ configDigest: `sha256:${'d'.repeat(64)}` });

    const refused = await execute('clean.applySafe', { planDigest: preview.resource.data.planDigest });

    assert.equal(applyCalls, 0);
    assert.equal(refused.outcome.kind, 'refused');
    assert.equal(refused.outcome.code, 'plan_digest_mismatch');
    assert.equal(refused.resource.kind, 'cleanPlan');
    assert.equal(refused.resource.status, 'refused');
    assert.equal(refused.effects.certainty, 'none');
    assert.equal(refused.effects.changed, false);
    assert.equal(refused.error.code, 'plan_digest_mismatch');
    assert.equal(refused.error.details.providedPlanDigest, preview.resource.data.planDigest);
    assert.match(refused.error.details.currentPlanDigest, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(refused.error.details.currentPlanDigest, preview.resource.data.planDigest);
    assert.equal(refused.operation.journalStatus, 'refused');
    assert.equal((await journal.get(refused.operation.id)).state, 'refused');
  });
});

test('fresh digest cannot authorize root outside symlink or otherwise refused clean targets', async () => {
  for (const refusalCode of ['clean_target_root', 'clean_target_outside_project', 'clean_target_ambiguous']) {
    let applyCalls = 0;
    const refusedTarget = {
      kind: 'safe',
      rawPath: refusalCode === 'clean_target_root' ? '.' : 'linked-cache',
      resolvedPath: refusalCode === 'clean_target_root' ? 'F:/fixtures/project-a' : 'F:/fixtures/outside',
      canonicalPath: refusalCode === 'clean_target_root' ? 'F:/fixtures/project-a' : 'F:/fixtures/outside',
      exists: true,
      status: 'refused',
      refusalCode
    };
    await withCleanHarness({
      createPlan: async () => cleanPlanFixture({ targets: [cleanTarget('cache')], refusals: [refusedTarget] }),
      applySafe: async () => {
        applyCalls += 1;
        return { removed: [], changed: true };
      }
    }, async ({ execute, journal }) => {
      const preview = await execute('clean.plan');
      const refused = await execute('clean.applySafe', { planDigest: preview.resource.data.planDigest });

      assert.equal(applyCalls, 0, refusalCode);
      assert.equal(refused.outcome.kind, 'refused', refusalCode);
      assert.equal(refused.outcome.code, refusalCode, refusalCode);
      assert.equal(refused.effects.certainty, 'none', refusalCode);
      assert.equal(refused.effects.changed, false, refusalCode);
      assert.equal((await journal.get(refused.operation.id)).state, 'refused', refusalCode);
    });
  }
});

async function withCleanHarness(authorities, callback) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-clean-kernel-'));
  const env = { ...process.env, LAUNCHDECK_HOME: homeDir };
  const journal = createOperationJournal({ env });
  let lockDepth = 0;
  const decorate = (authority) => authority && (async (scope) => authority({ ...scope, lockHeld: lockDepth > 0 }));
  const kernel = createApplicationKernel({
    env,
    operationJournal: journal,
    handlers: createCleanHandlers({
      createPlan: decorate(authorities.createPlan),
      applySafe: decorate(authorities.applySafe)
    }),
    projectResolver: () => resolvedProject(),
    taskResolver: () => null,
    ownershipResolver: () => ({ classification: 'verified' }),
    compatibilityResolver: () => ({ canRead: true, canWrite: true, diagnosticOnly: false }),
    lockRunner: async (_context, inner) => {
      lockDepth += 1;
      try {
        return await inner();
      } finally {
        lockDepth -= 1;
      }
    },
    provenance: provenance()
  });
  try {
    await callback({
      journal,
      execute: (operation, input = {}) => kernel.execute({
        operation,
        input: { projectRef: 'project-a', ...input }
      })
    });
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
}

function cleanPlanFixture(options = {}) {
  const targets = options.targets ?? [cleanTarget('cache'), cleanTarget('dist')];
  const protectedPaths = [
    'F:/fixtures/project-a/.launchdeck/logs/failed.log',
    'F:/fixtures/project-a/.launchdeck/logs/running.log'
  ];
  return {
    version: 1,
    configDigest: options.configDigest ?? `sha256:${'a'.repeat(64)}`,
    targets: options.reverse ? [...targets].reverse() : targets,
    refusals: options.refusals ?? [],
    protectedPaths: options.reverse ? [...protectedPaths].reverse() : protectedPaths,
    excludedRiskyTargets: [{ kind: 'risky', rawPath: 'node_modules' }]
  };
}

function cleanTarget(rawPath) {
  return {
    kind: 'safe',
    rawPath,
    resolvedPath: `F:/fixtures/project-a/${rawPath}`,
    canonicalPath: `F:/fixtures/project-a/${rawPath}`,
    exists: true,
    status: 'planned',
    protectedPaths: rawPath === 'dist'
      ? ['F:/fixtures/project-a/.launchdeck/logs/running.log']
      : []
  };
}

function resolvedProject() {
  return {
    status: 'resolved',
    code: 'project_scope_resolved',
    project: {
      id: 'project-a-id',
      projectId: 'project-a-id',
      alias: 'project-a',
      name: 'Project A',
      projectRoot: 'F:/fixtures/project-a',
      configPath: 'F:/fixtures/project-a/.launchdeck.yml'
    },
    source: 'test-fixture',
    reasons: []
  };
}

function provenance() {
  return {
    surface: 'mcp',
    host: 'standalone',
    runtimeKind: 'package-mcp',
    runtimeVersion: '0.1.0',
    runtimePath: 'F:/fixtures/launchdeck-mcp.mjs',
    stateHome: 'F:/fixtures/state-home',
    buildIdentity: `sha256:${'b'.repeat(64)}`,
    agentProtocolVersion: '1.0.0',
    cliSchemaVersion: null
  };
}
