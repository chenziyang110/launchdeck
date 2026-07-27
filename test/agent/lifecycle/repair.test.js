import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentLifecycleService } from '../../../src/agent/lifecycle-service.js';

const BUILD = `sha256:${'7'.repeat(64)}`;
const PLAN = `sha256:${'8'.repeat(64)}`;

test('repair is limited to missing or corrupt receipt-owned targets', async () => {
  const trace = [];
  const owned = { targetId: 'codex:project:skill', ownership: 'launchdeck', state: 'missing' };
  const healthy = { targetId: 'codex:project:mcp', ownership: 'launchdeck', state: 'healthy' };
  const unrelated = { targetId: 'codex:project:other', ownership: 'user', state: 'missing' };
  const service = createAgentLifecycleService({
    receiptStore: { async readCurrent() { return { buildIdentity: BUILD, targets: [owned, healthy] }; } },
    diagnostics: { async observe() { return { targets: [owned, healthy, unrelated] }; } },
    lifecyclePlanner: {
      async planMutation(input) {
        trace.push(input);
        return planFixture(input.targets);
      }
    },
    approval: { async authorizePlan() { return { approved: true, planDigest: PLAN }; } },
    transaction: {
      async execute(request) {
        trace.push(request);
        return successResult();
      }
    }
  });

  const result = await service.repair({ scope: 'project', projectRoot: process.cwd(), yes: true });

  assert.deepEqual(
    trace[0].targets.map(({ targetId }) => targetId),
    [owned.targetId, healthy.targetId],
    'the repair plan preserves healthy receipt targets while only damaged targets require effects'
  );
  assert.equal(trace[1].operation, 'repair');
  assert.equal(result.command, 'agent repair');
});

test('repair refuses divergent owned content unless force is proven and bounded', async () => {
  const divergent = { targetId: 'codex:project:mcp', ownership: 'launchdeck', state: 'divergent' };
  const service = createAgentLifecycleService({
    receiptStore: { async readCurrent() { return { buildIdentity: BUILD, targets: [divergent] }; } },
    diagnostics: { async observe() { return { targets: [divergent] }; } }
  });

  const result = await service.repair({ scope: 'project', projectRoot: process.cwd(), yes: true });

  assert.equal(result.result.outcome, 'refused');
  assert.equal(result.result.effectCertainty, 'none');
  assert.deepEqual(result.result.effects, []);
});

function planFixture(targets) {
  return {
    planId: 'plan_repair',
    operation: 'repair',
    scope: 'project',
    scopeIdentity: process.cwd(),
    projectIdentity: process.cwd(),
    buildIdentity: BUILD,
    planDigest: PLAN,
    planBindingDigest: `sha256:${'9'.repeat(64)}`,
    targets,
    actions: targets.map((target) => ({ ...target, desiredDigest: BUILD }))
  };
}

function successResult() {
  return {
    outcome: 'succeeded',
    effectCertainty: 'complete',
    operationId: 'op_repair',
    receiptId: 'receipt_repair',
    effects: []
  };
}
