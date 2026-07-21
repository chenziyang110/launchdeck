#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createSampleConfig,
  findConfig,
  loadConfig
} from './config.js';
import {
  doctorAgentInstaller,
  installAgentSkill,
  listAgentTargets,
  supportedAgents
} from './agent-installer.js';
import { LaunchdeckError, toErrorPayload } from './errors.js';
import {
  createFailureEnvelope,
  createPartialEnvelope,
  createSuccessEnvelope,
  writeJson as writeJsonEnvelope
} from './output.js';
import {
  addProjectToRegistry,
  assertTaskPortsAvailable,
  buildGlobalStatus,
  globalRuntimePaths,
  inspectPort,
  inspectTarget,
  listGlobalConflicts,
  listGlobalPorts,
  listGlobalProcesses,
  listRegisteredProjects,
  loadRegisteredConfig,
  repairProjectRegistration,
  removeProjectFromRegistry,
  scanProjectsIntoRegistry,
  resolveRegisteredProject
} from './global-runtime.js';
import {
  applySafeCleanPlan,
  buildSafeCleanPlan,
  cleanTargets,
  listProcesses,
  observeTaskOwnership,
  readState,
  resolveCleanTargets,
  runtimePaths,
  runTask,
  stopManagedTasks,
  tailLog,
} from './runtime.js';
import { reconcileManagedRuns, stopManagedRun, restartManagedRun } from './control-plane/actions.js';
import { createRunContext, readRunIndex, startManagedRun } from './control-plane/runs.js';
import { eventsPath, readEvents, redactLogLine } from './control-plane/events.js';
import { mapCliInvocation } from './adapters/cli-operation-map.js';
import { createApplicationKernel } from './kernel/application-kernel.js';
import { createCapabilitiesHandlers } from './kernel/operations/capabilities.js';
import { createProjectHandlers } from './kernel/operations/project.js';
import { createTaskHandlers, toTaskInventoryItem } from './kernel/operations/task.js';
import { createAdoptionHandlers } from './kernel/operations/adoption.js';
import { createOperationHandlers } from './kernel/operations/operation.js';
import { createCleanHandlers } from './kernel/operations/clean.js';
import { createOperationJournal } from './control-plane/operation-journal.js';

const LIFECYCLE_ALIASES = new Set([
  'setup',
  'build',
  'package',
  'test',
  'lint',
  'typecheck'
]);

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  let options = { json: argv.includes('--json'), compact: argv.includes('--compact') };
  io = withJsonOptions(io, options);
  let command = 'help';

  try {
    const { positionals, options: parsedOptions } = parseArgs(argv);
    options = parsedOptions;
    io = withJsonOptions(io, options);
    command = positionals[0] ?? 'help';

    if (command === 'help' || command === '--help' || command === '-h') {
      write(io, helpText());
      return 0;
    }

    if (command === 'version' || command === '--version' || command === '-v') {
      const packageJson = JSON.parse(
        fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
      );
      write(io, `${packageJson.version}\n`);
      return 0;
    }

    if (command === 'init') {
      return initCommand(options, io);
    }

    if (command === 'capabilities') {
      return await capabilitiesCommand(options, io);
    }

    if (command === 'diagnose') {
      return await diagnoseCommand(options, io);
    }

    if (command === 'doctor') {
      return doctorCommand(options, io);
    }

    if (command === 'tasks') {
      return await tasksCommand(options, io);
    }

    if (command === 'project') {
      return await projectCommand(positionals, options, io);
    }

    if (command === 'agent') {
      return agentCommand(positionals, options, io);
    }

    if (command === 'projects') {
      return await projectsCommand(options, io);
    }

    if (command === 'adoption') {
      return await adoptionCommand(positionals, options, io);
    }

    if (command === 'operation') {
      return await operationCommand(positionals, options, io);
    }

    if (command === 'status') {
      return await statusCommand(options, io);
    }

    if (command === 'conflicts') {
      return await conflictsCommand(options, io);
    }

    if (command === 'ps') {
      return psCommand(options, io);
    }

    if (command === 'ports') {
      return await portsCommand(options, io);
    }

    if (command === 'inspect-port') {
      return await inspectPortCommand(positionals[1], options, io);
    }

    if (command === 'inspect') {
      return await inspectCommand(positionals[1], options, io);
    }

    if (command === 'logs') {
      return await logsCommand(positionals[1], options, io);
    }

    if (command === 'events') {
      return await eventsCommand(positionals[1], options, io);
    }

    if (command === 'stop') {
      return await stopCommand(positionals[1], options, io);
    }

    if (command === 'force-stop') {
      return await forceStopCommand(positionals[1], options, io);
    }

    if (command === 'restart') {
      return await restartCommand(positionals[1], options, io);
    }

    if (command === 'reconcile') {
      return await reconcileCommand(positionals[1], options, io);
    }

    if (command === 'clean') {
      return await cleanCommand(options, io);
    }

    if (command === 'run') {
      return await runCommand(positionals[1], options, io);
    }

    if (command === 'start') {
      return await startCommand(positionals[1], options, io, 'start');
    }

    if (command === 'dev') {
      return await startCommand('dev', options, io, 'dev');
    }

    if (LIFECYCLE_ALIASES.has(command)) {
      return await runConfiguredTask(command, options, io, { alias: command });
    }

    throw new LaunchdeckError('unknown_command', `Unknown command '${command}'. Run 'launchdeck help' for usage.`, {
      command
    });
  } catch (error) {
    const payload = toErrorPayload(error instanceof Error ? error : new Error(String(error)));
    if (options.json) {
      writeJson(
        io,
        failureEnvelope(command, error instanceof Error ? error : new Error(String(error)), contextFromError(error))
      );
    } else {
      writeError(io, `launchdeck: [${payload.code}] ${payload.message}\n`);
    }
    return 1;
  }
}

function initCommand(options, io) {
  const cwd = process.cwd();
  const configPath = path.join(cwd, '.launchdeck.yml');
  const existing = findConfig(cwd);

  if (existing && !options.force) {
    throw new LaunchdeckError(
      'config_exists',
      `Config already exists at ${existing}. Use --force to overwrite .launchdeck.yml.`,
      { configPath: existing }
    );
  }

  fs.writeFileSync(configPath, createSampleConfig(path.basename(cwd)));
  const result = createSuccessEnvelope(
    'init',
    {
      created: true,
      path: configPath
    },
    {
      projectRoot: cwd,
      configPath
    }
  );
  if (options.json) {
    writeJson(io, result);
  } else {
    write(io, `Created ${configPath}\n`);
  }
  return 0;
}

function doctorCommand(options, io) {
  const config = loadConfig(process.cwd());
  const report = buildDoctorReport(config);
  if (options.json) {
    writeJson(io, createSuccessEnvelope('doctor', report, config));
  } else {
    write(io, formatDoctorReport(report));
  }
  return report.status === 'error' ? 1 : 0;
}

async function capabilitiesCommand(options, io) {
  const agentResult = await executeCliAgentOperation({
    positionals: ['capabilities'],
    options
  });
  if (options.json) {
    writeJson(io, createSuccessEnvelope('capabilities', { agentResult }));
  } else {
    const operations = agentResult.resource.data?.operations ?? [];
    write(io, `Launchdeck Agent capabilities: ${operations.length} operations (${agentResult.resource.data?.riskBoundary ?? 'unknown'} risk boundary)\n`);
    for (const operation of operations) {
      write(io, `- ${operation.name} (${operation.kind})\n`);
    }
  }
  return 0;
}

async function diagnoseCommand(options, io) {
  const stateHome = globalRuntimePaths().homeDir;
  const configPath = findConfig(process.cwd());
  const diagnosticChecks = {
    runtime: () => ({ status: 'healthy', code: 'runtime_available', nodeVersion: process.version }),
    compatibility: () => ({
      status: 'healthy',
      code: 'compatibility_manifest_loaded',
      buildIdentity: cliAgentProvenance().buildIdentity
    }),
    state: () => ({
      status: fs.existsSync(stateHome) ? 'healthy' : 'unavailable',
      code: fs.existsSync(stateHome) ? 'state_home_available' : 'state_home_not_created'
    }),
    registry: () => ({ status: 'healthy', code: 'registry_readable', projectCount: listRegisteredProjects().length }),
    journal: () => ({ status: 'healthy', code: 'journal_authority_available' }),
    skill: () => ({
      status: fs.existsSync(new URL('../.agents/skills/launchdeck-agent/SKILL.md', import.meta.url)) ? 'healthy' : 'unavailable',
      code: fs.existsSync(new URL('../.agents/skills/launchdeck-agent/SKILL.md', import.meta.url))
        ? 'canonical_skill_available'
        : 'canonical_skill_unavailable'
    }),
    project: () => ({
      status: configPath ? 'healthy' : 'unavailable',
      code: configPath ? 'project_config_available' : 'project_config_not_found'
    }),
    transport: () => ({ status: 'healthy', code: 'standalone_cli_available' })
  };
  const agentResult = await executeCliAgentOperation({
    positionals: ['diagnose'],
    options,
    capabilitiesOptions: { diagnosticChecks }
  });
  const checks = agentResult.resource.data?.checks ?? {};
  if (options.json) {
    writeJson(io, createSuccessEnvelope('diagnose', { checks, agentResult }));
  } else {
    write(io, `Launchdeck Agent diagnosis: ${agentResult.resource.status}\n`);
    for (const [name, check] of Object.entries(checks)) {
      write(io, `- ${name}: ${check.status ?? 'unknown'}\n`);
    }
  }
  return 0;
}

async function tasksCommand(options, io) {
  const config = loadConfig(process.cwd());
  const tasks = Object.values(config.tasks).map(toTaskInventoryItem);
  const project = cliProject(config);
  const agentResult = await executeCliAgentOperation({
    positionals: ['tasks'],
    options,
    project,
    taskHandlers: createTaskHandlers({ listTasks: async () => tasks })
  });
  if (options.json) {
    writeJson(
      io,
      createSuccessEnvelope(
        'tasks',
        {
          project: config.project,
          tasks,
          agentResult
        },
        config
      )
    );
  } else {
    writeTasksReport(config, tasks, io);
  }
  return 0;
}

