import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanonicalTransactionPlan } from '../../../src/agent/state/transaction-plan.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..', '..');
const installationPlanModuleUrl = pathToFileURL(
  path.join(repoRoot, 'src', 'agent', 'planner', 'installation-plan.js')
).href;

test('planner installation-plan module exports the planned contract surface', async () => {
  const mod = await loadInstallationPlanModule();

  assert.equal(typeof mod.createInstallationPlan, 'function');
  assert.equal(typeof mod.createDryRunPlanResult, 'function');
  assert.equal(typeof mod.createApprovalRequirement, 'function');
  assert.equal(typeof mod.createNoopPlanResult, 'function');
});

test('installation plans are deterministic, deeply immutable, and evidence-bound', async () => {
  const { createInstallationPlan } = await loadInstallationPlanModule();
  const desired = desiredInstallation();
  const evidence = evidenceBundle();
  const reversedEvidence = {
    ...evidence,
    targets: [...evidence.targets].reverse(),
    targetPlans: [...evidence.targetPlans].reverse()
  };

  const first = await createInstallationPlan({ desired, evidence });
  const second = await createInstallationPlan({ desired, evidence: reversedEvidence });

  assert.equal(first.planDigest, second.planDigest);
  assert.deepEqual(first.actions.map((action) => action.actionId), second.actions.map((action) => action.actionId));
  assert.equal(first.desiredInstallationDigest, desired.inputDigest);
  assert.equal(first.matrixRevision, evidence.matrixRevision);
  assert.equal(first.buildIdentity, desired.desiredBuildIdentity);
  assert.equal(first.scopeIdentity, desired.scopeIdentity);
  assert.deepEqual(first.targetIds, ['codex:project:skill']);
  assert.deepEqual(first.trustedSources, [
    'capability-matrix:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'host-probe:codex:1.0.0'
  ]);
  const canonical = createCanonicalTransactionPlan({
    planId: first.planId,
    buildIdentity: first.buildIdentity,
    scope: first.scope,
    scopeIdentity: first.scopeIdentity,
    projectIdentity: first.projectIdentity,
    targetIds: first.targetIds,
    includeLauncher: first.includeLauncher,
    previousBuildPins: first.previousBuildPins,
    targets: first.targets,
    actions: first.actions
  });
  assert.equal(first.planDigest, canonical.planDigest);
  assert.equal(first.planBindingDigest, canonical.planBindingDigest);
  assert.equal(first.targets[0].desiredDigest, first.actions[0].desiredDigest);
  assert.match(first.targets[0].evidenceDigest, /^sha256:[0-9a-f]{64}$/);

  assert.throws(() => {
    first.actions.push({ actionId: 'mutation' });
  }, TypeError);
  assert.throws(() => {
    first.targets[0].path = 'mutated';
  }, TypeError);
});

test('plan creation preserves exact scope, target ownership, and action preconditions', async () => {
  const { createInstallationPlan } = await loadInstallationPlanModule();

  const plan = await createInstallationPlan({
    desired: desiredInstallation({
      scope: 'user',
      scopeIdentity: `user:sha256:${'f'.repeat(64)}`,
      projectIdentity: null
    }),
    evidence: evidenceBundle({
      targets: [{
        targetId: 'codex:user:mcp',
        hostId: 'codex',
        scope: 'user',
        component: 'mcp',
        path: 'C:\\Users\\agent\\.codex\\config.toml',
        ownershipBoundary: '[mcp_servers.launchdeck]',
        ownership: 'launchdeck-owned',
        liveDigest: `sha256:${'2'.repeat(64)}`
      }],
      targetPlans: [{
        targetId: 'codex:user:mcp',
        status: 'planned',
        actions: [{
          actionId: 'patch-codex-user-mcp',
          targetId: 'codex:user:mcp',
          kind: 'patch-owned-entry',
          targetPath: 'C:\\Users\\agent\\.codex\\config.toml',
          ownershipBoundary: '[mcp_servers.launchdeck]',
          preconditionDigest: `sha256:${'2'.repeat(64)}`,
          desiredDigest: `sha256:${'3'.repeat(64)}`
        }]
      }]
    })
  });

  assert.equal(plan.scope, 'user');
  assert.equal(plan.projectIdentity, null);
  assert.match(plan.scopeIdentity, /^user:sha256:[0-9a-f]{64}$/);
  assert.equal(plan.targets[0].scope, 'user');
  assert.equal(plan.targets[0].ownershipBoundary, '[mcp_servers.launchdeck]');
  assert.equal(plan.targets[0].ownership, 'launchdeck-owned');
  assert.equal(plan.actions[0].preconditionDigest, `sha256:${'2'.repeat(64)}`);
  assert.equal(plan.actions[0].targetPath, 'C:\\Users\\agent\\.codex\\config.toml');
});

