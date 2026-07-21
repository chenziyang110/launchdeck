import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig } from './config.js';
import { LaunchdeckError } from './errors.js';
import {
  getLiveness,
  isPidRunning as adapterIsPidRunning,
  listPortListeners,
  spawnForeground,
  spawnManaged,
  stopProcessTreeSync
} from './adapters/process.js';
import {
  assertContainedPath,
  isSamePath,
  planCleanTarget,
  resolveProjectPath
} from './adapters/path.js';
import { appendEvent } from './control-plane/events.js';
import { withMutationLocksSync } from './control-plane/locks.js';
import { OWNERSHIP_CONFIDENCE, proveRunOwnership } from './control-plane/ownership.js';
import { controlPlanePaths } from './control-plane/state.js';

const STATE_VERSION = 1;
const PROCESS_STATUSES = new Set(['running', 'stopped', 'stale', 'unknown', 'stop_failed']);
const STOP_VERIFY_TIMEOUT_MS = 2_000;
const STOP_VERIFY_POLL_MS = 50;
const RUN_INDEX_VERSION = 1;
const ACTIVE_RUN_STATUSES = new Set(['starting', 'running', 'ready', 'stopping']);

export function runtimePaths(projectRoot) {
  const launchdeckDir = path.join(projectRoot, '.launchdeck');
  return {
    launchdeckDir,
    logsDir: path.join(launchdeckDir, 'logs'),
    runtimeDir: path.join(launchdeckDir, 'runtime'),
    statePath: path.join(launchdeckDir, 'runtime', 'state.json')
  };
}

export function ensureRuntimeDirs(projectRoot) {
  const paths = runtimePaths(projectRoot);
  fs.mkdirSync(paths.logsDir, { recursive: true });
  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  return paths;
}

export function resolveTaskCwd(projectRoot, task) {
  const cwd = resolveProjectPath(projectRoot, task.cwd ?? '.', {
    label: `Task '${task.name}' cwd`,
    code: 'project_root_escape'
  });
  if (!fs.existsSync(cwd)) {
    throw new LaunchdeckError('cwd_missing', `Task '${task.name}' cwd does not exist: ${task.cwd ?? '.'}`, {
      task: task.name,
      cwd
    });
  }
  return cwd;
}

export function readState(projectRoot) {
  const { statePath } = runtimePaths(projectRoot);
  if (!fs.existsSync(statePath)) {
    return createEmptyState(projectRoot);
  }

  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    validateRuntimeState(state, projectRoot, statePath);
    return state;
  } catch (error) {
    if (error instanceof LaunchdeckError && error.code === 'runtime_state_invalid') {
      throw error;
    }
    throw invalidRuntimeState(statePath, projectRoot, error);
  }
}

export function writeState(projectRoot, state) {
  const paths = ensureRuntimeDirs(projectRoot);
  const nextState = {
    ...state,
    version: STATE_VERSION,
    projectRoot: path.resolve(projectRoot),
    updatedAt: new Date().toISOString(),
    processes: state.processes ?? {}
  };
  fs.writeFileSync(paths.statePath, `${JSON.stringify(nextState, null, 2)}\n`);
  return nextState;
}

export function refreshState(projectRoot) {
  const state = readState(projectRoot);
  const refreshedAt = new Date().toISOString();
  for (const [taskName, processInfo] of Object.entries(state.processes)) {
    processInfo.name ??= processInfo.task ?? taskName;
    processInfo.lastRefresh = refreshedAt;
    if (processInfo.status === 'stopped') {
      continue;
    }

    processInfo.status = getLiveness(processInfo.pid);
  }
  return writeState(projectRoot, state);
}

export function listProcesses(projectRoot) {
  const state = refreshState(projectRoot);
  return Object.values(state.processes).sort((a, b) => a.task.localeCompare(b.task));
}

export function observeTaskOwnership(projectRoot, taskName, options = {}) {
  const state = readState(projectRoot);
  const processInfo = state.processes?.[taskName];
  const runIndex = safeReadRunIndex(options.env);
  const run = processInfo
    ? findRunForProcess(runIndex, projectRoot, taskName, processInfo)
    : findActiveRunForTask(runIndex, projectRoot, taskName);

  if (processInfo) {
    try {
      const proof = assertVerifiedStopOwnership(projectRoot, taskName, processInfo, run);
      return { classification: 'verified', proof, processInfo, run };
    } catch (error) {
      const proof = error?.details?.ownershipProof;
      if (options.allowVerifiedSpawnedParent === true && hasTrustedSpawnRecord(run, processInfo)) {
        return {
          classification: 'verified',
          proof: {
            ...(proof ?? {}),
            confidence: OWNERSHIP_CONFIDENCE.VERIFIED_OWNED,
            reasons: [...(proof?.reasons ?? []), 'verified_spawned_parent_restart']
          },
          processInfo,
          run
        };
      }
      return {
        classification: ownershipClassification(error?.code, proof?.confidence),
        proof,
        processInfo,
        run,
        code: error?.code
      };
    }
  }

  if (run) {
    const proof = proveOwnershipForRun(run);
    return {
      classification: ownershipClassification(undefined, proof.confidence),
      proof,
      processInfo: null,
      run
    };
  }

  const config = safeLoadConfig(projectRoot);
  const listeners = (config?.tasks?.[taskName]?.ports ?? [])
    .filter(Number.isInteger)
    .flatMap((port) => safeListPortListeners(port));
  if (listeners.length > 0) {
    const proof = proveRunOwnership(null, { listeners });
    return {
      classification: ownershipClassification(undefined, proof.confidence),
      proof,
      processInfo: null,
      run: null,
      code: proof.confidence === OWNERSHIP_CONFIDENCE.EXTERNAL ? 'external_process' : 'unknown_process_owner',
      ports: [...new Set(proof.portEvidence.map((entry) => entry.port).filter(Number.isInteger))]
    };
  }
  return {
    classification: 'verified',
    proof: {
      confidence: OWNERSHIP_CONFIDENCE.VERIFIED_OWNED,
      processAlive: false,
      reasons: ['no_active_run_or_declared_listener']
    },
    processInfo: null,
    run: null
  };
}

