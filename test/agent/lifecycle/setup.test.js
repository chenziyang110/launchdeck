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
const plannerModuleUrl = pathToFileURL(
  path.join(repoRoot, 'src', 'agent', 'planner', 'desired-installation.js')
).href;

test('lifecycle service exports the shared setup orchestration surface', async () => {
  const mod = await loadLifecycleModule();

  assert.equal(typeof mod.createAgentLifecycleService, 'function');

  const service = mod.createAgentLifecycleService(lifecycleDependencies());
  assert.equal(typeof service.setup, 'function');
  assert.equal(typeof service.setupFromEntrypoint, 'function');
});

test('Host precondition observations retain approved identity and derive an absent content digest', async () => {
  const mod = await loadLifecycleModule();
  assert.equal(typeof mod.normalizeHostPlanObservation, 'function');
  const target = {
    targetId: 'codex:project:skill',
    hostId: 'codex',
    scope: 'project',
    component: 'skill',
    path: path.join(repoRoot, '.agents', 'skills', 'launchdeck-agent'),
    ownershipBoundary: 'launchdeck-agent',
    ownership: 'launchdeck',
    liveDigest: `sha256:${'0'.repeat(64)}`,
    evidenceDigest: `sha256:${'1'.repeat(64)}`
  };
  const normalized = mod.normalizeHostPlanObservation(target, {
    path: target.path,
    status: 'absent',
    contentDigest: null,
    ownershipBoundary: 'launchdeck-agent'
  });

  assert.equal(normalized.targetId, target.targetId);
  assert.equal(normalized.ownership, 'launchdeck');
  assert.equal(
    normalized.observedDigest,
    'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  assert.equal(normalized.evidenceDigest, target.evidenceDigest);

  const missingFileObservation = mod.normalizeHostPlanObservation({
    ...target,
    targetId: 'codex:project:mcp',
    component: 'mcp',
    ownershipBoundary: '[mcp_servers.launchdeck]'
  }, {
    path: target.path,
    exists: false,
    digest: null,
    ownershipBoundary: '[mcp_servers.launchdeck]'
  });
  assert.equal(
    missingFileObservation.observedDigest,
    'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
});

test('default Host verification receives the target desired digest for a fresh Skill install', async () => {
  const mod = await loadLifecycleModule();
  assert.equal(typeof mod.desiredBuildForVerification, 'function');
  const target = {
    component: 'skill',
    desiredDigest: `sha256:${'2'.repeat(64)}`
  };
  const desired = mod.desiredBuildForVerification(target, {
    buildIdentity: BUILD_IDENTITY
  });

  assert.equal(desired.buildIdentity, BUILD_IDENTITY);
  assert.equal(desired.skillDigest, target.desiredDigest);
  assert.equal(desired.skill.contentDigest, target.desiredDigest);
});

test('approved setup plans once, binds approval, executes one transaction, verifies, then returns schemaVersion 1', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = lifecycleDependencies();
  const service = createAgentLifecycleService(deps);

  const envelope = await service.setup(setupInput({ yes: true, json: true }));

  assert.deepEqual(deps.trace, [
    'planner:discover',
    'approval:bind',
    'transaction:execute',
    'verifier:verify',
    'transaction:commit-receipt'
  ]);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.command, 'agent setup');
  assert.equal(envelope.result.outcome, 'succeeded');
  assert.equal(envelope.result.effectCertainty, 'complete');
  assert.equal(envelope.result.scope, 'project');
  assert.equal(envelope.result.buildIdentity, BUILD_IDENTITY);
  assert.equal(envelope.result.planDigest, PLAN_DIGEST);
  assert.equal(envelope.result.receiptId, RECEIPT_ID);
  assert.deepEqual(envelope.result.targets.map((target) => target.targetId), [
    'codex:project:skill',
    'codex:project:mcp'
  ]);
});

test('dry-run returns the complete plan without approval, transaction, verifier, or writes', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = lifecycleDependencies();
  const service = createAgentLifecycleService(deps);

  const envelope = await service.setup(setupInput({ dryRun: true, json: true }));

  assert.deepEqual(deps.trace, ['planner:discover']);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.outcome, 'planned');
  assert.equal(envelope.result.effectCertainty, 'none');
  assert.equal(envelope.result.planDigest, PLAN_DIGEST);
  assert.equal(envelope.result.receiptId, null);
  assert.deepEqual(envelope.result.effects, []);
  assert.equal(deps.counters.transactionRequests, 0);
  assert.equal(deps.counters.verifications, 0);
});

