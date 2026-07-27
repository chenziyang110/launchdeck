import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { AgentInstallerError } from '../../../src/agent/errors.js';
import {
  createInstallerTransactionCoordinator
} from '../../../src/agent/state/transaction-coordinator.js';
import {
  createAgentTransactionFixture,
  digestFile,
  fatalFault
} from '../../fixtures/agent-transactions/transaction-fixture.js';

const CRASH_WINDOWS = [
  {
    point: 'after_prepared',
    journalState: 'prepared',
    checkpoint: 'prepared',
    applies: 0,
    verifies: 0,
    receipt: false
  },
  {
    point: 'after_running',
    journalState: 'running',
    checkpoint: 'running',
    applies: 0,
    verifies: 0,
    receipt: false
  },
  {
    point: 'after_effect',
    journalState: 'running',
    checkpoint: 'effect',
    applies: 1,
    verifies: 0,
    receipt: false
  },
  {
    point: 'after_verification',
    journalState: 'running',
    checkpoint: 'verified',
    applies: 1,
    verifies: 1,
    receipt: false
  },
  {
    point: 'after_receipt',
    journalState: 'running',
    checkpoint: 'receipt',
    applies: 1,
    verifies: 1,
    receipt: true
  },
  {
    point: 'before_response',
    journalState: 'succeeded',
    checkpoint: 'receipt',
    applies: 1,
    verifies: 1,
    receipt: true
  }
];

test('deterministic crash windows retain the last durable transaction boundary', async (t) => {
  for (const [index, expected] of CRASH_WINDOWS.entries()) {
    await t.test(expected.point, async (t) => {
      const fixture = createAgentTransactionFixture(t, `crash-${index}`);
      const request = fixture.transactionRequest({
        operationId: `op_crashwindow${String(index).padStart(16, '0')}`
      });
      const crash = fatalFault(expected.point);
      const coordinator = createInstallerTransactionCoordinator({
        journal: fixture.journal,
        receiptStore: fixture.receiptStore,
        backupStore: fixture.backupStore,
        resourceLockRunner: async (_options, callback) => callback([]),
        faultInjector: async ({ point }) => {
          if (point === expected.point) throw crash;
        }
      });

      await assert.rejects(coordinator.execute(request), (error) => error === crash);

      const record = await fixture.readJournal(request.operationId);
      assert.equal(record.state, expected.journalState);
      assert.equal(record.installer.checkpoints.at(-1), expected.checkpoint);
      assert.equal(fixture.counters.apply, expected.applies);
      assert.equal(fixture.counters.verify, expected.verifies);
      assert.equal(
        fixture.receiptStore.read(request.receiptCandidate.receiptId) !== null,
        expected.receipt
      );
      if (expected.point === 'after_effect') {
        assert.equal(record.installer.effects.length, 1);
        assert.equal(record.installer.backupRefs.length, 1);
        assert.equal(
          digestFile(request.actions[0].targetPath),
          request.actions[0].desiredDigest
        );
      }
      if (expected.point === 'after_verification') {
        assert.equal(record.installer.verificationEvidence[0].verified, true);
      }
      if (expected.receipt) {
        assert.equal(
          record.installer.receiptRef.receiptId,
          request.receiptCandidate.receiptId
        );
      }
    });
  }
});

