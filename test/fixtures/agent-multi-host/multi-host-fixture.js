import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createHostRegistry,
  evaluateHostCapability,
  normalizeRegistryTargets
} from '../../../src/agent/hosts/index.js';
import { digestCanonical } from '../../../src/agent/digests.js';
import { createAgentLifecycleService } from '../../../src/agent/lifecycle-service.js';

export const BUILD_IDENTITY = `sha256:${'6'.repeat(64)}`;
export const OTHER_BUILD_IDENTITY = `sha256:${'7'.repeat(64)}`;

const PLATFORM = 'win32';
const RUNTIME_DIGEST = `sha256:${'8'.repeat(64)}`;
const SKILL_SOURCE = '---\nname: launchdeck-agent\n---\n';
const SKILL_BYTES = Buffer.from(SKILL_SOURCE);
const SKILL_DIGEST = digestCanonical({
  schemaVersion: 1,
  skillName: 'launchdeck-agent',
  files: [{
    path: 'SKILL.md',
    bytes: SKILL_BYTES.length,
    sha256: `sha256:${crypto.createHash('sha256').update(SKILL_BYTES).digest('hex')}`
  }]
});
const fixturePrefix = 'launchdeck-agent-multi-host-';

const hostEvidence = Object.freeze({
  codex: Object.freeze({
    host: 'codex',
    version: '0.96.0',
    exactVersion: '0.96.0',
    platform: PLATFORM,
    command: 'codex --version',
    status: 'detected',
    evidence: 'codex 0.96.0'
  }),
  'claude-code': Object.freeze({
    host: 'claude-code',
    version: '1.5.0',
    exactVersion: '1.5.0',
    platform: PLATFORM,
    command: 'claude --version',
    status: 'detected',
    evidence: 'claude 1.5.0'
  }),
  'github-copilot': Object.freeze({
    host: 'github-copilot',
    version: '1.4.2',
    exactVersion: '1.4.2',
    platform: PLATFORM,
    executable: 'copilot',
    status: 'detected',
    probeKind: 'structured-json',
    capabilities: { skill: true, mcp: true }
  }),
  'visual-studio': Object.freeze({
    host: 'visual-studio',
    hostId: 'visual-studio',
    nativeIdentity: 'Microsoft.VisualStudio.Product.Enterprise',
    instanceId: 'VS-18.5.0',
    exactVersion: '18.5.0.0',
    semanticVersion: '18.5.0',
    platform: PLATFORM,
    installationPath: 'C:/Program Files/Microsoft Visual Studio/18.5/Enterprise',
    prerelease: false,
    probeIdentity: 'vswhere-json-v1'
  })
});

export function createMultiHostFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), fixturePrefix));
  const projectRoot = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  const launchdeckHome = path.join(homeDir, '.launchdeck');
  const launcherPath = path.join(launchdeckHome, 'installer', 'launcher', 'v1', 'launchdeck-mcp.cmd');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  writeSkillSource(root);
  writeUnrelatedConfigs(projectRoot);
  if (options.collision === true) writeCollision(projectRoot);

  const registry = createAuthorityRegistry({
    projectRoot,
    homeDir,
    launchdeckHome,
    launcherPath
  });

  return {
    root,
    projectRoot,
    homeDir,
    registry,
    matrix: exactVersionMatrix(registry),
    snapshot() {
      return snapshotTree(projectRoot);
    },
    async setup(input = {}) {
      return setupMultiHost({
        registry,
        projectRoot,
        homeDir,
        launchdeckHome,
        launcherPath,
        selectedHosts: input.hosts ?? ['codex', 'claude-code', 'github-copilot', 'visual-studio'],
        components: input.components ?? ['skill', 'mcp'],
        buildByHost: input.buildByHost ?? {},
        buildIdentity: input.buildIdentity ?? BUILD_IDENTITY
      });
    },
    cleanup() {
      removeFixtureRoot(root);
    }
  };
}

