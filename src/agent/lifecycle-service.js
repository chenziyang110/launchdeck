import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createApprovalRequirement,
  createDryRunPlanResult,
  createNoopPlanResult,
  discoverDesiredInstallation,
  revalidatePlanPreconditions
} from './planner/index.js';
import { createInstallerExecutionEnvelope } from './result.js';
import { AgentInstallerError, toInstallerErrorPayload } from './errors.js';
import { digestCanonical } from './digests.js';
import { createAgentDiagnostics } from './diagnostics.js';
import { createHostRegistry } from './hosts/index.js';
import { createArtifactStore } from './artifacts/store.js';
import { installStableLauncher } from './artifacts/launcher.js';
import { createOperationJournal } from '../control-plane/operation-journal.js';
import { createBackupStore } from './state/backup-store.js';
import { createReceiptStore } from './state/receipt-store.js';
import { resolveInstallationScopeReference } from './state/scope-resolver.js';
import { createCanonicalTransactionPlanId } from './state/transaction-plan.js';
import { createInstallerTransactionCoordinator } from './state/transaction-coordinator.js';
import { withInstallerResourceLocks } from './state/resource-locks.js';
import { createInstallationVerifier } from './verification/index.js';
import { isCanonicalPublicReconciliationPath } from './state/public-reconciliation.js';
import { resolveInstallerEntrypoints } from './entrypoints.js';

const COMMAND = 'agent setup';
const EMPTY_DIGEST = `sha256:${'0'.repeat(64)}`;
const EMPTY_CONTENT_DIGEST = `sha256:${crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`;
const PACKAGED_PAYLOAD_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'agent',
  'installer-payload'
);
const COMMAND_BY_OPERATION = Object.freeze({
  setup: 'agent setup',
  status: 'agent status',
  doctor: 'agent doctor',
  update: 'agent update',
  repair: 'agent repair',
  uninstall: 'agent uninstall',
  reconcile: 'operation reconcile'
});
const FAILURE_OUTCOMES = new Set([
  'refused',
  'failed-and-rolled-back',
  'partial',
  'indeterminate'
]);

export function createAgentLifecycleService(options = {}) {
  const dependencies = createDependencies(options);

  return Object.freeze({
    async setup(input = {}) {
      return setupWithDependencies(dependencies, normalizeSetupInput(input));
    },
    async setupFromEntrypoint(request = {}) {
      const input = normalizeEntrypointSetupInput(request);
      return setupWithDependencies(dependencies, input);
    },
    async status(input = {}) {
      return diagnosticWithDependencies(dependencies, 'status', input);
    },
    async doctor(input = {}) {
      return diagnosticWithDependencies(dependencies, 'doctor', input);
    },
    async update(input = {}) {
      return updateWithDependencies(dependencies, normalizeLifecycleInput('update', input));
    },
    async repair(input = {}) {
      return repairWithDependencies(dependencies, normalizeLifecycleInput('repair', input));
    },
    async uninstall(input = {}) {
      return uninstallWithDependencies(dependencies, normalizeLifecycleInput('uninstall', input));
    },
    async reconcile(input = {}) {
      return reconcileWithDependencies(dependencies, input);
    },
    async observeGarbageCollection(input = {}) {
      if (typeof dependencies.garbageCollector?.observe !== 'function') return [];
      return dependencies.garbageCollector.observe(input);
    }
  });
}

async function setupWithDependencies(dependencies, input) {
  const receipt = await readCurrentReceiptForInput(dependencies, input);
  const planResult = await dependencies.planner.discoverDesiredInstallation({
    ...input,
    receipt,
    targets: input.targets ?? receipt?.targets ?? [],
    env: dependencies.env,
    ...(input.registry ?? dependencies.plannerRegistry
      ? { registry: input.registry ?? dependencies.plannerRegistry }
      : {}),
    artifactStore: input.artifactStore ?? dependencies.artifactStore
  });
  const plan = planFromResult(planResult, input);

  if (planResult?.outcome === 'refused') {
    return setupEnvelope(dependencies, planResult, input, plan);
  }
  if (plan && containsProjectConfigAuthorship(plan)) {
    return setupEnvelope(dependencies, refusalForPlan({
      plan,
      code: 'agent_project_config_authorship_forbidden',
      message: 'The installer must not author .launchdeck.yml.'
    }), input, plan);
  }
  if (!plan) {
    return setupEnvelope(dependencies, refusalForPlanResult(planResult, {
      code: 'agent_plan_invalid',
      message: 'Planner did not return an immutable setup plan.'
    }), input, plan);
  }
  if (input.dryRun === true) {
    return setupEnvelope(dependencies, createDryRunPlanResult({ plan }), input, plan);
  }
  if (planResult?.outcome === 'noop' || plan.actions?.length === 0) {
    return setupEnvelope(dependencies, createNoopPlanResult({ plan }), input, plan);
  }

  const approval = await dependencies.approval.authorizePlan({ input, plan });
  if (approval?.outcome === 'refused') {
    return setupEnvelope(dependencies, approval, input, plan);
  }
  if (approval?.approved !== true) {
    return setupEnvelope(dependencies, cancelledResult({ plan, approval }), input, plan);
  }

  const operationId = nextOperationId(dependencies.operationIds);
  const receiptCandidate = createReceiptCandidate({
    plan,
    receiptId: receiptIdForOperation(operationId),
    clock: dependencies.clock
  });
  const request = {
    operationId,
    operation: 'setup',
    inputDigest: plan.desiredInstallationDigest
      ?? input.inputDigest
      ?? digestLifecycleInput(input),
    plan,
    approval,
    actions: executableActionsForPlan(plan, dependencies),
    receiptCandidate,
    revalidatePlan: ({ plan: approvedPlan, locks }) =>
      revalidateApprovedPlan({ plan: approvedPlan, locks, dependencies }),
    verify: ({ operationId: verifyOperationId, plan: verifiedPlan, effects, receiptCandidate: candidate }) =>
      dependencies.verifier.verifyInstallation({
        operation: 'setup',
        operationId: verifyOperationId,
        plan: verifiedPlan,
        effects,
        receiptCandidate: candidate
      })
  };

  const transactionResult = await dependencies.transaction.execute(request);
  return setupEnvelope(dependencies, mergeTransactionResult({ plan, transactionResult }), input, plan);
}

