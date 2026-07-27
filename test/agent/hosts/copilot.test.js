import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { digestCanonical } from '../../../src/agent/digests.js';
import { createCopilotAdapter } from '../../../src/agent/hosts/copilot/index.js';

const fixtureRoot = fileURLToPath(new URL('../../fixtures/agent-hosts/copilot/', import.meta.url));

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8'));
}

function createHarness({
  probe = fixture('probe-supported.json'),
  files = {},
  runtime = fixture('verification-ready.json'),
  inspectSkill
} = {}) {
  const normalizedFiles = new Map(
    Object.entries(files).map(([filePath, value]) => [
      path.normalize(filePath),
      typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
    ])
  );
  const calls = {
    probes: [],
    reads: [],
    runtime: []
  };
  const adapter = createCopilotAdapter({
    capabilityRows: fixture('capability-rows.json').map((row) => ({
      ...row,
      rowId: row.id,
      exactVersion: row.version,
      fixtureRevision: 'copilot-contract-v1',
      realHostEvidenceRevision: 'synthetic-test-evidence-v1'
    })),
    probe: async (request) => {
      calls.probes.push(request);
      return structuredClone(probe);
    },
    fileExists: async (filePath) => normalizedFiles.has(path.normalize(filePath)),
    readTextFile: async (filePath) => {
      const normalized = path.normalize(filePath);
      calls.reads.push(normalized);
      if (!normalizedFiles.has(normalized)) {
        const error = new Error(`Missing fixture file: ${normalized}`);
        error.code = 'ENOENT';
        throw error;
      }
      return normalizedFiles.get(normalized);
    },
    verifyRuntime: async (request) => {
      calls.runtime.push(request);
      return {
        ...structuredClone(runtime),
        receiptCandidateConsistent: true,
        receiptCandidateBuildIdentity: 'launchdeck@fixture'
      };
    },
    inspectSkill
  });
  return { adapter, calls };
}

function desiredBuild() {
  return {
    buildIdentity: 'launchdeck@fixture',
    artifactDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    skill: {
      sourceDir: path.join('payload', 'launchdeck-agent'),
      contentDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    },
    mcpEntry: {
      command: path.resolve('launchdeck', 'bin', 'launchdeck-mcp'),
      args: ['serve'],
      env: {
        LAUNCHDECK_HOME: path.join('state', 'launchdeck')
      }
    },
    ownership: {
      receiptId: 'receipt-fixture',
      owner: 'launchdeck-agent-installer'
    }
  };
}

test('detect uses a bounded structured probe and preserves exact evidence', async () => {
  const { adapter, calls } = createHarness();

  const evidence = await adapter.detect({ platform: 'win32' });

  assert.equal(calls.probes.length, 1);
  assert.equal(calls.probes[0].structured, true);
  assert.ok(calls.probes[0].timeoutMs > 0 && calls.probes[0].timeoutMs <= 5_000);
  assert.deepEqual(evidence, [{
    host: 'github-copilot',
    status: 'detected',
    executable: 'copilot',
    version: '1.4.2',
    platform: 'win32',
    probeKind: 'structured-json',
    capabilities: {
      skill: true,
      mcp: true
    }
  }]);

  const capabilities = adapter.capabilities(evidence[0], 'project');
  assert.deepEqual(capabilities, [
    {
      component: 'skill',
      scope: 'project',
      supported: true,
      evidenceRow: 'copilot-cli-1.4.2-win32-fixture'
    },
    {
      component: 'mcp',
      scope: 'project',
      supported: true,
      evidenceRow: 'copilot-cli-1.4.2-win32-fixture'
    }
  ]);
});

test('unstructured or unproven probe evidence never widens support', async () => {
  const unstructured = createHarness({ probe: fixture('probe-unstructured.json') });
  const ambiguousEvidence = await unstructured.adapter.detect({ platform: 'win32' });

  assert.equal(ambiguousEvidence[0].status, 'ambiguous');
  assert.equal(ambiguousEvidence[0].version, null);
  assert.deepEqual(
    unstructured.adapter.capabilities(ambiguousEvidence[0], 'project'),
    [
      { component: 'skill', scope: 'project', supported: false, reason: 'ambiguous-host-evidence' },
      { component: 'mcp', scope: 'project', supported: false, reason: 'ambiguous-host-evidence' }
    ]
  );

  const futureProbe = fixture('probe-supported.json');
  futureProbe.stdout = JSON.stringify({
    name: 'GitHub Copilot CLI',
    version: '99.0.0',
    capabilities: { skill: true, mcp: true }
  });
  const future = createHarness({ probe: futureProbe });
  const futureEvidence = await future.adapter.detect({ platform: 'win32' });
  assert.deepEqual(
    future.adapter.capabilities(futureEvidence[0], 'project'),
    [
      { component: 'skill', scope: 'project', supported: false, reason: 'unsupported-version' },
      { component: 'mcp', scope: 'project', supported: false, reason: 'unsupported-version' }
    ]
  );
});