export function startManagedTask(taskName, task, projectRoot) {
  const state = refreshState(projectRoot);
  const existing = state.processes[taskName];
  if (existing?.status === 'running') {
    throw new LaunchdeckError(
      'task_already_running',
      `Task '${taskName}' is already running with pid ${existing.pid}.`,
      { task: taskName, pid: existing.pid }
    );
  }

  const paths = ensureRuntimeDirs(projectRoot);
  const cwd = resolveTaskCwd(projectRoot, task);
  const logPath = task.log
    ? resolveProjectPath(projectRoot, task.log, {
        label: `Task '${taskName}' log`,
        code: 'project_root_escape'
      })
    : path.join(paths.logsDir, `${taskName}.log`);

  assertInsideProject(projectRoot, logPath, `Task '${taskName}' log`, 'project_root_escape');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(
    logPath,
    `\n[launchdeck] starting ${taskName} at ${new Date().toISOString()}\n[launchdeck] command: ${task.command}\n`
  );

  const out = fs.openSync(logPath, 'a');
  const err = fs.openSync(logPath, 'a');
  let managed;
  try {
    managed = spawnManaged(task.command, {
      cwd,
      env: task.env,
      stdio: ['ignore', out, err]
    });
  } finally {
    fs.closeSync(out);
    fs.closeSync(err);
  }

  const now = managed.startedAt;
  const runId = makeRuntimeId('run');
  const transactionId = makeRuntimeId('tx');
  const projectId = stableProjectId(projectRoot);
  const processInfo = {
    task: taskName,
    name: taskName,
    runId,
    transactionId,
    projectId,
    command: task.command,
    cwd,
    pid: managed.pid,
    ports: task.ports ?? [],
    logPath,
    startedAt: now,
    lastRefresh: now,
    status: 'running',
    launchdeckHome: controlPlanePaths().homeDir,
    ownershipConfidence: OWNERSHIP_CONFIDENCE.VERIFIED_OWNED,
    ownershipProof: {
      source: 'launchdeck-spawn',
      confidence: OWNERSHIP_CONFIDENCE.VERIFIED_OWNED,
      runId,
      projectId,
      task: taskName,
      pid: managed.pid,
      command: task.command,
      cwd,
      startedAt: now,
      createdAt: now,
      reasons: ['launchdeck_spawned_process']
    }
  };

  state.processes[taskName] = processInfo;
  const nextState = writeState(projectRoot, state);
  return nextState.processes[taskName];
}

export function runTask(task, projectRoot, options = {}) {
  const cwd = resolveTaskCwd(projectRoot, task);
  return spawnForeground(task.command, {
    cwd,
    env: task.env,
    captureOutput: options.captureOutput,
    maxOutputBytes: options.maxOutputBytes
  });
}

export function stopManagedTasks(projectRoot, taskName, options = {}) {
  if (options.locks === false) {
    return stopManagedTasksUnlocked(projectRoot, taskName, options);
  }
  return withLifecycleLocksSync(projectRoot, taskName, () => stopManagedTasksUnlocked(projectRoot, taskName, options));
}