async function diagnosticWithDependencies(dependencies, operation, input) {
  const result = await dependencies.diagnostics.observe({
    operation,
    ...input
  });
  const normalized = normalizeResultFallbacks({
    operation,
    result,
    input
  });
  return envelopeFor(operation, withInstallerEntrypoints(dependencies, normalized, input));
}

async function updateWithDependencies(dependencies, input) {
  const receipt = await readCurrentReceiptForInput(dependencies, input);
  return mutationWithDependencies(dependencies, {
    ...input,
    receipt,
    targets: input.targets ?? receipt?.targets ?? [],
    previousBuildPins: input.previousBuildPins?.length > 0
      ? input.previousBuildPins
      : [receipt?.buildIdentity].filter(Boolean)
  });
}

async function mutationWithDependencies(dependencies, input) {
  const planResult = await dependencies.lifecyclePlanner.planMutation({
    ...input,
    env: dependencies.env,
    registry: input.registry ?? dependencies.registry,
    artifactStore: input.artifactStore ?? dependencies.artifactStore
  });
  const plan = planFromResult(planResult, input);

  if (planResult?.outcome === 'refused') {
    return envelopeFor(input.operation, normalizeResultFallbacks({
      operation: input.operation,
      result: planResult,
      input
    }));
  }
  if (!plan) {
    return envelopeFor(input.operation, lifecycleRefusal({
      input,
      code: 'agent_plan_invalid',
      message: 'Lifecycle planner did not return an immutable mutation plan.'
    }));
  }
  if (input.dryRun === true) {
    return envelopeFor(input.operation, createDryRunPlanResult({ plan }));
  }
  if (planResult?.outcome === 'noop' || plan.actions?.length === 0) {
    return envelopeFor(input.operation, createNoopPlanResult({ plan }));
  }

  const approval = await dependencies.approval.authorizePlan({ input, plan });
  if (approval?.outcome === 'refused') {
    return envelopeFor(input.operation, normalizeResultFallbacks({
      operation: input.operation,
      result: approval,
      input,
      plan
    }));
  }
  if (approval?.approved !== true) {
    return envelopeFor(input.operation, cancelledResult({ plan, approval }));
  }

  const operationId = nextOperationId(dependencies.operationIds);
  const receiptCandidate = createReceiptCandidate({
    plan,
    receiptId: receiptIdForOperation(operationId),
    clock: dependencies.clock
  });
  const request = {
    operationId,
    operation: input.operation,
    inputDigest: plan.desiredInstallationDigest
      ?? input.inputDigest
      ?? digestLifecycleInput(input),
    plan,
    approval,
    actions: executableActionsForPlan(plan, dependencies),
    receiptCandidate,
    revalidatePlan: ({ plan: approvedPlan, locks }) =>
      revalidateLifecyclePlan({
        operation: input.operation,
        plan: approvedPlan,
        locks,
        dependencies
      }),
    verify: ({ operationId: verifyOperationId, plan: verifiedPlan, effects, receiptCandidate: candidate }) =>
      dependencies.verifier.verifyInstallation({
        operation: input.operation,
        operationId: verifyOperationId,
        plan: verifiedPlan,
        effects,
        receiptCandidate: candidate
      })
  };

  const transactionResult = await dependencies.transaction.execute(request);
  return envelopeFor(input.operation, mergeTransactionResult({ plan, transactionResult }));
}

async function repairWithDependencies(dependencies, input) {
  const receipt = await readCurrentReceiptForInput(dependencies, input);
  const diagnostics = await dependencies.diagnostics.observe(input);
  const targets = repairTargets({ receipt, diagnostics, force: input.force });
  if (targets.refusal) {
    return envelopeFor('repair', lifecycleRefusal({
      input,
      receipt,
      code: 'agent_repair_divergent_owned_content',
      message: 'Repair refuses divergent owned content unless force is proven and bounded.'
    }));
  }
  if (targets.items.length === 0) {
    return envelopeFor('repair', lifecycleNoop({ input, receipt, targets: [] }));
  }
  const observedByTargetId = new Map(
    (diagnostics?.targets ?? []).map((target) => [target.targetId, target])
  );
  const preservedTargets = (receipt?.targets ?? []).map((target) => ({
    ...target,
    ...(observedByTargetId.get(target.targetId) ?? {})
  }));
  const components = [...new Set(preservedTargets
    .map((target) => target.component ?? parseLifecycleTargetId(target.targetId)?.component)
    .filter(Boolean))];
  const hostIds = [...new Set(preservedTargets
    .map((target) => target.hostId ?? parseLifecycleTargetId(target.targetId)?.hostId)
    .filter((hostId) => hostId && hostId !== 'launchdeck'))];
  return mutationWithDependencies(dependencies, {
    ...input,
    receipt,
    targets: preservedTargets,
    components,
    component: components,
    hostIds,
    hosts: hostIds,
    host: hostIds
  });
}

async function uninstallWithDependencies(dependencies, input) {
  const receipt = await readCurrentReceiptForInput(dependencies, input);
  const diagnostics = await dependencies.diagnostics.observe(input);
  const targets = uninstallTargets({ receipt, diagnostics, force: input.force });
  if (targets.length === 0) {
    return envelopeFor('uninstall', lifecycleNoop({ input, receipt, targets: [] }));
  }
  return mutationWithDependencies(dependencies, { ...input, receipt, targets });
}

async function reconcileWithDependencies(dependencies, input) {
  if (!publicReconciliationPathIsCanonical(input.publicStatePath)) {
    return envelopeFor('reconcile', lifecycleRefusal({
      input: { ...input, scope: input.scope ?? 'project' },
      code: 'agent_reconciliation_path_invalid',
      message: 'Public reconciliation state path must be canonical before filesystem observation.'
    }));
  }
  const reconciler = dependencies.reconciler;
  const reconcile = typeof reconciler?.reconcileOperation === 'function'
    ? reconciler.reconcileOperation.bind(reconciler)
    : reconciler?.reconcile?.bind(reconciler);
  if (typeof reconcile !== 'function') {
    return envelopeFor('reconcile', lifecycleRefusal({
      input: { ...input, scope: input.scope ?? 'project' },
      code: 'agent_reconciliation_unavailable',
      message: 'No installer reconciler is available.'
    }));
  }
  const result = await reconcile(input);
  return envelopeFor('reconcile', normalizeResultFallbacks({
    operation: 'reconcile',
    result,
    input
  }));
}