test('targets use the canonical shared Skill and Copilot-native MCP locations', () => {
  const { adapter } = createHarness();
  const projectRoot = path.resolve('workspace');
  const homeDir = path.resolve('home');

  assert.deepEqual(adapter.resolveTargets({
    host: 'github-copilot',
    scope: 'project',
    projectRoot,
    homeDir,
    components: ['skill', 'mcp']
  }), [
    {
      host: 'github-copilot',
      component: 'skill',
      scope: 'project',
      path: path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent'),
      sharedWith: ['codex'],
      ownershipBoundary: 'launchdeck-agent'
    },
    {
      host: 'github-copilot',
      component: 'mcp',
      scope: 'project',
      path: path.join(projectRoot, '.github', 'mcp.json'),
      dialect: 'strict-json',
      ownedPath: ['mcpServers', 'launchdeck'],
      ownershipBoundary: 'mcpServers.launchdeck'
    }
  ]);

  assert.deepEqual(adapter.resolveTargets({
    host: 'github-copilot',
    scope: 'user',
    projectRoot,
    homeDir,
    components: ['skill', 'mcp']
  }).map((target) => target.path), [
    path.join(homeDir, '.agents', 'skills', 'launchdeck-agent'),
    path.join(homeDir, '.copilot', 'mcp-config.json')
  ]);

  assert.throws(() => adapter.resolveTargets({
    host: 'github-copilot',
    scope: 'project',
    projectRoot: 'relative-workspace',
    components: ['mcp']
  }), /explicit absolute path/);
});

test('duplicate Copilot workspace locations refuse before any action is planned', async () => {
  const projectRoot = path.resolve('workspace');
  const githubPath = path.join(projectRoot, '.github', 'mcp.json');
  const sharedPath = path.join(projectRoot, '.mcp.json');
  const { adapter } = createHarness({
    files: {
      [githubPath]: fixture('config-duplicate-github.json'),
      [sharedPath]: fixture('config-duplicate-shared.json')
    }
  });

  const target = adapter.resolveTargets({
    host: 'github-copilot',
    scope: 'project',
    projectRoot,
    homeDir: path.resolve('home'),
    components: ['mcp']
  })[0];
  const observation = await adapter.inspect(target);
  const plan = await adapter.plan({ ...target, observation }, desiredBuild());

  assert.deepEqual(plan, {
    kind: 'refusal',
    code: 'copilot_duplicate_workspace_locations',
    effectCertainty: 'no-write',
    paths: [githubPath, sharedPath]
  });
});

test('strict JSON planning owns only mcpServers.launchdeck and preserves unrelated data', async () => {
  const projectRoot = path.resolve('workspace');
  const targetPath = path.join(projectRoot, '.github', 'mcp.json');
  const original = fixture('config-existing-unrelated.json');
  const { adapter } = createHarness({
    files: {
      [targetPath]: original
    }
  });
  const target = adapter.resolveTargets({
    host: 'github-copilot',
    scope: 'project',
    projectRoot,
    homeDir: path.resolve('home'),
    components: ['mcp']
  })[0];
  const observation = await adapter.inspect(target);
  const plan = await adapter.plan({ ...target, observation }, desiredBuild());

  assert.equal(plan.kind, 'actions');
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].type, 'replace-json-file');
  assert.equal(plan.actions[0].path, targetPath);
  assert.equal(plan.actions[0].ownedPath.join('.'), 'mcpServers.launchdeck');
  const planned = JSON.parse(plan.actions[0].content);
  assert.deepEqual(planned.metadata, original.metadata);
  assert.deepEqual(planned.mcpServers.other, original.mcpServers.other);
  assert.deepEqual(planned.mcpServers.launchdeck, desiredBuild().mcpEntry);
});

