import net from 'node:net';
import { listPortListeners, normalizePort } from '../adapters/process.js';
import { loadConfig } from '../config.js';
import { LaunchdeckError } from '../errors.js';
import { listProcesses } from '../runtime.js';
import { listRegisteredProjects } from './actions.js';
import {
  applyTrustedSpawnOwnership,
  buildPortObservation,
  inspectOnlyActionsForOwnership,
  legacyOwnershipFromProof,
  proveRunOwnership
} from './ownership.js';
import { observedRun, readRunIndex } from './runs.js';
import { controlPlanePaths } from './state.js';

export async function buildGlobalStatus(env = process.env) {
  const projects = listRegisteredProjects(env);
  const runs = listGlobalRuns(env);
  const processResult = listGlobalProcesses(env);
  const portResult = await listGlobalPorts(env);
  const errors = mergeProjectErrors(processResult.errors, portResult.errors);
  const conflicts = conflictsFromPorts(portResult.ports);
  const projectEntries = projects.map((project) =>
    globalProjectStatus(project, {
      runs: runs.filter((run) => run.projectId === project.projectId || run.projectId === project.id),
      processes: processResult.processes.filter((processInfo) => processInfo.project.id === project.id),
      ports: portResult.ports.filter((entry) => entry.project.id === project.id),
      conflicts: conflicts.filter((conflict) => conflict.project.id === project.id),
      errors: errors.filter((error) => error.project.id === project.id)
    })
  );

  return {
    scope: 'global',
    registryPath: controlPlanePaths(env).registryPath,
    summary: {
      projects: summarizeProjects(projectEntries),
      processes: summarizeProcesses(processResult.processes),
      ports: {
        declared: portResult.ports.length,
        conflicts: conflicts.length
      },
      errors: errors.length
    },
    projects: projectEntries,
    processes: processResult.processes,
    runs,
    ports: portResult.ports,
    conflicts,
    errors
  };
}

export function listGlobalRuns(env = process.env) {
  return readRunIndex(env).runs.map((run) => {
    const observed = observedRun(run);
    return {
      ...observed,
      next: nextActionsForRun(observed)
    };
  }).sort((left, right) =>
    String(left.projectAlias ?? '').localeCompare(String(right.projectAlias ?? ''))
    || String(left.task ?? '').localeCompare(String(right.task ?? ''))
  );
}

export function listGlobalProcesses(env = process.env) {
  const projects = listRegisteredProjects(env);
  const projectById = new Map(projects.flatMap((project) => [
    [project.projectId, project],
    [project.id, project]
  ].filter(([key]) => key)));
  const processes = listGlobalRuns(env).map((run) =>
    processEntryForRun(run, projectById.get(run.projectId))
  );

  return {
    processes: processes.sort(compareGlobalProcess),
    errors: []
  };
}

export async function listGlobalPorts(env = process.env) {
  const ports = [];
  const errors = [];
  const runs = listGlobalRuns(env);
  const processEvidenceCache = new Map();
  for (const project of listRegisteredProjects(env)) {
    try {
      const config = loadRegisteredConfig(project);
      const summary = projectSummary(project, config);
      for (const task of Object.values(config.tasks)) {
        if (!task.longRunning || task.ports.length === 0) {
          continue;
        }

        const run = findRunForTask(runs, project, task.name);
        for (const port of task.ports) {
          const inspection = await inspectPort(port, env, { processEvidenceCache });
          const declaredOwner = findDeclaredOwnerInspection(inspection.declaredOwners, project, task.name);
          const observedOwnershipProof = declaredOwner?.ownershipProof
            ?? proveRunOwnership(run, { listeners: inspection.listeners, checkedAt: inspection.checkedAt, processEvidenceCache });
          const ownershipProof = applyTrustedSpawnOwnership(run, observedOwnershipProof);
          ports.push({
            port,
            project: summary,
            task: task.name,
            command: task.command,
            run,
            readiness: run?.readiness,
            next: run?.next ?? nextActionsForTask(project, task.name),
            process: run
              ? processSummaryForRun(run)
              : { status: 'not_running' },
            ownership: declaredOwner?.ownership
              ?? legacyOwnershipFromProof(ownershipProof, { hasRun: Boolean(run), hasListeners: inspection.listeners.length > 0 }),
            ownershipProof,
            portObservation: inspection.portObservation,
            listeners: inspection.listeners,
            conflicts: []
          });
        }
      }
    } catch (error) {
      errors.push(projectError(project, error));
    }
  }

  return {
    ports: ports.sort(comparePortEntry),
    conflicts: conflictsFromPorts(ports),
    errors
  };
}

