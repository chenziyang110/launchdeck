import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentInstallerError } from '../../../src/agent/errors.js';
import { createInstallationPlan } from '../../../src/agent/planner/installation-plan.js';
import { createCanonicalTransactionPlan } from '../../../src/agent/state/transaction-plan.js';
import {
  createInstallerTransactionCoordinator
} from '../../../src/agent/state/transaction-coordinator.js';
import {
  BUILD_IDENTITY,
  PREVIOUS_BUILD_IDENTITY,
  actionDescription,
  createAgentTransactionFixture,
  digestFile
} from '../../fixtures/agent-transactions/transaction-fixture.js';

test('transaction durably orders prepared, running, effect, verification, receipt, and terminal state', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'durable-order');
  const baseAction = fixture.fileMutationAction({
    actionId: 'action-codex-mcp',
    targetId: 'codex:project:mcp'
  });
  const action = {
    ...baseAction,
    async apply(context) {
      const record = await fixture.readJournal(context.operationId);
      assert.equal(record.state, 'running');
      assert.deepEqual(record.installer.checkpoints, ['prepared', 'running', 'backup']);
      assert.equal(record.installer.backupRefs.length, 1);
      assert.equal(fixture.receiptStore.read(context.receiptCandidate.receiptId), null);
      return baseAction.apply(context);
    }
  };
  let runtimeVerified = false;
  const request = canonicalRequest(fixture, {
    operationId: 'op_durabletransaction000001',
    actions: [action],
    verify: async ({ operationId }) => {
      const record = await fixture.readJournal(operationId);
      assert.equal(record.state, 'running');
      assert.deepEqual(record.installer.checkpoints, [
        'prepared', 'running', 'backup', 'effect', 'verification'
      ]);
      assert.equal(record.installer.effects[0].afterDigest, action.desiredDigest);
      assert.equal(fixture.receiptStore.read(request.receiptCandidate.receiptId), null);
      fixture.counters.verify += 1;
      fixture.trace.push('verify:runtime');
      runtimeVerified = true;
      return [{
        targetId: action.targetId,
        kind: 'mcp-initialize-and-capabilities',
        buildIdentity: BUILD_IDENTITY,
        observedDigest: digestFile(action.targetPath),
        verified: true
      }];
    }
  });
  const guardedReceiptStore = {
    ...fixture.receiptStore,
    commit(candidate) {
      assert.equal(runtimeVerified, true, 'receipt commit must follow runtime verification');
      fixture.counters.receiptCommit += 1;
      fixture.trace.push('receipt:commit');
      return fixture.receiptStore.commit(candidate);
    }
  };
  const coordinator = createInstallerTransactionCoordinator({
    journal: fixture.journal,
    receiptStore: guardedReceiptStore,
    backupStore: fixture.backupStore,
    resourceLockRunner: async (lockOptions, callback) => {
      assert.equal(lockOptions.operationId, request.operationId);
      assert.equal(lockOptions.buildIdentity, BUILD_IDENTITY);
      assert.equal(lockOptions.scopeIdentity, fixture.scope.scopeIdentity);
      fixture.trace.push('locks:acquired');
      try {
        return await callback(Object.freeze([{ lockName: 'fixture-lock' }]));
      } finally {
        const record = await fixture.readJournal(request.operationId);
        fixture.trace.push(`locks:release:${record.state}`);
      }
    }
  });

  const result = await coordinator.execute(request);
  const terminal = await fixture.readJournal(request.operationId);
  const receipt = fixture.receiptStore.readCurrent(fixture.scope);

  assert.equal(result.outcome, 'succeeded');
  assert.equal(result.effectCertainty, 'complete');
  assert.equal(result.operationId, request.operationId);
  assert.equal(result.receiptId, receipt.receiptId);
  assert.equal(terminal.state, 'succeeded');
  assert.equal(terminal.effectsCertainty, 'confirmed');
  assert.equal(terminal.installer.kind, 'agent-installer');
  assert.match(terminal.installer.planBindingDigest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(terminal.installer.checkpoints, [
    'prepared', 'running', 'backup', 'effect', 'verification', 'verified', 'receipt'
  ]);
  assert.deepEqual(terminal.installer.previousBuildPins, [
    `sha256:${'a'.repeat(64)}`
  ]);
  assert.equal(terminal.installer.receiptCandidate.receiptId, receipt.receiptId);
  assert.equal(terminal.installer.receiptRef.receiptDigest, receipt.receiptDigest);
  assert.equal(terminal.installer.verificationEvidence[0].verified, true);
  assert.equal(receipt.verificationEvidence.length, 1);
  assert.equal(
    receipt.verificationEvidence[0].kind,
    'mcp-initialize-and-capabilities'
  );
  assert.equal(receipt.verificationEvidence[0].buildIdentity, BUILD_IDENTITY);
  assert.deepEqual(fixture.trace, [
    'locks:acquired',
    'apply:action-codex-mcp',
    'verify:runtime',
    'receipt:commit',
    'locks:release:succeeded'
  ]);
  assert.equal(digestFile(action.targetPath), action.desiredDigest);
});