test('a non-owned launchdeck collision refuses without mutation actions', async () => {
  const projectRoot = path.resolve('workspace');
  const targetPath = path.join(projectRoot, '.github', 'mcp.json');
  const { adapter } = createHarness({
    files: {
      [targetPath]: fixture('config-collision.json')
    }
  });
  const target = adapter.resolveTargets({
    host: 'github-copilot',
    scope: 'project',
    projectRoot,
    homeDir: path.resolve('home'),
    components: ['mcp']
  })[0];
  const observation = await adapter.inspect(target);
  const plan = await adapter.plan({ ...target, observation }, desiredBuild());

  assert.equal(plan.kind, 'refusal');
  assert.equal(plan.code, 'copilot_mcp_launchdeck_collision');
  assert.equal(plan.effectCertainty, 'no-write');
  assert.equal('actions' in plan, false);
});

test('runtime verification requires owned config, handshake, capability, and build identity', async () => {
  const projectRoot = path.resolve('workspace');
  const targetPath = path.join(projectRoot, '.github', 'mcp.json');
  const build = desiredBuild();
  const { adapter, calls } = createHarness({
    files: {
      [targetPath]: {
        mcpServers: {
          launchdeck: build.mcpEntry
        }
      }
    }
  });
  const target = adapter.resolveTargets({
    host: 'github-copilot',
    scope: 'project',
    projectRoot,
    homeDir: path.resolve('home'),
    components: ['mcp']
  })[0];
  const receiptOwnedTarget = {
    ...target,
    receiptOwnership: {
      owner: 'launchdeck-agent-installer',
      component: 'mcp',
      ownedPath: ['mcpServers', 'launchdeck'],
      path: target.path,
      liveDigest: digestCanonical(build.mcpEntry)
    }
  };

  const unownedVerification = await adapter.verify(target, build);
  assert.equal(unownedVerification.status, 'failed');
  assert.equal(
    unownedVerification.checks.find((check) => check.code === 'owned-entry')?.status,
    'fail'
  );

  const verification = await adapter.verify(receiptOwnedTarget, build);

  assert.equal(calls.runtime.length, 2);
  assert.equal(calls.runtime[1].initialize, true);
  assert.equal(calls.runtime[1].capability, 'launchdeck/status');
  assert.equal(verification.status, 'ready');
  assert.equal(verification.buildIdentity, build.buildIdentity);
  assert.deepEqual(verification.checks.map((check) => [check.code, check.status]), [
    ['owned-entry', 'pass'],
    ['stable-launcher', 'pass'],
    ['mcp-initialize', 'pass'],
    ['launchdeck-capability', 'pass'],
    ['build-identity', 'pass'],
    ['receipt-candidate', 'pass']
  ]);
});

test('Copilot MCP no-op, update, verify, and uninstall require exact owned target path and component', async () => {
  const projectRoot = path.resolve('workspace');
  const homeDir = path.resolve('home');
  const projectPath = path.join(projectRoot, '.github', 'mcp.json');
  const userPath = path.join(homeDir, '.copilot', 'mcp-config.json');
  const build = desiredBuild();
  const { adapter } = createHarness({
    files: {
      [projectPath]: { mcpServers: { launchdeck: build.mcpEntry } },
      [userPath]: { mcpServers: { launchdeck: build.mcpEntry } }
    }
  });

  const projectTarget = adapter.resolveTargets({
    host: 'github-copilot',
    scope: 'project',
    projectRoot,
    homeDir,
    components: ['mcp']
  })[0];
  const userTarget = adapter.resolveTargets({
    host: 'github-copilot',
    scope: 'user',
    projectRoot,
    homeDir,
    components: ['mcp']
  })[0];
  const replayedOwnership = {
    owner: 'launchdeck-agent-installer',
    component: 'mcp',
    ownedPath: ['mcpServers', 'launchdeck'],
    path: projectTarget.path,
    liveDigest: digestCanonical(build.mcpEntry)
  };

  const noopPlan = await adapter.plan(
    { ...userTarget, receiptOwnership: replayedOwnership },
    build
  );
  assert.equal(noopPlan.kind, 'refusal');
  assert.equal(noopPlan.code, 'copilot_mcp_launchdeck_collision');

  const updatedBuild = {
    ...build,
    mcpEntry: {
      ...build.mcpEntry,
      args: ['serve', '--build', 'launchdeck@updated']
    }
  };
  const updatePlan = await adapter.plan(
    { ...userTarget, receiptOwnership: replayedOwnership },
    updatedBuild
  );
  assert.equal(updatePlan.kind, 'refusal');
  assert.equal(updatePlan.code, 'copilot_mcp_launchdeck_collision');

  const verification = await adapter.verify(
    { ...userTarget, receiptOwnership: replayedOwnership },
    build
  );
  assert.equal(verification.status, 'failed');
  assert.equal(
    verification.checks.find((check) => check.code === 'owned-entry')?.status,
    'fail'
  );

  const uninstall = await adapter.uninstall(userTarget, replayedOwnership);
  assert.equal(uninstall.kind, 'refusal');
  assert.equal(uninstall.code, 'copilot_mcp_entry_not_owned');
});