export async function listGlobalConflicts(env = process.env) {
  const result = await listGlobalPorts(env);
  return {
    conflicts: conflictsFromPorts(result.ports),
    errors: result.errors
  };
}

export async function inspectPort(port, env = process.env, options = {}) {
  const normalizedPort = normalizePort(port);
  const ownershipOptions = {
    ...options,
    processEvidenceCache: options.processEvidenceCache ?? new Map()
  };
  let listeners = listPortListeners({ port: normalizedPort })
    .filter((listener) => listener.protocol !== 'udp');
  if (listeners.length === 0 && await isTcpPortOccupied(normalizedPort)) {
    listeners = [{
      protocol: 'tcp',
      localAddress: 'unknown',
      port: normalizedPort,
      state: 'occupied',
      pid: undefined,
      source: 'bind_probe'
    }];
  }

  const checkedAt = new Date().toISOString();
  const declaredOwners = await declaredOwnersForPort(normalizedPort, env, listeners, checkedAt, ownershipOptions);
  const portObservation = buildPortObservation({
    port: normalizedPort,
    listeners,
    declaredOwners,
    checkedAt
  });
  const conflicts = conflictsFromPortInspection(normalizedPort, listeners, declaredOwners);
  return {
    port: normalizedPort,
    protocol: 'tcp',
    checkedAt,
    ownerType: ownerTypeForPort(listeners, declaredOwners, portObservation),
    listeners,
    declaredOwners,
    conflicts,
    portObservation
  };
}