test('lock contention returns a typed no-effects refusal without a journal or receipt', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'contention');
  const request = canonicalRequest(fixture, {
    operationId: 'op_contention000000000001'
  });
  const coordinator = createInstallerTransactionCoordinator({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    backupStore: fixture.backupStore,
    resourceLockRunner: async () => {
      throw new AgentInstallerError(
        'agent_lock_contended',
        'Another installer owns this target.',
        { effectCertainty: 'none' }
      );
    }
  });

  const result = await coordinator.execute(request);

  assert.equal(result.outcome, 'refused');
  assert.equal(result.effectCertainty, 'none');
  assert.equal(result.error.code, 'agent_lock_contended');
  assert.deepEqual(result.effects, []);
  assert.equal(fixture.journalRecordExists(request.operationId), false);
  assert.equal(fixture.receiptStore.read(request.receiptCandidate.receiptId), null);
  assert.equal(digestFile(request.actions[0].targetPath), request.actions[0].preconditionDigest);
  assert.equal(fixture.counters.apply, 0);
});

test('locked precondition drift refuses before prepared state and requires a fresh plan', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'precondition-drift');
  const request = canonicalRequest(fixture, {
    operationId: 'op_preconditiondrift000001',
    revalidatePlan: async () => ({
      valid: false,
      code: 'agent_plan_precondition_changed',
      targetId: 'codex:project:skill',
      expectedPlanDigest: request.plan.planDigest
    })
  });
  let held = false;
  const coordinator = createInstallerTransactionCoordinator({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    backupStore: fixture.backupStore,
    resourceLockRunner: async (_options, callback) => {
      held = true;
      try {
        return await callback(Object.freeze([{ lockName: 'fixture-lock' }]));
      } finally {
        held = false;
      }
    }
  });

  const result = await coordinator.execute(request);

  assert.equal(held, false);
  assert.equal(result.outcome, 'refused');
  assert.equal(result.effectCertainty, 'none');
  assert.equal(result.error.code, 'agent_plan_precondition_changed');
  assert.equal(result.nextActions[0].operation, 'agent.setup');
  assert.equal(result.nextActions[0].requiresApproval, true);
  assert.equal(fixture.journalRecordExists(request.operationId), false);
  assert.equal(fixture.counters.apply, 0);
  assert.equal(fixture.counters.verify, 0);
});

test('approved plan actions, executable actions, and lock targets must remain one binding', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'plan-action-binding');
  const request = canonicalRequest(fixture, {
    operationId: 'op_planactionbinding000001'
  });
  const result = await createInstallerTransactionCoordinator({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    backupStore: fixture.backupStore,
    resourceLockRunner: async () => {
      throw new Error('mismatched plans must refuse before lock acquisition');
    }
  }).execute({
    ...request,
    actions: [{
      ...request.actions[0],
      targetId: 'foreign:project:mcp'
    }]
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.error.code, 'agent_plan_action_mismatch');
  assert.equal(fixture.journalRecordExists(request.operationId), false);
  assert.equal(fixture.counters.apply, 0);
});

