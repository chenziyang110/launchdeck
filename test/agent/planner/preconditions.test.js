import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanonicalTransactionPlan } from '../../../src/agent/state/transaction-plan.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..', '..');
const preconditionsModuleUrl = pathToFileURL(
  path.join(repoRoot, 'src', 'agent', 'planner', 'preconditions.js')
).href;

test('planner preconditions module exports the planned revalidation surface', async () => {
  const mod = await loadPreconditionsModule();

  assert.equal(typeof mod.createPlanPreconditions, 'function');
  assert.equal(typeof mod.revalidatePlanPreconditions, 'function');
  assert.equal(typeof mod.createPreconditionRefusal, 'function');
});

test('preconditions bind exact canonical scope, component, path, ownership, live digest, and evidence digest', async () => {
  const { createPlanPreconditions } = await loadPreconditionsModule();
  const plan = basePlan();

  const preconditions = createPlanPreconditions({
    plan,
    observations: [{
      targetId: 'codex:project:mcp',
      scope: 'project',
      component: 'mcp',
      path: 'F:\\repo\\project\\.codex\\config.toml',
      ownershipBoundary: '[mcp_servers.launchdeck]',
      ownership: 'launchdeck-owned',
      observedDigest: `sha256:${'0'.repeat(64)}`,
      evidenceDigest: plan.targets[0].evidenceDigest
    }]
  });

  assert.deepEqual(preconditions.targets, [{
    targetId: 'codex:project:mcp',
    scope: 'project',
    component: 'mcp',
    targetPath: 'F:\\repo\\project\\.codex\\config.toml',
    ownershipBoundary: '[mcp_servers.launchdeck]',
    ownership: 'launchdeck-owned',
    preconditionDigest: `sha256:${'0'.repeat(64)}`,
    desiredDigest: `sha256:${'1'.repeat(64)}`,
    evidenceDigest: plan.targets[0].evidenceDigest
  }]);
  assert.match(preconditions.preconditionSetDigest, /^sha256:[0-9a-f]{64}$/);
  assert.throws(() => {
    preconditions.targets[0].ownershipBoundary = 'mcpServers.launchdeck';
  }, TypeError);
});

test('precondition creation requires exact positive ownership when observations are supplied', async () => {
  const { createPlanPreconditions } = await loadPreconditionsModule();
  const plan = basePlan();
  const exactObservation = {
    targetId: 'codex:project:mcp',
    scope: 'project',
    component: 'mcp',
    path: 'F:\\repo\\project\\.codex\\config.toml',
    ownershipBoundary: '[mcp_servers.launchdeck]',
    ownership: 'launchdeck-owned',
    observedDigest: `sha256:${'0'.repeat(64)}`,
    evidenceDigest: plan.targets[0].evidenceDigest
  };

  const exact = createPlanPreconditions({
    plan,
    observations: [exactObservation]
  });

  assert.equal(exact.targets[0].ownership, 'launchdeck-owned');

  for (const [label, observation, code] of [
    [
      'unknown',
      { ...exactObservation, ownership: 'unknown' },
      'agent_plan_ownership_missing'
    ],
    [
      'foreign',
      { ...exactObservation, ownership: 'foreign' },
      'agent_plan_ownership_missing'
    ],
    [
      'unobserved',
      { ...exactObservation, ownership: 'unobserved' },
      'agent_plan_ownership_missing'
    ],
    [
      'missing',
      {
        targetId: exactObservation.targetId,
        scope: exactObservation.scope,
        component: exactObservation.component,
        path: exactObservation.path,
        ownershipBoundary: exactObservation.ownershipBoundary,
        observedDigest: exactObservation.observedDigest,
        evidenceDigest: exactObservation.evidenceDigest
      },
      'agent_plan_ownership_missing'
    ],
    [
      'different-positive',
      { ...exactObservation, ownership: 'workspace-owned' },
      'agent_plan_ownership_changed'
    ]
  ]) {
    assert.throws(
      () => createPlanPreconditions({
        plan,
        observations: [observation]
      }),
      errorWithCode(code),
      label
    );
  }
});

test('revalidation succeeds only when every approved canonical target still matches exactly', async () => {
  const { revalidatePlanPreconditions } = await loadPreconditionsModule();
  const plan = basePlan();
  const inspector = createInspector({
    'codex:project:mcp': {
      targetId: 'codex:project:mcp',
      scope: 'project',
      component: 'mcp',
      path: 'F:\\repo\\project\\.codex\\config.toml',
      ownershipBoundary: '[mcp_servers.launchdeck]',
      ownership: 'launchdeck-owned',
      observedDigest: `sha256:${'0'.repeat(64)}`,
      evidenceDigest: plan.targets[0].evidenceDigest
    }
  });

  const result = await revalidatePlanPreconditions({ plan, inspector });

  assert.equal(result.valid, true);
  assert.equal(result.planDigest, plan.planDigest);
  assert.equal(result.effectCertainty, 'none');
  assert.deepEqual(result.effects, []);
  assert.equal(inspector.calls.length, 1);
  assert.equal(inspector.calls[0].targetId, 'codex:project:mcp');
});