export async function inspectTarget(rawTarget, env = process.env) {
  const target = parseInspectTarget(rawTarget);
  if (target.type === 'port') {
    const inspection = await inspectPort(target.value, env);
    const ownership = ownershipForInspection(inspection);
    const actions = inspectActionsForOwnership(`port:${inspection.port}`, ownership);
    return {
      target,
      classification: inspection.ownerType,
      port: inspection.port,
      ports: [inspection.portObservation],
      listeners: inspection.listeners,
      ownership,
      conflicts: inspection.conflicts,
      safeActions: [
        {
          label: 'Inspect port',
          command: `launchdeck inspect-port ${inspection.port}`,
          reason: 'Compatibility view for this port.',
          risk: 'safe'
        },
        ...actions.safeActions
      ],
      blockedActions: actions.blockedActions
    };
  }

  if (target.type === 'pid') {
    const processEvidenceCache = new Map();
    const runs = listGlobalRuns(env);
    const run = runs.find((candidate) => Number(candidate.pid) === target.value);
    const listeners = listPortListeners().filter((listener) => listener.pid === target.value);
    const ownership = proveRunOwnership(run, { listeners, processEvidenceCache });
    const actionTarget = run ? `${run.projectAlias ?? run.projectId}:${run.task}` : `pid:${target.value}`;
    const actions = inspectActionsForOwnership(actionTarget, ownership, { run });
    return {
      target,
      classification: ownership.confidence,
      project: run ? projectSummaryFromRun(run) : undefined,
      run,
      ports: listeners.map((listener) => listener.port),
      listeners,
      ownership,
      conflicts: [],
      safeActions: actions.safeActions,
      blockedActions: actions.blockedActions
    };
  }

  if (target.type === 'task') {
    const processEvidenceCache = new Map();
    const { projectTarget, taskName } = parseInspectTaskTarget(target.value);
    const project = listRegisteredProjects(env).find((candidate) =>
      candidate.alias === projectTarget
      || candidate.name === projectTarget
      || candidate.projectId === projectTarget
      || candidate.id === projectTarget
    );
    if (!project) {
      throw new LaunchdeckError('project_not_found', `Registered project '${projectTarget}' was not found.`, {
        target: target.value
      });
    }
    const run = findRunForTask(listGlobalRuns(env), project, taskName);
    const declaredPorts = run?.declaredPorts ?? [];
    const portInspections = await Promise.all(declaredPorts.map((port) => inspectPort(port, env, { processEvidenceCache })));
    const listeners = portInspections.flatMap((inspection) => inspection.listeners);
    const ownership = proveRunOwnership(run, { listeners, processEvidenceCache });
    const actionTarget = `${project.alias ?? project.name ?? project.projectId}:${taskName}`;
    const actions = inspectActionsForOwnership(actionTarget, ownership, { run });
    return {
      target,
      classification: ownership.confidence,
      project: projectSummary(project),
      task: {
        name: taskName
      },
      run,
      ports: portInspections.map((inspection) => inspection.portObservation),
      listeners,
      ownership,
      conflicts: portInspections.flatMap((inspection) => inspection.conflicts),
      safeActions: actions.safeActions,
      blockedActions: actions.blockedActions
    };
  }

  if (target.type === 'project') {
    const project = findProjectByTarget(target.value, env);
    if (!project) {
      throw new LaunchdeckError('project_not_found', `Registered project '${target.value}' was not found.`, {
        target: target.value
      });
    }
    const runs = listGlobalRuns(env).filter((run) => run.projectId === project.projectId || run.projectId === project.id);
    const portResult = await listGlobalPorts(env);
    const ports = portResult.ports.filter((entry) => entry.project.id === project.id || entry.project.projectId === project.projectId);
    return {
      target,
      classification: projectClassification({ runs, ports, errors: portResult.errors }),
      project: projectSummary(project),
      runs,
      ports,
      listeners: ports.flatMap((entry) => entry.listeners ?? []),
      ownership: {
        confidence: 'not_applicable',
        reason: 'Project inspection is read-only metadata and evidence aggregation.'
      },
      conflicts: conflictsFromPorts(ports),
      safeActions: [
        {
          label: 'View status',
          command: 'launchdeck status --all',
          reason: 'Shows global registry, run, and port state.',
          risk: 'safe'
        },
        {
          label: 'List runs',
          command: 'launchdeck ps --all',
          reason: 'Lists managed runs without mutating lifecycle state.',
          risk: 'safe'
        }
      ],
      blockedActions: []
    };
  }

  if (target.type === 'run') {
    const run = listGlobalRuns(env).find((candidate) => candidate.runId === target.value);
    if (!run) {
      throw new LaunchdeckError('run_not_found', `Run '${target.value}' was not found.`, {
        target: target.value
      });
    }
    const processEvidenceCache = new Map();
    const portInspections = await Promise.all((run.declaredPorts ?? []).map((port) => inspectPort(port, env, { processEvidenceCache })));
    const listeners = portInspections.flatMap((inspection) => inspection.listeners);
    const ownership = proveRunOwnership(run, { listeners, processEvidenceCache });
    const actionTarget = `${run.projectAlias ?? run.projectId}:${run.task}`;
    const actions = inspectActionsForOwnership(actionTarget, ownership, { run });
    return {
      target,
      classification: ownership.confidence,
      project: projectSummaryFromRun(run),
      task: {
        name: run.task
      },
      run,
      ports: portInspections.map((inspection) => inspection.portObservation),
      listeners,
      ownership,
      conflicts: portInspections.flatMap((inspection) => inspection.conflicts),
      safeActions: actions.safeActions,
      blockedActions: actions.blockedActions
    };
  }

  if (target.type === 'conflict') {
    const conflictResult = await listGlobalConflicts(env);
    const conflict = conflictResult.conflicts.find((candidate) => conflictMatchesTarget(candidate, target.value));
    if (!conflict) {
      throw new LaunchdeckError('conflict_not_found', `Conflict '${target.value}' was not found.`, {
        target: target.value
      });
    }
    const ownership = {
      confidence: conflict.ownership ?? 'unknown',
      reason: conflict.message
    };
    const actions = inspectActionsForOwnership(`port:${conflict.port}`, ownership);
    return {
      target,
      classification: conflict.type,
      project: conflict.project,
      task: conflict.task ? { name: conflict.task } : undefined,
      run: conflict.runId ? { runId: conflict.runId } : undefined,
      ports: [conflict.port],
      listeners: conflict.listeners ?? [],
      ownership,
      conflicts: [conflict],
      safeActions: [
        {
          label: 'Inspect port',
          command: `launchdeck inspect port:${conflict.port}`,
          reason: 'Shows listener and declared owner evidence for this conflict.',
          risk: 'safe'
        },
        {
          label: 'List conflicts',
          command: 'launchdeck conflicts',
          reason: 'Lists blocking and warning conflicts.',
          risk: 'safe'
        }
      ],
      blockedActions: actions.blockedActions
    };
  }

  throw new LaunchdeckError('invalid_arguments', `Unsupported inspect target '${rawTarget}'.`, {
    target: rawTarget
  });
}