async function projectCommand(positionals, options, io) {
  const subcommand = positionals[1] ?? 'list';
  if (subcommand === 'add') {
    const target = positionals[2] ?? process.cwd();
    const config = loadConfig(target);
    const project = await addProjectToRegistry(config, {
      alias: options.alias,
      name: options.name,
      env: process.env
    });
    const payload = {
      [project.registryAction]: true,
      project,
      registryPath: globalRuntimePaths().registryPath
    };
    if (options.json) {
      writeJson(io, createSuccessEnvelope('project', payload));
    } else {
      write(io, `Registered ${project.name} (${project.projectRoot})\n`);
    }
    return 0;
  }

  if (subcommand === 'repair') {
    const target = positionals[2];
    if (!target) {
      throw new LaunchdeckError('invalid_arguments', '`launchdeck project repair` requires an alias, id, name, or path.');
    }
    const result = await repairProjectRegistration(target, {
      alias: options.alias,
      projectRoot: options.path,
      configPath: options.config,
      env: process.env
    });
    const payload = {
      action: 'repair',
      registryPath: globalRuntimePaths().registryPath,
      ...result
    };
    if (options.json) {
      writeJson(io, createSuccessEnvelope('project', payload));
    } else {
      write(io, `Repaired ${result.after.alias} (${result.after.projectRoot})\n`);
    }
    return 0;
  }

  if (subcommand === 'remove' || subcommand === 'rm') {
    const target = positionals[2];
    if (!target) {
      throw new LaunchdeckError('invalid_arguments', '`launchdeck project remove` requires a name, id, or path.');
    }
    const removed = await removeProjectFromRegistry(target);
    const payload = {
      action: 'remove',
      removed,
      registryPath: globalRuntimePaths().registryPath
    };
    if (options.json) {
      writeJson(io, createSuccessEnvelope('project', payload));
    } else {
      write(io, `Removed ${removed.name} from registry. Project files were not deleted.\n`);
    }
    return 0;
  }

  if (subcommand === 'scan') {
    const root = positionals[2];
    if (!root) {
      throw new LaunchdeckError('invalid_arguments', '`launchdeck project scan` requires a directory.');
    }
    const result = await scanProjectsIntoRegistry(root);
    const payload = {
      action: 'scan',
      registryPath: globalRuntimePaths().registryPath,
      ...result
    };
    if (options.json) {
      writeJson(io, createSuccessEnvelope('project', payload));
    } else if (result.registered.length === 0) {
      write(io, `No Launchdeck projects found under ${result.root}.\n`);
    } else {
      for (const project of result.registered) {
        write(io, `Registered ${project.name} (${project.projectRoot})\n`);
      }
      if (result.truncated) {
        write(io, 'Scan stopped at the configured safety limit.\n');
      }
    }
    return result.errors.length > 0 && result.registered.length === 0 ? 1 : 0;
  }

  if (subcommand === 'list' || subcommand === 'ls') {
    return projectsCommand(options, io);
  }

  throw new LaunchdeckError('unknown_command', `Unknown project command '${subcommand}'.`, {
    command: 'project',
    subcommand
  });
}

function agentCommand(positionals, options, io) {
  const subcommand = positionals[1] ?? 'paths';

  if (subcommand === 'paths') {
    const result = {
      action: 'paths',
      ...listAgentTargets()
    };
    if (options.json) {
      writeJson(io, createSuccessEnvelope('agent', result));
    } else {
      writeAgentPathsReport(result, io);
    }
    return 0;
  }

  if (subcommand === 'doctor') {
    const report = {
      action: 'doctor',
      ...doctorAgentInstaller()
    };
    if (options.json) {
      writeJson(io, createSuccessEnvelope('agent', report));
    } else {
      writeAgentDoctorReport(report, io);
    }
    return report.status === 'error' ? 1 : 0;
  }

  if (subcommand === 'install') {
    const result = {
      action: 'install',
      ...installAgentSkill({
        agent: options.agent,
        scope: options.scope ?? 'project',
        target: options.target,
        dryRun: options.dryRun,
        force: options.force
      })
    };
    if (options.json) {
      writeJson(io, createSuccessEnvelope('agent', result));
    } else {
      writeAgentInstallReport(result, io);
    }
    return 0;
  }

  throw new LaunchdeckError('unknown_command', `Unknown agent command '${subcommand}'.`, {
    command: 'agent',
    subcommand,
    supportedCommands: ['paths', 'doctor', 'install']
  });
}

async function projectsCommand(options, io) {
  const projects = listRegisteredProjects();
  const agentResult = await executeCliAgentOperation({
    positionals: ['projects'],
    options,
    projectHandlers: createProjectHandlers({ listProjects: async () => projects })
  });
  const payload = {
    registryPath: globalRuntimePaths().registryPath,
    projects,
    agentResult
  };
  if (options.json) {
    writeJson(io, createSuccessEnvelope('projects', payload));
  } else if (projects.length === 0) {
    write(io, 'No registered projects.\n');
  } else {
    write(io, `${pad('NAME', 24)} ${pad('ID', 12)} ROOT\n`);
    for (const project of projects) {
      write(io, `${pad(project.name, 24)} ${pad(project.id, 12)} ${project.projectRoot}\n`);
    }
  }
  return 0;
}

async function adoptionCommand(positionals, options, io) {
  if (positionals[1] !== 'inspect') {
    throw new LaunchdeckError('unknown_command', `Unknown adoption command '${positionals[1] ?? ''}'.`, {
      command: 'adoption',
      supportedCommands: ['inspect']
    });
  }
  const config = loadConfig(process.cwd());
  const project = cliProject(config);
  const agentResult = await executeCliAgentOperation({
    positionals: ['adoption', 'inspect'],
    options,
    project,
    adoptionHandlers: createAdoptionHandlers()
  });
  const payload = {
    ...(agentResult.resource.data ?? {}),
    agentResult
  };
  if (options.json) {
    writeJson(io, createSuccessEnvelope('adoption.inspect', payload, config));
  } else {
    const evidence = agentResult.resource.data?.evidence;
    write(io, `Adoption preview: ${evidence?.files?.length ?? 0} files inspected; no changes applied.\n`);
  }
  return 0;
}

async function operationCommand(positionals, options, io) {
  const subcommand = positionals[1];
  if (!['list', 'get', 'reconcile'].includes(subcommand)) {
    throw new LaunchdeckError('unknown_command', `Unknown operation command '${subcommand ?? ''}'.`, {
      command: 'operation',
      supportedCommands: ['list', 'get', 'reconcile']
    });
  }

  const journal = createOperationJournal({ env: process.env });
  let project;
  if (subcommand === 'list') {
    const projectTarget = positionals[2];
    if (!projectTarget) {
      throw new LaunchdeckError('invalid_arguments', '`launchdeck operation list` requires a registered project target.');
    }
    project = normalizeCliProject(resolveRegisteredProject(projectTarget));
    const before = options.createdBefore ?? new Date().toISOString();
    options = {
      ...options,
      operationName: options.operationName ?? 'task.start',
      createdBefore: before,
      createdAfter: options.createdAfter ?? new Date(Date.parse(before) - 15 * 60 * 1000).toISOString(),
      states: options.states ?? ['prepared', 'running', 'succeeded', 'failed', 'refused', 'indeterminate', 'reconciled'],
      limit: options.limit ?? 20
    };
  } else {
    const operationId = positionals[2];
    if (!operationId) {
      throw new LaunchdeckError('invalid_arguments', `\`launchdeck operation ${subcommand}\` requires an operation id.`);
    }
    try {
      const record = await journal.get(operationId);
      const projectRef = record.projectRef ?? {};
      project = {
        id: projectRef.projectId ?? projectRef.alias,
        projectId: projectRef.projectId ?? projectRef.alias,
        alias: projectRef.alias,
        name: projectRef.alias ?? projectRef.projectId
      };
    } catch {
      project = undefined;
    }
  }

  const agentResult = await executeCliAgentOperation({
    positionals: ['operation', subcommand, subcommand === 'list' ? undefined : positionals[2]].filter((entry) => entry !== undefined),
    options,
    project,
    operationHandlers: createOperationHandlers({ journal })
  });
  const payload = { ...(agentResult.resource.data ?? {}), agentResult };
  if (options.json) {
    if (agentResult.outcome.kind === 'succeeded') {
      writeJson(io, createSuccessEnvelope(`operation.${subcommand}`, payload));
    } else {
      const error = new LaunchdeckError(
        agentResult.error?.code ?? agentResult.outcome.code,
        agentResult.error?.message ?? agentResult.outcome.message,
        agentResult.error?.details ?? {}
      );
      writeJson(io, createFailureEnvelope(`operation.${subcommand}`, error, {}, payload));
    }
  } else if (subcommand === 'list') {
    const records = agentResult.resource.data?.records ?? [];
    write(io, `Found ${records.length} operation record(s).\n`);
    for (const record of records) write(io, `- ${record.operationId}: ${record.state}\n`);
  } else {
    const record = agentResult.resource.data?.record;
    write(io, `Operation ${record?.operationId ?? positionals[2]}: ${record?.state ?? agentResult.resource.status}\n`);
  }
  return agentResult.outcome.kind === 'succeeded' ? 0 : 1;
}

async function statusCommand(options, io) {
  if (!options.all) {
    throw new LaunchdeckError('invalid_arguments', '`launchdeck status` currently requires --all.');
  }

  const result = await buildGlobalStatus();
  if (options.json) {
    writeJson(io, createSuccessEnvelope('status', result));
  } else {
    write(io, `Launchdeck global status: ${result.summary.projects.total} projects, ${result.summary.processes.running} running, ${result.summary.ports.conflicts} conflicts\n`);
    for (const project of result.projects) {
      write(io, `- ${project.name}: ${project.status}\n`);
    }
  }
  return result.errors.length > 0 && result.projects.length === 0 ? 1 : 0;
}

async function conflictsCommand(options, io) {
  const result = await listGlobalConflicts();
  if (options.json) {
    writeJson(
      io,
      createSuccessEnvelope('conflicts', {
        scope: 'global',
        conflicts: result.conflicts,
        errors: result.errors
      })
    );
  } else if (result.conflicts.length === 0) {
    write(io, 'No declared port conflicts in registered projects.\n');
  } else {
    write(io, `${pad('PORT', 8)} ${pad('PROJECT', 24)} ${pad('TASK', 16)} TYPE\n`);
    for (const conflict of result.conflicts) {
      write(io, `${pad(String(conflict.port), 8)} ${pad(conflict.project.name, 24)} ${pad(conflict.task, 16)} ${conflict.type}\n`);
    }
  }
  return result.errors.length > 0 && result.conflicts.length === 0 ? 1 : 0;
}

async function runCommand(taskName, options, io) {
  if (!taskName) {
    throw new LaunchdeckError('task_required', '`launchdeck run` requires a task name.');
  }
  return runConfiguredTask(taskName, options, io);
}

async function runConfiguredTask(taskName, options, io, metadata = {}) {
  const config = loadConfig(process.cwd());
  const task = requireTask(config, taskName);
  if (isSharedLifecycleTask(task)) {
    const operation = task.longRunning ? 'task.start' : 'task.run';
    const executed = await executeSharedTaskMutation({
      operation,
      positionals: [metadata.alias ?? 'run', taskName],
      options,
      config,
      taskName,
      task,
      project: cliProject(config),
      global: false
    });
    if (executed.agentResult.outcome.kind === 'refused') {
      return writeAgentFailure('run', executed.agentResult, options, io, config, {
        task: taskName,
        ...metadata
      }, executed.legacy.ownership);
    }
    if (task.longRunning) {
      const processInfo = executed.legacy.run;
      writeTaskStart(processInfo, options, io, {
        command: 'run',
        context: config,
        payload: {
          task: taskName,
          ...metadata,
          agentResult: executed.agentResult
        }
      });
      return 0;
    }
    const result = executed.legacy.runResult;
    if (options.json) {
      const payload = {
        task: taskName,
        ...metadata,
        ...result,
        agentResult: executed.agentResult
      };
      if (result.code === 0) {
        writeJson(io, createSuccessEnvelope('run', payload, config));
      } else {
        writeJson(io, createFailureEnvelope(
          'run',
          new LaunchdeckError('task_command_failed', `Task '${taskName}' exited with code ${result.code}.`, {
            task: taskName,
            code: result.code
          }),
          config,
          payload
        ));
      }
    }
    return result.code;
  }
  if (task.longRunning) {
    const processInfo = await startManagedRunWithContext(taskName, task, config, {
      beforeStart: () => assertTaskPortsAvailable(config, taskName, task)
    });
    writeTaskStart(processInfo, options, io, {
      command: 'run',
      context: config,
      payload: {
        task: taskName,
        ...metadata
      }
    });
    return 0;
  }

  const result = await runTask(task, config.projectRoot, { captureOutput: options.json });
  if (options.json) {
    const payload = {
      task: taskName,
      ...metadata,
      ...result
    };
    if (result.code === 0) {
      writeJson(io, createSuccessEnvelope('run', payload, config));
    } else {
      writeJson(
        io,
        createFailureEnvelope(
          'run',
          new LaunchdeckError(
            'task_command_failed',
            `Task '${taskName}' exited with code ${result.code}.`,
            { task: taskName, code: result.code }
          ),
          config,
          payload
        )
      );
    }
  }
  return result.code;
}