test('changed live digest refuses before any transaction or writes', async () => {
  const {
    revalidatePlanPreconditions,
    createPreconditionRefusal
  } = await loadPreconditionsModule();
  const plan = basePlan();
  const inspector = createInspector({
    'codex:project:mcp': {
      targetId: 'codex:project:mcp',
      scope: 'project',
      component: 'mcp',
      path: 'F:\\repo\\project\\.codex\\config.toml',
      ownershipBoundary: '[mcp_servers.launchdeck]',
      ownership: 'launchdeck-owned',
      observedDigest: `sha256:${'4'.repeat(64)}`,
      evidenceDigest: plan.targets[0].evidenceDigest
    }
  });

  const evidence = await revalidatePlanPreconditions({ plan, inspector });
  const refusal = createPreconditionRefusal({ plan, evidence });

  assert.equal(evidence.valid, false);
  assert.equal(evidence.code, 'agent_plan_precondition_changed');
  assert.equal(evidence.targetId, 'codex:project:mcp');
  assert.equal(refusal.outcome, 'refused');
  assert.equal(refusal.effectCertainty, 'none');
  assert.equal(refusal.error.code, 'agent_plan_precondition_changed');
  assert.deepEqual(refusal.effects, []);
  assert.equal(refusal.transactionRequest, undefined);
  assert.equal(inspector.calls.length, 1);
  assert.equal(inspector.calls[0].mutations, 0);
});

test('path alias, ownership drift, scope drift, component drift, evidence drift, or duplicate live target refuses without fallback', async () => {
  const { revalidatePlanPreconditions } = await loadPreconditionsModule();
  const plan = basePlan();

  const aliasResult = await revalidatePlanPreconditions({
    plan,
    inspector: createInspector({
      'codex:project:mcp': {
        targetId: 'codex:project:mcp',
        scope: 'project',
        component: 'mcp',
        path: 'F:\\repo\\project\\.codex\\..\\.codex\\config.toml',
        ownershipBoundary: '[mcp_servers.launchdeck]',
        ownership: 'launchdeck-owned',
        observedDigest: `sha256:${'0'.repeat(64)}`,
        evidenceDigest: plan.targets[0].evidenceDigest
      }
    })
  });
  const ownershipResult = await revalidatePlanPreconditions({
    plan,
    inspector: createInspector({
      'codex:project:mcp': {
        targetId: 'codex:project:mcp',
        scope: 'project',
        component: 'mcp',
        path: 'F:\\repo\\project\\.codex\\config.toml',
        ownershipBoundary: 'mcpServers.launchdeck',
        ownership: 'foreign',
        observedDigest: `sha256:${'0'.repeat(64)}`,
        evidenceDigest: plan.targets[0].evidenceDigest
      }
    })
  });
  const unknownOwnershipResult = await revalidatePlanPreconditions({
    plan,
    inspector: createInspector({
      'codex:project:mcp': {
        targetId: 'codex:project:mcp',
        scope: 'project',
        component: 'mcp',
        path: 'F:\\repo\\project\\.codex\\config.toml',
        ownershipBoundary: '[mcp_servers.launchdeck]',
        ownership: 'unknown',
        observedDigest: `sha256:${'0'.repeat(64)}`,
        evidenceDigest: plan.targets[0].evidenceDigest
      }
    })
  });
  const scopeResult = await revalidatePlanPreconditions({
    plan,
    inspector: createInspector({
      'codex:project:mcp': {
        targetId: 'codex:project:mcp',
        scope: 'user',
        component: 'mcp',
        path: 'F:\\repo\\project\\.codex\\config.toml',
        ownershipBoundary: '[mcp_servers.launchdeck]',
        ownership: 'launchdeck-owned',
        observedDigest: `sha256:${'0'.repeat(64)}`,
        evidenceDigest: plan.targets[0].evidenceDigest
      }
    })
  });
  const componentResult = await revalidatePlanPreconditions({
    plan,
    inspector: createInspector({
      'codex:project:mcp': {
        targetId: 'codex:project:mcp',
        scope: 'project',
        component: 'skill',
        path: 'F:\\repo\\project\\.codex\\config.toml',
        ownershipBoundary: '[mcp_servers.launchdeck]',
        ownership: 'launchdeck-owned',
        observedDigest: `sha256:${'0'.repeat(64)}`,
        evidenceDigest: plan.targets[0].evidenceDigest
      }
    })
  });
  const evidenceResult = await revalidatePlanPreconditions({
    plan,
    inspector: createInspector({
      'codex:project:mcp': {
        targetId: 'codex:project:mcp',
        scope: 'project',
        component: 'mcp',
        path: 'F:\\repo\\project\\.codex\\config.toml',
        ownershipBoundary: '[mcp_servers.launchdeck]',
        ownership: 'launchdeck-owned',
        observedDigest: `sha256:${'0'.repeat(64)}`,
        evidenceDigest: `sha256:${'9'.repeat(64)}`
      }
    })
  });
  const duplicateResult = await revalidatePlanPreconditions({
    plan,
    inspector: createInspector({
      'codex:project:mcp': [
        {
          targetId: 'codex:project:mcp',
          scope: 'project',
          component: 'mcp',
          path: 'F:\\repo\\project\\.codex\\config.toml',
          ownershipBoundary: '[mcp_servers.launchdeck]',
          ownership: 'launchdeck-owned',
          observedDigest: `sha256:${'0'.repeat(64)}`,
          evidenceDigest: plan.targets[0].evidenceDigest
        },
        {
          targetId: 'codex:project:mcp',
          scope: 'project',
          component: 'mcp',
          path: 'F:\\repo\\project\\.mcp.json',
          ownershipBoundary: 'mcpServers.launchdeck',
          ownership: 'launchdeck-owned',
          observedDigest: `sha256:${'0'.repeat(64)}`,
          evidenceDigest: plan.targets[0].evidenceDigest
        }
      ]
    })
  });

  assert.equal(aliasResult.valid, false);
  assert.equal(aliasResult.code, 'agent_plan_precondition_path_changed');
  assert.equal(ownershipResult.valid, false);
  assert.equal(ownershipResult.code, 'agent_plan_ownership_changed');
  assert.equal(unknownOwnershipResult.valid, false);
  assert.equal(unknownOwnershipResult.code, 'agent_plan_ownership_changed');
  assert.equal(scopeResult.valid, false);
  assert.equal(scopeResult.code, 'agent_plan_target_scope_changed');
  assert.equal(componentResult.valid, false);
  assert.equal(componentResult.code, 'agent_plan_target_component_changed');
  assert.equal(evidenceResult.valid, false);
  assert.equal(evidenceResult.code, 'agent_plan_evidence_changed');
  assert.equal(duplicateResult.valid, false);
  assert.equal(duplicateResult.code, 'agent_plan_duplicate_live_target');
});

