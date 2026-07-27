import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  detectVisualStudio,
  evaluateVisualStudioCapabilities,
  inspectVisualStudioMcpConfig,
  planVisualStudioMcpMutation,
  resolveVisualStudioTargets,
  verifyVisualStudioTarget
} from '../../../src/agent/hosts/visual-studio/index.js';

const BUILD_IDENTITY = `sha256:${'b'.repeat(64)}`;
const RUNTIME_DIGEST = `sha256:${'c'.repeat(64)}`;
const CAPABILITY_ROWS = readFixture('capability-rows.json');

test('detection uses injected vswhere JSON and preserves side-by-side and prerelease evidence', async (t) => {
  const fixture = createIsolatedVisualStudioFixture(t, 'detection');
  const calls = [];
  const instances = readFixture('vswhere-instances.json').map((entry) => ({
    ...entry,
    installationPath: path.join(fixture.installationsRoot, entry.installationPathToken)
  }));

  const evidence = await detectVisualStudio({
    platform: 'win32',
    vswherePath: fixture.vswherePath,
    timeoutMs: 2_000,
    runVswhere: async (command, args, options) => {
      calls.push({ command, args, options });
      return { exitCode: 0, stdout: JSON.stringify(instances), stderr: '' };
    }
  });

  assert.deepEqual(calls, [{
    command: fixture.vswherePath,
    args: ['-products', '*', '-prerelease', '-format', 'json', '-utf8'],
    options: { timeoutMs: 2_000 }
  }]);
  assert.deepEqual(evidence.map((entry) => entry.instanceId), [
    'vs2026-preview-185',
    'vs2026-preview-184',
    'vs2022-community'
  ]);
  assert.deepEqual(evidence.map((entry) => entry.exactVersion), [
    '18.5.0.0',
    '18.4.2.0',
    '17.14.8.0'
  ]);
  assert.deepEqual(evidence.map((entry) => entry.semanticVersion), [
    '18.5.0',
    '18.4.2',
    '17.14.8'
  ]);
  assert.equal(evidence[0].prerelease, true);
  assert.equal(evidence[2].prerelease, false);
  assert.equal(evidence.some((entry) => entry.instanceId === 'build-tools-only'), false);
  assert.equal(evidence.some((entry) => entry.instanceId === 'incomplete-newer'), false);
  assert.equal(evidence.every((entry) => entry.platform === 'win32'), true);
  assert.equal(Object.isFrozen(evidence), true);
});

test('non-Windows detection is unavailable without executing vswhere', async (t) => {
  const fixture = createIsolatedVisualStudioFixture(t, 'non-windows');
  let calls = 0;
  const evidence = await detectVisualStudio({
    platform: 'linux',
    vswherePath: fixture.vswherePath,
    runVswhere: async () => {
      calls += 1;
      throw new Error('must not run');
    }
  });

  assert.deepEqual(evidence, []);
  assert.equal(calls, 0);
  assert.equal(fs.readdirSync(fixture.solutionRoot).length, 0);
});

test('MCP and Skill capability floors are independent and absent rows remain unsupported', (t) => {
  const fixture = createIsolatedVisualStudioFixture(t, 'capabilities');
  const versions = [
    ['17.13.9.0', '17.13.9', 'unsupported', 'unsupported'],
    ['17.14.8.0', '17.14.8', 'supported', 'unsupported'],
    ['18.4.2.0', '18.4.2', 'supported', 'unsupported'],
    ['18.5.0.0', '18.5.0', 'supported', 'supported'],
    ['19.0.0.0', '19.0.0', 'unsupported', 'unsupported']
  ];

  for (const [exactVersion, semanticVersion, mcp, skill] of versions) {
    const capabilities = evaluateVisualStudioCapabilities(hostEvidence(fixture, {
      exactVersion,
      semanticVersion
    }), {
      platform: 'win32',
      scope: 'project',
      capabilityRows: CAPABILITY_ROWS,
      allowFixtureRows: true
    });
    assert.equal(capabilities.mcp.supportState, mcp, `${exactVersion} MCP`);
    assert.equal(capabilities.skill.supportState, skill, `${exactVersion} Skill`);
    if (mcp === 'supported') {
      assert.equal(capabilities.mcp.relativePath, '.vs/mcp.json');
      assert.equal(capabilities.mcp.dialect, 'servers.launchdeck');
    }
    if (skill === 'supported') {
      assert.equal(capabilities.skill.relativePath, '.agents/skills/launchdeck-agent');
    }
  }

  const user = evaluateVisualStudioCapabilities(hostEvidence(fixture, {
    exactVersion: '18.5.0.0',
    semanticVersion: '18.5.0'
  }), {
    platform: 'win32',
    scope: 'user',
    capabilityRows: CAPABILITY_ROWS,
    allowFixtureRows: true
  });
  assert.equal(user.mcp.supportState, 'unsupported');
  assert.equal(user.skill.supportState, 'unsupported');
  assert.equal(user.mcp.reason, 'scope-not-proven');
  assert.equal(user.skill.reason, 'scope-not-proven');
});

