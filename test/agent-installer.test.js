import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createCliFixture, repoRoot } from './helpers/cli-fixture.js';

test('agent paths reports canonical source and supported adapter targets', () => {
  const fixture = createCliFixture();

  try {
    const result = fixture.runCliJson(['agent', 'paths', '--compact']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.command, 'agent');
    assert.equal(result.json.action, 'paths');
    assert.equal(result.json.source.exists, true);
    assert.equal(result.json.source.path, path.join(repoRoot, '.agents', 'skills', 'launchdeck-agent'));

    const ids = result.json.targets.map((target) => `${target.agent}:${target.scope}:${target.skillRoot}`);
    assert.ok(ids.includes(`codex:project:${path.join(fixture.projectRoot, '.agents', 'skills')}`));
    assert.ok(ids.includes(`claude-code:project:${path.join(fixture.projectRoot, '.claude', 'skills')}`));
    assert.ok(ids.includes(`github-copilot:project:${path.join(fixture.projectRoot, '.github', 'skills')}`));
    assert.ok(ids.includes(`visual-studio:project:${path.join(fixture.projectRoot, '.github', 'skills')}`));
  } finally {
    fixture.cleanup();
  }
});

test('agent doctor validates canonical source and adapter matrix', () => {
  const fixture = createCliFixture();

  try {
    const result = fixture.runCliJson(['agent', 'doctor', '--compact']);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.action, 'doctor');
    assert.equal(result.json.status, 'ok');
    assert.equal(result.json.summary.error, 0);
    assert.ok(result.json.checks.some((check) => check.code === 'canonical_source_exists' && check.status === 'pass'));
    assert.ok(result.json.checks.some((check) => check.code === 'adapter_matrix_ready' && check.status === 'pass'));
  } finally {
    fixture.cleanup();
  }
});

test('agent install dry-run plans copy without mutating the target', () => {
  const fixture = createCliFixture();
  const skillRoot = fixture.path('skill-target');

  try {
    const result = fixture.runCliJson([
      'agent',
      'install',
      '--agent',
      'claude-code',
      '--target',
      skillRoot,
      '--dry-run'
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.dryRun, true);
    assert.equal(result.json.result.status, 'planned');
    assert.equal(fs.existsSync(path.join(skillRoot, 'launchdeck-agent')), false);
  } finally {
    fixture.cleanup();
  }
});

test('agent install compact output summarizes actions without verbose copy paths', () => {
  const fixture = createCliFixture();
  const skillRoot = fixture.path('skill-target');

  try {
    const result = fixture.runCliJson([
      'agent',
      'install',
      '--agent',
      'claude-code',
      '--target',
      skillRoot,
      '--dry-run',
      '--compact'
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.result.status, 'planned');
    assert.equal(result.json.result.actionCount, 10);
    assert.equal(result.json.result.actionCounts.mkdir, 2);
    assert.equal(result.json.result.actionCounts.copy_file, 8);
    assert.ok(result.json.result.files.includes('SKILL.md'));
    assert.equal(result.json.result.actions, undefined);
    assert.equal(result.json.target.dir, path.join(skillRoot, 'launchdeck-agent'));
  } finally {
    fixture.cleanup();
  }
});

test('agent install copies canonical skill into explicit target and is idempotent', () => {
  const fixture = createCliFixture();
  const skillRoot = fixture.path('skill-target');
  const skillDir = path.join(skillRoot, 'launchdeck-agent');

  try {
    const installed = fixture.runCliJson([
      'agent',
      'install',
      '--agent',
      'claude-code',
      '--target',
      skillRoot
    ]);

    assert.equal(installed.status, 0, installed.stderr);
    assert.equal(installed.json.ok, true);
    assert.equal(installed.json.result.status, 'installed');
    assert.equal(fs.existsSync(path.join(skillDir, 'SKILL.md')), true);

    const again = fixture.runCliJson([
      'agent',
      'install',
      '--agent',
      'claude-code',
      '--target',
      skillRoot
    ]);

    assert.equal(again.status, 0, again.stderr);
    assert.equal(again.json.result.status, 'already_installed');
    assert.equal(again.json.result.actions.length, 0);
  } finally {
    fixture.cleanup();
  }
});

test('agent install refuses divergent target unless forced', () => {
  const fixture = createCliFixture();
  const skillRoot = fixture.path('skill-target');
  const skillDir = path.join(skillRoot, 'launchdeck-agent');

  try {
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'local divergent content\n');
    fs.writeFileSync(path.join(skillDir, 'local-note.txt'), 'keep me\n');

    const refused = fixture.runCliJson([
      'agent',
      'install',
      '--agent',
      'claude-code',
      '--target',
      skillRoot
    ]);

    assert.equal(refused.status, 1);
    assert.equal(refused.json.ok, false);
    assert.equal(refused.json.error.code, 'agent_target_conflict');
    assert.equal(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'), 'local divergent content\n');

    const forced = fixture.runCliJson([
      'agent',
      'install',
      '--agent',
      'claude-code',
      '--target',
      skillRoot,
      '--force'
    ]);

    assert.equal(forced.status, 0, forced.stderr);
    assert.equal(forced.json.result.status, 'installed');
    assert.match(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'), /name: launchdeck-agent/);
    assert.equal(fs.readFileSync(path.join(skillDir, 'local-note.txt'), 'utf8'), 'keep me\n');
  } finally {
    fixture.cleanup();
  }
});

test('agent install refuses a non-directory skill target even when forced', () => {
  const fixture = createCliFixture();
  const skillRoot = fixture.path('skill-target');

  try {
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, 'launchdeck-agent'), 'not a directory\n');

    const result = fixture.runCliJson([
      'agent',
      'install',
      '--agent',
      'claude-code',
      '--target',
      skillRoot,
      '--force'
    ]);

    assert.equal(result.status, 1);
    assert.equal(result.json.ok, false);
    assert.equal(result.json.error.code, 'agent_target_conflict');
    assert.match(result.json.error.message, /not a directory/);
    assert.equal(fs.readFileSync(path.join(skillRoot, 'launchdeck-agent'), 'utf8'), 'not a directory\n');
  } finally {
    fixture.cleanup();
  }
});
