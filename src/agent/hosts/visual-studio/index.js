import path from 'node:path';
import { createHash } from 'node:crypto';

const HOST_ID = 'visual-studio';
const MCP_BOUNDARY = 'servers.launchdeck';
const COMPONENT_ORDER = new Map([['mcp', 0], ['skill', 1]]);

export function createVisualStudioHostAdapter(defaultContext = {}) {
  return {
    id: HOST_ID,
    detect: (context = {}) => detectVisualStudio({ ...defaultContext, ...context }),
    capabilities: (evidence, scope, context = {}) =>
      evaluateVisualStudioCapabilities(firstEvidence(evidence), {
        ...defaultContext,
        ...context,
        scope
      }),
    resolveTargets: (selection = {}) =>
      resolveVisualStudioTargets({ ...defaultContext, ...selection }),
    inspect: (target, context = {}) =>
      inspectVisualStudioMcpConfig({
        ...defaultContext,
        ...context,
        target,
        configPath: target.path
      }),
    plan: (target, context = {}) => {
      if (target?.component === 'skill') {
        return Object.freeze({
          kind: 'install-skill',
          path: requireTargetPath(target),
          ownershipBoundary: 'launchdeck-agent'
        });
      }
      const observation = inspectVisualStudioMcpConfig({
        ...defaultContext,
        ...context,
        target,
        configPath: target.path
      });
      return planVisualStudioMcpMutation({ observation, target });
    },
    backup: (action, _transaction, context = {}) =>
      backupTarget(action, { ...defaultContext, ...context }),
    apply: (action, _transaction, context = {}) =>
      applyMutation(action, { ...defaultContext, ...context }),
    rollback: (effect, backup, _transaction, context = {}) =>
      rollbackMutation(effect, backup, { ...defaultContext, ...context }),
    verify: (context = {}) => verifyVisualStudioTarget({ ...defaultContext, ...context }),
    uninstall: (target, receiptOwnership, context = {}) =>
      planVisualStudioUninstall(target, receiptOwnership, { ...defaultContext, ...context })
  };
}

export const createAdapter = createVisualStudioHostAdapter;

export async function detectVisualStudio({
  platform = process.platform,
  vswherePath,
  timeoutMs = 5_000,
  runVswhere
} = {}) {
  if (platform !== 'win32') return Object.freeze([]);
  if (typeof runVswhere !== 'function' || !vswherePath) {
    return Object.freeze([]);
  }

  const args = ['-products', '*', '-prerelease', '-format', 'json', '-utf8'];
  const response = await runVswhere(vswherePath, args, { timeoutMs });
  if (response?.exitCode !== 0) return Object.freeze([]);

  let instances;
  try {
    instances = JSON.parse(response.stdout);
  } catch {
    return Object.freeze([]);
  }

  const evidence = instances
    .filter(isUsableIdeInstance)
    .map((instance) => {
      const exactVersion = normalizeExactVersion(instance.installationVersion);
      return Object.freeze({
        hostId: HOST_ID,
        nativeIdentity: instance.productId,
        instanceId: instance.instanceId,
        exactVersion,
        semanticVersion: exactVersion.split('.').slice(0, 3).join('.'),
        platform,
        installationPath: path.resolve(instance.installationPath),
        prerelease: instance.isPrerelease === true,
        probeIdentity: 'vswhere-json-v1'
      });
    })
    .sort((left, right) => compareVersions(right.exactVersion, left.exactVersion));

  return Object.freeze(evidence);
}