function stopManagedTasksUnlocked(projectRoot, taskName, options = {}) {
  const state = refreshState(projectRoot);
  const names = taskName
    ? [taskName]
    : Object.values(state.processes)
        .filter((processInfo) => processInfo.status === 'running')
        .map((processInfo) => processInfo.task);

  const stopped = [];
  const failures = [];
  const runIndex = safeReadRunIndex();
  for (const name of names) {
    const processInfo = state.processes[name];
    if (!processInfo) {
      assertNoExternalDeclaredOwner(projectRoot, name, runIndex);
      continue;
    }
    if (processInfo.status === 'running') {
      const run = findRunForProcess(runIndex, projectRoot, name, processInfo);
      const ownershipProof = assertVerifiedStopOwnership(projectRoot, name, processInfo, run);
      processInfo.status = 'stopping';
      processInfo.ownershipConfidence = ownershipProof.confidence;
      processInfo.ownershipProof = ownershipProof;
      updateRunInIndex(run?.runId ?? processInfo.runId, {
        status: 'stopping',
        ownershipConfidence: ownershipProof.confidence,
        ownershipProof
      });
      try {
        const result = stopOwnedProcessTreeSync(processInfo.pid);
        const stopped = waitForProcessStopSync(processInfo.pid);
        if (!stopped) {
          const evidence = collectStopFailureEvidence(processInfo, result);
          throw new LaunchdeckError('stop_failed', `Failed to stop task '${name}'.`, {
            task: name,
            pid: processInfo.pid,
            status: result.status,
            ...evidence
          });
        }
        if (options.verifyPortRelease !== false) {
          const declaredPorts = (processInfo.ports ?? []).filter(Number.isInteger);
          if (!waitForDeclaredPortsFreeStableSync(declaredPorts)) {
            const evidence = collectStopFailureEvidence(processInfo, result, declaredPorts);
            throw new LaunchdeckError('stop_failed', `Task '${name}' stopped but left declared ports listening.`, {
              task: name,
              pid: processInfo.pid,
              status: 'declared_ports_still_listening',
              ...evidence
            });
          }
        }
      } catch (error) {
        processInfo.status = 'stop_failed';
        processInfo.stoppedAt = new Date().toISOString();
        processInfo.lastError = toRuntimeErrorRecord(error);
        updateRunInIndex(run?.runId ?? processInfo.runId, {
          status: 'stop_failed',
          stoppedAt: processInfo.stoppedAt,
          lastError: processInfo.lastError,
          ownershipConfidence: ownershipProof.confidence,
          ownershipProof
        });
        appendLifecycleEvent(projectRoot, processInfo, 'stop.failed', 'error', error?.code ?? 'stop_failed', {
          ownershipProof
        });
        failures.push({ task: name, error });
        stopped.push(processInfo);
        continue;
      }
    }
    processInfo.status = 'stopped';
    processInfo.stoppedAt = new Date().toISOString();
    delete processInfo.lastError;
    updateRunInIndex(processInfo.runId, {
      status: 'stopped',
      stoppedAt: processInfo.stoppedAt
    });
    appendLifecycleEvent(projectRoot, processInfo, 'stop.stopped', 'info');
    stopped.push(processInfo);
  }

  writeState(projectRoot, state);
  if (failures.length > 0) {
    const [failure] = failures;
    if (failures.length === 1) {
      throw failure.error;
    }
    throw new LaunchdeckError('partial_failure', 'One or more managed processes could not be stopped.', {
      failures: failures.map((failureInfo) => ({
        task: failureInfo.task,
        error: toRuntimeErrorRecord(failureInfo.error)
      }))
    });
  }
  return stopped;
}

export function waitForDeclaredPortsFree(ports, options = {}) {
  const normalizedPorts = (ports ?? []).filter(Number.isInteger);
  const timeoutMs = options.timeoutMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const occupied = normalizedPorts.filter((port) => isTcpPortOccupiedSync(port));
    if (occupied.length === 0) {
      return {
        ok: true,
        ports: normalizedPorts
      };
    }
    sleepSync(STOP_VERIFY_POLL_MS);
  }
  const occupied = normalizedPorts.filter((port) => isTcpPortOccupiedSync(port));
  if (occupied.length > 0) {
    throw new LaunchdeckError('port_release_timeout', 'Timed out waiting for declared ports to be released.', {
      ports: normalizedPorts,
      occupied
    });
  }
  return {
    ok: true,
    ports: normalizedPorts
  };
}

export function tailLog(projectRoot, taskName, lines = 80) {
  const state = refreshState(projectRoot);
  const processInfo = state.processes[taskName];
  const logPath = processInfo?.logPath ?? path.join(runtimePaths(projectRoot).logsDir, `${taskName}.log`);

  assertInsideProject(projectRoot, logPath, `Task '${taskName}' log`, 'project_root_escape');
  if (!fs.existsSync(logPath)) {
    throw new LaunchdeckError('log_not_found', `No log file found for task '${taskName}'.`, {
      task: taskName,
      logPath
    });
  }

  const content = fs.readFileSync(logPath, 'utf8');
  const lineList = content.split(/\r?\n/);
  return {
    taskName,
    logPath,
    content: lineList.slice(Math.max(0, lineList.length - lines)).join('\n')
  };
}

export function resolveCleanTargets(projectRoot, clean, mode = 'safe') {
  const cleanConfig = clean ?? { safe: [], risky: [] };
  const safeEntries = Array.isArray(cleanConfig.safe) ? cleanConfig.safe : [];
  const riskyEntries = Array.isArray(cleanConfig.risky) ? cleanConfig.risky : [];
  const legacyThrowMode = [...safeEntries, ...riskyEntries].some(isLegacyCleanEntry);
  const entries = mode === 'all'
    ? [...withCleanKind(safeEntries, 'safe'), ...withCleanKind(riskyEntries, 'risky')]
    : withCleanKind(safeEntries, 'safe');

  const plan = entries.map((entry) =>
    planCleanTarget(projectRoot, entry.rawPath ?? entry.path, {
      kind: entry.kind,
      description: entry.description,
      label: `Clean path '${entry.rawPath ?? entry.path ?? ''}'`
    })
  );

  if (legacyThrowMode) {
    const refused = plan.find((target) => target.status === 'refused');
    if (refused) {
      throw cleanRefusalError(refused);
    }
  }

  return plan;
}

export function buildSafeCleanPlan(config, options = {}) {
  const protectedPaths = collectProtectedEvidencePaths(config, options);
  const safePlan = applyCleanRetention(
    resolveCleanTargets(config.projectRoot, config.clean, 'safe'),
    protectedPaths
  );
  const allPlan = resolveCleanTargets(config.projectRoot, config.clean, 'all');
  return {
    version: 1,
    configDigest: digestCleanConfiguration(config.clean),
    targets: safePlan.filter((target) => target.status !== 'refused'),
    refusals: safePlan.filter((target) => target.status === 'refused'),
    protectedPaths,
    excludedRiskyTargets: allPlan.filter((target) => target.kind === 'risky')
  };
}

