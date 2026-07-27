import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..', '..');
const lifecycleModuleUrl = pathToFileURL(
  path.join(repoRoot, 'src', 'agent', 'lifecycle-service.js')
).href;

test('interactive decline is cancellation with no transaction, verifier, receipt, or effects', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = faultDependencies({
    approvalResult: {
      approved: false,
      reason: 'user-declined'
    }
  });
  const service = createAgentLifecycleService(deps);

  const envelope = await service.setup(setupInput({ interactive: true, yes: false }));

  assert.deepEqual(deps.trace, ['planner:discover', 'approval:decline']);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.outcome, 'cancelled');
  assert.equal(envelope.result.effectCertainty, 'none');
  assert.equal(envelope.result.receiptId, null);
  assert.deepEqual(envelope.result.effects, []);
  assert.equal(deps.counters.transactions, 0);
  assert.equal(deps.counters.verifications, 0);
});

test('one approved build identity is used for every host component and verification target', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const plan = planFixture({
    actions: [
      actionFixture('codex:project:runtime', 'install-runtime', 'runtime'),
      actionFixture('codex:project:skill', 'copy-skill', 'launchdeck-agent'),
      actionFixture('codex:project:mcp', 'patch-owned-entry', 'mcpServers.launchdeck'),
      actionFixture('claude-code:project:skill', 'copy-skill', 'launchdeck-agent'),
      actionFixture('claude-code:project:mcp', 'patch-owned-entry', 'mcpServers.launchdeck')
    ]
  });
  const deps = faultDependencies({ plan });
  const service = createAgentLifecycleService(deps);

  const envelope = await service.setup(setupInput({ yes: true }));

  assert.equal(envelope.result.outcome, 'succeeded');
  assert.equal(envelope.result.buildIdentity, BUILD_IDENTITY);
  assert.deepEqual(deps.verifiedBuilds, Array(plan.actions.length).fill(BUILD_IDENTITY));
  assert.equal(deps.transactionRequest.plan.buildIdentity, BUILD_IDENTITY);
  assert.equal(deps.transactionRequest.receiptCandidate.buildIdentity, BUILD_IDENTITY);
});

test('runtime verification is invoked inside the transaction before the receipt can commit', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = faultDependencies();
  const service = createAgentLifecycleService(deps);

  await service.setup(setupInput({ yes: true }));

  assert.deepEqual(deps.trace, [
    'planner:discover',
    'approval:bind',
    'transaction:execute',
    'verifier:verify',
    'transaction:commit-receipt'
  ]);
  assert.equal(deps.transactionRequest.receiptCandidate.verificationEvidence.length, 0);
});

test('transaction rollback outcomes are propagated truthfully and never converted to cancellation', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = faultDependencies({
    transactionResult: {
      outcome: 'failed-and-rolled-back',
      effectCertainty: 'complete',
      scope: 'project',
      projectIdentity: 'F:\\repo\\demo',
      buildIdentity: BUILD_IDENTITY,
      operationId: OPERATION_ID,
      planDigest: PLAN_DIGEST,
      receiptId: null,
      targets: [],
      health: [],
      effects: [{
        kind: 'patch-owned-entry',
        state: 'rolled-back'
      }],
      nextActions: [],
      error: {
        code: 'agent_runtime_verification_failed',
        message: 'Runtime verification failed and rollback was verified.',
        details: {}
      }
    }
  });
  const service = createAgentLifecycleService(deps);

  const envelope = await service.setup(setupInput({ yes: true }));

  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.result.outcome, 'failed-and-rolled-back');
  assert.notEqual(envelope.result.outcome, 'cancelled');
  assert.equal(envelope.result.effectCertainty, 'complete');
  assert.equal(envelope.result.receiptId, null);
  assert.equal(envelope.result.error.code, 'agent_runtime_verification_failed');
});

