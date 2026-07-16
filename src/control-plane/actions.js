import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FILES, loadConfig } from '../config.js';
import { LaunchdeckError } from '../errors.js';
import { listProcesses, readState, stopManagedTasks, waitForDeclaredPortsFree, writeState } from '../runtime.js';
import { appendEvent } from './events.js';
import { withLock } from './locks.js';
import { createRunContext, observedRun, readRunIndex, startManagedRun, updateRunRecord } from './runs.js';
import {
  assertAliasAvailable,
  controlPlanePaths,
  normalizeProjectRegistration,
  readRegistryState,
  updateRegistryState,
  writeRegistryState
} from './state.js';

const DEFAULT_SCAN_MAX_DEPTH = 5;
const DEFAULT_SCAN_MAX_DIRS = 2_000;
const DEFAULT_SCAN_MAX_PROJECTS = 100;
const ACTIVE_RUN_STATUSES = new Set(['starting', 'running', 'ready', 'stopping']);
const SCAN_IGNORED_DIRS = new Set([
  '.git',
  '.hg',
  '.launchdeck',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'venv',
  'vendor'
]);

export function readProjectRegistry(env = process.env) {
  return withLegacyProjectMirrors(readRegistryState(env));
}

export function writeProjectRegistry(registry, env = process.env) {
  return withLegacyProjectMirrors(writeRegistryState(registry, env));
}

export async function addProjectToRegistry(config, options = {}) {
  const env = options.env ?? process.env;
  return withRegistryLock(env, async () => {
    const registry = readRegistryState(env);
    const now = new Date().toISOString();
    const projectRoot = path.resolve(config.projectRoot);
    const key = projectKey(projectRoot);
    const existingIndex = registry.projects.findIndex((project) => projectKey(project.projectRoot) === key);
    const existing = existingIndex === -1 ? undefined : registry.projects[existingIndex];
    const alias = options.alias ?? existing?.alias ?? options.name ?? config.project.name;
    assertAliasAvailable(registry.projects, alias, existing?.projectId);
    const project = normalizeProjectRegistration({
      projectId: existing?.projectId ?? existing?.id ?? projectId(projectRoot),
      id: existing?.id,
      key,
      alias,
      name: options.name ?? config.project.name,
      projectRoot,
      configPath: path.resolve(config.configPath),
      status: 'active',
      addedAt: existing?.addedAt ?? now,
      updatedAt: now,
      lastSeenAt: now
    });

    const projects = [...registry.projects];
    if (existingIndex === -1) {
      projects.push(project);
    } else {
      projects[existingIndex] = project;
    }

    writeRegistryState({
      ...registry,
      projects: sortProjects(projects)
    }, env);
    return withRegistryAction(withLegacyProjectMirror(project), existingIndex === -1 ? 'created' : 'updated');
  });
}

export async function removeProjectFromRegistry(target, options = {}) {
  const env = options.env ?? process.env;
  const project = resolveRegisteredProject(target, env);
  return withRegistryLock(env, async () =>
    withProjectLock(project.projectId, env, async () => {
      const activeRuns = findActiveOwnedRuns(project, env);
      if (activeRuns.length > 0) {
        throw new LaunchdeckError(
          'project_has_active_runs',
          `Project '${project.alias}' has active Launchdeck-owned runs and cannot be removed.`,
          {
            project: projectSummary(project),
            activeRuns,
            next: activeProjectRemoveActions(project, activeRuns)
          }
        );
      }

      const registry = readProjectRegistry(env);
      const nextProjects = registry.projects.filter((candidate) =>
        candidate.projectId !== project.projectId && candidate.id !== project.id
      );
      writeProjectRegistry({
        ...registry,
        projects: nextProjects
      }, env);
      return project;
    })
  );
}

export function listRegisteredProjects(env = process.env) {
  return sortProjects(readProjectRegistry(env).projects);
}

export async function stopManagedRun(target, options = {}) {
  const env = options.env ?? process.env;
  const { projectTarget, taskName } = parseLifecycleTarget(target);
  const project = resolveRegisteredProject(projectTarget, env);
  const config = loadConfig(project.projectRoot);
  return withProjectLock(project.projectId, env, async () =>
    withTaskLock(project.projectId, taskName, env, async () => {
      const stopped = stopManagedTasks(config.projectRoot, taskName, {
        locks: false,
        verifyPortRelease: true
      });
      return {
        project: projectSummary(project),
        task: taskName,
        stopped,
        failed: []
      };
    })
  );
}

