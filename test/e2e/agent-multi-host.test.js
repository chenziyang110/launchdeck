import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  BUILD_IDENTITY,
  OTHER_BUILD_IDENTITY,
  createMultiHostFixture
} from '../fixtures/agent-multi-host/multi-host-fixture.js';

test('exact-version multi-host setup splits capabilities and verifies one build across all targets', async () => {
  const fixture = createMultiHostFixture();
  try {
    const result = await fixture.setup();

    assert.equal(result.outcome, 'succeeded');
    assert.equal(result.buildIdentity, BUILD_IDENTITY);
    assert.equal(new Set(result.verificationEvidence.map((entry) => entry.buildIdentity)).size, 1);
    assert.deepEqual(
      fixture.matrix.map((row) => [row.host, row.exactVersion, row.capabilities, row.unsupported ?? []]),
      [
        ['codex', '0.96.0', ['skill', 'mcp'], []],
        ['claude-code', '1.5.0', ['skill', 'mcp'], []],
        ['github-copilot', '1.4.2', ['skill', 'mcp'], []],
        ['visual-studio', '18.5.0', ['mcp'], ['skill']]
      ]
    );
    assert.deepEqual(
      result.targets.map((target) => [target.targetId, target.rootKind]).sort(),
      [
        ['claude-code:project:mcp', 'proven-shared-mcp-root'],
        ['claude-code:project:skill', 'native-claude-skill'],
        ['codex:project:mcp', 'native-mcp-root'],
        ['codex:project:skill', 'canonical-shared-skill'],
        ['visual-studio:project:mcp', 'native-mcp-root']
      ]
    );
    assert.equal(
      result.targets.find((target) => target.targetId === 'codex:project:skill').path,
      path.join(fixture.projectRoot, '.agents', 'skills', 'launchdeck-agent')
    );
    assert.equal(
      result.targets.find((target) => target.targetId === 'claude-code:project:skill').path,
      path.join(fixture.projectRoot, '.claude', 'skills', 'launchdeck-agent')
    );
    assert.equal(result.targets.some((target) => target.targetId === 'visual-studio:project:skill'), false);
  } finally {
    fixture.cleanup();
  }
});

test('config coexistence preserves unrelated entries and refuses duplicate launchdeck collisions before writes', async () => {
  const fixture = createMultiHostFixture();
  try {
    const result = await fixture.setup();

    assert.equal(result.outcome, 'succeeded');
    assert.equal(result.config.shared.metadata.owner, 'user');
    assert.equal(result.config.shared.mcpServers.keep.command, 'keep-shared');
    assert.equal(result.config.copilot.mcpServers.keep.command, 'keep-copilot');
    assert.equal(result.config.visualStudio.servers.keep.command, 'keep-vs');
    assert.match(result.config.codex, /unrelated = "keep-codex"/);
    assert.equal(result.config.shared.mcpServers.launchdeck.args.includes(BUILD_IDENTITY), true);
    assert.equal(result.config.visualStudio.servers.launchdeck.args.includes(BUILD_IDENTITY), true);
  } finally {
    fixture.cleanup();
  }

  const collision = createMultiHostFixture({ collision: true });
  try {
    const before = collision.snapshot();
    const refused = await collision.setup({ hosts: ['github-copilot'], components: ['mcp'] });

    assert.equal(refused.outcome, 'refused');
    assert.equal(refused.error.code, 'agent_copilot_mcp_launchdeck_collision');
    assert.deepEqual(refused.after, before);
    assert.deepEqual(collision.snapshot(), before);
  } finally {
    collision.cleanup();
  }
});

test('mixed host build identities refuse before writes and without a receipt', async () => {
  const fixture = createMultiHostFixture();
  try {
    const before = fixture.snapshot();
    const result = await fixture.setup({
      hosts: ['codex', 'claude-code', 'github-copilot'],
      components: ['skill', 'mcp'],
      buildByHost: {
        codex: BUILD_IDENTITY,
        'claude-code': BUILD_IDENTITY,
        'github-copilot': OTHER_BUILD_IDENTITY
      }
    });

    assert.equal(result.outcome, 'refused');
    assert.equal(result.effectCertainty, 'none');
    assert.equal(result.error.code, 'agent_mixed_build_identity_refused');
    assert.equal(result.receiptId, null);
    assert.deepEqual(result.effects, []);
    assert.deepEqual(result.after, before);
    assert.deepEqual(fixture.snapshot(), before);
  } finally {
    fixture.cleanup();
  }
});