test('user interrupt after apply is recovery work, not a pre-apply cancel result', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = faultDependencies({
    transactionResult: {
      outcome: 'failed-and-rolled-back',
      effectCertainty: 'complete',
      scope: 'project',
      projectIdentity: 'F:\\repo\\demo',
      buildIdentity: BUILD_IDENTITY,
      operationId: OPERATION_ID,
      planDigest: PLAN_DIGEST,
      receiptId: null,
      targets: [],
      health: [],
      effects: [{
        kind: 'copy-skill',
        state: 'rolled-back'
      }],
      nextActions: [],
      error: {
        code: 'agent_user_interrupt',
        message: 'The user interrupted verification after apply.',
        details: {}
      }
    }
  });
  const service = createAgentLifecycleService(deps);

  const envelope = await service.setup(setupInput({ yes: true }));

  assert.equal(envelope.result.outcome, 'failed-and-rolled-back');
  assert.equal(envelope.result.error.code, 'agent_user_interrupt');
  assert.equal(envelope.result.receiptId, null);
  assert.equal(deps.counters.transactions, 1);
  assert.equal(deps.counters.verifications, 1);
});

test('planner refusal for .launchdeck.yml authorship stays pre-write and does not enter transaction', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = faultDependencies({
    plannerResult: {
      outcome: 'refused',
      effectCertainty: 'none',
      scope: 'project',
      projectIdentity: 'F:\\repo\\demo',
      buildIdentity: BUILD_IDENTITY,
      operationId: null,
      planDigest: PLAN_DIGEST,
      receiptId: null,
      targets: [],
      health: [],
      effects: [],
      nextActions: [],
      error: {
        code: 'agent_project_config_authorship_forbidden',
        message: 'The installer must not author .launchdeck.yml.',
        details: {
          targetPath: 'F:\\repo\\demo\\.launchdeck.yml'
        }
      }
    }
  });
  const service = createAgentLifecycleService(deps);

  const envelope = await service.setup(setupInput({ yes: true }));

  assert.deepEqual(deps.trace, ['planner:discover']);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.result.outcome, 'refused');
  assert.equal(envelope.result.effectCertainty, 'none');
  assert.equal(envelope.result.error.code, 'agent_project_config_authorship_forbidden');
  assert.equal(deps.counters.transactions, 0);
  assert.equal(deps.counters.verifications, 0);
});

test('runtime provisioning failure leaves no launcher and never reports success', async (t) => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-runtime-fault-'));
  const env = {
    ...process.env,
    HOME: path.join(root, 'home'),
    USERPROFILE: path.join(root, 'userprofile'),
    LOCALAPPDATA: path.join(root, 'localappdata'),
    XDG_STATE_HOME: path.join(root, 'xdg-state'),
    LAUNCHDECK_HOME: path.join(root, 'launchdeck home')
  };
  const projectRoot = path.join(root, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifactStore = {
    inspect: () => ({ state: 'absent' }),
    resolveForActivation: () => null,
    install() {
      const error = new Error('injected artifact install failure');
      error.code = 'agent_artifact_install_injected';
      throw error;
    }
  };
  const service = createAgentLifecycleService({ env, artifactStore });
  const envelope = await service.setup({
    operation: 'setup',
    component: ['runtime'],
    scope: 'project',
    projectRoot,
    sourceIdentity: 'packaged',
    desiredBuildIdentity: PACKAGED_BUILD_IDENTITY,
    packagedBuildIdentity: PACKAGED_BUILD_IDENTITY,
    json: true,
    yes: true,
    requireExplicitSelection: true
  });

  assert.equal(envelope.ok, false);
  assert.notEqual(envelope.result.outcome, 'succeeded');
  assert.equal(envelope.result.receiptId, null);
  assert.equal(
    fs.existsSync(path.join(env.LAUNCHDECK_HOME, 'installer', 'launcher', 'v1')),
    false
  );
});

