import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';
import { isPidRunning } from '../src/adapters/process.js';

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

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
