import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..', '..');
const desiredInstallationModuleUrl = pathToFileURL(
  path.join(repoRoot, 'src', 'agent', 'planner', 'desired-installation.js')
).href;

test('planner desired-state module exports the planned discovery and selection surface', async () => {
  const mod = await loadDesiredInstallationModule();

  assert.equal(typeof mod.discoverDesiredInstallation, 'function');
  assert.equal(typeof mod.normalizeDesiredInstallationSelection, 'function');
  assert.equal(typeof mod.refuseDesiredInstallation, 'function');
});

test('normalization defaults to exact project scope and requires explicit user scope', async (t) => {
  const workspace = createWorkspace(t, 'scope-default');
  const { normalizeDesiredInstallationSelection } = await loadDesiredInstallationModule();

  const desired = await normalizeDesiredInstallationSelection({
    operation: 'setup',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    host: ['codex'],
    component: ['skill', 'mcp'],
    build: BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    dryRun: false,
    yes: true,
    interactive: false
  });

  assert.equal(desired.scope, 'project');
  assert.match(desired.scopeIdentity, /^project:sha256:[0-9a-f]{64}$/);
  assert.equal(desired.projectIdentity, workspace.projectRoot);
  assert.deepEqual(desired.hostIds, ['codex']);
  assert.deepEqual(desired.components, ['mcp', 'skill']);
  assert.equal(desired.desiredBuildIdentity, BUILD_IDENTITY);
  assert.equal(desired.requestedBuildSelector, BUILD_IDENTITY);
  assert.match(desired.inputDigest, /^sha256:[0-9a-f]{64}$/);

  const packaged = await normalizeDesiredInstallationSelection({
    operation: 'setup',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    host: ['codex'],
    component: ['skill'],
    build: 'packaged',
    packagedBuildIdentity: BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    dryRun: false,
    yes: true,
    interactive: false
  });

  assert.equal(packaged.requestedBuildSelector, 'packaged');
  assert.equal(packaged.desiredBuildIdentity, BUILD_IDENTITY);

  await assert.rejects(
    () => normalizeDesiredInstallationSelection({
      operation: 'setup',
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      scope: 'project,user',
      host: ['codex'],
      component: ['skill'],
      build: BUILD_IDENTITY,
      sourceIdentity: 'packaged',
      dryRun: false,
      yes: true,
      interactive: false
    }),
    errorWithCode('agent_scope_ambiguous')
  );

  await assert.rejects(
    () => normalizeDesiredInstallationSelection({
      operation: 'setup',
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      scope: 'user',
      project: workspace.projectRoot,
      host: ['codex'],
      component: ['skill'],
      build: BUILD_IDENTITY,
      sourceIdentity: 'packaged',
      dryRun: false,
      yes: true,
      interactive: false
    }),
    errorWithCode('agent_project_identity_forbidden')
  );
});

test('automation refuses ambiguous host or component discovery instead of falling back', async (t) => {
  const workspace = createWorkspace(t, 'ambiguous-discovery');
  const registry = createRegistry({
    codex: supportedHost('codex', ['skill', 'mcp']),
    claude: supportedHost('claude', ['skill', 'mcp'])
  });
  const { discoverDesiredInstallation } = await loadDesiredInstallationModule();

  const result = await discoverDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    components: ['skill'],
    desiredBuildIdentity: BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    interactive: false,
    registry
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.effectCertainty, 'none');
  assert.equal(result.error.code, 'agent_selection_ambiguous');
  assert.match(result.error.message, /host/i);
  assert.deepEqual(result.effects, []);
  assert.equal(registry.calls.resolveTargets, 0);
  assert.equal(registry.calls.plan, 0);
  assert.equal(workspace.launchdeckConfigExists(), false);
});