test('Host rollback wrapper forwards the coordinator transaction context without argument drift', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const plan = planFixture({
    actions: [actionFixture('codex:project:skill', 'copy-skill', 'launchdeck-agent')]
  });
  let rollbackArguments;
  const registry = {
    adapterFor() {
      return {
        rollback(...args) {
          rollbackArguments = args;
          return {
            restored: true,
            restoredDigest: plan.actions[0].preconditionDigest,
            verified: true
          };
        }
      };
    }
  };
  const rollbackContext = {
    operationId: OPERATION_ID,
    plan,
    effect: { effectId: 'effect-host' },
    backupRef: { backupId: 'backup-host' },
    receiptCandidate: {}
  };
  const service = createAgentLifecycleService({
    registry,
    planner: {
      async discoverDesiredInstallation() {
        return plannedResult(plan);
      }
    },
    approval: {
      async authorizePlan() {
        return {
          approved: true,
          planDigest: plan.planDigest,
          planBindingDigest: plan.planBindingDigest
        };
      }
    },
    transaction: {
      async execute(request) {
        await request.actions[0].rollback(rollbackContext);
        return transactionSuccess(plan);
      }
    }
  });

  const envelope = await service.setup(setupInput({ yes: true }));

  assert.equal(envelope.result.outcome, 'succeeded');
  assert.equal(rollbackArguments.length, 4);
  assert.equal(rollbackArguments[0], rollbackContext.effect);
  assert.equal(rollbackArguments[1], rollbackContext.backupRef);
  assert.equal(rollbackArguments[2], rollbackContext);
  assert.equal(rollbackArguments[3].registry, registry);
});

async function loadLifecycleModule() {
  return import(lifecycleModuleUrl);
}

function faultDependencies(options = {}) {
  const trace = [];
  const counters = {
    transactions: 0,
    verifications: 0
  };
  const verifiedBuilds = [];
  const plan = options.plan ?? planFixture();
  const plannerResult = options.plannerResult ?? plannedResult(plan);
  const dependencies = {
    trace,
    counters,
    verifiedBuilds,
    transactionRequest: null,
    planner: {
      async discoverDesiredInstallation() {
        trace.push('planner:discover');
        return plannerResult;
      }
    },
    approval: {
      async authorizePlan() {
        if (options.approvalResult?.approved === false) {
          trace.push('approval:decline');
          return options.approvalResult;
        }
        trace.push('approval:bind');
        return {
          approved: true,
          planDigest: plan.planDigest,
          planBindingDigest: plan.planBindingDigest
        };
      }
    },
    verifier: {
      async verifyInstallation({ plan: verificationPlan }) {
        trace.push('verifier:verify');
        counters.verifications += 1;
        assert.equal(verificationPlan.buildIdentity, BUILD_IDENTITY);
        const evidence = verificationPlan.actions.map((action) => ({
          targetId: action.targetId,
          kind: 'runtime-and-digest',
          buildIdentity: verificationPlan.buildIdentity,
          observedDigest: action.desiredDigest,
          verified: true
        }));
        verifiedBuilds.push(...evidence.map((entry) => entry.buildIdentity));
        return evidence;
      }
    },
    transaction: {
      async execute(request) {
        trace.push('transaction:execute');
        counters.transactions += 1;
        dependencies.transactionRequest = request;
        assert.equal(request.plan, plan);
        assert.equal(request.plan.buildIdentity, BUILD_IDENTITY);
        assert.equal(request.receiptCandidate.buildIdentity, BUILD_IDENTITY);
        assert.equal(request.receiptCandidate.verificationEvidence.length, 0);
        await request.verify({
          operationId: OPERATION_ID,
          plan,
          effects: [],
          receiptCandidate: request.receiptCandidate
        });
        trace.push('transaction:commit-receipt');
        return options.transactionResult ?? transactionSuccess(plan);
      }
    },
    operationIds: {
      next() {
        return OPERATION_ID;
      }
    }
  };
  return dependencies;
}

