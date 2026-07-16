import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { LaunchdeckError } from '../errors.js';

const DEFAULT_STOP_TIMEOUT_MS = 2_000;
const DEFAULT_PROCESS_EVIDENCE_TIMEOUT_MS = 750;
const STOP_POLL_INTERVAL_MS = 50;

export function spawnForeground(command, options = {}) {
  const child = spawnShellCommand(command, {
    ...options,
    detached: false,
    stdio: options.captureOutput ? ['ignore', 'pipe', 'pipe'] : (options.stdio ?? 'inherit')
  });

  if (options.captureOutput) {
    child.stdout?.resume();
    child.stderr?.resume();
  }

  return waitForExit(child);
}

export function spawnManaged(command, options = {}) {
  const {
    unref = true,
    stdio = ['ignore', 'ignore', 'ignore']
  } = options;
  const child = spawnShellCommand(command, {
    ...options,
    detached: true,
    stdio
  });

  if (unref) {
    child.unref();
  }

  return {
    child,
    pid: child.pid,
    command,
    startedAt: new Date().toISOString()
  };
}

export function spawnShellCommand(command, options = {}) {
  const normalizedCommand = normalizeCommand(command);
  const {
    cwd = process.cwd(),
    env,
    shell = true,
    detached = false,
    stdio = 'inherit',
    windowsHide = true
  } = options;
  const spawnPlan = planSpawn(normalizedCommand, shell);

  try {
    const child = spawn(spawnPlan.command, spawnPlan.args, {
      cwd,
      env: { ...process.env, ...env },
      shell: spawnPlan.shell,
      detached,
      stdio,
      windowsHide
    });

    child.once('error', (error) => {
      child.launchdeckSpawnError = classifyAdapterError(error, 'Failed to spawn process.', {
        command: normalizedCommand,
        cwd
      });
    });

    return child;
  } catch (error) {
    throw classifyAdapterError(error, 'Failed to spawn process.', {
      command: normalizedCommand,
      cwd
    });
  }
}

export function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', (error) => {
      reject(classifyAdapterError(error, 'Process failed before exit.', {
        pid: child.pid
      }));
    });
    child.once('exit', (code, signal) => {
      resolve({
        code: code ?? signalToExitCode(signal),
        signal
      });
    });
  });
}

export function isPidRunning(pid) {
  const normalizedPid = normalizePid(pid, { allowMissing: true });
  if (normalizedPid === undefined) {
    return false;
  }

  try {
    process.kill(normalizedPid, 0);
    if (process.platform !== 'win32' && isPosixZombie(normalizedPid)) {
      return false;
    }
    return true;
  } catch (error) {
    if (error?.code === 'EPERM') {
      return true;
    }
    if (error?.code === 'ESRCH') {
      return false;
    }
    throw classifyAdapterError(error, 'Unable to determine process liveness.', {
      pid: normalizedPid
    });
  }
}

function isPosixZombie(pid) {
  if (process.platform === 'linux') {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const commandEnd = stat.lastIndexOf(')');
      if (commandEnd !== -1) {
        return stat.slice(commandEnd + 2, commandEnd + 3) === 'Z';
      }
    } catch {
      // Fall through to ps when procfs is unavailable or the process changed state.
    }
  }

  const result = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], {
    encoding: 'utf8',
    timeout: DEFAULT_PROCESS_EVIDENCE_TIMEOUT_MS
  });
  return !result.error && result.status === 0 && /^\s*Z/.test(result.stdout);
}

export function getLiveness(pid) {
  try {
    return isPidRunning(pid) ? 'running' : 'stale';
  } catch {
    return 'unknown';
  }
}

export function getProcessEvidence(pid, options = {}) {
  const {
    platform = process.platform,
    timeoutMs = DEFAULT_PROCESS_EVIDENCE_TIMEOUT_MS
  } = options;
  const normalizedPid = normalizePid(pid);
  const alive = isPidRunning(normalizedPid);
  if (!alive) {
    return {
      pid: normalizedPid,
      alive: false,
      source: 'liveness'
    };
  }

  if (platform === 'win32') {
    return windowsProcessEvidence(normalizedPid, { timeoutMs });
  }

  return posixProcessEvidence(normalizedPid, { timeoutMs });
}

export function listPortListeners(options = {}) {
  const { port, platform = process.platform } = options;
  const normalizedPort = port === undefined ? undefined : normalizePort(port);

  if (platform === 'win32') {
    return listWindowsPortListeners(normalizedPort);
  }

  return listPosixPortListeners(normalizedPort);
}

