import path from 'node:path';
import { createHash } from 'node:crypto';
import { digestCanonical } from '../../digests.js';

const HOST_ID = 'claude-code';
const SKILL_NAME = 'launchdeck-agent';
const SKILL_OWNERSHIP_BOUNDARY = 'launchdeck-agent';
const OWNED_DIALECT = 'mcpServers.launchdeck';
const OWNED_PATH = Object.freeze(['mcpServers', 'launchdeck']);
const MAX_SKILL_FILES = 1_024;
const MAX_SKILL_DEPTH = 32;
const MAX_SKILL_TOTAL_BYTES = 10 * 1024 * 1024;

/**
 * Create an isolated Claude Code host adapter.
 *
 * Probes, filesystem access, runtime verification, and all effects are
 * caller-supplied. Merely constructing this adapter cannot touch Claude.
 */
export function createClaudeHostAdapter(options = {}) {
  const base = { ...options };
  const capabilityRows = normalizeCapabilityRows(options.capabilityRows);
  const backupTarget = typeof options.backupTarget === 'function' ? options.backupTarget : null;
  const applyAction = typeof options.applyAction === 'function' ? options.applyAction : null;
  const rollbackAction = typeof options.rollbackAction === 'function' ? options.rollbackAction : null;
  const verifyRuntime = typeof options.verifyRuntime === 'function' ? options.verifyRuntime : null;

  async function detect(context = {}) {
    const probes = context.probes ?? base.probes ?? {};
    const versionProbe = parseVersionProbe(probes.version);
    const mcpProbe = parseMcpProbe(probes.mcpList);
    return [
      {
        host: HOST_ID,
        command: 'claude --version',
        status: versionProbe ? 'detected' : 'ambiguous',
        version: versionProbe?.version ?? null,
        exact: Boolean(versionProbe)
      },
      {
        host: HOST_ID,
        command: 'claude mcp list',
        status: mcpProbe ? 'detected' : 'ambiguous',
        trust: mcpProbe?.trust ?? 'unknown',
        entries: mcpProbe?.entries ?? []
      }
    ];
  }

  async function capabilities(evidence, selectedScope, context = {}) {
    const scope = normalizeScope(selectedScope);
    const rows = Array.isArray(evidence) ? evidence : evidence?.evidence ?? [];
    const versionEvidence = rows.find((row) => row?.command === 'claude --version');
    const mcpEvidence = rows.find((row) => row?.command === 'claude mcp list');
    const supportedRow = versionEvidence?.status === 'detected'
      ? capabilityRows.find((row) =>
          row.host === HOST_ID
          && row.exactVersion === versionEvidence.version
          && row.platform === (context.platform ?? process.platform)
          && completeCapabilityEvidence(row)
        )
      : null;
    const roots = resolveRoots(context, scope);
    const trust = context.trust ?? base.trust ?? {};
    const mcpApproved = mcpEvidence?.trust === 'approved'
      && (scope === 'project' ? trust.project === true : trust.user === true);

    return buildTargets(roots, ['skill', 'mcp'], [scope]).map((target) => {
      const supported = Boolean(
        supportedRow
        && supportedRow.components.includes(target.component)
        && (target.component !== 'mcp' || mcpApproved)
      );
      return {
        host: HOST_ID,
        component: target.component,
        scope: target.scope,
        supported,
        ...(supported
          ? { evidenceRow: supportedRow.rowId }
          : { reason: supportedRow ? 'approval-or-trust-required' : 'unsupported-version' }),
        path: target.path,
        ...(target.component === 'skill'
          ? { skillRoot: target.path }
          : { configPath: target.path, dialect: OWNED_DIALECT })
      };
    });
  }

  async function resolveTargets(selection = {}) {
    if (selection.host && selection.host !== HOST_ID) return [];
    const scope = normalizeScope(selection.scope);
    const components = normalizeComponents(selection.components);
    return buildTargets(resolveRoots(selection, scope), components, [scope]);
  }

  async function inspect(target, context = {}) {
    const normalized = normalizeTarget(target);
    const fsProvider = resolveFs(context, base);
    if (!fsProvider) {
      return {
        host: HOST_ID,
        ...normalized,
        status: 'unavailable',
        code: 'claude_config_provider_missing'
      };
    }

    if (normalized.component === 'skill') {
      return inspectSkillDirectory(fsProvider, normalized);
    }

    return inspectConfig(fsProvider, normalized);
  }

  async function plan(target, desired = {}, context = {}) {
    const normalized = normalizeTarget(target);
    const trust = context.trust ?? desired.trust ?? base.trust ?? {};
    const approved = normalized.scope === 'project'
      ? trust.project === true && trust.approval === true
      : trust.user === true && trust.approval === true;
    if (!approved) {
      return refusal('claude_approval_or_trust_required', normalized.path, {
        reason: 'Claude trust and explicit approval are required before planning a write.',
        approval: 'required'
      });
    }

    const fsProvider = resolveFs(context, desired, base);
    if (!fsProvider) {
      return refusal('claude_config_provider_missing', normalized.path);
    }
    const observation = await inspect(normalized, { fs: fsProvider });
    if (observation.status === 'malformed' || observation.status === 'unavailable') {
      return refusal(normalized.component === 'skill'
        ? 'claude_skill_invalid'
        : 'claude_mcp_config_malformed', normalized.path, {
        reason: observation.code
      });
    }

    if (normalized.component === 'skill') {
      if (!nonEmptyString(desired.skillSource) || !nonEmptyString(desired.skillDigest)) {
        return refusal('claude_skill_desired_build_incomplete', normalized.path);
      }
      if (observation.status === 'present') {
        if (!receiptOwnsSkill(target, observation)) {
          return refusal('claude_skill_ownership_collision', normalized.path);
        }
        if (observation.contentDigest === desired.skillDigest) {
          return { kind: 'actions', actions: [] };
        }
      }
      return {
        kind: 'actions',
        host: HOST_ID,
        ownedPath: normalized.path,
        ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY,
        actions: [{
          type: 'replace-skill-directory',
          path: normalized.path,
          sourceDir: desired.skillSource,
          contentDigest: desired.skillDigest,
          ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
        }]
      };
    }

    const buildIdentity = normalizeBuildIdentity(desired.buildIdentity);
    const desiredEntry = normalizeDesiredMcpEntry(desired, normalized, buildIdentity);
    if (!desiredEntry) return refusal('claude_launcher_invalid', normalized.path);
    if (observation.entry !== undefined) {
      const ownership = target.receiptOwnership ?? desired.receiptOwnership;
      if (!receiptOwnsEntry(ownership, observation)) {
        return refusal('claude_mcp_launchdeck_collision', normalized.path, {
          reason: 'Existing mcpServers.launchdeck ownership is not proven.'
        });
      }
      if (canonicalEqual(observation.entry, desiredEntry)) {
        return { kind: 'actions', actions: [] };
      }
    }
    const document = cloneJsonObject(observation.document ?? {});
    document.mcpServers ??= {};
    if (!isJsonObject(document.mcpServers)) {
      return refusal('claude_mcp_config_malformed', normalized.path);
    }
    document.mcpServers.launchdeck = cloneJsonValue(desiredEntry);
    const content = `${JSON.stringify(document, null, 2)}\n`;

    return {
      kind: 'actions',
      host: HOST_ID,
      component: 'mcp',
      scope: normalized.scope,
      ownedPath: OWNED_DIALECT,
      document,
      actions: [{
        type: 'replace-json-file',
        path: normalized.path,
        ownedPath: [...OWNED_PATH],
        preconditionDigest: observation.documentDigest,
        content
      }]
    };
  }

  async function verify(targetOrRequest, desiredBuild, context = {}) {
    const request = isVerificationRequest(targetOrRequest)
      ? targetOrRequest
      : { ...context, target: targetOrRequest, desiredBuild };
    const normalized = normalizeTarget(request.target);
    const desired = normalizeDesiredVerification(request.desiredBuild);
    const buildIdentity = desired.buildIdentity;
    const fsProvider = resolveFs(request, base);
    const observation = fsProvider
      ? await inspect(normalized, { fs: fsProvider })
      : { status: 'unavailable', entry: undefined, entryDigest: null };
    const trust = request.trust ?? base.trust ?? {};
    const probes = request.probes ?? base.probes ?? {};
    const mcpProbe = parseMcpProbe(probes.mcpList);
    const approved = normalized.scope === 'project'
      ? trust.project === true && (trust.approval === true || mcpProbe?.trust === 'approved')
      : trust.user === true && trust.approval === true;
    const desiredEntry = desired.mcpEntry;
    const launcherPath = desiredEntry?.command;
    const mcpOwnership = request.receiptOwnership?.mcp
      ?? request.receiptOwnership
      ?? normalized.receiptOwnership;
    const configPass = isJsonObject(desiredEntry)
      && canonicalEqual(observation.entry, desiredEntry)
      && receiptOwnsEntry(mcpOwnership, observation);
    const skillPath = desired.skill?.path ?? normalized.skillPath;
    const skillObservation = fsProvider && nonEmptyString(skillPath)
      ? await inspect({
          host: HOST_ID,
          component: 'skill',
          scope: normalized.scope,
          path: skillPath
        }, { fs: fsProvider })
      : { status: 'unavailable', contentDigest: null };
    const skillOwnership = request.receiptOwnership?.skill;
    const skillPass = nonEmptyString(desired.skill?.contentDigest)
      && skillObservation.contentDigest === desired.skill.contentDigest
      && receiptOwnsSkill({
        receiptOwnership: skillOwnership,
        path: skillPath,
        ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
      }, skillObservation);
    if (normalized.component === 'skill') {
      return {
        host: HOST_ID,
        scope: normalized.scope,
        component: normalized.component,
        ownedPath: normalized.path,
        ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY,
        status: skillPass ? 'ready' : 'not-ready',
        buildIdentity,
        approval: approved ? 'observed' : 'pending-host-approval',
        checks: [
          {
            code: 'owned-skill-digest',
            status: skillPass ? 'pass' : 'fail'
          },
          {
            code: 'host-approval',
            status: approved ? 'pass' : 'pending-host-approval'
          }
        ]
      };
    }
    const runtime = verifyRuntime && isJsonObject(desiredEntry)
      ? await verifyRuntime({
          host: HOST_ID,
          target: normalized,
          launcherPath: desiredEntry.command,
          command: desiredEntry.command,
          args: [...(desiredEntry.args ?? [])],
          initialize: true,
          capability: 'launchdeck/status',
          buildIdentity
        })
      : null;
    const checks = [
      {
        code: 'owned-config-entry',
        status: configPass ? 'pass' : 'fail'
      },
      {
        code: 'owned-skill-digest',
        status: skillPass ? 'pass' : 'fail'
      },
      {
        code: 'stable-launcher',
        status: nonEmptyString(launcherPath)
          && path.isAbsolute(launcherPath)
          && runtime?.launcher?.absolute === true
          && runtime?.launcher?.stable === true
          ? 'pass'
          : 'fail',
        path: launcherPath
      },
      {
        code: 'runtime-digest',
        status: nonEmptyString(desired.runtimeDigest)
          && runtime?.runtimeDigestVerified === true
          && runtime?.runtimeDigest === desired.runtimeDigest
          ? 'pass'
          : 'fail'
      },
      {
        code: 'mcp-initialize',
        status: runtime?.initialize?.ok === true ? 'pass' : 'fail'
      },
      {
        code: 'launchdeck-capability',
        status: runtime?.capability?.ok === true
          && runtime?.capability?.name === 'launchdeck/status'
          ? 'pass'
          : 'fail'
      },
      {
        code: 'build-identity',
        status: runtime?.buildIdentity === buildIdentity ? 'pass' : 'fail',
        buildIdentity
      },
      {
        code: 'receipt-candidate',
        status: runtime?.receiptCandidateConsistent === true
          && runtime?.receiptCandidateBuildIdentity === buildIdentity
          ? 'pass'
          : 'fail'
      },
      {
        code: 'host-approval',
        status: approved ? 'pass' : 'pending-host-approval'
      }
    ];

    return {
      host: HOST_ID,
      scope: normalized.scope,
      component: normalized.component,
      ownedPath: OWNED_DIALECT,
      status: checks.every((check) => check.status === 'pass') ? 'ready' : (
        approved ? 'not-ready' : 'pending-host-approval'
      ),
      buildIdentity,
      launcher: launcherPath,
      approval: approved ? 'observed' : 'pending-host-approval',
      checks
    };
  }

  async function uninstall(target, receiptOwnership, context = {}) {
    const normalized = normalizeTarget(target);
    const observation = await inspect(normalized, context);
    if (normalized.component === 'skill') {
      if (!receiptOwnsSkill({ ...target, receiptOwnership }, observation)) {
        return refusal('claude_skill_not_owned', normalized.path);
      }
      return {
        kind: 'actions',
        ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY,
        actions: [{
          type: 'remove-skill-directory',
          path: normalized.path,
          ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
        }]
      };
    }
    if (observation.status === 'malformed') {
      return refusal('claude_mcp_config_malformed', normalized.path);
    }
    if (observation.entry === undefined) return { kind: 'actions', actions: [] };
    if (!receiptOwnsEntry(receiptOwnership, observation)) {
      return refusal('claude_mcp_entry_not_owned', normalized.path);
    }
    const document = cloneJsonObject(observation.document);
    delete document.mcpServers.launchdeck;
    return {
      kind: 'actions',
      ownedPath: OWNED_DIALECT,
      actions: [{
        type: 'replace-json-file',
        path: normalized.path,
        ownedPath: [...OWNED_PATH],
        preconditionDigest: observation.documentDigest,
        content: `${JSON.stringify(document, null, 2)}\n`
      }]
    };
  }

  async function backup(action, transaction) {
    if (!backupTarget) return refusal('claude_backup_provider_missing', action?.path);
    return backupTarget({ host: HOST_ID, action, transaction });
  }

  async function apply(action, transaction) {
    if (!applyAction) return refusal('claude_apply_provider_missing', action?.path);
    return applyAction({ host: HOST_ID, action, transaction });
  }

  async function rollback(effect, backupRef, transaction) {
    if (!rollbackAction) return refusal('claude_rollback_provider_missing', effect?.path);
    return rollbackAction({ host: HOST_ID, effect, backup: backupRef, transaction });
  }

  return Object.freeze({
    id: HOST_ID,
    detect,
    capabilities,
    resolveTargets,
    inspect,
    plan,
    backup,
    apply,
    rollback,
    verify,
    uninstall
  });
}