test('explicit-selection setup refuses omitted host component or scope without discovery', async (t) => {
  const workspace = createWorkspace(t, 'explicit-selection');
  const registry = createRegistry({
    codex: supportedHost('codex', ['skill'])
  });
  const { discoverDesiredInstallation } = await loadDesiredInstallationModule();

  const result = await discoverDesiredInstallation({
    operation: 'setup',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    desiredBuildIdentity: BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    interactive: false,
    requireExplicitSelection: true,
    registry
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.error.code, 'agent_component_selection_required');
  assert.equal(registry.calls.detect, 0);
  assert.equal(registry.calls.resolveTargets, 0);
});

test('explicit-selection setup reports a dedicated missing-component refusal', async (t) => {
  const workspace = createWorkspace(t, 'explicit-component-selection');
  const registry = createRegistry({
    codex: supportedHost('codex', ['skill'])
  });
  const { discoverDesiredInstallation } = await loadDesiredInstallationModule();

  const result = await discoverDesiredInstallation({
    operation: 'setup',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    hosts: ['codex'],
    scope: 'project',
    desiredBuildIdentity: BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    interactive: false,
    requireExplicitSelection: true,
    registry
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.error.code, 'agent_component_selection_required');
  assert.equal(registry.calls.detect, 0);
  assert.equal(registry.calls.resolveTargets, 0);
});

test('receipt-bounded uninstall preserves operation and calls adapter uninstall only', async (t) => {
  const workspace = createWorkspace(t, 'uninstall-operation');
  const calls = [];
  const receiptTarget = {
    targetId: 'codex:project:skill',
    hostId: 'codex',
    scope: 'project',
    component: 'skill',
    path: path.join(workspace.projectRoot, 'codex', 'skill'),
    desiredDigest: BUILD_IDENTITY,
    ownership: 'launchdeck'
  };
  const host = supportedHost('codex', ['skill']);
  host.resolveTargets = () => [{ ...receiptTarget }];
  const registry = createRegistry({ codex: host });
  registry.adapterFor = (hostId) => {
    const adapter = createRegistry({ [hostId]: host }).adapterFor(hostId);
    return {
      ...adapter,
      async inspect(target) {
        return { ...target, exists: true, liveDigest: BUILD_IDENTITY, ownership: 'launchdeck' };
      },
      async plan() {
        calls.push('plan');
        throw new Error('uninstall must not call setup planning');
      },
      async uninstall(target, ownership) {
        calls.push({ operation: 'uninstall', target, ownership });
        return {
          status: 'planned',
          actions: [{
            actionId: 'remove-codex-skill',
            targetId: target.targetId,
            kind: 'remove-owned-skill',
            targetPath: target.path,
            ownershipBoundary: 'launchdeck-agent',
            preconditionDigest: BUILD_IDENTITY,
            desiredDigest: `sha256:${'0'.repeat(64)}`
          }]
        };
      }
    };
  };
  const { discoverDesiredInstallation } = await loadDesiredInstallationModule();

  const result = await discoverDesiredInstallation({
    operation: 'uninstall',
    scope: 'project',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    desiredBuildIdentity: BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    targets: [receiptTarget],
    registry
  });

  assert.equal(result.outcome, 'planned');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, 'uninstall');
  assert.equal(calls[0].target.targetId, receiptTarget.targetId);
  assert.equal(calls[0].ownership.owned, true);
});

test('setup expands an existing receipt additively and retains previously owned targets', async (t) => {
  const workspace = createWorkspace(t, 'setup-receipt-expansion');
  const receiptTarget = {
    targetId: 'codex:project:skill',
    ownershipBoundary: 'launchdeck-agent',
    desiredDigest: BUILD_IDENTITY
  };
  const receipt = {
    receiptId: 'receipt_existing_setup_expansion',
    buildIdentity: BUILD_IDENTITY,
    targets: [receiptTarget]
  };
  const codex = supportedHost('codex', ['skill']);
  codex.plan = () => ({
    status: 'noop',
    desiredDigest: BUILD_IDENTITY,
    actions: []
  });
  const registry = createRegistry({
    codex,
    'claude-code': supportedHost('claude-code', ['skill'])
  });
  const { discoverDesiredInstallation } = await loadDesiredInstallationModule();

  const result = await discoverDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    hosts: ['claude-code'],
    components: ['skill'],
    desiredBuildIdentity: BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    interactive: true,
    requireExplicitSelection: true,
    receipt,
    targets: receipt.targets,
    registry
  });

  assert.equal(result.outcome, 'planned');
  assert.deepEqual(result.targetIds, [
    'claude-code:project:skill',
    'codex:project:skill'
  ]);
  assert.deepEqual(result.actions.map((action) => action.kind).sort(), [
    'copy-skill',
    'retain-owned-target'
  ]);
  assert.equal(result.supersedesReceiptId, receipt.receiptId);
});

