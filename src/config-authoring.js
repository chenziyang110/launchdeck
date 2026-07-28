import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import {
  LaunchdeckConfigError,
  findConfig,
  normalizeConfig,
  normalizeTask
} from './config.js';

const SAFE_TASK_NAME = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/;
const LOCAL_COMMAND = /^(?:npm\s+(?:run\s+[A-Za-z0-9:._-]+|test|start)|pnpm\s+(?:run\s+)?[A-Za-z0-9:._-]+|yarn\s+(?:run\s+)?[A-Za-z0-9:._-]+|bun\s+(?:run\s+)?[A-Za-z0-9:._-]+|npx\s+vite\b|vite\b|python(?:\.exe)?\s+(?:-m\s+[A-Za-z0-9._-]+|[^\s]+\.py\b)|py\s+-m\s+[A-Za-z0-9._-]+|uv\s+run\s+(?:python|flask)\b|flask\s+run\b|node(?:\.exe)?\s+[^\s]+|make\s+[A-Za-z0-9:._-]+|just\s+[A-Za-z0-9:._-]+|task\s+[A-Za-z0-9:._-]+|cargo\s+(?:run|build|test)\b|go\s+(?:run|build|test)\b|dotnet\s+(?:run|build|test)\b)(?:\s|$)/i;
const SHELL_CHAIN = /(?:&&|\|\||[;|`<>\n\r]|\$\()/;
const RAW_SHELL = /^(?:sh|bash|zsh|fish|cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh)\s+(?:-c|\/c|-command)\b/i;
const DESTRUCTIVE = /(?:^|\s)(?:rm|rmdir|del|erase|remove-item|format|mkfs|shutdown|reboot)(?:\s|$)|\b(?:drop\s+database|git\s+clean|git\s+reset\s+--hard)\b/i;
const REMOTE_OR_PRODUCTION = /\b(?:deploy|publish|release|production|prod)\b|https?:\/\/(?!localhost(?::|\/)|127\.0\.0\.1(?::|\/)|\[::1\](?::|\/))|--host(?:=|\s+)(?:0\.0\.0\.0|::)\b/i;
const SENSITIVE_ENV = /(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL|AUTHORIZATION|COOKIE)/i;

export function assessTaskAuthoringRisk(task, projectRoot = process.cwd()) {
  const reasons = [];
  const cwd = typeof task?.cwd === 'string' && task.cwd.trim() ? task.cwd.trim() : '.';
  const command = typeof task?.command === 'string' ? task.command.trim() : '';

  try {
    normalizeTask('candidate', { command, cwd, risk: 'medium' }, projectRoot);
  } catch (error) {
    if (error?.code === 'project_root_escape') throw error;
    reasons.push('command_or_cwd_invalid');
  }

  const resolvedCwd = path.resolve(projectRoot, cwd);
  if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
    reasons.push('cwd_not_fixed_existing_directory');
  }
  if (!LOCAL_COMMAND.test(command)) reasons.push('command_not_declared_local_tool');
  if (SHELL_CHAIN.test(command) || RAW_SHELL.test(command)) reasons.push('raw_shell_chain');
  if (DESTRUCTIVE.test(command)) reasons.push('destructive_command');
  if (REMOTE_OR_PRODUCTION.test(command)) reasons.push('remote_or_production_target');

  const env = task?.env;
  if (env && typeof env === 'object' && !Array.isArray(env)) {
    if (Object.keys(env).some((name) => SENSITIVE_ENV.test(name))) {
      reasons.push('sensitive_environment');
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  return uniqueReasons.length === 0
    ? { risk: 'low', agentExecutable: true, reasons: [] }
    : { risk: 'medium', agentExecutable: false, reasons: uniqueReasons };
}

export function proposeTaskPatch(startDir, taskInput, options = {}) {
  return publicProposal(prepareTaskPatch(startDir, taskInput, options));
}

export function applyTaskPatch(startDir, taskInput, options = {}) {
  const target = resolveAuthoringTarget(startDir);
  if (target?.isAncestor) assertAncestorWorkspaceBoundary(target, taskInput, options);

  if (options.authorized !== true) {
    throw new LaunchdeckConfigError(
      'Config patch requires explicit approval with --yes.',
      'confirmation_required'
    );
  }

  const prepared = prepareTaskPatch(startDir, taskInput, options, target);
  if (prepared.operation === 'update' && options.overwrite !== true) {
    throw new LaunchdeckConfigError(
      `Task '${prepared.task}' already exists; pass --overwrite with --yes to update it.`,
      'config_task_collision',
      { task: prepared.task, configPath: prepared.configPath }
    );
  }
  if (options.expectedDigest && options.expectedDigest !== prepared.currentDigest) {
    throw new LaunchdeckConfigError(
      'Config changed after the proposal; create a new proposal before patching.',
      'config_changed',
      {
        expectedDigest: options.expectedDigest,
        actualDigest: prepared.currentDigest,
        configPath: prepared.configPath
      }
    );
  }

  if (prepared.changed) atomicReplace(prepared.configPath, prepared.proposedText);
  return publicProposal(prepared);
}

function prepareTaskPatch(startDir, taskInput, options = {}, resolvedTarget = undefined) {
  const target = resolvedTarget ?? resolveAuthoringTarget(startDir);
  if (!target) {
    throw new LaunchdeckConfigError(
      'No Launchdeck config found. Run `launchdeck init` to create .launchdeck.yml.',
      'config_not_found'
    );
  }
  if (target.isAncestor) assertAncestorWorkspaceBoundary(target, taskInput, options);

  const { configPath, projectRoot } = target;
  const task = normalizeTaskName(taskInput?.name);
  const raw = fs.readFileSync(configPath, 'utf8');
  const document = parseDocument(raw, configPath);
  const parsed = document.toJS();
  normalizeConfig(parsed, { configPath, projectRoot });

  const existing = parsed.tasks?.[task];
  const operation = existing === undefined ? 'add' : 'update';
  const patch = normalizeTaskPatchInput(taskInput, existing, projectRoot);
  const merged = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...existing, ...patch }
    : { ...patch };
  const assessment = assessTaskAuthoringRisk(merged, projectRoot);
  const risk = taskInput.risk === 'medium' ? 'medium' : assessment.risk;
  const reasons = risk === 'medium' && assessment.reasons.length === 0
    ? ['explicit_medium_risk']
    : assessment.reasons;
  merged.risk = risk;

  if (operation === 'add' || typeof existing !== 'object' || Array.isArray(existing)) {
    document.setIn(['tasks', task], merged);
  } else {
    for (const [key, value] of Object.entries(patch)) {
      document.setIn(['tasks', task, key], value);
    }
    document.setIn(['tasks', task, 'risk'], risk);
  }

  const proposedText = document.toString();
  const proposed = document.toJS();
  normalizeConfig(proposed, { configPath, projectRoot });
  const candidate = proposed.tasks[task];

  return {
    configPath,
    projectRoot,
    task,
    operation,
    candidate,
    risk,
    agentExecutable: risk === 'low',
    reasons,
    diff: taskDiff(task, existing, candidate),
    currentDigest: sha256(raw),
    proposedDigest: sha256(proposedText),
    changed: proposedText !== raw,
    proposedText
  };
}

function resolveAuthoringTarget(startDir) {
  const invocationRoot = canonicalPath(startDir);
  const configPath = findConfig(startDir);
  if (!configPath) return undefined;

  const projectRoot = canonicalPath(path.dirname(configPath));
  return {
    configPath,
    projectRoot,
    invocationRoot,
    isAncestor: !samePath(projectRoot, invocationRoot)
  };
}

function assertAncestorWorkspaceBoundary(target, taskInput, options) {
  const expectedCwd = relativePath(target.projectRoot, target.invocationRoot);
  const recoveryPaths = [
    {
      kind: 'nested_config',
      command: 'launchdeck init --nested',
      configPath: path.join(target.invocationRoot, '.launchdeck.yml')
    },
    {
      kind: 'workspace_task_cwd',
      command: `launchdeck config propose --workspace --cwd ${expectedCwd}`,
      configPath: target.configPath,
      cwd: expectedCwd
    }
  ];

  if (options.workspace !== true) {
    throw new LaunchdeckConfigError(
      `Ancestor config found at ${target.configPath}. Create an independent child config with \`launchdeck init --nested\`, or explicitly target the root workspace with \`launchdeck config propose --workspace --cwd ${expectedCwd}\`.`,
      'config_exists',
      {
        configPath: target.configPath,
        targetConfigPath: path.join(target.invocationRoot, '.launchdeck.yml'),
        recoveryPaths
      }
    );
  }

  const requestedCwd = typeof taskInput?.cwd === 'string' ? taskInput.cwd.trim() : '';
  const resolvedCwd = requestedCwd
    ? canonicalPath(path.resolve(target.projectRoot, requestedCwd))
    : undefined;
  if (
    !requestedCwd
    || !isContainedPath(target.projectRoot, target.invocationRoot)
    || !samePath(resolvedCwd, target.invocationRoot)
  ) {
    throw new LaunchdeckConfigError(
      `Ancestor workspace authoring requires explicit --cwd ${expectedCwd}, resolving exactly to the current child project directory.`,
      'project_root_escape',
      {
        configPath: target.configPath,
        projectRoot: target.projectRoot,
        invocationRoot: target.invocationRoot,
        expectedCwd,
        requestedCwd: requestedCwd || undefined,
        recoveryPaths
      }
    );
  }
}

