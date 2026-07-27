import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_BUILD,
  NEXT_BUILD,
  RECOVERY_BUILD,
  createManagedLifecycleFixture
} from '../fixtures/agent-managed-lifecycle/managed-lifecycle-fixture.js';

test('status is read-only while doctor is the failing health gate for the same drift', async () => {
  const fixture = createManagedLifecycleFixture();
  try {
    fixture.writeTarget('codex:project:mcp', 'mcp:user-edited');
    const before = fixture.snapshot();

    const status = await fixture.service.status(fixture.commandInput());
    const doctor = await fixture.service.doctor(fixture.commandInput());

    assert.equal(fixture.snapshot(), before);
    assert.equal(status.command, 'agent status');
    assert.equal(status.ok, true);
    assert.equal(status.result.health[0].state, 'divergent');
    assert.equal(doctor.command, 'agent doctor');
    assert.equal(doctor.ok, false);
    assert.equal(doctor.result.error.code, 'agent_health_check_failed');
    assert.equal(fixture.state.calls.some((call) => call.type === 'transaction:execute'), false);
  } finally {
    fixture.cleanup();
  }
});

test('repair recreates only missing receipt-owned targets and preserves unrelated content', async () => {
  const fixture = createManagedLifecycleFixture();
  try {
    fixture.removeTarget('codex:project:skill');

    const result = await fixture.service.repair(fixture.commandInput());

    assert.equal(result.command, 'agent repair');
    assert.equal(result.result.outcome, 'succeeded');
    assert.deepEqual(plannedTargetIds(fixture), [
      'codex:project:mcp',
      'codex:project:skill'
    ]);
    assert.deepEqual(mutatedTargetIds(result), ['codex:project:skill']);
    assert.equal(fixture.target('codex:project:skill').state, 'healthy');
    assert.equal(fixture.target('codex:project:foreign').content, 'user-owned');
  } finally {
    fixture.cleanup();
  }
});

test('failed update retains previous usable and recovery builds without committing the new build', async () => {
  const fixture = createManagedLifecycleFixture({ updateFailure: true });
  try {
    const previousReceipt = fixture.receipt();

    const result = await fixture.service.update(fixture.commandInput({
      build: NEXT_BUILD,
      desiredBuildIdentity: NEXT_BUILD,
      previousBuildPins: [CURRENT_BUILD, RECOVERY_BUILD]
    }));

    assert.equal(result.command, 'agent update');
    assert.equal(result.ok, false);
    assert.equal(result.result.outcome, 'failed-and-rolled-back');
    assert.deepEqual(fixture.receipt(), previousReceipt);
    assert.equal(fixture.artifact(CURRENT_BUILD).pinnedByReceipt, true);
    assert.equal(fixture.artifact(CURRENT_BUILD).recoveryPinned, true);
    assert.equal(fixture.artifact(NEXT_BUILD).pinnedByReceipt, false);
    assert.deepEqual(
      fixture.state.calls.find((call) => call.type === 'planner:planMutation').previousBuildPins,
      [CURRENT_BUILD, RECOVERY_BUILD]
    );
  } finally {
    fixture.cleanup();
  }
});

test('successful update commits the new receipt while keeping the previous build recoverable', async () => {
  const fixture = createManagedLifecycleFixture();
  try {
    const result = await fixture.service.update(fixture.commandInput({
      build: NEXT_BUILD,
      desiredBuildIdentity: NEXT_BUILD,
      previousBuildPins: [CURRENT_BUILD]
    }));

    assert.equal(result.result.outcome, 'succeeded');
    assert.equal(fixture.receipt().buildIdentity, NEXT_BUILD);
    assert.equal(fixture.artifact(NEXT_BUILD).pinnedByReceipt, true);
    assert.equal(fixture.artifact(CURRENT_BUILD).recoveryPinned, true);
    assert.equal(fixture.target('codex:project:skill').content, `skill:${NEXT_BUILD}`);
  } finally {
    fixture.cleanup();
  }
});

test('uninstall deletes only revalidated receipt-owned targets and leaves user content intact', async () => {
  const fixture = createManagedLifecycleFixture();
  try {
    const result = await fixture.service.uninstall(fixture.commandInput());

    assert.equal(result.command, 'agent uninstall');
    assert.equal(result.result.outcome, 'succeeded');
    assert.deepEqual(plannedTargetIds(fixture).sort(), [
      'codex:project:mcp',
      'codex:project:skill'
    ]);
    assert.equal(fixture.target('codex:project:skill').state, 'missing');
    assert.equal(fixture.target('codex:project:mcp').state, 'missing');
    assert.equal(fixture.target('codex:project:foreign').content, 'user-owned');
  } finally {
    fixture.cleanup();
  }
});

test('force repairs proven Launchdeck divergence without broadening to unrelated targets', async () => {
  const fixture = createManagedLifecycleFixture();
  try {
    fixture.writeTarget('codex:project:mcp', 'mcp:user-edited');

    const result = await fixture.service.repair(fixture.commandInput({ force: true }));

    assert.equal(result.result.outcome, 'succeeded');
    assert.deepEqual(plannedTargetIds(fixture), [
      'codex:project:mcp',
      'codex:project:skill'
    ]);
    assert.deepEqual(mutatedTargetIds(result), ['codex:project:mcp']);
    assert.equal(fixture.target('codex:project:mcp').state, 'healthy');
    assert.equal(fixture.target('codex:project:foreign').state, 'divergent');
    assert.equal(fixture.target('codex:project:foreign').content, 'user-owned');
  } finally {
    fixture.cleanup();
  }
});

test('GC eligibility is observed separately and never deletes pinned or recoverable builds', async () => {
  const fixture = createManagedLifecycleFixture();
  try {
    const before = fixture.snapshot();

    const decisions = await fixture.service.observeGarbageCollection({ dryRun: true });

    assert.equal(fixture.snapshot(), before);
    assert.equal(decisionFor(decisions, CURRENT_BUILD).decision, 'pinned');
    assert.equal(decisionFor(decisions, RECOVERY_BUILD).decision, 'pinned');
    assert.equal(decisionFor(decisions, NEXT_BUILD).decision, 'eligible');
    assert.equal(decisions.every((decision) => decision.deleted === false), true);
  } finally {
    fixture.cleanup();
  }
});

function plannedTargetIds(fixture) {
  const plan = fixture.state.calls.findLast((call) => call.type === 'planner:planMutation');
  return [...plan.targetIds];
}

function mutatedTargetIds(result) {
  return result.result.effects
    .filter((effect) => effect.effectType !== 'retain-owned-target')
    .map((effect) => effect.targetId)
    .sort();
}

function decisionFor(decisions, buildIdentity) {
  return decisions.find((decision) => decision.buildIdentity === buildIdentity);
}
