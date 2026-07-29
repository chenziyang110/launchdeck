import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AGENT_SKILL_NAME,
  createSkillContentManifest
} from '../agent-installer.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PACKAGED_SKILL_ROOT = path.resolve(
  moduleDir,
  '..',
  '..',
  'agent',
  'installer-payload',
  'skill',
  AGENT_SKILL_NAME
);

export const FULL_RUNTIME_ADAPTER_IDS = Object.freeze([
  'codex',
  'claude-code',
  'github-copilot',
  'visual-studio'
]);

export const UPSTREAM_AGENT_IDS = Object.freeze([
  'aider-desk',
  'amp',
  'antigravity',
  'antigravity-cli',
  'astrbot',
  'autohand-code',
  'augment',
  'bob',
  'claude-code',
  'openclaw',
  'cline',
  'codearts-agent',
  'codebuddy',
  'codemaker',
  'codestudio',
  'codex',
  'command-code',
  'continue',
  'cortex',
  'crush',
  'cursor',
  'deepagents',
  'devin',
  'dexto',
  'droid',
  'eve',
  'firebender',
  'forgecode',
  'gemini-cli',
  'github-copilot',
  'goose',
  'grok',
  'hermes-agent',
  'inference-sh',
  'jazz',
  'junie',
  'iflow-cli',
  'kilo',
  'kimchi',
  'kimi-code-cli',
  'kiro-cli',
  'kode',
  'lingma',
  'loaf',
  'mcpjam',
  'mistral-vibe',
  'moxby',
  'mux',
  'opencode',
  'openhands',
  'ona',
  'pi',
  'qoder',
  'qoder-cn',
  'qwen-code',
  'replit',
  'reasonix',
  'rovodev',
  'roo',
  'tabnine-cli',
  'terramind',
  'tinycloud',
  'trae',
  'trae-cn',
  'warp',
  'windsurf',
  'zed',
  'zcode',
  'zencoder',
  'zenflow',
  'neovate',
  'pochi',
  'promptscript',
  'adal',
  'universal'
]);

