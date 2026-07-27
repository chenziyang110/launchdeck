import assert from 'node:assert/strict';
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

test('npx and installed setup entrypoints normalize to the same shared setup service request', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = parityDependencies();
  const service = createAgentLifecycleService(deps);

  const npxEnvelope = await service.setupFromEntrypoint({
    entrypoint: 'npx',
    command: 'npx launchdeck@latest agent setup',
    args: setupArgs({ npmYes: true, yes: true })
  });
  const installedEnvelope = await service.setupFromEntrypoint({
    entrypoint: 'installed',
    command: 'launchdeck agent setup',
    args: setupArgs({ yes: true })
  });

  assert.equal(npxEnvelope.schemaVersion, 1);
  assert.equal(installedEnvelope.schemaVersion, 1);
  assert.equal(npxEnvelope.command, 'agent setup');
  assert.equal(installedEnvelope.command, 'agent setup');
  assert.equal(npxEnvelope.result.planDigest, installedEnvelope.result.planDigest);
  assert.equal(npxEnvelope.result.buildIdentity, installedEnvelope.result.buildIdentity);
  assert.equal(npxEnvelope.result.outcome, 'succeeded');
  assert.equal(installedEnvelope.result.outcome, 'succeeded');
  assert.deepEqual(
    deps.observedSetupInputs.map(canonicalEntrypointInput),
    [
      canonicalEntrypointInput(deps.observedSetupInputs[0]),
      canonicalEntrypointInput(deps.observedSetupInputs[0])
    ]
  );
  assert.equal(deps.counters.transactions, 2);
});

test('npm npx --yes never satisfies Launchdeck mutation approval', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = parityDependencies();
  const service = createAgentLifecycleService(deps);

  const envelope = await service.setupFromEntrypoint({
    entrypoint: 'npx',
    command: 'npx --yes launchdeck@latest agent setup --json',
    args: setupArgs({ npmYes: true, yes: false, json: true })
  });

  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.command, 'agent setup');
  assert.equal(envelope.result.outcome, 'refused');
  assert.equal(envelope.result.effectCertainty, 'none');
  assert.equal(envelope.result.error.code, 'agent_approval_required');
  assert.deepEqual(envelope.result.effects, []);
  assert.equal(deps.counters.transactions, 0);
  assert.equal(deps.counters.verifications, 0);
});

test('npx and installed setup entrypoints keep packaged selector separate from the verified packaged digest', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = parityDependencies();
  const service = createAgentLifecycleService(deps);

  const npxEnvelope = await service.setupFromEntrypoint({
    entrypoint: 'npx',
    command: 'npx launchdeck@latest agent setup --build packaged --json',
    args: {
      ...setupArgs({ npmYes: true, yes: false, json: true }),
      project: repoRoot,
      build: 'packaged',
      desiredBuildIdentity: 'packaged',
      packagedBuildIdentity: PACKAGED_BUILD_IDENTITY
    }
  });
  const installedEnvelope = await service.setupFromEntrypoint({
    entrypoint: 'installed',
    command: 'launchdeck agent setup --build packaged --json',
    args: {
      ...setupArgs({ yes: false, json: true }),
      project: repoRoot,
      build: 'packaged',
      desiredBuildIdentity: 'packaged',
      packagedBuildIdentity: PACKAGED_BUILD_IDENTITY
    }
  });

  assert.equal(npxEnvelope.schemaVersion, 1);
  assert.equal(installedEnvelope.schemaVersion, 1);
  assert.equal(npxEnvelope.ok, false);
  assert.equal(installedEnvelope.ok, false);
  assert.equal(npxEnvelope.command, 'agent setup');
  assert.equal(installedEnvelope.command, 'agent setup');
  assert.deepEqual(npxEnvelope.result, installedEnvelope.result);
  assert.equal(npxEnvelope.result.outcome, 'refused');
  assert.equal(npxEnvelope.result.error.code, 'agent_approval_required');
  assert.equal(deps.observedSetupInputs.length, 2);
  for (const observed of deps.observedSetupInputs) {
    assert.equal(observed.desiredBuildIdentity, 'packaged');
    assert.equal(observed.packagedBuildIdentity, PACKAGED_BUILD_IDENTITY);
  }
});

test('entrypoint normalization does not silently fall back across host, component, scope, path, or build', async () => {
  const { createAgentLifecycleService } = await loadLifecycleModule();
  const deps = parityDependencies();
  const service = createAgentLifecycleService(deps);

  await service.setupFromEntrypoint({
    entrypoint: 'installed',
    command: 'launchdeck agent setup',
    args: setupArgs({
      yes: true,
      host: ['codex', 'claude-code'],
      component: ['runtime', 'skill', 'mcp'],
      scope: 'user',
      project: 'F:\\repo\\explicit-demo',
      build: ALT_BUILD_IDENTITY
    })
  });

  assert.equal(deps.observedSetupInputs.length, 1);
  assert.deepEqual(deps.observedSetupInputs[0].host, ['codex', 'claude-code']);
  assert.deepEqual(deps.observedSetupInputs[0].component, ['runtime', 'skill', 'mcp']);
  assert.equal(deps.observedSetupInputs[0].scope, 'user');
  assert.equal(deps.observedSetupInputs[0].project, 'F:\\repo\\explicit-demo');
  assert.equal(deps.observedSetupInputs[0].desiredBuildIdentity, ALT_BUILD_IDENTITY);
});

