import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LaunchdeckError } from '../errors.js';

export const REGISTRY_STATE_VERSION = 2;

export function controlPlanePaths(env = process.env) {
  const homeDir = env.LAUNCHDECK_HOME
    ? path.resolve(env.LAUNCHDECK_HOME)
    : defaultHomeDir(env);

  return {
    homeDir,
    legacyRegistryPath: path.join(homeDir, 'projects.json'),
    registryDir: path.join(homeDir, 'registry'),
    registryPath: path.join(homeDir, 'registry', 'projects.json'),
    runtimeDir: path.join(homeDir, 'runtime'),
    runsPath: path.join(homeDir, 'runtime', 'runs.json'),
    indexesDir: path.join(homeDir, 'runtime', 'indexes'),
    locksDir: path.join(homeDir, 'locks'),
    registryLockPath: path.join(homeDir, 'locks', 'registry.lock'),
    eventsDir: path.join(homeDir, 'events'),
    eventsPath: path.join(homeDir, 'events', 'events.jsonl'),
    logsDir: path.join(homeDir, 'logs')
  };
}

export function projectControlPlanePaths(projectId, env = process.env) {
  const paths = controlPlanePaths(env);
  const safeProjectId = safePathToken(projectId);
  return {
    lockPath: path.join(paths.locksDir, `project-${safeProjectId}.lock`),
    logsDir: path.join(paths.logsDir, safeProjectId)
  };
}

export function taskControlPlanePaths(projectId, taskName, env = process.env) {
  const paths = controlPlanePaths(env);
  return {
    lockPath: path.join(
      paths.locksDir,
      `task-${safePathToken(projectId)}-${safePathToken(taskName)}.lock`
    )
  };
}

export function readRegistryState(env = process.env) {
  const paths = controlPlanePaths(env);
  if (fs.existsSync(paths.registryPath)) {
    const registry = readJson(paths.registryPath);
    validateReadableRegistry(registry, paths.registryPath);
    return normalizeRegistryState(registry, {
      statePath: paths.registryPath,
      source: 'v2'
    });
  }

  if (fs.existsSync(paths.legacyRegistryPath)) {
    const registry = readJson(paths.legacyRegistryPath);
    validateLegacyRegistry(registry, paths.legacyRegistryPath);
    return normalizeLegacyRegistry(registry, paths.legacyRegistryPath);
  }

  return createEmptyRegistryState();
}

export function writeRegistryState(registry, env = process.env) {
  const paths = controlPlanePaths(env);
  const now = new Date().toISOString();
  const existingCreatedAt = registry.createdAt ?? now;
  const nextRegistry = {
    version: REGISTRY_STATE_VERSION,
    createdAt: existingCreatedAt,
    updatedAt: now,
    projects: sortProjects((registry.projects ?? []).map(normalizeProjectRegistration)),
    migratedFrom: registry.migratedFrom
  };

  validateWritableRegistry(nextRegistry, paths.registryPath);
  atomicWriteJson(paths.registryPath, compactObject(nextRegistry));
  return compactObject(nextRegistry);
}

export function updateRegistryState(updater, env = process.env) {
  const current = readRegistryState(env);
  const next = updater(current);
  if (!next || typeof next !== 'object') {
    throw new LaunchdeckError('global_registry_invalid', 'Registry updater must return a registry object.');
  }
  return writeRegistryState({
    ...current,
    ...next,
    projects: next.projects ?? current.projects
  }, env);
}

export function normalizeProjectRegistration(project) {
  const projectRoot = path.resolve(project.projectRoot);
  const alias = project.alias ?? project.name ?? path.basename(projectRoot);
  const projectId = project.projectId ?? project.id ?? stableProjectId(projectRoot);
  const now = new Date().toISOString();

  return compactObject({
    projectId,
    id: project.id ?? projectId,
    alias,
    name: project.name ?? alias,
    key: project.key ?? projectKey(projectRoot),
    projectRoot,
    configPath: path.resolve(project.configPath),
    configHash: project.configHash,
    status: project.status ?? 'active',
    addedAt: project.addedAt ?? now,
    updatedAt: project.updatedAt ?? now,
    lastSeenAt: project.lastSeenAt ?? project.updatedAt ?? now
  });
}

export function assertAliasAvailable(projects, alias, projectId = undefined) {
  const existing = projects.find((project) =>
    project.alias === alias && project.projectId !== projectId
  );
  if (!existing) {
    return;
  }

  throw new LaunchdeckError('alias_conflict', `Project alias '${alias}' is already registered.`, {
    alias,
    existingProjectId: existing.projectId
  });
}

