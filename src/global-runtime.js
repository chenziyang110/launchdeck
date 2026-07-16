import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FILES, loadConfig } from './config.js';
import {
  assertTaskPortsAvailable as assertTaskPortsAvailableView,
  buildGlobalStatus as buildGlobalStatusView,
  inspectPort as inspectPortView,
  inspectTarget as inspectTargetView,
  listGlobalConflicts as listGlobalConflictsView,
  listGlobalPorts as listGlobalPortsView,
  listGlobalProcesses as listGlobalProcessesView,
  listGlobalRuns as listGlobalRunsView
} from './control-plane/inspect.js';
import {
  assertAliasAvailable,
  controlPlanePaths,
  normalizeProjectRegistration,
  readRegistryState,
  updateRegistryState,
  writeRegistryState
} from './control-plane/state.js';
import {
  addProjectToRegistry as addProjectToRegistryAction,
  listRegisteredProjects as listRegisteredProjectsAction,
  readProjectRegistry as readProjectRegistryAction,
  repairProjectRegistration as repairProjectRegistrationAction,
  removeProjectFromRegistry as removeProjectFromRegistryAction,
  resolveRegisteredProject as resolveRegisteredProjectAction,
  scanProjectsIntoRegistry as scanProjectsIntoRegistryAction,
  writeProjectRegistry as writeProjectRegistryAction
} from './control-plane/actions.js';

const DEFAULT_SCAN_MAX_DEPTH = 5;
const DEFAULT_SCAN_MAX_DIRS = 2_000;
const DEFAULT_SCAN_MAX_PROJECTS = 100;
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

export function globalRuntimePaths(env = process.env) {
  const paths = controlPlanePaths(env);
  return {
    homeDir: paths.homeDir,
    registryPath: paths.registryPath,
    legacyRegistryPath: paths.legacyRegistryPath
  };
}

export function readProjectRegistry(env = process.env) {
  return readProjectRegistryAction(env);
}

export function writeProjectRegistry(registry, env = process.env) {
  return writeProjectRegistryAction(registry, env);
}

export async function addProjectToRegistry(config, options = {}) {
  return addProjectToRegistryAction(config, options);
}

export async function removeProjectFromRegistry(target, options = {}) {
  return removeProjectFromRegistryAction(target, options);
}

export function listRegisteredProjects(env = process.env) {
  return listRegisteredProjectsAction(env);
}

export async function repairProjectRegistration(target, options = {}) {
  return repairProjectRegistrationAction(target, options);
}

export function resolveRegisteredProject(target, env = process.env) {
  return resolveRegisteredProjectAction(target, env);
}

export function loadRegisteredConfig(project) {
  return loadConfig(project.projectRoot);
}

export async function buildGlobalStatus(env = process.env) {
  return normalizeGlobalStatusNextActions(await buildGlobalStatusView(env));
}

export function listGlobalRuns(env = process.env) {
  return listGlobalRunsView(env);
}

export function listGlobalProcesses(env = process.env) {
  return listGlobalProcessesView(env);
}

export async function listGlobalPorts(env = process.env) {
  return listGlobalPortsView(env);
}

export async function listGlobalConflicts(env = process.env) {
  return listGlobalConflictsView(env);
}

export async function scanProjectsIntoRegistry(rootDir, options = {}) {
  return scanProjectsIntoRegistryAction(rootDir, options);
}

export async function inspectPort(port, env = process.env) {
  return inspectPortView(port, env);
}

export async function inspectTarget(target, env = process.env) {
  return inspectTargetView(target, env);
}

export async function assertTaskPortsAvailable(config, taskName, task, env = process.env) {
  return assertTaskPortsAvailableView(config, taskName, task, env);
}