function parseVersionProbe(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^claude\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/);
  return match ? { version: match[1] } : null;
}

function parseMcpProbe(value) {
  if (!isJsonObject(value)
    || value.command !== 'claude mcp list'
    || !['approved', 'unknown', 'denied'].includes(value.trust)
    || !Array.isArray(value.entries)) {
    return null;
  }
  return {
    trust: value.trust,
    entries: cloneJsonValue(value.entries)
  };
}

function resolveRoots(context = {}, scope) {
  if (scope === 'project') {
    return { projectRoot: requireAbsoluteRoot(context.projectRoot, 'projectRoot'), homeDir: null };
  }
  if (scope === 'user') {
    return { projectRoot: null, homeDir: requireAbsoluteRoot(context.homeDir, 'homeDir') };
  }
  throw new TypeError("Claude scope must be explicitly 'project' or 'user'.");
}

function buildTargets(roots, components, scopes) {
  const targets = [];
  for (const scope of scopes) {
    for (const component of components) {
      if (component === 'skill') {
        const skillRoot = path.join(
          scope === 'project' ? roots.projectRoot : roots.homeDir,
          '.claude',
          'skills',
          SKILL_NAME
        );
        targets.push({
          host: HOST_ID,
          scope,
          component,
          path: skillRoot,
          skillRoot,
          ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
        });
      } else {
        const configPath = scope === 'project'
          ? path.join(roots.projectRoot, '.mcp.json')
          : path.join(roots.homeDir, '.claude.json');
        targets.push({
          host: HOST_ID,
          scope,
          component,
          path: configPath,
          configPath,
          dialect: OWNED_DIALECT,
          ownedPath: [...OWNED_PATH]
        });
      }
    }
  }
  return targets;
}