function createDependencies(options) {
  const env = normalizeInstallerEnv(options.env ?? process.env);
  const clock = options.clock ?? (() => new Date());
  const registry = options.registry ?? createHostRegistry(options.hostRegistry ?? {});
  const artifactStore = options.artifactStore ?? safeCreateArtifactStore({ env });
  const planner = options.planner ?? { discoverDesiredInstallation };
  const lifecyclePlanner = options.lifecyclePlanner ?? createDefaultLifecyclePlanner({ planner });
  const receiptStore = options.receiptStore ?? createReceiptStore({ env, clock });
  const diagnostics = options.diagnostics ?? createAgentDiagnostics({ receiptStore, registry, env });
  const verifier = options.verifier ?? createDefaultVerifier({ registry, env });
  const approval = options.approval ?? createDefaultApproval();
  const operationIds = options.operationIds ?? { next: createOperationId };
  const transactionReceiptStore = typeof receiptStore?.commit === 'function'
    ? receiptStore
    : createReceiptStore({ env, clock });
  const backupStore = options.backupStore ?? createBackupStore({ env, clock });
  const transaction = options.transaction ?? createDefaultTransaction({
    env,
    clock,
    options: { ...options, backupStore, receiptStore: transactionReceiptStore }
  });
  const runtimeProvisioner = options.runtimeProvisioner ?? createRuntimeProvisioner({
    env,
    artifactStore,
    backupStore
  });

  return Object.freeze({
    approval,
    artifactStore,
    backupStore,
    clock,
    diagnostics,
    garbageCollector: options.garbageCollector ?? null,
    lifecyclePlanner,
    env,
    operationIds,
    planner,
    plannerRegistry: options.registry ?? (options.planner ? undefined : registry),
    receiptStore,
    reconciler: options.reconciler ?? null,
    registry,
    runtimeProvisioner,
    transaction,
    verifier,
    resolveEntrypoints: options.resolveEntrypoints
      ?? ((input) => resolveInstallerEntrypoints({ ...input, env }))
  });
}

function createDefaultLifecyclePlanner({ planner }) {
  return Object.freeze({
    async planMutation(input) {
      if (typeof planner?.planMutation === 'function') return planner.planMutation(input);
      return discoverDesiredInstallation(input);
    }
  });
}

function createDefaultTransaction({ env, clock, options }) {
  const journal = options.journal ?? createOperationJournal({
    env,
    clock,
    lockWaitMs: options.lockWaitMs,
    faultInjector: options.faultInjector
  });
  const receiptStore = options.receiptStore ?? createReceiptStore({ env, clock });
  const backupStore = options.backupStore ?? createBackupStore({ env, clock });
  return createInstallerTransactionCoordinator({
    journal,
    receiptStore,
    backupStore,
    resourceLockRunner: options.resourceLockRunner
      ?? ((lockOptions, callback) =>
        withInstallerResourceLocks({ ...lockOptions, env }, callback)),
    faultInjector: options.faultInjector
  });
}

function createDefaultApproval() {
  return Object.freeze({
    async authorizePlan({ input, plan }) {
      if (input.yes === true || input.approved === true) {
        return {
          approved: true,
          planDigest: plan.planDigest,
          planBindingDigest: plan.planBindingDigest
        };
      }
      if (input.approved === false) {
        return {
          approved: false,
          planDigest: plan.planDigest,
          planBindingDigest: plan.planBindingDigest
        };
      }
      return createApprovalRequirement({ plan, jsonMode: input.json === true });
    }
  });
}

function createDefaultVerifier({ registry, env }) {
  const targetVerifier = createInstallationVerifier();
  return Object.freeze({
    async verifyInstallation({ operation, plan, effects, receiptCandidate }) {
      if (operation === 'uninstall') {
        return verifyUninstalledTargets({ plan, registry });
      }
      const evidence = [];
      const effectsByTargetId = new Map((effects ?? []).map((effect) => [effect.targetId, effect]));
      for (const target of plan.targets ?? []) {
        const adapter = adapterForTarget(registry, target);
        if (target.component === 'runtime' && target.hostId === 'launchdeck') {
          const observedDigest = digestOwnedDirectoryOrEmpty(target.path);
          evidence.push({
            targetId: target.targetId,
            kind: 'runtime-and-digest',
            buildIdentity: plan.buildIdentity,
            observedDigest,
            verified: observedDigest === target.desiredDigest
          });
          continue;
        }
        if (adapter?.id === 'codex' && target.component === 'mcp') {
          const skillTarget = (plan.targets ?? []).find((candidate) => (
            candidate.hostId === 'codex' && candidate.component === 'skill'
          ));
          const skillObservation = skillTarget && typeof adapter.inspectPlanned === 'function'
            ? await adapter.inspectPlanned(skillTarget, { plan })
            : null;
          const verification = await targetVerifier.verifyTarget(
            createCodexVerificationRequest({
              target,
              plan,
              effects,
              receiptCandidate,
              env,
              skillObservation
            })
          );
          evidence.push(verificationEvidenceFromRegistry({
            target,
            plan,
            verification
          }));
          continue;
        }
        if (adapter && typeof adapter.verify === 'function') {
          const verification = await adapter.verify(target, desiredBuildForVerification(target, plan), {
            effects,
            receiptCandidate,
            plan
          });
          evidence.push(verificationEvidenceFromRegistry({
            target,
            plan,
            verification
          }));
          continue;
        }
        const effect = effectsByTargetId.get(target.targetId);
        const verification = await targetVerifier.verifyTarget({
          target,
          expected: {
            buildIdentity: plan.buildIdentity,
            scope: plan.scope,
            scopeIdentity: plan.scopeIdentity,
            projectIdentity: plan.projectIdentity,
            desiredDigest: target.desiredDigest
          },
          observed: {
            ownedDigest: effect?.afterDigest ?? target.desiredDigest,
            hostApprovalObserved: true
          },
          receiptCandidate
        });
        evidence.push(verificationEvidenceFromRegistry({
          target,
          plan,
          verification
        }));
      }
      return evidence;
    }
  });
}

