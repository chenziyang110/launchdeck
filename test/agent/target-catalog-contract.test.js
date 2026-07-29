import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createCatalogSkillHostRegistry,
  FULL_RUNTIME_ADAPTER_IDS,
  UPSTREAM_AGENT_IDS,
  listAgentTargetCatalog
} from '../../src/agent/target-catalog.js';

const FIXTURE_PROJECT_ROOT = path.resolve('workspace', 'demo');
const FIXTURE_HOME = path.resolve('users', 'alice');
const FIXTURE_ENV_ROOT = path.resolve('env');

const EXPECTED_UPSTREAM_AGENT_IDS = [
  'aider-desk',
  'amp',
  'antigravity',
  'antigravity-cli',
  'astrbot',
  'autohand-code',
  'augment',
  'bob',
  'claude-code',
  'openclaw',
  'cline',
  'codearts-agent',
  'codebuddy',
  'codemaker',
  'codestudio',
  'codex',
  'command-code',
  'continue',
  'cortex',
  'crush',
  'cursor',
  'deepagents',
  'devin',
  'dexto',
  'droid',
  'eve',
  'firebender',
  'forgecode',
  'gemini-cli',
  'github-copilot',
  'goose',
  'grok',
  'hermes-agent',
  'inference-sh',
  'jazz',
  'junie',
  'iflow-cli',
  'kilo',
  'kimchi',
  'kimi-code-cli',
  'kiro-cli',
  'kode',
  'lingma',
  'loaf',
  'mcpjam',
  'mistral-vibe',
  'moxby',
  'mux',
  'opencode',
  'openhands',
  'ona',
  'pi',
  'qoder',
  'qoder-cn',
  'qwen-code',
  'replit',
  'reasonix',
  'rovodev',
  'roo',
  'tabnine-cli',
  'terramind',
  'tinycloud',
  'trae',
  'trae-cn',
  'warp',
  'windsurf',
  'zed',
  'zcode',
  'zencoder',
  'zenflow',
  'neovate',
  'pochi',
  'promptscript',
  'adal',
  'universal'
];

test('catalog tracks exactly 75 upstream Agent IDs and adds Launchdeck Visual Studio separately', () => {
  const catalog = listAgentTargetCatalog({
    projectRoot: FIXTURE_PROJECT_ROOT,
    homeDir: FIXTURE_HOME,
    env: {}
  });
  const ids = catalog.targets.map((target) => target.id);

  assert.equal(EXPECTED_UPSTREAM_AGENT_IDS.length, 75);
  assert.deepEqual(UPSTREAM_AGENT_IDS, EXPECTED_UPSTREAM_AGENT_IDS);
  assert.equal(UPSTREAM_AGENT_IDS.includes('visual-studio'), false);
  assert.equal(ids.includes('visual-studio'), true);
  assert.equal(new Set(ids).size, 76);
  assert.equal(ids.length, 76);
});

test('catalog keeps the four Launchdeck full runtime adapter IDs distinct from Skill-only entries', () => {
  const catalog = listAgentTargetCatalog({
    projectRoot: FIXTURE_PROJECT_ROOT,
    homeDir: FIXTURE_HOME,
    env: {}
  });
  const full = catalog.targets.filter((target) => target.integration === 'full');
  const skillOnly = catalog.targets.filter((target) => target.integration === 'skill-only');

  assert.deepEqual(FULL_RUNTIME_ADAPTER_IDS, [
    'codex',
    'claude-code',
    'github-copilot',
    'visual-studio'
  ]);
  assert.deepEqual(full.map((target) => target.id), FULL_RUNTIME_ADAPTER_IDS);
  assert.equal(skillOnly.length, 72);
  assert.equal(skillOnly.every((target) => target.capabilities.join(',') === 'skill'), true);
});