function normalizeScope(scope) {
  if (scope !== 'project' && scope !== 'user') {
    throw new TypeError("Claude scope must be explicitly 'project' or 'user'.");
  }
  return scope;
}

function normalizeCapabilityRows(rows) {
  if (!Array.isArray(rows)) return Object.freeze([]);
  return Object.freeze(rows
    .filter(isJsonObject)
    .map((row) => Object.freeze(cloneJsonObject(row))));
}

function completeCapabilityEvidence(row) {
  return row.supportState !== 'fixture-only'
    && nonEmptyString(row.rowId)
    && nonEmptyString(row.fixtureRevision)
    && nonEmptyString(row.realHostEvidenceRevision);
}

function normalizeComponents(components = ['skill', 'mcp']) {
  if (!Array.isArray(components)) throw new TypeError('Claude components must be an array.');
  const normalized = [];
  for (const component of components) {
    if (component !== 'skill' && component !== 'mcp') {
      throw new TypeError(`Unsupported Claude component: ${String(component)}`);
    }
    if (!normalized.includes(component)) normalized.push(component);
  }
  return normalized;
}

function normalizeTarget(target) {
  if (!isJsonObject(target)) throw new TypeError('Claude target is required.');
  const component = target.component;
  if (component !== 'skill' && component !== 'mcp') {
    throw new TypeError('Claude target component must be skill or mcp.');
  }
  const scope = target.scope;
  if (scope !== 'project' && scope !== 'user') {
    throw new TypeError('Claude target scope must be project or user.');
  }
  const targetPath = component === 'skill'
    ? target.path ?? target.skillRoot ?? target.skillPath
    : target.path ?? target.configPath;
  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    throw new TypeError('Claude target path is required.');
  }
  return {
    ...target,
    host: HOST_ID,
    component,
    scope,
    path: path.resolve(targetPath),
    ...(component === 'mcp' ? { configPath: path.resolve(targetPath) } : { skillRoot: path.resolve(targetPath) })
  };
}