test('runtime provisioning bypasses Host capabilities while ambiguous Host evidence still refuses', async (t) => {
  const workspace = createWorkspace(t, 'unsupported-evidence');
  const registry = createRegistry({
    codex: unsupportedHost('codex', 'runtime'),
    copilot: ambiguousHost('copilot', 'mcp')
  });
  const { discoverDesiredInstallation } = await loadDesiredInstallationModule();

  const unsupported = await discoverDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    hosts: ['codex'],
    components: ['runtime'],
    desiredBuildIdentity: PACKAGED_BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    interactive: false,
    registry
  });
  const ambiguous = await discoverDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    hosts: ['copilot'],
    components: ['mcp'],
    desiredBuildIdentity: BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    interactive: false,
    registry
  });

  assert.equal(unsupported.outcome, 'planned');
  assert.equal(unsupported.includeLauncher, true);
  assert.deepEqual(unsupported.targets.map((target) => target.component), ['runtime']);
  assert.deepEqual(unsupported.effects, []);
  assert.equal(ambiguous.outcome, 'refused');
  assert.equal(ambiguous.error.code, 'agent_host_evidence_ambiguous');
  assert.deepEqual(ambiguous.effects, []);
  assert.equal(registry.calls.apply, 0);
  assert.equal(workspace.launchdeckConfigExists(), false);
});

test('mixed runtime and Host components bind launcher provisioning separately', async (t) => {
  const workspace = createWorkspace(t, 'runtime-host-boundary');
  const registry = createRegistry({
    codex: supportedHost('codex', ['skill', 'mcp'])
  });
  const { discoverDesiredInstallation } = await loadDesiredInstallationModule();
  const skill = {
    sourceDir: path.join(workspace.root, 'payload', 'launchdeck-agent'),
    contentDigest: `sha256:${'c'.repeat(64)}`
  };

  const result = await discoverDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    hosts: ['codex'],
    components: ['runtime', 'skill'],
    desiredBuildIdentity: PACKAGED_BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    skill,
    interactive: false,
    registry
  });

  assert.equal(result.outcome, 'planned');
  assert.equal(result.includeLauncher, true);
  assert.deepEqual(
    result.targets.map((target) => target.component).sort(),
    ['runtime', 'skill']
  );
  assert.deepEqual(registry.calls.lastResolvedComponents, ['skill']);
  assert.equal(registry.calls.lastDesiredBuild.skill.sourceDir, path.resolve(skill.sourceDir));
  assert.equal(registry.calls.lastDesiredBuild.skill.contentDigest, skill.contentDigest);
  assert.equal(registry.calls.lastDesiredBuild.skillSource, path.resolve(skill.sourceDir));
  assert.equal(registry.calls.lastDesiredBuild.skillDigest, skill.contentDigest);
});

test('mixed setup retains an unchanged runtime target for post-install verification', async (t) => {
  const workspace = createWorkspace(t, 'runtime-noop-host-verification');
  const registry = createRegistry({
    codex: supportedHost('codex', ['skill', 'mcp'])
  });
  const launcherRoot = path.join(
    workspace.homeDir,
    '.launchdeck',
    'installer',
    'launcher',
    'v1'
  );
  fs.cpSync(
    path.join(repoRoot, 'agent', 'installer-payload', 'launcher'),
    launcherRoot,
    { recursive: true }
  );
  const { discoverDesiredInstallation } = await loadDesiredInstallationModule();

  const result = await discoverDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    hosts: ['codex'],
    components: ['runtime', 'skill', 'mcp'],
    desiredBuildIdentity: PACKAGED_BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    interactive: false,
    registry
  });

  assert.equal(result.outcome, 'planned');
  assert.deepEqual(
    result.evaluatedTargets.map((target) => target.component).sort(),
    ['mcp', 'runtime', 'skill']
  );
  assert.equal(
    result.actions.some((action) => action.targetId === 'launchdeck:project:runtime'),
    true
  );
  assert.equal(
    result.actions.find((action) => action.targetId === 'launchdeck:project:runtime')?.kind,
    'install-stable-launcher'
  );
  assert.equal(
    result.evaluatedTargets.find((target) => target.component === 'runtime')?.path,
    launcherRoot
  );
});

