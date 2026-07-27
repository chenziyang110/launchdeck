import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@decimalturn/toml-patch';
import { createSkillContentManifest } from '../../../src/agent-installer.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..', '..');
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'agent-hosts', 'codex');
const codexModuleUrl = pathToFileURL(path.join(repoRoot, 'src', 'agent', 'hosts', 'codex', 'index.js')).href;

test('Codex adapter module exports the planned isolated factory surface', async () => {
  const mod = await loadCodexModule();

  assert.equal(
    typeof pickFactory(mod),
    'function',
    'planned T013 Codex adapter factory export is required'
  );
});

test('Codex Skill inspection uses the canonical package manifest digest on every platform', async () => {
  const mod = await loadCodexModule();
  const skillRoot = path.join(
    repoRoot,
    'agent',
    'installer-payload',
    'skill',
    'launchdeck-agent'
  );
  const canonical = createSkillContentManifest(skillRoot);
  const observed = await mod.inspectCodexTarget({
    component: 'skill',
    path: skillRoot
  }, { fs });

  assert.equal(observed.status, 'present');
  assert.equal(observed.contentDigest, canonical.contentDigest);
});

test('Codex detection and capability rows are driven by injected probe evidence', async () => {
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

    const versionRow = evidence.find((row) => readField(row, 'command', 'probe') === 'codex --version');
    assert.ok(versionRow, 'version evidence row is required');
    assert.equal(readField(versionRow, 'host', 'hostId'), 'codex');
    assert.equal(readField(versionRow, 'version', 'semver'), '0.96.0');

    const capabilities = toList(await adapter.capabilities(evidence, 'project', {
      fs,
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      packageRoot: fixtureRoot,
      trust: { project: true }
    }));
    const userCapabilities = toList(await adapter.capabilities(evidence, 'user', {
      fs,
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      packageRoot: fixtureRoot,
      trust: { project: true }
    }));

    const projectSkill = capabilities.find((row) => readField(row, 'scope') === 'project' && readField(row, 'component') === 'skill');
    const projectMcp = capabilities.find((row) => readField(row, 'scope') === 'project' && readField(row, 'component') === 'mcp');
    const userSkill = userCapabilities.find((row) => readField(row, 'scope') === 'user' && readField(row, 'component') === 'skill');

    assert.equal(readField(projectSkill, 'path', 'skillRoot'), path.join(workspace.projectRoot, '.agents', 'skills', 'launchdeck-agent'));
    assert.equal(readField(projectMcp, 'path', 'configPath'), path.join(workspace.projectRoot, '.codex', 'config.toml'));
    assert.equal(readField(projectMcp, 'dialect'), '[mcp_servers.launchdeck]');
    assert.equal(readField(userSkill, 'path', 'skillRoot'), path.join(workspace.homeDir, '.agents', 'skills', 'launchdeck-agent'));
  } finally {
    workspace.cleanup();
  }
});

test('Codex target resolution keeps Skill roots and owned MCP paths exact', async () => {
  const adapter = await createAdapter('trusted');
  const workspace = createWorkspace('trusted');

  try {
    const targets = toList(await adapter.resolveTargets({
      fs,
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      packageRoot: fixtureRoot,
      scope: 'project',
      host: 'codex',
      components: ['skill', 'mcp']
    }));
    const userTargets = toList(await adapter.resolveTargets({
      fs,
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      packageRoot: fixtureRoot,
      scope: 'user',
      host: 'codex',
      components: ['skill', 'mcp']
    }));

    const projectSkill = targets.find((row) => readField(row, 'scope') === 'project' && readField(row, 'component') === 'skill');
    const projectMcp = targets.find((row) => readField(row, 'scope') === 'project' && readField(row, 'component') === 'mcp');
    const userSkill = userTargets.find((row) => readField(row, 'scope') === 'user' && readField(row, 'component') === 'skill');
    const userMcp = userTargets.find((row) => readField(row, 'scope') === 'user' && readField(row, 'component') === 'mcp');

    assert.equal(readField(projectSkill, 'skillRoot', 'path'), path.join(workspace.projectRoot, '.agents', 'skills', 'launchdeck-agent'));
    assert.equal(readField(projectMcp, 'configPath', 'path'), path.join(workspace.projectRoot, '.codex', 'config.toml'));
    assert.equal(readField(projectMcp, 'dialect'), '[mcp_servers.launchdeck]');
    assert.equal(readField(userSkill, 'skillRoot', 'path'), path.join(workspace.homeDir, '.agents', 'skills', 'launchdeck-agent'));
    assert.equal(readField(userMcp, 'configPath', 'path'), path.join(workspace.homeDir, '.codex', 'config.toml'));
    assert.equal(readField(userMcp, 'dialect'), '[mcp_servers.launchdeck]');
  } finally {
    workspace.cleanup();
  }
});