async function startCommand(taskName, options, io, commandName = 'start') {
  if (isGlobalTaskTarget(taskName)) {
    return startGlobalTaskCommand(taskName, options, io, commandName);
  }

  const config = loadConfig(process.cwd());
  const resolvedTaskName = taskName ?? (config.tasks.start ? 'start' : 'dev');
  const task = requireTask(config, resolvedTaskName);
  requireManagedTask(config, resolvedTaskName, task);
  if (isSharedLifecycleTask(task)) {
    const executed = await executeSharedTaskMutation({
      operation: 'task.start',
      positionals: [commandName, resolvedTaskName],
      options,
      config,
      taskName: resolvedTaskName,
      task,
      project: cliProject(config),
      global: false
    });
    if (executed.agentResult.outcome.kind === 'refused') {
      return writeAgentFailure(commandName, executed.agentResult, options, io, config, {
        task: resolvedTaskName
      }, executed.legacy.ownership);
    }
    const processInfo = executed.legacy.run;
    writeTaskStart(processInfo, options, io, {
      command: commandName,
      context: config,
      payload: {
        task: resolvedTaskName,
        readiness: processInfo.readiness,
        agentResult: executed.agentResult
      }
    });
    return 0;
  }
  const processInfo = await startManagedRunWithContext(resolvedTaskName, task, config, {
    beforeStart: () => assertTaskPortsAvailable(config, resolvedTaskName, task)
  });
  writeTaskStart(processInfo, options, io, {
    command: commandName,
    context: config,
    payload: {
      task: resolvedTaskName,
      readiness: processInfo.readiness
    }
  });
  return 0;
}

async function restartCommand(taskName, options, io) {
  if (isGlobalTaskTarget(taskName)) {
    return restartGlobalTaskCommand(taskName, options, io);
  }

  const config = loadConfig(process.cwd());
  const resolvedTaskName = taskName ?? (config.tasks.start ? 'start' : 'dev');
  const task = requireTask(config, resolvedTaskName);
  requireManagedTask(config, resolvedTaskName, task);

  if (isSharedLifecycleTask(task)) {
    const executed = await executeSharedTaskMutation({
      operation: 'task.restart',
      positionals: ['restart', resolvedTaskName],
      options,
      config,
      taskName: resolvedTaskName,
      task,
      project: cliProject(config),
      global: false
    });
    if (executed.agentResult.outcome.kind === 'refused') {
      return writeAgentFailure('restart', executed.agentResult, options, io, config, {
        task: resolvedTaskName
      }, executed.legacy.ownership);
    }
    const legacy = executed.legacy.restart;
    if (executed.agentResult.outcome.kind === 'partial' || executed.agentResult.outcome.kind === 'failed') {
      if (!options.json) throw legacy.error;
      if (legacy.error?.code === 'port_release_timeout') {
        writeJson(io, createFailureEnvelope('restart', legacy.error, config, {
          agentResult: executed.agentResult
        }));
        return 1;
      }
      const results = legacy.phase === 'start'
        ? [
            { task: resolvedTaskName, ok: true, status: 'stopped' },
            { task: resolvedTaskName, ok: false, status: 'start_failed', error: legacy.error }
          ]
        : [{ task: resolvedTaskName, ok: false, status: 'stop_failed', error: legacy.error }];
      writeJson(io, createPartialEnvelope('restart', results, config, {
        agentResult: executed.agentResult
      }));
      return 1;
    }
    const processInfo = legacy.startedRun;
    writeTaskStart(processInfo, options, io, {
      command: 'restart',
      context: config,
      payload: {
        task: resolvedTaskName,
        readiness: processInfo.readiness,
        agentResult: executed.agentResult
      }
    });
    return 0;
  }

  let stopped;
  try {
    stopped = stopManagedTasks(config.projectRoot, resolvedTaskName);
  } catch (error) {
    withErrorContext(error, config);
    if (!options.json) {
      throw error;
    }
    writeJson(
      io,
      createPartialEnvelope(
        'restart',
        [
          {
            task: resolvedTaskName,
            ok: false,
            status: 'stop_failed',
            error
          }
        ],
        config
      )
    );
    return 1;
  }

  try {
    const processInfo = await startManagedRunWithContext(resolvedTaskName, task, config, {
      beforeStart: () => assertTaskPortsAvailable(config, resolvedTaskName, task)
    });
    writeTaskStart(processInfo, options, io, {
      command: 'restart',
      context: config,
      payload: {
        task: resolvedTaskName,
        readiness: processInfo.readiness
      }
    });
    return 0;
  } catch (error) {
    withErrorContext(error, config);
    if (!options.json) {
      throw error;
    }
    writeJson(
      io,
      createPartialEnvelope(
        'restart',
        [
          {
            task: resolvedTaskName,
            ok: true,
            status: 'stopped'
          },
          {
            task: resolvedTaskName,
            ok: false,
            status: 'start_failed',
            error
          }
        ],
        config
      )
    );
    return 1;
  }
}

async function reconcileCommand(target, options, io) {
  const result = await reconcileManagedRuns(target, { env: process.env });
  if (options.json) {
    writeJson(io, createSuccessEnvelope('reconcile', result));
  } else {
    write(io, `Reconciled ${result.updatedRuns.length} run(s), ${result.staleRuns.length} stale, ${result.unresolved.length} unresolved.\n`);
  }
  return 0;
}

function psCommand(options, io) {
  if (options.all) {
    return globalPsCommand(options, io);
  }

  const config = loadConfig(process.cwd());
  let processes;
  try {
    processes = listProcesses(config.projectRoot);
  } catch (error) {
    withErrorContext(error, config);
    throw error;
  }
  if (options.json) {
    writeJson(io, createSuccessEnvelope('ps', { processes }, config));
  } else if (processes.length === 0) {
    write(io, 'No managed processes.\n');
  } else {
    write(io, `${pad('TASK', 16)} ${pad('PID', 8)} ${pad('STATUS', 10)} PORTS LOG\n`);
    for (const processInfo of processes) {
      write(
        io,
        `${pad(processInfo.name, 16)} ${pad(String(processInfo.pid), 8)} ${pad(processInfo.status, 10)} ${pad(processInfo.ports.join(','), 5)} ${processInfo.logPath}\n`
      );
    }
  }
  return 0;
}

function globalPsCommand(options, io) {
  const result = listGlobalProcesses();
  if (options.json) {
    writeJson(
      io,
      createSuccessEnvelope('ps', {
        scope: 'global',
        runs: result.processes,
        processes: result.processes,
        errors: result.errors
      })
    );
  } else if (result.processes.length === 0) {
    write(io, 'No managed processes in registered projects.\n');
  } else {
    write(io, `${pad('PROJECT', 24)} ${pad('TASK', 16)} ${pad('PID', 8)} ${pad('STATUS', 10)} PORTS LOG\n`);
    for (const processInfo of result.processes) {
      write(
        io,
        `${pad(processInfo.project.name, 24)} ${pad(processInfo.task, 16)} ${pad(String(processInfo.pid), 8)} ${pad(processInfo.status, 10)} ${pad(processInfo.ports.join(','), 5)} ${processInfo.logPath}\n`
      );
    }
  }
  return result.errors.length > 0 && result.processes.length === 0 ? 1 : 0;
}

async function portsCommand(options, io) {
  const result = await listGlobalPorts();
  if (options.json) {
    writeJson(
      io,
      createSuccessEnvelope('ports', {
        ports: result.ports,
        conflicts: result.conflicts ?? [],
        errors: result.errors
      })
    );
  } else if (result.ports.length === 0) {
    write(io, 'No declared managed ports in registered projects.\n');
  } else {
    write(io, `${pad('PORT', 8)} ${pad('PROJECT', 24)} ${pad('TASK', 16)} ${pad('STATUS', 18)} OWNER\n`);
    for (const entry of result.ports) {
      write(
        io,
        `${pad(String(entry.port), 8)} ${pad(entry.project.name, 24)} ${pad(entry.task, 16)} ${pad(entry.process.status, 18)} ${entry.ownership}\n`
      );
    }
  }
  return result.errors.length > 0 && result.ports.length === 0 ? 1 : 0;
}

async function inspectPortCommand(rawPort, options, io) {
  if (!rawPort) {
    throw new LaunchdeckError('invalid_arguments', '`launchdeck inspect-port` requires a port.');
  }

  const result = await inspectPort(rawPort);
  if (options.json) {
    writeJson(io, createSuccessEnvelope('inspect-port', result));
  } else {
    write(io, `Port ${result.port}: ${result.ownerType}\n`);
    if (result.listeners.length > 0) {
      for (const listener of result.listeners) {
        write(io, `- listener pid=${listener.pid ?? 'unknown'} ${listener.localAddress}:${listener.port} (${listener.source})\n`);
      }
    }
    if (result.declaredOwners.length > 0) {
      for (const owner of result.declaredOwners) {
        write(io, `- declared by ${owner.project.name}:${owner.task} (${owner.process.status})\n`);
      }
    }
  }
  return 0;
}

async function inspectCommand(rawTarget, options, io) {
  if (!rawTarget) {
    throw new LaunchdeckError('invalid_arguments', '`launchdeck inspect` requires a target.');
  }

  let result;
  const agentResult = await executeCliAgentOperation({
    positionals: ['inspect', rawTarget],
    options,
    projectResolver: async () => {
      result = await inspectTarget(rawTarget);
      const project = normalizeCliProject(result.project);
      return project ? resolvedCliProjectContext(project) : unresolvedCliProjectContext();
    },
    projectHandlers: createProjectHandlers({
      inspectProject: async () => result ?? inspectTarget(rawTarget)
    })
  });
  result ??= await inspectTarget(rawTarget);
  if (options.json) {
    writeJson(io, createSuccessEnvelope('inspect', { ...result, agentResult }));
  } else {
    write(io, `Inspect ${result.target.raw ?? rawTarget}: ${result.classification ?? result.status ?? 'unknown'}\n`);
    if (result.project) {
      write(io, `Project: ${result.project.name ?? result.project.alias ?? result.project.id}\n`);
    }
    if (result.task) {
      write(io, `Task: ${result.task.name ?? result.task}\n`);
    }
    if (result.run) {
      write(io, `Run: ${result.run.runId ?? 'unknown'} (${result.run.status ?? 'unknown'})\n`);
    }
    for (const listener of result.listeners ?? []) {
      write(io, `- listener pid=${listener.pid ?? 'unknown'} ${listener.localAddress ?? 'unknown'}:${listener.port ?? 'unknown'}\n`);
    }
    for (const action of result.blockedActions ?? []) {
      write(io, `- blocked: ${action.label ?? action.command ?? action}\n`);
    }
  }
  return 0;
}

