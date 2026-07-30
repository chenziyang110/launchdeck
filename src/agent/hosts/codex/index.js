import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { parse, patch, stringify, TomlFormat } from '@decimalturn/toml-patch';

const HOST_ID = 'codex';
const SKILL_DIRECTORY = path.join('.agents', 'skills', 'launchdeck-agent');
const CONFIG_FILE = path.join('.codex', 'config.toml');
const DIALECT = '[mcp_servers.launchdeck]';
const SKILL_OWNERSHIP_BOUNDARY = 'launchdeck-agent';
const SKILL_MANIFEST_SCHEMA_VERSION = 1;
const MAX_SKILL_FILES = 1_024;
const MAX_SKILL_DEPTH = 32;
const MAX_SKILL_TOTAL_BYTES = 10 * 1024 * 1024;
const EMPTY_DIGEST = digestBytes(Buffer.alloc(0));

export function createCodexHostAdapter(defaultContext = {}) {
  return {
    id: HOST_ID,
    detect: (context = {}) => detectCodex({ ...defaultContext, ...context }),
    capabilities: (evidence, scope, context = {}) =>
      codexCapabilities(evidence, scope, { ...defaultContext, ...context }),
    resolveTargets: (selection = {}) =>
      resolveCodexTargets({ ...defaultContext, ...selection }),
    inspect: (target, context = {}) =>
      inspectCodexTarget(target, { ...defaultContext, ...context }),
    plan: (target, context = {}) =>
      planCodexTarget(target, { ...defaultContext, ...context }),
    backup: (action, transaction, context = {}) =>
      backupCodexTarget(action, transaction, { ...defaultContext, ...context }),
    apply: (action, transaction, context = {}) =>
      applyCodexAction(action, transaction, { ...defaultContext, ...context }),
    rollback: (effect, backup, transaction, context = {}) =>
      rollbackCodexAction(effect, backup, transaction, { ...defaultContext, ...context }),
    verify: (context = {}) => verifyCodexTarget({ ...defaultContext, ...context }),
    uninstall: (target, receiptOwnership, context = {}) =>
      planCodexUninstall(target, receiptOwnership, { ...defaultContext, ...context })
  };
}

export const createAdapter = createCodexHostAdapter;

export function detectCodex(context = {}) {
  const probes = context.probes ?? {};
  const versionOutput = stringProbe(probes.version);
  const version = extractVersion(versionOutput);
  const mcpProbe = probes.mcpList ?? null;

  return [
    {
      host: HOST_ID,
      command: 'codex --version',
      version,
      status: version === null ? 'ambiguous' : 'detected',
      evidence: versionOutput
    },
    {
      host: HOST_ID,
      command: 'codex mcp list',
      status: mcpProbe ? 'observed' : 'unavailable',
      evidence: mcpProbe
    }
  ];
}

export function codexCapabilities(evidence, _scope, context = {}) {
  const rows = Array.isArray(evidence) ? evidence : evidence?.evidence ?? [];
  const versionRow = rows.find((row) => row.command === 'codex --version');
  const version = versionRow?.version ?? extractVersion(stringProbe(context.probes?.version));
  const scope = requireScope(_scope ?? context.scope);
  const targets = resolveCodexTargets({ ...context, scope });
  const evaluateCapability = context.evaluateCapability;

  return targets.map((target) => ({
    host: HOST_ID,
    version,
    ...normalizeCapabilityDecision(
      typeof evaluateCapability === 'function'
        ? evaluateCapability({
            host: HOST_ID,
            exactVersion: version,
            platform: context.platform ?? process.platform,
            component: target.component,
            scope
          })
        : null
    ),
    ...target
  }));
}

export function resolveCodexTargets(context = {}) {
  const projectRoot = requireAbsoluteRoot(context.projectRoot, 'projectRoot');
  const homeDir = requireAbsoluteRoot(context.homeDir, 'homeDir');
  const scope = requireScope(context.scope);
  const root = scope === 'project' ? projectRoot : homeDir;
  return [
    skillTarget(scope, path.join(root, SKILL_DIRECTORY)),
    mcpTarget(scope, path.join(root, CONFIG_FILE))
  ];
}

export function inspectCodexTarget(target, context = {}) {
  const fs = requireFs(context.fs);
  const targetPath = targetPathOf(target);
  if (target?.component === 'skill') {
    return inspectCodexSkillDirectory(fs, targetPath, target);
  }
  const exists = fs.existsSync(targetPath);
  const bytes = exists && fs.statSync(targetPath).isFile()
    ? fs.readFileSync(targetPath)
    : null;

  return {
    host: HOST_ID,
    target,
    path: targetPath,
    exists,
    digest: bytes ? digestBytes(bytes) : null
  };
}

