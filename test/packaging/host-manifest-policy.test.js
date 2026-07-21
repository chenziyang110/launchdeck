import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readJson, runPluginBuild } from './fixtures/build-harness.js';

const forbidden = readJson(new URL('./fixtures/forbidden-host-fields.json', import.meta.url));
let root;
let outputDir;

test.before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-host-policy-'));
  outputDir = path.join(root, 'build');
  const result = runPluginBuild(outputDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('Codex discovery metadata stays official while compatibility owns shared identity and Node policy', () => {
  const codexPlugin = readJson(path.join(outputDir, 'codex', '.codex-plugin', 'plugin.json'));
  const claudePlugin = readJson(path.join(outputDir, 'claude', '.claude-plugin', 'plugin.json'));
  const codexMcp = readJson(path.join(outputDir, 'codex', '.mcp.json'));
  const claudeMcp = readJson(path.join(outputDir, 'claude', '.mcp.json'));
  const codexCompatibility = readJson(path.join(outputDir, 'codex', 'compatibility.json'));
  const claudeCompatibility = readJson(path.join(outputDir, 'claude', 'compatibility.json'));

  assert.notEqual(codexPlugin.id, claudePlugin.id);
  assert.equal(codexPlugin.name, 'launchdeck');
  assert.equal(codexPlugin.skills, './skills/');
  assert.equal(codexPlugin.mcpServers, './.mcp.json');
  assert.equal(typeof codexPlugin.author, 'object');
  assert.equal(typeof codexPlugin.interface, 'object');
  assert.equal(Object.hasOwn(codexPlugin, 'schemaVersion'), false);
  assert.equal(Object.hasOwn(codexPlugin, 'node'), false);
  assert.equal(Object.hasOwn(codexPlugin, 'buildIdentity'), false);
  assert.equal(codexCompatibility.nodeRange, '>=20');
  assert.equal(claudeCompatibility.nodeRange, '>=20');
  assert.equal(codexCompatibility.buildIdentity, claudeCompatibility.buildIdentity);
  assert.equal(claudePlugin.name, 'launchdeck');
  assert.equal(claudePlugin.displayName, 'Launchdeck');
  assert.equal(typeof claudePlugin.author, 'object');
  for (const key of ['schemaVersion', 'id', 'buildIdentity', 'node', 'components']) {
    assert.equal(Object.hasOwn(claudePlugin, key), false, key);
  }
  for (const manifest of [codexPlugin, claudePlugin, codexMcp, claudeMcp]) {
    visit(manifest, (key, value) => {
      assert.equal(forbidden.forbiddenKeys.includes(key), false, key);
      if (typeof value === 'string') assert.equal(isAbsoluteBuildPath(value), false, value);
    });
  }
});

test('Codex and Claude keep host-specific root strategies separate', () => {
  const codex = readJson(path.join(outputDir, 'codex', '.mcp.json')).mcpServers.launchdeck;
  const claude = readJson(path.join(outputDir, 'claude', '.mcp.json')).mcpServers.launchdeck;
  assert.equal(codex.command, 'node');
  assert.deepEqual(codex.args, ['./runtime/launchdeck-mcp.mjs']);
  assert.equal(codex.cwd, '.');
  assert.deepEqual(codex.env, { LAUNCHDECK_AGENT_HOST: 'codex' });
  assert.deepEqual(codex.env_vars, ['LAUNCHDECK_HOME']);
  assert.equal(JSON.stringify(codex).includes('CLAUDE_PLUGIN_ROOT'), false);
  assert.equal(claude.command, 'node');
  assert.deepEqual(claude.args, ['${CLAUDE_PLUGIN_ROOT}/runtime/launchdeck-mcp.mjs']);
  assert.equal(Object.hasOwn(claude, 'cwd'), false);
});

test('artifact metadata contains no install scripts, global CLI, npx, remote URL, or lifecycle policy token', () => {
  for (const host of ['codex', 'claude']) {
    for (const relative of ['.mcp.json', `.${host === 'codex' ? 'codex' : 'claude'}-plugin/plugin.json`]) {
      const manifest = readJson(path.join(outputDir, host, relative));
      // Claude's documented $schema is editor-only metadata and ignored at load time;
      // it is not a runtime fetch or a bundled dependency.
      if (relative.endsWith('plugin.json')) delete manifest.$schema;
      const content = JSON.stringify(manifest).toLowerCase();
      for (const token of forbidden.forbiddenRuntimeTokens) {
        assert.equal(content.includes(token.toLowerCase()), false, `${host}:${relative}:${token}`);
      }
    }
  }
});

function visit(value, onEntry) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, onEntry);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    onEntry(key, child);
    visit(child, onEntry);
  }
}

function isAbsoluteBuildPath(value) {
  if (value.startsWith('${CLAUDE_PLUGIN_ROOT}/')) return false;
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}