export function evaluateVisualStudioCapabilities(hostEvidence, {
  platform = process.platform,
  scope = 'project',
  capabilityRows = [],
  evaluateCapability,
  allowFixtureRows = false
} = {}) {
  const version = hostEvidence?.semanticVersion;
  const result = {};

  for (const component of ['mcp', 'skill']) {
    if (typeof evaluateCapability === 'function') {
      const decision = evaluateCapability({
        host: HOST_ID,
        exactVersion: version,
        platform,
        component,
        scope
      });
      result[component] = Object.freeze(decision?.supportState === 'supported'
        ? {
            component,
            scope,
            supportState: 'supported',
            rowId: decision.rowId,
            relativePath: decision.relativePath,
            dialect: decision.dialect,
            fixtureRevision: decision.fixtureRevision,
            realHostEvidenceRevision: decision.realHostEvidenceRevision
          }
        : {
            component,
            scope,
            supportState: decision?.supportState === 'ambiguous' ? 'ambiguous' : 'unsupported',
            reason: decision?.reason ?? 'registry-capability-evidence-required'
          });
      continue;
    }
    const scopeRows = capabilityRows.filter((row) =>
      row.platform === platform
      && row.component === component
      && row.scope === scope
      && (allowFixtureRows === true
        || (row.supportState === 'supported' && typeof row.realHostEvidenceRevision === 'string'))
    );
    const row = scopeRows.find((candidate) => satisfiesRange(version, candidate.semanticVersionRange));
    if (row) {
      result[component] = Object.freeze({
        component,
        scope,
        supportState: 'supported',
        rowId: row.rowId,
        relativePath: row.relativePath,
        dialect: row.dialect,
        fixtureRevision: row.fixtureRevision
      });
      continue;
    }

    const hasComponentForAnotherScope = capabilityRows.some((candidate) =>
      candidate.platform === platform
      && candidate.component === component
      && candidate.scope !== scope
    );
    result[component] = Object.freeze({
      component,
      scope,
      supportState: 'unsupported',
      reason: hasComponentForAnotherScope ? 'scope-not-proven' : 'version-not-proven'
    });
  }

  return Object.freeze(result);
}

export function resolveVisualStudioTargets({
  hostEvidence,
  capabilities,
  scope = 'project',
  components = ['mcp', 'skill'],
  solutionRoot,
  launcherPath,
  buildIdentity
} = {}) {
  if (scope !== 'project') {
    throw adapterError('agent_scope_unsupported', 'Visual Studio user scope is not proven.');
  }
  const root = requireAbsolutePath(solutionRoot, 'solutionRoot');
  const absoluteLauncher = requireAbsolutePath(launcherPath, 'launcherPath');
  const requested = [...new Set(components)].sort((left, right) =>
    (COMPONENT_ORDER.get(left) ?? 99) - (COMPONENT_ORDER.get(right) ?? 99)
  );
  const targets = [];

  for (const component of requested) {
    const capability = capabilities?.[component];
    if (capability?.supportState !== 'supported') {
      throw adapterError(
        component === 'skill' ? 'agent_component_unsupported' : 'agent_scope_unsupported',
        `Visual Studio ${component} is not supported for ${scope} scope.`
      );
    }
    const targetPath = path.join(root, ...capability.relativePath.split('/'));
    if (component === 'mcp') {
      targets.push(Object.freeze({
        host: HOST_ID,
        hostEvidence,
        scope,
        component,
        path: targetPath,
        dialect: MCP_BOUNDARY,
        ownershipBoundary: MCP_BOUNDARY,
        desiredEntry: Object.freeze({
          type: 'stdio',
          command: absoluteLauncher,
          args: Object.freeze(['--build', buildIdentity])
        })
      }));
    } else {
      targets.push(Object.freeze({
        host: HOST_ID,
        hostEvidence,
        scope,
        component,
        path: targetPath,
        dialect: capability.dialect,
        ownershipBoundary: 'launchdeck-agent'
      }));
    }
  }

  return Object.freeze(targets);
}

