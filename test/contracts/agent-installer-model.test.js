import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeDesiredInstallation,
  normalizeInstallationPlan
} from '../../src/agent/model.js';
import { digestCanonical } from '../../src/agent/digests.js';

const BUILD_IDENTITY = `sha256:${'b'.repeat(64)}`;

test('DesiredInstallation normalization is deterministic, canonical, and deeply immutable', () => {
  const first = normalizeDesiredInstallation({
    force: false,
    dryRun: true,
    approved: false,
    interactive: false,
    sourceIdentity: 'npm:launchdeck@0.1.0',
    desiredBuildIdentity: BUILD_IDENTITY,
    components: ['skill', 'runtime', 'mcp', 'skill'],
    hostIds: ['visual-studio', 'codex', 'claude', 'codex'],
    projectIdentity: 'F:/projects/flask-demo',
    scope: 'project',
    operation: 'setup'
  });
  const reordered = normalizeDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectIdentity: 'F:/projects/flask-demo',
    hostIds: ['claude', 'codex', 'visual-studio'],
    components: ['mcp', 'runtime', 'skill'],
    desiredBuildIdentity: BUILD_IDENTITY,
    sourceIdentity: 'npm:launchdeck@0.1.0',
    interactive: false,
    approved: false,
    dryRun: true,
    force: false
  });

  assert.deepEqual(first.hostIds, ['claude', 'codex', 'visual-studio']);
  assert.deepEqual(first.components, ['mcp', 'runtime', 'skill']);
  assert.match(first.inputDigest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(first, reordered);
  assert.equal(isDeepFrozen(first), true);
  assert.throws(() => first.hostIds.push('copilot'), TypeError);
  assert.throws(() => {
    first.scope = 'user';
  }, TypeError);
});

test('DesiredInstallation rejects ambiguous authority instead of silently changing scope or selection', () => {
  assert.throws(
    () => normalizeDesiredInstallation({
      operation: 'setup',
      scope: 'project',
      projectIdentity: null,
      hostIds: ['codex'],
      components: ['skill'],
      desiredBuildIdentity: BUILD_IDENTITY,
      sourceIdentity: 'npm:launchdeck@0.1.0',
      interactive: false,
      approved: true,
      dryRun: false,
      force: false
    }),
    { code: 'agent_project_identity_required' }
  );

  assert.throws(
    () => normalizeDesiredInstallation({
      operation: 'setup',
      scope: 'user',
      projectIdentity: 'F:/projects/must-not-be-impersonated',
      hostIds: ['codex'],
      components: ['skill'],
      desiredBuildIdentity: BUILD_IDENTITY,
      sourceIdentity: 'npm:launchdeck@0.1.0',
      interactive: false,
      approved: true,
      dryRun: false,
      force: false
    }),
    { code: 'agent_project_identity_forbidden' }
  );

  assert.throws(
    () => normalizeDesiredInstallation({
      operation: 'setup',
      scope: 'user',
      projectIdentity: null,
      hostIds: [],
      components: ['skill'],
      desiredBuildIdentity: BUILD_IDENTITY,
      sourceIdentity: 'npm:launchdeck@0.1.0',
      interactive: false,
      approved: true,
      dryRun: false,
      force: false
    }),
    { code: 'agent_selection_ambiguous' }
  );
});

test('canonical digest ignores object insertion order but preserves semantic array order and values', () => {
  const left = digestCanonical({
    scope: 'project',
    nested: { build: BUILD_IDENTITY, enabled: true },
    hosts: ['claude', 'codex']
  });
  const reorderedKeys = digestCanonical({
    hosts: ['claude', 'codex'],
    nested: { enabled: true, build: BUILD_IDENTITY },
    scope: 'project'
  });
  const reorderedHosts = digestCanonical({
    scope: 'project',
    nested: { build: BUILD_IDENTITY, enabled: true },
    hosts: ['codex', 'claude']
  });
  const changedLeaf = digestCanonical({
    scope: 'user',
    nested: { build: BUILD_IDENTITY, enabled: true },
    hosts: ['claude', 'codex']
  });

  assert.match(left, /^sha256:[0-9a-f]{64}$/);
  assert.equal(left, reorderedKeys);
  assert.notEqual(left, reorderedHosts);
  assert.notEqual(left, changedLeaf);
  assert.throws(() => digestCanonical({ unsupported: undefined }), {
    code: 'agent_digest_input_invalid'
  });
});