export function planCodexTarget(target, context = {}) {
  if (target?.scope === 'project' && target?.component === 'mcp' && !hasProjectTrust(target, context)) {
    return refusal('pending-project-trust', 'Project trust approval is required before planning Codex MCP changes.');
  }

  if (target?.component === 'skill') {
    const observation = inspectCodexTarget(target, context);
    if (observation.status === 'malformed') {
      return refusal('ownership-collision', 'The existing Codex Skill directory is invalid or ambiguous.');
    }
    if (observation.status === 'present' && !receiptOwnsSkill(context.receiptOwnership, observation)) {
      return refusal('ownership-collision', 'The existing Codex Skill directory is not receipt-owned by Launchdeck.');
    }
    const claimedSkillDigest = context.skill?.contentDigest
      ?? context.canonicalSkill?.contentDigest
      ?? context.skillDigest;
    if (observation.status === 'present'
      && typeof claimedSkillDigest === 'string'
      && observation.contentDigest === claimedSkillDigest) {
      return {
        host: HOST_ID,
        status: 'no-op',
        ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY,
        actions: []
      };
    }
    const desiredSkill = resolveDesiredSkillPayload(context);
    if (!desiredSkill) {
      return refusal(
        'skill-payload-unavailable',
        'The canonical packaged Skill source directory and content digest are required.'
      );
    }
    const desiredObservation = inspectCodexSkillDirectory(
      requireFs(context.fs),
      desiredSkill.sourceDir,
      { component: 'skill', path: desiredSkill.sourceDir }
    );
    if (desiredObservation.status !== 'present'
      || desiredObservation.contentDigest !== desiredSkill.contentDigest) {
      return refusal(
        'skill-payload-digest-mismatch',
        'The canonical packaged Skill tree does not match its approved content digest.'
      );
    }
    return {
      host: HOST_ID,
      status: 'planned',
      ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY,
      actions: [{
        kind: 'install-skill',
        path: targetPathOf(target),
        sourceDir: desiredSkill.sourceDir,
        preconditionDigest: observation.contentDigest ?? EMPTY_DIGEST,
        desiredDigest: desiredSkill.contentDigest,
        contentDigest: desiredSkill.contentDigest,
        buildIdentity: context.buildIdentity ?? null,
        ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
      }]
    };
  }

  if (target?.component !== 'mcp') {
    return refusal('unsupported-component', `Codex does not support component ${target?.component ?? '<missing>'}.`);
  }

  const fs = requireFs(context.fs);
  const configPath = targetPathOf(target);
  const source = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  let document;
  try {
    document = source.trim() === '' ? {} : parse(source);
  } catch (error) {
    return refusal('ambiguous-config', `Codex TOML is malformed: ${error.message}`);
  }

  const hadMcpServers = document.mcp_servers !== undefined;
  const existing = document.mcp_servers?.launchdeck;
  if (existing && !receiptOwnsEntry(existing, configPath, context.receiptOwnership, context)) {
    return refusal('ownership-collision', 'The existing mcp_servers.launchdeck table is not receipt-owned by Launchdeck.');
  }

  const buildIdentity = context.buildIdentity ?? null;
  const launcher = requireAbsoluteLauncher(context.launcherPath);
  const launchdeckHome = resolveLaunchdeckHome(context);
  document.mcp_servers ??= {};
  document.mcp_servers.launchdeck = {
    command: launcher,
    args: ['mcp', 'serve'],
    env: {
      LAUNCHDECK_HOME: launchdeckHome,
      LAUNCHDECK_BUILD_ID: buildIdentity,
      LAUNCHDECK_MANAGED_BY: 'launchdeck-agent-installer'
    }
  };

  const format = TomlFormat.autoDetectFormat(source);
  // A nested value added with the library default (inlineTableStart=1) is
  // incorrectly emitted as a top-level `launchdeck` key when sibling
  // mcp_servers tables already exist. Keep the existing document format, but
  // require the managed entry itself to be represented as its own nested table.
  format.inlineTableStart = Math.max(format.inlineTableStart ?? 1, 2);
  const rendered = hadMcpServers
    ? patch(source, document, format)
    : appendTomlDocument(source, stringifyManagedMcpTable(document.mcp_servers.launchdeck, format));
  let renderedDocument;
  try {
    renderedDocument = parse(rendered);
  } catch (error) {
    return refusal('ambiguous-config', `Codex TOML patch is invalid: ${error.message}`);
  }
  if (Object.prototype.hasOwnProperty.call(renderedDocument, 'launchdeck')
    || digestCanonicalEntry(renderedDocument) !== digestCanonicalEntry(document)
    || digestCanonicalEntry(renderedDocument.mcp_servers?.launchdeck)
      !== digestCanonicalEntry(document.mcp_servers.launchdeck)) {
    return refusal(
      'ambiguous-config',
      'Codex TOML patch did not preserve the exact mcp_servers.launchdeck ownership boundary.'
    );
  }
  const beforeDigest = digestBytes(Buffer.from(source));
  const afterDigest = digestBytes(Buffer.from(rendered));
  return {
    host: HOST_ID,
    status: beforeDigest === afterDigest ? 'no-op' : 'planned',
    dialect: DIALECT,
    configPath,
    source: rendered,
    rendered,
    preconditionDigest: beforeDigest,
    desiredDigest: afterDigest,
    buildIdentity,
    actions: beforeDigest === afterDigest ? [] : [{
      kind: 'replace-config',
      path: configPath,
      source: rendered,
      preconditionDigest: beforeDigest,
      desiredDigest: afterDigest
    }]
  };
}