test('catalog entries expose scope-independent project and user destinations', () => {
  const catalog = listAgentTargetCatalog({
    projectRoot: FIXTURE_PROJECT_ROOT,
    homeDir: FIXTURE_HOME
  });

  for (const target of catalog.targets) {
    assert.deepEqual(Object.keys(target).sort(), [
      'capabilities',
      'destinations',
      'id',
      'integration',
      'label'
    ]);
    assert.equal(typeof target.destinations, 'object');
    assert.equal(Object.hasOwn(target.destinations, 'project'), true);
    assert.equal(Object.hasOwn(target.destinations, 'user'), true);
  }
});

test('catalog destinations are absolute paths or explicit unsupported nulls', () => {
  const catalog = listAgentTargetCatalog({
    projectRoot: FIXTURE_PROJECT_ROOT,
    homeDir: FIXTURE_HOME,
    env: {}
  });

  for (const target of catalog.targets) {
    for (const destination of Object.values(target.destinations)) {
      assert.equal(destination === null || path.isAbsolute(destination), true, target.id);
      if (destination !== null) {
        assert.equal(
          destination.startsWith(FIXTURE_PROJECT_ROOT) || destination.startsWith(FIXTURE_HOME),
          true,
          `${target.id}: ${destination}`
        );
      }
    }
  }
});

test('catalog preserves representative special shared and unsupported destinations', () => {
  const catalog = listAgentTargetCatalog({
    projectRoot: FIXTURE_PROJECT_ROOT,
    homeDir: FIXTURE_HOME,
    env: {}
  });
  const byId = new Map(catalog.targets.map((target) => [target.id, target]));

  assert.equal(byId.get('codex')?.destinations.project, path.join(FIXTURE_PROJECT_ROOT, '.agents', 'skills', 'launchdeck-agent'));
  assert.equal(byId.get('github-copilot')?.destinations.project, path.join(FIXTURE_PROJECT_ROOT, '.agents', 'skills', 'launchdeck-agent'));
  assert.equal(byId.get('claude-code')?.destinations.project, path.join(FIXTURE_PROJECT_ROOT, '.claude', 'skills', 'launchdeck-agent'));
  assert.equal(byId.get('eve')?.destinations.user, null);
  assert.equal(byId.get('promptscript')?.destinations.user, null);
  assert.equal(byId.get('openclaw')?.destinations.user?.startsWith(FIXTURE_HOME), true);
});

test('catalog resolves pinned user destination env overrides and null unsupported scopes', () => {
  const catalog = listAgentTargetCatalog({
    projectRoot: FIXTURE_PROJECT_ROOT,
    homeDir: FIXTURE_HOME,
    env: {
      CODEX_HOME: path.join(FIXTURE_ENV_ROOT, 'codex'),
      CLAUDE_CONFIG_DIR: path.join(FIXTURE_ENV_ROOT, 'claude'),
      XDG_CONFIG_HOME: path.join(FIXTURE_ENV_ROOT, 'config'),
      AUTOHAND_HOME: path.join(FIXTURE_ENV_ROOT, 'autohand'),
      GROK_HOME: path.join(FIXTURE_ENV_ROOT, 'grok'),
      HERMES_HOME: path.join(FIXTURE_ENV_ROOT, 'hermes'),
      VIBE_HOME: path.join(FIXTURE_ENV_ROOT, 'vibe')
    }
  });
  const byId = new Map(catalog.targets.map((target) => [target.id, target]));

  assert.equal(byId.get('codex')?.destinations.user, path.join(FIXTURE_ENV_ROOT, 'codex', 'skills', 'launchdeck-agent'));
  assert.equal(byId.get('claude-code')?.destinations.user, path.join(FIXTURE_ENV_ROOT, 'claude', 'skills', 'launchdeck-agent'));
  assert.equal(byId.get('amp')?.destinations.user, path.join(FIXTURE_ENV_ROOT, 'config', 'agents', 'skills', 'launchdeck-agent'));
  assert.equal(byId.get('autohand-code')?.destinations.user, path.join(FIXTURE_ENV_ROOT, 'autohand', 'skills', 'launchdeck-agent'));
  assert.equal(byId.get('grok')?.destinations.user, path.join(FIXTURE_ENV_ROOT, 'grok', 'skills', 'launchdeck-agent'));
  assert.equal(byId.get('hermes-agent')?.destinations.user, path.join(FIXTURE_ENV_ROOT, 'hermes', 'skills', 'launchdeck-agent'));
  assert.equal(byId.get('mistral-vibe')?.destinations.user, path.join(FIXTURE_ENV_ROOT, 'vibe', 'skills', 'launchdeck-agent'));
  assert.equal(byId.get('eve')?.destinations.user, null);
  assert.equal(byId.get('promptscript')?.destinations.user, null);
});