async function logsCommand(taskName, options, io) {
  if (isGlobalTaskTarget(taskName)) {
    return await globalLogsCommand(taskName, options, io);
  }

  const config = loadConfig(process.cwd());
  const resolvedTaskName = taskName ?? 'dev';
  if (options.follow) {
    const result = tailLogWithContext(config.projectRoot, resolvedTaskName, options.lines, config);
    return await followLog(result, {
      task: result.taskName,
      run: runForLog(config.projectRoot, result.taskName, result.logPath),
      project: {
        id: stableProjectId(config.projectRoot),
        projectId: stableProjectId(config.projectRoot),
        name: config.project.name,
        projectRoot: config.projectRoot,
        configPath: config.configPath
      }
    }, options, io);
  }
  let result;
  const agentResult = await executeCliAgentOperation({
    positionals: ['logs', resolvedTaskName],
    options,
    project: cliProject(config),
    taskHandlers: createTaskHandlers({
      readTaskLogLines: async () => {
        result = tailLogWithContext(config.projectRoot, resolvedTaskName, options.lines, config);
        return splitObservationLines(result.content);
      }
    })
  });
  result ??= tailLogWithContext(config.projectRoot, resolvedTaskName, options.lines, config);
  if (options.json) {
    writeJson(
      io,
      createSuccessEnvelope(
        'logs',
        {
          task: result.taskName,
          logPath: result.logPath,
          content: result.content,
          agentResult
        },
        config
      )
    );
  } else if (result.content) {
    write(io, `${result.content}\n`);
  } else {
    write(io, `No logs found for ${resolvedTaskName} at ${result.logPath}\n`);
  }
  return 0;
}

async function globalLogsCommand(target, options, io) {
  const { projectTarget, taskName } = parseGlobalTaskTarget(target);
  let project;
  try {
    project = resolveRegisteredProject(projectTarget);
  } catch (error) {
    if (options.follow && error?.code === 'project_not_found') {
      throw new LaunchdeckError('unsupported_option', '`launchdeck logs --follow` requires a registered project target.', {
        target
      });
    }
    throw error;
  }
  const config = loadRegisteredConfig(project);
  const result = tailLogWithContext(config.projectRoot, taskName, options.lines, config);
  const projectPayload = {
    id: project.id,
    projectId: project.projectId ?? project.id,
    alias: project.alias,
    name: config.project.name,
    projectRoot: config.projectRoot,
    configPath: config.configPath
  };
  if (options.follow) {
    return await followLog(result, {
      task: result.taskName,
      run: runForLog(config.projectRoot, result.taskName, result.logPath),
      project: projectPayload
    }, options, io);
  }

  let boundedResult;
  const agentResult = await executeCliAgentOperation({
    positionals: ['logs', taskName],
    options,
    project: normalizeCliProject(projectPayload),
    taskHandlers: createTaskHandlers({
      readTaskLogLines: async () => {
        boundedResult = result;
        return splitObservationLines(result.content);
      }
    })
  });
  boundedResult ??= result;

  if (options.json) {
    writeJson(
      io,
      createSuccessEnvelope(
        'logs',
        {
          project: projectPayload,
          task: result.taskName,
          logPath: result.logPath,
          content: result.content,
          agentResult
        },
        config
      )
    );
  } else if (result.content) {
    write(io, `${result.content}\n`);
  } else {
    write(io, `No logs found for ${config.project.name}:${taskName} at ${result.logPath}\n`);
  }
  return 0;
}

async function eventsCommand(target, options, io) {
  const homeDir = globalRuntimePaths().homeDir;
  if (options.follow) {
    return await followEvents(target, options, io, homeDir);
  }

  let result;
  let agentResult;
  if (target) {
    const scope = await resolveEventScope(target, homeDir);
    agentResult = await executeCliAgentOperation({
      positionals: ['events'],
      options,
      project: scope.project,
      context: { taskRef: scope.taskRef, runId: scope.runId },
      taskHandlers: createTaskHandlers({
        readTaskEvents: async () => {
          result = await readEvents({ homeDir, limit: 1_000 });
          return {
            events: limitEventHistory(filterEventsForTarget(result.events, target), options.lines),
            warnings: result.warnings
          };
        }
      })
    });
  } else {
    agentResult = await executeCliAgentOperation({
      positionals: ['events'],
      options,
      taskHandlers: createTaskHandlers()
    });
  }
  result ??= await readEvents({
    homeDir,
    limit: target ? 1_000 : options.lines
  });
  const events = limitEventHistory(filterEventsForTarget(result.events, target), options.lines);
  const payload = {
    target: target ?? 'all',
    events,
    warnings: result.warnings,
    errors: result.errors,
    ...(agentResult ? { agentResult } : {})
  };
  if (options.json) {
    writeJson(io, createSuccessEnvelope('events', payload));
  } else if (events.length === 0) {
    write(io, 'No events found.\n');
  } else {
    for (const event of events) {
      write(io, `${event.timestamp ?? ''} ${event.level ?? 'info'} ${event.type ?? 'event'} ${event.message ?? ''}\n`);
    }
  }
  return result.errors.length > 0 && events.length === 0 ? 1 : 0;
}

async function resolveEventScope(target, homeDir) {
  if (target.startsWith('run:')) {
    const runId = target.slice('run:'.length);
    const source = await readEvents({ homeDir, limit: 1_000 });
    const event = [...source.events].reverse().find((entry) => entry.runId === runId);
    if (!event?.projectId && !event?.alias) {
      throw new LaunchdeckError('project_not_found', `No registered project scope was found for run '${runId}'.`, { runId });
    }
    const project = normalizeCliProject(resolveRegisteredProject(event.projectId ?? event.alias));
    return { project, runId, taskRef: event.task };
  }
  if (isGlobalTaskTarget(target)) {
    const { projectTarget, taskName } = parseGlobalTaskTarget(target);
    return {
      project: normalizeCliProject(resolveRegisteredProject(projectTarget)),
      taskRef: taskName,
      runId: undefined
    };
  }
  return {
    project: normalizeCliProject(resolveRegisteredProject(target)),
    taskRef: undefined,
    runId: undefined
  };
}

async function followLog(logResult, context, options, io) {
  if (!options.json) {
    return await followTextFile(logResult.logPath, (line) => write(io, `${redactLogLine(line)}\n`), {
      replayBytes: 8192
    });
  }

  return await followTextFile(logResult.logPath, (line) => {
    write(io, `${JSON.stringify(omitUndefined({
      schemaVersion: 1,
      type: 'log.line',
      timestamp: new Date().toISOString(),
      projectId: context.project?.projectId ?? context.project?.id ?? context.run?.projectId,
      alias: context.project?.alias ?? context.run?.projectAlias,
      task: context.task,
      runId: context.run?.runId,
      line: redactLogLine(line)
    }))}\n`);
  }, {
    replayBytes: 8192
  });
}

async function followEvents(target, options, io, homeDir) {
  const eventPath = eventsPath(homeDir);
  fs.mkdirSync(path.dirname(eventPath), { recursive: true });
  if (!fs.existsSync(eventPath)) {
    fs.writeFileSync(eventPath, '');
  }

  if (!options.json) {
    return await followTextFile(eventPath, (line) => {
      const event = parseJsonLine(line);
      if (event && eventMatchesTarget(event, target)) {
        write(io, `${event.timestamp ?? ''} ${event.level ?? 'info'} ${event.type ?? 'event'} ${event.message ?? ''}\n`);
      }
    });
  }

  return await followTextFile(eventPath, (line) => {
    const event = parseJsonLine(line);
    if (event && eventMatchesTarget(event, target)) {
      write(io, `${JSON.stringify(event)}\n`);
    }
  });
}

function followTextFile(filePath, onLine, options = {}) {
  return new Promise((resolve, reject) => {
    const initialSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    let position = Math.max(0, initialSize - (options.replayBytes ?? 0));
    let buffer = '';
    let watcher;
    let poller;
    let settled = false;

    const cleanup = () => {
      if (watcher) {
        watcher.close();
      }
      if (poller) {
        clearInterval(poller);
      }
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    };
    const finish = (code = 0) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(code);
    };
    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const onSignal = () => finish(0);
    const readNewContent = () => {
      try {
        if (!fs.existsSync(filePath)) {
          return;
        }
        const stats = fs.statSync(filePath);
        if (stats.size < position) {
          position = 0;
          buffer = '';
        }
        if (stats.size === position) {
          return;
        }
        const stream = fs.createReadStream(filePath, {
          encoding: 'utf8',
          start: position,
          end: stats.size - 1
        });
        position = stats.size;
        stream.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.length > 0) {
              onLine(line);
            }
          }
        });
        stream.once('error', fail);
      } catch (error) {
        fail(error);
      }
    };

    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    try {
      watcher = fs.watch(filePath, { persistent: true }, readNewContent);
      watcher.once('error', fail);
      poller = setInterval(readNewContent, 100);
      readNewContent();
    } catch (error) {
      fail(error);
    }
  });
}

function filterEventsForTarget(events, target) {
  return events.filter((event) => eventMatchesTarget(event, target));
}

function limitEventHistory(events, lines) {
  const limit = Number.isInteger(lines) && lines > 0 ? lines : 80;
  return events.slice(Math.max(0, events.length - limit));
}

function eventMatchesTarget(event, target) {
  if (!target) {
    return true;
  }
  if (target.startsWith('run:')) {
    return event.runId === target.slice('run:'.length);
  }
  if (isGlobalTaskTarget(target)) {
    const { projectTarget, taskName } = parseGlobalTaskTarget(target);
    return event.task === taskName && eventMatchesProjectTarget(event, projectTarget);
  }
  return eventMatchesProjectTarget(event, target);
}