test('dry-run and missing approval return no-effects results with no transaction request', async () => {
  const {
    createInstallationPlan,
    createDryRunPlanResult,
    createApprovalRequirement
  } = await loadInstallationPlanModule();
  const plan = await createInstallationPlan({
    desired: desiredInstallation({ dryRun: true, approved: false }),
    evidence: evidenceBundle()
  });

  const dryRun = createDryRunPlanResult({ plan });
  const approval = createApprovalRequirement({ plan, jsonMode: true });

  assert.equal(dryRun.outcome, 'planned');
  assert.equal(dryRun.effectCertainty, 'none');
  assert.equal(dryRun.receiptId, null);
  assert.deepEqual(dryRun.effects, []);
  assert.equal(dryRun.transactionRequest, undefined);
  assert.equal(dryRun.planBindingDigest, plan.planBindingDigest);
  assert.equal(approval.outcome, 'refused');
  assert.equal(approval.effectCertainty, 'none');
  assert.equal(approval.error.code, 'agent_approval_required');
  assert.deepEqual(approval.effects, []);
  assert.equal(approval.transactionRequest, undefined);
  assert.equal(approval.planBindingDigest, plan.planBindingDigest);
});

test('identical owned target state is an explicit no-op and collisions refuse before mutation', async () => {
  const {
    createInstallationPlan,
    createNoopPlanResult
  } = await loadInstallationPlanModule();
  const noActionPlan = await createInstallationPlan({
    desired: desiredInstallation(),
    evidence: evidenceBundle({
      targetPlans: [{
        targetId: 'codex:project:skill',
        status: 'no-op',
        actions: [],
        ownership: {
          owner: 'launchdeck-agent-installer',
          boundary: 'launchdeck-agent',
          liveDigest: `sha256:${'1'.repeat(64)}`
        }
      }]
    })
  });
  const noop = createNoopPlanResult({ plan: noActionPlan });

  assert.equal(noop.outcome, 'noop');
  assert.equal(noop.effectCertainty, 'none');
  assert.deepEqual(noop.targetIds, ['codex:project:skill']);
  assert.equal(noop.targets[0].targetId, 'codex:project:skill');
  assert.equal(noop.targets[0].path, 'F:\\repo\\project\\.agents\\skills\\launchdeck-agent');
  assert.deepEqual(noop.effects, []);
  assert.equal(noop.receiptId, null);

  await assert.rejects(
    () => createInstallationPlan({
      desired: desiredInstallation(),
      evidence: evidenceBundle({
        targetPlans: [{
          targetId: 'codex:project:skill',
          status: 'refused',
          code: 'ownership-collision',
          message: 'launchdeck-agent exists but is not receipt-owned'
        }]
      })
    }),
    errorWithCode('agent_target_ownership_collision')
  );
});

