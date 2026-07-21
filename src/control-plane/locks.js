import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const LOCK_RECORD_VERSION = 1;
const DEFAULT_TTL_MS = 30_000;
const DEFAULT_WAIT_MS = 0;
const RETRY_INTERVAL_MS = 10;

export const MUTATION_LOCK_ORDER = Object.freeze([
  'operation',
  'registry',
  'project',
  'task',
  'run-index',
  'journal-index'
]);

export async function acquireLock(options = {}) {
  const lockName = normalizeLockName(options.lockName);
  const env = options.env ?? process.env;
  const lockPath = pathForLock(lockName, options);
  const ttlMs = normalizeDuration(options.ttlMs, DEFAULT_TTL_MS, 'ttlMs');
  const waitMs = normalizeDuration(options.waitMs, DEFAULT_WAIT_MS, 'waitMs');
  const startedAt = Date.now();

  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  for (;;) {
    const record = createLockRecord({
      lockName,
      ownerCommand: options.ownerCommand,
      ownerCwd: options.ownerCwd,
      transactionId: options.transactionId,
      ttlMs
    });

    try {
      await writeLockFile(lockPath, record);
      return createLockHandle({ lockName, lockPath, record });
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
    }

    const owner = await readExistingLock(lockPath, lockName);
    const stale = isStaleCandidate(owner);
    const takeoverAllowed = stale && !isOwnerAlive(owner);

    if (takeoverAllowed) {
      await removeLockFile(lockPath);
      continue;
    }

    if (Date.now() - startedAt >= waitMs) {
      throw lockBusyError({
        lockName,
        lockPath,
        owner,
        staleCandidate: stale,
        takeoverAllowed
      });
    }

    await sleep(Math.min(RETRY_INTERVAL_MS, Math.max(1, waitMs - (Date.now() - startedAt))));
  }
}

export async function withLock(options, callback) {
  const lock = await acquireLock(options);
  try {
    return await callback(lock);
  } finally {
    await lock.release();
  }
}

export function acquireLockSync(options = {}) {
  const lockName = normalizeLockName(options.lockName);
  const lockPath = pathForLock(lockName, options);
  const ttlMs = normalizeDuration(options.ttlMs, DEFAULT_TTL_MS, 'ttlMs');
  const record = createLockRecord({
    lockName,
    ownerCommand: options.ownerCommand,
    ownerCwd: options.ownerCwd,
    transactionId: options.transactionId,
    ttlMs
  });
  fsSync.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const descriptor = fsSync.openSync(lockPath, 'wx');
    try {
      fsSync.writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    } finally {
      fsSync.closeSync(descriptor);
    }
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    throw lockBusyError({
      lockName,
      lockPath,
      owner: readExistingLockSync(lockPath, lockName),
      staleCandidate: false,
      takeoverAllowed: false
    });
  }
  return createSyncLockHandle({ lockName, lockPath, record });
}

export function withLockSync(options, callback) {
  const lock = acquireLockSync(options);
  try {
    return callback(lock);
  } finally {
    lock.release();
  }
}

export function mutationLockNames(options = {}) {
  const operationId = normalizeRequiredToken(options.operationId, 'operationId');
  const names = [`operation-${safePathToken(operationId)}`];
  if (options.registryMutation === true) names.push('registry');
  if (options.projectId !== undefined && options.projectId !== null) {
    const projectId = normalizeRequiredToken(options.projectId, 'projectId');
    names.push(`project-${safePathToken(projectId)}`);
    if (options.taskRef !== undefined && options.taskRef !== null) {
      names.push(`task-${safePathToken(projectId)}-${safePathToken(normalizeRequiredToken(options.taskRef, 'taskRef'))}`);
    }
  } else if (options.taskRef !== undefined && options.taskRef !== null) {
    throw invalidLockOption('projectId is required when taskRef is provided.');
  }
  if (options.includeRunIndex === true) names.push('run-index');
  if (options.includeJournalIndex === true) names.push('operation-journal-index');
  return names;
}

