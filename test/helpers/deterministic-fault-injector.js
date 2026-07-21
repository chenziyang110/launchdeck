#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connectLaunchdeckMcp, repoRoot } from './mcp-client.js';
import { cliPath } from './cli-fixture.js';

const modulePath = fileURLToPath(import.meta.url);
const sourceMcpEntrypoint = path.join(repoRoot, 'src', 'mcp', 'stdio-server.js');
const MAX_CAPTURE_BYTES = 65_536;

export function connectResponseLossMcp(options = {}) {
  if (!options.receiptPath) throw new TypeError('receiptPath is required.');
  return connectLaunchdeckMcp({
    cwd: options.cwd,
    entrypoint: modulePath,
    env: {
      ...options.env,
      LAUNCHDECK_TEST_DROP_TOOL: options.dropTool ?? 'task.run',
      LAUNCHDECK_TEST_FAULT_RECEIPT: options.receiptPath
    },
    timeout: options.timeout ?? 8_000,
    callTimeout: options.callTimeout ?? 1_000
  });
}

export async function runCliWithDroppedResponse(options = {}) {
  if (!options.receiptPath) throw new TypeError('receiptPath is required.');
  const args = [...(options.args ?? [])];
  if (!args.includes('--json')) args.push('--json');
  const child = spawn(process.execPath, [cliPath, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const stdout = collect(child.stdout);
  const stderr = collect(child.stderr);
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
  const [stdoutText, stderrText] = await Promise.all([stdout, stderr]);
  writeReceipt(options.receiptPath, {
    kind: 'cli-response-dropped',
    status,
    stdout: stdoutText,
    stderr: stderrText
  });
  return { status: null, stdout: '', stderr: '', responseLost: true };
}

export function readFaultReceipt(receiptPath) {
  return JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
}

async function runMcpResponseLossProxy() {
  const targetTool = process.env.LAUNCHDECK_TEST_DROP_TOOL ?? 'task.run';
  const receiptPath = process.env.LAUNCHDECK_TEST_FAULT_RECEIPT;
  if (!receiptPath) throw new Error('LAUNCHDECK_TEST_FAULT_RECEIPT is required.');
  const child = spawn(process.execPath, [sourceMcpEntrypoint], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  const targetRequestIds = new Set();
  let dropped = false;
  let diagnosticBytes = 0;

  relayLines(process.stdin, (line) => {
    const frame = parseFrame(line);
    if (frame?.method === 'tools/call' && frame.params?.name === targetTool) {
      targetRequestIds.add(String(frame.id));
    }
    child.stdin.write(line);
  });
  relayLines(child.stdout, (line) => {
    const frame = parseFrame(line);
    if (!dropped && frame?.id !== undefined && targetRequestIds.has(String(frame.id))) {
      dropped = true;
      writeReceipt(receiptPath, {
        kind: 'mcp-response-dropped',
        requestId: frame.id,
        operationId: frame.result?.structuredContent?.operation?.id ?? null,
        operationName: frame.result?.structuredContent?.operation?.name ?? targetTool,
        result: frame.result?.structuredContent ?? null
      });
      return;
    }
    process.stdout.write(line);
  });
  child.stderr.on('data', (chunk) => {
    const buffer = Buffer.from(chunk);
    const remaining = 2_048 - diagnosticBytes;
    if (remaining <= 0) return;
    const bounded = buffer.subarray(0, remaining);
    diagnosticBytes += bounded.length;
    process.stderr.write(bounded);
  });
  process.stdin.once('end', () => child.stdin.end());
  child.once('exit', (code) => {
    process.exitCode = code ?? 1;
  });
  const terminate = () => {
    if (!child.killed) child.kill('SIGTERM');
  };
  process.once('SIGINT', terminate);
  process.once('SIGTERM', terminate);
}

function relayLines(stream, onLine) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    for (;;) {
      const newline = pending.indexOf('\n');
      if (newline < 0) break;
      const line = pending.slice(0, newline + 1);
      pending = pending.slice(newline + 1);
      onLine(line);
    }
  });
  stream.on('end', () => {
    if (pending) onLine(pending);
  });
}

function parseFrame(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function collect(stream) {
  return new Promise((resolve) => {
    const chunks = [];
    let bytes = 0;
    stream.on('data', (chunk) => {
      const buffer = Buffer.from(chunk);
      const remaining = MAX_CAPTURE_BYTES - bytes;
      if (remaining <= 0) return;
      const bounded = buffer.subarray(0, remaining);
      chunks.push(bounded);
      bytes += bounded.length;
    });
    const finish = () => resolve(Buffer.concat(chunks).toString('utf8'));
    stream.once('end', finish);
    stream.once('error', finish);
  });
}

function writeReceipt(receiptPath, value) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(value, null, 2)}\n`);
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(modulePath)
  && process.env.LAUNCHDECK_TEST_FAULT_RECEIPT
) {
  runMcpResponseLossProxy().catch((error) => {
    process.stderr.write(`${JSON.stringify({ source: 'deterministic-fault-injector', code: error?.code ?? 'proxy_failed' })}\n`);
    process.exitCode = 1;
  });
}