function hasProjectTrust(target, context) {
  if (context.trust?.project === true) return true;
  if (typeof context.projectTrust !== 'function') return false;
  try {
    const configPath = targetPathOf(target);
    return context.projectTrust({
      host: HOST_ID,
      target,
      projectRoot: path.dirname(path.dirname(configPath))
    }) === true;
  } catch {
    return false;
  }
}

export function backupCodexTarget(action, _transaction, context = {}) {
  const fs = requireFs(context.fs);
  const targetPath = targetPathOf(action);
  const exists = fs.existsSync(targetPath);
  if (action?.kind === 'install-skill' || action?.kind === 'remove-owned-skill') {
    const observation = inspectCodexSkillDirectory(fs, targetPath, {
      component: 'skill',
      path: targetPath
    });
    if (exists && observation.status !== 'present') {
      throw new TypeError('Codex Skill backup requires a valid directory target.');
    }
    return {
      path: targetPath,
      existed: exists,
      kind: 'directory',
      tree: exists ? snapshotSkillTree(fs, targetPath) : null,
      digest: exists ? observation.contentDigest : null
    };
  }
  const bytes = exists ? fs.readFileSync(targetPath) : null;
  return {
    path: targetPath,
    existed: exists,
    bytes,
    digest: bytes ? digestBytes(bytes) : null
  };
}

export function applyCodexAction(action, _transaction, context = {}) {
  const fs = requireFs(context.fs);
  const targetPath = targetPathOf(action);
  if (action?.kind === 'install-skill') {
    return applyCodexSkillDirectory(fs, action, targetPath);
  }
  if (action?.kind === 'remove-owned-skill') {
    const observation = inspectCodexSkillDirectory(fs, targetPath, {
      component: 'skill',
      path: targetPath
    });
    const currentDigest = observation.status === 'absent'
      ? EMPTY_DIGEST
      : observation.contentDigest;
    if (observation.status === 'malformed'
      || (action.preconditionDigest && currentDigest !== action.preconditionDigest)) {
      return refusal('precondition-changed', 'Codex Skill target changed after plan approval.');
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
    if (fs.existsSync(targetPath)) {
      return refusal('skill-remove-verification-failed', 'The owned Codex Skill directory was not removed.');
    }
    return {
      host: HOST_ID,
      status: 'applied',
      path: targetPath,
      digest: EMPTY_DIGEST
    };
  }
  const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : Buffer.alloc(0);
  const currentDigest = digestBytes(current);
  if (action.preconditionDigest && currentDigest !== action.preconditionDigest) {
    return refusal('precondition-changed', 'Codex target changed after plan approval.');
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.launchdeck-${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, action.source ?? action.rendered ?? '');
  fs.renameSync(temporaryPath, targetPath);
  const bytes = fs.readFileSync(targetPath);
  return {
    host: HOST_ID,
    status: 'applied',
    path: targetPath,
    digest: digestBytes(bytes)
  };
}

export function rollbackCodexAction(effect, backup, _transaction, context = {}) {
  const fs = requireFs(context.fs);
  const targetPath = targetPathOf(effect);
  if (effect?.effectType === 'install-skill' || effect?.kind === 'install-skill'
    || backup?.kind === 'directory' || backup?.sourceKind === 'directory') {
    return rollbackCodexSkillDirectory(fs, effect, backup, targetPath);
  }
  if (backup?.existed) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, backup.bytes);
  } else if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { force: true });
  }
  return { host: HOST_ID, status: 'rolled-back', path: targetPath };
}