export async function restartManagedRun(target, options = {}) {
  const env = options.env ?? process.env;
  const { projectTarget, taskName } = parseLifecycleTarget(target);
  const project = resolveRegisteredProject(projectTarget, env);
  const config = loadConfig(project.projectRoot);
  const task = config.tasks[taskName];
  if (!task) {
    throw new LaunchdeckError('task_not_found', `Task '${taskName}' is not configured in ${config.configPath}.`, {
      task: taskName,
      projectRoot: config.projectRoot,
      configPath: config.configPath
    });
  }
  if (!task.longRunning) {
    throw new LaunchdeckError('task_not_managed', `Task '${taskName}' is not configured as a managed task.`, {
      task: taskName,
      projectRoot: config.projectRoot,
      configPath: config.configPath
    });
  }

  const runContext = createRunContext({ project, config, taskName, env });
  return withProjectLock(project.projectId, env, async () =>
    withTaskLock(project.projectId, taskName, env, async () => {
      const [stoppedRun] = await stopOwnedRunForRestart(config, taskName, env);
      try {
        waitForDeclaredPortsFree(task.ports ?? [], {
          timeoutMs: options.portReleaseTimeoutMs
        });
      } catch (error) {
        error.details = {
          ...error.details,
          projectRoot: config.projectRoot,
          configPath: config.configPath,
          task: taskName,
          runId: stoppedRun?.runId,
          next: [
            {
              label: 'Inspect port ownership',
              command: `launchdeck inspect task:${project.alias}:${taskName}`,
              reason: 'Shows listener evidence for ports that did not release.',
              risk: 'safe'
            }
          ]
        };
        await markRestartPortReleaseTimeout(config, project, taskName, stoppedRun, error, env);
        throw error;
      }
      const startedRun = await startManagedRun(taskName, task, config, {
        project,
        global: true,
        env,
        runContext,
        locks: false
      });
      return {
        project: projectSummary(project),
        task: taskName,
        transactionId: runContext.transactionId,
        stoppedRun: {
          ...stoppedRun,
          transactionId: runContext.transactionId
        },
        startedRun
      };
    })
  );
}

export async function repairProjectRegistration(target, options = {}) {
  const env = options.env ?? process.env;
  const project = resolveRegisteredProject(target, env);
  const before = { ...project };
  const nextProjectRoot = options.projectRoot ? path.resolve(options.projectRoot) : project.projectRoot;
  const nextConfigPath = options.configPath ? path.resolve(options.configPath) : project.configPath;
  const nextAlias = options.alias ?? project.alias;
  const changes = [];
  const validatedConfig = loadConfig(path.dirname(nextConfigPath));
  if (!samePath(validatedConfig.projectRoot, nextProjectRoot) || !samePath(validatedConfig.configPath, nextConfigPath)) {
    throw new LaunchdeckError('config_not_found', `No Launchdeck config found at ${nextConfigPath}.`, {
      projectRoot: nextProjectRoot,
      configPath: nextConfigPath
    });
  }

  const registry = await withRegistryLock(env, async () =>
    withProjectLock(project.projectId, env, async () =>
      updateRegistryState((current) => {
        const projects = current.projects.map((candidate) =>
          candidate.projectId === project.projectId ? { ...candidate } : candidate
        );
        const index = projects.findIndex((candidate) => candidate.projectId === project.projectId);
        if (index === -1) {
          throw new LaunchdeckError('project_not_found', `No registered project matches '${target}'.`, {
            target
          });
        }

        assertAliasAvailable(projects, nextAlias, project.projectId);
        const currentProject = projects[index];
        const repaired = normalizeProjectRegistration({
          ...currentProject,
          projectId: project.projectId,
          id: currentProject.id ?? project.projectId,
          key: projectKey(nextProjectRoot),
          alias: nextAlias,
          name: currentProject.name,
          projectRoot: nextProjectRoot,
          configPath: nextConfigPath,
          status: 'active',
          updatedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        });

        if (repaired.alias !== currentProject.alias) {
          changes.push('alias');
        }
        if (!samePath(repaired.projectRoot, currentProject.projectRoot)) {
          changes.push('projectRoot');
        }
        if (!samePath(repaired.configPath, currentProject.configPath)) {
          changes.push('configPath');
        }

        projects[index] = repaired;
        return {
          ...current,
          projects
        };
      }, env)
    )
  );

  const after = registry.projects.find((candidate) => candidate.projectId === project.projectId);
  return {
    before,
    after: withLegacyProjectMirror(after),
    changes
  };
}

