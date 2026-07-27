import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentLifecycleService } from '../../../src/agent/lifecycle-service.js';

const CURRENT = `sha256:${'3'.repeat(64)}`;
const NEXT = `sha256:${'4'.repeat(64)}`;
const PLAN = `sha256:${'5'.repeat(64)}`;

test('update plans and verifies a new build while retaining the previous usable pin until commit', async () => {
  const trace = [];
  const service = createAgentLifecycleService({
    lifecyclePlanner: {
      async planMutation(input) {
        trace.push(`plan:${input.operation}`);
        assert.deepEqual(input.previousBuildPins, [CURRENT]);
        return planFixture();
      }
    },
    approval: {
      async authorizePlan({ plan }) {
        trace.push('approve');
        return { approved: true, planDigest: plan.planDigest, planBindingDigest: plan.planBindingDigest };
      }
    },
    transaction: {
      async execute(request) {
        trace.push('transaction');
        assert.equal(request.operation, 'update');
        assert.deepEqual(request.plan.previousBuildPins, [CURRENT]);
        assert.equal(typeof request.verify, 'function');
        return successResult();
      }
    }
  });

  const result = await service.update({
    scope: 'project',
    projectRoot: process.cwd(),
    build: NEXT,
    previousBuildPins: [CURRENT],
    yes: true
  });

  assert.deepEqual(trace, ['plan:update', 'approve', 'transaction']);
  assert.equal(result.command, 'agent update');
  assert.equal(result.result.outcome, 'succeeded');
  assert.equal(result.result.buildIdentity, NEXT);
});

function planFixture() {
  return {
    planId: 'plan_update',
    operation: 'update',
    scope: 'project',
    scopeIdentity: process.cwd(),
    projectIdentity: process.cwd(),
    buildIdentity: NEXT,
    planDigest: PLAN,
    planBindingDigest: `sha256:${'6'.repeat(64)}`,
    previousBuildPins: [CURRENT],
    targets: [{ targetId: 'codex:project:skill', desiredDigest: NEXT }],
    actions: [{
      targetId: 'codex:project:skill',
      desiredDigest: NEXT,
      async apply() {},
      async rollback() {}
    }]
  };
}

function successResult() {
  return {
    outcome: 'succeeded',
    effectCertainty: 'complete',
    operationId: 'op_update',
    receiptId: 'receipt_update',
    effects: []
  };
}