test('catalog skill registry exposes skill-only targets without expanding the full adapter list', async () => {
  const base = fakeFullRegistry();
  const registry = createCatalogSkillHostRegistry(base, {
    projectRoot: FIXTURE_PROJECT_ROOT,
    homeDir: FIXTURE_HOME
  });

  assert.deepEqual(base.list().map((entry) => entry.id), FULL_RUNTIME_ADAPTER_IDS);
  assert.deepEqual(registry.list().slice(0, 4).map((entry) => entry.id), FULL_RUNTIME_ADAPTER_IDS);
  assert.equal(registry.get('cursor')?.id, 'cursor');
  assert.equal(registry.get('cursor'), registry.adapterFor('cursor'));

  const capabilities = await registry.get('cursor').capabilities([], 'project');
  assert.equal(capabilities.find((row) => row.component === 'skill')?.supportState, 'supported');
  assert.equal(capabilities.find((row) => row.component === 'skill')?.scope, 'project');
  assert.equal(capabilities.find((row) => row.component === 'mcp')?.supportState, 'unsupported');
});

test('catalog skill registry refuses unsupported user destinations explicitly', async () => {
  const registry = createCatalogSkillHostRegistry(fakeFullRegistry(), {
    projectRoot: FIXTURE_PROJECT_ROOT,
    homeDir: FIXTURE_HOME
  });

  const capabilities = await registry.get('eve').capabilities([], 'user');
  const result = await registry.get('eve').resolveTargets({ scope: 'user', components: ['skill'] });

  assert.equal(capabilities.find((row) => row.component === 'skill')?.supportState, 'unsupported');
  assert.equal(capabilities.find((row) => row.component === 'skill')?.scope, 'user');
  assert.equal(result.kind, 'refusal');
  assert.equal(result.code, 'host_scope_unsupported');
});

test('catalog Skill-only adapter refuses divergent content instead of overwriting it', async (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-catalog-collision-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const registry = createCatalogSkillHostRegistry(fakeFullRegistry(), { projectRoot });
  const adapter = registry.get('cursor');
  const [target] = await adapter.resolveTargets({ scope: 'project', components: ['skill'] });
  fs.mkdirSync(target.path, { recursive: true });
  fs.writeFileSync(path.join(target.path, 'foreign.txt'), 'foreign content');

  const plan = await adapter.plan(target, { buildIdentity: `sha256:${'a'.repeat(64)}` });

  assert.equal(plan.kind, 'refusal');
  assert.equal(plan.code, 'ownership-collision');
  assert.equal(fs.readFileSync(path.join(target.path, 'foreign.txt'), 'utf8'), 'foreign content');
});

test('catalog Skill-only adapter refuses uninstall without receipt ownership', async () => {
  const registry = createCatalogSkillHostRegistry(fakeFullRegistry(), {
    projectRoot: FIXTURE_PROJECT_ROOT,
    homeDir: FIXTURE_HOME
  });
  const adapter = registry.get('cursor');
  const [target] = await adapter.resolveTargets({ scope: 'project', components: ['skill'] });

  const plan = await adapter.uninstall(target, undefined);

  assert.equal(plan.kind, 'refusal');
  assert.equal(plan.code, 'ownership-collision');
});

function fakeFullRegistry() {
  const adapters = new Map(FULL_RUNTIME_ADAPTER_IDS.map((id) => [id, { id }]));
  return {
    list: () => FULL_RUNTIME_ADAPTER_IDS.map((id) => ({ id, adapter: adapters.get(id) })),
    get: (id) => adapters.get(id) ?? null,
    adapterFor: (id) => adapters.get(id) ?? null
  };
}
