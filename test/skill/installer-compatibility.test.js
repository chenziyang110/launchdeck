import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  doctorAgentInstaller,
  installAgentSkill,
  listAgentTargets
} from '../../src/agent-installer.js';
import * as installer from '../../src/agent-installer.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const canonicalSkill = path.join(repoRoot, '.agents', 'skills', 'launchdeck-agent');

test('new Codex user installs prefer $HOME/.agents and remain idempotent', () => {
  const fixture = createFixture();
  try {
    const targets = listAgentTargets(fixture.options);
    const codexUser = targets.targets.find((target) => target.agent === 'codex' && target.scope === 'user');
    assert.equal(codexUser.skillRoot, path.join(fixture.homeDir, '.agents', 'skills'));

    const first = installAgentSkill({ ...fixture.options, agent: 'codex', scope: 'user' });
    assert.equal(first.target.targetDir, fixture.currentPath);
    assert.equal(first.result.status, 'installed');
    const afterFirst = snapshot(fixture.homeDir);

    const second = installAgentSkill({ ...fixture.options, agent: 'codex', scope: 'user' });
    assert.equal(second.result.status, 'already_installed');
    assert.deepEqual(snapshot(fixture.homeDir), afterFirst);
    assert.equal(fs.existsSync(fixture.legacyPath), false);
  } finally {
    fixture.cleanup();
  }
});

test('doctor groups identical current, legacy, project, and Plugin copies with current preference', () => {
  const fixture = createFixture();
  try {
    for (const target of [fixture.currentPath, fixture.legacyPath, fixture.projectPath, fixture.pluginPath]) {
      copyCanonical(target);
    }
    const before = snapshot(fixture.root);
    const observation = inspect(fixture.options);
    assert.equal(observation.status, 'identical_duplicates');
    assert.equal(observation.preferredLocationId, 'codex:user-current');
    assert.equal(observation.groups.length, 1);
    assert.equal(observation.groups[0].locationIds.length, 4);
    assert.deepEqual(observation.locations.map((entry) => entry.id), [
      'codex:user-current',
      'codex:user-legacy',
      'codex:project',
      'codex:plugin:fixture-plugin'
    ]);
    assert.equal(observation.locations.every((entry) => entry.relation === 'canonical'), true);

    const doctor = doctorAgentInstaller(fixture.options);
    assert.equal(doctor.skillInstallations.status, 'identical_duplicates');
    assert.deepEqual(snapshot(fixture.root), before);
  } finally {
    fixture.cleanup();
  }
});

test('divergent current, legacy, project, and Plugin bytes are preserved with no silent winner', () => {
  const fixture = createFixture();
  try {
    copyCanonical(fixture.currentPath);
    copyCanonical(fixture.legacyPath);
    copyCanonical(fixture.projectPath);
    copyCanonical(fixture.pluginPath);
    fs.appendFileSync(path.join(fixture.legacyPath, 'SKILL.md'), '\nlegacy-local-change\n');
    fs.appendFileSync(path.join(fixture.pluginPath, 'SKILL.md'), '\nplugin-build-change\n');
    const before = snapshot(fixture.root);

    const observation = inspect(fixture.options);
    assert.equal(observation.status, 'divergent');
    assert.equal(observation.preferredLocationId, null);
    assert.equal(observation.groups.length, 3);
    assert.equal(observation.locations.find((entry) => entry.id === 'codex:user-current').relation, 'canonical');
    assert.equal(observation.locations.find((entry) => entry.id === 'codex:user-legacy').relation, 'divergent');
    assert.equal(observation.locations.find((entry) => entry.id === 'codex:plugin:fixture-plugin').relation, 'divergent');
    assert.match(observation.guidance.join('\n'), /preserv|choose|select/i);

    const doctor = doctorAgentInstaller(fixture.options);
    assert.equal(doctor.skillInstallations.preferredLocationId, null);
    assert.deepEqual(snapshot(fixture.root), before);
  } finally {
    fixture.cleanup();
  }
});

