import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { digestCanonical } from '../../../src/agent/digests.js';
import {
  evaluateClaudeCopilotCoexistence,
  resolveClaudeCopilotProjectMcpTarget
} from '../../../src/agent/hosts/coexistence-gate.js';
import { createHostRegistry } from '../../../src/agent/hosts/index.js';
import { planSharedMcpJsonMutation } from '../../../src/agent/hosts/shared-mcp-json.js';

const fixtureRoot = fileURLToPath(
  new URL('../../fixtures/agent-hosts/claude-copilot-coexistence/', import.meta.url)
);
const BUILD_IDENTITY = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const LAUNCHER_PATH = path.resolve('launchdeck-home', 'bin', 'launchdeck-mcp.cmd');

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8'));
}

function desiredEntry() {
  return {
    ...fixture('desired-entry.json'),
    command: LAUNCHER_PATH
  };
}

function config(name, configPath) {
  const document = fixture(name);
  return {
    path: configPath,
    document,
    source: `${JSON.stringify(document, null, 2)}\n`
  };
}

function exactHosts(overrides = {}) {
  const entryDigest = digestCanonical(desiredEntry());
  return [
    {
      host: 'claude-code',
      exactVersion: '1.5.0',
      buildIdentity: BUILD_IDENTITY,
      entryDigest,
      launcherPath: LAUNCHER_PATH,
      ...overrides.claude
    },
    {
      host: 'github-copilot',
      exactVersion: '1.4.2',
      buildIdentity: BUILD_IDENTITY,
      entryDigest,
      launcherPath: LAUNCHER_PATH,
      ...overrides.copilot
    }
  ];
}

function coexistenceRegistry(revision = 'coexistence-test-matrix-v1') {
  return createHostRegistry({
    matrix: {
      schemaVersion: 1,
      revision,
      rows: [],
      sharedMcpCoexistence: fixture('coexistence-matrix.json')
    }
  });
}

function eligibility(overrides = {}) {
  const registry = coexistenceRegistry();
  return registry.evaluateCoexistence({
    hosts: exactHosts(overrides),
    platform: 'win32',
    scope: 'project'
  });
}

test('an exact maintained version pair with one build and entry identity is shared-root eligible', () => {
  const result = eligibility();

  assert.equal(result.status, 'eligible');
  assert.equal(result.pairId, 'claude-1.5.0-copilot-1.4.2-win32-project');
  assert.equal(result.configPath, '.mcp.json');
  assert.equal(result.dialect, 'mcpServers.launchdeck');
  assert.equal(result.buildIdentity, BUILD_IDENTITY);
  assert.equal(result.entryDigest, digestCanonical(desiredEntry()));
  assert.equal(result.launcherPath, LAUNCHER_PATH);
  assert.equal(result.matrixRevision, 'coexistence-test-matrix-v1');
  assert.deepEqual(result.hosts, ['claude-code', 'github-copilot']);
  assert.equal(result.evidenceRevision, 'synthetic-coexistence-v1');
});

test('an unproven exact pair refuses without actions or artifact mutation', () => {
  const result = eligibility({
    copilot: { exactVersion: '1.4.3' }
  });

  assert.equal(result.status, 'refused');
  assert.equal(result.code, 'shared_mcp_pair_not_proven');
  assert.equal(result.effectCertainty, 'no-write');
  assert.equal('actions' in result, false);
  assert.equal('artifacts' in result, false);
});

test('mixed build or entry identities refuse even for a proven version pair', () => {
  const mixedBuild = eligibility({
    copilot: {
      buildIdentity: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    }
  });
  assert.equal(mixedBuild.status, 'refused');
  assert.equal(mixedBuild.code, 'shared_mcp_build_identity_mismatch');
  assert.equal(mixedBuild.effectCertainty, 'no-write');

  const mixedEntry = eligibility({
    copilot: {
      entryDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    }
  });
  assert.equal(mixedEntry.status, 'refused');
  assert.equal(mixedEntry.code, 'shared_mcp_entry_identity_mismatch');
  assert.equal(mixedEntry.effectCertainty, 'no-write');

  const mixedLauncher = eligibility({
    copilot: { launcherPath: path.resolve('other-home', 'bin', 'launchdeck-mcp.cmd') }
  });
  assert.equal(mixedLauncher.status, 'refused');
  assert.equal(mixedLauncher.code, 'shared_mcp_launcher_identity_mismatch');
});

test('native single-host paths remain unchanged and only an eligible pair selects shared root', () => {
  const projectRoot = path.resolve('workspace');

  assert.equal(resolveClaudeCopilotProjectMcpTarget({
    projectRoot,
    hosts: ['claude-code']
  }).path, path.join(projectRoot, '.mcp.json'));

  assert.equal(resolveClaudeCopilotProjectMcpTarget({
    projectRoot,
    hosts: ['github-copilot']
  }).path, path.join(projectRoot, '.github', 'mcp.json'));

  const shared = resolveClaudeCopilotProjectMcpTarget({
    projectRoot,
    hosts: ['claude-code', 'github-copilot'],
    eligibility: eligibility()
  });
  assert.equal(shared.path, path.join(projectRoot, '.mcp.json'));
  assert.equal(shared.shared, true);
  assert.deepEqual(shared.hosts, ['claude-code', 'github-copilot']);
});