const CATALOG_RECORDS = Object.freeze([
  ['aider-desk', 'AiderDesk', ['.aider-desk', 'skills'], ['home', '.aider-desk', 'skills']],
  ['adal', 'AdaL', ['.adal', 'skills'], ['home', '.adal', 'skills']],
  ['amp', 'Amp', ['.agents', 'skills'], ['configHome', 'agents', 'skills']],
  ['antigravity', 'Antigravity', ['.agents', 'skills'], ['home', '.gemini', 'antigravity', 'skills']],
  ['antigravity-cli', 'Antigravity CLI', ['.agents', 'skills'], ['home', '.gemini', 'antigravity-cli', 'skills']],
  ['astrbot', 'AstrBot', ['data', 'skills'], ['home', '.astrbot', 'data', 'skills']],
  ['autohand-code', 'Autohand Code CLI', ['.autohand', 'skills'], ['envHome', 'AUTOHAND_HOME', '.autohand', 'skills']],
  ['augment', 'Augment', ['.augment', 'skills'], ['home', '.augment', 'skills']],
  ['bob', 'IBM Bob', ['.bob', 'skills'], ['home', '.bob', 'skills']],
  ['claude-code', 'Claude Code', ['.claude', 'skills'], ['envHome', 'CLAUDE_CONFIG_DIR', '.claude', 'skills']],
  ['cline', 'Cline', ['.agents', 'skills'], ['home', '.agents', 'skills']],
  ['codearts-agent', 'CodeArts Agent', ['.codeartsdoer', 'skills'], ['home', '.codeartsdoer', 'skills']],
  ['codebuddy', 'CodeBuddy', ['.codebuddy', 'skills'], ['home', '.codebuddy', 'skills']],
  ['codemaker', 'Codemaker', ['.codemaker', 'skills'], ['home', '.codemaker', 'skills']],
  ['codestudio', 'Code Studio', ['.codestudio', 'skills'], ['home', '.codestudio', 'skills']],
  ['codex', 'Codex CLI', ['.agents', 'skills'], ['envHome', 'CODEX_HOME', '.codex', 'skills']],
  ['command-code', 'Command Code', ['.commandcode', 'skills'], ['home', '.commandcode', 'skills']],
  ['continue', 'Continue', ['.continue', 'skills'], ['home', '.continue', 'skills']],
  ['cortex', 'Cortex Code', ['.cortex', 'skills'], ['home', '.snowflake', 'cortex', 'skills']],
  ['crush', 'Crush', ['.crush', 'skills'], ['home', '.config', 'crush', 'skills']],
  ['cursor', 'Cursor', ['.agents', 'skills'], ['home', '.cursor', 'skills']],
  ['deepagents', 'Deep Agents', ['.agents', 'skills'], ['home', '.deepagents', 'agent', 'skills']],
  ['devin', 'Devin for Terminal', ['.devin', 'skills'], ['configHome', 'devin', 'skills']],
  ['dexto', 'Dexto', ['.agents', 'skills'], ['home', '.agents', 'skills']],
  ['droid', 'Droid', ['.factory', 'skills'], ['home', '.factory', 'skills']],
  ['eve', 'Eve', ['agent', 'skills'], null],
  ['firebender', 'Firebender', ['.agents', 'skills'], ['home', '.firebender', 'skills']],
  ['forgecode', 'ForgeCode', ['.forge', 'skills'], ['home', '.forge', 'skills']],
  ['gemini-cli', 'Gemini CLI', ['.agents', 'skills'], ['home', '.gemini', 'skills']],
  ['github-copilot', 'GitHub Copilot', ['.agents', 'skills'], ['home', '.copilot', 'skills']],
  ['goose', 'Goose', ['.goose', 'skills'], ['configHome', 'goose', 'skills']],
  ['grok', 'Grok Build', ['.grok', 'skills'], ['envHome', 'GROK_HOME', '.grok', 'skills']],
  ['hermes-agent', 'Hermes Agent', ['.hermes', 'skills'], ['envHome', 'HERMES_HOME', '.hermes', 'skills']],
  ['iflow-cli', 'iFlow CLI', ['.iflow', 'skills'], ['home', '.iflow', 'skills']],
  ['inference-sh', 'inference.sh', ['.inferencesh', 'skills'], ['home', '.inferencesh', 'skills']],
  ['jazz', 'Jazz', ['.jazz', 'skills'], ['home', '.jazz', 'skills']],
  ['junie', 'Junie', ['.junie', 'skills'], ['home', '.junie', 'skills']],
  ['kilo', 'Kilo Code', ['.kilocode', 'skills'], ['home', '.kilocode', 'skills']],
  ['kimchi', 'Kimchi', ['.kimchi', 'skills'], ['home', '.config', 'kimchi', 'harness', 'skills']],
  ['kimi-code-cli', 'Kimi Code CLI', ['.agents', 'skills'], ['home', '.agents', 'skills']],
  ['kiro-cli', 'Kiro CLI', ['.kiro', 'skills'], ['home', '.kiro', 'skills']],
  ['kode', 'Kode', ['.kode', 'skills'], ['home', '.kode', 'skills']],
  ['lingma', 'Lingma', ['.lingma', 'skills'], ['home', '.lingma', 'skills']],
  ['loaf', 'Loaf', ['.agents', 'skills'], ['home', '.agents', 'skills']],
  ['mcpjam', 'MCPJam', ['.mcpjam', 'skills'], ['home', '.mcpjam', 'skills']],
  ['mistral-vibe', 'Mistral Vibe', ['.vibe', 'skills'], ['envHome', 'VIBE_HOME', '.vibe', 'skills']],
  ['moxby', 'Moxby', ['.moxby', 'skills'], ['home', '.moxby', 'skills']],
  ['mux', 'Mux', ['.mux', 'skills'], ['home', '.mux', 'skills']],
  ['neovate', 'Neovate', ['.neovate', 'skills'], ['home', '.neovate', 'skills']],
  ['ona', 'Ona', ['.ona', 'skills'], ['home', '.ona', 'skills']],
  ['opencode', 'OpenCode', ['.agents', 'skills'], ['configHome', 'opencode', 'skills']],
  ['openclaw', 'OpenClaw', ['skills'], ['openclawHome', 'skills']],
  ['openhands', 'OpenHands', ['.openhands', 'skills'], ['home', '.openhands', 'skills']],
  ['pi', 'Pi', ['.pi', 'skills'], ['home', '.pi', 'agent', 'skills']],
  ['pochi', 'Pochi', ['.pochi', 'skills'], ['home', '.pochi', 'skills']],
  ['promptscript', 'PromptScript', ['.agents', 'skills'], null],
  ['qoder', 'Qoder', ['.qoder', 'skills'], ['home', '.qoder', 'skills']],
  ['qoder-cn', 'Qoder CN', ['.qoder', 'skills'], ['home', '.qoder-cn', 'skills']],
  ['qwen-code', 'Qwen Code', ['.qwen', 'skills'], ['home', '.qwen', 'skills']],
  ['reasonix', 'Reasonix', ['.reasonix', 'skills'], ['home', '.reasonix', 'skills']],
  ['replit', 'Replit', ['.agents', 'skills'], ['configHome', 'agents', 'skills']],
  ['roo', 'Roo Code', ['.roo', 'skills'], ['home', '.roo', 'skills']],
  ['rovodev', 'Rovo Dev', ['.rovodev', 'skills'], ['home', '.rovodev', 'skills']],
  ['tabnine-cli', 'Tabnine CLI', ['.tabnine', 'agent', 'skills'], ['home', '.tabnine', 'agent', 'skills']],
  ['terramind', 'Terramind', ['.terramind', 'skills'], ['home', '.terramind', 'skills']],
  ['tinycloud', 'Tinycloud', ['.tinycloud', 'skills'], ['home', '.tinycloud', 'skills']],
  ['trae', 'Trae', ['.trae', 'skills'], ['home', '.trae', 'skills']],
  ['trae-cn', 'Trae CN', ['.trae', 'skills'], ['home', '.trae-cn', 'skills']],
  ['universal', 'Universal', ['.agents', 'skills'], ['configHome', 'agents', 'skills']],
  ['warp', 'Warp', ['.agents', 'skills'], ['home', '.agents', 'skills']],
  ['windsurf', 'Windsurf', ['.windsurf', 'skills'], ['home', '.codeium', 'windsurf', 'skills']],
  ['zcode', 'ZCode', ['.zcode', 'skills'], ['home', '.zcode', 'skills']],
  ['zed', 'Zed', ['.agents', 'skills'], ['home', '.agents', 'skills']],
  ['zencoder', 'Zencoder', ['.zencoder', 'skills'], ['home', '.zencoder', 'skills']],
  ['zenflow', 'Zenflow', ['.zencoder', 'skills'], ['home', '.zencoder', 'skills']],
  ['visual-studio', 'Visual Studio', ['.agents', 'skills'], ['home', '.copilot', 'skills']]
]);

