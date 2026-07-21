import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readJson, runPluginBuild } from './fixtures/build-harness.js';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const forbidden = readJson(new URL('./fixtures/forbidden-host-fields.json', import.meta.url));
const policyTerms = ['operation', 'ownership', 'journal', 'risk', 'retry', 'fallback', 'adoption', 'clean', 'state'];
let root;
let outputDir;

test.before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-final-policy-'));
  outputDir = path.join(root, 'build');
  const result = runPluginBuild(outputDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('generated host manifests are routing metadata, while compatibility remains the shared identity record', () => {
  const compatibility = readJson(path.join(repoRoot, 'agent', 'compatibility-manifest.json'));
  for (const host of ['codex', 'claude']) {
    const plugin = readJson(path.join(outputDir, host, `.${host}-plugin`, 'plugin.json'));
    const mcp = readJson(path.join(outputDir, host, '.mcp.json'));
    const emittedCompatibility = readJson(path.join(outputDir, host, 'compatibility.json'));
    const serialized = JSON.stringify({ plugin, mcp }).toLowerCase();

    assert.equal(emittedCompatibility.buildIdentity, compatibility.buildIdentity, host);
    for (const key of forbidden.forbiddenKeys) assert.equal(hasKey({ plugin, mcp }, key), false, `${host}:${key}`);
    for (const term of policyTerms) assert.equal(serialized.includes(term), false, `${host}:${term}`);
  }
});

test('host-specific launch roots are precise and cannot leak into the other host package', () => {
  const codex = readJson(path.join(outputDir, 'codex', '.mcp.json')).mcpServers.launchdeck;
  const claude = readJson(path.join(outputDir, 'claude', '.mcp.json')).mcpServers.launchdeck;
  assert.deepEqual(codex.args, ['./runtime/launchdeck-mcp.mjs']);
  assert.deepEqual(codex.env, { LAUNCHDECK_AGENT_HOST: 'codex' });
  assert.deepEqual(codex.env_vars, ['LAUNCHDECK_HOME']);
  assert.deepEqual(claude.args, ['${CLAUDE_PLUGIN_ROOT}/runtime/launchdeck-mcp.mjs']);
  assert.equal(JSON.stringify(codex).includes('CLAUDE_PLUGIN_ROOT'), false);
  assert.equal(JSON.stringify(claude).includes('LAUNCHDECK_HOME'), false);
});

function hasKey(value, expected) {
  if (Array.isArray(value)) return value.some((entry) => hasKey(entry, expected));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) => key === expected || hasKey(entry, expected));
}
