import { LaunchdeckError, toContractErrorPayload } from './errors.js';

const PARTIAL_FAILURE = new LaunchdeckError(
  'partial_failure',
  'One or more operations failed.'
);

export function createSuccessEnvelope(command, payload = {}, context = {}) {
  const { status = 'ok', next, ...rest } = payload;
  return compactEnvelope({
    ok: true,
    schemaVersion: 1,
    command,
    status,
    ...contextFields(context),
    data: rest,
    next: normalizeNextActions(next),
    ...rest
  });
}

export function createFailureEnvelope(command, error, context = {}, payload = {}) {
  const errorPayload = toContractErrorPayload(error);
  const { next, ...rest } = payload;
  const nextActions = normalizeNextActions(
    next ?? error?.next ?? errorPayload.next ?? errorPayload.details?.next,
    errorPayload.code,
    command
  );
  return compactEnvelope({
    ok: false,
    schemaVersion: 1,
    command,
    status: 'error',
    ...contextFields(context),
    data: rest,
    ...contractErrorFields(errorPayload, rest),
    next: nextActions,
    ...rest,
    error: errorPayload
  });
}

export function createPartialEnvelope(command, results, context = {}, payload = {}) {
  const { error = PARTIAL_FAILURE, next, ...rest } = payload;
  const errorPayload = toContractErrorPayload(error);
  const nextActions = normalizeNextActions(
    next ?? error?.next ?? errorPayload.next ?? errorPayload.details?.next,
    errorPayload.code,
    command
  );
  return compactEnvelope({
    ok: false,
    schemaVersion: 1,
    command,
    status: 'partial',
    ...contextFields(context),
    data: {
      results: normalizeResultErrors(results),
      ...rest
    },
    results: normalizeResultErrors(results),
    ...contractErrorFields(errorPayload, rest),
    next: nextActions,
    ...rest,
    error: errorPayload
  });
}

export function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function toCompactJson(value) {
  if (!isPlainObject(value)) {
    return value;
  }

  const payload = payloadFields(value);
  const out = compactEnvelope({
    ok: value.ok,
    schemaVersion: value.schemaVersion,
    command: value.command,
    status: value.status
  });

  const errorCode = value.error?.code ?? (typeof value.code === 'string' ? value.code : undefined);
  if (value.ok === false && errorCode) {
    out.code = errorCode;
  }
  if (value.ok === false) {
    out.message = value.error?.message ?? value.message;
  }

  const exitCode = typeof payload.code === 'number'
    ? payload.code
    : typeof value.code === 'number'
      ? value.code
      : undefined;
  if (exitCode !== undefined) {
    out.exitCode = exitCode;
  }

  copyScalars(out, payload);
  copyPrimaryObjects(out, payload);
  copySections(out, payload, value.command);

  const details = value.details ?? value.error?.details;
  if (value.ok === false && isMeaningful(details)) {
    out.details = compactValue(details);
  }

  if (Array.isArray(value.next) && value.next.length > 0) {
    out.next = compactNextActions(value.next);
  }

  return compactEnvelope(out);
}

export function writeJson(io, value) {
  const output = io?.launchdeckJson?.compact ? toCompactJson(value) : value;
  io.stdout.write(stringifyJson(output));
}

function contextFields(context) {
  return {
    projectRoot: context.projectRoot,
    configPath: context.configPath
  };
}

function compactEnvelope(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

function contractErrorFields(errorPayload, payload) {
  return {
    code: payload.code ?? errorPayload.code,
    message: payload.message ?? errorPayload.message,
    details: payload.details ?? errorPayload.details ?? {}
  };
}

function normalizeNextActions(next, code = undefined, command = undefined) {
  if (Array.isArray(next) && next.length > 0) {
    return next;
  }
  return defaultNextActions(code, command);
}

function defaultNextActions(code, command) {
  if (code === 'confirmation_required' && command === 'clean') {
    return [
      {
        label: 'Run safe clean',
        command: 'launchdeck clean --safe --json',
        reason: 'Runs only configured safe clean targets without prompting.',
        risk: 'safe'
      }
    ];
  }
  if (code === 'confirmation_required') {
    return [
      {
        label: 'Choose an explicit option',
        command: `launchdeck ${command ?? '<command>'} --help`,
        reason: 'Shows the flags required to proceed non-interactively.',
        risk: 'safe'
      }
    ];
  }
  return [];
}

function normalizeResultErrors(results) {
  if (!Array.isArray(results)) {
    return results;
  }
  return results.map((result) => {
    if (!result?.error) {
      return result;
    }
    return {
      ...result,
      error: toContractErrorPayload(result.error)
    };
  });
}

const ENVELOPE_KEYS = new Set([
  'ok',
  'schemaVersion',
  'command',
  'status',
  'projectRoot',
  'configPath',
  'data',
  'next',
  'error',
  'message',
  'details'
]);

const SCALAR_KEYS = [
  'scope',
  'target',
  'task',
  'alias',
  'projectId',
  'runId',
  'pid',
  'port',
  'ports',
  'ownerType',
  'ownership',
  'classification',
  'dryRun',
  'mode',
  'created',
  'path',
  'logPath',
  'content',
  'readiness',
  'action',
  'agent',
  'force',
  'source',
  'result'
];

const SECTION_KEYS = [
  'processes',
  'runs',
  'ports',
  'conflicts',
  'projects',
  'tasks',
  'checks',
  'results',
  'events',
  'registered',
  'updatedRuns',
  'staleRuns',
  'unresolved',
  'listeners',
  'declaredOwners',
  'removed',
  'targets',
  'errors',
  'warnings'
];

function payloadFields(value) {
  const legacy = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!ENVELOPE_KEYS.has(key)) {
      legacy[key] = entry;
    }
  }
  return {
    ...legacy,
    ...(isPlainObject(value.data) ? value.data : {})
  };
}