test('planner refuses duplicate targets or actions instead of choosing a winner', async () => {
  const { createInstallationPlan } = await loadInstallationPlanModule();

  await assert.rejects(
    () => createInstallationPlan({
      desired: desiredInstallation(),
      evidence: evidenceBundle({
        targets: [
          baseTarget(),
          { ...baseTarget(), path: 'F:\\other\\.agents\\skills\\launchdeck-agent' }
        ]
      })
    }),
    errorWithCode('agent_plan_duplicate_target')
  );

  await assert.rejects(
    () => createInstallationPlan({
      desired: desiredInstallation(),
      evidence: evidenceBundle({
        targetPlans: [{
          targetId: 'codex:project:skill',
          status: 'planned',
          actions: [
            baseAction(),
            { ...baseAction(), targetPath: 'F:\\other\\.agents\\skills\\launchdeck-agent' }
          ]
        }]
      })
    }),
    errorWithCode('agent_plan_duplicate_action')
  );
});

test('planner refuses unresolved packaged build selectors before creating a transaction-ready plan', async () => {
  const { createInstallationPlan } = await loadInstallationPlanModule();

  await assert.rejects(
    () => createInstallationPlan({
      desired: desiredInstallation({
        requestedBuildSelector: 'packaged',
        desiredBuildIdentity: 'packaged'
      }),
      evidence: evidenceBundle()
    }),
    errorWithCode('agent_build_identity_unresolved')
  );
});

async function loadInstallationPlanModule() {
  return import(installationPlanModuleUrl);
}

const BUILD_IDENTITY = `sha256:${'a'.repeat(64)}`;
const MATRIX_REVISION = `sha256:${'b'.repeat(64)}`;

function desiredInstallation(overrides = {}) {
  return Object.freeze({
    operation: 'setup',
    scope: 'project',
    scopeIdentity: `project:sha256:${'c'.repeat(64)}`,
    projectIdentity: 'F:\\repo\\project',
    hostIds: ['codex'],
    components: ['skill'],
    requestedBuildSelector: BUILD_IDENTITY,
    desiredBuildIdentity: BUILD_IDENTITY,
    sourceIdentity: 'packaged',
    interactive: false,
    approved: true,
    dryRun: false,
    force: false,
    includeLauncher: false,
    previousBuildPins: [`sha256:${'9'.repeat(64)}`],
    inputDigest: `sha256:${'d'.repeat(64)}`,
    ...overrides
  });
}

function evidenceBundle(overrides = {}) {
  return {
    matrixRevision: MATRIX_REVISION,
    hostEvidence: [{
      hostId: 'codex',
      version: '1.0.0',
      probe: 'codex --version',
      supportState: 'supported'
    }],
    capabilities: [{
      hostId: 'codex',
      scope: 'project',
      component: 'skill',
      supportState: 'supported',
      rowId: 'codex-project-skill'
    }],
    targets: [baseTarget()],
    targetPlans: [{
      targetId: 'codex:project:skill',
      status: 'planned',
      actions: [baseAction()]
    }],
    ...overrides
  };
}

function baseTarget() {
  return {
    targetId: 'codex:project:skill',
    hostId: 'codex',
    scope: 'project',
    component: 'skill',
    path: 'F:\\repo\\project\\.agents\\skills\\launchdeck-agent',
    ownershipBoundary: 'launchdeck-agent',
    ownership: 'launchdeck-owned',
    liveDigest: `sha256:${'0'.repeat(64)}`
  };
}

function baseAction() {
  return {
    actionId: 'copy-codex-project-skill',
    targetId: 'codex:project:skill',
    kind: 'copy-skill',
    targetPath: 'F:\\repo\\project\\.agents\\skills\\launchdeck-agent',
    ownershipBoundary: 'launchdeck-agent',
    preconditionDigest: `sha256:${'0'.repeat(64)}`,
    desiredDigest: `sha256:${'1'.repeat(64)}`
  };
}

function errorWithCode(code) {
  return {
    name: /AgentInstaller|Error/,
    code
  };
}