test('JSON setup without Launchdeck --yes is a typed pre-write refusal', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = lifecycleDependencies();
  const service = createAgentLifecycleService(deps);

  const envelope = await service.setup(setupInput({ json: true, yes: false }));

  assert.deepEqual(deps.trace, ['planner:discover', 'approval:refuse']);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.result.outcome, 'refused');
  assert.equal(envelope.result.effectCertainty, 'none');
  assert.equal(envelope.result.error.code, 'agent_approval_required');
  assert.equal(envelope.result.receiptId, null);
  assert.deepEqual(envelope.result.effects, []);
  assert.equal(deps.counters.transactionRequests, 0);
});

test('planner pre-plan invalid build refusal preserves typed error and null digests without writes', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const { discoverDesiredInstallation } = await loadPlannerModule();
  const deps = prePlanRefusalDependencies(discoverDesiredInstallation);
  const service = createAgentLifecycleService(deps);

  const envelope = await service.setup(setupInput({
    json: true,
    yes: false,
    projectRoot: repoRoot,
    build: 'not-a-digest',
    desiredBuildIdentity: 'not-a-digest',
    packagedBuildIdentity: 'not-a-digest'
  }));

  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.result.outcome, 'refused');
  assert.equal(envelope.result.effectCertainty, 'none');
  assert.equal(envelope.result.buildIdentity, null);
  assert.equal(envelope.result.planDigest, null);
  assert.equal(envelope.result.operationId, null);
  assert.equal(envelope.result.receiptId, null);
  assert.deepEqual(envelope.result.targets, []);
  assert.deepEqual(envelope.result.effects, []);
  assert.equal(envelope.result.error.code, 'agent_build_identity_invalid');
  assert.equal(
    envelope.result.error.message,
    'Build selection must be a sha256 digest or packaged.'
  );
  assert.equal(deps.counters.approvals, 0);
  assert.equal(deps.counters.transactionRequests, 0);
  assert.equal(deps.counters.verifications, 0);
});

test('identical target state is an explicit no-op and does not request approval or transaction', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = lifecycleDependencies({
    plannerResult: plannedResult({
      plan: planFixture({ actions: [], targets: [] }),
      outcome: 'noop',
      effectCertainty: 'none',
      targets: []
    })
  });
  const service = createAgentLifecycleService(deps);

  const envelope = await service.setup(setupInput({ yes: true }));

  assert.deepEqual(deps.trace, ['planner:discover']);
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.result.outcome, 'noop');
  assert.equal(envelope.result.effectCertainty, 'none');
  assert.equal(envelope.result.receiptId, null);
  assert.deepEqual(envelope.result.effects, []);
  assert.equal(deps.counters.transactionRequests, 0);
});

test('repeated setup binds the current receipt into planning without committing another receipt', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const receipt = {
    receiptId: 'receipt_existing_setup',
    buildIdentity: BUILD_IDENTITY,
    targets: [{
      targetId: 'codex:project:skill',
      ownershipBoundary: 'launchdeck-agent',
      desiredDigest: `sha256:${'3'.repeat(64)}`
    }]
  };
  const plan = planFixture({ actions: [], targets: [] });
  let plannerInput;
  const service = createAgentLifecycleService({
    receiptStore: {
      async readCurrent() {
        return receipt;
      }
    },
    planner: {
      async discoverDesiredInstallation(input) {
        plannerInput = input;
        return plannedResult({
          plan,
          outcome: 'noop',
          effectCertainty: 'none',
          targets: []
        });
      }
    }
  });

  const result = await service.setup(setupInput({
    yes: true,
    projectRoot: process.cwd()
  }));

  assert.equal(plannerInput.receipt, receipt);
  assert.equal(plannerInput.targets, receipt.targets);
  assert.equal(result.result.outcome, 'noop');
  assert.equal(result.result.receiptId, null);
});

test('interactive approval is honored independently from --yes by the default approval authority', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const plan = planFixture();
  let transactions = 0;
  const service = createAgentLifecycleService({
    planner: {
      async discoverDesiredInstallation() {
        return plannedResult({ plan });
      }
    },
    transaction: {
      async execute() {
        transactions += 1;
        return transactionSuccess(plan);
      }
    }
  });

  const approved = await service.setup({
    projectRoot: process.cwd(),
    build: BUILD_IDENTITY,
    approved: true,
    yes: false
  });
  const declined = await service.setup({
    projectRoot: process.cwd(),
    build: BUILD_IDENTITY,
    approved: false,
    yes: false
  });

  assert.equal(approved.result.outcome, 'succeeded');
  assert.equal(declined.result.outcome, 'cancelled');
  assert.equal(transactions, 1);
});