function eventMatchesProjectTarget(event, projectTarget) {
  if (!projectTarget) {
    return true;
  }
  return event.projectId === projectTarget || event.alias === projectTarget;
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function runForLog(projectRoot, taskName, logPath) {
  const localRun = localRunForLog(projectRoot, taskName, logPath);
  const globalRun = globalRunForLog(projectRoot, taskName, logPath);
  return newestRun([localRun, globalRun].filter(Boolean));
}

function localRunForLog(projectRoot, taskName, logPath) {
  try {
    const state = readState(projectRoot);
    const processInfo = state.processes?.[taskName];
    if (!processInfo) {
      return undefined;
    }
    return {
      ...processInfo,
      projectId: processInfo.projectId,
      projectAlias: processInfo.projectAlias,
      runId: processInfo.runId,
      logPath: processInfo.logPath ?? logPath
    };
  } catch {
    return undefined;
  }
}

function globalRunForLog(projectRoot, taskName, logPath) {
  try {
    const runs = readRunIndex().runs.filter((run) =>
      run.task === taskName
      && samePath(run.projectRoot, projectRoot)
      && (!run.logPath || samePath(run.logPath, logPath))
    );
    return newestRun(runs);
  } catch {
    return undefined;
  }
}

function newestRun(runs) {
  return runs.sort((left, right) =>
    timestampMs(right.lastObservedAt) - timestampMs(left.lastObservedAt)
    || timestampMs(right.startedAt) - timestampMs(left.startedAt)
  )[0];
}

async function startGlobalTaskCommand(target, options, io, commandName = 'start') {
  const { projectTarget, taskName } = parseGlobalTaskTarget(target);
  const project = resolveRegisteredProject(projectTarget);
  const config = loadRegisteredConfig(project);
  const task = requireTask(config, taskName);
  requireManagedTask(config, taskName, task);
  if (isSharedLifecycleTask(task)) {
    const executed = await executeSharedTaskMutation({
      operation: 'task.start',
      positionals: [commandName, taskName],
      options,
      config,
      taskName,
      task,
      project,
      global: true
    });
    if (executed.agentResult.outcome.kind === 'refused') {
      return writeAgentFailure(commandName, executed.agentResult, options, io, config, {
        project: { id: project.id, name: config.project.name },
        task: taskName
      }, executed.legacy.ownership);
    }
    const processInfo = executed.legacy.run;
    writeTaskStart(processInfo, options, io, {
      command: commandName,
      context: config,
      payload: {
        project: { id: project.id, name: config.project.name },
        task: taskName,
        readiness: processInfo.readiness,
        agentResult: executed.agentResult
      }
    });
    return 0;
  }
  const processInfo = await startManagedRunWithContext(taskName, task, config, {
    project,
    global: true,
    env: process.env,
    beforeStart: async () => {
      assertProjectStillRegistered(project);
      await assertTaskPortsAvailable(config, taskName, task);
    }
  });
  writeTaskStart(processInfo, options, io, {
    command: commandName,
    context: config,
    payload: {
      project: {
        id: project.id,
        name: config.project.name
      },
      task: taskName,
      readiness: processInfo.readiness
    }
  });
  return 0;
}

async function restartGlobalTaskCommand(target, options, io) {
  const { projectTarget, taskName } = parseGlobalTaskTarget(target);
  const project = resolveRegisteredProject(projectTarget);
  const config = loadRegisteredConfig(project);
  const task = requireTask(config, taskName);
  requireManagedTask(config, taskName, task);
  if (isSharedLifecycleTask(task)) {
    const executed = await executeSharedTaskMutation({
      operation: 'task.restart',
      positionals: ['restart', taskName],
      options,
      config,
      taskName,
      task,
      project,
      global: true
    });
    if (executed.agentResult.outcome.kind === 'refused') {
      return writeAgentFailure('restart', executed.agentResult, options, io, config, {
        project: { id: project.id, name: config.project.name },
        task: taskName
      }, executed.legacy.ownership);
    }
    const legacy = executed.legacy.restart;
    if (executed.agentResult.outcome.kind === 'partial' || executed.agentResult.outcome.kind === 'failed') {
      if (!options.json) throw legacy.error;
      if (legacy.error?.code === 'port_release_timeout') {
        writeJson(io, createFailureEnvelope('restart', legacy.error, config, {
          agentResult: executed.agentResult
        }));
        return 1;
      }
      const results = legacy.phase === 'start'
        ? [
            { task: taskName, ok: true, status: 'stopped' },
            { task: taskName, ok: false, status: 'start_failed', error: legacy.error }
          ]
        : [{ task: taskName, ok: false, status: 'stop_failed', error: legacy.error }];
      writeJson(io, createPartialEnvelope('restart', results, config, {
        agentResult: executed.agentResult
      }));
      return 1;
    }
    const result = {
      project: normalizeCliProject(project),
      task: taskName,
      stoppedRun: legacy.stopped[0] ?? null,
      startedRun: legacy.startedRun,
      transactionId: legacy.transactionId,
      agentResult: executed.agentResult
    };
    if (options.json) {
      writeJson(io, createSuccessEnvelope('restart', result, config));
    } else {
      write(io, `Restarted ${result.project.name}:${result.task} (${result.startedRun.pid}).\n`);
    }
    return 0;
  }
  const result = await restartManagedRun(target, { env: process.env });
  const context = lifecycleResultContext(result);

  if (options.json) {
    writeJson(io, createSuccessEnvelope('restart', result, context));
  } else {
    write(io, `Restarted ${result.project.name}:${result.task} (${result.startedRun.pid}).\n`);
  }
  return 0;
}

async function stopGlobalTaskCommand(target, options, io) {
  if (!options.forceOwned) {
    const { projectTarget, taskName } = parseGlobalTaskTarget(target);
    const project = resolveRegisteredProject(projectTarget);
    const config = loadRegisteredConfig(project);
    const task = requireTask(config, taskName);
    if (isSharedLifecycleTask(task)) {
      const executed = await executeSharedTaskMutation({
        operation: 'task.stop',
        positionals: ['stop', taskName],
        options,
        config,
        taskName,
        task,
        project,
        global: true
      });
      if (executed.agentResult.outcome.kind === 'refused') {
        return writeAgentFailure('stop', executed.agentResult, options, io, config, {
          project: { id: project.id, name: config.project.name },
          task: taskName
        }, executed.legacy.ownership);
      }
      const stopped = executed.legacy.stopped;
      const payload = {
        project: normalizeCliProject(project),
        task: taskName,
        stopped,
        failed: [],
        agentResult: executed.agentResult
      };
      if (options.json) {
        writeJson(io, createSuccessEnvelope('stop', payload, config));
      } else if (stopped.length === 0) {
        write(io, `No managed process found for ${target}.\n`);
      } else {
        write(io, `Stopped ${payload.project.name}:${taskName} (${stopped[0].pid}).\n`);
      }
      return 0;
    }
  }
  return stopGlobalLifecycleCommand(target, options, io, 'stop', { forceOwned: options.forceOwned });
}

async function forceStopCommand(taskName, options, io) {
  if (!isGlobalTaskTarget(taskName)) {
    throw new LaunchdeckError('invalid_arguments', 'Force-stop target must use <project>:<task>.', {
      target: taskName
    });
  }
  return stopGlobalLifecycleCommand(taskName, options, io, 'force-stop', { forceOwned: true });
}

async function stopGlobalLifecycleCommand(target, options, io, commandName, actionOptions = {}) {
  const result = await stopManagedRun(target, {
    env: process.env,
    ...actionOptions
  });
  const context = lifecycleResultContext(result);
  if (options.json) {
    writeJson(io, createSuccessEnvelope(commandName, result, context));
  } else if (result.stopped.length === 0) {
    write(io, `No managed process found for ${target}.\n`);
  } else {
    write(io, `Stopped ${result.project.name}:${result.task} (${result.stopped[0].pid}).\n`);
  }
  return 0;
}

async function stopCommand(taskName, options, io) {
  if (isGlobalTaskTarget(taskName)) {
    return stopGlobalTaskCommand(taskName, options, io);
  }

  const config = loadConfig(process.cwd());
  const task = taskName ? config.tasks[taskName] : undefined;
  if (taskName && !options.forceOwned && isSharedLifecycleTask(task)) {
    const executed = await executeSharedTaskMutation({
      operation: 'task.stop',
      positionals: ['stop', taskName],
      options,
      config,
      taskName,
      task,
      project: cliProject(config),
      global: false
    });
    if (executed.agentResult.outcome.kind === 'refused') {
      return writeAgentFailure(
        'stop',
        executed.agentResult,
        options,
        io,
        config,
        { task: taskName },
        executed.legacy.ownership
      );
    }
    const stopped = executed.legacy.stopped;
    if (options.json) {
      writeJson(io, createSuccessEnvelope('stop', {
        process: stopped[0],
        agentResult: executed.agentResult
      }, config));
    } else if (stopped.length === 0) {
      write(io, `No managed process found for ${taskName}.\n`);
    } else {
      write(io, `Stopped ${stopped[0].name} (${stopped[0].pid}).\n`);
    }
    return 0;
  }
  let stopped;
  try {
    stopped = stopManagedTasksWithContext(config.projectRoot, taskName, config);
  } catch (error) {
    if (!options.json || error?.code !== 'partial_failure') {
      throw error;
    }
    writeJson(io, createPartialEnvelope('stop', partialStopResultsFromError(error), config));
    return 1;
  }
  if (options.json) {
    if (taskName) {
      writeJson(io, createSuccessEnvelope('stop', { process: stopped[0] }, config));
    } else {
      writeJson(
        io,
        createSuccessEnvelope(
          'stop',
          {
            results: stopped
              .map((processInfo) => ({
                task: processInfo.task,
                ok: processInfo.status === 'stopped',
                status: processInfo.status
              }))
              .sort((left, right) => left.task.localeCompare(right.task))
          },
          config
        )
      );
    }
  } else if (stopped.length === 0) {
    write(io, taskName ? `No managed process found for ${taskName}.\n` : 'No running managed processes.\n');
  } else {
    for (const processInfo of stopped) {
      write(io, `Stopped ${processInfo.name} (${processInfo.pid}).\n`);
    }
  }
  return 0;
}

async function cleanCommand(options, io) {
  const config = loadConfig(process.cwd());
  if (options.all) return cleanAllCommand(config, options, io);

  const mode = options.safe ? 'safe' : 'dry-run';
  const preview = await executeSharedCleanOperation({
    operation: 'clean.plan',
    config,
    options
  });
  const plan = preview.resource.data;
  const targets = cleanLegacyTargets(plan, mode);
  const refused = plan.refusals?.[0];

  if (preview.outcome.kind !== 'succeeded' || refused) {
    return writeCleanAgentFailure({
      config,
      options,
      io,
      mode,
      targets,
      agentResult: preview
    });
  }

  if (mode === 'dry-run') {
    const payload = {
      dryRun: true,
      mode,
      targets,
      removed: [],
      planDigest: plan.planDigest,
      agentResult: preview
    };
    if (options.json) {
      writeJson(io, createSuccessEnvelope('clean', payload, config));
    } else {
      write(io, 'Dry run. Use `launchdeck clean --safe` to remove safe targets.\n');
      writeCleanTargets(io, targets);
    }
    return 0;
  }

  const applied = await executeSharedCleanOperation({
    operation: 'clean.applySafe',
    config,
    options,
    planDigest: plan.planDigest
  });
  if (applied.outcome.kind !== 'succeeded') {
    return writeCleanAgentFailure({
      config,
      options,
      io,
      mode,
      targets: cleanLegacyTargets(applied.resource.data, mode),
      agentResult: applied
    });
  }

  const appliedData = applied.resource.data;
  const removed = appliedData.removed ?? [];
  if (options.json) {
    writeJson(
      io,
      createSuccessEnvelope(
        'clean',
        {
          dryRun: false,
          mode,
          targets: appliedData.targets ?? targets,
          removed,
          planDigest: appliedData.planDigest,
          agentResult: applied
        },
        config
      )
    );
  } else {
    for (const target of removed) {
      write(io, `${target.existed ? 'Removed' : 'Skipped missing'} ${target.path}\n`);
    }
  }
  return 0;
}

function cleanAllCommand(config, options, io) {
  const targets = resolveCleanTargets(config.projectRoot, config.clean, 'all');
  const refused = targets.find((target) => target.status === 'refused');
  if (refused) {
    const error = new LaunchdeckError(refused.refusalCode, cleanRefusalMessage(refused), cleanRefusalDetails(refused));
    const payload = { dryRun: true, mode: 'all', targets, removed: [] };
    if (options.json) writeJson(io, createFailureEnvelope('clean', error, config, payload));
    else {
      writeError(io, `launchdeck: [${refused.refusalCode}] ${error.message}\n`);
      writeCleanTargets(io, targets);
    }
    return 1;
  }
  if (!options.yes) {
    const error = new LaunchdeckError('confirmation_required', '`launchdeck clean --all` requires --yes.');
    const payload = { dryRun: true, mode: 'all', targets, removed: [] };
    if (options.json) writeJson(io, createFailureEnvelope('clean', error, config, payload));
    else {
      writeError(io, `launchdeck: [${error.code}] ${error.message}\n`);
      writeCleanTargets(io, targets);
    }
    return 1;
  }
  const removed = cleanTargets(targets);
  if (options.json) {
    writeJson(io, createSuccessEnvelope('clean', {
      dryRun: false,
      mode: 'all',
      targets,
      removed
    }, config));
  } else {
    for (const target of removed) write(io, `${target.existed ? 'Removed' : 'Skipped missing'} ${target.path}\n`);
  }
  return 0;
}

async function executeSharedCleanOperation(input) {
  const project = cliProject(input.config);
  return executeCliAgentOperation({
    positionals: ['clean'],
    options: {
      ...input.options,
      all: false,
      safe: input.operation === 'clean.applySafe'
    },
    context: { planDigest: input.planDigest },
    project,
    operationJournal: createOperationJournal({ env: process.env }),
    taskHandlers: createCleanHandlers({
      createPlan: async () => buildSafeCleanPlan(input.config, { env: process.env }),
      applySafe: async ({ plan }) => {
        const removed = applySafeCleanPlan(plan);
        return {
          removed,
          changed: removed.some((entry) => entry.existed === true),
          evidenceRefs: [
            `file:${input.config.configPath}`,
            `file:${runtimePaths(input.config.projectRoot).statePath}`
          ]
        };
      }
    })
  });
}

function cleanLegacyTargets(plan, mode) {
  const safeTargets = [...(plan.targets ?? []), ...(plan.refusals ?? [])];
  return mode === 'dry-run'
    ? [...safeTargets, ...(plan.excludedRiskyTargets ?? [])]
    : safeTargets;
}

function writeCleanAgentFailure(input) {
  const errorPayload = input.agentResult.error ?? {
    code: input.agentResult.outcome.code,
    message: input.agentResult.outcome.message,
    details: {}
  };
  const error = new LaunchdeckError(errorPayload.code, errorPayload.message, errorPayload.details);
  const payload = {
    dryRun: true,
    mode: input.mode,
    targets: input.targets,
    removed: [],
    planDigest: input.agentResult.resource.data?.planDigest,
    code: error.code,
    message: error.message,
    details: error.details,
    agentResult: input.agentResult
  };
  if (input.options.json) writeJson(input.io, createFailureEnvelope('clean', error, input.config, payload));
  else {
    writeError(input.io, `launchdeck: [${error.code}] ${error.message}\n`);
    writeCleanTargets(input.io, input.targets);
  }
  return 1;
}

function cleanRefusalDetails(refused) {
  return {
    rawPath: refused.rawPath ?? refused.path,
    resolvedPath: refused.resolvedPath ?? refused.absolutePath,
    canonicalPath: refused.canonicalPath
  };
}

function buildDoctorReport(config) {
  const checks = [
    {
      code: 'config_loaded',
      severity: 'info',
      status: 'pass',
      message: `Loaded ${config.configPath}`
    }
  ];

  for (const task of Object.values(config.tasks)) {
    const cwd = path.resolve(config.projectRoot, task.cwd);
    if (!isInside(config.projectRoot, cwd)) {
      checks.push({
        code: 'task_cwd_escapes_project',
        severity: 'error',
        status: 'fail',
        message: `cwd escapes project root: ${task.cwd}`,
        details: { task: task.name, cwd: task.cwd }
      });
      continue;
    }
    if (!fs.existsSync(cwd)) {
      checks.push({
        code: 'task_cwd_missing',
        severity: 'error',
        status: 'fail',
        message: `cwd does not exist: ${task.cwd}`,
        details: { task: task.name, cwd: task.cwd }
      });
      continue;
    }

    const executable = extractExecutable(task.command);
    if (executable && !commandExists(executable)) {
      checks.push({
        code: 'task_executable_missing',
        severity: 'warn',
        status: 'warn',
        message: `Executable not found on PATH: ${executable}`,
        details: { task: task.name, executable }
      });
    } else {
      checks.push({
        code: 'task_ready',
        severity: 'info',
        status: 'pass',
        message: task.longRunning
          ? `${task.command} (managed, ports: ${task.ports.join(',') || 'none'})`
          : task.command,
        details: { task: task.name }
      });
    }
  }

  try {
    resolveCleanTargets(config.projectRoot, config.clean, 'all');
    checks.push({
      code: 'clean_targets_ready',
      severity: 'info',
      status: 'pass',
      message: `${config.clean.safe.length} safe, ${config.clean.risky.length} risky targets`,
      details: {
        safe: config.clean.safe.length,
        risky: config.clean.risky.length
      }
    });
  } catch (error) {
    checks.push({
      code: 'clean_targets_invalid',
      severity: 'error',
      status: 'fail',
      message: error.message
    });
  }

  const summary = {
    ok: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    error: checks.filter((check) => check.status === 'fail').length
  };
  const status = summary.error > 0
    ? 'error'
    : summary.warn > 0
      ? 'warn'
      : 'ok';

  return {
    ok: status !== 'error',
    status,
    project: config.project,
    projectRoot: config.projectRoot,
    configPath: config.configPath,
    summary,
    checks
  };
}

function formatDoctorReport(report) {
  const lines = [
    `Launchdeck doctor: ${report.status}`,
    `Project: ${report.project.name}`,
    `Root: ${report.projectRoot}`,
    ''
  ];

  for (const check of report.checks) {
    lines.push(`[${check.status}] ${check.code}: ${check.message}`);
  }

  return `${lines.join('\n')}\n`;
}

function writeTasksReport(config, tasks, io) {
  write(io, `Launchdeck tasks for ${config.project.name}\n`);
  if (tasks.length === 0) {
    write(io, 'No tasks configured.\n');
    return;
  }
  write(io, `${pad('TASK', 16)} ${pad('TYPE', 10)} ${pad('RISK', 12)} ${pad('PORTS', 10)} COMMAND\n`);
  for (const task of tasks) {
    write(
      io,
      `${pad(task.name, 16)} ${pad(task.type, 10)} ${pad(task.risk, 12)} ${pad(task.ports.join(','), 10)} ${task.command}\n`
    );
  }
}

function writeAgentPathsReport(result, io) {
  write(io, `Launchdeck agent skill source: ${result.source.valid ? 'ok' : 'error'}\n`);
  write(io, `Source: ${result.source.path}\n`);
  write(io, `${pad('AGENT', 18)} ${pad('SCOPE', 8)} TARGET\n`);
  for (const target of result.targets) {
    write(io, `${pad(target.agent, 18)} ${pad(target.scope, 8)} ${target.skillRoot}\n`);
  }
}

function writeAgentDoctorReport(report, io) {
  write(io, `Launchdeck agent doctor: ${report.status}\n`);
  for (const check of report.checks) {
    write(io, `[${check.status}] ${check.code}: ${check.message}\n`);
  }
}

function writeAgentInstallReport(result, io) {
  write(io, `Launchdeck agent install: ${result.result.status}\n`);
  write(io, `Agent: ${result.agent}\n`);
  write(io, `Scope: ${result.scope}\n`);
  write(io, `Source: ${result.source.path}\n`);
  write(io, `Target: ${result.target.targetDir}\n`);
  if (result.dryRun) {
    write(io, 'Dry run: no files were changed.\n');
  }
  if (result.result.actions.length > 0) {
    write(io, `${result.result.actions.length} planned action(s).\n`);
  }
}

function requireTask(config, taskName) {
  const task = config.tasks[taskName];
  if (!task) {
    throw new LaunchdeckError('task_not_found', `Task '${taskName}' is not configured in ${config.configPath}.`, {
      task: taskName,
      projectRoot: config.projectRoot,
      configPath: config.configPath
    });
  }
  return task;
}

function requireManagedTask(config, taskName, task) {
  if (!task.longRunning) {
    throw new LaunchdeckError('task_not_managed', `Task '${taskName}' is not configured as a managed task.`, {
      task: taskName,
      projectRoot: config.projectRoot,
      configPath: config.configPath
    });
  }
}

function isGlobalTaskTarget(value) {
  return typeof value === 'string' && /^[^:]+:[^:]+$/.test(value);
}

function parseGlobalTaskTarget(value) {
  if (!isGlobalTaskTarget(value)) {
    throw new LaunchdeckError('invalid_arguments', 'Global task target must use <project>:<task>.', {
      target: value
    });
  }
  const [projectTarget, taskName] = value.split(':');
  return { projectTarget, taskName };
}

async function assertGlobalStopOwnership(config, taskName) {
  const processInfo = listProcesses(config.projectRoot).find((candidate) => candidate.task === taskName);
  if (!processInfo || processInfo.status !== 'running') {
    return;
  }

  for (const port of processInfo.ports ?? []) {
    const inspection = await inspectPort(port);
    if (inspection.listeners.length === 0) {
      continue;
    }
    const owned = inspection.listeners.some((listener) => listener.pid === processInfo.pid || listener.pid === undefined);
    if (!owned) {
      throw new LaunchdeckError('port_conflict', `Launchdeck cannot prove task '${taskName}' owns port ${port}.`, {
        task: taskName,
        pid: processInfo.pid,
        port,
        listeners: inspection.listeners,
        safeActions: [
          `launchdeck inspect-port ${port}`,
          'do not stop by port unless ownership is proven'
        ]
      });
    }
  }
}

function stopManagedTasksWithContext(projectRoot, taskName, config, options = {}) {
  try {
    return stopManagedTasks(projectRoot, taskName, options);
  } catch (error) {
    withErrorContext(error, config);
    throw error;
  }
}

function assertProjectStillRegistered(project) {
  const current = resolveRegisteredProject(project.projectId ?? project.id ?? project.alias);
  if (current.projectId !== project.projectId || !samePath(current.projectRoot, project.projectRoot)) {
    throw new LaunchdeckError('project_not_found', `Registered project '${project.alias ?? project.name}' changed during start.`, {
      projectId: project.projectId,
      alias: project.alias,
      projectRoot: project.projectRoot
    });
  }
  return current;
}

function samePath(left, right) {
  const leftPath = path.resolve(left);
  const rightPath = path.resolve(right);
  return process.platform === 'win32'
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath;
}

async function startManagedRunWithContext(taskName, task, config, options = {}) {
  try {
    return await startManagedRun(taskName, task, config, options);
  } catch (error) {
    withErrorContext(error, config);
    throw error;
  }
}

function tailLogWithContext(projectRoot, taskName, lines, config) {
  try {
    return tailLog(projectRoot, taskName, lines);
  } catch (error) {
    withErrorContext(error, config);
    throw error;
  }
}

function partialStopResultsFromError(error) {
  return (error.details?.failures ?? [])
    .map((failure) => ({
      task: failure.task,
      ok: false,
      status: 'stop_failed',
      error: failure.error
    }))
    .sort((left, right) => left.task.localeCompare(right.task));
}

function withErrorContext(error, config) {
  if (!error || typeof error !== 'object') {
    return;
  }
  error.details = {
    ...error.details,
    projectRoot: error.details?.projectRoot ?? config.projectRoot,
    configPath: error.details?.configPath ?? config.configPath
  };
}

function lifecycleResultContext(result) {
  return {
    projectRoot: result.project?.projectRoot,
    configPath: result.project?.configPath
  };
}

async function executeSharedTaskMutation(input) {
  const legacy = {};
  const project = normalizeCliProject(input.project ?? cliProject(input.config));
  const evidenceRefs = [`file:${runtimePaths(input.config.projectRoot).statePath}`];
  const mutations = {};

  if (input.operation === 'task.start') {
    mutations.start = async (scope) => {
      const runContext = lifecycleRunContext(scope, project, input.config, input.taskName);
      const run = await startManagedRunWithContext(input.taskName, input.task, input.config, {
        project,
        global: input.global === true,
        env: process.env,
        locks: false,
        runContext,
        beforeStart: async () => {
          if (input.global) assertProjectStillRegistered(project);
          await assertTaskPortsAvailable(input.config, input.taskName, input.task);
        }
      });
      legacy.run = run;
      return {
        run,
        reusedExistingRun: run.reusedExistingRun === true,
        changed: run.changed !== false,
        evidenceRefs
      };
    };
  } else if (input.operation === 'task.stop') {
    mutations.stop = async () => {
      const stopped = stopManagedTasksWithContext(
        input.config.projectRoot,
        input.taskName,
        input.config,
        { locks: false }
      );
      legacy.stopped = stopped;
      return {
        run: stopped[0] ?? null,
        changed: stopped.length > 0,
        evidenceRefs
      };
    };
  } else if (input.operation === 'task.restart') {
    mutations.restart = async (scope) => {
      if (input.global) {
        try {
          const target = `${project.alias ?? project.projectId}:${input.taskName}`;
          const result = await restartManagedRun(target, {
            env: process.env,
            operationId: scope.operationId,
            locks: false
          });
          legacy.restart = {
            phase: 'completed',
            stopped: [result.stoppedRun],
            startedRun: result.startedRun,
            transactionId: result.transactionId
          };
          return {
            status: 'completed',
            stoppedRun: result.stoppedRun,
            startedRun: result.startedRun,
            changed: true,
            evidenceRefs
          };
        } catch (error) {
          const processInfo = readState(input.config.projectRoot).processes?.[input.taskName];
          const stoppedRun = processInfo?.runId ? processInfo : null;
          legacy.restart = { phase: stoppedRun ? 'start' : 'stop', stopped: stoppedRun ? [stoppedRun] : [], error };
          return stoppedRun
            ? {
                status: 'partial',
                stoppedRun,
                startedRun: null,
                changed: true,
                evidenceRefs,
                error: toLifecycleMutationError(error, error?.code ?? 'task_start_failed')
              }
            : {
                status: 'failed',
                stoppedRun: null,
                startedRun: null,
                certainty: 'none',
                changed: false,
                evidenceRefs,
                error: toLifecycleMutationError(error, error?.code ?? 'task_stop_failed')
              };
        }
      }
      let stopped;
      try {
        stopped = stopManagedTasksWithContext(
          input.config.projectRoot,
          input.taskName,
          input.config,
          { locks: false }
        );
      } catch (error) {
        legacy.restart = { phase: 'stop', stopped: [], error };
        return {
          status: 'failed',
          stoppedRun: null,
          startedRun: null,
          certainty: 'none',
          changed: false,
          evidenceRefs,
          error: toLifecycleMutationError(error, 'task_stop_failed')
        };
      }
      try {
        const runContext = lifecycleRunContext(scope, project, input.config, input.taskName);
        const startedRun = await startManagedRunWithContext(input.taskName, input.task, input.config, {
          project,
          global: input.global === true,
          env: process.env,
          locks: false,
          runContext,
          beforeStart: async () => {
            if (input.global) assertProjectStillRegistered(project);
            await assertTaskPortsAvailable(input.config, input.taskName, input.task);
          }
        });
        legacy.restart = { phase: 'completed', stopped, startedRun };
        return {
          status: 'completed',
          stoppedRun: stopped[0] ?? null,
          startedRun,
          changed: stopped.length > 0 || startedRun.changed !== false,
          evidenceRefs
        };
      } catch (error) {
        legacy.restart = { phase: 'start', stopped, error };
        return stopped.length > 0
          ? {
              status: 'partial',
              stoppedRun: stopped[0],
              startedRun: null,
              changed: true,
              evidenceRefs,
              error: toLifecycleMutationError(error, 'task_start_failed')
            }
          : {
              status: 'failed',
              stoppedRun: null,
              startedRun: null,
              certainty: 'none',
              changed: false,
              evidenceRefs,
              error: toLifecycleMutationError(error, 'task_start_failed')
            };
      }
    };
  } else if (input.operation === 'task.run') {
    mutations.run = async () => {
      const result = await runTask(input.task, input.config.projectRoot, { captureOutput: input.options.json });
      legacy.runResult = result;
      return {
        status: result.code === 0 ? 'completed' : 'failed',
        exitCode: result.code,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        changed: true,
        evidenceRefs,
        ...(result.code === 0 ? {} : {
          error: {
            code: 'task_command_failed',
            message: `Task '${input.taskName}' exited with code ${result.code}.`,
            details: { task: input.taskName, code: result.code }
          }
        })
      };
    };
  }

  const agentResult = await executeCliAgentOperation({
    positionals: input.positionals,
    options: input.options,
    context: { taskRef: input.taskName, longRunning: input.task.longRunning, agentEligible: true },
    project,
    taskResolver: () => input.task,
    ownershipResolver: () => {
      const ownership = observeTaskOwnership(input.config.projectRoot, input.taskName, {
        env: process.env,
        allowVerifiedSpawnedParent: input.operation === 'task.restart'
      });
      legacy.ownership = ownership;
      return ownership;
    },
    operationJournal: createOperationJournal({ env: process.env }),
    taskHandlers: createTaskHandlers({ mutations })
  });
  return { agentResult, legacy, project };
}

function lifecycleRunContext(scope, project, config, taskName) {
  return {
    ...createRunContext({ project, config, taskName, env: process.env }),
    operationId: scope.operationId
  };
}

function toLifecycleMutationError(error, fallbackCode) {
  return {
    code: error?.code ?? fallbackCode,
    message: error?.message ?? String(error),
    details: error?.details ?? {}
  };
}

function isSharedLifecycleTask(task) {
  return task?.risk === 'low';
}

function refusalFromAgentResult(agentResult, ownershipObservation = undefined) {
  const ownership = agentResult.safety.ownership;
  const hasPortConflict = agentResult.operation.name === 'task.start'
    && (ownershipObservation?.ports?.length ?? ownershipObservation?.proof?.portEvidence?.length ?? 0) > 0;
  const code = hasPortConflict ? 'port_conflict' : ownershipObservation?.code ?? (ownership === 'external'
    ? 'external_process'
    : ownership === 'unknown'
      ? 'unknown_process_owner'
      : ownership === 'mismatch'
        ? 'ownership_mismatch'
        : agentResult.outcome.code);
  const projectRef = agentResult.resource.projectRef ?? '<project>';
  const taskRef = agentResult.resource.taskRef ?? '<task>';
  const [port] = ownershipObservation?.ports ?? ownershipObservation?.proof?.portEvidence
    ?.map((entry) => entry.port)
    .filter(Number.isInteger) ?? [];
  return new LaunchdeckError(
    code,
    agentResult.outcome.message,
    {
      safety: agentResult.safety,
      resource: agentResult.resource,
      operationId: agentResult.operation.id,
      ...(port ? { port } : {}),
      next: ownership === 'not_required' || ownership === 'verified'
        ? []
        : [
            {
              label: 'Inspect target',
              command: port
                ? `launchdeck inspect port:${port}`
                : `launchdeck inspect task:${projectRef}:${taskRef}`,
              reason: 'Shows current process, port, and ownership evidence.',
              risk: 'safe'
            },
            {
              label: 'Reconcile state',
              command: `launchdeck reconcile ${projectRef}:${taskRef}`,
              reason: 'Refreshes stale Launchdeck state without stopping unknown processes.',
              risk: 'safe'
            }
          ]
    }
  );
}

function writeAgentFailure(command, agentResult, options, io, context, payload = {}, ownershipObservation = undefined) {
  const error = refusalFromAgentResult(agentResult, ownershipObservation);
  if (!options.json) throw error;
  writeJson(io, createFailureEnvelope(command, error, context, {
    ...payload,
    code: error.code,
    message: error.message,
    details: error.details,
    next: error.details?.next,
    agentResult
  }));
  return 1;
}

async function executeCliAgentOperation(input) {
  const provenance = cliAgentProvenance();
  const compatibility = cliCompatibility();
  const mapping = mapCliInvocation({
    positionals: input.positionals,
    options: input.options,
    context: { ...input.context, projectRef: input.project?.projectId ?? input.context?.projectRef }
  });
  if (!mapping) {
    throw new LaunchdeckError('operation_not_supported', 'This CLI route is not mapped to an Agent operation.', {
      positionals: input.positionals
    });
  }
  const handlers = {
    ...createCapabilitiesHandlers({ provenance, compatibility, ...(input.capabilitiesOptions ?? {}) }),
    ...(input.projectHandlers ?? {}),
    ...(input.taskHandlers ?? {}),
    ...(input.adoptionHandlers ?? {}),
    ...(input.operationHandlers ?? {})
  };
  const kernel = createApplicationKernel({
    provenance,
    handlers,
    operationJournal: input.operationJournal,
    taskResolver: input.taskResolver,
    ownershipResolver: input.ownershipResolver,
    compatibilityResolver: () => compatibility,
    projectResolver: input.projectResolver ?? (() => input.project
      ? {
          status: 'resolved',
          code: 'project_scope_resolved',
          project: input.project,
          source: 'trustedContext.adapterProjectRoot',
          reasons: []
        }
      : {
          status: 'unconfigured',
          code: 'project_not_configured',
          project: null,
          source: null,
          reasons: []
        })
  });
  return kernel.execute(mapping, {
    trustedContext: input.project
      ? { cwd: process.cwd(), adapterProjectRoot: input.project.projectRoot }
      : { cwd: process.cwd() }
  });
}

function cliProject(config) {
  const projectId = stableProjectId(config.projectRoot);
  return {
    id: projectId,
    projectId,
    alias: config.project.alias ?? config.project.name,
    name: config.project.name,
    projectRoot: config.projectRoot,
    configPath: config.configPath
  };
}

function normalizeCliProject(project) {
  if (!project || typeof project !== 'object') return null;
  const projectRoot = project.projectRoot;
  if (typeof projectRoot !== 'string' || !projectRoot) return null;
  const projectId = project.projectId ?? project.id ?? stableProjectId(projectRoot);
  return {
    ...project,
    id: project.id ?? projectId,
    projectId,
    alias: project.alias ?? project.name,
    name: project.name ?? project.alias ?? projectId,
    projectRoot,
    configPath: project.configPath
  };
}

function resolvedCliProjectContext(project) {
  return {
    status: 'resolved',
    code: 'project_scope_resolved',
    project,
    source: 'trustedContext.adapterProjectRoot',
    reasons: []
  };
}

function unresolvedCliProjectContext() {
  return {
    status: 'unconfigured',
    code: 'project_not_configured',
    project: null,
    source: null,
    reasons: []
  };
}

function splitObservationLines(content) {
  if (!content) return [];
  return String(content).split(/\r?\n/);
}

function cliAgentProvenance() {
  const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(new URL('../agent/compatibility-manifest.json', import.meta.url), 'utf8'));
  return {
    surface: 'cli',
    host: 'standalone',
    runtimeKind: 'package-cli',
    runtimeVersion: packageJson.version,
    runtimePath: fileURLToPath(import.meta.url),
    stateHome: globalRuntimePaths().homeDir,
    buildIdentity: manifest.buildIdentity,
    agentProtocolVersion: manifest.versions.agentProtocol.current,
    cliSchemaVersion: manifest.versions.cliSchema.current
  };
}