async function verifyUninstalledTargets({ plan, registry }) {
  const evidence = [];
  for (const target of plan.targets ?? []) {
    let observedDigest;
    if (target.component === 'runtime' && target.hostId === 'launchdeck') {
      observedDigest = digestOwnedDirectoryOrEmpty(target.path);
    } else {
      const adapter = adapterForTarget(registry, target);
      const observation = typeof adapter?.inspectPlanned === 'function'
        ? await adapter.inspectPlanned(target, { plan })
        : null;
      observedDigest = normalizeHostPlanObservation(target, observation).observedDigest;
    }
    evidence.push({
      targetId: target.targetId,
      kind: 'uninstall-digest',
      buildIdentity: plan.buildIdentity,
      observedDigest,
      verified: observedDigest === target.desiredDigest
    });
  }
  return evidence;
}

export function createCodexVerificationRequest({
  target,
  plan,
  effects = [],
  receiptCandidate,
  env = process.env,
  skillObservation = null
}) {
  const skillTarget = (plan.targets ?? []).find((candidate) => (
    candidate.hostId === 'codex' && candidate.component === 'skill'
  ));
  const runtimeTarget = (plan.targets ?? []).find((candidate) => (
    candidate.hostId === 'launchdeck' && candidate.component === 'runtime'
  ));
  const launcherFile = process.platform === 'win32' ? 'launchdeck-mcp.cmd' : 'launchdeck-mcp';
  const launcherPath = runtimeTarget ? path.join(runtimeTarget.path, launcherFile) : null;
  const launchdeckHome = runtimeTarget
    ? path.resolve(runtimeTarget.path, '..', '..', '..')
    : path.resolve(String(env.LAUNCHDECK_HOME ?? ''));
  const configDigest = digestFileOrEmpty(target.path);
  const skillDigest = skillObservation?.contentDigest
    ?? skillObservation?.observedDigest
    ?? (skillTarget ? digestOwnedDirectoryOrEmpty(skillTarget.path) : null);
  const runtimeDigest = runtimeTarget ? digestOwnedDirectoryOrEmpty(runtimeTarget.path) : null;
  const effect = effects.find((candidate) => candidate.targetId === target.targetId);

  return {
    target: {
      ...target,
      configPath: target.path,
      skillPath: skillTarget?.path,
      launcherPath,
      runtimePath: runtimeTarget?.path
    },
    expected: {
      buildIdentity: plan.buildIdentity,
      scope: plan.scope,
      scopeIdentity: plan.scopeIdentity,
      projectIdentity: plan.projectIdentity,
      desiredDigest: target.desiredDigest,
      configDigest: target.desiredDigest,
      skillDigest: skillTarget?.desiredDigest,
      runtimeDigest: runtimeTarget?.desiredDigest
    },
    observed: {
      skillDigest,
      configOwnership: configDigest === target.desiredDigest
        && effect?.afterDigest === target.desiredDigest
        ? 'verified'
        : 'unverified',
      configDigest,
      ownedDigest: configDigest,
      launcherResolved: typeof launcherPath === 'string' && fs.existsSync(launcherPath),
      launcherPath,
      runtimeDigest,
      runtimePath: runtimeTarget?.path,
      verificationCommand: process.platform === 'win32' ? process.execPath : launcherPath,
      verificationArgs: process.platform === 'win32' && runtimeTarget
        ? [path.join(runtimeTarget.path, 'launcher.js')]
        : [],
      env: {
        ...env,
        LAUNCHDECK_HOME: launchdeckHome,
        LAUNCHDECK_BUILD_ID: plan.buildIdentity
      },
      hostApprovalObserved: true,
      requiredHostActions: []
    },
    receiptCandidate
  };
}

