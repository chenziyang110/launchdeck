import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LaunchdeckError } from '../errors.js';
import { isPidRunning, listProcesses, readState, startManagedTask, writeState } from '../runtime.js';
import { controlPlanePaths } from './state.js';
import { withLock, withMutationLocks } from './locks.js';

const RUN_INDEX_VERSION = 1;
const ACTIVE_RUN_STATUSES = new Set(['starting', 'running', 'ready', 'stopping']);

export async function startManagedRun(taskName, task, config, options = {}) {
  const runContext = options.runContext ?? createRunContext({
    project: options.project ?? projectIdentityForLocalConfig(config),
    config,
    taskName,
    env: options.env
  });
  const globalRun = Boolean(options.global);
  const start = async () => {
    await assertRunIndexWritable(runContext, options.env);
    const existing = await existingManagedProcess(config, taskName, {
      ...runContext,
      global: globalRun
    });
    if (existing) {
      return {
        ...existing,
        reusedExistingRun: true,
        changed: false
      };
    }

    if (options.beforeStart) {
      await options.beforeStart();
    }

    const taskWithMarkers = taskWithRunMarkers(task, runContext);
    const started = startManagedTask(taskName, taskWithMarkers, config.projectRoot);
    const processInfo = persistProcessRunMetadata(config, taskName, started, runContext, {
      trustedSpawn: true
    });
    await recordGlobalRun(processInfo, runContext, options.env);

    const readiness = await resolveReadiness(processInfo, taskWithMarkers, {
      global: globalRun
    });
    persistProcessRunMetadata(config, taskName, {
      ...processInfo,
      readiness
    }, runContext);

    const result = {
      ...processInfo,
      status: readiness.status === 'ready' ? 'ready' : processInfo.status,
      readiness,
      reusedExistingRun: false,
      changed: true
    };
    await recordGlobalRun(result, runContext, options.env);
    return result;
  };

  if (options.locks === false) {
    return start();
  }

  return withMutationLocks({
    operationId: runContext.operationId ?? runContext.transactionId,
    projectId: runContext.projectId,
    taskRef: taskName,
    env: options.env,
    ownerCommand: process.argv.join(' '),
    transactionId: runContext.transactionId
  }, start);
}

export function createRunContext({ project, config, taskName, env = process.env }) {
  const paths = controlPlanePaths(env);
  return {
    projectId: project.projectId ?? project.id ?? stableProjectId(config.projectRoot),
    projectAlias: project.alias ?? project.name ?? config.project.name,
    projectName: config.project.name,
    projectRoot: config.projectRoot,
    configPath: config.configPath,
    taskName,
    runId: makeId('run'),
    transactionId: makeId('tx'),
    launchdeckHome: paths.homeDir,
    env
  };
}

export function projectIdentityForLocalConfig(config) {
  const projectId = stableProjectId(config.projectRoot);
  return {
    projectId,
    id: projectId,
    alias: config.project.name,
    name: config.project.name
  };
}

export function readRunIndex(env = process.env) {
  const runsPath = controlPlanePaths(env).runsPath;
  if (!fs.existsSync(runsPath)) {
    return { version: RUN_INDEX_VERSION, runs: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(runsPath, 'utf8'));
  } catch (error) {
    throw invalidRunIndexError(runsPath, error);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidRunIndexError(runsPath);
  }
  if (parsed.version > RUN_INDEX_VERSION) {
    throw unsupportedRunIndexVersionError(runsPath, parsed.version);
  }
  if (parsed.version !== RUN_INDEX_VERSION || !Array.isArray(parsed.runs)) {
    throw invalidRunIndexError(runsPath);
  }

  return {
    version: parsed.version,
    updatedAt: parsed.updatedAt,
    runs: parsed.runs
  };
}

export async function updateRunRecord(runId, updater, options = {}) {
  const env = options.env ?? process.env;
  const runContext = options.runContext ?? {
    transactionId: options.transactionId,
    env
  };
  return withRunIndexLock(runContext, env, () => {
    const paths = controlPlanePaths(env);
    const state = readRunIndex(env);
    let updated;
    const runs = state.runs.map((run) => {
      if (run.runId !== runId) {
        return run;
      }
      updated = {
        ...run,
        ...updater(run),
        runId,
        lastObservedAt: new Date().toISOString()
      };
      return updated;
    });

    if (!updated) {
      return undefined;
    }

    atomicWriteJson(paths.runsPath, {
      version: RUN_INDEX_VERSION,
      updatedAt: new Date().toISOString(),
      runs: runs.sort(compareRuns)
    });
    return updated;
  });
}

