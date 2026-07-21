#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  assertTaskPortsAvailable,
  globalRuntimePaths,
  inspectTarget,
  listRegisteredProjects,
  loadRegisteredConfig
} from '../global-runtime.js';
import {
  applySafeCleanPlan,
  buildSafeCleanPlan,
  observeTaskOwnership,
  readState,
  runTask,
  runtimePaths,
  stopManagedTasks,
  tailLog
} from '../runtime.js';
import { restartManagedRun } from '../control-plane/actions.js';
import { readEvents } from '../control-plane/events.js';
import { createOperationJournal } from '../control-plane/operation-journal.js';
import { createRunContext, startManagedRun } from '../control-plane/runs.js';
import { createApplicationKernel } from '../kernel/application-kernel.js';
import { normalizeAgentOperationResult } from '../kernel/agent-result.js';
import { assessCompatibility, canonicalDigest } from '../kernel/compatibility.js';
import { getOperationDefinition } from '../kernel/operation-registry.js';
import { resolveProjectContext } from '../kernel/project-context.js';
import { createAdoptionHandlers } from '../kernel/operations/adoption.js';
import { createCapabilitiesHandlers } from '../kernel/operations/capabilities.js';
import { createCleanHandlers } from '../kernel/operations/clean.js';
import { createOperationHandlers } from '../kernel/operations/operation.js';
import { createProjectHandlers } from '../kernel/operations/project.js';
import { createTaskHandlers, toTaskInventoryItem } from '../kernel/operations/task.js';
import { createDiagnosticWriter } from './diagnostics.js';
import { AGENT_TOOLS } from './tool-projection.js';

const modulePath = fileURLToPath(import.meta.url);
const bundledPluginRuntime = typeof __LAUNCHDECK_PLUGIN_BUNDLE__ !== 'undefined'
  && __LAUNCHDECK_PLUGIN_BUNDLE__ === true;
const bundledPackageVersion = typeof __LAUNCHDECK_PACKAGE_VERSION__ !== 'undefined'
  ? __LAUNCHDECK_PACKAGE_VERSION__
  : null;

export function createLaunchdeckMcpServer(options = {}) {
  const env = options.env ?? process.env;
  const diagnostics = options.diagnostics ?? createDiagnosticWriter();
  const localCompatibilityManifest = options.localCompatibilityManifest ?? readJson(defaultCompatibilityManifestUrl());
  const observedCompatibilityManifest = options.observedCompatibilityManifest ?? localCompatibilityManifest;
  const compatibility = assessCompatibility(localCompatibilityManifest, observedCompatibilityManifest);
  const provenance = mcpProvenance(env, observedCompatibilityManifest);
  const kernel = createMcpKernel({ env, provenance, compatibility });
  const packageVersion = runtimePackageVersion();
  const server = new Server(
    { name: 'launchdeck', version: packageVersion },
    {
      capabilities: { tools: { listChanged: false } },
      instructions: 'Use explicit registered project references. Launchdeck MCP exposes only the shared low-risk Agent operation registry.'
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: AGENT_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const input = request.params.arguments ?? {};
    let result;
    try {
      result = await kernel.execute({ operation: name, input }, {
        trustedContext: { surface: 'mcp', transport: 'stdio' }
      });
    } catch (error) {
      diagnostics.report('tool_execution_failed', error);
      result = executionFailure({ name, input, error, provenance });
    }
    return toolResult(result);
  });

  return server;
}

export async function runStdioServer(options = {}) {
  const diagnostics = options.diagnostics ?? createDiagnosticWriter();
  if (options.detachHostCwd !== false) process.chdir(path.dirname(modulePath));
  const server = createLaunchdeckMcpServer({ ...options, diagnostics });
  const transport = options.transport ?? new StdioServerTransport();
  await server.connect(transport);
  return { server, transport };
}

