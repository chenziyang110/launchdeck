import { createObservationService } from '../observations.js';

export function createTaskHandlers(options = {}) {
  const listTasks = options.listTasks ?? (async () => []);
  const readTaskStatus = options.readTaskStatus ?? (async ({ taskRef }) => ({ taskRef, status: 'unknown' }));
  const readTaskLogLines = options.readTaskLogLines ?? (async () => []);
  const readTaskEvents = options.readTaskEvents ?? (async () => ({ events: [], warnings: [] }));
  const observations = options.observations ?? createObservationService();
  const mutations = options.mutations ?? {};

  return Object.freeze({
    'task.list': async (context) => {
      const project = context.inputs?.projectContext?.project;
      const limit = context.request.input.limit ?? 80;
      const allTasks = [...await listTasks({ project, request: context.request })]
        .sort((left, right) => String(left.name).localeCompare(String(right.name)));
      const page = observations.page({
        kind: 'task-list',
        resourceId: project?.projectId ?? project?.id,
        query: withoutCursor(context.request.input),
        items: allTasks,
        limit,
        cursor: context.request.input.cursor
      });
      return {
        outcome: successOutcome('tasks_listed', `Found ${page.items.length} configured task(s).`),
        resource: {
          kind: 'taskCollection',
          id: null,
          status: 'available',
          projectRef: project?.projectId ?? project?.id ?? null,
          taskRef: null,
          runId: null,
          data: { tasks: page.items, nextCursor: page.nextCursor }
        },
        effects: noEffects(),
        error: null,
        nextActions: []
      };
    },
    'task.status': async (context) => {
      const project = context.inputs?.projectContext?.project;
      const taskRef = context.request.input.taskRef;
      const status = await readTaskStatus({ project, taskRef, request: context.request });
      return {
        outcome: successOutcome('task_status_read', `Task '${taskRef}' status was read.`),
        resource: {
          kind: 'task',
          id: taskRef,
          status: status.status ?? 'unknown',
          projectRef: project?.projectId ?? project?.id ?? null,
          taskRef,
          runId: status.runId ?? null,
          data: { status }
        },
        effects: noEffects(),
        error: null,
        nextActions: []
      };
    },
    'task.logs.read': async (context) => {
      const project = context.inputs?.projectContext?.project;
      const projectId = project?.projectId ?? project?.id;
      const taskRef = context.request.input.taskRef;
      const lines = await readTaskLogLines({ project, taskRef, request: context.request });
      const page = observations.pageLogLines({
        resourceId: `${projectId}:${taskRef}`,
        query: withoutCursor(context.request.input),
        lines,
        limit: context.request.input.limit ?? 80,
        maxBytes: context.request.input.maxBytes ?? 32_768,
        cursor: context.request.input.cursor
      });
      return observationResult({
        code: 'task_logs_read',
        message: `Read ${page.lines.length} bounded log line(s) for '${taskRef}'.`,
        kind: 'logPage',
        projectId,
        taskRef,
        data: page
      });
    },
    'task.events.read': async (context) => {
      const project = context.inputs?.projectContext?.project;
      const projectId = project?.projectId ?? project?.id;
      const taskRef = context.request.input.taskRef ?? null;
      const source = await readTaskEvents({ project, taskRef, request: context.request });
      const resourceId = `${projectId}:${taskRef ?? '*'}:${context.request.input.runId ?? '*'}`;
      const page = typeof source.content === 'string'
        ? observations.pageJsonLines({
            kind: 'task-events',
            resourceId,
            query: withoutCursor(context.request.input),
            content: source.content,
            limit: context.request.input.limit ?? 80,
            cursor: context.request.input.cursor
          })
        : {
            ...observations.page({
              kind: 'task-events',
              resourceId,
              query: withoutCursor(context.request.input),
              items: source.events ?? [],
              limit: context.request.input.limit ?? 80,
              cursor: context.request.input.cursor
            }),
            warnings: source.warnings ?? []
          };
      return observationResult({
        code: 'task_events_read',
        message: `Read ${page.items.length} bounded event(s).`,
        kind: 'eventPage',
        projectId,
        taskRef,
        runId: context.request.input.runId ?? null,
        data: page
      });
    },
    ...(typeof mutations.start === 'function'
      ? { 'task.start': (context) => startTask(context, mutations.start) }
      : {}),
    ...(typeof mutations.stop === 'function'
      ? { 'task.stop': (context) => stopTask(context, mutations.stop) }
      : {}),
    ...(typeof mutations.restart === 'function'
      ? { 'task.restart': (context) => restartTask(context, mutations.restart) }
      : {}),
    ...(typeof mutations.run === 'function'
      ? { 'task.run': (context) => runTask(context, mutations.run) }
      : {})
  });
}