export function verifyCodexTarget(context = {}) {
  const target = context.target ?? {};
  if (target?.component === 'skill') {
    const observation = inspectCodexTarget(target, context);
    const ownership = context.receiptOwnership?.skill ?? context.receiptOwnership;
    const desiredSkillDigest = typeof context.desiredBuild === 'object'
      ? context.desiredBuild?.skillDigest ?? context.desiredBuild?.skill?.contentDigest ?? null
      : null;
    const effect = Array.isArray(context.effects)
      ? context.effects.find((candidate) => (
          candidate?.targetId === target.targetId
          && candidate?.effectCertainty === 'complete'
        ))
      : null;
    const effectOwnsSkill = effect?.afterDigest === desiredSkillDigest;
    const removalReady = observation.status === 'absent'
      && desiredSkillDigest === EMPTY_DIGEST
      && effect?.effectType === 'remove-owned-skill'
      && effectOwnsSkill;
    const ready = removalReady || (observation.status === 'present'
      && typeof desiredSkillDigest === 'string'
      && observation.contentDigest === desiredSkillDigest
      && (receiptOwnsSkill(ownership, observation) || effectOwnsSkill));
    return {
      host: HOST_ID,
      state: ready ? 'verified' : 'failed',
      ready,
      code: ready ? null : 'agent_skill_digest_mismatch',
      skill: target.skillPath ?? target.skillRoot ?? target.path,
      ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY,
      checks: [{
        code: 'owned-skill-digest',
        status: ready ? 'pass' : 'fail'
      }]
    };
  }
  const buildIdentity = context.desiredBuild ?? context.buildIdentity ?? null;
  const evidence = context.evidence ?? {};
  const launcher = evidence.launcherPath ?? context.launcherPath;
  const launchdeckHome = context.launchdeckHome
    ? path.resolve(context.launchdeckHome)
    : null;
  const failure = codexVerificationFailure({
    target,
    buildIdentity,
    evidence,
    launcher,
    launchdeckHome
  });
  if (failure) {
    return {
      host: HOST_ID,
      state: 'failed',
      ready: false,
      code: failure,
      buildIdentity
    };
  }
  return {
    host: HOST_ID,
    state: 'verified',
    ready: true,
    launcher: path.resolve(launcher),
    buildIdentity,
    ownedEntry: DIALECT,
    skill: target.skillPath ?? target.skillRoot,
    launchdeckHomeForwarded: launchdeckHome
  };
}

export function planCodexUninstall(target, receiptOwnership, context = {}) {
  if (target?.component !== 'mcp') {
    const observation = inspectCodexTarget(target, context);
    if (observation.status !== 'present') {
      return refusal('ownership-mismatch', 'Live Codex Skill directory is missing or invalid.');
    }
    if (!receiptOwnsSkill(receiptOwnership, observation)) {
      return refusal('ownership-mismatch', 'Live Codex Skill directory is not Launchdeck-owned.');
    }
    return {
      host: HOST_ID,
      status: 'planned',
      ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY,
      actions: [{
        kind: 'remove-owned-skill',
        path: targetPathOf(target),
        ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
      }]
    };
  }

  if (!receiptOwnership?.owned
    || receiptOwnership.liveDigestMatches !== true
    || receiptOwnership.path !== targetPathOf(target)
    || receiptOwnership.component !== target?.component) {
    return refusal('ownership-mismatch', 'Codex target is not owned by the selected receipt.');
  }

  const fs = requireFs(context.fs);
  const configPath = targetPathOf(target);
  const source = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const document = source.trim() === '' ? {} : parse(source);
  if (!receiptOwnsEntry(document.mcp_servers?.launchdeck, configPath, receiptOwnership, context)) {
    return refusal('ownership-mismatch', 'Live Codex MCP entry is not Launchdeck-owned.');
  }
  delete document.mcp_servers.launchdeck;
  const rendered = patch(source, document);
  return {
    host: HOST_ID,
    status: 'planned',
    actions: [{
      kind: 'replace-config',
      path: configPath,
      source: rendered,
      preconditionDigest: digestBytes(Buffer.from(source)),
      desiredDigest: digestBytes(Buffer.from(rendered))
    }]
  };
}

function skillTarget(scope, skillRoot) {
  return {
    host: HOST_ID,
    scope,
    component: 'skill',
    path: skillRoot,
    skillRoot,
    ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
  };
}

function mcpTarget(scope, configPath) {
  return { host: HOST_ID, scope, component: 'mcp', path: configPath, configPath, dialect: DIALECT };
}

function targetPathOf(value) {
  const targetPath = value?.path ?? value?.configPath ?? value?.skillPath ?? value?.skillRoot;
  if (!targetPath) {
    throw new TypeError('Codex target path is required.');
  }
  return targetPath;
}

