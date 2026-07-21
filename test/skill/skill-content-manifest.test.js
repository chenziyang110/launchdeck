import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as installer from '../../src/agent-installer.js';
import { canonicalDigest } from '../../src/kernel/compatibility.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const canonicalSkill = path.join(repoRoot, '.agents', 'skills', 'launchdeck-agent');

test('canonical Skill content manifest is sorted, path-normalized, and self-verifying', () => {
  const manifest = createManifest(canonicalSkill);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.skillName, 'launchdeck-agent');
  assert.equal(manifest.files.length, 8);
  assert.deepEqual(manifest.files.map((entry) => entry.path), [...manifest.files.map((entry) => entry.path)].sort());
  assert.equal(manifest.files.every((entry) => !entry.path.includes('\\')), true);
  assert.equal(manifest.files.every((entry) => /^sha256:[0-9a-f]{64}$/.test(entry.sha256)), true);
  assert.equal(manifest.files.every((entry) => Number.isSafeInteger(entry.bytes) && entry.bytes >= 0), true);
  assert.equal(manifest.contentDigest, canonicalDigest({
    schemaVersion: manifest.schemaVersion,
    skillName: manifest.skillName,
    files: manifest.files
  }));
});

test('identical copies share one digest while one changed byte produces divergence', () => {
  const root = tempRoot();
  try {
    const left = path.join(root, 'left');
    const right = path.join(root, 'right');
    fs.cpSync(canonicalSkill, left, { recursive: true });
    fs.cpSync(canonicalSkill, right, { recursive: true });
    assert.equal(createManifest(left).contentDigest, createManifest(right).contentDigest);

    fs.appendFileSync(path.join(right, 'SKILL.md'), '\nlocal divergence\n');
    assert.notEqual(createManifest(left).contentDigest, createManifest(right).contentDigest);
  } finally {
    cleanup(root);
  }
});

test('content manifest rejects symlinks instead of following content outside the Skill tree', () => {
  const root = tempRoot();
  try {
    const skill = path.join(root, 'skill');
    const outside = path.join(root, 'outside');
    fs.cpSync(canonicalSkill, skill, { recursive: true });
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'outside.md'), 'outside\n');
    fs.symlinkSync(outside, path.join(skill, 'references', 'linked-outside'), 'junction');

    assert.throws(
      () => createManifest(skill),
      (error) => error?.code === 'agent_skill_symlink'
    );
  } finally {
    cleanup(root);
  }
});

function createManifest(skillDir) {
  assert.equal(typeof installer.createSkillContentManifest, 'function', 'createSkillContentManifest export is required');
  return installer.createSkillContentManifest(skillDir);
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-skill-manifest-'));
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}