test('precondition creation rejects plans that would author .launchdeck.yml', async () => {
  const { createPlanPreconditions } = await loadPreconditionsModule();
  const plan = basePlan();

  assert.throws(
    () => createPlanPreconditions({
      plan: {
        ...plan,
        actions: [{
          ...plan.actions[0],
          actionId: 'write-project-launchdeck-config',
          targetPath: 'F:\\repo\\project\\.launchdeck.yml',
          ownershipBoundary: 'launchdeck-project-config'
        }]
      },
      observations: []
    }),
    errorWithCode('agent_project_config_authorship_forbidden')
  );
});

async function loadPreconditionsModule() {
  return import(preconditionsModuleUrl);
}

function basePlan() {
  return createCanonicalTransactionPlan({
    planId: 'plan_abcdefghijklmnop',
    scope: 'project',
    scopeIdentity: `project:sha256:${'c'.repeat(64)}`,
    projectIdentity: 'F:\\repo\\project',
    buildIdentity: `sha256:${'a'.repeat(64)}`,
    targetIds: ['codex:project:mcp'],
    previousBuildPins: [`sha256:${'8'.repeat(64)}`],
    includeLauncher: false,
    targets: [{
      targetId: 'codex:project:mcp',
      hostId: 'codex',
      scope: 'project',
      component: 'mcp',
      path: 'F:\\repo\\project\\.codex\\config.toml',
      ownershipBoundary: '[mcp_servers.launchdeck]',
      ownership: 'launchdeck-owned',
      liveDigest: `sha256:${'0'.repeat(64)}`,
      desiredDigest: `sha256:${'1'.repeat(64)}`
    }],
    actions: [{
      actionId: 'patch-codex-project-mcp',
      targetId: 'codex:project:mcp',
      kind: 'patch-owned-entry',
      targetPath: 'F:\\repo\\project\\.codex\\config.toml',
      ownershipBoundary: '[mcp_servers.launchdeck]',
      preconditionDigest: `sha256:${'0'.repeat(64)}`,
      desiredDigest: `sha256:${'1'.repeat(64)}`
    }]
  });
}

function createInspector(observationsByTargetId) {
  const calls = [];
  return {
    calls,
    async inspect(target) {
      calls.push({
        targetId: target.targetId,
        mutations: 0
      });
      return observationsByTargetId[target.targetId];
    }
  };
}

function errorWithCode(code) {
  return {
    name: /AgentInstaller|Error/,
    code
  };
}