export async function reconcileManagedRuns(target = undefined, options = {}) {
  const env = options.env ?? process.env;
  const scope = resolveReconcileScope(target, env);
  const reconcile = async () => reconcileRunsInScope(scope, env);

  if (scope.project && scope.taskName) {
    return withProjectLock(scope.project.projectId, env, async () =>
      withTaskLock(scope.project.projectId, scope.taskName, env, reconcile)
    );
  }
  if (scope.project) {
    return withProjectLock(scope.project.projectId, env, reconcile);
  }
  return reconcile();
}

export function resolveRegisteredProject(target, env = process.env) {
  const normalizedTarget = String(target ?? '').trim();
  if (!normalizedTarget) {
    throw new LaunchdeckError('project_not_found', 'Project target is required.');
  }

  const matches = listRegisteredProjects(env).filter((project) =>
    project.projectId === normalizedTarget
    || project.id === normalizedTarget
    || project.alias === normalizedTarget
    || project.name === normalizedTarget
    || path.basename(project.projectRoot) === normalizedTarget
    || samePath(project.projectRoot, normalizedTarget)
  );

  if (matches.length === 0) {
    throw new LaunchdeckError('project_not_found', `No registered project matches '${normalizedTarget}'.`, {
      target: normalizedTarget
    });
  }
  if (matches.length > 1) {
    throw new LaunchdeckError('project_not_found', `Project target '${normalizedTarget}' is ambiguous.`, {
      target: normalizedTarget,
      matches: matches.map(projectSummary)
    });
  }

  return matches[0];
}

export async function scanProjectsIntoRegistry(rootDir, options = {}) {
  const env = options.env ?? process.env;
  const root = path.resolve(rootDir ?? process.cwd());
  const maxDepth = options.maxDepth ?? DEFAULT_SCAN_MAX_DEPTH;
  const maxDirs = options.maxDirs ?? DEFAULT_SCAN_MAX_DIRS;
  const maxProjects = options.maxProjects ?? DEFAULT_SCAN_MAX_PROJECTS;

  if (!fs.existsSync(root)) {
    throw new LaunchdeckError('scan_root_not_found', `Scan root does not exist: ${root}`, {
      root
    });
  }
  if (!fs.statSync(root).isDirectory()) {
    throw new LaunchdeckError('scan_root_invalid', `Scan root is not a directory: ${root}`, {
      root
    });
  }

  const found = [];
  const ignored = [];
  const errors = [];
  let visitedDirs = 0;
  let truncated = false;

  function visit(dir, depth) {
    if (truncated) {
      return;
    }
    if (visitedDirs >= maxDirs || found.length >= maxProjects) {
      truncated = true;
      return;
    }
    visitedDirs += 1;

    const configPath = firstConfigInDir(dir);
    if (configPath) {
      found.push({
        projectRoot: dir,
        configPath
      });
    }

    if (depth >= maxDepth) {
      return;
    }

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      errors.push({
        path: dir,
        code: error?.code ?? 'scan_read_failed',
        message: error?.message ?? String(error)
      });
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.isSymbolicLink?.()) {
        ignored.push({
          path: path.join(dir, entry.name),
          reason: 'symlink'
        });
        continue;
      }
      if (SCAN_IGNORED_DIRS.has(entry.name)) {
        ignored.push({
          path: path.join(dir, entry.name),
          reason: 'generated_or_heavy'
        });
        continue;
      }
      visit(path.join(dir, entry.name), depth + 1);
    }
  }

  visit(root, 0);

  const registered = [];
  for (const candidate of found) {
    try {
      const config = loadConfig(candidate.projectRoot);
      registered.push(await addProjectToRegistry(config, { env }));
    } catch (error) {
      errors.push({
        path: candidate.configPath,
        code: error?.code ?? 'config_invalid',
        message: error?.message ?? String(error)
      });
    }
  }

  return {
    root,
    maxDepth,
    maxDirs,
    maxProjects,
    visitedDirs,
    truncated,
    found,
    registered: sortProjects(registered),
    ignored,
    errors
  };
}