test('runtime-only explicit setup does not require or probe a Host', async (t) => {
  const workspace = createWorkspace(t, 'runtime-only-explicit');
  const registry = createRegistry({
    codex: supportedHost('codex', ['skill']),
    claude: supportedHost('claude', ['skill'])
  });
  const { discoverDesiredInstallation } = await loadDesiredInstallationModule();

  const result = await discoverDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    components: ['runtime'],
    desiredBuildIdentity: PACKAGED_BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    interactive: false,
    requireExplicitSelection: true,
    registry
  });

  assert.equal(result.outcome, 'planned');
  assert.equal(result.includeLauncher, true);
  assert.deepEqual(result.targets.map((target) => target.component), ['runtime']);
  assert.equal(registry.calls.detect, 0);
  assert.equal(registry.calls.capabilities, 0);
  assert.equal(registry.calls.resolveTargets, 0);
});

test('packaged Skill selection binds the canonical payload directory and manifest digest', async (t) => {
  const workspace = createWorkspace(t, 'packaged-skill-contract');
  const registry = createRegistry({
    codex: supportedHost('codex', ['skill'])
  });
  const { discoverDesiredInstallation } = await loadDesiredInstallationModule();

  const result = await discoverDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    hosts: ['codex'],
    components: ['skill'],
    desiredBuildIdentity: PACKAGED_BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    interactive: false,
    registry
  });

  assert.equal(result.outcome, 'planned');
  assert.equal(
    registry.calls.lastDesiredBuild.skill.sourceDir,
    path.join(repoRoot, 'agent', 'installer-payload', 'skill', 'launchdeck-agent')
  );
  assert.match(registry.calls.lastDesiredBuild.skill.contentDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    registry.calls.lastDesiredBuild.skillDigest,
    registry.calls.lastDesiredBuild.skill.contentDigest
  );
});

test('discovery reads injected evidence only and never authors project config', async (t) => {
  const workspace = createWorkspace(t, 'read-only-discovery');
  const registry = createRegistry({
    codex: supportedHost('codex', ['skill', 'mcp'])
  });
  const { discoverDesiredInstallation } = await loadDesiredInstallationModule();

  const result = await discoverDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    hosts: ['codex'],
    components: ['skill', 'mcp'],
    desiredBuildIdentity: BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    interactive: false,
    registry
  });

  assert.equal(result.outcome, 'planned');
  assert.equal(result.scope, 'project');
  assert.equal(result.projectIdentity, workspace.projectRoot);
  assert.equal(result.targets.length, 2);
  assert.match(result.planDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.planBindingDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(registry.calls.detect, 1);
  assert.equal(registry.calls.capabilities, 1);
  assert.equal(registry.calls.apply, 0);
  assert.equal(registry.calls.verify, 0);
  assert.equal(workspace.launchdeckConfigExists(), false);
});

test('packaged build selection is accepted before resolution but refuses unresolved transaction-ready planning', async (t) => {
  const workspace = createWorkspace(t, 'packaged-selector');
  const registry = createRegistry({
    codex: supportedHost('codex', ['skill'])
  });
  const { normalizeDesiredInstallationSelection, discoverDesiredInstallation } = await loadDesiredInstallationModule();

  const desired = await normalizeDesiredInstallationSelection({
    operation: 'setup',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    host: ['codex'],
    component: ['skill'],
    build: 'packaged',
    sourceIdentity: 'packaged',
    dryRun: false,
    yes: true,
    interactive: false
  });

  assert.equal(desired.requestedBuildSelector, 'packaged');
  assert.equal(desired.desiredBuildIdentity, 'packaged');

  const result = await discoverDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectRoot: workspace.projectRoot,
    homeDir: workspace.homeDir,
    hosts: ['codex'],
    components: ['skill'],
    build: 'packaged',
    sourceIdentity: 'packaged',
    interactive: false,
    registry
  });

  assert.equal(result.outcome, 'refused');
  assert.equal(result.error.code, 'agent_build_identity_unresolved');
  assert.deepEqual(result.effects, []);
  assert.equal(workspace.launchdeckConfigExists(), false);
});

async function loadDesiredInstallationModule() {
  return import(desiredInstallationModuleUrl);
}

const BUILD_IDENTITY = `sha256:${'a'.repeat(64)}`;
const PACKAGED_BUILD_IDENTITY = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'agent', 'installer-payload', 'manifest.json'), 'utf8')
).buildIdentity;
const MATRIX_REVISION = `sha256:${'b'.repeat(64)}`;