assertCatalog();

export function listAgentTargetCatalog(options = {}) {
  const context = resolveCatalogContext(options);
  const detectedIds = new Set(Array.isArray(options.detectedIds) ? options.detectedIds : []);
  const targets = CATALOG_RECORDS.map(([id, label, projectParts, userParts]) => {
    const entry = {
      id,
      label,
      integration: FULL_RUNTIME_ADAPTER_IDS.includes(id) ? 'full' : 'skill-only',
      destinations: {
        project: destination(context, projectParts, 'project'),
        user: userParts ? destination(context, userParts, 'user') : null
      }
    };
    entry.capabilities = targetCapabilityRecords(id, entry.destinations);
    entry.capabilitySummary = capabilitySummary(entry.capabilities);
    if (detectedIds.has(id)) entry.detected = true;
    return Object.freeze(entry);
  }).sort((left, right) => catalogOrder(left.id) - catalogOrder(right.id) || left.id.localeCompare(right.id));
  return Object.freeze({
    upstreamRevision: 'e173b8c88f2581cfdaa1b6767c6519a08155790e',
    targets: Object.freeze(targets)
  });
}

export function createCatalogSkillHostRegistry(baseRegistry, options = {}) {
  const baseIds = new Set(typeof baseRegistry?.list === 'function'
    ? baseRegistry.list().map((entry) => entry.id)
    : []);
  const catalogAdapters = new Map(CATALOG_RECORDS
    .filter(([id]) => !baseIds.has(id))
    .map((record) => [record[0], createSkillOnlyAdapter(record, options)]));

  return Object.freeze({
    ...baseRegistry,
    list: () => Object.freeze([
      ...(typeof baseRegistry?.list === 'function' ? baseRegistry.list() : []),
      ...[...catalogAdapters.entries()].map(([id, adapter]) => Object.freeze({ id, adapter }))
    ]),
    listHosts: () => [
      ...(typeof baseRegistry?.listHosts === 'function'
        ? baseRegistry.listHosts()
        : typeof baseRegistry?.list === 'function'
          ? baseRegistry.list().map((entry) => entry.id)
          : []),
      ...catalogAdapters.keys()
    ],
    get: (hostId) => (typeof baseRegistry?.get === 'function' ? baseRegistry.get(hostId) : null)
      ?? catalogAdapters.get(hostId)
      ?? null,
    adapterFor: (hostId) => (typeof baseRegistry?.adapterFor === 'function' ? baseRegistry.adapterFor(hostId) : null)
      ?? (typeof baseRegistry?.get === 'function' ? baseRegistry.get(hostId) : null)
      ?? catalogAdapters.get(hostId)
      ?? null
  });
}