export function findActiveOwnedRuns(project, env = process.env) {
  const active = [];
  for (const run of readGlobalRunIndex(env).runs) {
    if (run.projectId === project.projectId && ACTIVE_RUN_STATUSES.has(run.status)) {
      active.push({
        runId: run.runId,
        projectId: run.projectId,
        alias: run.projectAlias ?? project.alias,
        task: run.task,
        pid: run.pid,
        status: run.status
      });
    }
  }

  try {
    for (const processInfo of listProcesses(project.projectRoot)) {
      if (!ACTIVE_RUN_STATUSES.has(processInfo.status)) {
        continue;
      }
      active.push({
        runId: processInfo.runId,
        projectId: project.projectId,
        alias: project.alias,
        task: processInfo.task,
        pid: processInfo.pid,
        status: processInfo.status
      });
    }
  } catch {
    // Broken project-local runtime state is reported by other commands; removal
    // refusal is based on active owned evidence we can safely read.
  }

  const seen = new Set();
  return active.filter((run) => {
    const key = `${run.runId ?? 'local'}:${run.task}:${run.pid}:${run.status}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function withRegistryLock(env, callback) {
  return withLock({
    lockName: 'registry',
    env,
    ownerCommand: process.argv.join(' ')
  }, callback);
}

function withProjectLock(projectId, env, callback) {
  return withLock({
    lockName: `project-${safePathToken(projectId)}`,
    env,
    ownerCommand: process.argv.join(' ')
  }, callback);
}

function withTaskLock(projectId, taskName, env, callback) {
  return withLock({
    lockName: `task-${safePathToken(projectId)}-${safePathToken(taskName)}`,
    env,
    ownerCommand: process.argv.join(' ')
  }, callback);
}

async function reconcileRunsInScope(scope, env) {
  const checkedAt = new Date().toISOString();
  const runs = readRunIndex(env).runs.filter((run) => runMatchesReconcileScope(run, scope));
  const updatedRuns = [];
  const staleRuns = [];
  const unresolved = [];
  const events = [];

  for (const run of runs) {
    const observed = observedRun(run, { checkedAt });
    if (observed.status === 'stale' && run.status !== 'stale') {
      const patch = staleRunPatch(observed, checkedAt);
      const updated = await updateRunRecord(run.runId, () => patch, {
        env,
        transactionId: run.transactionId
      });
      const repairedLocal = markLocalProcessStale(run, patch);
      const updatedRun = {
        ...observed,
        ...updated,
        localStateRepaired: repairedLocal
      };
      updatedRuns.push(updatedRun);
      staleRuns.push(updatedRun);
      events.push(await appendRunStaleEvent(updatedRun, env));
      continue;
    }

    if (observed.status === 'stale') {
      staleRuns.push(observed);
      continue;
    }

    if (ACTIVE_RUN_STATUSES.has(observed.status)) {
      unresolved.push({
        runId: observed.runId,
        projectId: observed.projectId,
        alias: observed.projectAlias,
        task: observed.task,
        pid: observed.pid,
        status: observed.status,
        reason: observed.observedProcessAlive
          ? 'recorded_process_still_running'
          : 'no_verified_owned_stale_evidence',
        next: [
          {
            label: 'Inspect run',
            command: `launchdeck inspect run:${observed.runId}`,
            reason: 'Shows ownership and listener evidence before lifecycle repair.',
            risk: 'safe'
          }
        ]
      });
    }
  }

  return {
    scope: scope.payload,
    updatedRuns,
    staleRuns,
    unresolved,
    events
  };
}

function resolveReconcileScope(target, env) {
  if (!target) {
    return {
      payload: {
        type: 'all'
      }
    };
  }

  if (typeof target === 'string' && /^[^:]+:[^:]+$/.test(target)) {
    const { projectTarget, taskName } = parseLifecycleTarget(target);
    const project = resolveRegisteredProject(projectTarget, env);
    return {
      project,
      taskName,
      payload: {
        type: 'task',
        target,
        project: projectSummary(project),
        task: taskName
      }
    };
  }

  const project = resolveRegisteredProject(target, env);
  return {
    project,
    payload: {
      type: 'project',
      target,
      project: projectSummary(project)
    }
  };
}

function runMatchesReconcileScope(run, scope) {
  if (!scope.project) {
    return true;
  }
  const projectMatches = run.projectId === scope.project.projectId
    || run.projectId === scope.project.id
    || (run.projectRoot && scope.project.projectRoot && samePath(run.projectRoot, scope.project.projectRoot));
  if (!projectMatches) {
    return false;
  }
  return !scope.taskName || run.task === scope.taskName;
}

function staleRunPatch(observed, checkedAt) {
  return {
    status: 'stale',
    staleAt: checkedAt,
    ownershipConfidence: 'stale-owned',
    ownershipProof: observed.ownershipProof,
    lastError: {
      code: 'stale_run',
      message: 'Recorded Launchdeck-owned process is no longer running.'
    }
  };
}

function markLocalProcessStale(run, patch) {
  if (!run?.projectRoot || !run?.task) {
    return false;
  }
  let state;
  try {
    state = readState(run.projectRoot);
  } catch {
    return false;
  }
  const processInfo = state.processes?.[run.task];
  if (!processInfo || processInfo.status === 'stale') {
    return false;
  }
  const sameRun = processInfo.runId && run.runId && processInfo.runId === run.runId;
  const samePid = Number(processInfo.pid) === Number(run.pid);
  if (!sameRun && !samePid) {
    return false;
  }
  processInfo.status = 'stale';
  processInfo.staleAt = patch.staleAt;
  processInfo.lastObservedAt = patch.staleAt;
  processInfo.ownershipConfidence = patch.ownershipConfidence;
  processInfo.ownershipProof = patch.ownershipProof;
  processInfo.lastError = patch.lastError;
  writeState(run.projectRoot, state);
  return true;
}

async function appendRunStaleEvent(run, env) {
  return appendEvent({
    homeDir: run.launchdeckHome ?? controlPlanePaths(env).homeDir,
    transactionId: run.transactionId,
    type: 'run.stale',
    level: 'warning',
    projectId: run.projectId,
    alias: run.projectAlias,
    task: run.task,
    runId: run.runId,
    status: 'stale',
    code: 'stale_run',
    message: 'Recorded Launchdeck-owned process is no longer running.',
    data: {
      pid: run.pid,
      projectRoot: run.projectRoot,
      staleReason: run.staleReason,
      ownershipProof: run.ownershipProof
    },
    next: [
      {
        label: 'Inspect run',
        command: `launchdeck inspect run:${run.runId}`,
        reason: 'Shows preserved stale run evidence.',
        risk: 'safe'
      },
      {
        label: 'View logs',
        command: `launchdeck logs ${run.projectAlias ?? run.projectId}:${run.task}`,
        reason: 'Reads logs for the stale managed task.',
        risk: 'safe'
      }
    ]
  });
}

async function markRestartPortReleaseTimeout(config, project, taskName, stoppedRun, error, env) {
  const stoppedAt = new Date().toISOString();
  const lastError = {
    code: error?.code ?? 'internal_error',
    message: error?.message ?? String(error)
  };
  if (stoppedRun?.runId) {
    await updateRunRecord(stoppedRun.runId, () => ({
      status: 'stop_failed',
      stoppedAt,
      lastError
    }), { env });
  }
  const state = readState(config.projectRoot);
  const processInfo = state.processes?.[taskName];
  if (processInfo) {
    processInfo.status = 'stop_failed';
    processInfo.stoppedAt = stoppedAt;
    processInfo.lastError = lastError;
    writeState(config.projectRoot, state);
  }
  const homeDir = stoppedRun?.launchdeckHome ?? env.LAUNCHDECK_HOME;
  if (homeDir) {
    await appendEvent({
      homeDir,
      transactionId: stoppedRun?.transactionId,
      type: 'restart.failed',
      level: 'error',
      projectId: project.projectId,
      alias: project.alias,
      task: taskName,
      runId: stoppedRun?.runId,
      status: 'stop_failed',
      code: error?.code ?? 'port_release_timeout',
      message: error?.message ?? 'Timed out waiting for declared ports to be released.',
      data: error.details,
      next: error.details?.next
    });
  }
}

async function stopOwnedRunForRestart(config, taskName, env) {
  try {
    return stopManagedTasks(config.projectRoot, taskName, {
      locks: false,
      verifyPortRelease: false
    });
  } catch (error) {
    if (error?.code !== 'external_process' || !canStopVerifiedSpawnedParent(config, taskName, error)) {
      throw error;
    }
    return [await stopVerifiedSpawnedParent(config, taskName, error, env)];
  }
}

function canStopVerifiedSpawnedParent(config, taskName, error) {
  const state = readState(config.projectRoot);
  const processInfo = state.processes?.[taskName];
  const run = error.details?.run;
  const proof = run?.ownershipProof ?? processInfo?.ownershipProof;
  if (!processInfo || !run || !proof) {
    return false;
  }
  return proof.source === 'launchdeck-spawn'
    && proof.confidence === 'verified-owned'
    && proof.reasons?.includes('launchdeck_spawned_process')
    && proof.runId === run.runId
    && proof.projectId === run.projectId
    && proof.task === run.task
    && Number(proof.pid) === Number(run.pid)
    && Number(processInfo.pid) === Number(run.pid)
    && proof.startedAt === run.startedAt
    && proof.command === run.command
    && samePath(proof.cwd, run.cwd);
}

async function stopVerifiedSpawnedParent(config, taskName, error, env) {
  const state = readState(config.projectRoot);
  const processInfo = state.processes?.[taskName];
  const run = error.details.run;
  const pid = Number(processInfo.pid);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (killError) {
    if (killError?.code !== 'ESRCH') {
      throw killError;
    }
  }
  await waitForPidExit(pid, 2_000);
  const stoppedAt = new Date().toISOString();
  processInfo.status = 'stopped';
  processInfo.stoppedAt = stoppedAt;
  delete processInfo.lastError;
  writeState(config.projectRoot, state);
  await updateRunRecord(run.runId, () => ({
    status: 'stopped',
    stoppedAt
  }), { env });
  return {
    ...processInfo,
    runId: run.runId,
    transactionId: run.transactionId,
    projectId: run.projectId,
    projectAlias: run.projectAlias,
    launchdeckHome: env.LAUNCHDECK_HOME,
    status: 'stopped',
    stoppedAt
  };
}

async function waitForPidExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!isPidRunning(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new LaunchdeckError('stop_failed', `Failed to stop verified Launchdeck parent process ${pid}.`, {
    pid
  });
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readGlobalRunIndex(env) {
  return readRunIndex(env);
}

function activeProjectRemoveActions(project, activeRuns) {
  const taskActions = activeRuns.map((run) => ({
    label: `Stop ${project.alias}:${run.task}`,
    command: `launchdeck stop ${project.alias}:${run.task}`,
    reason: 'Stops the Launchdeck-owned task before unregistering the project.',
    risk: 'confirm'
  }));
  return [
    {
      label: 'Inspect active Launchdeck state',
      command: 'launchdeck status --all',
      reason: 'Shows active runs that block project removal.',
      risk: 'safe'
    },
    ...taskActions
  ];
}

function parseLifecycleTarget(target) {
  if (typeof target !== 'string' || !/^[^:]+:[^:]+$/.test(target)) {
    throw new LaunchdeckError('invalid_arguments', 'Lifecycle target must use <project>:<task>.', {
      target
    });
  }
  const separator = target.indexOf(':');
  return {
    projectTarget: target.slice(0, separator),
    taskName: target.slice(separator + 1)
  };
}

function firstConfigInDir(dir) {
  for (const fileName of CONFIG_FILES) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

function projectSummary(project) {
  return {
    id: project.id,
    projectId: project.projectId,
    alias: project.alias,
    name: project.name,
    projectRoot: project.projectRoot,
    configPath: project.configPath
  };
}

function projectKey(projectRoot) {
  const resolved = path.resolve(projectRoot);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function projectId(projectRoot) {
  return crypto.createHash('sha256').update(projectKey(projectRoot)).digest('hex').slice(0, 12);
}

function sortProjects(projects) {
  return [...projects].sort((left, right) =>
    left.name.localeCompare(right.name) || left.projectRoot.localeCompare(right.projectRoot)
  );
}

function samePath(left, right) {
  const leftPath = path.resolve(left);
  const rightPath = path.resolve(right);
  if (process.platform === 'win32') {
    return leftPath.toLowerCase() === rightPath.toLowerCase();
  }
  return leftPath === rightPath;
}

function withLegacyProjectMirrors(registry) {
  return {
    ...registry,
    projects: sortProjects((registry.projects ?? []).map(withLegacyProjectMirror))
  };
}

function withLegacyProjectMirror(project) {
  const projectRoot = path.resolve(project.projectRoot);
  const projectIdValue = project.projectId ?? project.id ?? projectId(projectRoot);
  return {
    ...project,
    projectId: projectIdValue,
    id: project.id ?? projectIdValue,
    alias: project.alias ?? project.name ?? path.basename(projectRoot),
    name: project.name ?? project.alias ?? path.basename(projectRoot),
    key: project.key ?? projectKey(projectRoot)
  };
}

function withRegistryAction(project, action) {
  Object.defineProperty(project, 'registryAction', {
    value: action,
    enumerable: false
  });
  return project;
}

function safePathToken(value) {
  const token = String(value ?? '').trim();
  if (!token) {
    return 'unknown';
  }
  return token.replace(/[^a-zA-Z0-9._-]/g, '_');
}
