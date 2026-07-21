export const CLI_OPERATION_ROUTES = Object.freeze([
  route('capabilities', 'capabilities.get'),
  route('diagnose', 'system.diagnose'),
  route('projects', 'project.list'),
  route('tasks', 'task.list'),
  route('inspect', 'project.inspect'),
  route('logs', 'task.logs.read'),
  route('events', 'task.events.read'),
  route('adoption.inspect', 'adoption.inspect'),
  route('operation.list', 'operation.list'),
  route('operation.get', 'operation.get'),
  route('operation.reconcile', 'operation.reconcile')
]);

export const CLI_MUTATION_ROUTES = Object.freeze([
  route('start', 'task.start', 'mutation'),
  route('dev', 'task.start', 'mutation'),
  route('run', 'task.run', 'mutation'),
  route('lifecycle', 'task.run', 'mutation'),
  route('stop', 'task.stop', 'mutation'),
  route('restart', 'task.restart', 'mutation')
]);

export const CLI_CLEAN_ROUTES = Object.freeze([
  route('clean', 'clean.plan'),
  route('clean.safe', 'clean.applySafe', 'mutation')
]);

export const CLI_ONLY_ROUTES = Object.freeze([
  'init',
  'project.add',
  'agent.install',
  'force-stop',
  'clean.all',
  'logs.follow',
  'stop.all',
  'stop.force-owned',
  'lifecycle.risky'
]);

export function mapCliInvocation({ positionals = [], options = {}, context = {} } = {}) {
  const command = positionals[0];
  if (isCliOnlyInvocation(positionals, options)) return null;

  if (command === 'capabilities') return mapped('capabilities.get', {});
  if (command === 'diagnose') {
    return mapped('system.diagnose', defined({
      projectRef: context.projectRef,
      checks: options.checks
    }));
  }
  if (command === 'projects') {
    return mapped('project.list', pageInput(options));
  }
  if (command === 'tasks') {
    return mapped('task.list', defined({
      projectRef: context.projectRef,
      ...pageInput(options)
    }));
  }
  if (command === 'inspect') {
    return mapped('project.inspect', defined({
      projectRef: context.projectRef,
      target: parseInspectionTarget(positionals[1])
    }));
  }
  if (command === 'logs') {
    return mapped('task.logs.read', defined({
      projectRef: context.projectRef,
      taskRef: positionals[1] ?? context.taskRef ?? 'dev',
      cursor: options.cursor,
      limit: options.limit ?? options.lines,
      maxBytes: options.maxBytes
    }));
  }
  if (command === 'events') {
    return mapped('task.events.read', defined({
      projectRef: context.projectRef,
      taskRef: context.taskRef ?? positionals[1],
      runId: options.runId,
      cursor: options.cursor,
      limit: options.limit ?? options.lines,
      windowSeconds: options.windowSeconds
    }));
  }
  if (command === 'adoption' && positionals[1] === 'inspect') {
    return mapped('adoption.inspect', defined({
      projectRef: context.projectRef,
      maxDepth: options.maxDepth,
      maxFiles: options.maxFiles,
      signals: options.signals
    }));
  }
  if (command === 'operation' && positionals[1] === 'list') {
    return mapped('operation.list', defined({
      projectRef: context.projectRef,
      taskRef: options.taskRef,
      operationName: options.operationName,
      createdAfter: options.createdAfter,
      createdBefore: options.createdBefore,
      states: options.states,
      cursor: options.cursor,
      limit: options.limit
    }));
  }
  if (command === 'operation' && positionals[1] === 'get') {
    return mapped('operation.get', { operationId: positionals[2] });
  }
  if (command === 'operation' && positionals[1] === 'reconcile') {
    return mapped('operation.reconcile', { operationId: positionals[2] });
  }
  if (command === 'clean') {
    return options.safe
      ? (context.planDigest
          ? mapped('clean.applySafe', defined({
              projectRef: context.projectRef,
              planDigest: context.planDigest
            }))
          : null)
      : mapped('clean.plan', defined({ projectRef: context.projectRef }));
  }
  if (context.agentEligible === false) return null;
  if (command === 'start') {
    return mapped('task.start', taskMutationInput(context, positionals[1] ?? context.taskRef ?? 'dev'));
  }
  if (command === 'dev') {
    return mapped('task.start', taskMutationInput(context, 'dev'));
  }
  if (command === 'run') {
    const operation = context.longRunning ? 'task.start' : 'task.run';
    return mapped(operation, defined({
      ...taskMutationInput(context, positionals[1] ?? context.taskRef),
      ...(operation === 'task.run' ? { output: options.output } : {})
    }));
  }
  if (['setup', 'build', 'package', 'test', 'lint', 'typecheck'].includes(command)) {
    return mapped('task.run', taskMutationInput(context, command));
  }
  if (command === 'stop' && positionals[1]) {
    return mapped('task.stop', taskMutationInput(context, context.taskRef ?? positionals[1]));
  }
  if (command === 'restart') {
    return mapped('task.restart', taskMutationInput(context, context.taskRef ?? positionals[1]));
  }
  return null;
}

function route(routeName, operation, kind = 'query') {
  return Object.freeze({ route: routeName, operation, kind });
}

function mapped(operation, input) {
  return { operation, input };
}

function pageInput(options) {
  return defined({ cursor: options.cursor, limit: options.limit });
}

function taskMutationInput(context, taskRef) {
  return defined({ projectRef: context.projectRef, taskRef });
}

function defined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function isCliOnlyInvocation(positionals, options) {
  const command = positionals[0];
  return command === 'init'
    || (command === 'project' && positionals[1] === 'add')
    || (command === 'agent' && positionals[1] === 'install')
    || command === 'force-stop'
    || (command === 'clean' && options.all)
    || (command === 'logs' && options.follow)
    || (command === 'stop' && (!positionals[1] || options.forceOwned));
}

function parseInspectionTarget(rawTarget) {
  if (typeof rawTarget !== 'string') return undefined;
  const separator = rawTarget.indexOf(':');
  if (separator < 1 || separator === rawTarget.length - 1) return undefined;
  const kind = rawTarget.slice(0, separator);
  const rawValue = rawTarget.slice(separator + 1);
  if (kind === 'port' || kind === 'pid') {
    const value = Number(rawValue);
    return Number.isInteger(value) ? { kind, value } : undefined;
  }
  return ['project', 'task', 'run', 'conflict'].includes(kind)
    ? { kind, value: rawValue }
    : undefined;
}