function createSkillOnlyAdapter(record, registryOptions = {}) {
  const [id, label, projectParts, userParts] = record;
  const appliedActions = new Map();
  return Object.freeze({
    id,
    detect: async (context = {}) => [capabilityRow({ id }, 'skill', 'supported', context.scope ?? 'project')],
    capabilities: async (_evidence, scope, context = {}) => [
      capabilityRow({ id }, 'skill', resolveRecordDestination(record, scope, context, registryOptions) ? 'supported' : 'unsupported', scope),
      capabilityRow({ id }, 'mcp', 'unsupported', scope)
    ],
    resolveTargets: async (selection = {}) => {
      const scope = selection.scope;
      const targetPath = resolveRecordDestination(record, scope, selection, registryOptions);
      if (!targetPath) {
        return refusal('host_scope_unsupported', { host: id, scope });
      }
      return [resolvedSkillTarget({ id }, scope, targetPath)];
    },
    inspect: async (resolved) => inspectSkillTarget(resolved.path),
    inspectPlanned: async (resolved) => inspectSkillTarget(resolved.path),
    plan: async (resolved, desiredBuild = {}, context = {}) => {
      const observation = inspectSkillTarget(resolved.path);
      const desiredDigest = packagedSkillDigest();
      if (observation.exists === true
        && observation.contentDigest !== desiredDigest
        && !hasMatchingReceiptOwnership(context.receiptOwnership, observation, resolved)) {
        return refusal('ownership-collision', {
          host: id,
          path: resolved.path,
          state: observation.state
        });
      }
      return {
        kind: 'actions',
        status: observation.contentDigest === desiredDigest ? 'no-op' : 'planned',
        buildIdentity: desiredBuild.buildIdentity,
        liveDigest: observation.contentDigest,
        desiredDigest,
        actions: observation.contentDigest === desiredDigest
          ? []
          : [{
              kind: 'install-skill',
              targetPath: resolved.path,
              ownershipBoundary: AGENT_SKILL_NAME,
              preconditionDigest: observation.contentDigest,
              desiredDigest,
              requiresBackup: observation.exists === true
            }]
      };
    },
    backup: async (action) => backupSkillTarget(action.targetPath),
    apply: async (action) => {
      applySkillAction(action);
      appliedActions.set(action.actionId, action);
      return {
        effectId: `effect-${action.actionId}`,
        actionId: action.actionId,
        targetId: action.targetId,
        ownershipBoundary: action.ownershipBoundary,
        effectType: action.kind,
        beforeDigest: action.preconditionDigest,
        afterDigest: action.desiredDigest,
        effectCertainty: 'complete'
      };
    },
    rollback: async (effect, backup) => {
      const action = appliedActions.get(effect.actionId);
      if (!action) throw new Error(`Catalog skill action is not registered: ${effect.actionId}`);
      return rollbackSkillTarget(action.targetPath, action.preconditionDigest, backup);
    },
    verify: async (resolved, desiredBuild = {}) => {
      const observation = inspectSkillTarget(resolved.path);
      return {
        status: observation.contentDigest === packagedSkillDigest() ? 'ready' : 'not-ready',
        ready: observation.contentDigest === packagedSkillDigest(),
        buildIdentity: desiredBuild.buildIdentity,
        observedDigest: observation.contentDigest,
        checks: []
      };
    },
    uninstall: async (resolved, receiptOwnership) => {
      const observation = inspectSkillTarget(resolved.path);
      if (!hasMatchingReceiptOwnership(receiptOwnership, observation, resolved)) {
        return refusal('ownership-collision', {
          host: id,
          path: resolved.path,
          state: observation.state
        });
      }
      return {
        kind: 'actions',
        status: observation.exists === true ? 'planned' : 'no-op',
        actions: observation.exists === true
          ? [{
              kind: 'remove-skill',
              targetPath: resolved.path,
              ownershipBoundary: AGENT_SKILL_NAME,
              preconditionDigest: observation.contentDigest,
              desiredDigest: emptyDigest(),
              requiresBackup: true
            }]
          : []
      };
    }
  });
}

