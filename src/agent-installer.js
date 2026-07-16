import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LaunchdeckError } from './errors.js';

export const AGENT_SKILL_NAME = 'launchdeck-agent';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = path.resolve(moduleDir, '..');

const ADAPTERS = [
  {
    id: 'codex',
    label: 'Codex CLI',
    projectSkillRoot: ['.agents', 'skills'],
    userSkillRoot: ['.codex', 'skills']
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    projectSkillRoot: ['.claude', 'skills'],
    userSkillRoot: ['.claude', 'skills']
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    projectSkillRoot: ['.github', 'skills'],
    userSkillRoot: ['.copilot', 'skills']
  },
  {
    id: 'visual-studio',
    label: 'Visual Studio',
    projectSkillRoot: ['.github', 'skills'],
    userSkillRoot: ['.copilot', 'skills']
  }
];

export function listAgentTargets(options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const homeDir = path.resolve(options.homeDir ?? os.homedir());
  const source = validateCanonicalSource(options);

  return {
    source,
    targets: ADAPTERS.flatMap((adapter) => ([
      targetDescriptor(adapter, 'project', projectRoot, homeDir),
      targetDescriptor(adapter, 'user', projectRoot, homeDir)
    ]))
  };
}

export function doctorAgentInstaller(options = {}) {
  const paths = listAgentTargets(options);
  const checks = [];

  checks.push({
    code: 'canonical_source_exists',
    severity: 'error',
    status: paths.source.exists ? 'pass' : 'fail',
    message: paths.source.exists
      ? `Found ${paths.source.path}`
      : `Missing ${paths.source.path}`,
    details: { path: paths.source.path }
  });

  checks.push({
    code: 'canonical_skill_manifest',
    severity: 'error',
    status: paths.source.valid ? 'pass' : 'fail',
    message: paths.source.valid
      ? 'Canonical skill manifest is valid.'
      : paths.source.errors.join('; '),
    details: { errors: paths.source.errors }
  });

  checks.push({
    code: 'adapter_matrix_ready',
    severity: 'info',
    status: paths.targets.length === ADAPTERS.length * 2 ? 'pass' : 'fail',
    message: `${ADAPTERS.length} adapters, ${paths.targets.length} scoped targets.`,
    details: {
      adapters: ADAPTERS.map((adapter) => adapter.id),
      scopes: ['project', 'user']
    }
  });

  const summary = {
    ok: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    error: checks.filter((check) => check.status === 'fail').length
  };

  return {
    ok: summary.error === 0,
    status: summary.error > 0 ? 'error' : 'ok',
    summary,
    source: paths.source,
    targets: paths.targets,
    checks
  };
}

export function installAgentSkill(options = {}) {
  const agent = requireAgent(options.agent);
  const scope = normalizeScope(options.scope);
  const source = validateCanonicalSource(options);
  if (!source.valid) {
    throw new LaunchdeckError(
      'agent_source_invalid',
      `Canonical agent skill source is invalid: ${source.errors.join('; ')}`,
      { source: source.path, errors: source.errors }
    );
  }

  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const homeDir = path.resolve(options.homeDir ?? os.homedir());
  const target = options.target
    ? explicitTargetDescriptor(agent, scope, options.target, projectRoot)
    : targetDescriptor(agent, scope, projectRoot, homeDir);
  const comparison = compareSkillDirectories(source.path, target.targetDir);
  if (comparison.invalidTarget) {
    throw new LaunchdeckError(
      'agent_target_conflict',
      `Target skill path exists but is not a directory: ${target.targetDir}`,
      {
        agent: agent.id,
        scope,
        source: source.path,
        target: target.targetDir,
        next: [
          'Choose a different --target directory',
          'Move the existing file before running install'
        ]
      }
    );
  }

  if (comparison.divergent && !options.force) {
    throw new LaunchdeckError(
      'agent_target_conflict',
      `Target skill already exists and differs from ${source.path}. Use --force to overwrite source-managed files.`,
      {
        agent: agent.id,
        scope,
        source: source.path,
        target: target.targetDir,
        differentFiles: comparison.differentFiles,
        missingFiles: comparison.missingFiles,
        extraFiles: comparison.extraFiles,
        next: [
          `launchdeck agent install --agent ${agent.id} --scope ${scope} --force`
        ]
      }
    );
  }

  const actions = planInstallActions(source.path, target, comparison, Boolean(options.force));

  if (!options.dryRun) {
    applyInstallActions(actions);
  }

  return {
    agent: agent.id,
    scope,
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
    source,
    target,
    result: {
      status: installStatus(comparison, actions, Boolean(options.dryRun)),
      current: comparison.current,
      divergent: comparison.divergent,
      actions,
      differentFiles: comparison.differentFiles,
      missingFiles: comparison.missingFiles,
      extraFiles: comparison.extraFiles
    }
  };
}

export function supportedAgents() {
  return ADAPTERS.map((adapter) => adapter.id);
}

function requireAgent(agentId) {
  if (!agentId) {
    throw new LaunchdeckError('invalid_arguments', '`launchdeck agent install` requires --agent <id>.', {
      supportedAgents: supportedAgents()
    });
  }

  const adapter = ADAPTERS.find((candidate) => candidate.id === agentId);
  if (!adapter) {
    throw new LaunchdeckError('agent_adapter_unsupported', `Unsupported agent '${agentId}'.`, {
      agent: agentId,
      supportedAgents: supportedAgents()
    });
  }
  return adapter;
}