async function loadLifecycleModule() {
  return import(lifecycleModuleUrl);
}

async function loadPlannerModule() {
  return import(plannerModuleUrl);
}

function parityDependencies() {
  const observedSetupInputs = [];
  const counters = {
    transactions: 0,
    verifications: 0
  };
  const plan = planFixture();
  return {
    observedSetupInputs,
    counters,
    planner: {
      async discoverDesiredInstallation(input) {
        const { artifactStore: _artifactStore, ...serializableInput } = input;
        observedSetupInputs.push(structuredClone(serializableInput));
        return plannedResult(plan);
      }
    },
    approval: {
      async authorizePlan({ input }) {
        if (input.yes !== true) {
          return {
            outcome: 'refused',
            effectCertainty: 'none',
            scope: 'project',
            projectIdentity: input.project ?? 'F:\\repo\\demo',
            buildIdentity: BUILD_IDENTITY,
            operationId: null,
            planDigest: PLAN_DIGEST,
            receiptId: null,
            targets: [],
            health: [],
            effects: [],
            nextActions: [],
            error: {
              code: 'agent_approval_required',
              message: 'Launchdeck --yes is required before mutation.',
              details: {}
            }
          };
        }
        return {
          approved: true,
          planDigest: plan.planDigest,
          planBindingDigest: plan.planBindingDigest
        };
      }
    },
    verifier: {
      async verifyInstallation() {
        counters.verifications += 1;
        return plan.actions.map((action) => ({
          targetId: action.targetId,
          kind: 'runtime-and-digest',
          buildIdentity: plan.buildIdentity,
          observedDigest: action.desiredDigest,
          verified: true
        }));
      }
    },
    transaction: {
      async execute(request) {
        counters.transactions += 1;
        await request.verify({
          operationId: `op_parity_${counters.transactions}`,
          plan,
          effects: [],
          receiptCandidate: request.receiptCandidate
        });
        return {
          outcome: 'succeeded',
          effectCertainty: 'complete',
          scope: plan.scope,
          projectIdentity: plan.projectIdentity,
          buildIdentity: plan.buildIdentity,
          operationId: `op_parity_${counters.transactions}`,
          planDigest: plan.planDigest,
          receiptId: `receipt_parity_${counters.transactions}`,
          targets: plan.targets,
          health: [],
          effects: [{ kind: 'setup', state: 'verified' }],
          nextActions: [],
          error: null
        };
      }
    },
    operationIds: {
      next() {
        return 'op_parity_next';
      }
    }
  };
}

function setupArgs(overrides = {}) {
  return {
    host: ['codex'],
    component: ['skill', 'mcp'],
    scope: 'project',
    project: 'F:\\repo\\demo',
    sourceIdentity: 'packaged',
    build: BUILD_IDENTITY,
    desiredBuildIdentity: BUILD_IDENTITY,
    packagedBuildIdentity: BUILD_IDENTITY,
    yes: false,
    npmYes: false,
    json: false,
    dryRun: false,
    ...overrides
  };
}

function canonicalEntrypointInput(input) {
  const {
    entrypoint: _entrypoint,
    command: _command,
    npmYes: _npmYes,
    ...normalized
  } = input;
  return normalized;
}

const BUILD_IDENTITY = `sha256:${'b'.repeat(64)}`;
const PACKAGED_BUILD_IDENTITY = BUILD_IDENTITY;
const ALT_BUILD_IDENTITY = `sha256:${'f'.repeat(64)}`;
const PLAN_DIGEST = `sha256:${'c'.repeat(64)}`;
const PLAN_BINDING_DIGEST = `sha256:${'d'.repeat(64)}`;

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

function planFixture() {
  const actions = [{
    actionId: 'action-codex-project-skill',
    kind: 'copy-skill',
    targetId: 'codex:project:skill',
    ownershipBoundary: 'launchdeck-agent',
    targetPath: 'F:\\repo\\demo\\.agents\\skills\\launchdeck-agent',
    preconditionDigest: `sha256:${'0'.repeat(64)}`,
    desiredDigest: `sha256:${'1'.repeat(64)}`,
    requiresBackup: true
  }];
  return {
    planId: 'plan_parity_000001',
    scope: 'project',
    scopeIdentity: `project:sha256:${'2'.repeat(64)}`,
    projectIdentity: 'F:\\repo\\demo',
    buildIdentity: BUILD_IDENTITY,
    planDigest: PLAN_DIGEST,
    planBindingDigest: PLAN_BINDING_DIGEST,
    targetIds: ['codex:project:skill'],
    includeLauncher: true,
    previousBuildPins: [],
    actions,
    targets: [{
      targetId: 'codex:project:skill',
      hostId: 'codex',
      scope: 'project',
      component: 'skill',
      path: actions[0].targetPath,
      ownershipBoundary: actions[0].ownershipBoundary,
      ownership: 'launchdeck-owned',
      liveDigest: actions[0].preconditionDigest,
      desiredDigest: actions[0].desiredDigest
    }]
  };
}