export async function assertTaskPortsAvailable(config, taskName, task, env = process.env) {
  for (const port of task.ports ?? []) {
    const inspection = await inspectPort(port, env);
    if (inspection.listeners.length === 0) {
      continue;
    }

    const declaredOwner = inspection.declaredOwners.find((owner) =>
      owner.task === taskName
      && samePath(owner.project?.projectRoot, config.projectRoot)
      && owner.ownership === 'launchdeck-owned'
    );
    const localProcess = localManagedProcessForPort(config.projectRoot, taskName, port);
    if (declaredOwner || isAllowedLocalOwner(inspection.listeners, localProcess)) {
      continue;
    }

    throw new LaunchdeckError('port_conflict', `Port ${port} is already in use.`, {
        port,
        ownership: inspection.portObservation,
        projectRoot: config.projectRoot,
        task: taskName,
        listeners: inspection.listeners,
        declaredOwners: inspection.declaredOwners,
      safeActions: [
        `launchdeck inspect-port ${port}`,
        'choose another port',
        'stop the owning Launchdeck-managed task if ownership is proven'
      ]
    });
  }
}

function loadRegisteredConfig(project) {
  return loadConfig(project.projectRoot);
}

function findProjectByTarget(target, env) {
  return listRegisteredProjects(env).find((candidate) =>
    candidate.alias === target
    || candidate.name === target
    || candidate.projectId === target
    || candidate.id === target
    || samePath(candidate.projectRoot, target)
  );
}

function projectClassification(details) {
  if (details.errors.some((error) => details.ports.some((entry) => entry.project.id === error.project.id))) {
    return 'error';
  }
  if (conflictsFromPorts(details.ports).length > 0) {
    return 'conflict';
  }
  if (details.runs.some((run) => isActiveRunStatus(run.status))) {
    return 'running';
  }
  return details.runs.length > 0 ? 'stopped' : 'idle';
}

function inspectActionsForOwnership(target, proof, options = {}) {
  if (canTreatManagedRunAsOwnedForInspect(proof, options.run)) {
    return {
      safeActions: [
        {
          label: 'View logs',
          command: `launchdeck logs ${target}`,
          reason: 'Reads logs for this Launchdeck-owned task.',
          risk: 'safe'
        },
        {
          label: 'Stop task',
          command: `launchdeck stop ${target}`,
          reason: 'Ownership is verified before stopping.',
          risk: 'confirm'
        }
      ],
      blockedActions: []
    };
  }
  const actions = inspectOnlyActionsForOwnership(target, proof);
  if (actions.blockedActions.length === 0 || actions.blockedActions.some((action) => actionTextIncludes(action, 'kill'))) {
    return actions;
  }
  return {
    ...actions,
    blockedActions: [
      ...actions.blockedActions,
      {
        label: 'Kill blocked',
        command: `kill ${target}`,
        reason: 'Launchdeck inspect is read-only and never kills external or unknown processes.',
        risk: 'dangerous'
      }
    ]
  };
}

function canTreatManagedRunAsOwnedForInspect(proof, run) {
  if (!run || !isActiveRunStatus(run.status) || !proof?.processAlive) {
    return false;
  }
  if (proof.confidence === 'verified-owned' || proof.confidence === 'probable-owned') {
    return true;
  }
  if (proof.confidence === 'external' || proof.reasons?.includes('listener_pid_differs_from_run')) {
    return false;
  }
  return proof.pidMatchesRun || proof.reasons?.includes('listener_pid_unavailable') || proof.reasons?.includes('no_listener_evidence');
}