function createWorkspace(t, label) {
  const createdRoot = fs.mkdtempSync(path.join(os.tmpdir(), `launchdeck-planner-${label}-`));
  const createdProjectRoot = path.join(createdRoot, 'project');
  const createdHomeDir = path.join(createdRoot, 'home');
  fs.mkdirSync(createdProjectRoot, { recursive: true });
  fs.mkdirSync(createdHomeDir, { recursive: true });
  const projectRoot = fs.realpathSync.native(createdProjectRoot);
  const homeDir = fs.realpathSync.native(createdHomeDir);
  const root = path.dirname(projectRoot);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    projectRoot,
    homeDir,
    launchdeckConfigExists: () => fs.existsSync(path.join(projectRoot, '.launchdeck.yml'))
  };
}

function createRegistry(hosts) {
  const calls = {
    detect: 0,
    capabilities: 0,
    resolveTargets: 0,
    plan: 0,
    apply: 0,
    verify: 0,
    lastResolvedComponents: null,
    lastDesiredBuild: null
  };
  return {
    calls,
    matrixRevision: MATRIX_REVISION,
    listHosts() {
      return Object.keys(hosts).sort();
    },
    adapterFor(hostId) {
      const host = hosts[hostId];
      assert.ok(host, `unexpected host '${hostId}'`);
      return {
        async detect(context) {
          calls.detect += 1;
          return host.detect(context);
        },
        async capabilities(evidence, scope, context) {
          calls.capabilities += 1;
          return host.capabilities(evidence, scope, context);
        },
        async resolveTargets(selection) {
          calls.resolveTargets += 1;
          calls.lastResolvedComponents = selection.components;
          return host.resolveTargets(selection);
        },
        async plan(target, desiredBuild) {
          calls.plan += 1;
          calls.lastDesiredBuild = desiredBuild;
          return host.plan(target, desiredBuild);
        },
        async apply() {
          calls.apply += 1;
          throw new Error('planner discovery must not apply target mutations');
        },
        async verify() {
          calls.verify += 1;
          throw new Error('planner discovery must not verify runtime state');
        }
      };
    }
  };
}

function supportedHost(hostId, components) {
  return {
    detect: () => [{ hostId, version: '1.0.0', supportState: 'supported' }],
    capabilities: (_evidence, scope) => components.map((component) => ({
      hostId,
      scope,
      component,
      supportState: 'supported',
      rowId: `${hostId}-${scope}-${component}`,
      matrixRevision: MATRIX_REVISION
    })),
    resolveTargets: ({ scope, projectRoot, homeDir }) => components.map((component) => ({
      targetId: `${hostId}:${scope}:${component}`,
      hostId,
      scope,
      component,
      path: path.join(scope === 'project' ? projectRoot : homeDir, hostId, component),
      ownershipBoundary: component === 'mcp' ? 'mcpServers.launchdeck' : 'launchdeck-agent',
      ownership: 'launchdeck-owned'
    })),
    plan: (target) => ({
      status: 'planned',
      actions: [{
        actionId: `write-${target.targetId}`,
        targetId: target.targetId,
        kind: componentKind(target.component),
        targetPath: target.path,
        ownershipBoundary: target.ownershipBoundary,
        preconditionDigest: `sha256:${'0'.repeat(64)}`,
        desiredDigest: `sha256:${'1'.repeat(64)}`
      }]
    })
  };
}

function unsupportedHost(hostId, component) {
  return {
    detect: () => [{ hostId, version: '0.1.0', supportState: 'unsupported' }],
    capabilities: () => [{
      hostId,
      scope: 'project',
      component,
      supportState: 'unsupported',
      reason: 'absent-capability-row',
      matrixRevision: MATRIX_REVISION
    }]
  };
}

function ambiguousHost(hostId, component) {
  return {
    detect: () => [
      { hostId, version: '1.0.0', supportState: 'supported' },
      { hostId, version: '1.0.x', supportState: 'ambiguous' }
    ],
    capabilities: () => [{
      hostId,
      scope: 'project',
      component,
      supportState: 'ambiguous',
      reason: 'contradictory-evidence',
      matrixRevision: MATRIX_REVISION
    }]
  };
}

function errorWithCode(code) {
  return {
    name: /AgentInstaller|Error/,
    code
  };
}

function componentKind(component) {
  return component === 'mcp' ? 'patch-owned-entry' : 'copy-skill';
}
