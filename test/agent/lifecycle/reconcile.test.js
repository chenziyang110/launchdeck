import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentLifecycleService } from '../../../src/agent/lifecycle-service.js';

const BUILD = `sha256:${'d'.repeat(64)}`;
const PLAN = `sha256:${'e'.repeat(64)}`;

test('reconcile classifies from live evidence and never replays the abandoned operation', async () => {
  const trace = [];
  const service = createAgentLifecycleService({
    reconciler: {
      async reconcileOperation(input) {
        trace.push(input);
        return {
          outcome: 'reconciled',
          effectCertainty: 'complete',
          scope: 'project',
          projectIdentity: process.cwd(),
          buildIdentity: BUILD,
          operationId: input.operationId,
          planDigest: PLAN,
          receiptId: null,
          targets: [],
          health: [{ state: 'missing', severity: 'warning' }],
          effects: [],
          nextActions: [{ command: 'launchdeck agent repair --yes' }],
          error: null
        };
      }
    },
    transaction: {
      async execute() {
        throw new Error('reconcile must not replay an uncertain operation');
      }
    }
  });

  const result = await service.reconcile({ operationId: 'op_abandoned' });

  assert.equal(trace.length, 1);
  assert.equal(trace[0].operationId, 'op_abandoned');
  assert.equal(result.command, 'operation reconcile');
  assert.equal(result.result.outcome, 'reconciled');
  assert.deepEqual(result.result.effects, []);
});

test('public reconciliation rejects absolute non-canonical path aliases before any file read', async () => {
  let reads = 0;
  const service = createAgentLifecycleService({
    reconciler: {
      async reconcileOperation() {
        throw new Error('non-canonical input must fail before reconciliation');
      }
    },
    publicReconciliation: {
      async read() {
        reads += 1;
        throw new Error('filesystem observation must not occur');
      }
    }
  });
  const aliased = process.platform === 'win32'
    ? `${process.cwd()}\\.launchdeck\\..\\operation.json`
    : `${process.cwd()}/.launchdeck/../operation.json`;

  const result = await service.reconcile({
    operationId: 'op_alias',
    publicStatePath: aliased
  });

  assert.equal(reads, 0);
  assert.equal(result.result.outcome, 'refused');
  assert.equal(result.result.error.code, 'agent_reconciliation_path_invalid');
  assert.deepEqual(result.result.effects, []);
});

test('garbage-collection observation reports eligibility without deleting artifacts', async () => {
  let deletions = 0;
  const service = createAgentLifecycleService({
    garbageCollector: {
      async observe() {
        return [{ buildIdentity: BUILD, eligible: false, reason: 'recovery-pin' }];
      },
      async collect() {
        deletions += 1;
      }
    }
  });

  const result = await service.observeGarbageCollection({ scope: 'project' });

  assert.equal(deletions, 0);
  assert.equal(result[0].buildIdentity, BUILD);
  assert.equal(result[0].reason, 'recovery-pin');
});
