import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSkillContentManifest } from '../../src/agent-installer.js';
import { computeBuildIdentity, validateCompatibilityManifest } from '../../src/kernel/compatibility.js';
import {
  archiveInventory,
  readJson,
  repoRoot,
  runPluginBuild,
  sha256File,
  treeInventory
} from './fixtures/build-harness.js';

const expectedInventory = readJson(new URL('./fixtures/expected-inventory.json', import.meta.url));
let root;
let first;
let second;

test.before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-plugin-generation-'));
  first = build(path.join(root, 'first'));
  second = build(path.join(root, 'second'));
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('two clean builds produce byte-identical host trees, archives, and shared build identity', () => {
  assert.equal(first.json.buildIdentity, second.json.buildIdentity);
  for (const host of ['codex', 'claude']) {
    assert.deepEqual(treeInventory(path.join(first.outputDir, host)), treeInventory(path.join(second.outputDir, host)), host);
    const firstArchive = path.join(first.outputDir, `launchdeck-${host}-plugin.tgz`);
    const secondArchive = path.join(second.outputDir, `launchdeck-${host}-plugin.tgz`);
    assert.equal(sha256File(firstArchive), sha256File(secondArchive), host);
    assert.deepEqual(archiveInventory(firstArchive), expectedInventory[host], host);
  }
});

test('Codex and Claude artifacts have exact separate inventories with byte-identical shared components', () => {
  for (const host of ['codex', 'claude']) {
    assert.deepEqual(treeInventory(path.join(first.outputDir, host)).map((entry) => entry.path), expectedInventory[host], host);
  }
  for (const relative of [
    'runtime/launchdeck-mcp.mjs',
    'compatibility.json',
    ...expectedInventory.codex.filter((entry) => entry.startsWith('skills/'))
  ]) {
    assert.equal(
      sha256File(path.join(first.outputDir, 'codex', relative)),
      sha256File(path.join(first.outputDir, 'claude', relative)),
      relative
    );
  }
});

test('compatibility and integrity files bind runtime, canonical Skill, and every shipped byte', () => {
  const canonicalSkill = createSkillContentManifest(path.join(repoRoot, '.agents', 'skills', 'launchdeck-agent'));
  for (const host of ['codex', 'claude']) {
    const artifactRoot = path.join(first.outputDir, host);
    const compatibility = readJson(path.join(artifactRoot, 'compatibility.json'));
    const validation = validateCompatibilityManifest(compatibility);
    assert.equal(validation.ok, true, JSON.stringify(validation.errors));
    assert.equal(computeBuildIdentity(compatibility), compatibility.buildIdentity);
    assert.equal(compatibility.buildIdentity, first.json.buildIdentity);
    assert.equal(compatibility.componentDigests.runtimeBundle, sha256File(path.join(artifactRoot, 'runtime', 'launchdeck-mcp.mjs')));
    assert.equal(compatibility.componentDigests.canonicalSkillContentManifest, canonicalSkill.contentDigest);

    const integrity = readJson(path.join(artifactRoot, 'artifact-integrity.json'));
    assert.equal(integrity.buildIdentity, compatibility.buildIdentity);
    const expected = treeInventory(artifactRoot).filter((entry) => entry.path !== 'artifact-integrity.json');
    assert.deepEqual(integrity.files, expected);
  }
});

test('generation report is evidence-scoped and never claims Codex or Claude host readiness', () => {
  assert.equal(first.json.evidenceScope, 'generation');
  assert.deepEqual(first.json.readinessClaims, []);
  assert.deepEqual(first.json.artifacts.map((entry) => entry.host), ['codex', 'claude']);
  assert.equal(first.json.artifacts.every((entry) => entry.generated === true), true);
});

test('a strict semver evidence version creates a distinct compatible build without changing the default', () => {
  const version = '0.1.0+codex.local-b';
  const variant = runPluginBuild(path.join(root, 'variant'), ['--package-version', version]);
  assert.equal(variant.status, 0, variant.stderr || variant.stdout);
  assert.notEqual(variant.json.buildIdentity, first.json.buildIdentity);
  for (const host of ['codex', 'claude']) {
    const artifactRoot = path.join(root, 'variant', host);
    const manifestDir = host === 'codex' ? '.codex-plugin' : '.claude-plugin';
    assert.equal(readJson(path.join(artifactRoot, manifestDir, 'plugin.json')).version, version);
    assert.equal(readJson(path.join(artifactRoot, 'compatibility.json')).packageVersion, version);
  }
});

function build(outputDir) {
  const result = runPluginBuild(outputDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(result.json, result.stdout);
  return { ...result, outputDir };
}
