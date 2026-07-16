import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { LaunchdeckError } from './errors.js';

export const CONFIG_FILES = [
  '.launchdeck.yml',
  '.launchdeck.yaml',
  'launchdeck.yml',
  'launchdeck.yaml'
];

export const RISK_LEVELS = new Set(['low', 'medium', 'high', 'destructive']);

export class LaunchdeckConfigError extends LaunchdeckError {
  constructor(message, code = 'config_invalid', details = undefined) {
    super(code, message, details);
    this.name = 'LaunchdeckConfigError';
  }
}

export function findConfig(startDir = process.cwd()) {
  let current = path.resolve(startDir);

  while (true) {
    for (const fileName of CONFIG_FILES) {
      const candidate = path.join(current, fileName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function loadConfig(startDir = process.cwd()) {
  const configPath = findConfig(startDir);
  if (!configPath) {
    throw new LaunchdeckConfigError(
      'No Launchdeck config found. Run `launchdeck init` to create .launchdeck.yml.',
      'config_not_found'
    );
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  let parsed;
  try {
    parsed = YAML.parse(raw);
  } catch (error) {
    throw new LaunchdeckConfigError(`Failed to parse ${configPath}: ${error.message}`, 'config_invalid', {
      configPath
    });
  }

  return normalizeConfig(parsed, {
    configPath,
    projectRoot: path.dirname(configPath)
  });
}

export function normalizeConfig(input, context = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new LaunchdeckConfigError('Launchdeck config must be a YAML object.');
  }

  if (input.version === undefined) {
    throw new LaunchdeckConfigError('Launchdeck config requires `version: 1`.');
  }

  const version = input.version;
  if (version !== 1) {
    throw new LaunchdeckConfigError(
      `Unsupported Launchdeck config version: ${version}`,
      'unsupported_config_version'
    );
  }

  if (!input.tasks || typeof input.tasks !== 'object' || Array.isArray(input.tasks)) {
    throw new LaunchdeckConfigError('Launchdeck config requires a non-empty `tasks` object.');
  }

  const projectRoot = context.projectRoot ? path.resolve(context.projectRoot) : process.cwd();

  const tasks = {};
  for (const [name, value] of Object.entries(input.tasks)) {
    tasks[name] = normalizeTask(name, value, projectRoot);
  }

  if (Object.keys(tasks).length === 0) {
    throw new LaunchdeckConfigError('Launchdeck config requires at least one task.');
  }

  const project = normalizeProject(input.project, projectRoot);

  return {
    version,
    project,
    tasks,
    clean: normalizeClean(input.clean),
    configPath: context.configPath ? path.resolve(context.configPath) : undefined,
    projectRoot
  };
}

export function normalizeTask(name, value, projectRoot = process.cwd()) {
  const source = typeof value === 'string' ? { command: value } : value;

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new LaunchdeckConfigError(`Task '${name}' must be a command string or object.`);
  }

  const command = normalizeString(source.command, `Task '${name}' requires a command.`);
  const risk = source.risk ?? 'medium';
  if (!RISK_LEVELS.has(risk)) {
    throw new LaunchdeckConfigError(
      `Task '${name}' has invalid risk '${risk}'. Use low, medium, high, or destructive.`
    );
  }

  const cwd = optionalString(source.cwd) ?? '.';
  assertContainedPath(
    projectRoot,
    cwd,
    `Task '${name}' cwd must stay inside the project root.`,
    'project_root_escape'
  );

  const log = optionalString(source.log);
  if (log !== undefined) {
    assertContainedPath(
      projectRoot,
      log,
      `Task '${name}' log must stay inside the project root.`,
      'project_root_escape'
    );
  }

  const longRunning = Boolean(source.longRunning);

  return {
    name,
    command,
    description: optionalString(source.description),
    cwd,
    env: normalizeEnv(source.env),
    longRunning,
    ports: normalizePorts(source.ports, name),
    risk,
    type: longRunning ? 'managed' : 'command',
    log
  };
}

function normalizeProject(project, projectRoot) {
  if (project === undefined) {
    return { name: path.basename(projectRoot) };
  }
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new LaunchdeckConfigError('`project` must be an object when provided.');
  }
  return {
    name: optionalString(project.name) ?? path.basename(projectRoot)
  };
}

function normalizeClean(clean) {
  if (clean === undefined) {
    return { safe: [], risky: [] };
  }
  if (!clean || typeof clean !== 'object' || Array.isArray(clean)) {
    throw new LaunchdeckConfigError('`clean` must be an object when provided.');
  }

  return {
    safe: normalizeCleanList(clean.safe, 'clean.safe', 'safe'),
    risky: normalizeCleanList(clean.risky, 'clean.risky', 'risky')
  };
}

function normalizeCleanList(value, fieldName, kind) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new LaunchdeckConfigError(`'${fieldName}' must be an array.`);
  }

  return value.map((entry, index) => {
    let rawPath;
    let description;
    if (typeof entry === 'string') {
      rawPath = normalizeString(entry, `${fieldName}[${index}] cannot be empty.`, 'clean_target_empty');
    } else {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new LaunchdeckConfigError(`${fieldName}[${index}] must be a path string or object.`);
      }
      rawPath = normalizeString(
        entry.path,
        `${fieldName}[${index}].path is required.`,
        'clean_target_empty'
      );
      description = optionalString(entry.description);
    }
    const target = {
      kind,
      rawPath
    };

    if (description !== undefined) {
      target.description = description;
    }

    return target;
  });
}

function normalizeEnv(env) {
  if (env === undefined) {
    return {};
  }
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new LaunchdeckConfigError('Task env must be an object.');
  }

  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => {
      if (value === null || value === undefined) {
        throw new LaunchdeckConfigError(`Environment variable '${key}' cannot be null.`);
      }
      return [key, String(value)];
    })
  );
}

function normalizePorts(ports, taskName) {
  if (ports === undefined) {
    return [];
  }
  if (!Array.isArray(ports)) {
    throw new LaunchdeckConfigError(`Task '${taskName}' ports must be an array.`);
  }
  const normalized = ports.map((port) => Number(port));
  for (const port of normalized) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new LaunchdeckConfigError(
        `Task '${taskName}' has invalid port '${port}'. Use an integer from 1 to 65535.`
      );
    }
  }
  return [...new Set(normalized)];
}

function normalizeString(value, message, code = 'config_invalid') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new LaunchdeckConfigError(message, code);
  }
  return value.trim();
}

function optionalString(value) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new LaunchdeckConfigError('Expected a string value.');
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function assertContainedPath(projectRoot, targetPath, message, code) {
  const rootPath = path.resolve(projectRoot);
  const resolvedPath = path.resolve(rootPath, targetPath);
  if (!isInsidePath(rootPath, resolvedPath)) {
    throw new LaunchdeckConfigError(message, code, {
      projectRoot: rootPath,
      targetPath: resolvedPath
    });
  }
  return resolvedPath;
}

function isInsidePath(rootPath, targetPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function createSampleConfig(projectName = path.basename(process.cwd())) {
  return `version: 1
project:
  name: ${projectName}
tasks:
  setup:
    command: npm install
    risk: medium
  build:
    command: npm run build
  test:
    command: npm test
  dev:
    command: npm run dev -- --host 127.0.0.1
    longRunning: true
    ports: [5173]
    risk: medium
clean:
  safe:
    - dist
    - node_modules/.vite
  risky:
    - node_modules
`;
}