function hasMatchingReceiptOwnership(receiptOwnership, observation, resolved) {
  if (receiptOwnership?.owned !== true || receiptOwnership?.liveDigestMatches !== true) return false;
  if (receiptOwnership.path && !sameCatalogPath(receiptOwnership.path, resolved.path)) return false;
  if (receiptOwnership.ownershipBoundary
    && receiptOwnership.ownershipBoundary !== resolved.ownershipBoundary) return false;
  return receiptOwnership.liveDigest === observation.contentDigest;
}

function sameCatalogPath(left, right) {
  const canonical = (value) => {
    const resolved = path.resolve(value);
    try {
      return fs.realpathSync.native(resolved);
    } catch {
      return resolved;
    }
  };
  const leftPath = canonical(left);
  const rightPath = canonical(right);
  return process.platform === 'win32'
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath;
}

function resolvedSkillTarget(target, scope, targetPath) {
  return Object.freeze({
    host: target.id,
    hostId: target.id,
    targetId: `${target.id}:${scope}:skill`,
    scope,
    component: 'skill',
    path: targetPath,
    ownershipBoundary: AGENT_SKILL_NAME,
    ownership: 'launchdeck',
    dialect: 'launchdeck-agent-skill'
  });
}

function capabilityRow(target, component, supportState, scope) {
  return Object.freeze({
    supportState,
    host: target.id,
    hostId: target.id,
    exactVersion: 'catalog',
    platform: process.platform,
    component,
    scope,
    rowId: `catalog:${target.id}:${component}`,
    relativePath: component === 'skill' ? `${AGENT_SKILL_NAME}/SKILL.md` : '',
    dialect: component === 'skill' ? 'launchdeck-agent-skill' : '',
    probe: 'local-versioned-catalog',
    approvalBoundary: 'launchdeck',
    fixtureRevision: 'e173b8c88f2581cfdaa1b6767c6519a08155790e',
    realHostEvidenceRevision: 'e173b8c88f2581cfdaa1b6767c6519a08155790e'
  });
}