function canonicalPath(value) {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function samePath(left, right) {
  return path.relative(left, right) === '';
}

function isContainedPath(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function relativePath(parent, child) {
  return path.relative(parent, child).split(path.sep).join('/');
}

function normalizeTaskPatchInput(input, existing, projectRoot) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new LaunchdeckConfigError('A task patch object is required.');
  }
  const command = typeof input.command === 'string' ? input.command.trim() : '';
  if (!command) {
    throw new LaunchdeckConfigError('Task patch requires --command.');
  }
  if (input.risk !== undefined && !['low', 'medium'].includes(input.risk)) {
    throw new LaunchdeckConfigError('Config authoring supports only low or medium task risk.');
  }

  const patch = { command };
  for (const key of ['description', 'cwd', 'log']) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  if (input.longRunning === true) patch.longRunning = true;
  if (input.ports !== undefined) patch.ports = input.ports;

  normalizeTask(input.name, {
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...patch,
    risk: 'medium'
  }, projectRoot);
  return patch;
}

function normalizeTaskName(value) {
  if (typeof value !== 'string' || !SAFE_TASK_NAME.test(value)) {
    throw new LaunchdeckConfigError(
      'Task name must use letters, numbers, colon, dot, underscore, or dash.',
      'config_invalid'
    );
  }
  return value;
}

function parseDocument(raw, configPath) {
  const document = YAML.parseDocument(raw, { keepSourceTokens: true });
  if (document.errors.length > 0) {
    throw new LaunchdeckConfigError(
      `Failed to parse ${configPath}: ${document.errors[0].message}`,
      'config_invalid',
      { configPath }
    );
  }
  return document;
}

function taskDiff(task, before, after) {
  const lines = [`@@ tasks.${task} @@`];
  if (before !== undefined) lines.push(...prefixedYaml(before, '- '));
  lines.push(...prefixedYaml(after, '+ '));
  return `${lines.join('\n')}\n`;
}

function prefixedYaml(value, prefix) {
  return YAML.stringify(value, { lineWidth: 0 })
    .trimEnd()
    .split('\n')
    .map((line) => `${prefix}${line}`);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function atomicReplace(configPath, content) {
  const temporaryPath = `${configPath}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  const mode = fs.statSync(configPath).mode;
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', mode);
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, configPath);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw new LaunchdeckConfigError(
      `Failed to atomically patch ${configPath}: ${error.message}`,
      'config_patch_failed',
      { configPath }
    );
  }
}

function publicProposal(prepared) {
  const { proposedText: _proposedText, ...result } = prepared;
  return result;
}