test('project targets use solution-scoped .vs MCP, servers.launchdeck, and canonical shared Skill only', (t) => {
  const fixture = createIsolatedVisualStudioFixture(t, 'targets');
  const evidence = hostEvidence(fixture, {
    exactVersion: '18.5.0.0',
    semanticVersion: '18.5.0'
  });
  const capabilities = evaluateVisualStudioCapabilities(evidence, {
    platform: 'win32',
    scope: 'project',
    capabilityRows: CAPABILITY_ROWS,
    allowFixtureRows: true
  });
  const targets = resolveVisualStudioTargets({
    hostEvidence: evidence,
    capabilities,
    scope: 'project',
    components: ['skill', 'mcp'],
    solutionRoot: fixture.solutionRoot,
    launcherPath: fixture.launcherPath,
    buildIdentity: BUILD_IDENTITY
  });

  assert.deepEqual(targets.map((entry) => entry.component), ['mcp', 'skill']);
  const mcp = targets.find((entry) => entry.component === 'mcp');
  const skill = targets.find((entry) => entry.component === 'skill');
  assert.equal(mcp.path, path.join(fixture.solutionRoot, '.vs', 'mcp.json'));
  assert.equal(mcp.dialect, 'servers.launchdeck');
  assert.equal(mcp.ownershipBoundary, 'servers.launchdeck');
  assert.deepEqual(mcp.desiredEntry, {
    type: 'stdio',
    command: fixture.launcherPath,
    args: ['--build', BUILD_IDENTITY]
  });
  assert.equal(skill.path, path.join(
    fixture.solutionRoot,
    '.agents',
    'skills',
    'launchdeck-agent'
  ));
  assert.equal(
    targets.some((entry) => entry.path === path.join(fixture.solutionRoot, '.mcp.json')),
    false
  );
  assert.equal(Object.isFrozen(targets), true);

  assert.throws(
    () => resolveVisualStudioTargets({
      hostEvidence: evidence,
      capabilities: evaluateVisualStudioCapabilities(evidence, {
        platform: 'win32',
        scope: 'user',
        capabilityRows: CAPABILITY_ROWS,
        allowFixtureRows: true
      }),
      scope: 'user',
      components: ['mcp'],
      solutionRoot: fixture.solutionRoot,
      launcherPath: fixture.launcherPath,
      buildIdentity: BUILD_IDENTITY
    }),
    { code: 'agent_scope_unsupported' }
  );
  assert.throws(
    () => resolveVisualStudioTargets({
      hostEvidence: evidence,
      capabilities,
      scope: 'project',
      components: ['mcp'],
      solutionRoot: 'relative-solution',
      launcherPath: fixture.launcherPath,
      buildIdentity: BUILD_IDENTITY
    }),
    { code: 'agent_target_invalid' }
  );
  assert.throws(
    () => resolveVisualStudioTargets({
      hostEvidence: evidence,
      capabilities,
      scope: 'project',
      components: ['mcp'],
      solutionRoot: fixture.solutionRoot,
      launcherPath: 'relative-launcher.cmd',
      buildIdentity: BUILD_IDENTITY
    }),
    { code: 'agent_target_invalid' }
  );
  assert.equal(fs.readdirSync(fixture.solutionRoot).length, 0, 'target resolution is read-only');
});

test('MCP planning owns only servers.launchdeck, preserves unrelated JSON, and refuses foreign collision', (t) => {
  const fixture = createIsolatedVisualStudioFixture(t, 'mcp-ownership');
  const target = supportedMcpTarget(fixture);
  fs.mkdirSync(path.dirname(target.path), { recursive: true });
  fs.writeFileSync(target.path, JSON.stringify(readFixture('existing-mcp.json'), null, 2), 'utf8');

  const observation = inspectVisualStudioMcpConfig({
    configPath: target.path,
    target,
    receiptOwnership: null,
    fs
  });
  assert.equal(observation.state, 'absent');
  const action = planVisualStudioMcpMutation({ observation, target });
  assert.equal(action.kind, 'create');
  assert.equal(action.ownershipBoundary, 'servers.launchdeck');
  assert.deepEqual(action.nextDocument.servers.launchdeck, target.desiredEntry);
  assert.deepEqual(
    action.nextDocument.servers['fixture-tools'],
    readFixture('existing-mcp.json').servers['fixture-tools']
  );
  assert.deepEqual(action.nextDocument.inputs, readFixture('existing-mcp.json').inputs);
  assert.equal('mcpServers' in action.nextDocument, false);

  fs.writeFileSync(
    target.path,
    JSON.stringify(readFixture('foreign-launchdeck-collision.json'), null, 2),
    'utf8'
  );
  const collision = inspectVisualStudioMcpConfig({
    configPath: target.path,
    target,
    receiptOwnership: null,
    fs
  });
  assert.equal(collision.state, 'divergent');
  assert.equal(collision.ownership, 'unproven');
  assert.throws(
    () => planVisualStudioMcpMutation({ observation: collision, target }),
    { code: 'agent_target_conflict' }
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(target.path, 'utf8')),
    readFixture('foreign-launchdeck-collision.json'),
    'planning never rewrites a foreign collision'
  );
  assert.throws(
    () => inspectVisualStudioMcpConfig({
      configPath: target.path,
      target,
      receiptOwnership: null
    }),
    { code: 'agent_effect_provider_required' },
    'adapter never falls back to the live filesystem'
  );
  assert.throws(
    () => inspectVisualStudioMcpConfig({
      configPath: 'relative\\.vs\\mcp.json',
      target,
      receiptOwnership: null,
      fs
    }),
    { code: 'agent_target_invalid' },
    'relative configPath is rejected before cwd resolution'
  );
});