function targetCapabilityRecords(id, destinations = {}) {
  const fullAdapter = FULL_RUNTIME_ADAPTER_IDS.includes(id);
  const skillScopes = destinationScopes(destinations);
  return Object.freeze([
    ...['runtime', 'skill', 'mcp'].map((component) => Object.freeze({
      component,
      supportState: fullAdapter || component === 'skill' ? 'supported' : 'unsupported',
      installable: fullAdapter || component === 'skill',
      scopes: Object.freeze(
        component === 'skill'
          ? skillScopes
          : fullAdapter ? ['project', 'user'] : []
      )
    })),
    Object.freeze({
      component: 'cli',
      supportState: 'supported',
      installable: false,
      scopes: Object.freeze(['project'])
    })
  ]);
}

function destinationScopes(destinations) {
  const scopes = [];
  if (destinations.project !== null && destinations.project !== undefined) scopes.push('project');
  if (destinations.user !== null && destinations.user !== undefined) scopes.push('user');
  return scopes;
}

export function installableComponentsForTargets(targets, options = {}) {
  const requested = Array.isArray(targets) ? targets.map(String) : [];
  if (requested.length === 0) return [];
  const catalog = listAgentTargetCatalog(options);
  const byId = new Map(catalog.targets.map((target) => [target.id, target]));
  let intersection = null;
  for (const id of requested) {
    const target = byId.get(id);
    if (!target) return [];
    const current = new Set(target.capabilities
      .filter((capability) => capability.supportState === 'supported' && capability.installable === true)
      .map((capability) => capability.component));
    intersection = intersection === null
      ? current
      : new Set([...intersection].filter((component) => current.has(component)));
  }
  return ['runtime', 'skill', 'mcp'].filter((component) => intersection?.has(component));
}

function capabilitySummary(capabilities) {
  const installable = capabilities
    .filter((capability) => capability.installable)
    .map((capability) => displayComponent(capability.component));
  const mcp = capabilities.find((capability) => capability.component === 'mcp');
  const summary = [`${installable.join(', ')} installable`];
  if (mcp?.supportState !== 'supported') summary.push('MCP unavailable');
  summary.push('project-local CLI fallback');
  return summary.join('; ');
}

function displayComponent(component) {
  return component === 'mcp'
    ? 'MCP'
    : component === 'cli'
      ? 'CLI'
      : `${component.slice(0, 1).toUpperCase()}${component.slice(1)}`;
}

function resolveRecordDestination(record, scope, selection, registryOptions) {
  const [, , projectParts, userParts] = record;
  if (scope !== 'project' && scope !== 'user') return null;
  const context = resolveCatalogContext({ ...registryOptions, ...selection });
  return scope === 'project'
    ? destination(context, projectParts, scope)
    : userParts ? destination(context, userParts, scope) : null;
}

function resolveCatalogContext(options = {}) {
  const env = { ...(options.env ?? process.env) };
  const homeDir = path.resolve(options.homeDir ?? env.HOME ?? env.USERPROFILE ?? os.homedir());
  const projectIdentity = options.projectIdentity ?? options.projectRoot ?? options.project;
  const projectRoot = path.resolve(projectIdentity ?? process.cwd());
  const xdgConfigHome = env.XDG_CONFIG_HOME && String(env.XDG_CONFIG_HOME).trim()
    ? path.resolve(String(env.XDG_CONFIG_HOME))
    : path.join(homeDir, '.config');
  return {
    env,
    homeDir,
    projectRoot,
    configHome: path.resolve(options.configHome ?? xdgConfigHome)
  };
}

function destination(context, parts) {
  const [anchor, ...rest] = parts;
  const root = anchor === 'home'
    ? context.homeDir
    : anchor === 'configHome'
      ? context.configHome
      : anchor === 'envHome'
        ? envHome(context, rest[0], rest[1])
        : anchor === 'openclawHome'
          ? openClawHome(context)
          : context.projectRoot;
  const pathParts = anchor === 'home' || anchor === 'configHome'
    ? rest
    : anchor === 'envHome'
      ? rest.slice(2)
      : anchor === 'openclawHome'
        ? rest
        : parts;
  return path.join(root, ...pathParts, AGENT_SKILL_NAME);
}

function envHome(context, envName, fallbackDir) {
  const value = context.env?.[envName];
  return value && String(value).trim()
    ? path.resolve(String(value))
    : path.join(context.homeDir, fallbackDir);
}