function refusal(code, message) {
  return { host: HOST_ID, status: 'refused', code, message, actions: [] };
}

function receiptOwnsEntry(entry, configPath, receiptOwnership, context = {}) {
  if (!entry || !receiptOwnership?.owned) return false;
  const bounded = receiptOwnership.component === 'mcp'
    && receiptOwnership.path === configPath
    && entry?.env?.LAUNCHDECK_MANAGED_BY === 'launchdeck-agent-installer';
  if (!bounded) return false;
  if (receiptOwnership.liveDigestMatches === true) return true;

  const launcherPath = context.launcherPath;
  const launchdeckHome = context.launchdeckHome;
  const buildIdentity = receiptOwnership.buildIdentity;
  if (!path.isAbsolute(launcherPath ?? '')
    || !path.isAbsolute(launchdeckHome ?? '')
    || typeof buildIdentity !== 'string') {
    return false;
  }
  return digestCanonicalEntry(entry) === digestCanonicalEntry({
    command: launcherPath,
    args: ['mcp', 'serve'],
    env: {
      LAUNCHDECK_HOME: launchdeckHome,
      LAUNCHDECK_BUILD_ID: buildIdentity,
      LAUNCHDECK_MANAGED_BY: 'launchdeck-agent-installer'
    }
  });
}

function receiptOwnsSkill(receiptOwnership, observation) {
  return receiptOwnership?.owner === 'launchdeck-agent-installer'
    && receiptOwnership.component === 'skill'
    && receiptOwnership.ownershipBoundary === SKILL_OWNERSHIP_BOUNDARY
    && samePath(receiptOwnership.path, observation.path)
    && typeof receiptOwnership.liveDigest === 'string'
    && typeof observation.contentDigest === 'string'
    && receiptOwnership.liveDigest === observation.contentDigest;
}

function stringifyManagedMcpTable(entry, format) {
  const leadingBom = format.leadingBom;
  format.leadingBom = false;
  try {
    return stringify({
      mcp_servers: {
        launchdeck: entry
      }
    }, format);
  } finally {
    format.leadingBom = leadingBom;
  }
}

function appendTomlDocument(source, section) {
  if (source.length === 0) return section;
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const separator = source.endsWith(`${newline}${newline}`)
    ? ''
    : source.endsWith(newline)
      ? newline
      : `${newline}${newline}`;
  return `${source}${separator}${section}`;
}

function requireAbsoluteLauncher(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new TypeError('An absolute platform-specific launcherPath is required.');
  }
  return path.resolve(value);
}

function resolveLaunchdeckHome(context) {
  return path.resolve(
    context.launchdeckHome
      ?? path.join(requireAbsoluteRoot(context.homeDir, 'homeDir'), '.launchdeck')
  );
}

function extractVersion(output) {
  const match = String(output ?? '').match(/\b(\d+\.\d+\.\d+)\b/);
  return match?.[1] ?? null;
}

function stringProbe(value) {
  if (typeof value === 'string') return value;
  return value?.stdout ?? value?.output ?? '';
}

function requireFs(fs) {
  if (!fs || typeof fs.existsSync !== 'function') {
    throw new TypeError('A filesystem implementation is required.');
  }
  return fs;
}

function requireAbsoluteRoot(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0 || !path.isAbsolute(value)) {
    throw new TypeError(`${name} must be an explicit absolute path.`);
  }
  return path.normalize(value);
}

function digestBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function digestCanonicalEntry(value) {
  return digestBytes(Buffer.from(JSON.stringify(canonicalJson(value))));
}

function inspectCodexSkillDirectory(fs, skillRoot, target) {
  if (!fs.existsSync(skillRoot)) {
    return {
      host: HOST_ID,
      target,
      path: skillRoot,
      status: 'absent',
      contentDigest: null,
      ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
    };
  }
  if (typeof fs.lstatSync !== 'function'
    || typeof fs.readdirSync !== 'function'
    || typeof fs.readFileSync !== 'function') {
    throw new TypeError('Codex Skill inspection requires lstatSync, readdirSync, and readFileSync.');
  }
  const rootEntry = fs.lstatSync(skillRoot);
  if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) {
    return {
      host: HOST_ID,
      target,
      path: skillRoot,
      status: 'malformed',
      contentDigest: null,
      ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
    };
  }

  try {
    const files = [];
    const seen = new Set();
    const totals = { files: 0, bytes: 0 };
    collectSkillFiles(fs, skillRoot, '', files, seen, totals, 0);
    files.sort((left, right) => compareStrings(left.path, right.path));
    const identity = {
      schemaVersion: SKILL_MANIFEST_SCHEMA_VERSION,
      skillName: SKILL_OWNERSHIP_BOUNDARY,
      files
    };
    return {
      host: HOST_ID,
      target,
      path: skillRoot,
      status: 'present',
      contentDigest: digestCanonicalEntry(identity),
      ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
    };
  } catch {
    return {
      host: HOST_ID,
      target,
      path: skillRoot,
      status: 'malformed',
      contentDigest: null,
      ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
    };
  }
}

