import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MUTATION_LOCK_ORDER,
  mutationLockNames,
  withMutationLocks,
  withMutationLocksSync
} from '../../src/control-plane/locks.js';

const CONTEXT = Object.freeze({
  operationId: 'op_0123456789abcdef',
  registryMutation: true,
  projectId: 'project/a',
  taskRef: 'dev:server',
  includeRunIndex: true,
  includeJournalIndex: true
});

test('canonical mutation lock names follow one complete order', () => {
  assert.deepEqual(MUTATION_LOCK_ORDER, [
    'operation',
    'registry',
    'project',
    'task',
    'run-index',
    'journal-index'
  ]);
  assert.deepEqual(mutationLockNames(CONTEXT), [
    'operation-op_0123456789abcdef',
    'registry',
    'project-project_a',
    'task-project_a-dev_server',
    'run-index',
    'operation-journal-index'
  ]);
});

test('async mutation locks acquire in canonical order and release in reverse nesting order', async () => {
  const acquired = [];
  const released = [];
  const value = await withMutationLocks({
    ...CONTEXT,
    lockRunner: async (options, callback) => {
      acquired.push(options.lockName);
      try {
        return await callback({ lockName: options.lockName });
      } finally {
        released.push(options.lockName);
      }
    }
  }, async (locks) => {
    assert.deepEqual(locks.map((lock) => lock.lockName), mutationLockNames(CONTEXT));
    return 'done';
  });

  assert.equal(value, 'done');
  assert.deepEqual(acquired, mutationLockNames(CONTEXT));
  assert.deepEqual(released, [...mutationLockNames(CONTEXT)].reverse());
});

test('sync and async mutation paths expose the same lock order', () => {
  const acquired = [];
  const released = [];
  const value = withMutationLocksSync({
    ...CONTEXT,
    lockRunnerSync: (options, callback) => {
      acquired.push(options.lockName);
      try {
        return callback({ lockName: options.lockName });
      } finally {
        released.push(options.lockName);
      }
    }
  }, () => 'sync-done');

  assert.equal(value, 'sync-done');
  assert.deepEqual(acquired, mutationLockNames(CONTEXT));
  assert.deepEqual(released, [...mutationLockNames(CONTEXT)].reverse());
});
