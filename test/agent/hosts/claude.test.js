import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..', '..');
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'agent-hosts', 'claude');
const claudeModuleUrl = pathToFileURL(path.join(repoRoot, 'src', 'agent', 'hosts', 'claude', 'index.js')).href;
const RUNTIME_DIGEST = `sha256:${'d'.repeat(64)}`;

test('Claude adapter module exports the planned isolated factory surface', async () => {
  const mod = await loadClaudeModule();

  assert.equal(
    typeof pickFactory(mod),
    'function',
    'planned T014 Claude adapter factory export is required'
  );
});

test('Claude detection and capability rows are driven by injected probe evidence', async () => {
  const adapter = await createAdapter('trusted');
  const workspace = createWorkspace('trusted');

  try {
    const evidence = toList(await adapter.detect({
      fs,
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      packageRoot: fixtureRoot,
      probes: buildSupportedProbes(),
      trust: { project: true },
      components: ['runtime', 'skill', 'mcp']
    }));

    const versionRow = evidence.find((row) => readField(row, 'command', 'probe') === 'claude --version');
    assert.ok(versionRow, 'version evidence row is required');
    assert.equal(readField(versionRow, 'host', 'hostId'), 'claude-code');
    assert.match(String(readField(versionRow, 'version', 'semver')), /^1\./);

    const capabilities = toList(await adapter.capabilities(evidence, 'project', {
      fs,
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      packageRoot: fixtureRoot,
      trust: { project: true }
    }));

    const projectSkill = capabilities.find((row) => readField(row, 'scope') === 'project' && readField(row, 'component') === 'skill');
    const projectMcp = capabilities.find((row) => readField(row, 'scope') === 'project' && readField(row, 'component') === 'mcp');
    assert.equal(readField(projectSkill, 'path', 'skillRoot'), path.join(workspace.projectRoot, '.claude', 'skills', 'launchdeck-agent'));
    assert.equal(readField(projectMcp, 'path', 'configPath'), path.join(workspace.projectRoot, '.mcp.json'));
    assert.equal(readField(projectMcp, 'dialect'), 'mcpServers.launchdeck');
    assert.equal(capabilities.some((row) => readField(row, 'scope') === 'user'), false);
  } finally {
    workspace.cleanup();
  }
});

test('Claude target resolution keeps native Skill roots and exact JSON dialect paths', async () => {
  const adapter = await createAdapter('trusted');
  const workspace = createWorkspace('trusted');

  try {
    const targets = toList(await adapter.resolveTargets({
      fs,
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      packageRoot: fixtureRoot,
      scope: 'project',
      host: 'claude-code',
      components: ['skill', 'mcp']
    }));

    const projectSkill = targets.find((row) => readField(row, 'scope') === 'project' && readField(row, 'component') === 'skill');
    const projectMcp = targets.find((row) => readField(row, 'scope') === 'project' && readField(row, 'component') === 'mcp');
    assert.equal(readField(projectSkill, 'skillRoot', 'path'), path.join(workspace.projectRoot, '.claude', 'skills', 'launchdeck-agent'));
    assert.equal(readField(projectMcp, 'configPath', 'path'), path.join(workspace.projectRoot, '.mcp.json'));
    assert.equal(readField(projectMcp, 'dialect'), 'mcpServers.launchdeck');
    assert.equal(targets.some((row) => readField(row, 'scope') === 'user'), false);

    const userTargets = toList(await adapter.resolveTargets({
      fs,
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      packageRoot: fixtureRoot,
      scope: 'user',
      host: 'claude-code',
      components: ['skill', 'mcp']
    }));
    const userSkill = userTargets.find((row) => readField(row, 'component') === 'skill');
    const userMcp = userTargets.find((row) => readField(row, 'component') === 'mcp');
    assert.equal(readField(userSkill, 'skillRoot', 'path'), path.join(workspace.homeDir, '.claude', 'skills', 'launchdeck-agent'));
    assert.equal(readField(userMcp, 'configPath', 'path'), path.join(workspace.homeDir, '.claude.json'));
    assert.equal(readField(userMcp, 'dialect'), 'mcpServers.launchdeck');

    await assert.rejects(adapter.resolveTargets({
      scope: 'project',
      projectRoot: 'relative-workspace',
      components: ['mcp']
    }), /explicit absolute path/);
  } finally {
    workspace.cleanup();
  }
});