export async function withMutationLocks(options, callback) {
  const names = mutationLockNames(options);
  const lockRunner = options.lockRunner ?? withLock;
  const held = [];

  async function acquireAt(index) {
    if (index === names.length) return callback(Object.freeze([...held]));
    return lockRunner(lockOptions(options, names[index]), async (lock) => {
      held.push(lock);
      try {
        return await acquireAt(index + 1);
      } finally {
        held.pop();
      }
    });
  }

  return acquireAt(0);
}

export function withMutationLocksSync(options, callback) {
  const names = mutationLockNames(options);
  const lockRunnerSync = options.lockRunnerSync ?? withLockSync;
  const held = [];

  function acquireAt(index) {
    if (index === names.length) return callback(Object.freeze([...held]));
    return lockRunnerSync(lockOptions(options, names[index]), (lock) => {
      held.push(lock);
      try {
        return acquireAt(index + 1);
      } finally {
        held.pop();
      }
    });
  }

  return acquireAt(0);
}

export function controlPlanePaths(env = process.env) {
  const homeDir = env.LAUNCHDECK_HOME
    ? path.resolve(env.LAUNCHDECK_HOME)
    : defaultHomeDir(env);
  return {
    homeDir,
    locksDir: path.join(homeDir, 'locks')
  };
}

function createLockRecord({ lockName, ownerCommand, ownerCwd, transactionId, ttlMs }) {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlMs);

  return {
    version: LOCK_RECORD_VERSION,
    lockName,
    ownerPid: process.pid,
    ownerCommand: String(ownerCommand ?? process.argv.join(' ')),
    ownerCwd: path.resolve(ownerCwd ?? process.cwd()),
    transactionId: transactionId === undefined ? undefined : String(transactionId),
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
}

async function writeLockFile(lockPath, record) {
  const handle = await fs.open(lockPath, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
  } finally {
    await handle.close();
  }
}

function createLockHandle({ lockName, lockPath, record }) {
  let released = false;

  return {
    lockName,
    lockPath,
    record,
    async release() {
      if (released) {
        return;
      }
      released = true;

      const current = await readExistingLock(lockPath, lockName);
      if (isSameOwner(current, record)) {
        await removeLockFile(lockPath);
      }
    }
  };
}

function createSyncLockHandle({ lockName, lockPath, record }) {
  let released = false;
  return {
    lockName,
    lockPath,
    record,
    release() {
      if (released) return;
      released = true;
      const current = readExistingLockSync(lockPath, lockName);
      if (isSameOwner(current, record)) {
        try {
          fsSync.unlinkSync(lockPath);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
    }
  };
}

async function readExistingLock(lockPath, lockName) {
  try {
    const content = await fs.readFile(lockPath, 'utf8');
    const record = JSON.parse(content);
    return normalizeExistingRecord(record, lockName);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    return {
      version: undefined,
      lockName,
      ownerPid: undefined,
      ownerCommand: 'unknown',
      ownerCwd: 'unknown',
      transactionId: undefined,
      createdAt: undefined,
      expiresAt: undefined,
      invalid: true,
      parseError: error?.message ?? String(error)
    };
  }
}

function readExistingLockSync(lockPath, lockName) {
  try {
    return normalizeExistingRecord(JSON.parse(fsSync.readFileSync(lockPath, 'utf8')), lockName);
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    return {
      version: undefined,
      lockName,
      ownerPid: undefined,
      ownerCommand: 'unknown',
      ownerCwd: 'unknown',
      transactionId: undefined,
      createdAt: undefined,
      expiresAt: undefined,
      invalid: true,
      parseError: error?.message ?? String(error)
    };
  }
}

function normalizeExistingRecord(record, fallbackLockName) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      lockName: fallbackLockName,
      invalid: true
    };
  }

  return {
    version: record.version,
    lockName: String(record.lockName ?? fallbackLockName),
    ownerPid: Number.isInteger(record.ownerPid) ? record.ownerPid : undefined,
    ownerCommand: typeof record.ownerCommand === 'string' ? record.ownerCommand : 'unknown',
    ownerCwd: typeof record.ownerCwd === 'string' ? record.ownerCwd : 'unknown',
    transactionId: typeof record.transactionId === 'string' ? record.transactionId : undefined,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined,
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : undefined,
    heartbeatAt: typeof record.heartbeatAt === 'string' ? record.heartbeatAt : undefined
  };
}