function resolveDesiredSkillPayload(context) {
  const skill = context.skill ?? context.canonicalSkill ?? {};
  const sourceDir = skill.sourceDir ?? context.skillSource ?? context.skillSourceDir;
  const contentDigest = skill.contentDigest ?? skill.digest ?? context.skillDigest;
  if (typeof sourceDir !== 'string' || !path.isAbsolute(sourceDir)) return null;
  if (typeof contentDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(contentDigest)) {
    return null;
  }
  return {
    sourceDir: path.resolve(sourceDir),
    contentDigest
  };
}

function applyCodexSkillDirectory(fs, action, targetPath) {
  const sourceDir = action?.sourceDir;
  const desiredDigest = action?.desiredDigest ?? action?.contentDigest;
  if (typeof sourceDir !== 'string' || !path.isAbsolute(sourceDir)
    || typeof desiredDigest !== 'string') {
    return refusal('skill-payload-unavailable', 'The approved Skill action has no byte-bound source tree.');
  }
  const resolvedSource = path.resolve(sourceDir);
  const resolvedTarget = path.resolve(targetPath);
  if (samePath(resolvedSource, resolvedTarget) || isWithin(resolvedTarget, resolvedSource)) {
    return refusal('skill-payload-invalid', 'The Skill source tree cannot be inside its installation target.');
  }
  const sourceObservation = inspectCodexSkillDirectory(fs, resolvedSource, {
    component: 'skill',
    path: resolvedSource
  });
  if (sourceObservation.status !== 'present' || sourceObservation.contentDigest !== desiredDigest) {
    return refusal('skill-payload-digest-mismatch', 'The approved Skill source tree changed before apply.');
  }

  const currentObservation = inspectCodexSkillDirectory(fs, resolvedTarget, {
    component: 'skill',
    path: resolvedTarget
  });
  const currentDigest = currentObservation.status === 'absent'
    ? EMPTY_DIGEST
    : currentObservation.contentDigest;
  if (currentObservation.status === 'malformed') {
    return refusal('precondition-changed', 'The Codex Skill target became malformed after plan approval.');
  }
  if (action.preconditionDigest && currentDigest !== action.preconditionDigest) {
    return refusal('precondition-changed', 'Codex Skill target changed after plan approval.');
  }

  fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });
  const nonce = `${process.pid}-${randomBytes(8).toString('hex')}`;
  const stagedPath = `${resolvedTarget}.launchdeck-${nonce}.tmp`;
  const displacedPath = `${resolvedTarget}.launchdeck-${nonce}.displaced`;
  let displaced = false;
  try {
    copySkillTree(fs, resolvedSource, stagedPath);
    const stagedObservation = inspectCodexSkillDirectory(fs, stagedPath, {
      component: 'skill',
      path: stagedPath
    });
    if (stagedObservation.status !== 'present'
      || stagedObservation.contentDigest !== desiredDigest) {
      return refusal('skill-staging-verification-failed', 'The staged Skill tree failed digest verification.');
    }
    if (fs.existsSync(resolvedTarget)) {
      fs.renameSync(resolvedTarget, displacedPath);
      displaced = true;
    }
    try {
      fs.renameSync(stagedPath, resolvedTarget);
    } catch (error) {
      if (displaced && !fs.existsSync(resolvedTarget)) {
        fs.renameSync(displacedPath, resolvedTarget);
        displaced = false;
      }
      throw error;
    }
    const installed = inspectCodexSkillDirectory(fs, resolvedTarget, {
      component: 'skill',
      path: resolvedTarget
    });
    if (installed.status !== 'present' || installed.contentDigest !== desiredDigest) {
      fs.rmSync(resolvedTarget, { recursive: true, force: true });
      if (displaced) {
        fs.renameSync(displacedPath, resolvedTarget);
        displaced = false;
      }
      return refusal('skill-install-verification-failed', 'The installed Skill tree failed digest verification.');
    }
    fs.rmSync(displacedPath, { recursive: true, force: true });
    displaced = false;
    return {
      host: HOST_ID,
      status: 'applied',
      path: resolvedTarget,
      digest: installed.contentDigest
    };
  } finally {
    fs.rmSync(stagedPath, { recursive: true, force: true });
    if (displaced && !fs.existsSync(resolvedTarget) && fs.existsSync(displacedPath)) {
      fs.renameSync(displacedPath, resolvedTarget);
      displaced = false;
    }
    if (!displaced) fs.rmSync(displacedPath, { recursive: true, force: true });
  }
}