export async function stopProcessTree(pid, options = {}) {
  const {
    platform = process.platform,
    signal = 'SIGTERM',
    timeoutMs = DEFAULT_STOP_TIMEOUT_MS,
    force = true
  } = options;
  const normalizedPid = normalizePid(pid);

  if (!isPidRunning(normalizedPid)) {
    return {
      pid: normalizedPid,
      ok: true,
      status: 'stopped',
      alreadyStopped: true
    };
  }

  const method = platform === 'win32' ? 'taskkill' : 'process_group_signal';

  try {
    if (platform === 'win32') {
      taskkillProcessTree(normalizedPid, { force });
    } else {
      signalPosixProcessTree(normalizedPid, signal);
    }
  } catch (error) {
    throw classifyStopFailure(error, normalizedPid, method);
  }

  const stopped = await waitForNotRunning(normalizedPid, timeoutMs);
  if (!stopped) {
    throw new LaunchdeckError('stop_failed', 'Failed to stop managed process tree.', {
      pid: normalizedPid,
      method,
      status: 'stop_failed'
    });
  }

  return {
    pid: normalizedPid,
    ok: true,
    status: 'stopped',
    method
  };
}

export function stopProcessTreeSync(pid, options = {}) {
  const {
    platform = process.platform,
    signal = 'SIGTERM',
    force = true
  } = options;
  const normalizedPid = normalizePid(pid);

  if (!isPidRunning(normalizedPid)) {
    return {
      pid: normalizedPid,
      ok: true,
      status: 'stopped',
      alreadyStopped: true
    };
  }

  const method = platform === 'win32' ? 'taskkill' : 'process_group_signal';

  try {
    if (platform === 'win32') {
      taskkillProcessTree(normalizedPid, { force });
    } else {
      signalPosixProcessTree(normalizedPid, signal);
    }
  } catch (error) {
    throw classifyStopFailure(error, normalizedPid, method);
  }

  return {
    pid: normalizedPid,
    ok: !isPidRunning(normalizedPid),
    status: isPidRunning(normalizedPid) ? 'stop_failed' : 'stopped',
    method
  };
}

export function normalizePid(pid, options = {}) {
  const { allowMissing = false } = options;
  if ((pid === undefined || pid === null || pid === '') && allowMissing) {
    return undefined;
  }

  const normalizedPid = Number(pid);
  if (allowMissing && (!Number.isInteger(normalizedPid) || normalizedPid <= 0)) {
    return undefined;
  }

  if (!Number.isInteger(normalizedPid) || normalizedPid <= 0) {
    throw new LaunchdeckError('process_not_found', 'Process id is missing or invalid.', {
      pid
    });
  }

  return normalizedPid;
}

export function normalizePort(port) {
  const normalizedPort = Number(port);
  if (!Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
    throw new LaunchdeckError('invalid_arguments', 'Port must be an integer from 1 to 65535.', {
      port
    });
  }
  return normalizedPort;
}

export function classifyAdapterError(error, message = 'Platform adapter failed.', details = {}) {
  if (error instanceof LaunchdeckError) {
    return error;
  }

  return new LaunchdeckError('adapter_failed', message, {
    ...details,
    causeCode: error?.code,
    causeMessage: error?.message
  });
}

function normalizeCommand(command) {
  if (typeof command !== 'string' || command.trim() === '') {
    throw new LaunchdeckError('command_usage_error', 'Command must be a non-empty string.', {
      command
    });
  }
  return command;
}

function planSpawn(command, shell) {
  if (shell !== true) {
    return {
      command,
      args: [],
      shell
    };
  }

  const parsed = parseSimpleCommand(command);
  if (parsed && isNodeExecutable(parsed.command)) {
    return {
      command: parsed.command,
      args: parsed.args,
      shell: false
    };
  }

  return {
    command,
    args: [],
    shell
  };
}

function parseSimpleCommand(command) {
  if (/[|&;<>()`]/.test(command)) {
    return undefined;
  }

  const tokens = [];
  let current = '';
  let quote;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (quote) {
    return undefined;
  }
  if (current) {
    tokens.push(current);
  }
  if (tokens.length === 0) {
    return undefined;
  }

  return {
    command: tokens[0],
    args: tokens.slice(1)
  };
}

function isNodeExecutable(command) {
  const executable = command.toLowerCase();
  return executable === 'node'
    || executable === 'node.exe'
    || executable === process.execPath.toLowerCase();
}

function listWindowsPortListeners(port) {
  const result = spawnSync('netstat', ['-ano'], {
    encoding: 'utf8',
    windowsHide: true
  });

  if (result.error) {
    throw classifyAdapterError(result.error, 'Failed to inspect local ports.', {
      adapter: 'netstat'
    });
  }

  if (result.status !== 0) {
    throw new LaunchdeckError('adapter_failed', 'Failed to inspect local ports.', {
      adapter: 'netstat',
      status: result.status,
      stderr: result.stderr?.trim()
    });
  }

  return dedupeListeners(
    result.stdout
      .split(/\r?\n/)
      .flatMap(parseWindowsNetstatLine)
      .filter((listener) => port === undefined || listener.port === port)
  );
}

function windowsProcessEvidence(pid, options = {}) {
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object ProcessId,CommandLine,ExecutablePath,CreationDate | ConvertTo-Json -Compress`
  ], {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? DEFAULT_PROCESS_EVIDENCE_TIMEOUT_MS,
    windowsHide: true
  });

  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    return {
      pid,
      alive: true,
      source: 'liveness',
      unavailable: true,
      error: result.error?.code ?? result.stderr?.trim()
    };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return {
      pid,
      alive: true,
      command: parsed.CommandLine ?? parsed.ExecutablePath,
      cwd: undefined,
      startTime: parsed.CreationDate,
      source: 'cim'
    };
  } catch (error) {
    return {
      pid,
      alive: true,
      source: 'liveness',
      unavailable: true,
      error: error.message
    };
  }
}