export function unsupportedStateVersionError(statePath, foundVersion) {
  return new LaunchdeckError(
    'state_version_unsupported',
    `Launchdeck state at ${statePath} uses unsupported version ${foundVersion}.`,
    {
      statePath,
      foundVersion,
      supportedVersion: REGISTRY_STATE_VERSION,
      next: [
        {
          label: 'Repair project registry',
          command: 'launchdeck project repair <project>',
          reason: 'Repairs or migrates registry metadata using the current Launchdeck state contract.',
          risk: 'safe'
        }
      ]
    }
  );
}

function defaultHomeDir(env) {
  if (process.platform === 'win32' && env.LOCALAPPDATA) {
    return path.join(env.LOCALAPPDATA, 'Launchdeck');
  }
  if (env.XDG_STATE_HOME) {
    return path.join(env.XDG_STATE_HOME, 'launchdeck');
  }
  return path.join(os.homedir(), '.local', 'state', 'launchdeck');
}

function createEmptyRegistryState() {
  const now = new Date().toISOString();
  return {
    version: REGISTRY_STATE_VERSION,
    createdAt: now,
    updatedAt: now,
    projects: []
  };
}

function normalizeRegistryState(registry) {
  return compactObject({
    version: REGISTRY_STATE_VERSION,
    createdAt: registry.createdAt ?? registry.updatedAt ?? new Date().toISOString(),
    updatedAt: registry.updatedAt ?? new Date().toISOString(),
    projects: sortProjects(registry.projects.map(normalizeProjectRegistration)),
    migratedFrom: registry.migratedFrom
  });
}

function normalizeLegacyRegistry(registry, legacyRegistryPath) {
  const normalized = normalizeRegistryState({
    version: REGISTRY_STATE_VERSION,
    createdAt: registry.createdAt ?? registry.updatedAt,
    updatedAt: registry.updatedAt,
    projects: registry.projects.map((project) => ({
      projectId: project.projectId ?? project.id,
      alias: project.alias ?? project.name ?? path.basename(project.projectRoot),
      name: project.name,
      projectRoot: project.projectRoot,
      configPath: project.configPath,
      status: project.status ?? 'active',
      addedAt: project.addedAt,
      updatedAt: project.updatedAt,
      lastSeenAt: project.lastSeenAt ?? project.updatedAt
    })),
    migratedFrom: {
      path: legacyRegistryPath,
      version: registry.version
    }
  });
  return normalized;
}

function validateReadableRegistry(registry, registryPath) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw invalidRegistry(registryPath);
  }
  if (!Number.isInteger(registry.version)) {
    throw invalidRegistry(registryPath);
  }
  if (registry.version > REGISTRY_STATE_VERSION) {
    throw unsupportedStateVersionError(registryPath, registry.version);
  }
  if (registry.version !== REGISTRY_STATE_VERSION) {
    throw invalidRegistry(registryPath);
  }
  validateProjectArray(registry.projects, registryPath);
}

function validateLegacyRegistry(registry, registryPath) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw invalidRegistry(registryPath);
  }
  if (registry.version !== 1) {
    throw invalidRegistry(registryPath);
  }
  validateProjectArray(registry.projects, registryPath);
}

function validateWritableRegistry(registry, registryPath) {
  validateReadableRegistry(registry, registryPath);
  const aliases = new Set();
  const projectIds = new Set();
  for (const project of registry.projects) {
    if (aliases.has(project.alias)) {
      throw new LaunchdeckError('alias_conflict', `Project alias '${project.alias}' is already registered.`, {
        alias: project.alias
      });
    }
    aliases.add(project.alias);

    if (projectIds.has(project.projectId)) {
      throw invalidRegistry(registryPath);
    }
    projectIds.add(project.projectId);
  }
}

function validateProjectArray(projects, registryPath) {
  if (!Array.isArray(projects)) {
    throw invalidRegistry(registryPath);
  }
  for (const project of projects) {
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      throw invalidRegistry(registryPath);
    }
    const id = project.projectId ?? project.id;
    if (!id || !project.name || !project.projectRoot || !project.configPath) {
      throw invalidRegistry(registryPath);
    }
  }
}

function invalidRegistry(registryPath) {
  return new LaunchdeckError('global_registry_invalid', `Global project registry is invalid: ${registryPath}`, {
    registryPath
  });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new LaunchdeckError('global_registry_invalid', `Global project registry is invalid: ${filePath}`, {
      registryPath: filePath,
      causeMessage: error?.message
    });
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function stableProjectId(projectRoot) {
  return crypto.createHash('sha256').update(projectKey(projectRoot)).digest('hex').slice(0, 12);
}

function projectKey(projectRoot) {
  const resolved = path.resolve(projectRoot);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function sortProjects(projects) {
  return [...projects].sort((left, right) =>
    left.alias.localeCompare(right.alias) || left.projectRoot.localeCompare(right.projectRoot)
  );
}

function safePathToken(value) {
  const token = String(value ?? '').trim();
  if (!token) {
    return 'unknown';
  }
  return token.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}