test('default user install and force both refuse divergent discovered content without byte changes', () => {
  const fixture = createFixture();
  try {
    copyCanonical(fixture.currentPath);
    fs.writeFileSync(path.join(fixture.currentPath, 'SKILL.md'), 'user-owned divergent current content\n');
    copyCanonical(fixture.legacyPath);
    fs.writeFileSync(path.join(fixture.legacyPath, 'SKILL.md'), 'user-owned divergent legacy content\n');
    const before = snapshot(fixture.root);

    for (const force of [false, true]) {
      assert.throws(
        () => installAgentSkill({ ...fixture.options, agent: 'codex', scope: 'user', force }),
        (error) => error?.code === 'agent_target_conflict' && error?.details?.divergentLocations?.length >= 1,
        `force=${force}`
      );
      assert.deepEqual(snapshot(fixture.root), before, `force=${force}`);
    }
  } finally {
    fixture.cleanup();
  }
});

test('a divergent legacy copy blocks automatic creation of a competing current copy', () => {
  const fixture = createFixture();
  try {
    copyCanonical(fixture.legacyPath);
    fs.appendFileSync(path.join(fixture.legacyPath, 'SKILL.md'), '\nlegacy custom behavior\n');
    const before = snapshot(fixture.root);

    assert.throws(
      () => installAgentSkill({ ...fixture.options, agent: 'codex', scope: 'user' }),
      (error) => error?.code === 'agent_target_conflict'
    );
    assert.equal(fs.existsSync(fixture.currentPath), false);
    assert.deepEqual(snapshot(fixture.root), before);
  } finally {
    fixture.cleanup();
  }
});

test('symlinked Skill copies are diagnosed without traversal or mutation', () => {
  const fixture = createFixture();
  try {
    const linkedSkill = path.join(fixture.root, 'linked-skill');
    copyCanonical(linkedSkill);
    fs.mkdirSync(path.dirname(fixture.pluginPath), { recursive: true });
    fs.symlinkSync(linkedSkill, fixture.pluginPath, 'junction');
    const before = snapshot(fixture.root, { followSymlinks: false });

    const observation = inspect(fixture.options);
    const plugin = observation.locations.find((entry) => entry.id === 'codex:plugin:fixture-plugin');
    assert.equal(plugin.relation, 'invalid');
    assert.equal(plugin.code, 'agent_skill_symlink');
    assert.equal(observation.preferredLocationId, null);
    assert.deepEqual(snapshot(fixture.root, { followSymlinks: false }), before);
  } finally {
    fixture.cleanup();
  }
});

function inspect(options) {
  assert.equal(typeof installer.inspectAgentSkillInstallations, 'function', 'inspectAgentSkillInstallations export is required');
  return installer.inspectAgentSkillInstallations(options);
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-skill-installer-'));
  const homeDir = path.join(root, 'home');
  const projectRoot = path.join(root, 'project');
  const pluginRoot = path.join(root, 'plugin');
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(pluginRoot, { recursive: true });
  return {
    root,
    homeDir,
    projectRoot,
    pluginRoot,
    currentPath: path.join(homeDir, '.agents', 'skills', 'launchdeck-agent'),
    legacyPath: path.join(homeDir, '.codex', 'skills', 'launchdeck-agent'),
    projectPath: path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent'),
    pluginPath: path.join(pluginRoot, 'skills', 'launchdeck-agent'),
    options: {
      packageRoot: repoRoot,
      homeDir,
      projectRoot,
      pluginRoots: [{ id: 'fixture-plugin', host: 'codex', path: pluginRoot }]
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

function copyCanonical(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(canonicalSkill, target, { recursive: true });
}

function snapshot(root, options = {}) {
  const entries = [];
  walk(root, root, entries, options);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function walk(root, current, entries, options) {
  if (!fs.existsSync(current)) return;
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (entry.isSymbolicLink()) {
      entries.push({ path: relative, kind: 'symlink', target: fs.readlinkSync(absolute) });
    } else if (entry.isDirectory()) {
      entries.push({ path: `${relative}/`, kind: 'directory' });
      walk(root, absolute, entries, options);
    } else {
      const content = fs.readFileSync(absolute);
      entries.push({ path: relative, kind: 'file', bytes: content.length, content: content.toString('base64') });
    }
  }
}