export function applySafeCleanPlan(plan) {
  if ((plan?.refusals?.length ?? 0) > 0) {
    throw new LaunchdeckError('clean_failed', 'Launchdeck refuses to apply an unsafe clean plan.', {
      refused: plan.refusals
    });
  }
  return cleanTargets(plan?.targets ?? []);
}

export function collectProtectedEvidencePaths(config, options = {}) {
  const env = options.env ?? process.env;
  const protectedPaths = [];
  const localPaths = runtimePaths(config.projectRoot);
  const sharedPaths = controlPlanePaths(env);

  for (const candidate of [
    localPaths.statePath,
    sharedPaths.registryPath,
    sharedPaths.runsPath,
    sharedPaths.eventsPath,
    path.join(sharedPaths.runtimeDir, 'operations')
  ]) {
    if (fs.existsSync(candidate)) protectedPaths.push(candidate);
  }

  try {
    const state = readState(config.projectRoot);
    for (const processInfo of Object.values(state.processes ?? {})) {
      if (ACTIVE_RUN_STATUSES.has(processInfo.status) && processInfo.logPath) {
        protectedPaths.push(processInfo.logPath);
      }
    }
  } catch {
    // Safe clean remains conservative with every readable evidence source.
  }

  const runIndex = safeReadRunIndex(env);
  for (const run of runIndex.runs ?? []) {
    if (!samePath(run.projectRoot, config.projectRoot) || !run.logPath) continue;
    if (ACTIVE_RUN_STATUSES.has(run.status) || ['failed', 'stop_failed', 'stale'].includes(run.status)) {
      protectedPaths.push(run.logPath);
    }
  }

  for (const event of readRecentRuntimeEvents(sharedPaths.eventsPath, 1_000)) {
    const logPath = event?.data?.logPath;
    if (
      typeof logPath === 'string'
      && ['failed', 'stop_failed'].includes(event.status)
      && isInsidePath(config.projectRoot, logPath)
    ) {
      protectedPaths.push(logPath);
    }
  }

  try {
    if (fs.existsSync(localPaths.logsDir)) {
      for (const entry of fs.readdirSync(localPaths.logsDir)) {
        const candidate = path.join(localPaths.logsDir, entry);
        if (entry.includes('failed') && fs.statSync(candidate).isFile()) {
          protectedPaths.push(candidate);
        }
      }
    }
  } catch {
    // Failure-log filename fallback is a retention hint only.
  }

  return uniqueCleanPaths(protectedPaths)
    .filter((candidate) => isInsidePath(config.projectRoot, candidate));
}