export function observedRun(run, options = {}) {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const active = ACTIVE_RUN_STATUSES.has(run?.status);
  const pid = Number(run?.pid);
  const processAlive = Number.isInteger(pid) && pid > 0 ? isPidRunning(pid) : false;
  if (!active || processAlive || !hasLaunchdeckOwnedEvidence(run)) {
    return {
      ...run,
      observedAt: checkedAt,
      observedProcessAlive: processAlive
    };
  }

  return {
    ...run,
    status: 'stale',
    observedAt: checkedAt,
    observedProcessAlive: false,
    staleReason: 'recorded_pid_not_running',
    ownershipConfidence: run.ownershipConfidence ?? 'stale-owned',
    ownershipProof: {
      ...(run.ownershipProof ?? {}),
      confidence: 'stale-owned',
      processAlive: false,
      checkedAt,
      reasons: uniqueStrings([
        ...(run.ownershipProof?.reasons ?? []),
        'run_process_not_alive'
      ])
    }
  };
}

export function isActiveRunStatus(status) {
  return ACTIVE_RUN_STATUSES.has(status);
}

async function recordGlobalRun(processInfo, runContext, env = process.env) {
  return withRunIndexLock(runContext, env, () => {
    const paths = controlPlanePaths(env);
    const state = readRunIndex(env);
    const run = {
      runId: processInfo.runId,
      transactionId: processInfo.transactionId,
      projectId: runContext.projectId,
      projectAlias: runContext.projectAlias,
      projectRoot: runContext.projectRoot,
      configPath: runContext.configPath,
      task: runContext.taskName,
      command: processInfo.command,
      cwd: processInfo.cwd,
      pid: processInfo.pid,
      status: processInfo.status,
      declaredPorts: processInfo.ports ?? [],
      logPath: processInfo.logPath,
      launchdeckHome: runContext.launchdeckHome,
      startedAt: processInfo.startedAt,
      lastObservedAt: new Date().toISOString(),
      ownershipConfidence: processInfo.ownershipConfidence,
      ownershipProof: processInfo.ownershipProof
    };
    const runs = [
      ...state.runs.filter((candidate) => candidate.runId !== run.runId),
      run
    ].sort(compareRuns);
    atomicWriteJson(paths.runsPath, {
      version: RUN_INDEX_VERSION,
      updatedAt: new Date().toISOString(),
      runs
    });
  });
}

async function existingManagedProcess(config, taskName, runContext) {
  let processInfo;
  try {
    processInfo = listProcesses(config.projectRoot).find((candidate) =>
      candidate.task === taskName && candidate.status === 'running'
    );
  } catch {
    return undefined;
  }
  if (!processInfo) {
    return undefined;
  }

  const withMetadata = persistProcessRunMetadata(config, taskName, processInfo, {
    ...runContext,
    runId: processInfo.runId ?? runContext.runId,
    transactionId: processInfo.transactionId ?? runContext.transactionId
  });
  const result = {
    ...withMetadata,
    spawned: false,
    readiness: readinessForExistingProcess(withMetadata, { global: Boolean(runContext.global) })
  };
  await recordGlobalRun(result, {
    ...runContext,
    runId: result.runId,
    transactionId: result.transactionId
  }, runContext.env);
  return result;
}

function taskWithRunMarkers(task, runContext) {
  return {
    ...task,
    env: {
      ...task.env,
      LAUNCHDECK_HOME: runContext.launchdeckHome,
      LAUNCHDECK_PROJECT_ID: runContext.projectId,
      LAUNCHDECK_RUN_ID: runContext.runId,
      LAUNCHDECK_TASK: runContext.taskName
    }
  };
}

function persistProcessRunMetadata(config, taskName, processInfo, runContext, options = {}) {
  const state = readState(config.projectRoot);
  const current = state.processes[taskName] ?? processInfo;
  const next = {
    ...current,
    ...processInfo,
    runId: options.trustedSpawn === true ? runContext.runId : (processInfo.runId ?? runContext.runId),
    transactionId: options.trustedSpawn === true ? runContext.transactionId : (processInfo.transactionId ?? runContext.transactionId),
    projectId: runContext.projectId,
    projectAlias: runContext.projectAlias,
    launchdeckHome: runContext.launchdeckHome,
    spawned: processInfo.spawned ?? true
  };
  if (options.trustedSpawn === true) {
    next.ownershipConfidence = 'verified-owned';
    next.ownershipProof = trustedSpawnOwnershipProof(next, runContext);
  } else {
    next.ownershipConfidence = processInfo.ownershipConfidence ?? current.ownershipConfidence;
    next.ownershipProof = processInfo.ownershipProof ?? current.ownershipProof;
  }
  state.processes[taskName] = {
    ...next,
    status: current.status === 'running' ? 'running' : next.status
  };
  writeState(config.projectRoot, state);
  return next;
}