function digestFileOrEmpty(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return EMPTY_CONTENT_DIGEST;
  const bytes = fs.readFileSync(filePath);
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

export function desiredBuildForVerification(target, plan) {
  const desired = { buildIdentity: plan.buildIdentity };
  return target.component === 'skill'
    ? {
        ...desired,
        skillDigest: target.desiredDigest,
        skill: {
          contentDigest: target.desiredDigest
        }
      }
    : desired;
}

async function revalidateApprovedPlan({ plan, locks, dependencies }) {
  const inspector = {
    async inspect(target) {
      if (target.component === 'runtime' && target.hostId === 'launchdeck') {
        return {
          ...target,
          observedDigest: digestOwnedDirectoryOrEmpty(target.path)
        };
      }
      const adapter = adapterForTarget(dependencies.registry, target);
      if (!adapter || typeof adapter.inspect !== 'function') {
        return {
          targetId: target.targetId,
          path: target.path,
          scope: target.scope,
          component: target.component,
          ownershipBoundary: target.ownershipBoundary,
          ownership: target.ownership,
          observedDigest: target.liveDigest,
          evidenceDigest: target.evidenceDigest
        };
      }
      const inspect = typeof adapter.inspectPlanned === 'function'
        ? adapter.inspectPlanned.bind(adapter)
        : adapter.inspect.bind(adapter);
      const observed = await inspect(target, { locks, plan });
      if (observed?.kind === 'refusal') return null;
      return normalizeHostPlanObservation(target, observed);
    }
  };
  return revalidatePlanPreconditions({ plan, inspector });
}

export function normalizeHostPlanObservation(target, observed = {}) {
  const observedDigest = observed.observedDigest
    ?? observed.liveDigest
    ?? observed.contentDigest
    ?? observed.documentDigest
    ?? observed.digest
    ?? (observed.status === 'absent' || observed.exists === false
      ? EMPTY_CONTENT_DIGEST
      : undefined);
  return {
    targetId: target.targetId,
    path: observed.path ?? target.path,
    scope: observed.scope ?? target.scope,
    component: observed.component ?? target.component,
    ownershipBoundary: observed.ownershipBoundary ?? target.ownershipBoundary,
    ownership: observed.ownership ?? target.ownership,
    observedDigest,
    evidenceDigest: observed.evidenceDigest ?? target.evidenceDigest
  };
}

function executableActionsForPlan(plan, dependencies) {
  return (plan.actions ?? []).map((action) => {
    if (typeof action.apply === 'function' && typeof action.rollback === 'function') {
      return action;
    }
    if (['install-stable-launcher', 'remove-stable-launcher'].includes(action.kind)) {
      return {
        ...action,
        apply: (transaction) => dependencies.runtimeProvisioner.apply(action, transaction),
        rollback: (transaction) => dependencies.runtimeProvisioner.rollback(action, transaction)
      };
    }
    if (action.kind === 'retain-owned-target') {
      return {
        ...action,
        apply: () => ({
          effectId: `effect-${action.actionId}`,
          actionId: action.actionId,
          targetId: action.targetId,
          ownershipBoundary: action.ownershipBoundary,
          effectType: action.kind,
          beforeDigest: action.preconditionDigest,
          afterDigest: action.desiredDigest,
          effectCertainty: 'complete'
        }),
        rollback: () => ({
          restored: true,
          restoredDigest: action.preconditionDigest,
          verified: true
        })
      };
    }
    const adapter = adapterForAction(dependencies.registry, action);
    return {
      ...action,
      apply: (transaction) => {
        if (!adapter || typeof adapter.apply !== 'function') {
          throw new AgentInstallerError(
            'agent_transaction_invalid',
            `No apply authority is registered for target '${action.targetId}'.`,
            { effectCertainty: 'none' }
          );
        }
        return adapter.apply(action, transaction, {
          artifactStore: dependencies.artifactStore,
          registry: dependencies.registry
        });
      },
      rollback: (transaction) => {
        if (!adapter || typeof adapter.rollback !== 'function') {
          throw new AgentInstallerError(
            'agent_transaction_invalid',
            `No rollback authority is registered for target '${action.targetId}'.`,
            { effectCertainty: 'unknown' }
          );
        }
        return adapter.rollback(
          transaction.effect,
          transaction.backupRef,
          transaction,
          {
          artifactStore: dependencies.artifactStore,
          registry: dependencies.registry
          }
        );
      }
    };
  });
}

function createRuntimeProvisioner({ env, artifactStore, backupStore }) {
  return Object.freeze({
    apply(action, transaction) {
      try {
        if (action.kind === 'remove-stable-launcher') {
          const currentDigest = digestOwnedDirectoryOrEmpty(action.targetPath);
          if (currentDigest !== action.preconditionDigest) {
            throw new AgentInstallerError(
              'agent_launcher_precondition_changed',
              'Stable launcher changed before owned removal.',
              { effectCertainty: 'none' }
            );
          }
          fs.rmSync(action.targetPath, { recursive: true, force: true });
        } else {
          ensureRuntimeArtifact({
            artifactStore,
            buildIdentity: transaction.plan.buildIdentity,
            operationId: transaction.operationId
          });
          installStableLauncher({
            env,
            buildIdentity: transaction.plan.buildIdentity
          });
        }
        const afterDigest = digestOwnedDirectoryOrEmpty(action.targetPath);
        if (afterDigest !== action.desiredDigest) {
          throw new AgentInstallerError(
            'agent_launcher_digest_mismatch',
            'Stable launcher installation did not produce the approved digest.',
            { effectCertainty: 'complete' }
          );
        }
        return {
          effectId: `effect-${action.actionId}`,
          actionId: action.actionId,
          targetId: action.targetId,
          ownershipBoundary: action.ownershipBoundary,
          effectType: action.kind,
          beforeDigest: action.preconditionDigest,
          afterDigest,
          effectCertainty: 'complete'
        };
      } catch (error) {
        try {
          restoreRuntimeTarget({
            action,
            backupRef: transaction.backupRef,
            backupStore
          });
        } catch (restoreError) {
          throw new AgentInstallerError(
            'agent_launcher_recovery_failed',
            'Stable launcher installation failed and its prior state could not be restored.',
            {
              effectCertainty: 'unknown',
              details: {
                sourceCode: error?.code ?? null,
                recoveryCode: restoreError?.code ?? null
              }
            }
          );
        }
        throw new AgentInstallerError(
          error?.code ?? 'agent_launcher_install_failed',
          error?.message ?? 'Stable launcher installation failed.',
          {
            effectCertainty: 'none',
            details: error?.details ?? {}
          }
        );
      }
    },
    rollback(action, transaction) {
      restoreRuntimeTarget({
        action,
        backupRef: transaction.backupRef,
        backupStore
      });
      const restoredDigest = digestOwnedDirectoryOrEmpty(action.targetPath);
      return {
        restored: restoredDigest === action.preconditionDigest,
        restoredDigest,
        verified: restoredDigest === action.preconditionDigest
      };
    }
  });
}

function ensureRuntimeArtifact({ artifactStore, buildIdentity, operationId }) {
  if (!artifactStore || typeof artifactStore.inspect !== 'function') {
    throw new AgentInstallerError(
      'agent_artifact_store_unavailable',
      'A verified artifact store is required for runtime provisioning.',
      { effectCertainty: 'none' }
    );
  }
  const observation = artifactStore.inspect(buildIdentity);
  if (observation.state === 'verified') return observation;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(PACKAGED_PAYLOAD_ROOT, 'manifest.json'), 'utf8')
  );
  if (manifest.buildIdentity !== buildIdentity) {
    throw new AgentInstallerError(
      'agent_runtime_payload_unavailable',
      'The packaged runtime does not match the approved build.',
      { effectCertainty: 'none' }
    );
  }
  return artifactStore.install({
    operationId,
    payloadRoot: PACKAGED_PAYLOAD_ROOT,
    manifest
  });
}

function restoreRuntimeTarget({ action, backupRef, backupStore }) {
  if (backupRef?.backupId) {
    const currentDigest = digestOwnedDirectoryOrEmpty(action.targetPath);
    backupStore.restore(backupRef.backupId, {
      targetId: action.targetId,
      targetPath: action.targetPath,
      expectedCurrentDigest: currentDigest
    });
    return;
  }
  fs.rmSync(action.targetPath, { recursive: true, force: true });
}

