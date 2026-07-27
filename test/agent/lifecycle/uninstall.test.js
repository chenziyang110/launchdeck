import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentLifecycleService } from '../../../src/agent/lifecycle-service.js';

const BUILD = `sha256:${'a'.repeat(64)}`;
const PLAN = `sha256:${'b'.repeat(64)}`;

test('uninstall removes only receipt-owned targets revalidated immediately before deletion', async () => {
  const trace = [];
  const owned = {
    targetId: 'claude:project:skill',
    ownership: 'launchdeck',
    desiredDigest: BUILD,
    liveDigest: BUILD
  };
  const service = createAgentLifecycleService({
    receiptStore: { async readCurrent() { return { buildIdentity: BUILD, targets: [owned] }; } },
    diagnostics: { async observe() { return { targets: [owned] }; } },
    lifecyclePlanner: {
      async planMutation(input) {
        return {
          planId: 'plan_uninstall',
          operation: 'uninstall',
          scope: 'project',
          scopeIdentity: process.cwd(),
          projectIdentity: process.cwd(),
          buildIdentity: BUILD,
          planDigest: PLAN,
          planBindingDigest: `sha256:${'c'.repeat(64)}`,
          targets: input.targets,
          actions: input.targets.map((target) => ({ ...target, desiredDigest: target.desiredDigest }))
        };
      }
    },
    approval: { async authorizePlan() { return { approved: true, planDigest: PLAN }; } },
    transaction: {
      async execute(request) {
        trace.push(request);
        const revalidation = await request.revalidatePlan({ plan: request.plan, locks: [] });
        assert.equal(revalidation.valid, true);
        assert.equal(revalidation.planDigest, request.plan.planDigest);
        assert.deepEqual(revalidation.effects, []);
        return {
          outcome: 'succeeded',
          effectCertainty: 'complete',
          operationId: 'op_uninstall',
          receiptId: 'receipt_uninstall',
          effects: []
        };
      }
    }
  });

  const result = await service.uninstall({ scope: 'project', projectRoot: process.cwd(), yes: true });

  assert.equal(trace[0].operation, 'uninstall');
  assert.deepEqual(trace[0].plan.targets.map(({ targetId }) => targetId), [owned.targetId]);
  assert.equal(result.command, 'agent uninstall');
});

test('force never broadens uninstall beyond receipt ownership', async () => {
  const service = createAgentLifecycleService({
    receiptStore: { async readCurrent() { return { buildIdentity: BUILD, targets: [] }; } },
    diagnostics: {
      async observe() {
        return { targets: [{ targetId: 'foreign:file', ownership: 'user', state: 'divergent' }] };
      }
    }
  });

  const result = await service.uninstall({
    scope: 'project',
    projectRoot: process.cwd(),
    yes: true,
    force: true
  });

  assert.equal(result.result.outcome, 'noop');
  assert.deepEqual(result.result.targets, []);
  assert.deepEqual(result.result.effects, []);
});

test('uninstall derives the canonical project scope before reading the current receipt', async () => {
  let scopeReference;
  const service = createAgentLifecycleService({
    receiptStore: {
      async readCurrent(candidate) {
        scopeReference = candidate;
        return { buildIdentity: BUILD, targets: [] };
      }
    },
    diagnostics: {
      async observe() {
        return { targets: [] };
      }
    }
  });

  await service.uninstall({
    scope: 'project',
    projectRoot: process.cwd(),
    yes: true
  });

  assert.equal(scopeReference.scope, 'project');
  assert.equal(scopeReference.projectIdentity, process.cwd());
  assert.match(scopeReference.scopeIdentity, /^project:sha256:[0-9a-f]{64}$/);
});

test('default uninstall planner preserves receipt targets and routes adapter uninstall actions', async () => {
  const trace = [];
  const owned = {
    targetId: 'codex:project:skill',
    hostId: 'codex',
    scope: 'project',
    component: 'skill',
    path: `${process.cwd()}\\.agents\\skills\\launchdeck-agent`,
    ownership: 'launchdeck',
    desiredDigest: BUILD,
    liveDigest: BUILD
  };
  const registry = {
    matrixRevision: 'test-v1',
    listHosts: () => ['codex'],
    adapterFor: () => ({
      detect: async () => [{ hostId: 'codex', version: '1.0.0' }],
      capabilities: async () => [{
        hostId: 'codex',
        component: 'skill',
        scope: 'project',
        supportState: 'supported'
      }],
      resolveTargets: async () => [owned],
      inspect: async () => ({ ...owned, exists: true, ownership: 'launchdeck' }),
      plan: async () => {
        throw new Error('setup plan must not be used for uninstall');
      },
      uninstall: async (target, ownership) => {
        trace.push({ target, ownership });
        return {
          status: 'planned',
          actions: [{
            actionId: 'remove-owned',
            targetId: target.targetId,
            kind: 'remove-owned-skill',
            targetPath: target.path,
            ownershipBoundary: 'launchdeck-agent',
            preconditionDigest: BUILD,
            desiredDigest: `sha256:${'0'.repeat(64)}`
          }]
        };
      }
    })
  };
  const service = createAgentLifecycleService({
    registry,
    receiptStore: {
      async readCurrent() {
        return { buildIdentity: BUILD, receiptId: 'receipt_owned', targets: [owned] };
      }
    },
    diagnostics: {
      async observe() {
        return { targets: [owned] };
      }
    },
    approval: { async authorizePlan() { return { approved: true, planDigest: PLAN }; } },
    transaction: {
      async execute(request) {
        assert.equal(request.operation, 'uninstall');
        assert.deepEqual(request.plan.targets.map(({ targetId }) => targetId), [owned.targetId]);
        return {
          outcome: 'succeeded',
          effectCertainty: 'complete',
          operationId: 'op_default_uninstall',
          receiptId: 'receipt_default_uninstall',
          effects: []
        };
      }
    }
  });

  const result = await service.uninstall({
    scope: 'project',
    projectRoot: process.cwd(),
    build: BUILD,
    yes: true
  });

  assert.equal(result.result.outcome, 'succeeded');
  assert.equal(trace.length, 1);
  assert.equal(trace[0].ownership.receiptId, 'receipt_owned');
  assert.equal(trace[0].ownership.owned, true);
});