function copyScalars(out, payload) {
  for (const key of SCALAR_KEYS) {
    if (payload[key] !== undefined && isMeaningful(payload[key])) {
      out[key] = compactValue(payload[key], key);
    }
  }
  if (payload.stdout) {
    out.stdout = compactText(payload.stdout);
  }
  if (payload.stderr) {
    out.stderr = compactText(payload.stderr);
  }
  if (payload.summary !== undefined) {
    out.summary = compactValue(payload.summary, 'summary');
  }
}

function copyPrimaryObjects(out, payload) {
  if (payload.project !== undefined) {
    out.project = compactProject(payload.project);
  }
  if (payload.process !== undefined) {
    out.process = compactProcess(payload.process);
  }
  if (payload.run !== undefined) {
    out.run = compactProcess(payload.run);
  }
  if (payload.startedRun !== undefined) {
    out.startedRun = compactProcess(payload.startedRun);
  }
}

function copySections(out, payload, command) {
  const counts = {};
  for (const key of SECTION_KEYS) {
    if (shouldSkipSection(key, payload, command)) {
      continue;
    }
    const section = payload[key];
    if (!Array.isArray(section) || section.length === 0) {
      continue;
    }
    out[key] = section.map((entry) => compactSectionEntry(key, entry));
    counts[key] = section.length;
  }
  if (Object.keys(counts).length > 0) {
    out.counts = counts;
  }
}

function shouldSkipSection(key, payload, command) {
  return key === 'runs'
    && command === 'ps'
    && arraysEquivalent(payload.runs, payload.processes);
}

function compactSectionEntry(key, entry) {
  if (['processes', 'runs', 'updatedRuns', 'staleRuns'].includes(key)) {
    return compactProcess(entry);
  }
  if (key === 'ports') {
    return compactPort(entry);
  }
  if (key === 'projects' || key === 'registered') {
    return compactProject(entry);
  }
  if (key === 'tasks') {
    return compactTask(entry);
  }
  if (key === 'checks') {
    return pickCompact(entry, ['code', 'status', 'severity', 'message', 'task']);
  }
  if (key === 'events') {
    return pickCompact(entry, ['timestamp', 'level', 'type', 'status', 'projectId', 'alias', 'task', 'runId', 'message', 'next']);
  }
  if (key === 'conflicts') {
    return pickCompact(entry, ['id', 'type', 'port', 'project', 'task', 'ownerType', 'ownership', 'status', 'message']);
  }
  if (key === 'listeners') {
    return pickCompact(entry, ['pid', 'localAddress', 'port', 'source']);
  }
  if (key === 'declaredOwners') {
    return pickCompact(entry, ['project', 'task', 'port', 'status', 'ownership']);
  }
  if (key === 'results') {
    return pickCompact(entry, ['task', 'ok', 'status', 'pid', 'runId', 'ports', 'code', 'message', 'error']);
  }
  if (key === 'targets') {
    return pickCompact(entry, ['agent', 'label', 'scope', 'skillRoot', 'targetDir', 'explicit', 'path', 'kind', 'status', 'existed', 'removed', 'refusalCode', 'message']);
  }
  if (key === 'removed') {
    return pickCompact(entry, ['path', 'kind', 'status', 'existed', 'removed', 'refusalCode', 'message']);
  }
  return compactValue(entry, key);
}

function compactProcess(processInfo) {
  if (!isPlainObject(processInfo)) {
    return processInfo;
  }
  return pickCompact(
    {
      ...processInfo,
      project: compactProject(processInfo.project),
      task: processInfo.task ?? processInfo.name
    },
    ['project', 'task', 'status', 'pid', 'ports', 'runId', 'spawned', 'readiness', 'ownership', 'ownerType', 'exitCode']
  );
}

function compactPort(entry) {
  if (!isPlainObject(entry)) {
    return entry;
  }
  return pickCompact(
    {
      ...entry,
      project: compactProject(entry.project),
      task: entry.task ?? entry.process?.task ?? entry.process?.name,
      status: entry.status ?? entry.process?.status,
      pid: entry.pid ?? entry.process?.pid,
      owner: entry.owner ?? entry.ownership ?? entry.ownerType
    },
    ['port', 'project', 'task', 'status', 'pid', 'owner', 'ownerType', 'ownership', 'listeners', 'declaredOwners']
  );
}