function normalizeInstallerEnv(value) {
  const env = { ...(value ?? {}) };
  if (!String(env.LAUNCHDECK_HOME ?? '').trim()) {
    env.LAUNCHDECK_HOME = path.join(os.homedir(), '.launchdeck');
  }
  return env;
}

function digestOwnedDirectoryOrEmpty(root) {
  if (!fs.existsSync(root)) return EMPTY_DIGEST;
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new AgentInstallerError(
      'agent_runtime_target_invalid',
      'Stable launcher target is not a regular directory.',
      { effectCertainty: 'none' }
    );
  }
  const files = [];
  collectOwnedFiles(root, '', files);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return digestCanonical({
    schemaVersion: 1,
    skillName: path.basename(root),
    files
  });
}

function collectOwnedFiles(root, relativeDir, files) {
  const directory = path.join(root, relativeDir);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new AgentInstallerError(
        'agent_runtime_target_invalid',
        'Stable launcher target contains a symbolic link.',
        { effectCertainty: 'none' }
      );
    }
    if (entry.isDirectory()) {
      collectOwnedFiles(root, relativePath, files);
    } else if (entry.isFile()) {
      const bytes = fs.readFileSync(absolutePath);
      files.push({
        path: relativePath.replaceAll('\\', '/'),
        bytes: bytes.length,
        sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
      });
    } else {
      throw new AgentInstallerError(
        'agent_runtime_target_invalid',
        'Stable launcher target contains an unsupported entry.',
        { effectCertainty: 'none' }
      );
    }
  }
}

function normalizeSetupInput(input) {
  return {
    operation: 'setup',
    sourceIdentity: 'packaged',
    ...input,
    desiredBuildIdentity: input.build ?? input.desiredBuildIdentity ?? input.packagedBuildIdentity,
    packagedBuildIdentity: packagedBuildIdentityFromInput(input),
    dryRun: input.dryRun === true,
    json: input.json === true,
    yes: input.yes === true
  };
}

function normalizeEntrypointSetupInput(request) {
  const args = request.args && typeof request.args === 'object' ? request.args : {};
  return normalizeSetupInput({
    ...args,
    operation: 'setup',
    entrypoint: request.entrypoint,
    command: request.command,
    npmYes: args.npmYes === true,
    sourceIdentity: args.sourceIdentity ?? 'packaged',
    desiredBuildIdentity: args.build ?? args.desiredBuildIdentity ?? args.packagedBuildIdentity,
    packagedBuildIdentity: packagedBuildIdentityFromInput(args),
    projectRoot: args.projectRoot ?? args.project
  });
}

function normalizeLifecycleInput(operation, input) {
  return {
    operation,
    sourceIdentity: input.sourceIdentity ?? 'packaged',
    ...input,
    operation,
    desiredBuildIdentity: input.desiredBuildIdentity ?? input.build ?? input.packagedBuildIdentity,
    packagedBuildIdentity: packagedBuildIdentityFromInput(input),
    previousBuildPins: Array.isArray(input.previousBuildPins) ? input.previousBuildPins : [],
    dryRun: input.dryRun === true,
    force: input.force === true,
    json: input.json === true,
    yes: input.yes === true
  };
}

function packagedBuildIdentityFromInput(input) {
  return input.packagedBuildIdentity
    ?? input.resolvedBuildIdentity
    ?? input.invokingBuildIdentity;
}

function digestLifecycleInput(input) {
  return digestCanonical({
    operation: input.operation,
    scope: input.scope ?? 'project',
    scopeIdentity: input.scopeIdentity ?? null,
    projectIdentity: input.projectIdentity ?? input.projectRoot ?? null,
    desiredBuildIdentity: input.desiredBuildIdentity ?? null,
    previousBuildPins: input.previousBuildPins ?? [],
    targetIds: (input.targets ?? []).map((target) => target.targetId),
    dryRun: input.dryRun === true,
    force: input.force === true,
    yes: input.yes === true
  });
}

function planFromResult(result, input = {}) {
  if (!result || typeof result !== 'object') return null;
  if (result.plan && typeof result.plan === 'object') return result.plan;
  if (Array.isArray(result.actions) && Array.isArray(result.targets)) {
    return canonicalPlanFromPlannerResult(result, input);
  }
  return null;
}

function canonicalPlanFromPlannerResult(result, input) {
  if (result.planId) return result;
  const includeLauncher = result.includeLauncher ?? input.includeLauncher ?? false;
  const previousBuildPins = result.previousBuildPins ?? input.previousBuildPins ?? [];
  return {
    ...result,
    planId: createCanonicalTransactionPlanId({
      buildIdentity: result.buildIdentity,
      scope: result.scope,
      scopeIdentity: result.scopeIdentity,
      projectIdentity: result.projectIdentity,
      targetIds: result.targetIds ?? result.targets.map((target) => target.targetId),
      includeLauncher,
      previousBuildPins,
      targets: result.targets,
      actions: result.actions
    }),
    includeLauncher,
    previousBuildPins
  };
}

function mergeTransactionResult({ plan, transactionResult }) {
  return {
    scope: plan.scope,
    scopeIdentity: plan.scopeIdentity,
    projectIdentity: plan.projectIdentity ?? null,
    buildIdentity: plan.buildIdentity,
    planDigest: plan.planDigest,
    targets: plan.targets ?? [],
    health: [],
    nextActions: [],
    error: null,
    ...transactionResult,
    effects: transactionResult?.effects ?? [],
    receiptId: transactionResult?.receiptId ?? null
  };
}

async function revalidateLifecyclePlan({ operation, plan, locks, dependencies }) {
  if (operation === 'uninstall') {
    const diagnostics = await dependencies.diagnostics.observe({
      operation,
      scope: plan.scope,
      scopeIdentity: plan.scopeIdentity,
      projectIdentity: plan.projectIdentity
    });
    const observedTargets = Array.isArray(diagnostics?.targets) ? diagnostics.targets : [];
    const observedByTargetId = new Map(observedTargets.map((target) => [target.targetId, target]));
    for (const target of plan.targets ?? []) {
      const observed = observedByTargetId.get(target.targetId);
      const action = (plan.actions ?? []).find((candidate) => candidate.targetId === target.targetId);
      const expectedDigest = action?.preconditionDigest ?? target.liveDigest;
      if (
        observed
        && expectedDigest
        && observed.liveDigest
        && observed.liveDigest !== expectedDigest
      ) {
        return {
          valid: false,
          planDigest: plan.planDigest,
          effectCertainty: 'none',
          effects: [],
          code: 'agent_plan_precondition_changed',
          targetId: target.targetId,
          reason: 'target-drifted-before-uninstall'
        };
      }
    }
    return {
      valid: true,
      planDigest: plan.planDigest,
      effectCertainty: 'none',
      effects: [],
      locks
    };
  }
  return revalidateApprovedPlan({ plan, locks, dependencies });
}