function normalizeScope(scope = 'project') {
  if (scope !== 'project' && scope !== 'user') {
    throw new LaunchdeckError('invalid_arguments', "--scope must be 'project' or 'user'.", {
      scope,
      supportedScopes: ['project', 'user']
    });
  }
  return scope;
}

function validateCanonicalSource(options = {}) {
  const packageRoot = path.resolve(options.packageRoot ?? defaultPackageRoot);
  const sourcePath = path.join(packageRoot, '.agents', 'skills', AGENT_SKILL_NAME);
  const manifestPath = path.join(sourcePath, 'SKILL.md');
  const errors = [];

  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    errors.push('source directory is missing');
  }
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
    errors.push('SKILL.md is missing');
  } else {
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    if (!/name:\s*["']?launchdeck-agent["']?/.test(manifest)) {
      errors.push('SKILL.md does not declare name: launchdeck-agent');
    }
  }

  return {
    name: AGENT_SKILL_NAME,
    path: sourcePath,
    manifestPath,
    exists: errors.length === 0 || fs.existsSync(sourcePath),
    valid: errors.length === 0,
    errors
  };
}

function targetDescriptor(adapter, scope, projectRoot, homeDir) {
  const root = scope === 'project'
    ? path.join(projectRoot, ...adapter.projectSkillRoot)
    : path.join(homeDir, ...adapter.userSkillRoot);
  return {
    agent: adapter.id,
    label: adapter.label,
    scope,
    skillRoot: root,
    targetDir: path.join(root, AGENT_SKILL_NAME)
  };
}

function explicitTargetDescriptor(adapter, scope, target, projectRoot) {
  const root = path.resolve(projectRoot, target);
  return {
    agent: adapter.id,
    label: adapter.label,
    scope,
    skillRoot: root,
    targetDir: path.join(root, AGENT_SKILL_NAME),
    explicit: true
  };
}

function compareSkillDirectories(sourceDir, targetDir) {
  if (!fs.existsSync(targetDir)) {
    return {
      exists: false,
      current: false,
      divergent: false,
      sourceFiles: listFiles(sourceDir),
      targetFiles: [],
      differentFiles: [],
      missingFiles: [],
      extraFiles: []
    };
  }

  if (!fs.statSync(targetDir).isDirectory()) {
    return {
      exists: true,
      invalidTarget: true,
      current: false,
      divergent: true,
      sourceFiles: listFiles(sourceDir),
      targetFiles: [],
      differentFiles: ['.'],
      missingFiles: [],
      extraFiles: []
    };
  }

  const sourceFiles = listFiles(sourceDir);
  const targetFiles = listFiles(targetDir);
  const targetSet = new Set(targetFiles);
  const sourceSet = new Set(sourceFiles);
  const missingFiles = sourceFiles.filter((relativePath) => !targetSet.has(relativePath));
  const extraFiles = targetFiles.filter((relativePath) => !sourceSet.has(relativePath));
  const differentFiles = sourceFiles.filter((relativePath) => {
    if (!targetSet.has(relativePath)) {
      return false;
    }
    return !sameFileContent(
      path.join(sourceDir, relativePath),
      path.join(targetDir, relativePath)
    );
  });
  const divergent = missingFiles.length > 0 || differentFiles.length > 0 || extraFiles.length > 0;

  return {
    exists: true,
    current: !divergent,
    divergent,
    sourceFiles,
    targetFiles,
    differentFiles,
    missingFiles,
    extraFiles
  };
}

function listFiles(root) {
  const files = [];
  collectFiles(root, '', files);
  return files.sort((left, right) => left.localeCompare(right));
}

function collectFiles(root, relativeDir, files) {
  const directory = path.join(root, relativeDir);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(root, relativePath, files);
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else if (entry.isSymbolicLink()) {
      throw new LaunchdeckError('agent_source_invalid', 'Agent skill packages cannot contain symbolic links.', {
        path: absolutePath
      });
    }
  }
}

function sameFileContent(left, right) {
  return fs.readFileSync(left).equals(fs.readFileSync(right));
}

function planInstallActions(sourceDir, target, comparison, force) {
  if (comparison.current) {
    return [];
  }

  const actions = [];
  if (!fs.existsSync(target.skillRoot)) {
    actions.push({ type: 'mkdir', path: target.skillRoot });
  }
  if (!comparison.exists) {
    actions.push({ type: 'mkdir', path: target.targetDir });
  }

  for (const relativePath of comparison.sourceFiles) {
    const targetPath = path.join(target.targetDir, relativePath);
    const sourcePath = path.join(sourceDir, relativePath);
    const exists = fs.existsSync(targetPath);
    const differs = exists && !sameFileContent(sourcePath, targetPath);
    if (!exists || (force && differs)) {
      actions.push({
        type: exists ? 'update_file' : 'copy_file',
        source: sourcePath,
        target: targetPath,
        relativePath
      });
    }
  }

  return actions;
}

function applyInstallActions(actions) {
  for (const action of actions) {
    if (action.type === 'mkdir') {
      fs.mkdirSync(action.path, { recursive: true });
    } else if (action.type === 'copy_file' || action.type === 'update_file') {
      fs.mkdirSync(path.dirname(action.target), { recursive: true });
      fs.copyFileSync(action.source, action.target);
    }
  }
}

function installStatus(comparison, actions, dryRun) {
  if (comparison.current) {
    return 'already_installed';
  }
  if (dryRun) {
    return 'planned';
  }
  if (actions.length === 0) {
    return 'already_installed';
  }
  return 'installed';
}