export function inspectVisualStudioMcpConfig({
  configPath,
  target,
  receiptOwnership,
  fs
} = {}) {
  const io = requireFilesystem(fs);
  const resolvedPath = configPath === undefined
    ? requireTargetPath(target)
    : requireAbsolutePath(configPath, 'configPath');
  let document = {};
  let source = '';
  if (io.existsSync(resolvedPath)) {
    source = io.readFileSync(resolvedPath, 'utf8');
    try {
      document = JSON.parse(source);
    } catch (error) {
      throw adapterError('agent_config_ambiguous', `Visual Studio MCP JSON is malformed: ${error.message}`);
    }
  }
  if (document === null || Array.isArray(document) || typeof document !== 'object') {
    throw adapterError('agent_config_ambiguous', 'Visual Studio MCP JSON root must be an object.');
  }

  const existing = document.servers?.launchdeck;
  if (existing === undefined) {
    return Object.freeze({
      state: 'absent',
      ownership: 'absent',
      configPath: resolvedPath,
      source,
      document: structuredClone(document),
      target
    });
  }

  const liveDigest = digestJson(existing);
  const owned = receiptOwnership?.owned === true
    && receiptOwnership?.path === resolvedPath
    && receiptOwnership?.digest === liveDigest;
  const matchesDesired = deepEqual(existing, target?.desiredEntry);
  return Object.freeze({
    state: owned && matchesDesired ? 'current' : 'divergent',
    ownership: owned ? 'verified' : 'unproven',
    configPath: resolvedPath,
    source,
    document: structuredClone(document),
    existingEntry: structuredClone(existing),
    liveDigest,
    target
  });
}

export function planVisualStudioMcpMutation({ observation, target } = {}) {
  if (!observation || !target) {
    throw new TypeError('Visual Studio observation and target are required.');
  }
  if (observation.state === 'divergent') {
    throw adapterError('agent_target_conflict', 'A non-owned servers.launchdeck entry already exists.');
  }
  if (observation.state === 'current') {
    return Object.freeze({
      kind: 'no-op',
      ownershipBoundary: MCP_BOUNDARY,
      path: target.path,
      nextDocument: structuredClone(observation.document),
      preconditionDigest: digestText(observation.source)
    });
  }

  const nextDocument = structuredClone(observation.document);
  nextDocument.servers ??= {};
  nextDocument.servers.launchdeck = structuredClone(target.desiredEntry);
  return Object.freeze({
    kind: 'create',
    ownershipBoundary: MCP_BOUNDARY,
    path: target.path,
    nextDocument,
    rendered: `${JSON.stringify(nextDocument, null, 2)}\n`,
    preconditionDigest: digestText(observation.source),
    desiredEntryDigest: digestJson(target.desiredEntry)
  });
}

export function verifyVisualStudioTarget({
  target,
  expectedBuildIdentity,
  expectedRuntimeDigest,
  evidence = {}
} = {}) {
  const failure = verificationFailure(target, expectedBuildIdentity, expectedRuntimeDigest, evidence);
  if (failure) {
    return Object.freeze({ state: 'failed', ready: false, code: failure });
  }
  return Object.freeze({
    state: 'verified',
    ready: true,
    buildIdentity: expectedBuildIdentity,
    requiredHostActions: evidence.hostReloadRequired ? ['reload-visual-studio'] : []
  });
}

export function planVisualStudioUninstall(target, receiptOwnership, context = {}) {
  const observation = inspectVisualStudioMcpConfig({
    configPath: target.path,
    target,
    receiptOwnership,
    fs: context.fs
  });
  if (observation.ownership !== 'verified') {
    throw adapterError('agent_target_conflict', 'Visual Studio target is not owned by the selected receipt.');
  }
  const nextDocument = structuredClone(observation.document);
  delete nextDocument.servers.launchdeck;
  return Object.freeze({
    kind: 'remove',
    path: target.path,
    ownershipBoundary: MCP_BOUNDARY,
    nextDocument,
    rendered: `${JSON.stringify(nextDocument, null, 2)}\n`,
    preconditionDigest: digestText(observation.source)
  });
}