function cliCompatibility() {
  return {
    canRead: true,
    canWrite: true,
    diagnosticOnly: false,
    axes: {},
    components: {}
  };
}

function writeTaskStart(processInfo, options, io, envelope = undefined) {
  if (options.json) {
    if (envelope) {
      writeJson(
        io,
        createSuccessEnvelope(
          envelope.command,
          {
            ...envelope.payload,
            process: processInfo
          },
          envelope.context
        )
      );
    } else {
      writeJson(io, { ok: true, process: processInfo });
    }
  } else {
    write(
      io,
      `Started ${processInfo.name} with pid ${processInfo.pid}. Logs: ${processInfo.logPath}\n`
    );
  }
}

function writeCleanTargets(io, targets) {
  if (targets.length === 0) {
    write(io, 'No clean targets configured.\n');
    return;
  }
  for (const target of targets) {
    write(io, `- ${target.path} (${target.absolutePath})\n`);
  }
}

function cleanRefusalMessage(target) {
  const rawPath = target.rawPath ?? target.path;
  if (target.refusalCode === 'clean_target_root') {
    return 'Launchdeck refuses to clean the project root.';
  }
  if (target.refusalCode === 'clean_target_outside_project') {
    return `Clean target '${rawPath}' must stay inside the project root.`;
  }
  if (target.refusalCode === 'clean_target_empty') {
    return 'Clean target must be a non-empty path.';
  }
  return `Clean target '${rawPath}' cannot be proven safe.`;
}