function isStaleCandidate(owner) {
  if (!owner?.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(owner.expiresAt);
  return !Number.isNaN(expiresAt) && expiresAt <= Date.now();
}

function isOwnerAlive(owner) {
  const pid = owner?.ownerPid;
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function isSameOwner(current, expected) {
  return current?.lockName === expected.lockName
    && current?.ownerPid === expected.ownerPid
    && current?.transactionId === expected.transactionId
    && current?.createdAt === expected.createdAt;
}

async function removeLockFile(lockPath) {
  try {
    await fs.unlink(lockPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

function lockBusyError({ lockName, lockPath, owner, staleCandidate, takeoverAllowed }) {
  const error = new Error(`Lock '${lockName}' is already held.`);
  error.name = 'LaunchdeckLockError';
  error.code = 'lock_busy';
  error.details = {
    lockName,
    lockPath,
    owner,
    staleCandidate,
    takeoverAllowed
  };
  error.next = nextActions(lockName);
  return error;
}

function nextActions(lockName) {
  return [
    {
      label: 'Inspect active Launchdeck state',
      command: 'launchdeck status --all --json',
      reason: `Shows active work before retrying lock '${lockName}'.`,
      risk: 'safe'
    },
    {
      label: 'Retry the command',
      command: 'launchdeck <command> --json',
      reason: 'The lock may clear after the current state mutation finishes.',
      risk: 'safe'
    }
  ];
}

function pathForLock(lockName, options) {
  if (options.lockPath) {
    return path.resolve(options.lockPath);
  }
  const locksDir = options.locksDir
    ? path.resolve(options.locksDir)
    : controlPlanePaths(options.env ?? process.env).locksDir;
  return path.join(locksDir, `${lockName}.lock`);
}

function normalizeLockName(lockName) {
  const normalized = String(lockName ?? '').trim();
  if (!normalized) {
    throw invalidLockOption('lockName is required.');
  }
  if (normalized.includes('/') || normalized.includes('\\') || normalized === '.' || normalized === '..') {
    throw invalidLockOption(`Invalid lock name: ${normalized}`);
  }
  return normalized;
}

function normalizeRequiredToken(value, label) {
  const token = String(value ?? '').trim();
  if (!token) throw invalidLockOption(`${label} is required.`);
  return token;
}

function safePathToken(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function lockOptions(options, lockName) {
  return {
    lockName,
    env: options.env,
    locksDir: options.locksDir,
    ownerCommand: options.ownerCommand,
    ownerCwd: options.ownerCwd,
    transactionId: options.transactionId ?? options.operationId,
    ttlMs: options.ttlMs,
    waitMs: options.waitMs
  };
}

function normalizeDuration(value, defaultValue, label) {
  if (value === undefined) {
    return defaultValue;
  }
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0) {
    throw invalidLockOption(`${label} must be a non-negative number.`);
  }
  return duration;
}

function invalidLockOption(message) {
  const error = new Error(message);
  error.name = 'LaunchdeckLockError';
  error.code = 'lock_invalid';
  return error;
}

function defaultHomeDir(env) {
  if (process.platform === 'win32' && env.LOCALAPPDATA) {
    return path.join(env.LOCALAPPDATA, 'Launchdeck');
  }
  if (env.XDG_STATE_HOME) {
    return path.join(env.XDG_STATE_HOME, 'launchdeck');
  }
  return path.join(os.homedir(), '.local', 'state', 'launchdeck');
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