test('Codex target resolution rejects relative roots before cwd can widen scope', async () => {
  const adapter = await createAdapter('trusted');

  assert.throws(() => adapter.resolveTargets({
    fs,
    projectRoot: 'relative-project',
    homeDir: path.resolve('home'),
    packageRoot: fixtureRoot,
    scope: 'project',
    host: 'codex',
    components: ['skill']
  }), /explicit absolute path/);

  assert.throws(() => adapter.resolveTargets({
    fs,
    projectRoot: path.resolve('project'),
    homeDir: 'relative-home',
    packageRoot: fixtureRoot,
    scope: 'user',
    host: 'codex',
    components: ['mcp']
  }), /explicit absolute path/);
});

test('Codex TOML planning preserves unrelated content and refuses collisions or trust gaps', async () => {
  const adapter = await createAdapter('trusted');
  const trustedWorkspace = createWorkspace('trusted');
  const collisionWorkspace = createWorkspace('collision');
  const untrustedWorkspace = createWorkspace('untrusted');
  const emptyWorkspace = createWorkspace('trusted');

  try {
    const trustedTarget = {
      scope: 'project',
      component: 'mcp',
      configPath: path.join(trustedWorkspace.projectRoot, '.codex', 'config.toml'),
      skillPath: path.join(trustedWorkspace.projectRoot, '.agents', 'skills', 'launchdeck-agent')
    };
    const trustedPlan = await adapter.plan(trustedTarget, {
      buildIdentity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      trust: { project: true },
      fs,
      projectRoot: trustedWorkspace.projectRoot,
      homeDir: trustedWorkspace.homeDir,
      packageRoot: fixtureRoot,
      launcherPath: path.join(trustedWorkspace.root, 'launcher', 'launchdeck-mcp.cmd'),
      launchdeckHome: path.join(trustedWorkspace.root, 'launchdeck-home')
    });

    const trustedText = renderLikeText(trustedPlan);
    assert.match(trustedText, /# keep this comment/);
    assert.match(trustedText, /\[mcp_servers\.keep\]/);
    assert.match(trustedText, /\[mcp_servers\.launchdeck\]/);
    assert.doesNotMatch(trustedText, /^launchdeck\s*=/m);
    assert.match(
      trustedText,
      /\[tool\.keep\]\r?\nenabled = true\r?\n\r?\n\[mcp_servers\.keep\]\r?\ncommand = "keep-server"\r?\nargs = \["--safe"\]\r?\n\r?\n\[notes\]\r?\nmessage = "leave me alone"/
    );
    const trustedDocument = parse(trustedText);
    assert.equal(trustedDocument.launchdeck, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(trustedDocument.mcp_servers.launchdeck)), {
      command: path.join(trustedWorkspace.root, 'launcher', 'launchdeck-mcp.cmd'),
      args: ['mcp', 'serve'],
      env: {
        LAUNCHDECK_HOME: path.join(trustedWorkspace.root, 'launchdeck-home'),
        LAUNCHDECK_BUILD_ID: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        LAUNCHDECK_MANAGED_BY: 'launchdeck-agent-installer'
      }
    });
    fs.writeFileSync(trustedTarget.configPath, trustedText, 'utf8');
    const repeatedPlan = await adapter.plan(trustedTarget, {
      buildIdentity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      trust: { project: true },
      fs,
      projectRoot: trustedWorkspace.projectRoot,
      homeDir: trustedWorkspace.homeDir,
      launcherPath: path.join(trustedWorkspace.root, 'launcher', 'launchdeck-mcp.cmd'),
      launchdeckHome: path.join(trustedWorkspace.root, 'launchdeck-home'),
      receiptOwnership: {
        owned: true,
        component: 'mcp',
        path: trustedTarget.configPath,
        liveDigest: trustedPlan.actions[0].desiredDigest,
        liveDigestMatches: true
      }
    });
    assert.equal(repeatedPlan.status, 'no-op');
    assert.deepEqual(repeatedPlan.actions, []);

    const emptyConfigPath = path.join(emptyWorkspace.projectRoot, '.codex', 'config.toml');
    fs.writeFileSync(emptyConfigPath, '# preserve comment-only config\n');
    const emptyPlan = await adapter.plan({
      scope: 'project',
      component: 'mcp',
      configPath: emptyConfigPath
    }, {
      buildIdentity: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      trust: { project: true },
      fs,
      projectRoot: emptyWorkspace.projectRoot,
      homeDir: emptyWorkspace.homeDir,
      launcherPath: path.join(emptyWorkspace.root, 'launcher', 'launchdeck-mcp.cmd'),
      launchdeckHome: path.join(emptyWorkspace.root, 'launchdeck-home')
    });
    const emptyText = renderLikeText(emptyPlan);
    assert.match(emptyText, /^# preserve comment-only config/m);
    assert.match(emptyText, /\[mcp_servers\.launchdeck\]/);
    assert.doesNotMatch(emptyText, /^launchdeck\s*=/m);
    const emptyDocument = parse(emptyText);
    assert.equal(emptyDocument.launchdeck, undefined);
    assert.equal(
      emptyDocument.mcp_servers.launchdeck.env.LAUNCHDECK_BUILD_ID,
      'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    );

    const collisionTarget = {
      scope: 'project',
      component: 'mcp',
      configPath: path.join(collisionWorkspace.projectRoot, '.codex', 'config.toml'),
      skillPath: path.join(collisionWorkspace.projectRoot, '.agents', 'skills', 'launchdeck-agent')
    };
    const collisionPlan = await adapter.plan(collisionTarget, {
      buildIdentity: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      trust: { project: true },
      fs,
      projectRoot: collisionWorkspace.projectRoot,
      homeDir: collisionWorkspace.homeDir,
      packageRoot: fixtureRoot
    });
    assert.match(renderLikeText(collisionPlan), /trust|collision|ownership|refus/i);

    const untrustedTarget = {
      scope: 'project',
      component: 'mcp',
      configPath: path.join(untrustedWorkspace.projectRoot, '.codex', 'config.toml'),
      skillPath: path.join(untrustedWorkspace.projectRoot, '.agents', 'skills', 'launchdeck-agent')
    };
    const untrustedPlan = await adapter.plan(untrustedTarget, {
      buildIdentity: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      trust: { project: false },
      fs,
      projectRoot: untrustedWorkspace.projectRoot,
      homeDir: untrustedWorkspace.homeDir,
      packageRoot: fixtureRoot
    });
    assert.match(renderLikeText(untrustedPlan), /trust|approval|pending|refus/i);
  } finally {
    trustedWorkspace.cleanup();
    collisionWorkspace.cleanup();
    untrustedWorkspace.cleanup();
    emptyWorkspace.cleanup();
  }
});

test('Codex verification reports launcher, build identity, and owned-entry evidence', async () => {
  const adapter = await createAdapter('trusted');
  const workspace = createWorkspace('trusted');

  try {
    const verification = await adapter.verify({
      fs,
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      packageRoot: fixtureRoot,
      target: {
        scope: 'project',
        component: 'mcp',
        configPath: path.join(workspace.projectRoot, '.codex', 'config.toml'),
        skillPath: path.join(workspace.projectRoot, '.agents', 'skills', 'launchdeck-agent')
      },
      desiredBuild: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      launcherPath: path.join(workspace.root, 'launcher', 'launchdeck-mcp.cmd'),
      launchdeckHome: path.join(workspace.root, 'launchdeck-home'),
      evidence: {
        configOwnership: 'verified',
        liveEntryDigestMatches: true,
        skillDigestVerified: true,
        launcherResolved: true,
        launcherPath: path.join(workspace.root, 'launcher', 'launchdeck-mcp.cmd'),
        runtimeDigestVerified: true,
        mcpInitialize: true,
        launchdeckCapabilities: true,
        reportedBuildIdentity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        receiptCandidateConsistent: true,
        launchdeckHomeForwarded: path.resolve(path.join(workspace.root, 'launchdeck-home'))
      }
    });

    const verificationText = renderLikeText(verification);
    assert.match(verificationText, /launcher/i);
    assert.match(verificationText, /sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/i);
    assert.match(verificationText, /mcp_servers\.launchdeck/i);
    assert.match(verificationText, /launchdeck-agent/i);

    const missingRuntimeEvidence = await adapter.verify({
      fs,
      projectRoot: workspace.projectRoot,
      homeDir: workspace.homeDir,
      target: {
        scope: 'project',
        component: 'mcp',
        configPath: path.join(workspace.projectRoot, '.codex', 'config.toml')
      },
      desiredBuild: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      launcherPath: path.join(workspace.root, 'launcher', 'launchdeck-mcp.cmd'),
      launchdeckHome: path.join(workspace.root, 'launchdeck-home')
    });
    assert.equal(missingRuntimeEvidence.ready, false);
    assert.equal(missingRuntimeEvidence.state, 'failed');
  } finally {
    workspace.cleanup();
  }
});

test('Codex Skill no-op, update, verify, and uninstall require exact owned target path, boundary, and live digest', async () => {
  const adapter = await createAdapter('trusted');
  const workspace = createWorkspace('trusted');

  try {
    const projectTarget = {
      scope: 'project',
      component: 'skill',
      path: path.join(workspace.projectRoot, '.agents', 'skills', 'launchdeck-agent'),
      skillRoot: path.join(workspace.projectRoot, '.agents', 'skills', 'launchdeck-agent'),
      ownershipBoundary: 'launchdeck-agent'
    };
    const userTarget = {
      scope: 'user',
      component: 'skill',
      path: path.join(workspace.homeDir, '.agents', 'skills', 'launchdeck-agent'),
      skillRoot: path.join(workspace.homeDir, '.agents', 'skills', 'launchdeck-agent'),
      ownershipBoundary: 'launchdeck-agent'
    };
    const observedProject = await adapter.inspect(projectTarget, { fs });
    const observedUser = await adapter.inspect(userTarget, { fs });
    assert.equal(observedProject.status, 'present');
    assert.equal(observedUser.status, 'present');
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

    const replayNoop = await adapter.plan(userTarget, {
      fs,
      buildIdentity: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      skillDigest: observedUser.contentDigest,
      receiptOwnership: projectOwnership
    });
    assert.equal(replayNoop.status, 'refused');
    assert.equal(replayNoop.code, 'ownership-collision');

    const replayUpdate = await adapter.plan(userTarget, {
      fs,
      buildIdentity: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      skillDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      receiptOwnership: projectOwnership
    });
    assert.equal(replayUpdate.status, 'refused');
    assert.equal(replayUpdate.code, 'ownership-collision');

    const projectNoop = await adapter.plan(projectTarget, {
      fs,
      buildIdentity: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      skillDigest: observedProject.contentDigest,
      receiptOwnership: projectOwnership
    });
    assert.equal(projectNoop.status, 'no-op');
    assert.deepEqual(projectNoop.actions, []);

    const replayVerification = await adapter.verify({
      fs,
      target: userTarget,
      desiredBuild: {
        skillDigest: observedUser.contentDigest
      },
      receiptOwnership: {
        skill: projectOwnership
      }
    });
    assert.equal(replayVerification.ready, false);
    assert.equal(replayVerification.state, 'failed');

    const ownedVerification = await adapter.verify({
      fs,
      target: projectTarget,
      desiredBuild: {
        skillDigest: observedProject.contentDigest
      },
      receiptOwnership: {
        skill: projectOwnership
      }
    });
    assert.equal(ownedVerification.ready, true);
    assert.equal(ownedVerification.state, 'verified');

    const freshVerification = await adapter.verify({
      fs,
      target: {
        ...projectTarget,
        targetId: 'codex:project:skill'
      },
      desiredBuild: {
        skillDigest: observedProject.contentDigest
      },
      effects: [{
        targetId: 'codex:project:skill',
        afterDigest: observedProject.contentDigest,
        effectCertainty: 'complete'
      }]
    });
    assert.equal(freshVerification.ready, true);
    assert.equal(freshVerification.state, 'verified');

    const replayUninstall = await adapter.uninstall(userTarget, projectOwnership, { fs });
    assert.equal(replayUninstall.status, 'refused');
    assert.equal(replayUninstall.code, 'ownership-mismatch');

    const callerBooleanBypass = await adapter.uninstall(projectTarget, {
      owned: true,
      liveDigestMatches: true,
      path: projectTarget.path,
      component: 'skill'
    }, { fs });
    assert.equal(callerBooleanBypass.status, 'refused');
    assert.equal(callerBooleanBypass.code, 'ownership-mismatch');

    const userReplayToProject = await adapter.plan(projectTarget, {
      fs,
      buildIdentity: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      skillDigest: observedProject.contentDigest,
      receiptOwnership: userOwnership
    });
    assert.equal(userReplayToProject.status, 'refused');
    assert.equal(userReplayToProject.code, 'ownership-collision');
  } finally {
    workspace.cleanup();
  }
});

test('Codex Skill install and update are byte-bound directory transactions with exact rollback', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-codex-skill-transaction-'));
  const projectRoot = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  const targetPath = path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent');
  const firstSource = path.join(root, 'payload-v1', 'launchdeck-agent');
  const secondSource = path.join(root, 'payload-v2', 'launchdeck-agent');
  fs.mkdirSync(path.join(firstSource, 'references'), { recursive: true });
  fs.mkdirSync(path.join(secondSource, 'references'), { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(path.join(firstSource, 'SKILL.md'), '# v1\n');
  fs.writeFileSync(path.join(firstSource, 'references', 'flow.md'), 'flow-v1\n');
  fs.writeFileSync(path.join(secondSource, 'SKILL.md'), '# v2\n');
  fs.writeFileSync(path.join(secondSource, 'references', 'flow.md'), 'flow-v2\n');
  fs.writeFileSync(path.join(secondSource, 'references', 'new.md'), 'new\n');

  const adapter = (await loadCodexModule()).createCodexHostAdapter({
    fs,
    projectRoot,
    homeDir,
    trust: { project: true }
  });
  const target = {
    scope: 'project',
    component: 'skill',
    path: targetPath,
    skillRoot: targetPath,
    ownershipBoundary: 'launchdeck-agent'
  };

  try {
    const firstDigest = (await adapter.inspect({
      ...target,
      path: firstSource,
      skillRoot: firstSource
    })).contentDigest;
    const secondDigest = (await adapter.inspect({
      ...target,
      path: secondSource,
      skillRoot: secondSource
    })).contentDigest;
    const buildIdentity = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const absentPlan = await adapter.plan(target, {
      fs,
      buildIdentity,
      skill: { sourceDir: firstSource, contentDigest: firstDigest }
    });
    assert.equal(absentPlan.status, 'planned');
    assert.equal(absentPlan.actions[0].sourceDir, firstSource);
    assert.equal(absentPlan.actions[0].desiredDigest, firstDigest);
    assert.equal(absentPlan.actions[0].preconditionDigest, sha256(Buffer.alloc(0)));

    const absentEffect = await adapter.apply(absentPlan.actions[0], {}, { fs });
    assert.equal(absentEffect.status, 'applied');
    assert.equal(absentEffect.digest, firstDigest);
    assert.equal((await adapter.inspect(target, { fs })).contentDigest, firstDigest);

    const ownership = {
      owner: 'launchdeck-agent-installer',
      component: 'skill',
      path: targetPath,
      ownershipBoundary: 'launchdeck-agent',
      liveDigest: firstDigest
    };
    const updatePlan = await adapter.plan(target, {
      fs,
      buildIdentity,
      skill: { sourceDir: secondSource, contentDigest: secondDigest },
      receiptOwnership: ownership
    });
    const updateAction = updatePlan.actions[0];
    const backup = await adapter.backup(updateAction, {}, { fs });
    assert.equal(backup.kind, 'directory');
    assert.equal(backup.digest, firstDigest);

    const corruptingFs = {
      ...fs,
      writeFileSync(filePath, bytes, options) {
        if (String(filePath).includes('.launchdeck-') && String(filePath).endsWith('SKILL.md')) {
          return fs.writeFileSync(filePath, Buffer.concat([Buffer.from(bytes), Buffer.from('corrupt')]), options);
        }
        return fs.writeFileSync(filePath, bytes, options);
      }
    };
    const refused = await adapter.apply(updateAction, {}, { fs: corruptingFs });
    assert.equal(refused.status, 'refused');
    assert.equal(refused.code, 'skill-staging-verification-failed');
    assert.equal((await adapter.inspect(target, { fs })).contentDigest, firstDigest);

    const updateEffect = await adapter.apply(updateAction, {}, { fs });
    assert.equal(updateEffect.digest, secondDigest);
    assert.equal((await adapter.inspect(target, { fs })).contentDigest, secondDigest);
    const rollback = await adapter.rollback(updateEffect, backup, {}, { fs });
    assert.equal(rollback.status, 'rolled-back');
    assert.equal(rollback.verified, true);
    assert.equal(rollback.restoredDigest, firstDigest);
    assert.equal((await adapter.inspect(target, { fs })).contentDigest, firstDigest);
    assert.equal(fs.readFileSync(path.join(targetPath, 'SKILL.md'), 'utf8'), '# v1\n');
    assert.equal(fs.existsSync(path.join(targetPath, 'references', 'new.md')), false);

    const uninstallPlan = await adapter.uninstall(target, ownership, { fs });
    assert.equal(uninstallPlan.status, 'planned');
    assert.equal(uninstallPlan.actions[0].kind, 'remove-owned-skill');
    const uninstallAction = {
      ...uninstallPlan.actions[0],
      preconditionDigest: firstDigest,
      desiredDigest: sha256(Buffer.alloc(0))
    };
    const uninstallBackup = await adapter.backup(uninstallAction, {}, { fs });
    assert.equal(uninstallBackup.kind, 'directory');
    assert.equal(uninstallBackup.digest, firstDigest);
    const uninstallEffect = await adapter.apply(uninstallAction, {}, { fs });
    assert.equal(uninstallEffect.status, 'applied');
    assert.equal(uninstallEffect.digest, sha256(Buffer.alloc(0)));
    assert.equal(fs.existsSync(targetPath), false);
    const uninstallVerification = await adapter.verify({
      fs,
      target: {
        ...target,
        targetId: 'codex:project:skill'
      },
      desiredBuild: {
        skillDigest: sha256(Buffer.alloc(0))
      },
      effects: [{
        targetId: 'codex:project:skill',
        effectType: 'remove-owned-skill',
        afterDigest: sha256(Buffer.alloc(0)),
        effectCertainty: 'complete'
      }]
    });
    assert.equal(uninstallVerification.ready, true);
    assert.equal(uninstallVerification.state, 'verified');
    const uninstallRollback = await adapter.rollback({
      ...uninstallEffect,
      effectType: 'remove-owned-skill'
    }, uninstallBackup, {}, { fs });
    assert.equal(uninstallRollback.status, 'rolled-back');
    assert.equal(uninstallRollback.restoredDigest, firstDigest);
    assert.equal((await adapter.inspect(target, { fs })).contentDigest, firstDigest);

    const missingPayload = await adapter.plan({
      ...target,
      path: path.join(projectRoot, '.agents', 'skills', 'missing'),
      skillRoot: path.join(projectRoot, '.agents', 'skills', 'missing')
    }, { fs, buildIdentity });
    assert.equal(missingPayload.status, 'refused');
    assert.equal(missingPayload.code, 'skill-payload-unavailable');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function loadCodexModule() {
  return import(codexModuleUrl);
}

async function createAdapter(template) {
  const mod = await loadCodexModule();
  const factory = pickFactory(mod);
  assert.equal(typeof factory, 'function', 'planned T013 Codex adapter factory export is required');
  return factory({
    fs,
    projectRoot: fixtureRoot,
    homeDir: fixtureRoot,
    packageRoot: fixtureRoot,
    probes: template === 'trusted' ? buildSupportedProbes() : buildUnsupportedProbes(),
    trust: { project: template === 'trusted' },
    host: 'codex',
    evaluateCapability: (request) => ({
      supportState: request.exactVersion === '0.96.0' ? 'supported' : 'unsupported',
      rowId: `fixture-${request.component}-${request.scope}`,
      reason: request.exactVersion === '0.96.0' ? undefined : 'absent-capability-row'
    })
  });
}

function pickFactory(mod) {
  return mod.createCodexHostAdapter ?? mod.createAdapter ?? mod.codexHostAdapter ?? mod.default;
}

function createWorkspace(template) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `launchdeck-codex-${template}-`));
  const projectRoot = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  fs.mkdirSync(path.join(projectRoot, '.codex'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent', 'references'), { recursive: true });
  fs.mkdirSync(path.join(homeDir, '.agents', 'skills', 'launchdeck-agent', 'references'), { recursive: true });

  fs.writeFileSync(path.join(projectRoot, '.codex', 'config.toml'), readFixture(`toml/${template}.toml`));
  fs.writeFileSync(path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent', 'SKILL.md'), readFixture('skill/SKILL.md'));
  fs.writeFileSync(
    path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent', 'references', 'ownership.md'),
    readFixture('skill/references/ownership.md')
  );
  fs.writeFileSync(path.join(homeDir, '.agents', 'skills', 'launchdeck-agent', 'SKILL.md'), readFixture('skill/SKILL.md'));
  fs.writeFileSync(
    path.join(homeDir, '.agents', 'skills', 'launchdeck-agent', 'references', 'ownership.md'),
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

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}