function createMcpKernel({ env, provenance, compatibility }) {
  const journal = createOperationJournal({ env, lockWaitMs: 30_000 });
  const projectResolver = async ({ request, trustedContext, definition }) => {
    let projectRef = request.input.projectRef;
    if (!projectRef && ['operation.get', 'operation.reconcile'].includes(definition.name)) {
      try {
        const record = await journal.get(request.input.operationId);
        projectRef = record.projectRef?.projectId;
      } catch {
        // The journal handler will return the authoritative missing-record diagnostic.
      }
    }
    return resolveProjectContext({
      projectRef,
      trustedContext,
      registry: { projects: listRegisteredProjects(env) },
      pluginRoots: [],
      allowUserScopeDefault: definition.name === 'project.list'
    });
  };

  const taskResolver = ({ request, projectContext }) => {
    if (projectContext.status !== 'resolved' || !request.input.taskRef) return null;
    const config = loadRegisteredConfig(projectContext.project);
    return config.tasks[request.input.taskRef] ?? { name: request.input.taskRef, risk: 'unknown' };
  };
  const ownershipResolver = ({ request, definition, projectContext }) => {
    if (!request.input.taskRef || projectContext.status !== 'resolved') return { classification: 'unknown' };
    return observeTaskOwnership(projectContext.project.projectRoot, request.input.taskRef, {
      env,
      allowVerifiedSpawnedParent: definition.name === 'task.restart'
    });
  };

  const handlers = {
    ...createCapabilitiesHandlers({
      provenance,
      compatibility,
      evidence: { transport: 'stdio', toolCount: AGENT_TOOLS.length },
      diagnosticChecks: diagnosticChecks(env, journal, compatibility)
    }),
    ...createProjectHandlers({
      listProjects: async () => listRegisteredProjects(env),
      inspectProject: async ({ target }) => inspectTarget(`${target.kind}:${target.value}`, env)
    }),
    ...createAdoptionHandlers(),
    ...createTaskHandlers(taskProviderOptions(env)),
    ...createOperationHandlers({ journal }),
    ...createCleanHandlers({
      createPlan: async ({ project }) => buildSafeCleanPlan(loadRegisteredConfig(project), { env }),
      applySafe: async ({ project, plan }) => {
        const config = loadRegisteredConfig(project);
        const removed = applySafeCleanPlan(plan);
        return {
          removed,
          changed: removed.some((entry) => entry.existed === true),
          evidenceRefs: [
            `file:${config.configPath}`,
            `file:${runtimePaths(config.projectRoot).statePath}`
          ]
        };
      }
    })
  };

  return createApplicationKernel({
    env,
    provenance,
    handlers,
    operationJournal: journal,
    projectResolver,
    taskResolver,
    ownershipResolver,
    compatibilityResolver: () => compatibility
  });
}