test('Claude JSON merge preserves unrelated content and refuses collisions or approval gaps', async () => {
  const adapter = await createAdapter('trusted');
  const trustedWorkspace = createWorkspace('trusted');
  const collisionWorkspace = createWorkspace('collision');
  const untrustedWorkspace = createWorkspace('untrusted');

  try {
    const trustedTarget = {
      scope: 'project',
      component: 'mcp',
      configPath: path.join(trustedWorkspace.projectRoot, '.mcp.json'),
      skillPath: path.join(trustedWorkspace.projectRoot, '.claude', 'skills', 'launchdeck-agent')
    };
    const trustedPlan = await adapter.plan(trustedTarget, {
      buildIdentity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      launcherPath: path.join(trustedWorkspace.root, 'launchdeck-mcp.cmd'),
      trust: { project: true, approval: true },
      fs,
      projectRoot: trustedWorkspace.projectRoot,
      homeDir: trustedWorkspace.homeDir,
      packageRoot: fixtureRoot
    });

    const trustedText = renderLikeText(trustedPlan);
    assert.match(trustedText, /"keep":\s*true/);
    assert.match(trustedText, /mcpServers\.launchdeck/);
    assert.match(trustedText, /launchdeck-mcp\.cmd/);

    const collisionTarget = {
      scope: 'project',
      component: 'mcp',
      configPath: path.join(collisionWorkspace.projectRoot, '.mcp.json'),
      skillPath: path.join(collisionWorkspace.projectRoot, '.claude', 'skills', 'launchdeck-agent')
    };
    const collisionPlan = await adapter.plan(collisionTarget, {
      buildIdentity: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      launcherPath: path.join(collisionWorkspace.root, 'launchdeck-mcp.cmd'),
      trust: { project: true, approval: true },
      fs,
      projectRoot: collisionWorkspace.projectRoot,
      homeDir: collisionWorkspace.homeDir,
      packageRoot: fixtureRoot
    });
    assert.match(renderLikeText(collisionPlan), /collision|ownership|refus/i);

    const untrustedTarget = {
      scope: 'project',
      component: 'mcp',
      configPath: path.join(untrustedWorkspace.projectRoot, '.mcp.json'),
      skillPath: path.join(untrustedWorkspace.projectRoot, '.claude', 'skills', 'launchdeck-agent')
    };
    const untrustedPlan = await adapter.plan(untrustedTarget, {
      buildIdentity: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      launcherPath: path.join(untrustedWorkspace.root, 'launchdeck-mcp.cmd'),
      trust: { project: false, approval: false },
      fs,
      projectRoot: untrustedWorkspace.projectRoot,
      homeDir: untrustedWorkspace.homeDir,
      packageRoot: fixtureRoot
    });
    assert.match(renderLikeText(untrustedPlan), /approval|trust|pending|refus/i);
  } finally {
    trustedWorkspace.cleanup();
    collisionWorkspace.cleanup();
    untrustedWorkspace.cleanup();
  }
});

