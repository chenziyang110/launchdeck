import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createHostRegistry,
  normalizeRegistryTargets
} from '../../../src/agent/hosts/index.js';
import { discoverDesiredInstallation } from '../../../src/agent/planner/desired-installation.js';
import { normalizeTransactionActionDescription } from '../../../src/agent/state/transaction-plan.js';

const fixtureRoot = fileURLToPath(new URL('../../fixtures/agent-hosts/matrix/', import.meta.url));

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8'));
}

function skillTreeDigest(skillRoot) {
  const files = [];
  for (const relativePath of listFiles(skillRoot)) {
    const bytes = fs.readFileSync(path.join(skillRoot, relativePath));
    files.push({
      path: relativePath.replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
    });
  }
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const identity = canonicalJson({
    schemaVersion: 1,
    skillName: 'launchdeck-agent',
    files
  });
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`;
}

function listFiles(root, relativeDir = '') {
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, relativeDir), { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(root, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

test('one registry serializes the four isolated adapters without duplicate authorities', () => {
  const registry = createHostRegistry({ matrix: fixture('exact-rows.json') });
  const registrations = registry.list();

  assert.deepEqual(
    registrations.map((registration) => registration.id),
    ['codex', 'claude-code', 'github-copilot', 'visual-studio']
  );
  assert.equal(new Set(registrations.map((registration) => registration.id)).size, 4);
  for (const registration of registrations) {
    assert.equal(registry.get(registration.id), registration.adapter);
    assert.equal(typeof registration.adapter.detect, 'function');
    assert.equal(typeof registration.adapter.capabilities, 'function');
    assert.equal(typeof registration.adapter.resolveTargets, 'function');
    assert.equal(typeof registration.adapter.plan, 'function');
    assert.equal(typeof registration.adapter.verify, 'function');
  }
  assert.equal(registry.get('unknown-host'), null);
});

test('registered adapters cannot widen fixture-only production rows', async () => {
  const registry = createHostRegistry();
  const claude = registry.get('claude-code');
  const capabilities = await claude.capabilities([
    {
      host: 'claude-code',
      command: 'claude --version',
      status: 'detected',
      version: '1.5.0',
      platform: 'win32'
    }
  ], 'project', { platform: 'win32' });

  assert.deepEqual(capabilities.map((row) => row.supportState), ['unsupported', 'unsupported']);
  assert.deepEqual(capabilities.map((row) => row.reason), ['evidence-incomplete', 'evidence-incomplete']);
});

test('registered target resolution is exact-scope, matrix-bound, and non-forgeable', async () => {
  const registry = createHostRegistry({ matrix: fixture('exact-rows.json') });
  const copilot = registry.get('github-copilot');
  const projectRoot = path.resolve('workspace');
  const targets = await copilot.resolveTargets({
    host: 'github-copilot',
    scope: 'project',
    components: ['skill'],
    projectRoot,
    evidence: {
      host: 'github-copilot',
      status: 'detected',
      version: '1.4.2',
      platform: 'win32'
    },
    platform: 'win32'
  });

  assert.equal(Array.isArray(targets), true);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].scope, 'project');
  assert.equal(targets[0].capabilityRowId, 'copilot-1.4.2-win32-skill-project');
  const plan = await copilot.plan(targets[0], {
    buildIdentity: 'launchdeck@registry-contract',
    skill: {
      sourceDir: path.resolve('payload', 'launchdeck-agent'),
      contentDigest: `sha256:${'a'.repeat(64)}`
    },
    mcpEntry: {
      command: path.resolve('launchdeck-home', 'bin', 'launchdeck-mcp.cmd'),
      args: ['serve', '--build', 'launchdeck@registry-contract']
    }
  });
  assert.equal(plan.kind, 'actions');
  assert.deepEqual(plan.actions.map((action) => action.kind), ['replace-skill-directory']);

  const forged = { ...targets[0] };
  const refusal = await copilot.inspect(forged);
  assert.equal(refusal.kind, 'refusal');
  assert.equal(refusal.code, 'host_target_unregistered');
  const approvedObservation = await copilot.inspectPlanned(forged);
  assert.notEqual(approvedObservation.kind, 'refusal');
  assert.equal(approvedObservation.path, targets[0].path);
  const approvedVerification = await copilot.verify(forged, {
    buildIdentity: 'launchdeck@registry-contract',
    skill: {
      sourceDir: path.resolve('payload', 'launchdeck-agent'),
      contentDigest: `sha256:${'a'.repeat(64)}`
    },
    mcpEntry: {
      command: path.resolve('launchdeck-home', 'bin', 'launchdeck-mcp.cmd'),
      args: ['serve', '--build', 'launchdeck@registry-contract']
    }
  });
  assert.notEqual(approvedVerification.kind, 'refusal');
});

test('registered adapters can revalidate a planned no-op target without accepting forged targets', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-registered-noop-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  const skillSource = path.join(
    path.dirname(fixtureRoot),
    '..',
    '..',
    '..',
    'agent',
    'installer-payload',
    'skill',
    'launchdeck-agent'
  );
  const targetPath = path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent');
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  fs.cpSync(skillSource, targetPath, { recursive: true });

  const registry = createHostRegistry({
    matrix: fixture('exact-rows.json'),
    adapterOptions: {
      codex: {
        fs,
        probes: {
          version: 'codex-cli 0.96.0',
          mcpList: 'No MCP servers configured'
        }
      }
    }
  });
  const codex = registry.get('codex');
  const target = (await codex.resolveTargets({
    scope: 'project',
    components: ['skill'],
    projectRoot,
    homeDir,
    evidence: { version: '0.96.0', platform: 'win32' },
    platform: 'win32'
  }))[0];
  const desiredBuild = {
    buildIdentity: `sha256:${'a'.repeat(64)}`,
    skill: {
      sourceDir: skillSource,
      contentDigest: skillTreeDigest(skillSource)
    },
    receiptOwnership: {
      owned: true,
      owner: 'launchdeck-agent-installer',
      component: 'skill',
      ownershipBoundary: 'launchdeck-agent',
      path: target.path,
      liveDigest: skillTreeDigest(skillSource),
      liveDigestMatches: true
    }
  };

  const plan = await codex.plan(target, desiredBuild);
  assert.equal(plan.kind, 'actions');
  assert.equal(plan.status, 'noop');
  assert.deepEqual(plan.actions, []);

  const observation = await codex.inspectPlanned({ ...target });
  assert.notEqual(observation.kind, 'refusal');
  assert.equal(observation.path, target.path);

  const forged = await codex.inspectPlanned({
    ...target,
    path: path.join(projectRoot, 'forged', 'launchdeck-agent')
  });
  assert.equal(forged.kind, 'refusal');
  assert.equal(forged.code, 'host_target_unregistered');
});

test('planner preserves registered target identity through host planning', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-registered-planner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  const skillSource = path.join(
    path.dirname(fixtureRoot),
    '..',
    '..',
    '..',
    'agent',
    'installer-payload',
    'skill',
    'launchdeck-agent'
  );
  const exactVersion = '9.9.9';
  const matrix = {
    schemaVersion: 1,
    revision: 'registered-planner-regression-v1',
    rows: [{
      rowId: `codex-${exactVersion}-${process.platform}-skill-project`,
      host: 'codex',
      exactVersion,
      platform: process.platform,
      component: 'skill',
      scope: 'project',
      relativePath: '.agents/skills/launchdeck-agent',
      dialect: 'skill-directory',
      probe: 'codex --version',
      approvalBoundary: 'none',
      fixtureRevision: 'registered-planner-regression-v1',
      realHostEvidenceRevision: 'registered-planner-regression-v1'
    }],
    sharedMcpCoexistence: {
      enabled: false,
      provenPairs: []
    }
  };
  const registry = createHostRegistry({
    matrix,
    adapterOptions: {
      codex: {
        fs,
        probes: {
          version: `codex-cli ${exactVersion}`,
          mcpList: 'No MCP servers configured'
        }
      }
    }
  });

  const result = await discoverDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectRoot,
    homeDir,
    hosts: ['codex'],
    components: ['skill'],
    desiredBuildIdentity: `sha256:${'a'.repeat(64)}`,
    sourceIdentity: 'packaged',
    skill: {
      sourceDir: skillSource,
      contentDigest: skillTreeDigest(skillSource)
    },
    interactive: false,
    registry
  });

  assert.equal(result.outcome, 'planned', JSON.stringify(result, null, 2));
  assert.equal(result.targets.length, 1);
  assert.equal(result.targets[0].targetId, 'codex:project:skill');
  assert.match(result.planDigest, /^sha256:[0-9a-f]{64}$/);
});

test('Codex and Copilot identical Skill targets collapse to one canonical shared target', () => {
  const root = path.resolve('workspace');
  const sharedPath = path.join(root, '.agents', 'skills', 'launchdeck-agent');
  const digest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  const resolution = normalizeRegistryTargets([
    {
      host: 'codex',
      component: 'skill',
      scope: 'project',
      path: sharedPath,
      contentDigest: digest
    },
    {
      host: 'github-copilot',
      component: 'skill',
      scope: 'project',
      path: sharedPath,
      contentDigest: digest
    },
    {
      host: 'claude-code',
      component: 'skill',
      scope: 'project',
      path: path.join(root, '.claude', 'skills', 'launchdeck-agent'),
      contentDigest: digest
    }
  ]);

  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.targets.length, 2);
  const shared = resolution.targets.find((target) => target.path === sharedPath);
  assert.deepEqual(shared.hosts, ['codex', 'github-copilot']);
  assert.equal(shared.scope, 'project');
  assert.equal(shared.component, 'skill');
  assert.equal(shared.contentDigest, digest);
  assert.equal(shared.ownershipBoundary, 'launchdeck-agent');
  const claude = resolution.targets.find((target) => target.host === 'claude-code');
  assert.equal(claude.path, path.join(root, '.claude', 'skills', 'launchdeck-agent'));
});

test('shared Skill content mismatch refuses before target registration', () => {
  const sharedPath = path.join(path.resolve('workspace'), '.agents', 'skills', 'launchdeck-agent');
  const resolution = normalizeRegistryTargets([
    {
      host: 'codex',
      component: 'skill',
      scope: 'project',
      path: sharedPath,
      contentDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    },
    {
      host: 'github-copilot',
      component: 'skill',
      scope: 'project',
      path: sharedPath,
      contentDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    }
  ]);

  assert.equal(resolution.status, 'refused');
  assert.equal(resolution.code, 'shared_skill_content_mismatch');
  assert.equal(resolution.effectCertainty, 'no-write');
  assert.equal('targets' in resolution, false);
});

test('duplicate non-shareable targets refuse rather than relying on host precedence', () => {
  const configPath = path.join(path.resolve('workspace'), '.github', 'mcp.json');
  const resolution = normalizeRegistryTargets([
    {
      host: 'github-copilot',
      component: 'mcp',
      scope: 'project',
      path: configPath,
      ownershipBoundary: 'mcpServers.launchdeck'
    },
    {
      host: 'github-copilot',
      component: 'mcp',
      scope: 'project',
      path: configPath,
      ownershipBoundary: 'mcpServers.launchdeck'
    }
  ]);

  assert.equal(resolution.status, 'refused');
  assert.equal(resolution.code, 'duplicate_managed_target');
  assert.equal(resolution.effectCertainty, 'no-write');
});

test('Claude and Copilot shared MCP coexistence remains disabled without an exact proven pair', () => {
  const sharedPath = path.join(path.resolve('workspace'), '.mcp.json');
  const resolution = normalizeRegistryTargets([
    {
      host: 'claude-code',
      exactVersion: '1.5.0',
      component: 'mcp',
      scope: 'project',
      path: sharedPath,
      ownershipBoundary: 'mcpServers.launchdeck'
    },
    {
      host: 'github-copilot',
      exactVersion: '1.4.2',
      component: 'mcp',
      scope: 'project',
      path: sharedPath,
      ownershipBoundary: 'mcpServers.launchdeck'
    }
  ], {
    sharedMcpCoexistence: fixture('shared-mcp-disabled.json')
  });

  assert.equal(resolution.status, 'refused');
  assert.equal(resolution.code, 'shared_mcp_coexistence_not_proven');
  assert.equal(resolution.effectCertainty, 'no-write');
});

test('registered adapters expose one normalized plan/verify/uninstall envelope without widening support', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-registry-plan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skillSource = path.join(root, 'payload', 'launchdeck-agent');
  fs.mkdirSync(skillSource, { recursive: true });
  fs.writeFileSync(path.join(skillSource, 'SKILL.md'), '# launchdeck-agent\n');
  const skillDigest = skillTreeDigest(skillSource);
  const fakeFs = {
    ...fs,
    existsSync: fs.existsSync,
    readFileSync: fs.readFileSync,
    lstatSync: fs.lstatSync,
    readdirSync: fs.readdirSync,
    mkdirSync() {},
    writeFileSync() {},
    renameSync() {},
    statSync: () => ({ isFile: () => false })
  };
  const registry = createHostRegistry({
    matrix: protocolMatrix(),
    adapterOptions: {
      codex: { fs: fakeFs, trust: { project: true } },
      'claude-code': { fs: fakeFs, trust: { project: true, approval: true } },
      'visual-studio': { fs: fakeFs }
    }
  });

  const codex = registry.get('codex');
  const claude = registry.get('claude-code');
  const copilot = registry.get('github-copilot');
  const visualStudio = registry.get('visual-studio');

  const codexSkill = (await codex.resolveTargets({
    scope: 'project',
    components: ['skill'],
    projectRoot: root,
    homeDir: path.resolve('home'),
    evidence: { version: '0.96.0' },
    platform: 'win32'
  }))[0];
  const claudeMcp = (await claude.resolveTargets({
    scope: 'project',
    components: ['mcp'],
    projectRoot: root,
    evidence: { version: '1.5.0' },
    platform: 'win32'
  }))[0];
  const copilotSkill = (await copilot.resolveTargets({
    scope: 'project',
    components: ['skill'],
    projectRoot: root,
    evidence: { status: 'detected', version: '1.4.2', platform: 'win32' },
    platform: 'win32'
  }))[0];
  const visualStudioMcp = (await visualStudio.resolveTargets({
    scope: 'project',
    components: ['mcp'],
    solutionRoot: root,
    launcherPath: path.resolve('launchdeck-home', 'installer', 'launcher', 'v1', 'launchdeck-mcp.cmd'),
    buildIdentity: `sha256:${'a'.repeat(64)}`,
    evidence: { semanticVersion: '18.5.0' },
    platform: 'win32'
  }))[0];

  const codexPlan = await codex.plan(codexSkill, {
    buildIdentity: `sha256:${'a'.repeat(64)}`,
    skill: {
      sourceDir: skillSource,
      contentDigest: skillDigest
    }
  });
  const claudePlan = await claude.plan(claudeMcp, {
    buildIdentity: `sha256:${'a'.repeat(64)}`,
    launcherPath: path.resolve('launchdeck-home', 'installer', 'launcher', 'v1', 'launchdeck-mcp.cmd')
  }, {
    fs: fakeFs,
    trust: { project: true, approval: true }
  });
  const copilotPlan = await copilot.plan(copilotSkill, {
    buildIdentity: 'launchdeck@registry-contract',
    skill: {
      sourceDir: path.resolve('payload', 'launchdeck-agent'),
      contentDigest: `sha256:${'b'.repeat(64)}`
    },
    mcpEntry: {
      command: path.resolve('launchdeck-home', 'installer', 'launcher', 'v1', 'launchdeck-mcp.cmd'),
      args: ['serve']
    }
  });
  const visualStudioPlan = await visualStudio.plan(visualStudioMcp, {
    mcpEntry: visualStudioMcp.desiredEntry
  }, { fs: fakeFs });

  for (const plan of [codexPlan, claudePlan, copilotPlan, visualStudioPlan]) {
    assert.equal(plan.kind, 'actions');
    assert.ok(['planned', 'noop'].includes(plan.status));
    assert.equal(Array.isArray(plan.actions), true);
    for (const action of plan.actions) {
      assert.deepEqual(normalizeTransactionActionDescription(action), action);
      assert.match(action.actionId, /^action_[0-9a-f]{32}$/);
      assert.match(action.targetId, /^[^:]+:(?:project|user):(skill|mcp)$/);
      assert.equal(path.isAbsolute(action.targetPath), true);
      assert.match(action.preconditionDigest, /^sha256:[0-9a-f]{64}$/);
      assert.match(action.desiredDigest, /^sha256:[0-9a-f]{64}$/);
      assert.equal(typeof action.ownershipBoundary, 'string');
      assert.equal(typeof action.requiresBackup, 'boolean');
    }
  }

  const codexMcp = (await codex.resolveTargets({
    scope: 'project',
    components: ['mcp'],
    projectRoot: root,
    homeDir: path.resolve('home'),
    evidence: { version: '0.96.0' },
    platform: 'win32'
  }))[0];
  const codexVerification = await codex.verify(codexMcp, {
    buildIdentity: `sha256:${'a'.repeat(64)}`,
    runtimeDigest: `sha256:${'c'.repeat(64)}`
  }, {
    launchdeckHome: path.resolve('launchdeck-home'),
    runtimeEvidence: {
      configOwnership: 'verified',
      liveEntryDigestMatches: true,
      skillDigestVerified: true,
      launcherResolved: true,
      launcherPath: path.resolve('launchdeck-home', 'installer', 'launcher', 'v1', 'launchdeck-mcp.cmd'),
      runtimeDigestVerified: true,
      mcpInitialize: true,
      launchdeckCapabilities: true,
      reportedBuildIdentity: `sha256:${'a'.repeat(64)}`,
      receiptCandidateConsistent: true,
      launchdeckHomeForwarded: path.resolve('launchdeck-home')
    }
  });
  assert.equal(codexVerification.kind, 'verification');
  assert.equal(codexVerification.status, 'ready');
  assert.equal(codexVerification.ready, true);
  assert.equal(codexVerification.buildIdentity, `sha256:${'a'.repeat(64)}`);

  const codexUninstall = await codex.uninstall(codexSkill, {
    owned: true,
    liveDigestMatches: true,
    path: codexSkill.path,
    component: 'skill'
  });
  assert.equal(codexUninstall.kind, 'refusal');
  assert.equal(codexUninstall.code, 'ownership-mismatch');
});

test('registered Codex actions keep stable transaction identities and emit canonical effects', async () => {
  const root = path.resolve('workspace', 'canonical-effects');
  const configPath = path.join(root, '.codex', 'config.toml');
  const files = new Map();
  const fakeFs = {
    existsSync: (targetPath) => files.has(path.resolve(targetPath)),
    readFileSync(targetPath, encoding) {
      const bytes = files.get(path.resolve(targetPath));
      if (!bytes) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return encoding ? bytes.toString(encoding) : Buffer.from(bytes);
    },
    mkdirSync() {},
    writeFileSync(targetPath, value) {
      files.set(path.resolve(targetPath), Buffer.from(value));
    },
    renameSync(sourcePath, targetPath) {
      const source = path.resolve(sourcePath);
      files.set(path.resolve(targetPath), files.get(source));
      files.delete(source);
    },
    rmSync(targetPath) {
      files.delete(path.resolve(targetPath));
    },
    statSync: () => ({ isFile: () => false })
  };
  const registry = createHostRegistry({
    matrix: protocolMatrix(),
    adapterOptions: {
      codex: {
        fs: fakeFs,
        trust: { project: true },
        launchdeckHome: path.resolve('launchdeck-home')
      }
    }
  });
  const codex = registry.get('codex');
  const target = (await codex.resolveTargets({
    scope: 'project',
    components: ['mcp'],
    projectRoot: root,
    homeDir: path.resolve('home'),
    evidence: { version: '0.96.0' },
    platform: 'win32'
  }))[0];
  assert.equal(target.path, configPath);

  const desiredBuild = {
    buildIdentity: `sha256:${'a'.repeat(64)}`,
    launcherPath: path.resolve('launchdeck-home', 'bin', 'launchdeck-mcp.cmd')
  };
  const firstPlan = await codex.plan(target, desiredBuild);
  const repeatedPlan = await codex.plan(target, desiredBuild);
  const action = firstPlan.actions[0];

  assert.deepEqual(repeatedPlan.actions, firstPlan.actions);
  assert.equal(action.targetId, 'codex:project:mcp');
  assert.equal(action.ownershipBoundary, '[mcp_servers.launchdeck]');
  assert.equal(action.targetPath, configPath);
  assert.equal(action.requiresBackup, false);

  const effect = await codex.apply(structuredClone(action), {
    operationId: 'op_registrycanonical000001'
  });
  assert.deepEqual(effect, {
    effectId: `effect_${action.actionId.slice('action_'.length)}`,
    actionId: action.actionId,
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    effectType: action.kind,
    beforeDigest: action.preconditionDigest,
    afterDigest: action.desiredDigest,
    effectCertainty: 'complete'
  });

  const rollback = await codex.rollback(effect, { existed: false }, {
    operationId: 'op_registrycanonical000001'
  });
  assert.deepEqual(rollback, {
    actionId: action.actionId,
    targetId: action.targetId,
    restored: true,
    restoredDigest: action.preconditionDigest,
    verified: true
  });
  assert.equal(files.has(configPath), false);

  const original = Buffer.from('# preserve me\n');
  files.set(configPath, original);
  const existingPlan = await codex.plan(target, desiredBuild);
  const existingAction = existingPlan.actions[0];
  assert.equal(existingAction.requiresBackup, true);
  const backup = await codex.backup(existingAction, {
    operationId: 'op_registrycanonical000002'
  });
  const existingEffect = await codex.apply(existingAction, {
    operationId: 'op_registrycanonical000002'
  });
  const existingRollback = await codex.rollback({
    operationId: 'op_registrycanonical000002',
    effect: existingEffect,
    backupRef: backup
  });

  assert.equal(existingRollback.verified, true);
  assert.equal(existingRollback.restoredDigest, existingAction.preconditionDigest);
  assert.deepEqual(files.get(configPath), original);
});

test('registered Codex Skill actions bind source bytes and preserve directory rollback evidence', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-registry-skill-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  const sourceV1 = path.join(root, 'payload-v1', 'launchdeck-agent');
  const sourceV2 = path.join(root, 'payload-v2', 'launchdeck-agent');
  fs.mkdirSync(path.join(sourceV1, 'references'), { recursive: true });
  fs.mkdirSync(path.join(sourceV2, 'references'), { recursive: true });
  fs.writeFileSync(path.join(sourceV1, 'SKILL.md'), '# v1\n');
  fs.writeFileSync(path.join(sourceV1, 'references', 'flow.md'), 'v1\n');
  fs.writeFileSync(path.join(sourceV2, 'SKILL.md'), '# v2\n');
  fs.writeFileSync(path.join(sourceV2, 'references', 'flow.md'), 'v2\n');
  const digestV1 = skillTreeDigest(sourceV1);
  const digestV2 = skillTreeDigest(sourceV2);

  const registry = createHostRegistry({
    matrix: protocolMatrix(),
    adapterOptions: {
      codex: { fs, trust: { project: true } }
    }
  });
  const codex = registry.get('codex');
  const target = (await codex.resolveTargets({
    scope: 'project',
    components: ['skill'],
    projectRoot,
    homeDir,
    evidence: { version: '0.96.0' },
    platform: 'win32'
  }))[0];
  const build = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const firstPlan = await codex.plan(target, {
    buildIdentity: build,
    skill: { sourceDir: sourceV1, contentDigest: digestV1 }
  });
  assert.equal(firstPlan.kind, 'actions', JSON.stringify(firstPlan));
  const firstAction = firstPlan.actions[0];
  assert.equal(firstAction.preconditionDigest, `sha256:${crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`);
  assert.equal(firstAction.desiredDigest, digestV1);
  const firstEffect = await codex.apply(firstAction, { operationId: 'op_skilldirectory0001' });
  assert.equal(firstEffect.afterDigest, digestV1);

  const ownership = {
    owner: 'launchdeck-agent-installer',
    component: 'skill',
    path: target.path,
    ownershipBoundary: 'launchdeck-agent',
    liveDigest: digestV1
  };
  const secondPlan = await codex.plan(target, {
    buildIdentity: build,
    skill: { sourceDir: sourceV2, contentDigest: digestV2 },
    receiptOwnership: ownership
  });
  const secondAction = secondPlan.actions[0];
  const backup = await codex.backup(secondAction, { operationId: 'op_skilldirectory0002' });
  const secondEffect = await codex.apply(secondAction, { operationId: 'op_skilldirectory0002' });
  assert.equal(secondEffect.afterDigest, digestV2);
  const rollback = await codex.rollback(secondEffect, backup, {
    operationId: 'op_skilldirectory0002'
  });
  assert.equal(rollback.verified, true);
  assert.equal(rollback.restoredDigest, digestV1);
  assert.equal((await codex.inspect(target)).contentDigest, digestV1);

  const corruptingFs = {
    ...fs,
    writeFileSync(filePath, value, options) {
      const bytes = String(filePath).includes('.launchdeck-')
        ? Buffer.concat([Buffer.from(value), Buffer.from('corrupt')])
        : value;
      return fs.writeFileSync(filePath, bytes, options);
    }
  };
  const corruptRoot = path.join(root, 'corrupt-project');
  const corruptRegistry = createHostRegistry({
    matrix: protocolMatrix(),
    adapterOptions: {
      codex: { fs: corruptingFs, trust: { project: true } }
    }
  });
  const corruptCodex = corruptRegistry.get('codex');
  const corruptTarget = (await corruptCodex.resolveTargets({
    scope: 'project',
    components: ['skill'],
    projectRoot: corruptRoot,
    homeDir,
    evidence: { version: '0.96.0' },
    platform: 'win32'
  }))[0];
  const corruptPlan = await corruptCodex.plan(corruptTarget, {
    buildIdentity: build,
    skill: { sourceDir: sourceV2, contentDigest: digestV2 }
  });
  await assert.rejects(
    () => corruptCodex.apply(corruptPlan.actions[0], { operationId: 'op_skilldirectory0003' }),
    /staged Skill tree failed digest verification/
  );
  assert.equal(fs.existsSync(corruptTarget.path), false);
});

function protocolMatrix() {
  return {
    schemaVersion: 1,
    revision: 'registered-protocol-v1',
    rows: [
      exactRow('codex', '0.96.0', 'win32', 'skill', 'project', '.agents/skills/launchdeck-agent', 'skill-directory', 'codex --version', 'none'),
      exactRow('codex', '0.96.0', 'win32', 'mcp', 'project', '.codex/config.toml', '[mcp_servers.launchdeck]', 'codex mcp list', 'project-trust'),
      exactRow('claude-code', '1.5.0', 'win32', 'mcp', 'project', '.mcp.json', 'mcpServers.launchdeck', 'claude mcp list', 'project-trust-and-host-approval'),
      exactRow('github-copilot', '1.4.2', 'win32', 'skill', 'project', '.agents/skills/launchdeck-agent', 'skill-directory', 'copilot --version --json', 'none'),
      exactRow('visual-studio', '18.5.0', 'win32', 'mcp', 'project', '.vs/mcp.json', 'servers.launchdeck', 'vswhere -format json', 'ide-reload')
    ],
    sharedMcpCoexistence: {
      enabled: false,
      provenPairs: []
    }
  };
}

function exactRow(host, exactVersion, platform, component, scope, relativePath, dialect, probe, approvalBoundary) {
  return {
    rowId: `${host}-${exactVersion}-${platform}-${component}-${scope}`,
    host,
    exactVersion,
    platform,
    component,
    scope,
    relativePath,
    dialect,
    probe,
    approvalBoundary,
    fixtureRevision: `${host}-contract-v1`,
    realHostEvidenceRevision: 'synthetic-real-host-v1'
  };
}