test('known reversible failure rolls back exact mutations in reverse and proves restoration', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'reverse-rollback');
  const first = fixture.fileMutationAction({
    actionId: 'action-first',
    targetId: 'codex:project:skill',
    relativePath: '.codex/skills/launchdeck-agent/SKILL.md',
    original: '# old codex\n',
    desired: '# new codex\n'
  });
  const second = fixture.fileMutationAction({
    actionId: 'action-second',
    targetId: 'claude:project:skill',
    relativePath: '.claude/skills/launchdeck-agent/SKILL.md',
    original: '# old claude\n',
    desired: '# new claude\n'
  });
  const request = fixture.transactionRequest({
    operationId: 'op_reverserollback00000001',
    actions: [first, second],
    verify: async () => {
      fixture.counters.verify += 1;
      fixture.trace.push('verify:failed');
      throw new AgentInstallerError(
        'agent_runtime_verification_failed',
        'MCP initialize did not prove the selected build.',
        { effectCertainty: 'complete' }
      );
    }
  });
  const coordinator = coordinatorFor(fixture);

  const result = await coordinator.execute(request);
  const record = await fixture.readJournal(request.operationId);

  assert.equal(result.outcome, 'failed-and-rolled-back');
  assert.equal(result.effectCertainty, 'complete');
  assert.equal(result.error.code, 'agent_runtime_verification_failed');
  assert.equal(record.state, 'failed');
  assert.equal(record.effectsCertainty, 'confirmed');
  assert.deepEqual(record.installer.rollbackEvidence.map((entry) => entry.actionId), [
    'action-second',
    'action-first'
  ]);
  assert.equal(record.installer.rollbackEvidence.every((entry) => entry.verified), true);
  assert.deepEqual(fixture.trace, [
    'apply:action-first',
    'apply:action-second',
    'verify:failed',
    'rollback:action-second',
    'rollback:action-first'
  ]);
  assert.equal(digestFile(first.targetPath), first.preconditionDigest);
  assert.equal(digestFile(second.targetPath), second.preconditionDigest);
  assert.equal(fixture.receiptStore.read(request.receiptCandidate.receiptId), null);
  for (const backupRef of record.installer.backupRefs) {
    assert.equal(fs.existsSync(fixture.backupStore.read(backupRef.backupId).backupPath), true);
  }
});

test('an interrupt after apply is recovery work, never pre-apply cancellation', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'interrupt');
  const request = fixture.transactionRequest({
    operationId: 'op_interruptafterapply00001',
    verify: async () => {
      fixture.counters.verify += 1;
      throw new AgentInstallerError(
        'agent_user_interrupt',
        'The user interrupted verification after apply.',
        { effectCertainty: 'complete' }
      );
    }
  });
  const coordinator = coordinatorFor(fixture);

  const result = await coordinator.execute(request);

  assert.equal(result.outcome, 'failed-and-rolled-back');
  assert.notEqual(result.outcome, 'cancelled');
  assert.equal(result.error.code, 'agent_user_interrupt');
  assert.equal(fixture.counters.apply, 1);
  assert.equal(fixture.counters.rollback, 1);
  assert.equal(digestFile(request.actions[0].targetPath), request.actions[0].preconditionDigest);
});

test('rollback uncertainty reports partial effects and preserves recovery evidence', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'partial-rollback');
  const first = fixture.fileMutationAction({
    actionId: 'action-restored',
    targetId: 'codex:project:mcp',
    relativePath: '.codex/mcp.json'
  });
  const second = fixture.fileMutationAction({
    actionId: 'action-still-live',
    targetId: 'claude:project:mcp',
    relativePath: '.mcp.json',
    rollback: async () => {
      throw new AgentInstallerError(
        'agent_rollback_verification_unknown',
        'The second target cannot be proven restored.',
        { effectCertainty: 'unknown' }
      );
    }
  });
  const request = fixture.transactionRequest({
    operationId: 'op_partialrollback000000001',
    actions: [first, second],
    verify: async () => {
      fixture.counters.verify += 1;
      throw new AgentInstallerError(
        'agent_capability_verification_failed',
        'Runtime capabilities differ from the approved plan.',
        { effectCertainty: 'complete' }
      );
    }
  });
  const coordinator = coordinatorFor(fixture);

  const result = await coordinator.execute(request);
  const record = await fixture.readJournal(request.operationId);

  assert.equal(result.outcome, 'partial');
  assert.equal(result.effectCertainty, 'partial');
  assert.equal(record.state, 'indeterminate');
  assert.equal(record.effectsCertainty, 'possible');
  assert.equal(record.installer.rollbackEvidence.length, 1);
  assert.equal(record.installer.rollbackErrors[0].actionId, 'action-still-live');
  assert.equal(result.nextActions[0].operation, 'operation.reconcile');
  assert.equal(digestFile(first.targetPath), first.preconditionDigest);
  assert.equal(digestFile(second.targetPath), second.desiredDigest);
  assert.equal(fixture.receiptStore.read(request.receiptCandidate.receiptId), null);
  assert.equal(record.installer.backupRefs.length, 2);
});