export function exactVersionMatrix(registry = createAuthorityRegistry()) {
  return ['codex', 'claude-code', 'github-copilot', 'visual-studio'].map((host) => {
    const rows = ['skill', 'mcp'].map((component) => evaluateHostCapability(registry.matrix, {
      host,
      exactVersion: host === 'visual-studio' ? '18.5.0' : hostEvidence[host].exactVersion,
      platform: PLATFORM,
      component,
      scope: 'project'
    }));
    return {
      host,
      exactVersion: host === 'visual-studio' ? '18.5.0' : hostEvidence[host].exactVersion,
      capabilities: rows
        .filter((row) => row.supportState === 'supported')
        .map((row) => row.component),
      unsupported: rows
        .filter((row) => row.supportState !== 'supported')
        .map((row) => row.component),
      rows
    };
  });
}

async function setupMultiHost({
  registry,
  projectRoot,
  homeDir,
  launchdeckHome,
  launcherPath,
  selectedHosts,
  components,
  buildIdentity,
  buildByHost
}) {
  const before = snapshotTree(projectRoot);
  const authority = await authorityPlan({
    registry,
    projectRoot,
    homeDir,
    launchdeckHome,
    launcherPath,
    selectedHosts,
    components,
    buildIdentity,
    buildByHost
  });
  if (authority.outcome === 'refused') {
    return {
      ...authority,
      before,
      after: snapshotTree(projectRoot)
    };
  }

  const targets = authority.targets;
  const effects = [];
  for (const target of targets) {
    const previous = readText(target.path);
    const content = renderTarget(target, buildIdentity, previous, launcherPath);
    fs.mkdirSync(path.dirname(target.path), { recursive: true });
    fs.writeFileSync(target.path, content, 'utf8');
    effects.push({
      effectId: `effect_${target.targetId.replaceAll(':', '_')}`,
      targetId: target.targetId,
      path: target.path,
      beforeDigest: digestText(previous),
      afterDigest: digestText(content),
      effectCertainty: 'complete'
    });
  }

  const verificationEvidence = targets.map((target) => ({
    targetId: target.targetId,
    buildIdentity,
    observedDigest: digestText(readText(target.path)),
    verified: true,
    authority: 'synthetic-host-effect'
  }));
  return {
    outcome: 'succeeded',
    effectCertainty: 'complete',
    buildIdentity,
    receiptId: 'receipt_multi_host_000001',
    targets,
    effects,
    verificationEvidence,
    authority,
    before,
    after: snapshotTree(projectRoot),
    config: readConfigs(projectRoot)
  };
}

async function authorityPlan({
  registry,
  projectRoot,
  homeDir,
  launchdeckHome,
  launcherPath,
  selectedHosts,
  components,
  buildIdentity,
  buildByHost
}) {
  const acceptedComponentsByHost = new Map();
  const capabilityEvidence = [];
  const unsupportedEvidence = [];

  for (const host of selectedHosts) {
    const evidence = hostEvidence[host];
    if (!evidence) {
      return refusal('agent_host_unsupported', `Unsupported host: ${host}`);
    }
    const accepted = [];
    for (const component of components) {
      const decision = registry.evaluate({
        host,
        exactVersion: host === 'visual-studio' ? evidence.semanticVersion : evidence.exactVersion,
        platform: PLATFORM,
        component,
        scope: 'project'
      });
      capabilityEvidence.push(decision);
      if (decision.supportState === 'supported') {
        accepted.push(component);
      } else {
        unsupportedEvidence.push(decision);
        if (!(host === 'visual-studio' && component === 'skill')) {
          return refusal('agent_component_unsupported', `${host} does not support ${component}`, {
            authority: 'evaluateHostCapability',
            decision
          });
        }
      }
    }
    acceptedComponentsByHost.set(host, accepted);
  }

  const dryRuns = [];
  for (const host of selectedHosts) {
    const accepted = acceptedComponentsByHost.get(host) ?? [];
    if (accepted.length === 0) continue;
    const hostBuildIdentity = buildByHost[host] ?? buildIdentity;
    const service = createAgentLifecycleService({
      registry,
      env: fixtureEnv({ homeDir, launchdeckHome }),
      clock: () => new Date('2026-07-23T00:00:00.000Z')
    });
    const envelope = await service.setup({
      scope: 'project',
      projectRoot,
      homeDir,
      hosts: [host],
      components: accepted,
      desiredBuildIdentity: hostBuildIdentity,
      packagedBuildIdentity: hostBuildIdentity,
      sourceIdentity: 'packaged',
      dryRun: true,
      yes: true,
      json: true,
      interactive: false,
      platform: PLATFORM
    });
    const result = envelope.result ?? envelope;
    dryRuns.push({ host, result });
    if (result.outcome === 'refused') {
      return refusal(result.error?.code ?? 'agent_setup_refused', result.error?.message ?? 'Setup refused.', {
        authority: 'createAgentLifecycleService.setup',
        host,
        result
      });
    }
  }

  const plannedBuilds = dryRuns.map((entry) => entry.result.buildIdentity).filter(Boolean);
  if (new Set(plannedBuilds).size !== 1) {
    return refusal('agent_mixed_build_identity_refused', 'All selected hosts must install one build identity.', {
      authority: 'createAgentLifecycleService.setup',
      plannedBuilds
    });
  }

  const normalized = normalizeAuthorityTargets({
    registry,
    projectRoot,
    selectedHosts,
    acceptedComponentsByHost,
    buildIdentity,
    launcherPath
  });
  if (normalized.status === 'refused') {
    return refusal(`agent_${normalized.code}`, 'Production registry target normalization refused.', {
      authority: 'normalizeRegistryTargets',
      normalized
    });
  }

  return {
    outcome: 'planned',
    effectCertainty: 'none',
    authority: {
      capabilityEvidence,
      unsupportedEvidence,
      dryRuns: dryRuns.map(({ host, result }) => ({
        host,
        outcome: result.outcome,
        buildIdentity: result.buildIdentity,
        planDigest: result.planDigest,
        targetIds: result.targetIds ?? result.targets?.map((target) => target.targetId) ?? []
      })),
      targetNormalization: 'normalizeRegistryTargets'
    },
    targets: normalized.targets
  };
}