test('runtime-only setup installs the packaged stable launcher, repeats as noop, and uninstalls it', async (t) => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-runtime-only-'));
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
  const service = createAgentLifecycleService({ env });
  const input = {
    operation: 'setup',
    component: ['runtime'],
    scope: 'project',
    projectRoot,
    sourceIdentity: 'packaged',
    desiredBuildIdentity: PACKAGED_BUILD_IDENTITY,
    packagedBuildIdentity: PACKAGED_BUILD_IDENTITY,
    json: true,
    yes: true,
    dryRun: false,
    requireExplicitSelection: true
  };

  const installed = await service.setup(input);
  const repeated = await service.setup(input);
  const launcherRoot = path.join(env.LAUNCHDECK_HOME, 'installer', 'launcher', 'v1');

  assert.equal(installed.ok, true, JSON.stringify(installed));
  assert.equal(installed.result.outcome, 'succeeded');
  assert.equal(
    installed.result.targets.some((target) => target.component === 'runtime'),
    true
  );
  assert.equal(fs.existsSync(path.join(launcherRoot, 'launchdeck-mcp')), true);
  assert.equal(fs.existsSync(path.join(launcherRoot, 'launchdeck-mcp.cmd')), true);
  assert.equal(fs.existsSync(path.join(launcherRoot, 'launcher.js')), true);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.result.outcome, 'noop');

  const uninstalled = await service.uninstall({
    component: ['runtime'],
    scope: 'project',
    projectRoot,
    build: PACKAGED_BUILD_IDENTITY,
    json: true,
    yes: true
  });
  const status = await service.status({ scope: 'project', projectRoot });

  assert.equal(uninstalled.ok, true, JSON.stringify(uninstalled));
  assert.equal(uninstalled.result.outcome, 'succeeded');
  assert.equal(fs.existsSync(launcherRoot), false);
  assert.equal(status.result.targets[0].state, 'absent');
  assert.equal(status.result.health[0].severity, 'info');
});

async function loadLifecycleModule() {
  return import(lifecycleModuleUrl);
}

async function loadPlannerModule() {
  return import(plannerModuleUrl);
}

function lifecycleDependencies(options = {}) {
  const trace = [];
  const counters = {
    transactionRequests: 0,
    verifications: 0
  };
  const plan = options.plan ?? planFixture();
  const plannerResult = options.plannerResult ?? plannedResult({ plan });

  return {
    trace,
    counters,
    planner: {
      async discoverDesiredInstallation(input) {
        trace.push('planner:discover');
        assert.equal(input.operation, 'setup');
        assert.equal(input.sourceIdentity, 'packaged');
        assert.equal(input.desiredBuildIdentity, BUILD_IDENTITY);
        return plannerResult;
      }
    },
    approval: {
      async authorizePlan({ input, plan: approvedPlan }) {
        if (input.yes !== true) {
          trace.push('approval:refuse');
          return refusalResult({
            code: 'agent_approval_required',
            message: 'Launchdeck --yes is required before mutation.'
          });
        }
        trace.push('approval:bind');
        assert.equal(approvedPlan.planDigest, plan.planDigest);
        assert.equal(approvedPlan.planBindingDigest, plan.planBindingDigest);
        return {
          approved: true,
          planDigest: approvedPlan.planDigest,
          planBindingDigest: approvedPlan.planBindingDigest
        };
      }
    },
    verifier: {
      async verifyInstallation(request) {
        trace.push('verifier:verify');
        counters.verifications += 1;
        assert.equal(request.operation, 'setup');
        assert.equal(request.plan.planDigest, plan.planDigest);
        assert.equal(request.plan.buildIdentity, BUILD_IDENTITY);
        assert.equal(request.receiptCandidate.receiptId, RECEIPT_ID);
        return plan.actions.map((action) => ({
          targetId: action.targetId,
          kind: 'runtime-and-digest',
          buildIdentity: BUILD_IDENTITY,
          observedDigest: action.desiredDigest,
          verified: true
        }));
      }
    },
    transaction: {
      async execute(request) {
        trace.push('transaction:execute');
        counters.transactionRequests += 1;
        assert.equal(request.operation, 'setup');
        assert.equal(request.plan, plan);
        assert.equal(request.approval.approved, true);
        assert.equal(request.approval.planDigest, plan.planDigest);
        assert.equal(request.approval.planBindingDigest, plan.planBindingDigest);
        assert.equal(request.receiptCandidate.receiptId, RECEIPT_ID);
        assert.equal(typeof request.verify, 'function');
        const verificationEvidence = await request.verify({
          operationId: OPERATION_ID,
          plan,
          effects: effectEvidence(plan),
          receiptCandidate: request.receiptCandidate
        });
        assert.equal(verificationEvidence.length, plan.actions.length);
        trace.push('transaction:commit-receipt');
        return transactionSuccess(plan);
      }
    },
    operationIds: {
      next() {
        return OPERATION_ID;
      }
    },
    clock: () => new Date('2026-07-23T12:00:00.000Z')
  };
}