function actionTextIncludes(action, expected) {
  return JSON.stringify(action ?? '').toLowerCase().includes(expected);
}

function conflictMatchesTarget(conflict, value) {
  const candidates = [
    conflict.id,
    conflict.conflictId,
    conflict.type,
    String(conflict.port),
    `${conflict.type}:${conflict.port}`,
    `${conflict.project?.alias ?? conflict.project?.name ?? conflict.project?.id}:${conflict.task}`,
    `${conflict.port}:${conflict.project?.alias ?? conflict.project?.name ?? conflict.project?.id}:${conflict.task}`
  ].filter(Boolean);
  return candidates.includes(value);
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

async function declaredOwnersForPort(port, env, listeners = [], checkedAt = new Date().toISOString(), options = {}) {
  const owners = [];
  const runs = listGlobalRuns(env);
  for (const project of listRegisteredProjects(env)) {
    try {
      const config = loadRegisteredConfig(project);
      const summary = projectSummary(project, config);
      for (const task of Object.values(config.tasks)) {
        if (!task.longRunning || !task.ports.includes(port)) {
          continue;
        }
        const run = findRunForTask(runs, project, task.name);
        const observedOwnershipProof = proveRunOwnership(run, {
          listeners,
          checkedAt,
          processEvidenceCache: options.processEvidenceCache
        });
        const ownershipProof = applyTrustedSpawnOwnership(run, observedOwnershipProof);
        owners.push({
          project: summary,
          task: task.name,
          run,
          readiness: run?.readiness,
          next: run?.next ?? nextActionsForTask(project, task.name),
          process: run ? processSummaryForRun(run) : { status: 'not_running' },
          ownership: legacyOwnershipFromProof(ownershipProof, {
            hasRun: Boolean(run),
            hasListeners: listeners.length > 0
          }),
          ownershipProof
        });
      }
    } catch {
      // Broken project entries are reported by list commands; port inspection can continue.
    }
  }
  return owners;
}

function conflictsFromPorts(ports) {
  return ports
    .flatMap((entry) => {
      if (entry.ownership === 'external') {
        return [portConflict(entry, 'external_port_occupied')];
      }
      if (entry.ownership === 'unknown') {
        return [portConflict(entry, 'unknown')];
      }
      if (entry.ownership === 'conflict') {
        return [portConflict(entry, 'ownership_conflict')];
      }
      return [];
    })
    .sort(compareConflictEntry);
}

function portConflict(entry, type) {
  const next = [
    {
      label: 'Inspect port',
      command: `launchdeck inspect-port ${entry.port}`,
      reason: 'Shows listener and declared owner evidence for this port.',
      risk: 'safe'
    },
    {
      label: 'List ports',
      command: 'launchdeck ports',
      reason: 'Shows all declared managed ports across registered projects.',
      risk: 'safe'
    }
  ];
  return {
    type,
    severity: type === 'external_port_occupied' || type === 'ownership_conflict' ? 'blocking' : 'warning',
    port: entry.port,
    project: entry.project,
    task: entry.task,
    runId: entry.run?.runId,
    process: entry.process,
    listeners: entry.listeners,
    ownership: entry.ownership,
    message: conflictMessage(entry, type),
    next,
    safeActions: [
      `launchdeck inspect-port ${entry.port}`,
      `launchdeck ports`,
      type === 'ownership_conflict'
        ? `verify ownership before stopping ${entry.project.name}:${entry.task}`
        : type === 'unknown'
          ? 'collect process evidence before taking ownership actions'
          : 'stop or reconfigure the external service manually'
    ]
  };
}

function globalProjectStatus(project, details) {
  const status = details.errors.length > 0
    ? 'error'
    : details.conflicts.length > 0
      ? 'conflict'
      : details.runs.some((run) => isActiveRunStatus(run.status))
        ? 'running'
        : details.runs.length > 0
          ? 'stopped'
          : 'idle';

  return {
    id: project.id,
    projectId: project.projectId ?? project.id,
    alias: project.alias,
    name: project.name,
    projectRoot: project.projectRoot,
    configPath: project.configPath,
    status,
    runs: details.runs,
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
    ready: 0,
    running: 0,
    starting: 0,
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

function processEntryForRun(run, project = undefined) {
  const projectInfo = project
    ? projectSummary(project)
    : projectSummaryFromRun(run);
  return {
    project: projectInfo,
    owner: 'launchdeck',
    task: run.task,
    name: run.task,
    command: run.command,
    cwd: run.cwd,
    pid: run.pid,
    status: run.status,
    startedAt: run.startedAt,
    lastRefresh: run.lastObservedAt,
    lastObservedAt: run.lastObservedAt,
    ports: run.declaredPorts ?? [],
    logPath: run.logPath,
    runId: run.runId,
    transactionId: run.transactionId,
    projectId: run.projectId,
    projectAlias: run.projectAlias,
    readiness: run.readiness,
    next: run.next
  };
}

function processSummaryForRun(run) {
  return {
    task: run.task,
    pid: run.pid,
    status: run.status,
    startedAt: run.startedAt,
    lastRefresh: run.lastObservedAt,
    lastObservedAt: run.lastObservedAt,
    ports: run.declaredPorts ?? [],
    logPath: run.logPath,
    runId: run.runId,
    readiness: run.readiness,
    next: run.next
  };
}

function nextActionsForRun(run) {
  const target = `${run.projectAlias ?? run.projectId}:${run.task}`;
  if (run.status === 'stale') {
    return [
      {
        label: 'View logs',
        command: `launchdeck logs ${target}`,
        reason: 'Reads the task log associated with this stale run record.',
        risk: 'safe'
      },
      {
        label: 'Reconcile state',
        command: `launchdeck reconcile ${target}`,
        reason: 'Repairs stale Launchdeck state without stopping unknown or external processes.',
        risk: 'safe'
      },
      {
        label: 'Inspect run',
        command: `launchdeck inspect run:${run.runId}`,
        reason: 'Shows preserved run, ownership, and listener evidence before any lifecycle action.',
        risk: 'safe'
      }
    ];
  }
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

function nextActionsForTask(project, taskName) {
  const target = `${project.projectId ?? project.id}:${taskName}`;
  return [
    {
      label: 'Start task',
      command: `launchdeck start ${target}`,
      reason: 'Starts this registered managed task.',
      risk: 'confirm'
    },
    {
      label: 'View status',
      command: 'launchdeck status --all',
      reason: 'Shows global registry, run, and port state.',
      risk: 'safe'
    }
  ];
}

function ownerTypeForPort(listeners, declaredOwners, portObservation) {
  if (portObservation?.ownerType) {
    if (portObservation.ownerType === 'unknown' && declaredOwners.some((owner) => owner.ownership === 'conflict')) {
      return 'conflict';
    }
    return portObservation.ownerType;
  }
  if (listeners.length === 0) {
    return declaredOwners.length > 0 ? 'free' : 'free';
  }
  if (declaredOwners.some((owner) => owner.ownership === 'conflict')) {
    return 'conflict';
  }
  if (declaredOwners.some((owner) => owner.ownership === 'launchdeck-owned' || owner.ownership === 'launchdeck-probable-owned')) {
    return 'launchdeck';
  }
  if (listeners.every((listener) => Number.isInteger(listener.pid))) {
    return 'external';
  }
  return 'unknown';
}

function findRunForTask(runs, project, taskName) {
  const candidates = runs.filter((run) =>
    run.task === taskName
    && (run.projectId === project.projectId || run.projectId === project.id)
  );
  return candidates.sort(compareRunForTaskView)[0];
}

function compareRunForTaskView(left, right) {
  return runStatusRank(right) - runStatusRank(left)
    || runObservedTime(right) - runObservedTime(left)
    || String(right.runId ?? '').localeCompare(String(left.runId ?? ''))
    || String(right.transactionId ?? '').localeCompare(String(left.transactionId ?? ''))
    || Number(right.pid ?? 0) - Number(left.pid ?? 0);
}

function runStatusRank(run) {
  return isActiveRunStatus(run.status) ? 1 : 0;
}

function runObservedTime(run) {
  return Math.max(
    timestampMs(run.lastObservedAt),
    timestampMs(run.updatedAt),
    timestampMs(run.startedAt)
  );
}

function timestampMs(value) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isActiveRunStatus(status) {
  return status === 'starting' || status === 'running' || status === 'ready' || status === 'stopping';
}

function projectSummaryFromRun(run) {
  return {
    id: run.projectId,
    projectId: run.projectId,
    alias: run.projectAlias,
    name: run.projectAlias ?? run.projectId,
    projectRoot: run.projectRoot,
    configPath: run.configPath
  };
}

function conflictsFromPortInspection(port, listeners, declaredOwners) {
  if (listeners.length === 0) {
    return [];
  }
  return declaredOwners
    .filter((owner) => owner.ownership === 'external' || owner.ownership === 'conflict' || owner.ownership === 'unknown')
    .map((owner) => portConflict({
      port,
      project: owner.project,
      task: owner.task,
      run: owner.run,
      process: owner.process,
      listeners,
      ownership: owner.ownership
    }, conflictTypeForOwnership(owner.ownership)));
}

function conflictMessage(entry, type) {
  if (type === 'ownership_conflict') {
    return `Declared port ${entry.port} has listener evidence that does not match ${entry.project.name}:${entry.task}.`;
  }
  if (type === 'unknown') {
    return `Declared port ${entry.port} has incomplete ownership evidence for ${entry.project.name}:${entry.task}.`;
  }
  return `Declared port ${entry.port} is occupied by an external listener for ${entry.project.name}:${entry.task}.`;
}

function conflictTypeForOwnership(ownership) {
  if (ownership === 'conflict') {
    return 'ownership_conflict';
  }
  if (ownership === 'unknown') {
    return 'unknown';
  }
  return 'external_port_occupied';
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
  return listeners.some((listener) => listener.pid === processInfo.pid);
}

function findDeclaredOwnerInspection(declaredOwners, project, taskName) {
  return declaredOwners.find((owner) =>
    owner.task === taskName
    && (
      owner.project?.projectId === project.projectId
      || owner.project?.id === project.id
      || samePath(owner.project?.projectRoot, project.projectRoot)
    )
  );
}

function samePath(left, right) {
  if (!left || !right) {
    return false;
  }
  const leftPath = process.platform === 'win32' ? String(left).toLowerCase() : String(left);
  const rightPath = process.platform === 'win32' ? String(right).toLowerCase() : String(right);
  return leftPath === rightPath;
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

function ownershipForInspection(inspection) {
  const declaredOwner = inspection.declaredOwners.find((owner) => owner.ownershipProof);
  if (declaredOwner?.ownershipProof) {
    return declaredOwner.ownershipProof;
  }
  return proveRunOwnership(undefined, { listeners: inspection.listeners, checkedAt: inspection.checkedAt });
}

function parseInspectTarget(rawTarget) {
  if (typeof rawTarget !== 'string' || !rawTarget.includes(':')) {
    throw new LaunchdeckError('invalid_arguments', '`launchdeck inspect` target must use type:value syntax.', {
      target: rawTarget
    });
  }
  const separator = rawTarget.indexOf(':');
  const type = rawTarget.slice(0, separator);
  const value = rawTarget.slice(separator + 1);
  if (type === 'port') {
    return {
      type,
      value: normalizePort(value),
      raw: rawTarget
    };
  }
  if (type === 'pid') {
    const pid = Number(value);
    if (!Number.isInteger(pid) || pid <= 0) {
      throw new LaunchdeckError('invalid_arguments', 'Inspect pid target must include a positive integer pid.', {
        target: rawTarget
      });
    }
    return {
      type,
      value: pid,
      raw: rawTarget
    };
  }
  if (type === 'task') {
    return {
      type,
      value,
      raw: rawTarget
    };
  }
  return {
    type,
    value,
    raw: rawTarget
  };
}

function parseInspectTaskTarget(value) {
  const separator = value.indexOf(':');
  if (separator === -1) {
    throw new LaunchdeckError('invalid_arguments', 'Inspect task target must use task:<project>:<task>.', {
      target: value
    });
  }
  return {
    projectTarget: value.slice(0, separator),
    taskName: value.slice(separator + 1)
  };
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