test('Copilot Skill no-op, update, verify, and uninstall require exact owned target path, boundary, and live digest', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-copilot-skill-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  const projectSkillPath = path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent');
  const userSkillPath = path.join(homeDir, '.agents', 'skills', 'launchdeck-agent');
  fs.mkdirSync(path.join(projectSkillPath, 'references'), { recursive: true });
  fs.mkdirSync(path.join(userSkillPath, 'references'), { recursive: true });
  fs.writeFileSync(path.join(projectSkillPath, 'SKILL.md'), '---\nname: launchdeck-agent\n---\nproject\n');
  fs.writeFileSync(path.join(projectSkillPath, 'references', 'ownership.md'), 'owned\n');
  fs.cpSync(projectSkillPath, userSkillPath, { recursive: true });

  const inspectSkill = async (target) => ({
    status: fs.existsSync(target.path) ? 'present' : 'absent',
    contentDigest: fs.existsSync(target.path) ? createSkillManifestDigest(target.path) : null
  });
  const { adapter } = createHarness({ inspectSkill });
  const build = desiredBuild();
  build.skill = {
    sourceDir: projectSkillPath,
    contentDigest: createSkillManifestDigest(projectSkillPath)
  };

  const projectTarget = adapter.resolveTargets({
    host: 'github-copilot',
    scope: 'project',
    projectRoot,
    homeDir,
    components: ['skill']
  })[0];
  const userTarget = adapter.resolveTargets({
    host: 'github-copilot',
    scope: 'user',
    projectRoot,
    homeDir,
    components: ['skill']
  })[0];
  const projectOwnership = {
    owner: 'launchdeck-agent-installer',
    component: 'skill',
    path: projectTarget.path,
    ownershipBoundary: 'launchdeck-agent',
    liveDigest: build.skill.contentDigest
  };
  const userOwnership = {
    owner: 'launchdeck-agent-installer',
    component: 'skill',
    path: userTarget.path,
    ownershipBoundary: 'launchdeck-agent',
    liveDigest: build.skill.contentDigest
  };

  const replayNoop = await adapter.plan(
    { ...userTarget, receiptOwnership: projectOwnership },
    build
  );
  assert.equal(replayNoop.kind, 'refusal');
  assert.equal(replayNoop.code, 'copilot_skill_collision');

  const replayUpdate = await adapter.plan(
    { ...userTarget, receiptOwnership: projectOwnership },
    {
      ...build,
      skill: {
        ...build.skill,
        contentDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
      }
    }
  );
  assert.equal(replayUpdate.kind, 'refusal');
  assert.equal(replayUpdate.code, 'copilot_skill_collision');

  const ownedVerification = await adapter.verify(
    { ...projectTarget, receiptOwnership: projectOwnership },
    build
  );
  assert.equal(ownedVerification.status, 'ready');
  assert.equal(
    ownedVerification.checks.find((check) => check.code === 'owned-skill-digest')?.status,
    'pass'
  );

  const replayVerification = await adapter.verify(
    { ...userTarget, receiptOwnership: projectOwnership },
    build
  );
  assert.equal(replayVerification.status, 'failed');
  assert.equal(
    replayVerification.checks.find((check) => check.code === 'owned-skill-digest')?.status,
    'fail'
  );

  const replayUninstall = await adapter.uninstall(userTarget, projectOwnership);
  assert.equal(replayUninstall.kind, 'refusal');
  assert.equal(replayUninstall.code, 'copilot_skill_not_owned');

  const userReplayToProject = await adapter.plan(
    { ...projectTarget, receiptOwnership: userOwnership },
    build
  );
  assert.equal(userReplayToProject.kind, 'refusal');
  assert.equal(userReplayToProject.code, 'copilot_skill_collision');
});

function createSkillManifestDigest(root) {
  const files = [];
  collectSkillFiles(root, '', files);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return digestCanonical({
    schemaVersion: 1,
    skillName: 'launchdeck-agent',
    files
  });
}

function collectSkillFiles(root, relativeDir, files) {
  const directory = path.join(root, relativeDir);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSkillFiles(root, relativePath, files);
    } else if (entry.isFile()) {
      const content = fs.readFileSync(absolutePath);
      files.push({
        path: relativePath.replaceAll('\\', '/'),
        bytes: content.length,
        sha256: `sha256:${createHash('sha256').update(content).digest('hex')}`
      });
    }
  }
}