function compactProject(project) {
  if (!isPlainObject(project)) {
    return project;
  }
  return project.alias ?? project.name ?? project.projectId ?? project.id;
}

function compactTask(task) {
  if (!isPlainObject(task)) {
    return task;
  }
  return pickCompact(task, ['name', 'type', 'risk', 'ports', 'longRunning', 'status']);
}

function pickCompact(record, keys) {
  if (!isPlainObject(record)) {
    return record;
  }
  const out = {};
  for (const key of keys) {
    if (record[key] !== undefined && isMeaningful(record[key])) {
      out[key] = compactValue(record[key], key);
    }
  }
  return compactEnvelope(out);
}

function compactValue(value, key = undefined) {
  if (Array.isArray(value)) {
    return value.map((entry) => compactValue(entry, key));
  }
  if (isPlainObject(value)) {
    if (key === 'target') {
      return compactTarget(value);
    }
    if (key === 'source') {
      return compactSource(value);
    }
    if (key === 'result') {
      return compactResult(value);
    }
    if (key === 'ownership') {
      return compactOwnership(value);
    }
    if (key === 'project') {
      return compactProject(value);
    }
    if (key === 'process' || key === 'run') {
      return compactProcess(value);
    }
    const out = {};
    const preferredKeys = [
      'code',
      'message',
      'status',
      'summary',
      'ok',
      'warn',
      'error',
      'total',
      'running',
      'stopped',
      'stale',
      'conflicts',
      'projects',
      'processes',
      'ports',
      'task',
      'pid',
      'runId',
      'port',
      'ownerType',
      'ownership',
      'path'
    ];
    for (const preferredKey of preferredKeys) {
      if (value[preferredKey] !== undefined) {
        out[preferredKey] = compactValue(value[preferredKey], preferredKey);
      }
    }
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (out[entryKey] !== undefined || shouldDropNestedKey(entryKey)) {
        continue;
      }
      if (isSimpleValue(entryValue) || isMeaningful(entryValue)) {
        out[entryKey] = compactValue(entryValue, entryKey);
      }
    }
    return compactEnvelope(out);
  }
  if (typeof value === 'string' && (key === 'stdout' || key === 'stderr')) {
    return compactText(value);
  }
  return value;
}

function compactTarget(target) {
  if (!isPlainObject(target)) {
    return target;
  }
  if (target.agent && target.targetDir) {
    return compactEnvelope({
      agent: target.agent,
      scope: target.scope,
      dir: target.targetDir,
      explicit: target.explicit
    });
  }
  if (target.raw) {
    return target.raw;
  }
  const typedTarget = [target.type, target.value].filter(Boolean).join(':');
  return typedTarget || compactValue(target);
}

function compactSource(source) {
  if (!isPlainObject(source)) {
    return source;
  }
  return pickCompact(source, ['name', 'path', 'exists', 'valid']);
}

function compactResult(result) {
  if (!isPlainObject(result)) {
    return result;
  }

  const actions = Array.isArray(result.actions) ? result.actions : [];
  const counts = {};
  for (const action of actions) {
    const key = action?.type;
    if (!key) {
      continue;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const files = actions
    .map((action) => action?.relativePath)
    .filter(Boolean);

  return compactEnvelope({
    status: result.status,
    current: result.current,
    divergent: result.divergent,
    actionCount: actions.length || undefined,
    actionCounts: Object.keys(counts).length > 0 ? counts : undefined,
    files: files.length > 0 ? files : undefined,
    differentFiles: nonEmptyArray(result.differentFiles),
    missingFiles: nonEmptyArray(result.missingFiles),
    extraFiles: nonEmptyArray(result.extraFiles)
  });
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0 ? value : undefined;
}

function compactOwnership(ownership) {
  if (!isPlainObject(ownership)) {
    return ownership;
  }
  return compactEnvelope({
    confidence: ownership.confidence,
    alive: ownership.processAlive,
    pidMatch: ownership.pidMatchesRun,
    reasons: ownership.reasons
  });
}

function compactNextActions(next) {
  return next
    .map((action) => {
      if (typeof action === 'string') {
        return action;
      }
      if (isPlainObject(action)) {
        if (action.command) {
          return compactEnvelope({
            cmd: action.command,
            risk: action.risk
          });
        }
        return action.label;
      }
      return undefined;
    })
    .filter(Boolean);
}

function compactText(value, maxLength = 1_200) {
  if (typeof value !== 'string' || value.length <= maxLength) {
    return value;
  }
  const headLength = 240;
  const tailLength = maxLength - headLength - 80;
  return [
    value.slice(0, headLength),
    `\n...[truncated ${value.length - headLength - tailLength} chars]...\n`,
    value.slice(value.length - tailLength)
  ].join('');
}

function shouldDropNestedKey(key) {
  return [
    'command',
    'cwd',
    'env',
    'log',
    'logPath',
    'projectRoot',
    'configPath',
    'absolutePath',
    'resolvedPath'
  ].includes(key);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSimpleValue(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function isMeaningful(value) {
  if (value === undefined || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isPlainObject(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

function arraysEquivalent(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}