function extractExecutable(command) {
  const trimmed = command.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith('"')) {
    const match = trimmed.match(/^"([^"]+)"/);
    return match?.[1];
  }
  if (trimmed.startsWith("'")) {
    const match = trimmed.match(/^'([^']+)'/);
    return match?.[1];
  }
  const [first] = trimmed.split(/\s+/);
  return first;
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(checker, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function parseArgs(argv) {
  const options = {
    all: false,
    alias: undefined,
    config: undefined,
    force: false,
    forceOwned: false,
    follow: false,
    json: false,
    compact: false,
    agent: undefined,
    dryRun: false,
    checks: undefined,
    createdAfter: undefined,
    createdBefore: undefined,
    cursor: undefined,
    lines: 80,
    limit: undefined,
    maxBytes: undefined,
    maxDepth: undefined,
    maxFiles: undefined,
    name: undefined,
    operationName: undefined,
    path: undefined,
    runId: undefined,
    safe: false,
    signals: undefined,
    scope: undefined,
    states: undefined,
    taskRef: undefined,
    target: undefined,
    windowSeconds: undefined,
    yes: false
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all') {
      options.all = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--force-owned') {
      options.forceOwned = true;
    } else if (arg === '--follow' || arg === '-f') {
      options.follow = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--compact') {
      options.compact = true;
    } else if (arg === '--agent') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new LaunchdeckError('invalid_arguments', '--agent requires a value.');
      }
      options.agent = value;
      index += 1;
    } else if (arg === '--scope') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new LaunchdeckError('invalid_arguments', '--scope requires a value.');
      }
      options.scope = value;
      index += 1;
    } else if (arg === '--target') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new LaunchdeckError('invalid_arguments', '--target requires a value.');
      }
      options.target = value;
      index += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--checks') {
      options.checks = parseListOption(argv[++index], '--checks');
    } else if (arg === '--cursor') {
      options.cursor = requireOptionValue(argv[++index], '--cursor');
    } else if (arg === '--limit') {
      options.limit = parseIntegerOption(argv[++index], '--limit', 1, 200);
    } else if (arg === '--max-bytes') {
      options.maxBytes = parseIntegerOption(argv[++index], '--max-bytes', 1, 65_536);
    } else if (arg === '--max-depth') {
      options.maxDepth = parseIntegerOption(argv[++index], '--max-depth', 1, 6);
    } else if (arg === '--max-files') {
      options.maxFiles = parseIntegerOption(argv[++index], '--max-files', 1, 500);
    } else if (arg === '--signals') {
      options.signals = parseListOption(argv[++index], '--signals');
    } else if (arg === '--run-id') {
      options.runId = requireOptionValue(argv[++index], '--run-id');
    } else if (arg === '--window-seconds') {
      options.windowSeconds = parseIntegerOption(argv[++index], '--window-seconds', 1, 86_400);
    } else if (arg === '--task') {
      options.taskRef = requireOptionValue(argv[++index], '--task');
    } else if (arg === '--operation-name') {
      options.operationName = requireOptionValue(argv[++index], '--operation-name');
    } else if (arg === '--created-after') {
      options.createdAfter = requireOptionValue(argv[++index], '--created-after');
    } else if (arg === '--created-before') {
      options.createdBefore = requireOptionValue(argv[++index], '--created-before');
    } else if (arg === '--states') {
      options.states = parseListOption(argv[++index], '--states');
    } else if (arg === '--name') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new LaunchdeckError('invalid_arguments', '--name requires a value.');
      }
      options.name = value;
      index += 1;
    } else if (arg === '--alias') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new LaunchdeckError('invalid_arguments', '--alias requires a value.');
      }
      options.alias = value;
      index += 1;
    } else if (arg === '--path') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new LaunchdeckError('invalid_arguments', '--path requires a value.');
      }
      options.path = value;
      index += 1;
    } else if (arg === '--config') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new LaunchdeckError('invalid_arguments', '--config requires a value.');
      }
      options.config = value;
      index += 1;
    } else if (arg === '--safe') {
      options.safe = true;
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--lines' || arg === '-n') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new LaunchdeckError('invalid_arguments', '--lines requires a positive integer.');
      }
      options.lines = value;
      index += 1;
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, options };
}

