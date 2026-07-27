import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';
import { isPidRunning, isProcessDescendant, stopProcessTreeSync } from '../src/adapters/process.js';

test('isPidRunning treats a terminated POSIX child awaiting reap as stopped', {
  skip: process.platform === 'win32'
}, () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore'
  });

  try {
    sleepSync(100);
    process.kill(child.pid, 'SIGTERM');
    sleepSync(100);

    assert.equal(isPidRunning(child.pid), false);
  } finally {
    try {
      process.kill(child.pid, 'SIGKILL');
    } catch {
      // The expected path is already stopped.
    }
  }
});

test('isProcessDescendant requires a complete bounded parent chain', () => {
  const parents = new Map([
    [300, 200],
    [200, 100],
    [100, 1]
  ]);
  const getProcessEvidence = (pid) => ({
    pid,
    alive: true,
    parentPid: parents.get(pid),
    source: 'test'
  });

  assert.equal(isProcessDescendant(300, 100, { getProcessEvidence }), true);
  assert.equal(isProcessDescendant(300, 999, { getProcessEvidence }), false);
  assert.equal(isProcessDescendant(300, 300, { getProcessEvidence }), false);
});

test('isProcessDescendant fails closed for missing, cyclic, or unavailable evidence', () => {
  assert.equal(isProcessDescendant(300, 100, {
    getProcessEvidence: () => ({ pid: 300, alive: true, source: 'test' })
  }), false);
  assert.equal(isProcessDescendant(300, 100, {
    getProcessEvidence: (pid) => ({ pid, alive: true, parentPid: pid === 300 ? 200 : 300, source: 'test' })
  }), false);
  assert.equal(isProcessDescendant(300, 100, {
    getProcessEvidence: () => {
      throw new Error('unavailable');
    }
  }), false);
});

test('Windows process-tree enumeration has an independent startup budget', {
  skip: process.platform !== 'win32'
}, () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });

  try {
    sleepSync(100);
    const result = stopProcessTreeSync(child.pid, {
      timeoutMs: 1,
      processTreeTimeoutMs: 10_000
    });
    assert.equal(result.status, 'stopped');
    assert.equal(isPidRunning(child.pid), false);
  } finally {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      // The expected path is already stopped.
    }
  }
});

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