export function toTaskInventoryItem(task) {
  return {
    name: task.name,
    type: task.longRunning ? 'managed' : 'foreground',
    risk: task.risk,
    ports: task.ports,
    command: task.command,
    cwd: task.cwd,
    description: task.description,
    log: task.log
  };
}

async function startTask(context, mutation) {
  const scope = mutationScope(context);
  const result = await mutation(scope);
  const run = requireRun(result.run, 'task.start');
  const reused = result.reusedExistingRun === true;
  return {
    outcome: {
      kind: 'succeeded',
      code: reused ? 'task_start_reused' : 'task_started',
      message: reused
        ? `Task '${scope.taskRef}' is already running in the matching Launchdeck run.`
        : `Task '${scope.taskRef}' started.`,
      reusedExistingRun: reused
    },
    resource: runResource(scope, run, run.status ?? 'running', { run }),
    effects: confirmedEffects(result.changed ?? !reused, result.evidenceRefs),
    error: null,
    nextActions: []
  };
}

async function stopTask(context, mutation) {
  const scope = mutationScope(context);
  const result = await mutation(scope);
  const run = result.run ?? null;
  const changed = result.changed ?? Boolean(run);
  return {
    outcome: successOutcome(
      changed ? 'task_stopped' : 'task_already_stopped',
      changed ? `Task '${scope.taskRef}' stopped.` : `Task '${scope.taskRef}' was already stopped.`
    ),
    resource: run
      ? runResource(scope, requireRun(run, 'task.stop'), 'stopped', { run })
      : taskResource(scope, 'stopped', { run: null }),
    effects: confirmedEffects(changed, result.evidenceRefs),
    error: null,
    nextActions: []
  };
}

async function restartTask(context, mutation) {
  const scope = mutationScope(context);
  const result = await mutation(scope);
  if (result.status === 'partial') {
    const stoppedRun = requireRun(result.stoppedRun, 'task.restart');
    const error = normalizeMutationError(result.error, 'task_start_failed', 'Replacement run failed to start.');
    return {
      outcome: {
        kind: 'partial',
        code: 'task_restart_partial',
        message: `Task '${scope.taskRef}' stopped, but its replacement run did not start.`,
        reusedExistingRun: false
      },
      resource: runResource(scope, stoppedRun, 'failed', {
        stoppedRun,
        startedRun: result.startedRun ?? null
      }),
      effects: confirmedEffects(result.changed ?? true, result.evidenceRefs),
      error,
      nextActions: [
        {
          kind: 'inspect',
          label: 'Inspect the stopped task',
          operationName: 'project.inspect',
          input: {
            projectRef: scope.projectId,
            target: { kind: 'task', value: `${scope.projectId}:${scope.taskRef}` }
          },
          reason: 'Confirm the stopped resource and current ownership before any new action.'
        },
        {
          kind: 'view_logs',
          label: 'View bounded task logs',
          operationName: 'task.logs.read',
          input: { projectRef: scope.projectId, taskRef: scope.taskRef, limit: 80 },
          reason: 'Inspect bounded replacement-start diagnostics without retrying the restart.'
        }
      ]
    };
  }
  if (result.status === 'failed') {
    const error = normalizeMutationError(result.error, 'task_restart_failed', `Task '${scope.taskRef}' did not restart.`);
    return {
      outcome: { kind: 'failed', code: error.code, message: error.message, reusedExistingRun: false },
      resource: taskResource(scope, 'failed', {
        stoppedRun: result.stoppedRun ?? null,
        startedRun: result.startedRun ?? null
      }),
      effects: result.certainty === 'none'
        ? { certainty: 'none', changed: false, evidenceRefs: result.evidenceRefs ?? [] }
        : confirmedEffects(result.changed ?? false, result.evidenceRefs),
      error,
      nextActions: []
    };
  }
  const run = requireRun(result.startedRun ?? result.run, 'task.restart');
  return {
    outcome: successOutcome('task_restarted', `Task '${scope.taskRef}' restarted.`),
    resource: runResource(scope, run, run.status ?? 'running', {
      stoppedRun: result.stoppedRun ?? null,
      startedRun: run
    }),
    effects: confirmedEffects(result.changed ?? true, result.evidenceRefs),
    error: null,
    nextActions: []
  };
}