export function cleanTargets(targets) {
  const refused = targets.filter((target) => target.status === 'refused');
  if (refused.length > 0) {
    throw new LaunchdeckError('clean_failed', 'Launchdeck refuses to clean because one or more targets are unsafe.', {
      refused: refused.map((target) => ({
        rawPath: target.rawPath ?? target.path,
        resolvedPath: target.resolvedPath ?? target.absolutePath,
        canonicalPath: target.canonicalPath,
        refusalCode: target.refusalCode
      }))
    });
  }

  return targets.map((target) => {
    if (target.status === 'skipped_missing') {
      return {
        ...target,
        existed: false,
        status: 'skipped_missing'
      };
    }

    const targetPath = target.absolutePath ?? target.resolvedPath;
    const existed = fs.existsSync(targetPath);
    if (!existed) {
      return {
        ...target,
        existed: false,
        exists: false,
        status: 'skipped_missing'
      };
    }

    try {
      if (Array.isArray(target.protectedPaths) && target.protectedPaths.length > 0 && fs.statSync(targetPath).isDirectory()) {
        cleanDirectoryPreserving(targetPath, target.protectedPaths);
      } else {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
    } catch (error) {
      throw new LaunchdeckError('clean_failed', `Failed to clean target '${target.rawPath ?? target.path}'.`, {
        rawPath: target.rawPath ?? target.path,
        resolvedPath: target.resolvedPath ?? target.absolutePath,
        canonicalPath: target.canonicalPath,
        causeMessage: error.message
      });
    }

    return {
      ...target,
      existed,
      exists: true,
      status: target.protectedPaths?.length > 0 ? 'partially_removed' : 'removed'
    };
  });
}

export function assertInsideProject(projectRoot, targetPath, label = 'Path', code = 'path_outside_project') {
  return assertContainedPath(projectRoot, targetPath, { label, code });
}

export function isPidRunning(pid) {
  return adapterIsPidRunning(pid);
}

function createEmptyState(projectRoot) {
  return {
    version: STATE_VERSION,
    projectRoot: path.resolve(projectRoot),
    updatedAt: new Date().toISOString(),
    processes: {}
  };
}

function assertNoExternalDeclaredOwner(projectRoot, taskName, runIndex) {
  if (!taskName) {
    return;
  }

  const config = safeLoadConfig(projectRoot);
  const task = config?.tasks?.[taskName];
  const activeRun = findActiveRunForTask(runIndex, projectRoot, taskName);
  if (activeRun) {
    const proof = proveOwnershipForRun(activeRun);
    throw ownershipRefusalError(projectRoot, taskName, activeRun, proof);
  }

  const occupiedPorts = (task?.ports ?? [])
    .filter(Number.isInteger)
    .map((port) => ({
      port,
      listeners: safeListPortListeners(port)
    }))
    .filter((entry) => entry.listeners.length > 0);
  if (occupiedPorts.length === 0) {
    return;
  }

  const [first] = occupiedPorts;
  throw new LaunchdeckError('external_process', `Launchdeck refuses to stop '${taskName}' because port ${first.port} is owned by an external process.`, {
    projectRoot: path.resolve(projectRoot),
    task: taskName,
    port: first.port,
    listeners: first.listeners,
    next: [
      {
        label: 'Inspect port',
        command: `launchdeck inspect port:${first.port}`,
        reason: 'Shows listener and ownership evidence for this port.',
        risk: 'safe'
      }
    ]
  });
}

function withLifecycleLocksSync(projectRoot, taskName, callback) {
  const projectId = stableProjectId(projectRoot);
  return withMutationLocksSync({
    operationId: `op_${crypto.randomUUID().replaceAll('-', '')}`,
    projectId,
    taskRef: taskName,
    env: process.env,
    ownerCommand: process.argv.join(' ')
  }, callback);
}

function assertVerifiedStopOwnership(projectRoot, taskName, processInfo, run) {
  if (run?.ownershipConfidence && run.ownershipConfidence !== OWNERSHIP_CONFIDENCE.VERIFIED_OWNED) {
    throw ownershipRefusalError(projectRoot, taskName, run, run.ownershipProof);
  }

  const runForProof = withLocalOwnershipEvidence(run ?? runFromLocalProcess(projectRoot, taskName, processInfo), processInfo);
  const proof = proveOwnershipForRun(runForProof, processInfo.ports ?? []);
  if (proof.confidence === OWNERSHIP_CONFIDENCE.VERIFIED_OWNED) {
    return {
      ...proof,
      confidence: OWNERSHIP_CONFIDENCE.VERIFIED_OWNED
    };
  }
  if (hasTrustedSpawnOwnershipProof(runForProof, processInfo, proof)) {
    return {
      ...proof,
      confidence: OWNERSHIP_CONFIDENCE.VERIFIED_OWNED,
      trustedOwnershipProof: runForProof.ownershipProof,
      reasons: [
        ...(proof.reasons ?? []),
        'launchdeck_spawn_ownership_proof'
      ]
    };
  }

  throw ownershipRefusalError(projectRoot, taskName, runForProof, proof);
}

function proveOwnershipForRun(run, ports = undefined) {
  const declaredPorts = ports ?? run?.declaredPorts ?? run?.ports ?? [];
  const listeners = declaredPorts.flatMap((port) => safeListPortListeners(port));
  return proveRunOwnership(run, {
    listeners,
    processEvidenceCache: new Map()
  });
}

function hasTrustedSpawnOwnershipProof(run, processInfo, proof) {
  if (!run || !proof?.processAlive || !ACTIVE_RUN_STATUSES.has(run.status)) {
    return false;
  }
  if (!run.runId || !run.projectId || !run.launchdeckHome || !Number.isInteger(Number(run.pid))) {
    return false;
  }
  if (proof.confidence === OWNERSHIP_CONFIDENCE.EXTERNAL || proof.reasons?.includes('listener_pid_differs_from_run')) {
    return false;
  }
  const storedProof = run.ownershipProof;
  if (!isTrustedSpawnOwnershipProof(storedProof)) {
    return false;
  }
  if (storedProof.confidence !== OWNERSHIP_CONFIDENCE.VERIFIED_OWNED) {
    return false;
  }
  if (storedProof.runId !== run.runId || storedProof.projectId !== run.projectId || storedProof.task !== run.task) {
    return false;
  }
  if (Number(storedProof.pid) !== Number(run.pid) || Number(processInfo?.pid) !== Number(run.pid)) {
    return false;
  }
  if (storedProof.startedAt !== run.startedAt || storedProof.command !== run.command || !samePath(storedProof.cwd, run.cwd)) {
    return false;
  }
  return proof.confidence === OWNERSHIP_CONFIDENCE.UNKNOWN
    || proof.confidence === OWNERSHIP_CONFIDENCE.PROBABLE_OWNED;
}

function isTrustedSpawnOwnershipProof(proof) {
  return proof?.source === 'launchdeck-spawn'
    && proof?.confidence === OWNERSHIP_CONFIDENCE.VERIFIED_OWNED
    && proof?.reasons?.includes('launchdeck_spawned_process')
    && typeof proof.createdAt === 'string'
    && typeof proof.startedAt === 'string';
}

function hasTrustedSpawnRecord(run, processInfo) {
  const proof = run?.ownershipProof ?? processInfo?.ownershipProof;
  return Boolean(
    run
    && processInfo
    && isTrustedSpawnOwnershipProof(proof)
    && proof.runId === run.runId
    && proof.projectId === run.projectId
    && proof.task === run.task
    && Number(proof.pid) === Number(run.pid)
    && Number(processInfo.pid) === Number(run.pid)
    && proof.startedAt === run.startedAt
    && proof.command === run.command
    && samePath(proof.cwd, run.cwd)
  );
}

function withLocalOwnershipEvidence(run, processInfo) {
  if (!run) {
    return run;
  }
  return {
    ...run,
    ownershipConfidence: run.ownershipConfidence ?? processInfo?.ownershipConfidence,
    ownershipProof: run.ownershipProof ?? processInfo?.ownershipProof
  };
}

function ownershipRefusalError(projectRoot, taskName, run, proof = undefined) {
  const confidence = proof?.confidence ?? run?.ownershipConfidence ?? OWNERSHIP_CONFIDENCE.UNKNOWN;
  const target = `${run?.projectAlias ?? run?.projectId ?? path.basename(projectRoot)}:${taskName}`;
  const next = [
    {
      label: 'Inspect target',
      command: `launchdeck inspect task:${target}`,
      reason: 'Shows current process, port, and ownership evidence.',
      risk: 'safe'
    },
    {
      label: 'Reconcile state',
      command: `launchdeck reconcile ${target}`,
      reason: 'Refreshes stale Launchdeck state without stopping unknown processes.',
      risk: 'safe'
    }
  ];
  if (confidence === OWNERSHIP_CONFIDENCE.EXTERNAL) {
    return new LaunchdeckError('external_process', `Launchdeck refuses to stop '${taskName}' because the current process is external.`, {
      projectRoot: path.resolve(projectRoot),
      task: taskName,
      run,
      ownershipProof: proof,
      next
    });
  }
  if (confidence === OWNERSHIP_CONFIDENCE.UNKNOWN) {
    return new LaunchdeckError('unknown_process_owner', `Launchdeck refuses to stop '${taskName}' because process ownership is unknown.`, {
      projectRoot: path.resolve(projectRoot),
      task: taskName,
      run,
      ownershipProof: proof,
      next
    });
  }
  return new LaunchdeckError('ownership_not_verified', `Launchdeck refuses to stop '${taskName}' without verified ownership.`, {
    projectRoot: path.resolve(projectRoot),
    task: taskName,
    run,
    ownershipProof: proof,
    next
  });
}

function ownershipClassification(code, confidence) {
  if (code === 'external_process' || confidence === OWNERSHIP_CONFIDENCE.EXTERNAL) return 'external';
  if (confidence === OWNERSHIP_CONFIDENCE.VERIFIED_OWNED) return 'verified';
  if (confidence === 'mismatch') return 'mismatch';
  return 'unknown';
}

function safeReadRunIndex(env = process.env) {
  const runsPath = controlPlanePaths(env).runsPath;
  if (!fs.existsSync(runsPath)) {
    return { version: RUN_INDEX_VERSION, runs: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(runsPath, 'utf8'));
    if (parsed?.version === RUN_INDEX_VERSION && Array.isArray(parsed.runs)) {
      return parsed;
    }
  } catch {
    return { version: RUN_INDEX_VERSION, runs: [] };
  }
  return { version: RUN_INDEX_VERSION, runs: [] };
}

function writeRunIndex(runIndex, env = process.env) {
  const runsPath = controlPlanePaths(env).runsPath;
  fs.mkdirSync(path.dirname(runsPath), { recursive: true });
  const tempPath = `${runsPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify({
    version: RUN_INDEX_VERSION,
    updatedAt: new Date().toISOString(),
    runs: runIndex.runs
  }, null, 2)}\n`);
  fs.renameSync(tempPath, runsPath);
}