function openClawHome(context) {
  for (const dirname of ['.openclaw', '.clawdbot', '.moltbot']) {
    const candidate = path.join(context.homeDir, dirname);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(context.homeDir, '.openclaw');
}

function emptyDigest() {
  return `sha256:${'0'.repeat(64)}`;
}

function refusal(code, details) {
  return Object.freeze({
    kind: 'refusal',
    code,
    effectCertainty: 'no-write',
    details: Object.freeze(details)
  });
}

function inspectSkillTarget(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return {
      kind: 'inspection',
      exists: false,
      state: 'missing',
      digest: emptyDigest(),
      documentDigest: emptyDigest(),
      contentDigest: emptyDigest(),
      path: targetPath
    };
  }
  try {
    const manifest = createSkillContentManifest(targetPath);
    return {
      kind: 'inspection',
      exists: true,
      state: manifest.contentDigest === packagedSkillDigest() ? 'current' : 'divergent',
      digest: manifest.contentDigest,
      documentDigest: manifest.contentDigest,
      contentDigest: manifest.contentDigest,
      path: targetPath
    };
  } catch {
    return {
      kind: 'inspection',
      exists: true,
      state: 'corrupt',
      digest: emptyDigest(),
      documentDigest: emptyDigest(),
      contentDigest: emptyDigest(),
      path: targetPath
    };
  }
}

function packagedSkillDigest() {
  return createSkillContentManifest(PACKAGED_SKILL_ROOT).contentDigest;
}

function backupSkillTarget(targetPath) {
  if (!fs.existsSync(targetPath)) return { existed: false };
  const backupPath = path.join(os.tmpdir(), `launchdeck-skill-backup-${crypto.randomBytes(8).toString('hex')}`);
  fs.cpSync(targetPath, backupPath, { recursive: true });
  return { existed: true, backupPath };
}

function applySkillAction(action) {
  const before = inspectSkillTarget(action.targetPath);
  if (before.contentDigest !== action.preconditionDigest) {
    throw new Error(`Catalog skill target changed before apply: ${action.targetPath}`);
  }
  if (action.kind === 'remove-skill') {
    fs.rmSync(action.targetPath, { recursive: true, force: true });
  } else {
    fs.rmSync(action.targetPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(action.targetPath), { recursive: true });
    fs.cpSync(PACKAGED_SKILL_ROOT, action.targetPath, { recursive: true });
  }
  const after = inspectSkillTarget(action.targetPath);
  if (after.contentDigest !== action.desiredDigest) {
    throw new Error(`Catalog skill target digest mismatch after apply: ${action.targetPath}`);
  }
  return {
    effectCertainty: 'complete'
  };
}

function rollbackSkillTarget(targetPath, preconditionDigest, backup) {
  if (backup?.existed === true && backup.backupPath) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.cpSync(backup.backupPath, targetPath, { recursive: true });
    return { restored: true, verified: true, restoredDigest: inspectSkillTarget(targetPath).contentDigest };
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
  return { restored: true, verified: true, restoredDigest: preconditionDigest };
}

function assertCatalog() {
  const ids = CATALOG_RECORDS.map(([id]) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Agent target catalog contains duplicate IDs.');
  }
  const upstreamIds = new Set(UPSTREAM_AGENT_IDS);
  for (const id of UPSTREAM_AGENT_IDS) {
    if (!ids.includes(id)) throw new Error(`Agent target catalog is missing upstream ID: ${id}`);
  }
  for (const id of ids) {
    if (id !== 'visual-studio' && !upstreamIds.has(id)) {
      throw new Error(`Agent target catalog contains unknown upstream ID: ${id}`);
    }
  }
}

function catalogOrder(id) {
  const fullIndex = FULL_RUNTIME_ADAPTER_IDS.indexOf(id);
  if (fullIndex >= 0) return fullIndex;
  return FULL_RUNTIME_ADAPTER_IDS.length + UPSTREAM_AGENT_IDS.indexOf(id);
}