function rollbackCodexSkillDirectory(fs, effect, backup, targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  const expectedCurrentDigest = effect?.digest ?? effect?.afterDigest;
  const current = inspectCodexSkillDirectory(fs, resolvedTarget, {
    component: 'skill',
    path: resolvedTarget
  });
  const currentDigest = current.status === 'absent' ? EMPTY_DIGEST : current.contentDigest;
  if (current.status === 'malformed'
    || (typeof expectedCurrentDigest === 'string' && currentDigest !== expectedCurrentDigest)) {
    return refusal('precondition-changed', 'Codex Skill target changed before rollback.');
  }

  if (!backup?.existed) {
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
    return {
      host: HOST_ID,
      status: 'rolled-back',
      path: resolvedTarget,
      digest: EMPTY_DIGEST,
      restoredDigest: EMPTY_DIGEST,
      verified: !fs.existsSync(resolvedTarget)
    };
  }

  const nonce = `${process.pid}-${randomBytes(8).toString('hex')}`;
  const stagedPath = `${resolvedTarget}.launchdeck-${nonce}.rollback`;
  try {
    if (typeof backup.sourceDir === 'string') {
      copySkillTree(fs, backup.sourceDir, stagedPath);
    } else if (Array.isArray(backup.tree)) {
      materializeSkillSnapshot(fs, stagedPath, backup.tree);
    } else {
      return refusal('backup-invalid', 'Codex Skill directory backup is unavailable.');
    }
    const staged = inspectCodexSkillDirectory(fs, stagedPath, {
      component: 'skill',
      path: stagedPath
    });
    const expectedRestoreDigest = backup.originalDigest ?? backup.digest;
    if (staged.status !== 'present'
      || typeof expectedRestoreDigest !== 'string'
      || staged.contentDigest !== expectedRestoreDigest) {
      return refusal('backup-invalid', 'Codex Skill directory backup failed digest verification.');
    }
    replaceDirectoryFromStage(fs, stagedPath, resolvedTarget);
    const restored = inspectCodexSkillDirectory(fs, resolvedTarget, {
      component: 'skill',
      path: resolvedTarget
    });
    const verified = restored.status === 'present'
      && restored.contentDigest === expectedRestoreDigest;
    return {
      host: HOST_ID,
      status: verified ? 'rolled-back' : 'rollback-failed',
      path: resolvedTarget,
      digest: restored.contentDigest,
      restoredDigest: restored.contentDigest,
      verified
    };
  } finally {
    fs.rmSync(stagedPath, { recursive: true, force: true });
  }
}

function replaceDirectoryFromStage(fs, stagedPath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const displacedPath = `${targetPath}.launchdeck-${process.pid}-${randomBytes(8).toString('hex')}.displaced`;
  let displaced = false;
  if (fs.existsSync(targetPath)) {
    fs.renameSync(targetPath, displacedPath);
    displaced = true;
  }
  try {
    fs.renameSync(stagedPath, targetPath);
    fs.rmSync(displacedPath, { recursive: true, force: true });
    displaced = false;
  } catch (error) {
    if (displaced && !fs.existsSync(targetPath)) {
      fs.renameSync(displacedPath, targetPath);
      displaced = false;
    }
    throw error;
  } finally {
    if (!displaced) fs.rmSync(displacedPath, { recursive: true, force: true });
  }
}

function copySkillTree(fs, sourceRoot, targetRoot) {
  const snapshot = snapshotSkillTree(fs, sourceRoot);
  materializeSkillSnapshot(fs, targetRoot, snapshot);
}

function snapshotSkillTree(fs, sourceRoot) {
  const files = [];
  collectSkillSnapshot(fs, sourceRoot, '', files, 0, { files: 0, bytes: 0 });
  return files.sort((left, right) => compareStrings(left.path, right.path));
}

function collectSkillSnapshot(fs, root, relativeDir, files, depth, totals) {
  if (depth > MAX_SKILL_DEPTH) {
    throw new TypeError('Codex Skill tree exceeds the supported maximum depth.');
  }
  const directory = path.join(root, relativeDir);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new TypeError('Codex Skill symlinks are unsupported.');
    if (entry.isDirectory()) {
      collectSkillSnapshot(fs, root, relativePath, files, depth + 1, totals);
      continue;
    }
    if (!entry.isFile()) throw new TypeError('Codex Skill contains an unsupported entry.');
    const bytes = fs.readFileSync(absolutePath);
    totals.files += 1;
    totals.bytes += bytes.length;
    if (totals.files > MAX_SKILL_FILES || totals.bytes > MAX_SKILL_TOTAL_BYTES) {
      throw new TypeError('Codex Skill tree exceeds supported copy limits.');
    }
    files.push({ path: relativePath, bytes: Buffer.from(bytes) });
  }
}