test('an explicit approval binding digest must match the recomputed canonical plan', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'approval-binding');
  const request = canonicalRequest(fixture, {
    operationId: 'op_approvalbinding00000001'
  });
  const result = await createInstallerTransactionCoordinator({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    backupStore: fixture.backupStore,
    resourceLockRunner: async () => {
      throw new Error('binding mismatch must refuse before lock acquisition');
    }
  }).execute({
    ...request,
    approval: {
      ...request.approval,
      planBindingDigest: `sha256:${'f'.repeat(64)}`
    }
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.error.code, 'agent_plan_binding_mismatch');
  assert.equal(fixture.journalRecordExists(request.operationId), false);
});

test('approved execution refuses when approval binding proof is omitted', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'approval-binding-required');
  const request = canonicalRequest(fixture, {
    operationId: 'op_approvalbindingrequired01'
  });
  const result = await createInstallerTransactionCoordinator({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    backupStore: fixture.backupStore,
    resourceLockRunner: async () => {
      throw new Error('missing binding proof must refuse before lock acquisition');
    }
  }).execute({
    ...request,
    approval: {
      approved: true,
      planDigest: request.plan.planDigest
    }
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.error.code, 'agent_plan_binding_mismatch');
  assert.equal(fixture.journalRecordExists(request.operationId), false);
});

test('planner canonical digests are accepted unchanged by the transaction boundary', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'planner-canonical-boundary');
  const action = fixture.fileMutationAction({
    actionId: 'action-planner-canonical',
    targetId: 'codex:project:skill',
    relativePath: '.agents/skills/launchdeck-agent/SKILL.md',
    original: '# Previous Skill\n',
    desired: '# Launchdeck Agent\n'
  });
  const plan = await createInstallationPlan({
    desired: {
      operation: 'setup',
      scope: fixture.scope.scope,
      scopeIdentity: fixture.scope.scopeIdentity,
      projectIdentity: fixture.scope.projectIdentity,
      hostIds: ['codex'],
      components: ['skill'],
      requestedBuildSelector: BUILD_IDENTITY,
      desiredBuildIdentity: BUILD_IDENTITY,
      sourceIdentity: 'packaged',
      interactive: false,
      approved: true,
      dryRun: false,
      force: false,
      includeLauncher: false,
      previousBuildPins: [PREVIOUS_BUILD_IDENTITY],
      inputDigest: `sha256:${'7'.repeat(64)}`
    },
    evidence: {
      matrixRevision: `sha256:${'6'.repeat(64)}`,
      hostEvidence: [{ hostId: 'codex', version: '1.0.0' }],
      targets: [{
        targetId: action.targetId,
        hostId: 'codex',
        scope: fixture.scope.scope,
        component: 'skill',
        path: action.targetPath,
        ownershipBoundary: action.ownershipBoundary,
        ownership: 'launchdeck-owned',
        liveDigest: action.preconditionDigest
      }],
      targetPlans: [{
        targetId: action.targetId,
        status: 'planned',
        actions: [actionDescription(action)]
      }]
    }
  });
  const request = canonicalRequest(fixture, {
    operationId: 'op_plannercanonical0000001',
    approval: {
      approved: true,
      planDigest: plan.planDigest,
      planBindingDigest: plan.planBindingDigest
    },
    actions: [action],
    plan
  });

  const result = await createInstallerTransactionCoordinator({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    backupStore: fixture.backupStore,
    resourceLockRunner: async (_options, callback) => callback([])
  }).execute(request);

  assert.equal(result.outcome, 'succeeded');
  assert.equal(result.buildIdentity, BUILD_IDENTITY);
  assert.equal(result.receiptId, request.receiptCandidate.receiptId);
});