test('verification requires owned config, absolute launcher, runtime digest, MCP initialize, capabilities, and exact build', (t) => {
  const fixture = createIsolatedVisualStudioFixture(t, 'verification');
  const target = supportedMcpTarget(fixture);
  const baseEvidence = {
    ...readFixture('verification-evidence.json'),
    configOwnership: 'verified',
    launcherPath: fixture.launcherPath,
    runtimeDigest: RUNTIME_DIGEST,
    reportedBuildIdentity: BUILD_IDENTITY,
    receiptCandidateBuildIdentity: BUILD_IDENTITY
  };
  const verified = verifyVisualStudioTarget({
    target,
    expectedBuildIdentity: BUILD_IDENTITY,
    expectedRuntimeDigest: RUNTIME_DIGEST,
    evidence: baseEvidence
  });
  assert.deepEqual(verified, {
    state: 'verified',
    ready: true,
    buildIdentity: BUILD_IDENTITY,
    requiredHostActions: []
  });

  for (const [field, value, code] of [
    ['mcpInitialize', false, 'agent_mcp_initialize_failed'],
    ['launchdeckCapabilities', false, 'agent_capabilities_unavailable'],
    ['reportedBuildIdentity', `sha256:${'d'.repeat(64)}`, 'agent_build_identity_mismatch'],
    ['configOwnership', 'divergent', 'agent_target_divergent']
  ]) {
    const failed = verifyVisualStudioTarget({
      target,
      expectedBuildIdentity: BUILD_IDENTITY,
      expectedRuntimeDigest: RUNTIME_DIGEST,
      evidence: { ...baseEvidence, [field]: value }
    });
    assert.equal(failed.state, 'failed', field);
    assert.equal(failed.ready, false, field);
    assert.equal(failed.code, code, field);
  }
});

function supportedMcpTarget(fixture) {
  const evidence = hostEvidence(fixture, {
    exactVersion: '18.5.0.0',
    semanticVersion: '18.5.0'
  });
  const capabilities = evaluateVisualStudioCapabilities(evidence, {
    platform: 'win32',
    scope: 'project',
    capabilityRows: CAPABILITY_ROWS,
    allowFixtureRows: true
  });
  return resolveVisualStudioTargets({
    hostEvidence: evidence,
    capabilities,
    scope: 'project',
    components: ['mcp'],
    solutionRoot: fixture.solutionRoot,
    launcherPath: fixture.launcherPath,
    buildIdentity: BUILD_IDENTITY
  })[0];
}

function hostEvidence(fixture, version) {
  return Object.freeze({
    hostId: 'visual-studio',
    nativeIdentity: 'fixture-visual-studio',
    instanceId: 'fixture-instance',
    exactVersion: version.exactVersion,
    semanticVersion: version.semanticVersion,
    platform: 'win32',
    installationPath: path.join(fixture.installationsRoot, 'fixture-instance'),
    prerelease: false,
    probeIdentity: 'vswhere-json-v1'
  });
}

function createIsolatedVisualStudioFixture(t, label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `launchdeck-vs-${label}-`));
  const solutionRoot = path.join(root, 'solution');
  const installationsRoot = path.join(root, 'installations');
  const vswherePath = path.join(root, 'installer', 'vswhere.exe');
  const launcherPath = path.join(root, 'launchdeck-home', 'installer', 'launcher', 'v1', 'launchdeck-mcp.cmd');
  fs.mkdirSync(solutionRoot, { recursive: true });
  fs.mkdirSync(installationsRoot, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return Object.freeze({
    root,
    solutionRoot,
    installationsRoot,
    vswherePath,
    launcherPath
  });
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(
    new URL(`../../fixtures/agent-hosts/visual-studio/${name}`, import.meta.url),
    'utf8'
  ));
}