function inspectConfig(fsProvider, target) {
  if (!fsProvider.existsSync(target.path)) {
    return {
      host: HOST_ID,
      ...target,
      status: 'absent',
      document: {},
      documentDigest: null,
      entry: undefined,
      entryDigest: null
    };
  }
  let document;
  try {
    document = JSON.parse(fsProvider.readFileSync(target.path, 'utf8'));
  } catch {
    return {
      host: HOST_ID,
      ...target,
      status: 'malformed',
      code: 'invalid-json',
      document: null,
      documentDigest: null,
      entry: undefined,
      entryDigest: null
    };
  }
  if (!isJsonObject(document)
    || (document.mcpServers !== undefined && !isJsonObject(document.mcpServers))
    || (document.mcpServers?.launchdeck !== undefined
      && !isJsonObject(document.mcpServers.launchdeck))) {
    return {
      host: HOST_ID,
      ...target,
      status: 'malformed',
      code: 'invalid-mcp-servers-shape',
      document: null,
      documentDigest: null,
      entry: undefined,
      entryDigest: null
    };
  }
  const entry = document.mcpServers?.launchdeck;
  return {
    host: HOST_ID,
    ...target,
    status: 'observed',
    document,
    documentDigest: digestCanonical(document),
    entry,
    entryDigest: entry === undefined ? null : digestCanonical(entry)
  };
}