function verificationFailure(target, expectedBuildIdentity, expectedRuntimeDigest, evidence) {
  if (evidence.configOwnership !== 'verified') return 'agent_target_divergent';
  if (!evidence.launcherResolved || !path.isAbsolute(evidence.launcherPath ?? target?.desiredEntry?.command ?? '')) {
    return 'agent_launcher_unavailable';
  }
  if (!evidence.runtimeDigestVerified || evidence.runtimeDigest !== expectedRuntimeDigest) {
    return 'agent_runtime_digest_mismatch';
  }
  if (!evidence.mcpInitialize) return 'agent_mcp_initialize_failed';
  if (!evidence.launchdeckCapabilities) return 'agent_capabilities_unavailable';
  if (evidence.reportedBuildIdentity !== expectedBuildIdentity
    || evidence.receiptCandidateBuildIdentity !== expectedBuildIdentity) {
    return 'agent_build_identity_mismatch';
  }
  if (!evidence.receiptCandidateConsistent) return 'agent_receipt_candidate_mismatch';
  return null;
}

function backupTarget(action, context) {
  const fs = requireFilesystem(context.fs);
  const targetPath = path.resolve(action.path);
  const existed = fs.existsSync(targetPath);
  return {
    path: targetPath,
    existed,
    bytes: existed ? fs.readFileSync(targetPath) : null
  };
}

function applyMutation(action, context) {
  const fs = requireFilesystem(context.fs);
  const targetPath = path.resolve(action.path);
  const source = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
  if (action.preconditionDigest && digestText(source) !== action.preconditionDigest) {
    throw adapterError('agent_precondition_changed', 'Visual Studio MCP config changed after approval.');
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.launchdeck-${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, action.rendered, 'utf8');
  fs.renameSync(temporaryPath, targetPath);
  return { status: 'applied', path: targetPath, digest: digestText(action.rendered) };
}

function rollbackMutation(effect, backup, context) {
  const fs = requireFilesystem(context.fs);
  const targetPath = path.resolve(effect.path);
  if (backup.existed) {
    fs.writeFileSync(targetPath, backup.bytes);
  } else if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { force: true });
  }
  return { status: 'rolled-back', path: targetPath };
}

function isUsableIdeInstance(instance) {
  return instance?.isComplete === true
    && instance?.isLaunchable === true
    && !String(instance?.productId ?? '').endsWith('.BuildTools')
    && typeof instance?.installationPath === 'string'
    && typeof instance?.installationVersion === 'string';
}

function normalizeExactVersion(value) {
  const parts = String(value).split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    throw adapterError('agent_host_evidence_ambiguous', `Invalid Visual Studio version ${value}.`);
  }
  return parts.map((part) => String(Number(part))).join('.');
}

function satisfiesRange(version, expression) {
  if (!version || typeof expression !== 'string') return false;
  return expression.split(/\s+/).every((term) => {
    const match = term.match(/^(>=|>|<=|<|=)?(\d+(?:\.\d+){2})$/);
    if (!match) return false;
    const comparison = compareVersions(version, match[2]);
    return {
      '>=': comparison >= 0,
      '>': comparison > 0,
      '<=': comparison <= 0,
      '<': comparison < 0,
      '=': comparison === 0,
      undefined: comparison === 0
    }[match[1]];
  });
}

function compareVersions(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function firstEvidence(evidence) {
  return Array.isArray(evidence) ? evidence[0] : evidence;
}

function adapterError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function digestText(value) {
  return `sha256:${createHash('sha256').update(String(value ?? '')).digest('hex')}`;
}

function digestJson(value) {
  return digestText(JSON.stringify(canonicalJson(value)));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function deepEqual(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function requireValue(value, name) {
  if (!value) throw new TypeError(`${name} is required.`);
  return value;
}

function requireAbsolutePath(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0 || !path.isAbsolute(value)) {
    throw adapterError('agent_target_invalid', `An absolute Visual Studio ${name} is required.`);
  }
  return path.normalize(value);
}

function requireFilesystem(value) {
  if (!value
    || typeof value.existsSync !== 'function'
    || typeof value.readFileSync !== 'function') {
    throw adapterError('agent_effect_provider_required', 'An explicit filesystem effect provider is required.');
  }
  return value;
}

function requireTargetPath(target) {
  if (typeof target?.path !== 'string' || !path.isAbsolute(target.path)) {
    throw adapterError('agent_target_invalid', 'An absolute Visual Studio target path is required.');
  }
  return target.path;
}

export default createVisualStudioHostAdapter;