function setupInput(overrides = {}) {
  return {
    operation: 'setup',
    host: ['codex'],
    component: ['runtime', 'skill', 'mcp'],
    scope: 'project',
    projectRoot: 'F:\\repo\\demo',
    sourceIdentity: 'packaged',
    desiredBuildIdentity: BUILD_IDENTITY,
    packagedBuildIdentity: BUILD_IDENTITY,
    yes: false,
    json: false,
    interactive: false,
    ...overrides
  };
}

const BUILD_IDENTITY = `sha256:${'b'.repeat(64)}`;
const PACKAGED_BUILD_IDENTITY = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'agent', 'installer-payload', 'manifest.json'), 'utf8')
).buildIdentity;
const PLAN_DIGEST = `sha256:${'c'.repeat(64)}`;
const PLAN_BINDING_DIGEST = `sha256:${'d'.repeat(64)}`;
const OPERATION_ID = 'op_lifecycle_fault_000001';
const RECEIPT_ID = 'receipt_lifecycle_fault_000001';

function plannedResult(plan) {
  return {
    outcome: 'planned',
    effectCertainty: 'none',
    scope: plan.scope,
    projectIdentity: plan.projectIdentity,
    buildIdentity: plan.buildIdentity,
    operationId: null,
    planDigest: plan.planDigest,
    planBindingDigest: plan.planBindingDigest,
    receiptId: null,
    targets: plan.targets,
    health: [],
    effects: [],
    nextActions: [],
    error: null,
    plan
  };
}

function planFixture(overrides = {}) {
  const actions = overrides.actions ?? [
    actionFixture('codex:project:skill', 'copy-skill', 'launchdeck-agent'),
    actionFixture('codex:project:mcp', 'patch-owned-entry', 'mcpServers.launchdeck')
  ];
  return {
    planId: 'plan_fault_000001',
    scope: 'project',
    scopeIdentity: `project:sha256:${'1'.repeat(64)}`,
    projectIdentity: 'F:\\repo\\demo',
    buildIdentity: BUILD_IDENTITY,
    planDigest: PLAN_DIGEST,
    planBindingDigest: PLAN_BINDING_DIGEST,
    targetIds: actions.map((action) => action.targetId),
    includeLauncher: true,
    previousBuildPins: [`sha256:${'a'.repeat(64)}`],
    actions,
    targets: actions.map((action) => {
      const [hostId, scope, component] = action.targetId.split(':');
      return {
        targetId: action.targetId,
        hostId,
        scope,
        component,
        path: action.targetPath,
        ownershipBoundary: action.ownershipBoundary,
        ownership: 'launchdeck-owned',
        liveDigest: action.preconditionDigest,
        desiredDigest: action.desiredDigest
      };
    })
  };
}

function actionFixture(targetId, kind, ownershipBoundary) {
  const parts = targetId.split(':');
  const hostId = parts[0];
  const component = parts[2];
  return {
    actionId: `action-${targetId.replaceAll(':', '-')}`,
    kind,
    targetId,
    ownershipBoundary,
    targetPath: `F:\\repo\\demo\\.launchdeck-fixture\\${hostId}\\${component}`,
    preconditionDigest: digestFor(`${targetId}:before`),
    desiredDigest: digestFor(`${targetId}:after`),
    requiresBackup: true
  };
}

function transactionSuccess(plan) {
  return {
    outcome: 'succeeded',
    effectCertainty: 'complete',
    scope: plan.scope,
    projectIdentity: plan.projectIdentity,
    buildIdentity: plan.buildIdentity,
    operationId: OPERATION_ID,
    planDigest: plan.planDigest,
    receiptId: RECEIPT_ID,
    targets: plan.targets.map((target) => ({
      ...target,
      state: 'verified',
      digest: target.desiredDigest
    })),
    health: [],
    effects: plan.actions.map((action) => ({
      kind: action.kind,
      targetId: action.targetId,
      state: 'verified'
    })),
    nextActions: [],
    error: null
  };
}

function digestFor(seed) {
  const hex = Buffer.from(seed).toString('hex').padEnd(64, '0').slice(0, 64);
  return `sha256:${hex}`;
}