function taskProviderOptions(env) {
  const configFor = (project) => loadRegisteredConfig(project);
  const evidenceFor = (config) => [`file:${runtimePaths(config.projectRoot).statePath}`];
  return {
    listTasks: async ({ project }) => Object.values(configFor(project).tasks).map(toTaskInventoryItem),
    readTaskStatus: async ({ project, taskRef }) => {
      const config = configFor(project);
      const task = config.tasks[taskRef];
      if (!task) return { taskRef, status: 'missing', configured: false };
      const processInfo = readState(config.projectRoot).processes?.[taskRef];
      return {
        taskRef,
        configured: true,
        status: processInfo?.status ?? 'idle',
        runId: processInfo?.runId ?? null,
        process: processInfo ?? null
      };
    },
    readTaskLogLines: async ({ project, taskRef, request }) => {
      const config = configFor(project);
      const log = tailLog(config.projectRoot, taskRef, request.input.limit ?? 80);
      return String(log.content ?? '').split(/\r?\n/);
    },
    readTaskEvents: async ({ project, taskRef, request }) => {
      const result = await readEvents({ homeDir: globalRuntimePaths(env).homeDir, limit: 1_000 });
      const projectId = project.projectId ?? project.id;
      const events = result.events.filter((event) =>
        (!projectId || event.projectId === projectId)
        && (!taskRef || event.task === taskRef)
        && (!request.input.runId || event.runId === request.input.runId)
      );
      return { events, warnings: result.warnings };
    },
    mutations: {
      start: async (scope) => {
        const config = configFor(scope.project);
        const task = requireConfiguredTask(config, scope.taskRef);
        const runContext = {
          ...createRunContext({ project: scope.project, config, taskName: scope.taskRef, env }),
          operationId: scope.operationId
        };
        const run = await startManagedRun(scope.taskRef, task, config, {
          project: scope.project,
          global: true,
          env,
          locks: false,
          runContext,
          beforeStart: () => assertTaskPortsAvailable(config, scope.taskRef, task, env)
        });
        return {
          run,
          reusedExistingRun: run.reusedExistingRun === true,
          changed: run.changed !== false,
          evidenceRefs: evidenceFor(config)
        };
      },
      stop: async (scope) => {
        const config = configFor(scope.project);
        requireConfiguredTask(config, scope.taskRef);
        const stopped = stopManagedTasks(config.projectRoot, scope.taskRef, { locks: false });
        return { run: stopped[0] ?? null, changed: stopped.length > 0, evidenceRefs: evidenceFor(config) };
      },
      restart: async (scope) => {
        const config = configFor(scope.project);
        requireConfiguredTask(config, scope.taskRef);
        try {
          const result = await restartManagedRun(`${scope.project.projectId ?? scope.project.id}:${scope.taskRef}`, {
            env,
            operationId: scope.operationId,
            locks: false
          });
          return {
            status: 'completed',
            stoppedRun: result.stoppedRun,
            startedRun: result.startedRun,
            changed: true,
            evidenceRefs: evidenceFor(config)
          };
        } catch (error) {
          const stoppedRun = readState(config.projectRoot).processes?.[scope.taskRef] ?? null;
          return {
            status: stoppedRun ? 'partial' : 'failed',
            stoppedRun,
            startedRun: null,
            certainty: stoppedRun ? 'confirmed' : 'none',
            changed: Boolean(stoppedRun),
            evidenceRefs: evidenceFor(config),
            error: lifecycleError(error, 'task_restart_failed')
          };
        }
      },
      run: async (scope) => {
        const config = configFor(scope.project);
        const task = requireConfiguredTask(config, scope.taskRef);
        const executed = await runTask(task, config.projectRoot, { captureOutput: true });
        const includeOutput = scope.request.input.output !== 'none';
        return {
          status: executed.code === 0 ? 'completed' : 'failed',
          exitCode: executed.code,
          stdout: includeOutput ? executed.stdout ?? '' : '',
          stderr: includeOutput ? executed.stderr ?? '' : '',
          changed: true,
          evidenceRefs: evidenceFor(config),
          ...(executed.code === 0 ? {} : {
            error: {
              code: 'task_command_failed',
              message: `Task '${scope.taskRef}' exited with code ${executed.code}.`,
              details: { task: scope.taskRef, code: executed.code }
            }
          })
        };
      }
    }
  };
}

function requireConfiguredTask(config, taskRef) {
  const task = config.tasks[taskRef];
  if (!task) {
    const error = new Error(`Task '${taskRef}' is not configured.`);
    error.code = 'task_not_found';
    throw error;
  }
  return task;
}

function diagnosticChecks(env, journal, compatibility) {
  return {
    runtime: () => ({ status: 'healthy', node: process.version }),
    compatibility: () => ({
      status: compatibility.canWrite ? 'healthy' : 'degraded',
      code: compatibility.canWrite ? 'compatible' : 'compatibility_mismatch',
      ...compatibility
    }),
    state: () => ({ status: 'healthy', stateHome: globalRuntimePaths(env).homeDir }),
    registry: () => ({ status: 'healthy', projectCount: listRegisteredProjects(env).length }),
    journal: () => ({ status: 'healthy', path: journal.paths?.journalDir ?? null }),
    skill: () => ({ status: 'healthy', code: 'skill_contract_available' }),
    project: () => ({ status: 'healthy', code: 'explicit_project_scope_required' }),
    transport: () => ({ status: 'healthy', kind: 'stdio' })
  };
}