test('receipt scope and ownership must exactly match the approved plan', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'receipt-plan-binding');
  const request = canonicalRequest(fixture, {
    operationId: 'op_receiptplanbinding00001'
  });
  const result = await createInstallerTransactionCoordinator({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    backupStore: fixture.backupStore,
    resourceLockRunner: async () => {
      throw new Error('mismatched receipts must refuse before lock acquisition');
    }
  }).execute({
    ...request,
    receiptCandidate: {
      ...request.receiptCandidate,
      scope: 'user',
      scopeIdentity: `user:sha256:${'e'.repeat(64)}`,
      projectIdentity: null
    }
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.error.code, 'agent_receipt_plan_mismatch');
  assert.equal(fixture.journalRecordExists(request.operationId), false);
  assert.equal(fixture.counters.apply, 0);
});

test('arbitrary callback payload fields are rejected and never persisted', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'durable-evidence-schema');
  const baseAction = fixture.fileMutationAction({
    actionId: 'action-bounded-effect',
    targetId: 'codex:project:mcp'
  });
  const secretPayload = '{"ordinaryField":"raw-host-config-value"}';
  const action = {
    ...baseAction,
    async apply(context) {
      return {
        ...await baseAction.apply(context),
        protocolPayload: secretPayload
      };
    }
  };
  const request = canonicalRequest(fixture, {
    operationId: 'op_boundedevidence00000001',
    actions: [action]
  });
  const result = await createInstallerTransactionCoordinator({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    backupStore: fixture.backupStore,
    resourceLockRunner: async (_options, callback) => callback([])
  }).execute(request);
  const record = await fixture.readJournal(request.operationId);

  assert.equal(result.outcome, 'indeterminate');
  assert.equal(record.state, 'indeterminate');
  assert.equal(JSON.stringify(record).includes(secretPayload), false);
  assert.equal(fixture.receiptStore.read(request.receiptCandidate.receiptId), null);
});

function canonicalRequest(fixture, overrides = {}) {
  if (overrides.plan) {
    const base = fixture.transactionRequest(overrides);
    return {
      ...base,
      plan: overrides.plan,
      revalidatePlan: overrides.revalidatePlan ?? (async () => ({
        valid: true,
        planDigest: overrides.plan.planDigest
      })),
      approval: overrides.approval ?? {
        approved: true,
        planDigest: overrides.plan.planDigest,
        planBindingDigest: overrides.plan.planBindingDigest
      }
    };
  }

  const base = fixture.transactionRequest(overrides);
  const targets = base.actions.map((action) => canonicalTargetForAction(action));
  const plan = createCanonicalTransactionPlan({
    planId: base.plan.planId,
    buildIdentity: base.plan.buildIdentity,
    scope: base.plan.scope,
    scopeIdentity: base.plan.scopeIdentity,
    projectIdentity: base.plan.projectIdentity,
    targetIds: targets.map((target) => target.targetId),
    includeLauncher: base.plan.includeLauncher,
    previousBuildPins: base.plan.previousBuildPins,
    targets,
    actions: base.actions.map((action) => actionDescription(action))
  });
  return {
    ...base,
    plan,
    revalidatePlan: overrides.revalidatePlan ?? (async () => ({
      valid: true,
      planDigest: plan.planDigest
    })),
    approval: overrides.approval ?? {
      approved: base.approval?.approved === true,
      planDigest: plan.planDigest,
      planBindingDigest: plan.planBindingDigest
    }
  };
}

function canonicalTargetForAction(action) {
  const [hostId, scope, component] = String(action.targetId).split(':');
  return {
    targetId: action.targetId,
    hostId,
    scope,
    component,
    path: action.targetPath,
    ownershipBoundary: action.ownershipBoundary,
    ownership: 'launchdeck-owned',
    liveDigest: action.preconditionDigest,
    desiredDigest: action.desiredDigest
  };
}