function updateRunInIndex(runId, patch, env = process.env) {
  if (!runId) {
    return undefined;
  }
  const runIndex = safeReadRunIndex(env);
  let updated;
  const runs = runIndex.runs.map((run) => {
    if (run.runId !== runId) {
      return run;
    }
    updated = {
      ...run,
      ...patch,
      lastObservedAt: new Date().toISOString()
    };
    return updated;
  });
  if (!updated) {
    return undefined;
  }
  writeRunIndex({ ...runIndex, runs }, env);
  return updated;
}

function findRunForProcess(runIndex, projectRoot, taskName, processInfo) {
  const candidates = (runIndex.runs ?? []).filter((run) =>
    run.task === taskName
    && samePath(run.projectRoot, projectRoot)
    && (
      run.runId === processInfo.runId
      || Number(run.pid) === Number(processInfo.pid)
      || (ACTIVE_RUN_STATUSES.has(run.status) && !processInfo.runId)
    )
  );
  return candidates.sort(compareRunFreshness)[0];
}

function findActiveRunForTask(runIndex, projectRoot, taskName) {
  const candidates = (runIndex.runs ?? []).filter((run) =>
    run.task === taskName
    && samePath(run.projectRoot, projectRoot)
    && ACTIVE_RUN_STATUSES.has(run.status)
  );
  return candidates.sort(compareRunFreshness)[0];
}

function compareRunFreshness(left, right) {
  return timestampMs(right.lastObservedAt) - timestampMs(left.lastObservedAt)
    || timestampMs(right.startedAt) - timestampMs(left.startedAt)
    || String(right.runId ?? '').localeCompare(String(left.runId ?? ''));
}

function runFromLocalProcess(projectRoot, taskName, processInfo) {
  return {
    runId: processInfo.runId,
    transactionId: processInfo.transactionId,
    projectId: processInfo.projectId,
    projectAlias: processInfo.projectAlias,
    projectRoot,
    task: taskName,
    command: processInfo.command,
    cwd: processInfo.cwd,
    pid: processInfo.pid,
    status: processInfo.status,
    declaredPorts: processInfo.ports ?? [],
    logPath: processInfo.logPath,
    startedAt: processInfo.startedAt,
    launchdeckHome: processInfo.launchdeckHome
  };
}