test('unknown apply effects become indeterminate and are not blindly rolled back or retried', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'unknown-effect');
  const unknown = new AgentInstallerError(
    'agent_write_completion_unknown',
    'The host write response was lost.',
    { effectCertainty: 'unknown' }
  );
  const action = fixture.fileMutationAction({
    actionId: 'action-unknown',
    targetId: 'codex:project:mcp',
    applyError: unknown
  });
  const request = fixture.transactionRequest({
    operationId: 'op_unknownapplyeffect000001',
    actions: [action]
  });
  const coordinator = coordinatorFor(fixture);

  const result = await coordinator.execute(request);
  const record = await fixture.readJournal(request.operationId);

  assert.equal(result.outcome, 'indeterminate');
  assert.equal(result.effectCertainty, 'unknown');
  assert.equal(record.state, 'indeterminate');
  assert.equal(record.effectsCertainty, 'unknown');
  assert.equal(fixture.counters.apply, 1);
  assert.equal(fixture.counters.rollback, 0);
  assert.equal(fixture.counters.verify, 0);
  assert.equal(result.nextActions[0].operation, 'operation.reconcile');
  assert.equal(fixture.receiptStore.read(request.receiptCandidate.receiptId), null);
  assert.equal(record.installer.backupRefs.length, 1);
});

test('a non-fatal failure after prepared is durably refused and same-ID execution never replays', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'prepared-refusal');
  const request = fixture.transactionRequest({
    operationId: 'op_preparedrefusal00000001'
  });
  const coordinator = coordinatorFor(fixture, {
    faultInjector: async ({ point }) => {
      if (point === 'after_prepared') {
        throw new AgentInstallerError(
          'agent_prepared_boundary_failed',
          'The transaction could not enter running state.',
          { effectCertainty: 'none' }
        );
      }
    }
  });

  const first = await coordinator.execute(request);
  const second = await coordinator.execute(request);
  const record = await fixture.readJournal(request.operationId);

  assert.equal(first.outcome, 'refused');
  assert.equal(record.state, 'refused');
  assert.equal(record.installer.terminalResult.outcome, 'refused');
  assert.equal(second.outcome, 'refused');
  assert.equal(second.recoveredFromJournal, true);
  assert.equal(fixture.counters.apply, 0);
});

test('verified lock loss becomes indeterminate and prevents mutation or blind replay', async (t) => {
  const fixture = createAgentTransactionFixture(t, 'lock-loss');
  const request = fixture.transactionRequest({
    operationId: 'op_lockloss0000000000001'
  });
  let ownershipChecks = 0;
  const coordinator = coordinatorFor(fixture, {
    resourceLockRunner: async (_options, callback) => callback([{
      lockName: 'fixture-lock',
      async assertOwned() {
        ownershipChecks += 1;
        if (ownershipChecks > 1) {
          throw Object.assign(new Error('fixture lock was replaced'), {
            code: 'lock_lost',
            effectCertainty: 'unknown'
          });
        }
      }
    }])
  });

  const first = await coordinator.execute(request);
  const second = await coordinator.execute(request);
  const record = await fixture.readJournal(request.operationId);

  assert.equal(first.outcome, 'indeterminate');
  assert.equal(first.error.code, 'agent_transaction_lock_lost');
  assert.equal(record.state, 'indeterminate');
  assert.equal(second.outcome, 'indeterminate');
  assert.equal(second.recoveredFromJournal, true);
  assert.equal(fixture.counters.apply, 0);
  assert.equal(fixture.counters.rollback, 0);
});

function coordinatorFor(fixture, options = {}) {
  return createInstallerTransactionCoordinator({
    journal: fixture.journal,
    receiptStore: fixture.receiptStore,
    backupStore: fixture.backupStore,
    resourceLockRunner: async (_lockOptions, callback) => callback([]),
    ...options
  });
}