function requireOptionValue(value, optionName) {
  if (!value || value.startsWith('-')) {
    throw new LaunchdeckError('invalid_arguments', `${optionName} requires a value.`);
  }
  return value;
}

function parseListOption(value, optionName) {
  const values = requireOptionValue(value, optionName)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new LaunchdeckError('invalid_arguments', `${optionName} requires at least one value.`);
  }
  return values;
}

function parseIntegerOption(value, optionName, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new LaunchdeckError('invalid_arguments', `${optionName} requires an integer between ${minimum} and ${maximum}.`);
  }
  return number;
}

function isInside(projectRoot, targetPath) {
  const relative = path.relative(path.resolve(projectRoot), path.resolve(targetPath));
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
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

function omitUndefined(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function pad(value, length) {
  return value.padEnd(length, ' ');
}

function write(io, value) {
  io.stdout.write(value);
}

function writeError(io, value) {
  io.stderr.write(value);
}

function writeJson(io, value) {
  writeJsonEnvelope(io, value);
}

function withJsonOptions(io, options) {
  return {
    ...io,
    launchdeckJson: {
      compact: Boolean(options.compact)
    }
  };
}

function failureEnvelope(command, error, context) {
  const envelope = createFailureEnvelope(command, error, context, {
    details: error.details,
    code: error.code,
    message: error.message,
    next: error.details?.next
  });
  envelope.data = {
    code: envelope.code,
    message: envelope.message,
    details: envelope.details,
    next: envelope.next
  };
  return envelope;
}

function contextFromError(error) {
  if (!error || typeof error !== 'object') {
    return {};
  }
  const configPath = error.details?.configPath ?? findConfig(process.cwd());
  return {
    projectRoot: error.details?.projectRoot,
    configPath
  };
}

function defaultIo() {
  return {
    stdout: process.stdout,
    stderr: process.stderr
  };
}

function helpText() {
  return `Launchdeck

Usage:
  launchdeck init [--force]
  launchdeck capabilities [--json] [--compact]
  launchdeck diagnose [--checks runtime,compatibility,...] [--json] [--compact]
  launchdeck doctor [--json] [--compact]
  launchdeck tasks [--json] [--compact]
  launchdeck adoption inspect [--max-depth 4] [--max-files 200] [--json] [--compact]
  launchdeck project add [path] [--name name] [--json] [--compact]
  launchdeck project remove <name|id|path> [--json] [--compact]
  launchdeck project scan <dir> [--json] [--compact]
  launchdeck projects [--json] [--compact]
  launchdeck agent paths [--json] [--compact]
  launchdeck agent doctor [--json] [--compact]
  launchdeck agent install --agent <${supportedAgents().join('|')}> [--scope project|user] [--dry-run] [--force] [--target dir] [--json] [--compact]
  launchdeck status --all [--json] [--compact]
  launchdeck conflicts [--json] [--compact]
  launchdeck setup|build|package|test|lint|typecheck [--json] [--compact]
  launchdeck run <task> [--json] [--compact]
  launchdeck dev [--json] [--compact]
  launchdeck start [task|project:task] [--json] [--compact]
  launchdeck restart [task|project:task] [--json] [--compact]
  launchdeck ps [--all] [--json] [--compact]
  launchdeck ports [--json] [--compact]
  launchdeck inspect <type:value> [--json] [--compact]
    types: project:<target>|task:<project:task>|run:<runId>|port:<port>|pid:<pid>|conflict:<id>
  launchdeck inspect-port <port> [--json] [--compact]
  launchdeck logs [task|project:task] [--lines 80] [--follow] [--json] [--compact]
  launchdeck events [target] [--lines 80] [--follow] [--json] [--compact]
  launchdeck operation list <project> [--operation-name task.start] [--task task] [--states running,indeterminate] [--created-after time] [--created-before time] [--limit 20] [--json] [--compact]
  launchdeck operation get <operationId> [--json] [--compact]
  launchdeck operation reconcile <operationId> [--json] [--compact]
  launchdeck reconcile [project[:task]] [--json] [--compact]
  launchdeck stop [task|project:task] [--force-owned] [--json] [--compact]
  launchdeck force-stop <project:task> [--json] [--compact]
  launchdeck clean [--safe|--all --yes] [--json] [--compact]

Lifecycle config:
  .launchdeck.yml
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await main();
  process.exitCode = code;
}