function posixProcessEvidence(pid, options = {}) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command='], {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? DEFAULT_PROCESS_EVIDENCE_TIMEOUT_MS
  });
  const evidence = {
    pid,
    alive: true,
    cwd: posixProcessCwd(pid),
    source: 'ps'
  };

  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    return {
      ...evidence,
      source: evidence.cwd ? 'procfs' : 'liveness',
      unavailable: !evidence.cwd,
      error: result.error?.code ?? result.stderr?.trim()
    };
  }

  const line = result.stdout.trim();
  const match = line.match(/^([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/);
  return {
    ...evidence,
    startTime: match?.[1],
    command: match?.[2] ?? line
  };
}

function posixProcessCwd(pid) {
  try {
    return fs.realpathSync(`/proc/${pid}/cwd`);
  } catch {
    return undefined;
  }
}

function parseWindowsNetstatLine(line) {
  const trimmed = line.trim();
  if (!trimmed || (!trimmed.startsWith('TCP') && !trimmed.startsWith('UDP'))) {
    return [];
  }

  const parts = trimmed.split(/\s+/);
  const protocol = parts[0]?.toLowerCase();
  if (protocol === 'tcp') {
    const state = parts[3]?.toLowerCase();
    if (state !== 'listening') {
      return [];
    }
    const endpoint = parseEndpoint(parts[1]);
    const pid = Number(parts[4]);
    if (!endpoint || !Number.isInteger(pid)) {
      return [];
    }
    return [{
      protocol,
      localAddress: endpoint.address,
      port: endpoint.port,
      state,
      pid,
      source: 'netstat'
    }];
  }

  if (protocol === 'udp') {
    const endpoint = parseEndpoint(parts[1]);
    const pid = Number(parts[3]);
    if (!endpoint || !Number.isInteger(pid)) {
      return [];
    }
    return [{
      protocol,
      localAddress: endpoint.address,
      port: endpoint.port,
      state: 'listening',
      pid,
      source: 'netstat'
    }];
  }

  return [];
}

function listPosixPortListeners(port) {
  const lsofResult = spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], {
    encoding: 'utf8'
  });
  if (!lsofResult.error && lsofResult.status === 0) {
    const listeners = lsofResult.stdout
      .split(/\r?\n/)
      .slice(1)
      .flatMap(parseLsofLine)
      .filter((listener) => port === undefined || listener.port === port);
    if (listeners.length > 0 || port === undefined) {
      return dedupeListeners(listeners);
    }
  }

  const ssResult = spawnSync('ss', ['-ltnp'], {
    encoding: 'utf8'
  });
  if (!ssResult.error && ssResult.status === 0) {
    const listeners = ssResult.stdout
      .split(/\r?\n/)
      .slice(1)
      .flatMap(parseSsLine)
      .filter((listener) => port === undefined || listener.port === port);
    if (listeners.length > 0 || port === undefined) {
      return dedupeListeners(listeners);
    }
  }

  const netstatResult = spawnSync('netstat', ['-anp'], {
    encoding: 'utf8'
  });
  if (!netstatResult.error && netstatResult.status === 0) {
    return dedupeListeners(
      netstatResult.stdout
        .split(/\r?\n/)
        .flatMap(parsePosixNetstatLine)
        .filter((listener) => port === undefined || listener.port === port)
    );
  }

  return [];
}

function parseLsofLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }
  const parts = trimmed.split(/\s+/);
  const pid = Number(parts[1]);
  const endpointToken = parts.find((part) => /:\d+$/.test(part) || /:\d+\s*\(LISTEN\)$/i.test(part));
  const endpoint = parseEndpoint(endpointToken?.replace(/\(LISTEN\)$/i, ''));
  if (!endpoint || !Number.isInteger(pid)) {
    return [];
  }
  return [{
    protocol: 'tcp',
    localAddress: endpoint.address,
    port: endpoint.port,
    state: 'listening',
    pid,
    source: 'lsof'
  }];
}

function parseSsLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('LISTEN')) {
    return [];
  }
  const parts = trimmed.split(/\s+/);
  const endpoint = parseEndpoint(parts[3]);
  if (!endpoint) {
    return [];
  }
  const pidMatch = trimmed.match(/pid=(\d+)/);
  return [{
    protocol: 'tcp',
    localAddress: endpoint.address,
    port: endpoint.port,
    state: 'listening',
    pid: pidMatch ? Number(pidMatch[1]) : undefined,
    source: 'ss'
  }];
}

function parsePosixNetstatLine(line) {
  const trimmed = line.trim();
  if (!/^tcp/i.test(trimmed) || !/\bLISTEN\b/i.test(trimmed)) {
    return [];
  }
  const parts = trimmed.split(/\s+/);
  const endpoint = parseEndpoint(parts[3]);
  if (!endpoint) {
    return [];
  }
  const pidPart = parts.find((part) => /^\d+\//.test(part));
  return [{
    protocol: 'tcp',
    localAddress: endpoint.address,
    port: endpoint.port,
    state: 'listening',
    pid: pidPart ? Number(pidPart.split('/')[0]) : undefined,
    source: 'netstat'
  }];
}

function parseEndpoint(endpoint) {
  if (!endpoint || endpoint === '*:*') {
    return undefined;
  }

  const withoutTcpPrefix = endpoint.replace(/^TCP\s+/i, '');
  const ipv6Match = withoutTcpPrefix.match(/^\[([^\]]*)\]:(\d+)$/);
  if (ipv6Match) {
    return {
      address: ipv6Match[1],
      port: Number(ipv6Match[2])
    };
  }

  const lastColon = withoutTcpPrefix.lastIndexOf(':');
  if (lastColon === -1) {
    return undefined;
  }

  const port = Number(withoutTcpPrefix.slice(lastColon + 1));
  if (!Number.isInteger(port)) {
    return undefined;
  }

  return {
    address: withoutTcpPrefix.slice(0, lastColon),
    port
  };
}

function dedupeListeners(listeners) {
  const seen = new Set();
  const result = [];
  for (const listener of listeners) {
    const key = [
      listener.protocol,
      listener.localAddress,
      listener.port,
      listener.pid,
      listener.state,
      listener.source
    ].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(listener);
    }
  }
  return result.sort((left, right) =>
    left.port - right.port
    || String(left.protocol).localeCompare(String(right.protocol))
    || String(left.localAddress).localeCompare(String(right.localAddress))
    || Number(left.pid ?? 0) - Number(right.pid ?? 0)
  );
}

function taskkillProcessTree(pid, options = {}) {
  const args = ['/PID', String(pid), '/T'];
  if (options.force) {
    args.push('/F');
  }

  const result = spawnSync('taskkill', args, {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? DEFAULT_STOP_TIMEOUT_MS,
    windowsHide: true
  });

  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      try {
        process.kill(pid);
        if (waitForNotRunningSync(pid, options.timeoutMs ?? DEFAULT_STOP_TIMEOUT_MS)) {
          return;
        }
      } catch {
        // Surface the original taskkill timeout below.
      }
    }
    throw result.error;
  }

  if (result.status !== 0 && isPidRunning(pid)) {
    throw new LaunchdeckError('stop_failed', 'taskkill failed to stop the managed process tree.', {
      pid,
      status: result.status,
      stderr: result.stderr?.trim()
    });
  }
}

function signalPosixProcessTree(pid, signal) {
  try {
    process.kill(-pid, signal);
    return;
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      try {
        process.kill(pid, signal);
        return;
      } catch (fallbackError) {
        if (fallbackError?.code !== 'ESRCH') {
          throw fallbackError;
        }
      }
    }
  }
}

async function waitForNotRunning(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!isPidRunning(pid)) {
      return true;
    }
    await delay(STOP_POLL_INTERVAL_MS);
  }
  return !isPidRunning(pid);
}

function waitForNotRunningSync(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!isPidRunning(pid)) {
      return true;
    }
    sleepSync(STOP_POLL_INTERVAL_MS);
  }
  return !isPidRunning(pid);
}

function classifyStopFailure(error, pid, method) {
  if (error instanceof LaunchdeckError) {
    return error;
  }
  return new LaunchdeckError('stop_failed', 'Failed to stop managed process tree.', {
    pid,
    method,
    causeCode: error?.code,
    causeMessage: error?.message
  });
}

function signalToExitCode(signal) {
  return signal ? 1 : 0;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