function materializeSkillSnapshot(fs, targetRoot, files) {
  fs.mkdirSync(targetRoot, { recursive: true });
  const seen = new Set();
  for (const file of files) {
    const canonicalPath = canonicalSkillPath(file.path);
    if (seen.has(canonicalPath)) throw new TypeError('Codex Skill snapshot contains duplicate paths.');
    seen.add(canonicalPath);
    const targetPath = path.resolve(targetRoot, file.path);
    if (!isWithin(targetRoot, targetPath)) {
      throw new TypeError('Codex Skill snapshot escapes its target directory.');
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, Buffer.from(file.bytes));
  }
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function collectSkillFiles(fs, root, relativeDir, files, seen, totals, depth) {
  if (depth > MAX_SKILL_DEPTH) {
    throw new TypeError('Codex Skill tree exceeds the supported maximum depth.');
  }
  const directory = path.join(root, relativeDir);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new TypeError('Codex Skill symlinks are unsupported.');
    }
    if (entry.isDirectory()) {
      collectSkillFiles(fs, root, relativePath, files, seen, totals, depth + 1);
      continue;
    }
    if (!entry.isFile()) {
      throw new TypeError('Codex Skill contains an unsupported non-regular entry.');
    }
    const canonicalPath = canonicalSkillPath(relativePath);
    const collisionKey = process.platform === 'win32'
      ? canonicalPath.toLowerCase()
      : canonicalPath;
    if (seen.has(collisionKey)) {
      throw new TypeError('Codex Skill contains duplicate canonical file paths.');
    }
    seen.add(collisionKey);
    const bytes = fs.readFileSync(absolutePath);
    totals.files += 1;
    totals.bytes += bytes.length;
    if (totals.files > MAX_SKILL_FILES) {
      throw new TypeError('Codex Skill tree exceeds the supported maximum file count.');
    }
    if (totals.bytes > MAX_SKILL_TOTAL_BYTES) {
      throw new TypeError('Codex Skill tree exceeds the supported maximum size.');
    }
    files.push({
      path: canonicalPath,
      bytes: bytes.length,
      sha256: digestBytes(bytes)
    });
  }
}

function canonicalSkillPath(relativePath) {
  const normalized = path.normalize(relativePath).replaceAll('\\', '/');
  if (normalized.startsWith('../') || normalized === '..' || normalized.includes('/../')) {
    throw new TypeError('Codex Skill traversal entries are unsupported.');
  }
  return normalized;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function normalizeCapabilityDecision(value) {
  if (value?.supportState === 'supported') {
    return { supported: true, status: 'supported', capabilityRowId: value.rowId };
  }
  return {
    supported: false,
    status: value?.supportState === 'ambiguous' ? 'ambiguous' : 'unsupported',
    reason: value?.reason ?? 'registry-capability-evidence-required'
  };
}

function requireScope(value) {
  if (!['project', 'user'].includes(value)) {
    throw new TypeError('Codex scope must be explicitly project or user.');
  }
  return value;
}

function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !path.isAbsolute(left)) {
    return false;
  }
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function codexVerificationFailure({ target, buildIdentity, evidence, launcher, launchdeckHome }) {
  if (target?.component !== 'mcp') return 'agent_component_unsupported';
  if (evidence.configOwnership !== 'verified' || evidence.liveEntryDigestMatches !== true) {
    return 'agent_target_divergent';
  }
  if (!evidence.skillDigestVerified) return 'agent_skill_digest_mismatch';
  if (!evidence.launcherResolved || typeof launcher !== 'string' || !path.isAbsolute(launcher)) {
    return 'agent_launcher_unavailable';
  }
  if (!evidence.runtimeDigestVerified) return 'agent_runtime_digest_mismatch';
  if (!evidence.mcpInitialize) return 'agent_mcp_initialize_failed';
  if (!evidence.launchdeckCapabilities) return 'agent_capabilities_unavailable';
  if (evidence.reportedBuildIdentity !== buildIdentity) return 'agent_build_identity_mismatch';
  if (!evidence.receiptCandidateConsistent) return 'agent_receipt_candidate_mismatch';
  if (!launchdeckHome || evidence.launchdeckHomeForwarded !== launchdeckHome) {
    return 'agent_launchdeck_home_forwarding_mismatch';
  }
  return null;
}

export default createCodexHostAdapter;
