import path from 'node:path';
import { digestCanonical } from '../../digests.js';

const HOST_ID = 'github-copilot';
const SKILL_NAME = 'launchdeck-agent';
const SKILL_OWNERSHIP_BOUNDARY = 'launchdeck-agent';
const COMPONENTS = Object.freeze(['skill', 'mcp']);
const OWNED_PATH = Object.freeze(['mcpServers', 'launchdeck']);
const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

/**
 * Create an isolated Copilot CLI adapter.
 *
 * Every external effect is supplied by the caller. The adapter itself never
 * probes a live executable, reads a host file, or mutates host state.
 */
export function createCopilotAdapter(options = {}) {
  const capabilityRows = normalizeCapabilityRows(options.capabilityRows);
  const probe = typeof options.probe === 'function'
    ? options.probe
    : async () => ({ exitCode: null, timedOut: false, stdout: '', stderr: '' });
  const fileExists = typeof options.fileExists === 'function'
    ? options.fileExists
    : async () => false;
  const readTextFile = typeof options.readTextFile === 'function'
    ? options.readTextFile
    : missingFileReader;
  const verifyRuntime = typeof options.verifyRuntime === 'function'
    ? options.verifyRuntime
    : async () => ({});
  const inspectSkill = typeof options.inspectSkill === 'function'
    ? options.inspectSkill
    : async (target) => ({
        status: await fileExists(target.path) ? 'present' : 'absent',
        contentDigest: null
      });
  const backupTarget = typeof options.backupTarget === 'function' ? options.backupTarget : null;
  const applyAction = typeof options.applyAction === 'function' ? options.applyAction : null;
  const rollbackAction = typeof options.rollbackAction === 'function' ? options.rollbackAction : null;

  async function detect(context = {}) {
    const platform = String(context.platform ?? process.platform);
    let result;
    try {
      result = await probe({
        host: HOST_ID,
        executable: 'copilot',
        args: ['--version', '--json'],
        structured: true,
        timeoutMs: DEFAULT_PROBE_TIMEOUT_MS
      });
    } catch (error) {
      return [unavailableEvidence(platform, 'probe-failed', error)];
    }

    if (result?.timedOut) {
      return [unavailableEvidence(platform, 'probe-timeout')];
    }
    if (result?.exitCode !== 0) {
      return [unavailableEvidence(platform, 'probe-exit-nonzero')];
    }

    const parsed = parseProbeJson(result?.stdout);
    if (!parsed) {
      return [{
        host: HOST_ID,
        status: 'ambiguous',
        executable: 'copilot',
        version: null,
        platform,
        probeKind: 'structured-json',
        reason: 'unparseable-structured-probe'
      }];
    }

    return [{
      host: HOST_ID,
      status: 'detected',
      executable: 'copilot',
      version: parsed.version,
      platform,
      probeKind: 'structured-json',
      capabilities: {
        skill: parsed.capabilities.skill,
        mcp: parsed.capabilities.mcp
      }
    }];
  }

  function capabilities(hostEvidence, scope) {
    const normalizedScope = normalizeScope(scope);
    if (hostEvidence?.status !== 'detected') {
      const reason = hostEvidence?.status === 'ambiguous'
        ? 'ambiguous-host-evidence'
        : 'host-unavailable';
      return unsupportedCapabilities(normalizedScope, reason);
    }

    const row = capabilityRows.find((candidate) => (
      candidate.host === HOST_ID
      && (candidate.exactVersion ?? candidate.version) === hostEvidence.version
      && candidate.platform === hostEvidence.platform
      && candidate.supportState !== 'fixture-only'
      && typeof candidate.fixtureRevision === 'string'
      && typeof candidate.realHostEvidenceRevision === 'string'
    ));
    if (!row) return unsupportedCapabilities(normalizedScope, 'unsupported-version');

    return COMPONENTS.map((component) => {
      const rowSupports = row.components?.[component]?.[normalizedScope] === true;
      const probeSupports = hostEvidence.capabilities?.[component] === true;
      return rowSupports && probeSupports
        ? {
            component,
            scope: normalizedScope,
            supported: true,
            evidenceRow: row.rowId ?? row.id
          }
        : {
            component,
            scope: normalizedScope,
            supported: false,
            reason: 'unsupported-component'
          };
    });
  }

  function resolveTargets(selection = {}) {
    if (selection.host && selection.host !== HOST_ID) {
      return [];
    }
    const scope = normalizeScope(selection.scope);
    const projectRoot = scope === 'project'
      ? requireAbsoluteRoot(selection.projectRoot, 'projectRoot')
      : null;
    const homeDir = scope === 'user'
      ? requireAbsoluteRoot(selection.homeDir, 'homeDir')
      : null;
    const requested = normalizeComponents(selection.components);
    const skillBase = scope === 'project' ? projectRoot : homeDir;
    const mcpPath = scope === 'project'
      ? path.join(projectRoot, '.github', 'mcp.json')
      : path.join(homeDir, '.copilot', 'mcp-config.json');

    const targets = [];
    for (const component of requested) {
      if (component === 'skill') {
        targets.push({
          host: HOST_ID,
          component,
          scope,
          path: path.join(skillBase, '.agents', 'skills', SKILL_NAME),
          sharedWith: ['codex'],
          ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
        });
      } else {
        targets.push({
          host: HOST_ID,
          component,
          scope,
          path: mcpPath,
          dialect: 'strict-json',
          ownedPath: [...OWNED_PATH],
          ownershipBoundary: OWNED_PATH.join('.')
        });
      }
    }
    return targets;
  }

  async function inspect(target) {
    validateTarget(target);
    if (target.component === 'skill') {
      const observation = await inspectSkill(target);
      return {
        host: HOST_ID,
        component: 'skill',
        scope: target.scope,
        path: target.path,
        status: observation?.status ?? 'unavailable',
        contentDigest: observation?.contentDigest ?? null,
        ownershipBoundary: target.ownershipBoundary ?? SKILL_OWNERSHIP_BOUNDARY
      };
    }

    const primary = await inspectJsonFile(target.path);
    const alternateEntries = [];
    if (target.scope === 'project') {
      const sharedPath = sharedWorkspacePath(target.path);
      if (path.normalize(sharedPath) !== path.normalize(target.path)) {
        const shared = await inspectJsonFile(sharedPath);
        if (shared.entry !== undefined) {
          alternateEntries.push({
            path: sharedPath,
            entry: shared.entry,
            entryDigest: shared.entryDigest,
            status: shared.status
          });
        } else if (shared.status === 'malformed') {
          alternateEntries.push({
            path: sharedPath,
            status: shared.status,
            code: shared.code
          });
        }
      }
    }

    return {
      host: HOST_ID,
      component: 'mcp',
      scope: target.scope,
      path: target.path,
      ...primary,
      alternateEntries
    };
  }

  async function plan(target, desiredBuild) {
    validateTarget(target);
    validateDesiredBuild(desiredBuild);
    const observation = target.observation ?? await inspect(target);

    if (target.component === 'skill') {
      if (observation.status === 'present') {
        if (!receiptOwnsSkill(target, observation)) {
          return refusal('copilot_skill_collision', [target.path]);
        }
        if (observation.contentDigest === desiredBuild.skill.contentDigest) {
          return { kind: 'actions', actions: [] };
        }
      }
      return {
        kind: 'actions',
        ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY,
        actions: [{
          type: 'replace-skill-directory',
          path: target.path,
          sourceDir: desiredBuild.skill.sourceDir,
          contentDigest: desiredBuild.skill.contentDigest,
          sharedWith: ['codex'],
          ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
        }]
      };
    }

    if (observation.status === 'malformed') {
      return refusal('copilot_mcp_config_malformed', [target.path]);
    }

    const ambiguousAlternates = observation.alternateEntries?.filter((entry) => (
      entry.status === 'malformed' || entry.entry !== undefined
    )) ?? [];
    if (ambiguousAlternates.length > 0) {
      return {
        kind: 'refusal',
        code: 'copilot_duplicate_workspace_locations',
        effectCertainty: 'no-write',
        paths: [target.path, ...ambiguousAlternates.map((entry) => entry.path)]
      };
    }

    if (observation.entry !== undefined) {
      if (canonicalEqual(observation.entry, desiredBuild.mcpEntry)) {
        if (!receiptOwnsEntry(target, observation)) {
          return refusal('copilot_mcp_launchdeck_collision', [target.path]);
        }
        return { kind: 'actions', actions: [] };
      }
      if (!receiptOwnsEntry(target, observation)) {
        return refusal('copilot_mcp_launchdeck_collision', [target.path]);
      }
    }

    const document = cloneJsonObject(observation.document ?? {});
    if (document.mcpServers === undefined) {
      document.mcpServers = {};
    }
    if (!isJsonObject(document.mcpServers)) {
      return refusal('copilot_mcp_config_malformed', [target.path]);
    }
    document.mcpServers.launchdeck = cloneJsonValue(desiredBuild.mcpEntry);

    return {
      kind: 'actions',
      actions: [{
        type: 'replace-json-file',
        path: target.path,
        ownedPath: [...OWNED_PATH],
        preconditionDigest: observation.documentDigest ?? null,
        content: `${JSON.stringify(document, null, 2)}\n`
      }]
    };
  }

  async function verify(target, desiredBuild, context = {}) {
    validateTarget(target);
    validateDesiredBuild(desiredBuild);
    const observation = await inspect(target);
    if (target.component === 'skill') {
      const owned = receiptOwnsSkill(target, observation)
        && observation.contentDigest === desiredBuild.skill.contentDigest;
      return {
        host: HOST_ID,
        target: target.path,
        status: owned ? 'ready' : 'failed',
        buildIdentity: desiredBuild.buildIdentity,
        ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY,
        checks: [check('owned-skill-digest', owned)]
      };
    }
    const ownedEntryPass = observation.status !== 'malformed'
      && canonicalEqual(observation.entry, desiredBuild.mcpEntry)
      && receiptOwnsEntry(target, observation);
    const runtime = await verifyRuntime({
      host: HOST_ID,
      target,
      command: desiredBuild.mcpEntry.command,
      args: [...(desiredBuild.mcpEntry.args ?? [])],
      initialize: true,
      capability: 'launchdeck/status',
      buildIdentity: desiredBuild.buildIdentity
    });
    const checks = [
      check('owned-entry', ownedEntryPass),
      check('stable-launcher', runtime?.launcher?.absolute === true && runtime?.launcher?.stable === true),
      check('mcp-initialize', runtime?.initialize?.ok === true),
      check(
        'launchdeck-capability',
        runtime?.capability?.ok === true && runtime?.capability?.name === 'launchdeck/status'
      ),
      check('build-identity', runtime?.buildIdentity === desiredBuild.buildIdentity),
      check(
        'receipt-candidate',
        runtime?.receiptCandidateConsistent === true
          && runtime?.receiptCandidateBuildIdentity === desiredBuild.buildIdentity
          && context.receiptCandidateConsistent !== false
      )
    ];

    return {
      host: HOST_ID,
      target: target.path,
      status: checks.every((entry) => entry.status === 'pass') ? 'ready' : 'failed',
      buildIdentity: runtime?.buildIdentity ?? null,
      checks
    };
  }

  async function uninstall(target, receiptOwnership) {
    validateTarget(target);
    const observation = await inspect(target);
    const ownedTarget = { ...target, receiptOwnership };
    if (target.component === 'skill') {
      if (!receiptOwnsSkill(ownedTarget, observation)) {
        return refusal('copilot_skill_not_owned', [target.path]);
      }
      return {
        kind: 'actions',
        ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY,
        actions: [{
          type: 'remove-skill-directory',
          path: target.path,
          ownershipBoundary: SKILL_OWNERSHIP_BOUNDARY
        }]
      };
    }
    if (observation.status === 'malformed') {
      return refusal('copilot_mcp_config_malformed', [target.path]);
    }
    if (observation.entry === undefined) {
      return { kind: 'actions', actions: [] };
    }
    if (!receiptOwnsEntry(ownedTarget, observation)) {
      return refusal('copilot_mcp_entry_not_owned', [target.path]);
    }

    const document = cloneJsonObject(observation.document);
    delete document.mcpServers.launchdeck;
    return {
      kind: 'actions',
      actions: [{
        type: 'replace-json-file',
        path: target.path,
        ownedPath: [...OWNED_PATH],
        preconditionDigest: observation.documentDigest,
        content: `${JSON.stringify(document, null, 2)}\n`
      }]
    };
  }

  async function backup(action, transaction) {
    if (!backupTarget) return refusal('copilot_backup_provider_missing', [action?.path].filter(Boolean));
    return backupTarget({ host: HOST_ID, action, transaction });
  }

  async function apply(action, transaction) {
    if (!applyAction) return refusal('copilot_apply_provider_missing', [action?.path].filter(Boolean));
    return applyAction({ host: HOST_ID, action, transaction });
  }

  async function rollback(effect, backupRef, transaction) {
    if (!rollbackAction) {
      return refusal('copilot_rollback_provider_missing', [effect?.path].filter(Boolean));
    }
    return rollbackAction({ host: HOST_ID, effect, backup: backupRef, transaction });
  }

  async function inspectJsonFile(filePath) {
    if (!await fileExists(filePath)) {
      return {
        status: 'absent',
        exists: false,
        document: {},
        documentDigest: null,
        entry: undefined,
        entryDigest: null
      };
    }
    let source;
    try {
      source = await readTextFile(filePath);
    } catch (error) {
      return {
        status: 'malformed',
        exists: true,
        code: error?.code === 'ENOENT' ? 'config-read-race' : 'config-read-failed',
        document: null,
        documentDigest: null,
        entry: undefined,
        entryDigest: null
      };
    }
    let document;
    try {
      document = JSON.parse(source);
    } catch {
      return malformedJsonObservation('invalid-json');
    }
    if (!isJsonObject(document)) return malformedJsonObservation('root-not-object');
    if (document.mcpServers !== undefined && !isJsonObject(document.mcpServers)) {
      return malformedJsonObservation('mcp-servers-not-object');
    }
    const entry = document.mcpServers?.launchdeck;
    if (entry !== undefined && !isJsonObject(entry)) {
      return malformedJsonObservation('launchdeck-entry-not-object');
    }
    return {
      status: 'observed',
      exists: true,
      document,
      documentDigest: digestCanonical(document),
      entry,
      entryDigest: entry === undefined ? null : digestCanonical(entry)
    };
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

function normalizeCapabilityRows(rows) {
  if (!Array.isArray(rows)) return Object.freeze([]);
  return Object.freeze(rows
    .filter((row) => isJsonObject(row))
    .map((row) => Object.freeze(cloneJsonObject(row))));
}

function normalizeScope(scope) {
  if (scope !== 'project' && scope !== 'user') {
    throw new TypeError("Copilot scope must be 'project' or 'user'.");
  }
  return scope;
}

function normalizeComponents(components = COMPONENTS) {
  if (!Array.isArray(components)) throw new TypeError('Copilot components must be an array.');
  const requested = [];
  for (const component of components) {
    if (!COMPONENTS.includes(component)) {
      throw new TypeError(`Unsupported Copilot component: ${String(component)}`);
    }
    if (!requested.includes(component)) requested.push(component);
  }
  return requested;
}

function validateTarget(target) {
  if (!target || target.host !== HOST_ID || !COMPONENTS.includes(target.component)) {
    throw new TypeError('Invalid Copilot managed target.');
  }
  normalizeScope(target.scope);
  if (typeof target.path !== 'string' || target.path.length === 0) {
    throw new TypeError('Copilot target path is required.');
  }
}

function validateDesiredBuild(desiredBuild) {
  if (!isJsonObject(desiredBuild)
    || typeof desiredBuild.buildIdentity !== 'string'
    || desiredBuild.buildIdentity.length === 0
    || !isJsonObject(desiredBuild.skill)
    || typeof desiredBuild.skill.sourceDir !== 'string'
    || typeof desiredBuild.skill.contentDigest !== 'string'
    || !isJsonObject(desiredBuild.mcpEntry)
    || typeof desiredBuild.mcpEntry.command !== 'string'
    || !path.isAbsolute(desiredBuild.mcpEntry.command)) {
    throw new TypeError('A complete desired Copilot build is required.');
  }
}

function parseProbeJson(stdout) {
  if (typeof stdout !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isJsonObject(parsed)
    || parsed.name !== 'GitHub Copilot CLI'
    || !isExactSemver(parsed.version)
    || !isJsonObject(parsed.capabilities)
    || typeof parsed.capabilities.skill !== 'boolean'
    || typeof parsed.capabilities.mcp !== 'boolean') {
    return null;
  }
  return parsed;
}

function isExactSemver(value) {
  return typeof value === 'string'
    && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function unavailableEvidence(platform, reason, error) {
  return {
    host: HOST_ID,
    status: 'unavailable',
    executable: 'copilot',
    version: null,
    platform,
    probeKind: 'structured-json',
    reason,
    ...(error ? { errorCode: String(error.code ?? 'probe-error') } : {})
  };
}

function unsupportedCapabilities(scope, reason) {
  return COMPONENTS.map((component) => ({
    component,
    scope,
    supported: false,
    reason
  }));
}

function sharedWorkspacePath(targetPath) {
  const githubDir = path.dirname(targetPath);
  const projectRoot = path.dirname(githubDir);
  return path.join(projectRoot, '.mcp.json');
}

function malformedJsonObservation(code) {
  return {
    status: 'malformed',
    exists: true,
    code,
    document: null,
    documentDigest: null,
    entry: undefined,
    entryDigest: null
  };
}

function receiptOwnsEntry(target, observation) {
  const ownership = target.receiptOwnership;
  return ownership?.owner === 'launchdeck-agent-installer'
    && ownership.component === 'mcp'
    && Array.isArray(ownership.ownedPath)
    && ownership.ownedPath.length === OWNED_PATH.length
    && ownership.ownedPath.every((segment, index) => segment === OWNED_PATH[index])
    && samePath(ownership.path, observation.path ?? target.path)
    && typeof ownership.liveDigest === 'string'
    && ownership.liveDigest === observation.entryDigest;
}

function receiptOwnsSkill(target, observation) {
  const ownership = target.receiptOwnership;
  return ownership?.owner === 'launchdeck-agent-installer'
    && ownership.component === 'skill'
    && ownership.ownershipBoundary === SKILL_OWNERSHIP_BOUNDARY
    && samePath(ownership.path, observation.path ?? target.path)
    && typeof ownership.liveDigest === 'string'
    && ownership.liveDigest === observation.contentDigest;
}

function refusal(code, paths) {
  return {
    kind: 'refusal',
    code,
    effectCertainty: 'no-write',
    paths
  };
}

function check(code, passed) {
  return { code, status: passed ? 'pass' : 'fail' };
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
  if (typeof left !== 'string' || typeof right !== 'string' || !path.isAbsolute(left)) {
    return false;
  }
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
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

function requireAbsoluteRoot(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0 || !path.isAbsolute(value)) {
    throw new TypeError(`${name} must be an explicit absolute path.`);
  }
  return path.normalize(value);
}

async function missingFileReader(filePath) {
  const error = new Error(`No injected reader for ${filePath}`);
  error.code = 'ENOENT';
  throw error;
}