function inspectSkillDirectory(fsProvider, target) {
  if (!fsProvider.existsSync(target.path)) {
    return { host: HOST_ID, ...target, status: 'absent', contentDigest: null };
  }
  if (typeof fsProvider.lstatSync !== 'function'
    || typeof fsProvider.readdirSync !== 'function'
    || typeof fsProvider.readFileSync !== 'function') {
    return {
      host: HOST_ID,
      ...target,
      status: 'unavailable',
      code: 'claude_skill_inspector_incomplete',
      contentDigest: null
    };
  }
  try {
    const rootEntry = fsProvider.lstatSync(target.path);
    if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
      return {
        host: HOST_ID,
        ...target,
        status: 'malformed',
        code: 'claude_skill_invalid',
        contentDigest: null,
        ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
      };
    }
    const files = [];
    const seen = new Set();
    const totals = { files: 0, bytes: 0 };
    collectSkillFiles(fsProvider, target.path, '', files, seen, totals, 0);
    files.sort((left, right) => left.path.localeCompare(right.path));
    return {
      host: HOST_ID,
      ...target,
      status: 'present',
      contentDigest: digestCanonical({ schemaVersion: 1, skillName: SKILL_NAME, files }),
      ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
    };
  } catch {
    return {
      host: HOST_ID,
      ...target,
      status: 'malformed',
      code: 'claude_skill_inspection_failed',
      contentDigest: null,
      ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
    };
  }
}