function trustedSpawnOwnershipProof(processInfo, runContext) {
  const checkedAt = new Date().toISOString();
  return {
    confidence: 'verified-owned',
    source: 'launchdeck-spawn',
    runId: runContext.runId,
    transactionId: runContext.transactionId,
    projectId: runContext.projectId,
    projectRoot: runContext.projectRoot,
    task: runContext.taskName,
    pid: processInfo.pid,
    command: processInfo.command,
    cwd: processInfo.cwd,
    startedAt: processInfo.startedAt,
    checkedAt,
    createdAt: checkedAt,
    reasons: ['launchdeck_spawned_process']
  };
}

async function resolveReadiness(processInfo, task, options = {}) {
  if (!options.global) {
    return {
      kind: 'process-alive',
      status: processInfo.status === 'running' ? 'running' : processInfo.status
    };
  }

  const [port] = task.ports ?? [];
  if (Number.isInteger(port)) {
    const url = `http://127.0.0.1:${port}/health`;
    const ready = await waitForHttpReady(url, 2_000);
    if (ready) {
      return {
        kind: 'http',
        status: 'ready',
        url
      };
    }
    return {
      kind: 'http',
      status: processInfo.status,
      url
    };
  }

  return {
    kind: 'process-alive',
    status: processInfo.status === 'running' ? 'ready' : processInfo.status
  };
}

function readinessForExistingProcess(processInfo, options = {}) {
  if (processInfo.readiness) {
    return processInfo.readiness;
  }
  return {
    kind: 'process-alive',
    status: options.global ? 'ready' : processInfo.status
  };
}

async function waitForHttpReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (await isHttpReady(url)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

function isHttpReady(url) {
  return new Promise((resolve) => {
    const request = fetch(url, { method: 'GET' });
    request
      .then((response) => resolve(response.status >= 200 && response.status < 500))
      .catch(() => resolve(false));
  });
}

function withRunIndexLock(runContext, env, callback) {
  return withLock({
    lockName: 'run-index',
    env: env ?? process.env,
    ownerCommand: process.argv.join(' '),
    transactionId: runContext.transactionId
  }, callback);
}

async function assertRunIndexWritable(runContext, env = process.env) {
  await withRunIndexLock(runContext, env, () => {
    const paths = controlPlanePaths(env);
    const state = readRunIndex(env);
    atomicWriteJson(paths.runsPath, {
      version: RUN_INDEX_VERSION,
      updatedAt: state.updatedAt ?? new Date().toISOString(),
      runs: state.runs
    });
  });
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function stableProjectId(projectRoot) {
  const key = process.platform === 'win32'
    ? path.resolve(projectRoot).toLowerCase()
    : path.resolve(projectRoot);
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

function compareRuns(left, right) {
  return String(left.projectAlias ?? '').localeCompare(String(right.projectAlias ?? ''))
    || String(left.task ?? '').localeCompare(String(right.task ?? ''));
}

function hasLaunchdeckOwnedEvidence(run) {
  if (!run || typeof run !== 'object') {
    return false;
  }
  if (run.ownershipConfidence === 'verified-owned' || run.ownershipConfidence === 'stale-owned') {
    return true;
  }
  const proof = run.ownershipProof;
  return proof?.source === 'launchdeck-spawn'
    && proof?.confidence === 'verified-owned'
    && proof?.reasons?.includes('launchdeck_spawned_process');
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}

function unsupportedRunIndexVersionError(runsPath, foundVersion) {
  return new LaunchdeckError(
    'state_version_unsupported',
    `Launchdeck run index at ${runsPath} uses unsupported version ${foundVersion}.`,
    {
      statePath: runsPath,
      foundVersion,
      supportedVersion: RUN_INDEX_VERSION,
      next: [
        {
          label: 'Check Launchdeck version',
          command: 'launchdeck version',
          reason: 'A newer Launchdeck may be required to read this run index.',
          risk: 'safe'
        }
      ]
    }
  );
}

function invalidRunIndexError(runsPath, cause = undefined) {
  return new LaunchdeckError(
    'run_index_invalid',
    `Launchdeck run index at ${runsPath} is invalid.`,
    {
      statePath: runsPath,
      causeMessage: cause?.message
    }
  );
}