test('InstallationPlan normalization fixes target/action order, derives one digest, and freezes approved inputs', () => {
  const desired = normalizeDesiredInstallation({
    operation: 'setup',
    scope: 'project',
    projectIdentity: 'F:/projects/flask-demo',
    hostIds: ['codex', 'claude'],
    components: ['runtime', 'skill', 'mcp'],
    desiredBuildIdentity: BUILD_IDENTITY,
    sourceIdentity: 'npm:launchdeck@0.1.0',
    interactive: true,
    approved: false,
    dryRun: false,
    force: false
  });
  const plan = normalizeInstallationPlan({
    planId: 'plan_0123456789abcdef',
    desiredInstallationDigest: desired.inputDigest,
    matrixRevision: `sha256:${'c'.repeat(64)}`,
    buildIdentity: BUILD_IDENTITY,
    state: 'plan-ready',
    targets: [
      target('target-z', '.mcp.json'),
      target('target-a', '.agents/skills/launchdeck-agent')
    ],
    actions: [
      action('action-z', 'target-z'),
      action('action-a', 'target-a')
    ],
    requiredHostActions: ['approve Claude project MCP server'],
    trustedSources: ['npm:launchdeck@0.1.0'],
    effectsPreview: { create: 2, update: 0, remove: 0 }
  });

  assert.deepEqual(plan.targets.map((entry) => entry.targetId), ['target-a', 'target-z']);
  assert.deepEqual(plan.actions.map((entry) => entry.actionId), ['action-a', 'action-z']);
  assert.match(plan.planDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(isDeepFrozen(plan), true);
  assert.throws(() => {
    plan.effectsPreview.create = 99;
  }, TypeError);

  const samePlan = normalizeInstallationPlan({
    effectsPreview: { remove: 0, update: 0, create: 2 },
    trustedSources: ['npm:launchdeck@0.1.0'],
    requiredHostActions: ['approve Claude project MCP server'],
    actions: [action('action-a', 'target-a'), action('action-z', 'target-z')],
    targets: [
      target('target-a', '.agents/skills/launchdeck-agent'),
      target('target-z', '.mcp.json')
    ],
    state: 'plan-ready',
    buildIdentity: BUILD_IDENTITY,
    matrixRevision: `sha256:${'c'.repeat(64)}`,
    desiredInstallationDigest: desired.inputDigest,
    planId: 'plan_0123456789abcdef'
  });
  assert.deepEqual(samePlan, plan);
});

function target(targetId, targetPath) {
  return {
    targetId,
    hostId: targetId === 'target-z' ? 'claude' : 'codex',
    component: targetId === 'target-z' ? 'mcp' : 'skill',
    scope: 'project',
    path: targetPath,
    dialect: targetId === 'target-z' ? 'mcpServers-json' : 'skill-directory',
    ownershipBoundary: targetId === 'target-z' ? 'mcpServers.launchdeck' : 'launchdeck-agent',
    preconditionDigest: `sha256:${'d'.repeat(64)}`,
    desiredDigest: `sha256:${'e'.repeat(64)}`,
    observedDigest: null,
    state: 'absent'
  };
}

function action(actionId, targetId) {
  return {
    actionId,
    targetId,
    kind: 'create',
    preconditionDigest: `sha256:${'d'.repeat(64)}`,
    desiredDigest: `sha256:${'e'.repeat(64)}`
  };
}

function isDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => isDeepFrozen(value[key], seen));
}