async function runTask(context, mutation) {
  const scope = mutationScope(context);
  const result = await mutation(scope);
  if (result.status === 'indeterminate') {
    const error = normalizeMutationError(
      result.error,
      'task_completion_unknown',
      'Task completion evidence is unavailable.'
    );
    return {
      outcome: {
        kind: 'indeterminate',
        code: error.code,
        message: error.message,
        reusedExistingRun: false
      },
      resource: taskResource(scope, 'indeterminate', outputData(result)),
      effects: {
        certainty: result.certainty ?? 'unknown',
        changed: result.changed ?? null,
        evidenceRefs: result.evidenceRefs ?? []
      },
      error,
      nextActions: [{
        kind: 'reconcile',
        label: 'Reconcile foreground task evidence',
        operationName: 'operation.reconcile',
        input: { operationId: context.operationId },
        reason: 'Resolve the original operation from evidence without rerunning the task.'
      }]
    };
  }
  const failed = result.status === 'failed' || (Number.isInteger(result.exitCode) && result.exitCode !== 0);
  const error = failed
    ? normalizeMutationError(result.error, 'task_run_failed', `Task '${scope.taskRef}' failed.`)
    : null;
  return {
    outcome: failed
      ? { kind: 'failed', code: error.code, message: error.message, reusedExistingRun: false }
      : successOutcome('task_run_completed', `Task '${scope.taskRef}' completed.`),
    resource: taskResource(scope, failed ? 'failed' : 'completed', outputData(result)),
    effects: confirmedEffects(result.changed ?? true, result.evidenceRefs),
    error,
    nextActions: []
  };
}

function mutationScope(context) {
  const project = context.inputs?.projectContext?.project;
  const taskRef = context.request.input.taskRef;
  return {
    operationId: context.operationId,
    project,
    projectId: project?.projectId ?? project?.id,
    task: context.inputs?.task,
    taskRef,
    request: context.request,
    trustedContext: context.trustedContext
  };
}

function runResource(scope, run, status, data) {
  return {
    kind: 'run',
    id: run.runId,
    status: normalizeResourceStatus(status),
    projectRef: scope.projectId ?? null,
    taskRef: scope.taskRef,
    runId: run.runId,
    data
  };
}

function taskResource(scope, status, data) {
  return {
    kind: 'task',
    id: scope.taskRef,
    status,
    projectRef: scope.projectId ?? null,
    taskRef: scope.taskRef,
    runId: null,
    data
  };
}

function requireRun(run, operation) {
  if (!run || typeof run.runId !== 'string' || !run.runId) {
    throw new TypeError(`${operation} lifecycle authority must return a run with runId.`);
  }
  return run;
}

function normalizeResourceStatus(value) {
  return ['prepared', 'starting', 'running', 'ready', 'stopping', 'stopped', 'completed', 'failed', 'partial', 'stale', 'unknown', 'external', 'indeterminate'].includes(value)
    ? value
    : 'unknown';
}

function confirmedEffects(changed, evidenceRefs = []) {
  return { certainty: 'confirmed', changed: Boolean(changed), evidenceRefs };
}

function outputData(result) {
  return {
    exitCode: result.exitCode ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

function normalizeMutationError(error, code, message) {
  return {
    code: error?.code ?? code,
    message: error?.message ?? message,
    details: error?.details ?? {}
  };
}

function observationResult(input) {
  return {
    outcome: successOutcome(input.code, input.message),
    resource: {
      kind: input.kind,
      id: input.taskRef,
      status: 'available',
      projectRef: input.projectId ?? null,
      taskRef: input.taskRef ?? null,
      runId: input.runId ?? null,
      data: input.data
    },
    effects: noEffects(),
    error: null,
    nextActions: []
  };
}

function withoutCursor(input) {
  const { cursor: _cursor, ...query } = input;
  return query;
}

function successOutcome(code, message) {
  return { kind: 'succeeded', code, message, reusedExistingRun: false };
}

function noEffects() {
  return { certainty: 'none', changed: false, evidenceRefs: [] };
}