function mcpProvenance(env, manifest) {
  const hostCandidate = String(env.LAUNCHDECK_MCP_HOST ?? env.LAUNCHDECK_AGENT_HOST ?? 'standalone').toLowerCase();
  const host = ['standalone', 'codex', 'claude', 'unknown'].includes(hostCandidate) ? hostCandidate : 'unknown';
  return Object.freeze({
    surface: 'mcp',
    host,
    runtimeKind: bundledPluginRuntime || env.LAUNCHDECK_PLUGIN_BUNDLED === '1' ? 'plugin-bundled-mcp' : 'package-mcp',
    runtimeVersion: runtimePackageVersion(),
    runtimePath: modulePath,
    stateHome: globalRuntimePaths(env).homeDir,
    buildIdentity: manifest.buildIdentity,
    agentProtocolVersion: manifest.versions.agentProtocol.current,
    cliSchemaVersion: null
  });
}

function runtimePackageVersion() {
  return bundledPackageVersion ?? readJson(new URL('../../package.json', import.meta.url)).version;
}

function defaultCompatibilityManifestUrl() {
  return bundledPluginRuntime
    ? new URL('../compatibility.json', import.meta.url)
    : new URL('../../agent/compatibility-manifest.json', import.meta.url);
}

function executionFailure({ name, input, error, provenance }) {
  const definition = getOperationDefinition(name);
  const taskRef = typeof input?.taskRef === 'string' ? input.taskRef : null;
  const projectRef = typeof input?.projectRef === 'string' ? input.projectRef : null;
  const rawCode = String(error?.code ?? 'operation_execution_failed');
  const code = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/.test(rawCode) ? rawCode : 'operation_execution_failed';
  return normalizeAgentOperationResult({
    protocolVersion: provenance.agentProtocolVersion,
    operation: {
      id: `op_${randomUUID().replaceAll('-', '')}`,
      name: /^[a-z][a-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/.test(name) ? name : 'system.diagnose',
      inputDigest: canonicalDigest({ operation: name, input }),
      journalStatus: 'unavailable'
    },
    outcome: {
      kind: 'failed',
      code,
      message: 'Launchdeck could not complete the operation.',
      reusedExistingRun: false
    },
    resource: {
      kind: taskRef ? 'task' : 'inspection',
      id: taskRef,
      status: 'failed',
      projectRef,
      taskRef,
      runId: null
    },
    effects: { certainty: 'unknown', changed: null, evidenceRefs: [] },
    safety: {
      risk: definition?.kind === 'query' ? 'none' : definition?.maxAgentRisk ?? 'unknown',
      decision: definition ? 'allowed' : 'refused',
      ownership: taskRef ? 'unknown' : 'not_required',
      projectScope: projectRef ? 'resolved' : 'unconfigured'
    },
    error: { code, message: 'Launchdeck could not complete the operation.', details: {} },
    nextActions: [],
    provenance
  });
}

function toolResult(result) {
  return {
    isError: result.outcome.kind !== 'succeeded',
    content: [{ type: 'text', text: `${result.outcome.code}: ${result.outcome.message}`.slice(0, 2_048) }],
    structuredContent: result
  };
}

function lifecycleError(error, fallbackCode) {
  return {
    code: error?.code ?? fallbackCode,
    message: error?.message ?? 'Task lifecycle operation failed.',
    details: error?.details ?? {}
  };
}

function readJson(url) {
  return JSON.parse(fs.readFileSync(url, 'utf8'));
}

if (isCurrentEntrypoint()) {
  const diagnostics = createDiagnosticWriter();
  runStdioServer({ diagnostics }).catch((error) => {
    diagnostics.report('server_start_failed', error);
    process.exitCode = 1;
  });
}

function isCurrentEntrypoint() {
  if (!process.argv[1]) return false;
  const entrypointPath = canonicalModulePath(process.argv[1]);
  const currentModulePath = canonicalModulePath(modulePath);
  if (process.platform === 'win32') {
    return entrypointPath.toLowerCase() === currentModulePath.toLowerCase();
  }
  return entrypointPath === currentModulePath;
}

function canonicalModulePath(value) {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}
