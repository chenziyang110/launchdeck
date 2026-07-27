import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readCodexProjectTrust } from '../../../src/agent/hosts/codex/trust.js';

test('Codex project trust is read only from the exact host-owned trusted project record', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-codex-trust-'));
  const codexHome = path.join(root, 'codex-home');
  const projectRoot = path.join(root, 'Project With Space');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const normalizedProject = path.resolve(projectRoot).toLowerCase();
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    `[projects.'${normalizedProject}']\ntrust_level = 'trusted'\n`,
    'utf8'
  );

  assert.equal(readCodexProjectTrust({
    projectRoot,
    fs,
    env: { CODEX_HOME: codexHome },
    platform: 'win32'
  }), true);
  assert.equal(readCodexProjectTrust({
    projectRoot: path.join(projectRoot, 'nested'),
    fs,
    env: { CODEX_HOME: codexHome },
    platform: 'win32'
  }), false);

  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    `[projects.'${normalizedProject}']\ntrust_level = 'untrusted'\n`,
    'utf8'
  );
  assert.equal(readCodexProjectTrust({
    projectRoot,
    fs,
    env: { CODEX_HOME: codexHome },
    platform: 'win32'
  }), false);
});

test('Codex project trust fails closed for missing or malformed host config', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-codex-trust-'));
  const codexHome = path.join(root, 'codex-home');
  const projectRoot = path.join(root, 'project');
  fs.mkdirSync(codexHome, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const input = {
    projectRoot,
    fs,
    env: { CODEX_HOME: codexHome },
    platform: 'win32'
  };
  assert.equal(readCodexProjectTrust(input), false);

  fs.writeFileSync(path.join(codexHome, 'config.toml'), '[projects\n', 'utf8');
  assert.equal(readCodexProjectTrust(input), false);
});