function collectSkillFiles(fsProvider, root, relativeDir, files, seen, totals, depth) {
  if (depth > MAX_SKILL_DEPTH) throw new TypeError('Claude Skill tree exceeds the supported maximum depth.');
  const directory = path.join(root, relativeDir);
  for (const entry of fsProvider.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new TypeError('Claude Skill symlinks are unsupported.');
    if (entry.isDirectory()) {
      collectSkillFiles(fsProvider, root, relativePath, files, seen, totals, depth + 1);
    } else if (entry.isFile()) {
      const bytes = fsProvider.readFileSync(absolutePath);
      const canonicalPath = canonicalSkillPath(relativePath);
      if (seen.has(canonicalPath)) throw new TypeError('Claude Skill contains duplicate canonical file paths.');
      seen.add(canonicalPath);
      totals.files += 1;
      totals.bytes += bytes.length;
      if (totals.files > MAX_SKILL_FILES) {
        throw new TypeError('Claude Skill tree exceeds the supported maximum file count.');
      }
      if (totals.bytes > MAX_SKILL_TOTAL_BYTES) {
        throw new TypeError('Claude Skill tree exceeds the supported maximum size.');
      }
      files.push({
        path: canonicalPath,
        bytes: bytes.length,
        sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`
      });
    } else {
      throw new TypeError('Claude Skill contains an unsupported non-regular entry.');
    }
  }
}

function normalizeBuildIdentity(value) {
  const identity = isJsonObject(value) ? value.buildIdentity : value;
  if (typeof identity !== 'string' || identity.length === 0) {
    throw new TypeError('Claude desired build identity is required.');
  }
  return identity;
}

function normalizeDesiredMcpEntry(desired, _target, buildIdentity) {
  if (isJsonObject(desired.mcpEntry)) {
    if (!nonEmptyString(desired.mcpEntry.command)
      || !path.isAbsolute(desired.mcpEntry.command)
      || !Array.isArray(desired.mcpEntry.args)
      || !desired.mcpEntry.args.includes(buildIdentity)) {
      return null;
    }
    return cloneJsonValue(desired.mcpEntry);
  }
  if (!nonEmptyString(desired.launcherPath) || !path.isAbsolute(desired.launcherPath)) return null;
  return {
    command: desired.launcherPath,
    args: ['serve', '--build', buildIdentity]
  };
}

function normalizeDesiredVerification(value) {
  if (typeof value === 'string') {
    return { buildIdentity: value, runtimeDigest: null, mcpEntry: null, skill: null };
  }
  if (!isJsonObject(value)) {
    return { buildIdentity: null, runtimeDigest: null, mcpEntry: null, skill: null };
  }
  return {
    buildIdentity: nonEmptyString(value.buildIdentity) ? value.buildIdentity : null,
    runtimeDigest: nonEmptyString(value.runtimeDigest) ? value.runtimeDigest : null,
    mcpEntry: isJsonObject(value.mcpEntry) ? cloneJsonValue(value.mcpEntry) : null,
    skill: isJsonObject(value.skill) ? cloneJsonValue(value.skill) : null
  };
}

function receiptOwnsEntry(ownership, observation) {
  return ownership?.owner === 'launchdeck-agent-installer'
    && ownership.component === 'mcp'
    && Array.isArray(ownership.ownedPath)
    && ownership.ownedPath.length === OWNED_PATH.length
    && ownership.ownedPath.every((part, index) => part === OWNED_PATH[index])
    && samePath(ownership.path, observation.path)
    && ownership.liveDigest === observation.entryDigest;
}

function receiptOwnsSkill(target, observation) {
  const ownership = target.receiptOwnership;
  return ownership?.owner === 'launchdeck-agent-installer'
    && ownership.component === 'skill'
    && ownership.ownershipBoundary === SKILL_OWNERSHIP_BOUNDARY
    && samePath(ownership.path, observation.path ?? target.path)
    && typeof ownership.liveDigest === 'string'
    && typeof observation.contentDigest === 'string'
    && ownership.liveDigest === observation.contentDigest;
}

function canonicalSkillPath(relativePath) {
  const normalized = path.normalize(relativePath).replaceAll('\\', '/');
  if (normalized.startsWith('../') || normalized === '..' || normalized.includes('/../')) {
    throw new TypeError('Claude Skill traversal entries are unsupported.');
  }
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function resolveFs(...contexts) {
  const provider = contexts.find((context) => context?.fs)?.fs;
  return provider
    && typeof provider.existsSync === 'function'
    && typeof provider.readFileSync === 'function'
    ? provider
    : null;
}

function canonicalEqual(left, right) {
  if (left === undefined || right === undefined) return left === right;
  try {
    return digestCanonical(left) === digestCanonical(right);
  } catch {
    return false;
  }
}

function samePath(left, right) {
  if (!nonEmptyString(left) || !nonEmptyString(right) || !path.isAbsolute(left)) {
    return false;
  }
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function requireAbsoluteRoot(value, name) {
  if (!nonEmptyString(value) || !path.isAbsolute(value)) {
    throw new TypeError(`${name} must be an explicit absolute path.`);
  }
  return path.normalize(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function refusal(code, targetPath, extra = {}) {
  return {
    kind: 'refusal',
    code,
    effectCertainty: 'no-write',
    ...(targetPath ? { path: targetPath } : {}),
    ...extra
  };
}

function isVerificationRequest(value) {
  return isJsonObject(value) && isJsonObject(value.target) && value.desiredBuild !== undefined;
}

function cloneJsonObject(value) {
  if (!isJsonObject(value)) throw new TypeError('Expected a JSON object.');
  return cloneJsonValue(value);
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function isJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export default createClaudeHostAdapter;