function normalizeResultFallbacks({ operation, result, input = {}, plan = null }) {
  return {
    scope: plan?.scope ?? input.scope ?? result?.scope ?? 'project',
    projectIdentity: plan?.projectIdentity ?? result?.projectIdentity ?? input.projectIdentity ?? input.projectRoot ?? null,
    buildIdentity: result?.buildIdentity ?? plan?.buildIdentity ?? input.buildIdentity ?? input.desiredBuildIdentity ?? input.build ?? null,
    operationId: result?.operationId ?? null,
    planDigest: result?.planDigest ?? plan?.planDigest ?? input.planDigest ?? null,
    receiptId: result?.receiptId ?? null,
    targets: result?.targets ?? plan?.targets ?? [],
    health: result?.health ?? [],
    effects: result?.effects ?? [],
    nextActions: result?.nextActions ?? [],
    error: result?.error ?? null,
    ...result,
    outcome: result?.outcome ?? 'refused',
    effectCertainty: result?.effectCertainty ?? (result?.outcome === 'noop' ? 'none' : 'none')
  };
}

function lifecycleRefusal({ input = {}, receipt = null, code, message }) {
  return {
    outcome: 'refused',
    effectCertainty: 'none',
    scope: input.scope ?? receipt?.scope ?? 'project',
    projectIdentity: input.scope === 'user'
      ? null
      : (input.projectIdentity ?? input.projectRoot ?? receipt?.projectIdentity ?? null),
    buildIdentity: receipt?.buildIdentity ?? input.buildIdentity ?? input.desiredBuildIdentity ?? input.build ?? null,
    operationId: null,
    planDigest: null,
    receiptId: null,
    targets: [],
    health: [],
    effects: [],
    nextActions: [],
    error: toInstallerErrorPayload(new AgentInstallerError(code, message, {
      effectCertainty: 'none'
    }))
  };
}

function lifecycleNoop({ input = {}, receipt = null, targets = [] }) {
  return {
    outcome: 'noop',
    effectCertainty: 'none',
    scope: input.scope ?? receipt?.scope ?? 'project',
    projectIdentity: input.scope === 'user'
      ? null
      : (input.projectIdentity ?? input.projectRoot ?? receipt?.projectIdentity ?? null),
    buildIdentity: receipt?.buildIdentity ?? input.buildIdentity ?? input.desiredBuildIdentity ?? input.build,
    operationId: null,
    planDigest: receipt?.receiptDigest ?? input.planDigest ?? digestCanonical({
      operation: input.operation,
      targets: targets.map((target) => target.targetId)
    }),
    receiptId: null,
    targets,
    health: [],
    effects: [],
    nextActions: [],
    error: null
  };
}

async function readCurrentReceiptForInput(dependencies, input) {
  if (typeof dependencies.receiptStore?.readCurrent !== 'function') return null;
  try {
    return await dependencies.receiptStore.readCurrent(
      resolveInstallationScopeReference(input, dependencies.env)
    );
  } catch {
    return null;
  }
}

function repairTargets({ receipt, diagnostics, force }) {
  const ownedTargets = ownedTargetsFromReceipt(receipt);
  const observedByTargetId = new Map(
    (diagnostics?.targets ?? []).map((target) => [target.targetId, target])
  );
  const items = [];
  for (const owned of ownedTargets) {
    const observed = observedByTargetId.get(owned.targetId) ?? owned;
    const state = observed.state ?? classifyObservedTarget(owned, observed);
    if (['missing', 'corrupt'].includes(state)) {
      items.push({ ...owned, ...observed, ownership: 'launchdeck' });
    } else if (state === 'divergent' && force !== true) {
      return { refusal: true, items: [] };
    } else if (state === 'divergent' && force === true && observed.ownership === 'launchdeck') {
      items.push({ ...owned, ...observed, ownership: 'launchdeck' });
    }
  }
  return { refusal: false, items };
}

function uninstallTargets({ receipt, diagnostics, force }) {
  const ownedTargets = ownedTargetsFromReceipt(receipt);
  const observedByTargetId = new Map(
    (diagnostics?.targets ?? []).map((target) => [target.targetId, target])
  );
  return ownedTargets.filter((owned) => {
    const observed = observedByTargetId.get(owned.targetId) ?? owned;
    if (observed.ownership && observed.ownership !== 'launchdeck') return false;
    const state = observed.state ?? classifyObservedTarget(owned, observed);
    if (['missing', 'absent'].includes(state)) return false;
    if (state === 'divergent') return force === true && observed.ownership === 'launchdeck';
    return true;
  }).map((owned) => ({ ...owned, ...(observedByTargetId.get(owned.targetId) ?? {}) }));
}

function ownedTargetsFromReceipt(receipt) {
  return (receipt?.targets ?? []).filter((target) =>
    target?.ownership === 'launchdeck'
    || target?.ownership === undefined
  );
}

function classifyObservedTarget(owned, observed) {
  if (observed.exists === false || observed.state === 'missing') return 'missing';
  const observedDigest = observed.observedDigest ?? observed.liveDigest;
  if (observedDigest && owned.desiredDigest && observedDigest !== owned.desiredDigest) {
    return 'divergent';
  }
  return 'healthy';
}

function parseLifecycleTargetId(targetId) {
  const match = /^([^:]+):(project|user):([^:]+)$/.exec(String(targetId ?? ''));
  return match
    ? { hostId: match[1], scope: match[2], component: match[3] }
    : null;
}

function publicReconciliationPathIsCanonical(value) {
  return isCanonicalPublicReconciliationPath(value);
}