test('Claude verification reports launcher, build identity, and host approval evidence', async () => {
  const adapter = await createAdapter('trusted');
  const workspace = createWorkspace('trusted');

  try {
    const buildIdentity = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const target = {
      host: 'claude-code',
      scope: 'project',
      component: 'mcp',
      configPath: path.join(workspace.projectRoot, '.mcp.json'),
      skillPath: path.join(workspace.projectRoot, '.claude', 'skills', 'launchdeck-agent')
    };
    const desiredBuild = {
      buildIdentity,
      runtimeDigest: RUNTIME_DIGEST,
      mcpEntry: {
        command: path.join(workspace.root, 'launchdeck-mcp.cmd'),
        args: ['serve', '--build', buildIdentity]
      },
      skill: {
        path: target.skillPath,
        contentDigest: null
      }
    };
    const skillObservation = await adapter.inspect({
      host: 'claude-code',
      scope: 'project',
      component: 'skill',
      path: target.skillPath
    }, { fs });
    desiredBuild.skill.contentDigest = skillObservation.contentDigest;
    const planned = await adapter.plan(target, {
      ...desiredBuild,
      trust: { project: true, approval: true }
    }, { fs });
    fs.writeFileSync(target.configPath, planned.actions[0].content, 'utf8');
    const configObservation = await adapter.inspect(target, { fs });

    const verification = await adapter.verify(target, desiredBuild, {
      fs,
      trust: { project: true, approval: true },
      receiptOwnership: {
        mcp: {
          owner: 'launchdeck-agent-installer',
          component: 'mcp',
          ownedPath: ['mcpServers', 'launchdeck'],
          path: target.configPath,
          liveDigest: configObservation.entryDigest
        },
        skill: {
          owner: 'launchdeck-agent-installer',
          component: 'skill',
          path: target.skillPath,
          ownershipBoundary: 'launchdeck-agent',
          liveDigest: skillObservation.contentDigest
        }
      }
    });

    assert.equal(verification.status, 'ready');
    assert.equal(verification.checks.every((check) => check.status === 'pass'), true);

    const noRuntime = await createAdapter('trusted', { verifyRuntime: null });
    const failed = await noRuntime.verify(target, desiredBuild, {
      fs,
      trust: { project: true, approval: true },
      receiptOwnership: {
        mcp: {
          owner: 'launchdeck-agent-installer',
          component: 'mcp',
          ownedPath: ['mcpServers', 'launchdeck'],
          path: target.configPath,
          liveDigest: configObservation.entryDigest
        },
        skill: {
          owner: 'launchdeck-agent-installer',
          component: 'skill',
          path: target.skillPath,
          ownershipBoundary: 'launchdeck-agent',
          liveDigest: skillObservation.contentDigest
        }
      }
    });
    assert.equal(failed.status, 'not-ready');
  } finally {
    workspace.cleanup();
  }
});