function appendLifecycleEvent(projectRoot, processInfo, type, level, code = undefined, data = undefined) {
  if (!processInfo.launchdeckHome) {
    return;
  }
  appendEvent({
    homeDir: processInfo.launchdeckHome,
    transactionId: processInfo.transactionId,
    type,
    level,
    code,
    projectId: processInfo.projectId,
    alias: processInfo.projectAlias,
    task: processInfo.task,
    runId: processInfo.runId,
    status: processInfo.status,
    message: `${processInfo.task} ${processInfo.status}.`,
    data: {
      projectRoot,
      pid: processInfo.pid,
      ...data
    },
    next: processInfo.status === 'stop_failed'
      ? [{
          label: 'Inspect target',
          command: `launchdeck inspect run:${processInfo.runId}`,
          reason: 'Shows current ownership and process evidence after the failed stop.',
          risk: 'safe'
        }]
      : []
  });
}

function safeLoadConfig(projectRoot) {
  try {
    return loadConfig(projectRoot);
  } catch {
    return undefined;
  }
}

function safeListPortListeners(port) {
  try {
    return listPortListeners({ port }).filter((listener) => listener.protocol !== 'udp');
  } catch {
    return [];
  }
}

function isTcpPortOccupiedSync(port) {
  return safeListPortListeners(port).length > 0;
}