function normalizeAuthorityTargets({
  registry,
  projectRoot,
  selectedHosts,
  acceptedComponentsByHost,
  buildIdentity,
  launcherPath
}) {
  const targetInputs = [];
  const has = (host, component) =>
    selectedHosts.includes(host) && (acceptedComponentsByHost.get(host) ?? []).includes(component);

  if (has('codex', 'skill')) {
    targetInputs.push(skillTarget('codex', path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent')));
  }
  if (has('github-copilot', 'skill')) {
    targetInputs.push(skillTarget('github-copilot', path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent')));
  }
  if (has('claude-code', 'skill')) {
    targetInputs.push(skillTarget('claude-code', path.join(projectRoot, '.claude', 'skills', 'launchdeck-agent')));
  }
  if (has('codex', 'mcp')) {
    targetInputs.push(mcpTarget('codex', path.join(projectRoot, '.codex', 'config.toml'), '[mcp_servers.launchdeck]'));
  }
  if (has('visual-studio', 'mcp')) {
    targetInputs.push(mcpTarget('visual-studio', path.join(projectRoot, '.vs', 'mcp.json'), 'servers.launchdeck'));
  }
  if (has('claude-code', 'mcp') && has('github-copilot', 'mcp')) {
    const entryDigest = digestText(`${launcherPath}:${buildIdentity}`);
    const eligibility = registry.evaluateCoexistence({
      platform: PLATFORM,
      scope: 'project',
      hosts: [
        coexistenceHost('claude-code', buildIdentity, entryDigest, launcherPath),
        coexistenceHost('github-copilot', buildIdentity, entryDigest, launcherPath)
      ]
    });
    targetInputs.push(mcpTarget('claude-code', path.join(projectRoot, '.mcp.json'), 'mcpServers.launchdeck', {
      exactVersion: '1.5.0',
      buildIdentity,
      entryDigest,
      launcherPath
    }));
    targetInputs.push(mcpTarget('github-copilot', path.join(projectRoot, '.mcp.json'), 'mcpServers.launchdeck', {
      exactVersion: '1.4.2',
      buildIdentity,
      entryDigest,
      launcherPath
    }));
    return finishTargetNormalization(registry.normalizeTargets(targetInputs, { eligibility }));
  }
  if (has('claude-code', 'mcp')) {
    targetInputs.push(mcpTarget('claude-code', path.join(projectRoot, '.mcp.json'), 'mcpServers.launchdeck'));
  }
  if (has('github-copilot', 'mcp')) {
    targetInputs.push(mcpTarget('github-copilot', path.join(projectRoot, '.github', 'mcp.json'), 'mcpServers.launchdeck'));
  }

  return finishTargetNormalization(normalizeRegistryTargets(targetInputs));
}

function finishTargetNormalization(result) {
  if (result.status === 'refused') return result;
  return {
    status: 'resolved',
    targets: result.targets.map((target) => {
      if (target.host === 'shared' && target.component === 'skill') {
        return targetForAssertion(target, {
          targetId: 'codex:project:skill',
          rootKind: 'canonical-shared-skill'
        });
      }
      if (target.host === 'shared' && target.component === 'mcp') {
        return targetForAssertion(target, {
          targetId: 'claude-code:project:mcp',
          rootKind: 'proven-shared-mcp-root'
        });
      }
      return targetForAssertion(target, {
        targetId: `${target.host}:project:${target.component}`,
        rootKind: rootKindFor(target)
      });
    }).sort((left, right) => left.targetId.localeCompare(right.targetId))
  };
}

function targetForAssertion(target, overrides) {
  return {
    ...target,
    ...overrides,
    hostId: String(overrides.targetId).split(':')[0],
    scope: 'project',
    ownership: 'launchdeck-owned',
    desiredDigest: digestText(`${overrides.targetId}:${target.path}:${target.buildIdentity ?? BUILD_IDENTITY}`)
  };
}

function createAuthorityRegistry({ projectRoot, homeDir, launchdeckHome, launcherPath } = {}) {
  const root = projectRoot ?? path.resolve('project');
  const home = homeDir ?? path.resolve('home');
  const launchHome = launchdeckHome ?? path.join(home, '.launchdeck');
  const launcher = launcherPath ?? path.join(launchHome, 'installer', 'launcher', 'v1', 'launchdeck-mcp.cmd');
  const registry = createHostRegistry({
    matrix: protocolMatrix(),
    adapterOptions: {
      codex: {
        fs,
        probes: { version: 'codex 0.96.0', mcpList: { servers: [] } },
        trust: { project: true },
        homeDir: home,
        launchdeckHome: launchHome,
        launcherPath: launcher,
        skillDigest: SKILL_DIGEST
      },
      'claude-code': {
        fs,
        probes: {
          version: 'claude 1.5.0',
          mcpList: { command: 'claude mcp list', trust: 'approved', entries: [] }
        },
        trust: { project: true, approval: true },
        verifyRuntime: syntheticRuntimeVerifier,
        backupTarget: syntheticBackup,
        applyAction: syntheticApply,
        rollbackAction: syntheticRollback
      },
      'github-copilot': {
        probe: async () => ({
          exitCode: 0,
          timedOut: false,
          stdout: JSON.stringify({
            name: 'GitHub Copilot CLI',
            version: '1.4.2',
            capabilities: { skill: true, mcp: true }
          }),
          stderr: ''
        }),
        fileExists: async (filePath) => fs.existsSync(filePath),
        readTextFile: async (filePath) => fs.readFileSync(filePath, 'utf8'),
        inspectSkill: async (target) => ({
          status: fs.existsSync(target.path) ? 'present' : 'absent',
          contentDigest: fs.existsSync(target.path) ? SKILL_DIGEST : null
        }),
        verifyRuntime: syntheticRuntimeVerifier,
        backupTarget: syntheticBackup,
        applyAction: syntheticApply,
        rollbackAction: syntheticRollback
      },
      'visual-studio': {
        fs,
        platform: PLATFORM,
        vswherePath: path.join(home, 'bin', 'vswhere.exe'),
        solutionRoot: root,
        projectRoot: root,
        homeDir: home,
        launcherPath: launcher,
        buildIdentity: BUILD_IDENTITY,
        runVswhere: async () => ({
          exitCode: 0,
          stdout: JSON.stringify([{
            instanceId: 'VS-18.5.0',
            productId: 'Microsoft.VisualStudio.Product.Enterprise',
            installationVersion: '18.5.0.0',
            installationPath: path.join(home, 'VisualStudio', '18.5'),
            isComplete: true,
            isLaunchable: true,
            isPrerelease: false
          }])
        })
      }
    }
  });

  return wrapRegistry(registry, {
    projectRoot: root,
    homeDir: home,
    launchdeckHome: launchHome,
    launcherPath: launcher
  });
}

function wrapRegistry(registry, context) {
  const proxies = new Map(registry.list().map((registration) => [
    registration.id,
    wrapAdapter(registration.id, registration.adapter, context)
  ]));
  return {
    matrix: registry.matrix,
    list: () => registry.list(),
    listHosts: () => registry.list().map((registration) => registration.id).sort(),
    get: (host) => proxies.get(host) ?? null,
    adapterFor: (host) => proxies.get(host) ?? null,
    evaluate: (request) => registry.evaluate(request),
    evaluateCoexistence: (request) => registry.evaluateCoexistence(request),
    normalizeTargets: (targets, options) => registry.normalizeTargets(targets, options)
  };
}

function wrapAdapter(host, adapter, context) {
  const managedByTargetId = new Map();
  return {
    id: host,
    detect: (input = {}) => adapter.detect({ ...contextForHost(host, context), ...input, platform: PLATFORM }),
    async capabilities(evidence, scope, input = {}) {
      const capabilities = await adapter.capabilities(evidence, scope, { ...contextForHost(host, context), ...input, platform: PLATFORM });
      return Array.isArray(capabilities) ? capabilities : Object.values(capabilities ?? {});
    },
    async resolveTargets(input = {}) {
      const targets = await adapter.resolveTargets({
        ...contextForHost(host, context),
        ...input,
        platform: PLATFORM
      });
      if (targets?.kind === 'refusal') return targets;
      return targets.map((target) => ({
        ...target,
        ...rememberManagedTarget(managedByTargetId, host, target)
      }));
    },
    async plan(target, desired = {}) {
      try {
        const managedTarget = managedByTargetId.get(target.targetId) ?? target;
        const enriched = desiredBuildFor(host, target, desired, context);
        const planned = await adapter.plan(managedTarget, enriched, contextForHost(host, context));
        if (planned?.kind === 'refusal' || planned?.status === 'refused') return planned;
        const actions = (planned.actions ?? []).map((action, index) =>
          canonicalAction({ host, target, action, index, planned }));
        return {
          status: actions.length === 0 ? 'no-op' : 'planned',
          actions
        };
      } catch (error) {
        return {
          status: 'refused',
          code: error?.code ?? 'host_operation_refused',
          message: error?.message ?? 'Host planning refused.',
          actions: []
        };
      }
    },
    async inspect(target, input = {}) {
      return adapter.inspect(managedByTargetId.get(target.targetId) ?? target, { ...contextForHost(host, context), ...input });
    },
    async apply(action) {
      return syntheticApply({ host, action });
    },
    async rollback(effect, backupRef) {
      return syntheticRollback({ host, effect, backup: backupRef });
    },
    async verify(target, desired = {}) {
      return {
        status: 'ready',
        ready: true,
        buildIdentity: desiredBuildFor(host, target, desired, context).buildIdentity,
        checks: [{ code: 'synthetic-external-host-effect', status: 'pass' }]
      };
    },
    async uninstall(target, receiptOwnership, input = {}) {
      return adapter.uninstall(managedByTargetId.get(target.targetId) ?? target, receiptOwnership, { ...contextForHost(host, context), ...input });
    }
  };
}

function rememberManagedTarget(managedByTargetId, host, target) {
  const targetId = `${host}:project:${target.component}`;
  managedByTargetId.set(targetId, target);
  return {
    targetId,
    hostId: host,
    ownershipBoundary: target.ownershipBoundary ?? target.dialect ?? (target.component === 'skill' ? 'launchdeck-agent' : 'mcpServers.launchdeck'),
    ownership: 'launchdeck-owned'
  };
}

function desiredBuildFor(host, target, desired, context) {
  const buildIdentity = desired.buildIdentity ?? BUILD_IDENTITY;
  const mcpEntry = {
    command: context.launcherPath,
    args: ['serve', '--build', buildIdentity],
    env: {
      LAUNCHDECK_HOME: context.launchdeckHome,
      LAUNCHDECK_BUILD_ID: buildIdentity,
      LAUNCHDECK_MANAGED_BY: 'launchdeck-agent-installer'
    }
  };
  if (host === 'visual-studio') {
    return {
      buildIdentity,
      runtimeDigest: RUNTIME_DIGEST,
      mcpEntry: target.desiredEntry ?? {
        type: 'stdio',
        command: context.launcherPath,
        args: ['--build', buildIdentity]
      }
    };
  }
  return {
    buildIdentity,
    runtimeDigest: RUNTIME_DIGEST,
    launcherPath: context.launcherPath,
    launchdeckHome: context.launchdeckHome,
    skillSource: path.join(path.dirname(context.projectRoot), 'payload', 'launchdeck-agent'),
    skillDigest: SKILL_DIGEST,
    skill: {
      sourceDir: path.join(path.dirname(context.projectRoot), 'payload', 'launchdeck-agent'),
      contentDigest: SKILL_DIGEST,
      path: target.component === 'skill' ? target.path : undefined
    },
    mcpEntry
  };
}

function canonicalAction({ host, target, action, index, planned }) {
  const targetPath = path.resolve(action.path ?? action.targetPath ?? planned.path ?? target.path);
  const preconditionDigest = action.preconditionDigest ?? planned.preconditionDigest ?? digestText(readText(targetPath));
  const desiredDigest = action.desiredDigest
    ?? action.contentDigest
    ?? planned.desiredDigest
    ?? planned.desiredEntryDigest
    ?? digestText(`${host}:${target.targetId}:${targetPath}:${index}:${BUILD_IDENTITY}`);
  return {
    actionId: `${host}_${target.component}_${index + 1}`,
    kind: action.kind ?? action.type ?? planned.kind ?? 'write-target',
    targetId: target.targetId,
    ownershipBoundary: action.ownershipBoundary ?? planned.ownershipBoundary ?? target.ownershipBoundary,
    targetPath,
    preconditionDigest,
    desiredDigest,
    requiresBackup: false
  };
}

function contextForHost(host, context) {
  const common = {
    ...context,
    fs,
    platform: PLATFORM,
    trust: { project: true, approval: true },
    runtimeDigest: RUNTIME_DIGEST,
    evidence: runtimeEvidence(context),
    runtimeEvidence: runtimeEvidence(context)
  };
  if (host === 'visual-studio') {
    return {
      ...common,
      vswherePath: path.join(context.homeDir, 'bin', 'vswhere.exe'),
      solutionRoot: context.projectRoot,
      expectedRuntimeDigest: RUNTIME_DIGEST
    };
  }
  return common;
}

function protocolMatrix() {
  return {
    schemaVersion: 1,
    revision: 'pb-010-t038-synthetic-exact-v1',
    rows: [
      exactRow('codex', '0.96.0', 'skill', '.agents/skills/launchdeck-agent', 'skill-directory', 'codex --version', 'none'),
      exactRow('codex', '0.96.0', 'mcp', '.codex/config.toml', '[mcp_servers.launchdeck]', 'codex mcp list', 'project-trust'),
      exactRow('claude-code', '1.5.0', 'skill', '.claude/skills/launchdeck-agent', 'skill-directory', 'claude --version', 'none'),
      exactRow('claude-code', '1.5.0', 'mcp', '.mcp.json', 'mcpServers.launchdeck', 'claude mcp list', 'project-trust-and-host-approval'),
      exactRow('github-copilot', '1.4.2', 'skill', '.agents/skills/launchdeck-agent', 'skill-directory', 'copilot --version --json', 'none'),
      exactRow('github-copilot', '1.4.2', 'mcp', '.github/mcp.json', 'mcpServers.launchdeck', 'copilot --version --json', 'project-trust'),
      exactRow('visual-studio', '18.5.0', 'mcp', '.vs/mcp.json', 'servers.launchdeck', 'vswhere -format json', 'ide-reload')
    ],
    sharedMcpCoexistence: {
      enabled: true,
      revision: 'pb-010-t038-shared-mcp-v1',
      provenPairs: [{
        pairId: 'claude-1.5.0-copilot-1.4.2-win32-project',
        platform: PLATFORM,
        scope: 'project',
        claudeVersion: '1.5.0',
        copilotVersion: '1.4.2',
        configPath: '.mcp.json',
        dialect: 'mcpServers.launchdeck',
        fixtureRevision: 'pb-010-t038-fixture-v1',
        realHostEvidenceRevision: 'synthetic-exact-provider-v1',
        evidenceRevision: 'synthetic-shared-mcp-v1'
      }]
    }
  };
}

function exactRow(host, exactVersion, component, relativePath, dialect, probe, approvalBoundary) {
  return {
    rowId: `${host}-${exactVersion}-${PLATFORM}-${component}-project`,
    host,
    exactVersion,
    platform: PLATFORM,
    component,
    scope: 'project',
    relativePath,
    dialect,
    probe,
    approvalBoundary,
    fixtureRevision: 'pb-010-t038-fixture-v1',
    realHostEvidenceRevision: 'synthetic-exact-provider-v1'
  };
}

function skillTarget(host, targetPath) {
  return {
    host,
    exactVersion: hostEvidence[host].exactVersion,
    component: 'skill',
    scope: 'project',
    path: targetPath,
    contentDigest: SKILL_DIGEST,
    ownershipBoundary: 'launchdeck-agent'
  };
}

function mcpTarget(host, targetPath, ownershipBoundary, extra = {}) {
  return {
    host,
    exactVersion: host === 'visual-studio' ? '18.5.0' : hostEvidence[host].exactVersion,
    component: 'mcp',
    scope: 'project',
    path: targetPath,
    ownershipBoundary,
    ...extra
  };
}

function coexistenceHost(host, buildIdentity, entryDigest, launcherPath) {
  return {
    host,
    exactVersion: hostEvidence[host].exactVersion,
    buildIdentity,
    entryDigest,
    launcherPath
  };
}

function rootKindFor(target) {
  if (target.component === 'skill' && target.host === 'claude-code') return 'native-claude-skill';
  if (target.component === 'skill') return 'native-skill-root';
  return 'native-mcp-root';
}

function renderTarget(target, buildIdentity, previous, launcherPath) {
  if (target.component === 'skill') {
    return [
      'managedBy=launchdeck-agent-installer',
      `hosts=${(target.hosts ?? [target.host]).join(',')}`,
      `buildIdentity=${buildIdentity}`,
      ''
    ].join('\n');
  }
  if (String(target.path).endsWith('config.toml')) {
    const preserved = previous.trim() ? `${previous.trimEnd()}\n` : '';
    return [
      preserved,
      '[mcp_servers.launchdeck]',
      `command = "${escapeToml(launcherPath)}"`,
      `args = ["serve", "--build", "${buildIdentity}"]`,
      ''
    ].join('\n');
  }
  const preserved = parsePreservedJson(previous);
  const server = target.ownershipBoundary === 'servers.launchdeck'
    ? { type: 'stdio', command: launcherPath, args: ['--build', buildIdentity] }
    : { command: launcherPath, args: ['serve', '--build', buildIdentity], managedBy: 'launchdeck-agent-installer' };
  if (target.ownershipBoundary === 'servers.launchdeck') {
    preserved.servers ??= {};
    preserved.servers.launchdeck = server;
  } else {
    preserved.mcpServers ??= {};
    preserved.mcpServers.launchdeck = server;
  }
  return `${JSON.stringify(preserved, null, 2)}\n`;
}

function writeUnrelatedConfigs(projectRoot) {
  writeJson(path.join(projectRoot, '.mcp.json'), {
    metadata: { owner: 'user' },
    mcpServers: { keep: { command: 'keep-shared' } }
  });
  writeJson(path.join(projectRoot, '.github', 'mcp.json'), {
    mcpServers: { keep: { command: 'keep-copilot' } }
  });
  writeJson(path.join(projectRoot, '.vs', 'mcp.json'), {
    servers: { keep: { command: 'keep-vs' } }
  });
  fs.mkdirSync(path.join(projectRoot, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, '.codex', 'config.toml'), 'unrelated = "keep-codex"\n', 'utf8');
}

function writeCollision(projectRoot) {
  writeJson(path.join(projectRoot, '.github', 'mcp.json'), {
    mcpServers: {
      keep: { command: 'keep-copilot' },
      launchdeck: { command: 'foreign-launchdeck' }
    }
  });
}

function writeSkillSource(root) {
  const sourceRoot = path.join(root, 'payload', 'launchdeck-agent');
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'SKILL.md'), SKILL_SOURCE, 'utf8');
}

function readConfigs(projectRoot) {
  return {
    shared: parsePreservedJson(readText(path.join(projectRoot, '.mcp.json'))),
    copilot: parsePreservedJson(readText(path.join(projectRoot, '.github', 'mcp.json'))),
    visualStudio: parsePreservedJson(readText(path.join(projectRoot, '.vs', 'mcp.json'))),
    codex: readText(path.join(projectRoot, '.codex', 'config.toml'))
  };
}

function refusal(code, message, details = {}) {
  return {
    outcome: 'refused',
    effectCertainty: 'none',
    buildIdentity: null,
    receiptId: null,
    targets: [],
    effects: [],
    verificationEvidence: [],
    error: { code, message, details }
  };
}

function syntheticBackup({ action }) {
  const targetPath = path.resolve(action.path ?? action.targetPath);
  return {
    path: targetPath,
    existed: fs.existsSync(targetPath),
    bytes: fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null
  };
}

function syntheticApply({ host, action }) {
  const targetPath = path.resolve(action.path ?? action.targetPath);
  const previous = readText(targetPath);
  const next = action.content ?? action.source ?? action.rendered ?? `${host}:${action.actionId}`;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, next, 'utf8');
  return {
    effectId: `effect_${action.actionId}`,
    actionId: action.actionId,
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    effectType: action.kind ?? action.type ?? 'write-target',
    beforeDigest: action.preconditionDigest ?? digestText(previous),
    afterDigest: action.desiredDigest ?? digestText(next),
    effectCertainty: 'complete'
  };
}

function syntheticRollback({ effect, backup }) {
  const targetPath = path.resolve(effect.path ?? effect.targetPath ?? backup?.path ?? '.');
  if (backup?.existed) {
    fs.writeFileSync(targetPath, backup.bytes);
  } else if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { force: true });
  }
  return {
    actionId: effect.actionId,
    targetId: effect.targetId,
    restored: true,
    restoredDigest: effect.beforeDigest,
    verified: true
  };
}