function createReceiptCandidate({ plan, receiptId, clock }) {
  return {
    receiptId,
    scope: plan.scope,
    scopeIdentity: plan.scopeIdentity,
    projectIdentity: plan.projectIdentity ?? null,
    buildIdentity: plan.buildIdentity,
    targets: (plan.targets ?? []).map((target) => ({
      targetId: target.targetId,
      ownershipBoundary: target.ownershipBoundary,
      desiredDigest: target.desiredDigest
    })),
    ownedDigests: (plan.actions ?? []).map((action) => action.desiredDigest),
    verificationEvidence: [],
    committedAt: nowIso(clock),
    supersedesReceiptId: plan.supersedesReceiptId ?? null
  };
}

function cancelledResult({ plan, approval }) {
  return {
    outcome: 'cancelled',
    effectCertainty: 'none',
    scope: plan.scope,
    scopeIdentity: plan.scopeIdentity,
    projectIdentity: plan.projectIdentity ?? null,
    buildIdentity: plan.buildIdentity,
    operationId: null,
    planDigest: plan.planDigest,
    receiptId: null,
    targets: plan.targets ?? [],
    health: [],
    effects: [],
    nextActions: [],
    error: approval?.error ?? null
  };
}

function refusalForPlan({ plan, code, message }) {
  return {
    outcome: 'refused',
    effectCertainty: 'none',
    scope: plan.scope,
    scopeIdentity: plan.scopeIdentity,
    projectIdentity: plan.projectIdentity ?? null,
    buildIdentity: plan.buildIdentity,
    operationId: null,
    planDigest: plan.planDigest,
    receiptId: null,
    targets: [],
    health: [],
    effects: [],
    nextActions: [],
    error: toInstallerErrorPayload(new AgentInstallerError(code, message, {
      effectCertainty: 'none'
    }))
  };
}

function refusalForPlanResult(result, { code, message }) {
  const error = toInstallerErrorPayload(new AgentInstallerError(code, message, {
    effectCertainty: 'none'
  }));
  return {
    outcome: 'refused',
    effectCertainty: 'none',
    scope: result?.scope ?? 'project',
    projectIdentity: result?.projectIdentity ?? null,
    buildIdentity: result?.buildIdentity,
    operationId: null,
    planDigest: result?.planDigest,
    receiptId: null,
    targets: [],
    health: [],
    effects: [],
    nextActions: [],
    error
  };
}

function verificationEvidenceFromRegistry({ target, plan, verification }) {
  const diagnosticChecks = Array.isArray(verification?.checks)
    ? verification.checks
        .filter((check) => check?.status !== 'pass')
        .map((check) => check?.code)
        .filter((code) => typeof code === 'string')
    : [];
  return {
    targetId: target.targetId,
    kind: 'runtime-and-digest',
    buildIdentity: verification?.buildIdentity ?? plan.buildIdentity,
    observedDigest: verification?.observedDigest ?? verification?.digest ?? target.desiredDigest,
    verified: verification?.ready === true
      || verification?.verified === true
      || verification?.status === 'ready'
      || verification?.state === 'verified',
    ...(typeof verification?.code === 'string'
      ? { diagnosticCode: verification.code }
      : {}),
    ...(diagnosticChecks.length > 0
      ? { diagnosticChecks }
      : {})
  };
}

function envelope(result) {
  return createInstallerExecutionEnvelope(COMMAND, result);
}

function setupEnvelope(dependencies, result, input, plan) {
  return envelope(withInstallerEntrypoints(dependencies, result, input, plan));
}

function withInstallerEntrypoints(dependencies, result, input = {}, plan = null) {
  const scope = result?.scope ?? plan?.scope ?? input.scope ?? 'project';
  const resultOwnsBuildIdentity = Object.hasOwn(result ?? {}, 'buildIdentity');
  const buildIdentity = resultOwnsBuildIdentity
    ? (/^sha256:[0-9a-f]{64}$/.test(String(result.buildIdentity ?? '')) ? result.buildIdentity : null)
    : ([
        plan?.buildIdentity,
        input.buildIdentity,
        input.desiredBuildIdentity,
        input.build
      ].find((candidate) => /^sha256:[0-9a-f]{64}$/.test(String(candidate ?? ''))) ?? null);
  return {
    ...result,
    entrypoints: dependencies.resolveEntrypoints({
      scope,
      buildIdentity,
      projectRoot: input.projectRoot ?? input.projectIdentity ?? null
    })
  };
}

function envelopeFor(operation, result) {
  return createInstallerExecutionEnvelope(COMMAND_BY_OPERATION[operation] ?? `agent ${operation}`, result);
}

function adapterForAction(registry, action) {
  return adapterForHostId(registry, String(action?.targetId ?? '').split(':')[0]);
}

function adapterForTarget(registry, target) {
  return adapterForHostId(registry, target?.hostId ?? String(target?.targetId ?? '').split(':')[0]);
}

function adapterForHostId(registry, hostId) {
  if (!hostId) return null;
  if (typeof registry?.adapterFor === 'function') return registry.adapterFor(hostId);
  if (typeof registry?.get === 'function') return registry.get(hostId);
  return null;
}

function containsProjectConfigAuthorship(plan) {
  return (plan.actions ?? []).some((action) => {
    const targetPath = String(action?.targetPath ?? '').replaceAll('\\', '/');
    return targetPath === '.launchdeck.yml' || targetPath.endsWith('/.launchdeck.yml');
  });
}

function nextOperationId(operationIds) {
  return String(operationIds?.next?.() ?? createOperationId());
}

function createOperationId() {
  return `op_${crypto.randomBytes(16).toString('hex')}`;
}

function receiptIdForOperation(operationId) {
  if (operationId.startsWith('op_')) return `receipt_${operationId.slice(3)}`;
  return `receipt_${digestCanonical(operationId).slice('sha256:'.length, 'sha256:'.length + 32)}`;
}

function nowIso(clock) {
  const value = typeof clock === 'function' ? clock() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function safeCreateArtifactStore({ env }) {
  try {
    return createArtifactStore({ env });
  } catch {
    return null;
  }
}

export function isAgentLifecycleFailureOutcome(outcome) {
  return FAILURE_OUTCOMES.has(outcome);
}