function prePlanRefusalDependencies(discoverDesiredInstallation) {
  return {
    counters: {
      approvals: 0,
      transactionRequests: 0,
      verifications: 0
    },
    registry: {},
    planner: {
      discoverDesiredInstallation
    },
    approval: {
      async authorizePlan() {
        throw new Error('approval should not run for pre-plan refusal');
      }
    },
    verifier: {
      async verifyInstallation() {
        throw new Error('verifier should not run for pre-plan refusal');
      }
    },
    transaction: {
      async execute() {
        throw new Error('transaction should not run for pre-plan refusal');
      }
    }
  };
}

function setupInput(overrides = {}) {
  return {
    operation: 'setup',
    host: ['codex'],
    component: ['skill', 'mcp'],
    scope: 'project',
    projectRoot: 'F:\\repo\\demo',
    sourceIdentity: 'packaged',
    desiredBuildIdentity: BUILD_IDENTITY,
    packagedBuildIdentity: BUILD_IDENTITY,
    json: false,
    yes: false,
    dryRun: false,
    ...overrides
  };
}

const BUILD_IDENTITY = `sha256:${'b'.repeat(64)}`;
const PACKAGED_BUILD_IDENTITY = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'agent', 'installer-payload', 'manifest.json'), 'utf8')
).buildIdentity;
const PLAN_DIGEST = `sha256:${'c'.repeat(64)}`;
const PLAN_BINDING_DIGEST = `sha256:${'d'.repeat(64)}`;
const INPUT_DIGEST = `sha256:${'e'.repeat(64)}`;
const OPERATION_ID = 'op_lifecycle_setup_000001';
const RECEIPT_ID = 'receipt_lifecycle_setup_000001';

function plannedResult({ plan = planFixture(), outcome = 'planned', effectCertainty = 'none', targets = plan.targets } = {}) {
  return {
    outcome,
    effectCertainty,
    scope: plan.scope,
    projectIdentity: plan.projectIdentity,
    buildIdentity: plan.buildIdentity,
    operationId: null,
    planDigest: plan.planDigest,
    planBindingDigest: plan.planBindingDigest,
    receiptId: null,
    targets,
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
  const targets = overrides.targets ?? actions.map((action) => ({
    targetId: action.targetId,
    hostId: action.targetId.split(':')[0],
    scope: action.targetId.split(':')[1],
    component: action.targetId.split(':')[2],
    path: action.targetPath,
    ownershipBoundary: action.ownershipBoundary,
    ownership: 'launchdeck-owned',
    liveDigest: action.preconditionDigest,
    desiredDigest: action.desiredDigest
  }));
  return {
    planId: 'plan_lifecycle_setup_000001',
    scope: 'project',
    scopeIdentity: `project:sha256:${'1'.repeat(64)}`,
    projectIdentity: 'F:\\repo\\demo',
    buildIdentity: BUILD_IDENTITY,
    planDigest: PLAN_DIGEST,
    planBindingDigest: PLAN_BINDING_DIGEST,
    desiredInstallationDigest: INPUT_DIGEST,
    targetIds: targets.map((target) => target.targetId),
    includeLauncher: true,
    previousBuildPins: [`sha256:${'a'.repeat(64)}`],
    actions,
    targets,
    trustedSources: ['capability-matrix:sha256:fixture']
  };
}

function actionFixture(targetId, kind, ownershipBoundary) {
  const component = targetId.split(':')[2];
  return {
    actionId: `action-${targetId.replaceAll(':', '-')}`,
    kind,
    targetId,
    ownershipBoundary,
    targetPath: `F:\\repo\\demo\\.launchdeck-fixture\\${component}`,
    preconditionDigest: `sha256:${component === 'skill' ? '0' : '1'}`.padEnd(71, component === 'skill' ? '0' : '1'),
    desiredDigest: `sha256:${component === 'skill' ? '2' : '3'}`.padEnd(71, component === 'skill' ? '2' : '3'),
    requiresBackup: true
  };
}

function effectEvidence(plan) {
  return plan.actions.map((action) => ({
    effectId: `effect-${action.actionId}`,
    actionId: action.actionId,
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    effectType: action.kind,
    beforeDigest: action.preconditionDigest,
    afterDigest: action.desiredDigest,
    effectCertainty: 'complete'
  }));
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
    effects: effectEvidence(plan),
    nextActions: [],
    error: null
  };
}

function refusalResult({ code, message }) {
  return {
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
      code,
      message,
      details: {}
    }
  };
}