test('Claude MCP no-op, update, verify, and uninstall require exact owned target path and component', async () => {
  const adapter = await createAdapter('trusted');
  const workspace = createWorkspace('trusted');

  try {
    const buildIdentity = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const launcherPath = path.join(workspace.root, 'launchdeck-mcp.cmd');
    const projectTarget = {
      host: 'claude-code',
      scope: 'project',
      component: 'mcp',
      configPath: path.join(workspace.projectRoot, '.mcp.json')
    };
    const userTarget = {
      host: 'claude-code',
      scope: 'user',
      component: 'mcp',
      configPath: path.join(workspace.homeDir, '.claude.json')
    };
    const existingEntry = {
      command: launcherPath,
      args: ['serve', '--build', buildIdentity]
    };
    for (const configPath of [projectTarget.configPath, userTarget.configPath]) {
      const document = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      document.mcpServers.launchdeck = existingEntry;
      fs.writeFileSync(configPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    }
    const observedProject = await adapter.inspect(projectTarget, { fs });
    const observedUser = await adapter.inspect(userTarget, { fs });
    assert.equal(observedProject.entryDigest, observedUser.entryDigest, 'fixture reuses identical live entry');

    const replayedOwnership = {
      owner: 'launchdeck-agent-installer',
      component: 'mcp',
      ownedPath: ['mcpServers', 'launchdeck'],
      path: projectTarget.configPath,
      liveDigest: observedProject.entryDigest
    };
    const noopDesired = {
      buildIdentity,
      launcherPath,
      mcpEntry: observedUser.entry,
      trust: { user: true, approval: true },
      receiptOwnership: replayedOwnership
    };
    const updateDesired = {
      ...noopDesired,
      buildIdentity: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      mcpEntry: {
        command: launcherPath,
        args: ['serve', '--build', 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']
      }
    };

    const noopPlan = await adapter.plan(
      { ...userTarget, receiptOwnership: replayedOwnership },
      noopDesired,
      { fs }
    );
    assert.equal(noopPlan.kind, 'refusal');
    assert.equal(noopPlan.code, 'claude_mcp_launchdeck_collision');

    const updatePlan = await adapter.plan(
      { ...userTarget, receiptOwnership: replayedOwnership },
      updateDesired,
      { fs }
    );
    assert.equal(updatePlan.kind, 'refusal');
    assert.equal(updatePlan.code, 'claude_mcp_launchdeck_collision');

    const verification = await adapter.verify(userTarget, {
      buildIdentity,
      runtimeDigest: RUNTIME_DIGEST,
      mcpEntry: observedUser.entry
    }, {
      fs,
      trust: { user: true, approval: true },
      receiptOwnership: {
        mcp: replayedOwnership
      }
    });
    assert.equal(verification.status, 'not-ready');
    assert.equal(
      verification.checks.find((check) => check.code === 'owned-config-entry')?.status,
      'fail'
    );

    const uninstall = await adapter.uninstall(userTarget, replayedOwnership, { fs });
    assert.equal(uninstall.kind, 'refusal');
    assert.equal(uninstall.code, 'claude_mcp_entry_not_owned');
  } finally {
    workspace.cleanup();
  }
});

test('Claude Skill no-op, update, verify, and uninstall require exact owned target path, boundary, and live digest', async () => {
  const adapter = await createAdapter('trusted');
  const workspace = createWorkspace('trusted');

  try {
    const buildIdentity = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const projectTarget = {
      host: 'claude-code',
      scope: 'project',
      component: 'skill',
      path: path.join(workspace.projectRoot, '.claude', 'skills', 'launchdeck-agent'),
      ownershipBoundary: 'launchdeck-agent'
    };
    const userTarget = {
      host: 'claude-code',
      scope: 'user',
      component: 'skill',
      path: path.join(workspace.homeDir, '.claude', 'skills', 'launchdeck-agent'),
      ownershipBoundary: 'launchdeck-agent'
    };
    const observedProject = await adapter.inspect(projectTarget, { fs });
    const observedUser = await adapter.inspect(userTarget, { fs });
    assert.equal(observedProject.contentDigest, observedUser.contentDigest);

    const projectOwnership = {
      owner: 'launchdeck-agent-installer',
      component: 'skill',
      path: projectTarget.path,
      ownershipBoundary: 'launchdeck-agent',
      liveDigest: observedProject.contentDigest
    };
    const userOwnership = {
      owner: 'launchdeck-agent-installer',
      component: 'skill',
      path: userTarget.path,
      ownershipBoundary: 'launchdeck-agent',
      liveDigest: observedUser.contentDigest
    };

    const replayNoop = await adapter.plan(
      { ...userTarget, receiptOwnership: projectOwnership },
      {
        skillSource: projectTarget.path,
        skillDigest: observedUser.contentDigest,
        trust: { user: true, approval: true }
      },
      { fs }
    );
    assert.equal(replayNoop.kind, 'refusal');
    assert.equal(replayNoop.code, 'claude_skill_ownership_collision');

    const replayUpdate = await adapter.plan(
      { ...userTarget, receiptOwnership: projectOwnership },
      {
        skillSource: projectTarget.path,
        skillDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        trust: { user: true, approval: true }
      },
      { fs }
    );
    assert.equal(replayUpdate.kind, 'refusal');
    assert.equal(replayUpdate.code, 'claude_skill_ownership_collision');

    const ownedVerification = await adapter.verify(projectTarget, {
      buildIdentity,
      skill: {
        path: projectTarget.path,
        contentDigest: observedProject.contentDigest
      }
    }, {
      fs,
      trust: { project: true, approval: true },
      receiptOwnership: {
        skill: projectOwnership
      }
    });
    assert.equal(ownedVerification.status, 'ready');
    assert.equal(
      ownedVerification.checks.find((check) => check.code === 'owned-skill-digest')?.status,
      'pass'
    );

    const replayVerification = await adapter.verify(userTarget, {
      buildIdentity,
      skill: {
        path: userTarget.path,
        contentDigest: observedUser.contentDigest
      }
    }, {
      fs,
      trust: { user: true, approval: true },
      receiptOwnership: {
        skill: projectOwnership
      }
    });
    assert.equal(replayVerification.status, 'not-ready');
    assert.equal(
      replayVerification.checks.find((check) => check.code === 'owned-skill-digest')?.status,
      'fail'
    );

    const replayUninstall = await adapter.uninstall(userTarget, projectOwnership, { fs });
    assert.equal(replayUninstall.kind, 'refusal');
    assert.equal(replayUninstall.code, 'claude_skill_not_owned');

    const userReplayToProject = await adapter.plan(
      { ...projectTarget, receiptOwnership: userOwnership },
      {
        skillSource: userTarget.path,
        skillDigest: observedProject.contentDigest,
        trust: { project: true, approval: true }
      },
      { fs }
    );
    assert.equal(userReplayToProject.kind, 'refusal');
    assert.equal(userReplayToProject.code, 'claude_skill_ownership_collision');
  } finally {
    workspace.cleanup();
  }
});

async function loadClaudeModule() {
  return import(claudeModuleUrl);
}

async function createAdapter(template, overrides = {}) {
  const mod = await loadClaudeModule();
  const factory = pickFactory(mod);
  assert.equal(typeof factory, 'function', 'planned T014 Claude adapter factory export is required');
  return factory({
    fs,
    projectRoot: fixtureRoot,
    homeDir: fixtureRoot,
    packageRoot: fixtureRoot,
    probes: template === 'trusted' ? buildSupportedProbes() : buildUnsupportedProbes(),
    trust: { project: template === 'trusted', approval: template === 'trusted' },
    host: 'claude-code',
    capabilityRows: [{
      rowId: 'claude-code-1.5.0-test',
      host: 'claude-code',
      exactVersion: '1.5.0',
      platform: process.platform,
      components: ['skill', 'mcp'],
      fixtureRevision: 'claude-contract-v1',
      realHostEvidenceRevision: 'synthetic-test-evidence-v1'
    }],
    verifyRuntime: async (request) => ({
      launcher: { absolute: true, stable: true },
      runtimeDigestVerified: true,
      runtimeDigest: RUNTIME_DIGEST,
      initialize: { ok: true },
      capability: { ok: true, name: 'launchdeck/status' },
      buildIdentity: request.buildIdentity,
      receiptCandidateConsistent: true,
      receiptCandidateBuildIdentity: request.buildIdentity
    }),
    ...overrides
  });
}

function pickFactory(mod) {
  return mod.createClaudeHostAdapter ?? mod.createAdapter ?? mod.claudeHostAdapter ?? mod.default;
}

function createWorkspace(template) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `launchdeck-claude-${template}-`));
  const projectRoot = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  fs.mkdirSync(
    path.join(projectRoot, '.claude', 'skills', 'launchdeck-agent', 'references'),
    { recursive: true }
  );
  fs.mkdirSync(path.join(homeDir, '.claude', 'skills', 'launchdeck-agent', 'references'), { recursive: true });

  fs.writeFileSync(path.join(projectRoot, '.mcp.json'), readFixture(`json/${template}.mcp.json`));
  fs.writeFileSync(path.join(projectRoot, '.claude', 'skills', 'launchdeck-agent', 'SKILL.md'), readFixture('skill/SKILL.md'));
  fs.writeFileSync(
    path.join(projectRoot, '.claude', 'skills', 'launchdeck-agent', 'references', 'ownership.md'),
    readFixture('skill/references/ownership.md')
  );
  fs.writeFileSync(path.join(homeDir, '.claude.json'), readFixture(`json/${template}.claude.json`));
  fs.writeFileSync(path.join(homeDir, '.claude', 'skills', 'launchdeck-agent', 'SKILL.md'), readFixture('skill/SKILL.md'));
  fs.writeFileSync(
    path.join(homeDir, '.claude', 'skills', 'launchdeck-agent', 'references', 'ownership.md'),
    readFixture('skill/references/ownership.md')
  );

  return {
    root,
    projectRoot,
    homeDir,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

function readFixture(relativePath) {
  return fs.readFileSync(path.join(fixtureRoot, relativePath), 'utf8');
}

function buildSupportedProbes() {
  return {
    version: readFixture('probes/version-supported.txt'),
    mcpList: JSON.parse(readFixture('probes/mcp-list-supported.json'))
  };
}

function buildUnsupportedProbes() {
  return {
    version: readFixture('probes/version-unsupported.txt'),
    mcpList: JSON.parse(readFixture('probes/mcp-list-unsupported.json'))
  };
}

function toList(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  if (value && Array.isArray(value.targets)) return value.targets;
  if (value && Array.isArray(value.evidence)) return value.evidence;
  if (value && Array.isArray(value.capabilities)) return value.capabilities;
  return [];
}

function readField(value, ...keys) {
  for (const key of keys) {
    if (value && value[key] !== undefined) {
      return value[key];
    }
  }
  return undefined;
}

function renderLikeText(value) {
  if (typeof value === 'string') {
    return value;
  }
  return value?.rendered
    ?? value?.text
    ?? value?.patch
    ?? value?.source
    ?? value?.output
    ?? JSON.stringify(value ?? {});
}