async function syntheticRuntimeVerifier({ buildIdentity }) {
  return {
    launcher: { absolute: true, stable: true },
    runtimeDigestVerified: true,
    runtimeDigest: RUNTIME_DIGEST,
    initialize: { ok: true },
    capability: { ok: true, name: 'launchdeck/status' },
    buildIdentity,
    receiptCandidateConsistent: true,
    receiptCandidateBuildIdentity: buildIdentity
  };
}

function runtimeEvidence(context) {
  return {
    configOwnership: 'verified',
    liveEntryDigestMatches: true,
    skillDigestVerified: true,
    launcherResolved: true,
    launcherPath: context.launcherPath,
    runtimeDigestVerified: true,
    runtimeDigest: RUNTIME_DIGEST,
    mcpInitialize: true,
    launchdeckCapabilities: true,
    reportedBuildIdentity: BUILD_IDENTITY,
    receiptCandidateConsistent: true,
    receiptCandidateBuildIdentity: BUILD_IDENTITY,
    launchdeckHomeForwarded: context.launchdeckHome
  };
}

function fixtureEnv({ homeDir, launchdeckHome }) {
  return {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    LAUNCHDECK_HOME: launchdeckHome
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function parsePreservedJson(text) {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function snapshotTree(root) {
  const snapshot = {};
  walk(root, root, snapshot);
  return snapshot;
}

function walk(root, current, snapshot) {
  if (!fs.existsSync(current)) return;
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(current, entry.name);
    const key = path.relative(root, absolute).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      snapshot[`${key}/`] = 'directory';
      walk(root, absolute, snapshot);
    } else if (entry.isFile()) {
      snapshot[key] = digestText(fs.readFileSync(absolute));
    }
  }
}

function digestText(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function escapeToml(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function removeFixtureRoot(root) {
  const resolved = path.resolve(root);
  const relative = path.relative(path.resolve(os.tmpdir()), resolved);
  if (
    relative === ''
    || relative.startsWith('..')
    || path.isAbsolute(relative)
    || !path.basename(resolved).startsWith(fixturePrefix)
  ) {
    throw new Error(`Refusing to remove non-agent-multi-host fixture: ${root}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}