test('the owning registry normalizes only the exact eligible shared pair', () => {
  const registry = coexistenceRegistry();
  const evidence = exactHosts();
  const approved = registry.evaluateCoexistence({
    hosts: evidence,
    platform: 'win32',
    scope: 'project'
  });
  const sharedPath = path.join(path.resolve('workspace'), '.mcp.json');
  const resolution = registry.normalizeTargets(evidence.map((host) => ({
    ...host,
    component: 'mcp',
    scope: 'project',
    path: sharedPath
  })), { eligibility: approved });

  assert.equal(resolution.status, 'resolved');
  assert.equal(resolution.targets.length, 1);
  assert.equal(resolution.targets[0].host, 'shared');
  assert.equal(resolution.targets[0].matrixRevision, 'coexistence-test-matrix-v1');
  assert.equal(
    resolution.targets[0].coexistenceRevision,
    'claude-copilot-coexistence-contract-v1'
  );

  const otherRegistry = coexistenceRegistry('other-matrix-v1');
  const mismatch = otherRegistry.normalizeTargets(evidence.map((host) => ({
    ...host,
    component: 'mcp',
    scope: 'project',
    path: sharedPath
  })), { eligibility: approved });
  assert.equal(mismatch.kind, 'refusal');
  assert.equal(mismatch.code, 'shared_mcp_coexistence_revision_mismatch');
});

test('shared strict JSON rewrite preserves unrelated data and writes one exact entry', () => {
  const projectRoot = path.resolve('workspace');
  const sharedPath = path.join(projectRoot, '.mcp.json');
  const copilotPath = path.join(projectRoot, '.github', 'mcp.json');
  const entry = desiredEntry();
  const plan = planSharedMcpJsonMutation({
    eligibility: eligibility(),
    sharedConfig: config('shared-base.json', sharedPath),
    copilotConfig: config('copilot-base.json', copilotPath),
    desiredEntry: entry
  });

  assert.equal(plan.status, 'planned');
  assert.equal(plan.ownershipBoundary, 'mcpServers.launchdeck');
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].type, 'replace-json-file');
  assert.equal(plan.actions[0].path, sharedPath);
  assert.equal(plan.actions[0].ownedPath.join('.'), 'mcpServers.launchdeck');
  assert.equal(
    plan.actions[0].preconditionDigest,
    `sha256:${createHash('sha256')
      .update(config('shared-base.json', sharedPath).source)
      .digest('hex')}`
  );
  const rewritten = JSON.parse(plan.actions[0].content);
  assert.deepEqual(rewritten.metadata, fixture('shared-base.json').metadata);
  assert.deepEqual(rewritten.mcpServers.keep, fixture('shared-base.json').mcpServers.keep);
  assert.deepEqual(rewritten.mcpServers.launchdeck, entry);
  assert.equal(rewritten.mcpServers.launchdeck.args.includes(BUILD_IDENTITY), true);
  assert.equal('launchdeck' in fixture('copilot-base.json').mcpServers, false);
});

test('duplicate launchdeck names across shared and Copilot-native locations refuse before rewrite', () => {
  const projectRoot = path.resolve('workspace');
  const result = planSharedMcpJsonMutation({
    eligibility: eligibility(),
    sharedConfig: config('shared-duplicate.json', path.join(projectRoot, '.mcp.json')),
    copilotConfig: config(
      'copilot-duplicate.json',
      path.join(projectRoot, '.github', 'mcp.json')
    ),
    desiredEntry: desiredEntry()
  });

  assert.equal(result.status, 'refused');
  assert.equal(result.code, 'duplicate_launchdeck_workspace_entries');
  assert.equal(result.effectCertainty, 'no-write');
  assert.equal('actions' in result, false);
});

test('a refusal from the coexistence gate cannot be converted into a JSON plan', () => {
  const projectRoot = path.resolve('workspace');
  const result = planSharedMcpJsonMutation({
    eligibility: eligibility({ copilot: { exactVersion: '1.4.3' } }),
    sharedConfig: config('shared-base.json', path.join(projectRoot, '.mcp.json')),
    copilotConfig: config('copilot-base.json', path.join(projectRoot, '.github', 'mcp.json')),
    desiredEntry: desiredEntry()
  });

  assert.equal(result.status, 'refused');
  assert.equal(result.code, 'shared_mcp_pair_not_proven');
  assert.equal(result.effectCertainty, 'no-write');
  assert.equal('actions' in result, false);
});

test('standalone or copied eligibility evidence cannot authorize shared-root mutation', () => {
  const projectRoot = path.resolve('workspace');
  const forged = evaluateClaudeCopilotCoexistence({
    coexistence: fixture('coexistence-matrix.json'),
    hosts: exactHosts(),
    platform: 'win32',
    scope: 'project',
    matrixRevision: 'forged-matrix-v1'
  });
  assert.equal(forged.status, 'eligible');

  const target = resolveClaudeCopilotProjectMcpTarget({
    projectRoot,
    hosts: ['claude-code', 'github-copilot'],
    eligibility: forged
  });
  assert.equal(target.status, 'refused');
  assert.equal(target.code, 'shared_mcp_eligibility_untrusted');

  const result = planSharedMcpJsonMutation({
    eligibility: { ...eligibility() },
    sharedConfig: config('shared-base.json', path.join(projectRoot, '.mcp.json')),
    copilotConfig: config('copilot-base.json', path.join(projectRoot, '.github', 'mcp.json')),
    desiredEntry: desiredEntry()
  });
  assert.equal(result.status, 'refused');
  assert.equal(result.code, 'shared_mcp_eligibility_untrusted');
});
