import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const LOCK_RECORD_VERSION = 1;
const DEFAULT_TTL_MS = 30_000;
const DEFAULT_WAIT_MS = 0;
const RETRY_INTERVAL_MS = 10;

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