function timestampMs(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function stableProjectId(projectRoot) {
  const key = process.platform === 'win32'
    ? path.resolve(projectRoot).toLowerCase()
    : path.resolve(projectRoot);
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
}

function makeRuntimeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function samePath(left, right) {
  if (!left || !right) {
    return false;
  }
  return isSamePath(left, right);
}

function withCleanKind(entries, kind) {
  return entries.map((entry) => {
    if (typeof entry === 'string') {
      return { kind, rawPath: entry, path: entry };
    }
    return {
      ...entry,
      kind: entry.kind ?? kind,
      rawPath: entry.rawPath ?? entry.path,
      path: entry.path ?? entry.rawPath
    };
  });
}

function isLegacyCleanEntry(entry) {
  return entry && typeof entry === 'object' && !Array.isArray(entry) && !entry.kind && !entry.rawPath;
}

function cleanRefusalError(target) {
  const rawPath = target.rawPath ?? target.path;
  if (target.refusalCode === 'clean_target_root') {
    return new LaunchdeckError('clean_target_root', 'Launchdeck refuses to clean the project root.', {
      rawPath,
      resolvedPath: target.resolvedPath ?? target.absolutePath,
      canonicalPath: target.canonicalPath
    });
  }
  if (target.refusalCode === 'clean_target_outside_project') {
    return new LaunchdeckError('clean_target_outside_project', `Clean target '${rawPath}' must stay inside the project root.`, {
      rawPath,
      resolvedPath: target.resolvedPath ?? target.absolutePath,
      canonicalPath: target.canonicalPath
    });
  }
  if (target.refusalCode === 'clean_target_empty') {
    return new LaunchdeckError('clean_target_empty', 'Clean target must be a non-empty path.', {
      rawPath
    });
  }
  return new LaunchdeckError('clean_target_ambiguous', `Clean target '${rawPath}' cannot be proven safe.`, {
    rawPath,
    resolvedPath: target.resolvedPath ?? target.absolutePath,
    canonicalPath: target.canonicalPath
  });
}

function applyCleanRetention(targets, protectedPaths) {
  if (protectedPaths.length === 0) return targets;
  return targets.map((target) => {
    const targetPath = target.absolutePath ?? target.resolvedPath;
    if (!targetPath || target.status === 'refused') return target;
    const protectedInsideTarget = protectedPaths.filter((protectedPath) =>
      samePath(protectedPath, targetPath) || isInsidePath(targetPath, protectedPath)
    );
    if (protectedInsideTarget.length === 0) return target;
    return {
      ...target,
      retention: {
        policy: 'preserve-running-and-failure-evidence',
        reason: 'Safe clean preserves shared state, active run evidence, and latest failure evidence.',
        protectedPaths: protectedInsideTarget
      },
      protectedPaths: protectedInsideTarget
    };
  });
}

function digestCleanConfiguration(clean = {}) {
  const normalizeEntries = (entries) => (Array.isArray(entries) ? entries : [])
    .map((entry) => typeof entry === 'string' ? { rawPath: entry } : stableCleanValue(entry))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const snapshot = {
    safe: normalizeEntries(clean.safe),
    risky: normalizeEntries(clean.risky)
  };
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}`;
}

function stableCleanValue(value) {
  if (Array.isArray(value)) return value.map(stableCleanValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableCleanValue(value[key])])
  );
}

function readRecentRuntimeEvents(eventPath, limit) {
  if (!fs.existsSync(eventPath)) return [];
  try {
    const events = fs.readFileSync(eventPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
    return events.slice(Math.max(0, events.length - limit));
  } catch {
    return [];
  }
}

function uniqueCleanPaths(paths) {
  const seen = new Set();
  return paths
    .filter((entry) => typeof entry === 'string' && entry)
    .filter((entry) => {
      const normalized = normalizePath(entry);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .sort((left, right) => normalizePath(left).localeCompare(normalizePath(right)));
}

function cleanDirectoryPreserving(targetPath, protectedPaths) {
  const protectedSet = new Set(protectedPaths.map((entry) => normalizePath(entry)));
  const protectedAncestors = new Set();
  for (const protectedPath of protectedSet) {
    let current = path.dirname(protectedPath);
    while (isInsidePath(targetPath, current)) {
      protectedAncestors.add(current);
      if (samePath(current, targetPath)) {
        break;
      }
      current = path.dirname(current);
    }
  }

  cleanDirectoryChildren(targetPath, protectedSet, protectedAncestors);
}

function cleanDirectoryChildren(directoryPath, protectedSet, protectedAncestors) {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    const normalizedEntry = normalizePath(entryPath);
    if (protectedSet.has(normalizedEntry)) {
      continue;
    }
    if (entry.isDirectory() && protectedAncestors.has(normalizedEntry)) {
      cleanDirectoryChildren(entryPath, protectedSet, protectedAncestors);
      if (fs.readdirSync(entryPath).length === 0 && !protectedSet.has(normalizedEntry)) {
        fs.rmSync(entryPath, { force: true });
      }
      continue;
    }
    fs.rmSync(entryPath, { recursive: true, force: true });
  }
}

function normalizePath(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isInsidePath(rootPath, targetPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateRuntimeState(state, projectRoot, statePath) {
  if (!isPlainObject(state)) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (state.version !== STATE_VERSION) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (typeof state.projectRoot !== 'string' || !samePath(state.projectRoot, projectRoot)) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (typeof state.updatedAt !== 'string' || !state.updatedAt) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (!isPlainObject(state.processes)) {
    throw invalidRuntimeState(statePath, projectRoot);
  }

  for (const [taskName, processInfo] of Object.entries(state.processes)) {
    validateProcessRecord(taskName, processInfo, projectRoot, statePath);
  }
}

function validateProcessRecord(taskName, processInfo, projectRoot, statePath) {
  if (!isPlainObject(processInfo)) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (processInfo.task !== taskName || typeof processInfo.task !== 'string' || !processInfo.task) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (typeof processInfo.command !== 'string' || !processInfo.command) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (typeof processInfo.cwd !== 'string' || !processInfo.cwd) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (!Number.isInteger(processInfo.pid)) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (!Array.isArray(processInfo.ports) || !processInfo.ports.every(Number.isInteger)) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (typeof processInfo.logPath !== 'string' || !processInfo.logPath) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (typeof processInfo.startedAt !== 'string' || !processInfo.startedAt) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (typeof processInfo.lastRefresh !== 'string' || !processInfo.lastRefresh) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
  if (!PROCESS_STATUSES.has(processInfo.status)) {
    throw invalidRuntimeState(statePath, projectRoot);
  }
}

function invalidRuntimeState(statePath, projectRoot, cause = undefined) {
  return new LaunchdeckError('runtime_state_invalid', `Runtime state is invalid: ${statePath}`, {
    statePath,
    projectRoot: path.resolve(projectRoot),
    causeMessage: cause?.message,
    causeCode: cause?.code
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toRuntimeErrorRecord(error) {
  return {
    code: error?.code ?? 'internal_error',
    message: error?.message ?? String(error)
  };
}

function stopOwnedProcessTreeSync(pid) {
  if (process.platform !== 'win32') {
    return stopProcessTreeSync(pid, { force: false });
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error?.code === 'ESRCH') {
      return {
        pid,
        ok: true,
        status: 'stopped',
        alreadyStopped: true,
        method: 'process_signal'
      };
    }
    throw new LaunchdeckError('stop_failed', 'Failed to signal managed process.', {
      pid,
      method: 'process_signal',
      causeCode: error?.code,
      causeMessage: error?.message
    });
  }

  return {
    pid,
    ok: !isPidRunning(pid),
    status: isPidRunning(pid) ? 'stop_failed' : 'stopped',
    method: 'process_signal'
  };
}

function collectStopFailureEvidence(processInfo, stopResult, ports = processInfo.ports ?? []) {
  const pid = Number(processInfo.pid);
  const declaredPorts = (ports ?? []).filter(Number.isInteger);
  const portEvidence = declaredPorts
    .map((port) => ({
      port,
      listeners: safeListPortListeners(port)
    }))
    .filter((entry) => entry.listeners.length > 0);

  return {
    stopResult,
    processAlive: Number.isInteger(pid) ? isPidRunning(pid) : false,
    liveness: getLiveness(pid),
    declaredPorts,
    portEvidence
  };
}

function waitForDeclaredPortsFreeStableSync(ports, options = {}) {
  const {
    timeoutMs = STOP_VERIFY_TIMEOUT_MS,
    stableMs = 250,
    pollMs = STOP_VERIFY_POLL_MS
  } = options;
  const normalizedPorts = (ports ?? []).filter(Number.isInteger);
  if (normalizedPorts.length === 0) {
    return true;
  }

  const deadline = Date.now() + timeoutMs;
  let freeSince;
  while (Date.now() <= deadline) {
    const occupied = normalizedPorts.some((port) => isTcpPortOccupiedSync(port));
    if (!occupied) {
      freeSince ??= Date.now();
      if (Date.now() - freeSince >= stableMs) {
        return true;
      }
    } else {
      freeSince = undefined;
    }
    sleepSync(pollMs);
  }
  return false;
}

function waitForProcessStopSync(pid) {
  const deadline = Date.now() + STOP_VERIFY_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    if (!isPidRunning(pid)) {
      return true;
    }
    sleepSync(STOP_VERIFY_POLL_MS);
  }
  return !isPidRunning(pid);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