function projectKey(projectRoot) {
  const resolved = path.resolve(projectRoot);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function projectId(projectRoot) {
  return crypto.createHash('sha256').update(projectKey(projectRoot)).digest('hex').slice(0, 12);
}

function sortProjects(projects) {
  return [...projects].sort((left, right) => left.name.localeCompare(right.name) || left.projectRoot.localeCompare(right.projectRoot));
}

function projectSummary(project, config = undefined) {
  return {
    id: project.id ?? project.projectId,
    projectId: project.projectId ?? project.id,
    alias: project.alias ?? project.name,
    name: config?.project?.name ?? project.name,
    projectRoot: config?.projectRoot ?? project.projectRoot,
    configPath: config?.configPath ?? project.configPath
  };
}

function projectError(project, error) {
  return {
    project: projectSummary(project),
    code: error?.code ?? 'internal_error',
    message: error?.message ?? String(error)
  };
}

function safeListProcesses(projectRoot) {
  try {
    return listProcesses(projectRoot);
  } catch {
    return [];
  }
}

async function declaredOwnersForPort(port, env) {
  const owners = [];
  for (const project of listRegisteredProjects(env)) {
    try {
      const config = loadRegisteredConfig(project);
      const processes = safeListProcesses(config.projectRoot);
      const summary = projectSummary(project, config);
      for (const task of Object.values(config.tasks)) {
        if (!task.longRunning || !task.ports.includes(port)) {
          continue;
        }
        const processInfo = processes.find((candidate) => candidate.task === task.name);
        owners.push({
          project: summary,
          task: task.name,
          process: processInfo ? processSummary(processInfo) : { status: 'not_running' },
          ownership: ownershipForDeclaredPort([], processInfo)
        });
      }
    } catch {
      // Broken project entries are reported by list commands; port inspection can continue.
    }
  }
  return owners;
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

function conflictsFromPorts(ports) {
  return ports
    .flatMap((entry) => {
      if (entry.ownership === 'external') {
        return [portConflict(entry, 'external_port_occupied')];
      }
      if (entry.ownership === 'conflict') {
        return [portConflict(entry, 'ownership_conflict')];
      }
      return [];
    })
    .sort(compareConflictEntry);
}

function portConflict(entry, type) {
  return {
    type,
    port: entry.port,
    project: entry.project,
    task: entry.task,
    process: entry.process,
    listeners: entry.listeners,
    ownership: entry.ownership,
    safeActions: [
      `launchdeck inspect-port ${entry.port}`,
      `launchdeck ports`,
      type === 'ownership_conflict'
        ? `verify ownership before stopping ${entry.project.name}:${entry.task}`
        : 'stop or reconfigure the external service manually'
    ]
  };
}

function globalProjectStatus(project, details) {
  const status = details.errors.length > 0
    ? 'error'
    : details.conflicts.length > 0
      ? 'conflict'
      : details.processes.some((processInfo) => processInfo.status === 'running')
        ? 'running'
        : details.processes.length > 0
          ? 'stopped'
          : 'idle';

  return {
    id: project.id,
    name: project.name,
    projectRoot: project.projectRoot,
    configPath: project.configPath,
    status,
    processes: details.processes,
    ports: details.ports,
    conflicts: details.conflicts,
    errors: details.errors
  };
}

function summarizeProjects(projects) {
  return {
    total: projects.length,
    running: projects.filter((project) => project.status === 'running').length,
    conflict: projects.filter((project) => project.status === 'conflict').length,
    idle: projects.filter((project) => project.status === 'idle').length,
    stopped: projects.filter((project) => project.status === 'stopped').length,
    error: projects.filter((project) => project.status === 'error').length
  };
}

function summarizeProcesses(processes) {
  const summary = {
    total: processes.length,
    running: 0,
    stopped: 0,
    stale: 0,
    unknown: 0,
    stop_failed: 0
  };
  for (const processInfo of processes) {
    if (Object.hasOwn(summary, processInfo.status)) {
      summary[processInfo.status] += 1;
    }
  }
  return summary;
}

function mergeProjectErrors(...groups) {
  const seen = new Set();
  const errors = [];
  for (const group of groups) {
    for (const error of group) {
      const key = [
        error.project.id,
        error.code,
        error.message
      ].join('|');
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      errors.push(error);
    }
  }
  return errors;
}

function processSummary(processInfo) {
  return {
    task: processInfo.task,
    pid: processInfo.pid,
    status: processInfo.status,
    startedAt: processInfo.startedAt,
    lastRefresh: processInfo.lastRefresh,
    ports: processInfo.ports,
    logPath: processInfo.logPath
  };
}

function nextActionsForRun(run) {
  const target = `${run.projectId}:${run.task}`;
  return [
    {
      label: 'View logs',
      command: `launchdeck logs ${target}`,
      reason: 'Reads the task log associated with this run.',
      risk: 'safe'
    },
    {
      label: 'Stop task',
      command: `launchdeck stop ${target}`,
      reason: 'Stops the Launchdeck-owned task before changing registry state.',
      risk: 'confirm'
    }
  ];
}

function normalizeGlobalStatusNextActions(status) {
  return {
    ...status,
    runs: (status.runs ?? []).map((run) => {
      if (run.status === 'stale') {
        return run;
      }
      const target = `${run.projectId}:${run.task}`;
      return {
        ...run,
        next: (run.next ?? []).map((action) => normalizeRunActionTarget(action, run, target))
      };
    })
  };
}

function normalizeRunActionTarget(action, run, target) {
  if (!action?.command || !run.projectAlias || !run.task) {
    return action;
  }
  const aliasTarget = `${run.projectAlias}:${run.task}`;
  return {
    ...action,
    command: action.command.replace(aliasTarget, target)
  };
}

function ownershipForDeclaredPort(listeners, processInfo) {
  if (!processInfo) {
    return listeners.length > 0 ? 'external' : 'declared-not-running';
  }
  if (processInfo.status !== 'running') {
    if (listeners.length > 0) {
      return 'external';
    }
    return `launchdeck-${processInfo.status}`;
  }
  if (listeners.length === 0) {
    return 'launchdeck-declared-running';
  }
  if (listeners.some((listener) => listener.pid === processInfo.pid || listener.pid === undefined)) {
    return 'launchdeck-owned';
  }
  return 'conflict';
}

function ownerTypeForPort(listeners, declaredOwners) {
  if (listeners.length === 0) {
    return declaredOwners.length > 0 ? 'declared' : 'free';
  }
  if (declaredOwners.some((owner) => owner.process.status === 'running')) {
    return 'launchdeck';
  }
  return 'external';
}

function localManagedProcessForPort(projectRoot, taskName, port) {
  const processInfo = safeListProcesses(projectRoot).find((candidate) =>
    candidate.task === taskName
    && candidate.status === 'running'
    && candidate.ports.includes(port)
  );
  return processInfo;
}

function isAllowedLocalOwner(listeners, processInfo) {
  if (!processInfo) {
    return false;
  }
  return listeners.some((listener) => listener.pid === processInfo.pid || listener.pid === undefined);
}

function isTcpPortOccupied(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => {
      resolve(error?.code === 'EADDRINUSE' || error?.code === 'EACCES');
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(false));
    });
  });
}

function compareGlobalProcess(left, right) {
  return left.project.name.localeCompare(right.project.name) || left.task.localeCompare(right.task);
}

function comparePortEntry(left, right) {
  return left.port - right.port || left.project.name.localeCompare(right.project.name) || left.task.localeCompare(right.task);
}

function compareConflictEntry(left, right) {
  return left.port - right.port || left.project.name.localeCompare(right.project.name) || left.task.localeCompare(right.task);
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
