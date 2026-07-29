import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('real CLI plans cursor project skill setup under the explicit project root', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-cursor-project-'));
  const launchdeckHome = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-home-'));
  const result = spawnSync(process.execPath, [
    'src/cli.js',
    'agent',
    'setup',
    '--host',
    'cursor',
    '--component',
    'skill',
    '--scope',
    'project',
    '--project',
    projectRoot,
    '--dry-run',
    '--json',
    '--yes'
  ], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      LAUNCHDECK_HOME: launchdeckHome
    },
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  const cursorTarget = payload.result.targets.find((target) => target.targetId === 'cursor:project:skill');

  assert.equal(payload.result.outcome, 'planned');
  assert.ok(cursorTarget, 'expected cursor project skill target in dry-run plan');
  assert.equal(
    cursorTarget.path,
    path.join(fs.realpathSync.native(projectRoot), '.agents', 'skills', 'launchdeck-agent')
  );
});

test('real CLI installs a catalog-only skill target and persists a receipt on the first run', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-catalog-project-'));
  const launchdeckHome = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-catalog-home-'));
  const args = [
    'src/cli.js',
    'agent',
    'setup',
    '--host',
    'cursor',
    '--component',
    'skill',
    '--scope',
    'project',
    '--project',
    projectRoot,
    '--json',
    '--yes'
  ];
  const options = {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      LAUNCHDECK_HOME: launchdeckHome
    },
    encoding: 'utf8'
  };

  try {
    const first = spawnSync(process.execPath, args, options);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const firstPayload = JSON.parse(first.stdout);
    assert.equal(firstPayload.result.outcome, 'succeeded');
    assert.equal(firstPayload.result.effectCertainty, 'complete');
    assert.match(firstPayload.result.receiptId, /^receipt_/);
    assert.equal(
      fs.existsSync(path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent', 'SKILL.md')),
      true
    );

    const second = spawnSync(process.execPath, args, options);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const secondPayload = JSON.parse(second.stdout);
    assert.equal(secondPayload.result.outcome, 'noop');
    assert.equal(secondPayload.result.effectCertainty, 'none');

    const uninstallArgs = args.map((value) => value === 'setup' ? 'uninstall' : value);
    const uninstall = spawnSync(process.execPath, uninstallArgs, options);
    assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
    const uninstallPayload = JSON.parse(uninstall.stdout);
    assert.equal(uninstallPayload.result.outcome, 'succeeded');
    assert.equal(uninstallPayload.result.effectCertainty, 'complete');
    assert.equal(
      fs.existsSync(path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent')),
      false
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(launchdeckHome, { recursive: true, force: true });
  }
});
