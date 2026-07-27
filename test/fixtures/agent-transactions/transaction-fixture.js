import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBackupStore } from '../../../src/agent/state/backup-store.js';
import { digestCanonical } from '../../../src/agent/digests.js';
import { createReceiptStore } from '../../../src/agent/state/receipt-store.js';
import { resolveInstallationScope } from '../../../src/agent/state/scope-resolver.js';
import { createOperationJournal } from '../../../src/control-plane/operation-journal.js';

export const BUILD_IDENTITY = `sha256:${'b'.repeat(64)}`;
export const PREVIOUS_BUILD_IDENTITY = `sha256:${'a'.repeat(64)}`;
export const INPUT_DIGEST = `sha256:${'d'.repeat(64)}`;

const FIXTURE_TIME = '2026-07-23T12:00:00.000Z';

export function createAgentTransactionFixture(testContext, label, options = {}) {
  const root = fs.mkdtempSync(path.join(
    os.tmpdir(),
    `launchdeck-agent-transaction-${safeToken(label)}-`
  ));
  const launchdeckHome = path.join(root, 'launchdeck-home');
  const projectRoot = path.join(root, 'project');
  const userRoot = path.join(root, 'user');
  fs.mkdirSync(launchdeckHome, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(userRoot, { recursive: true });

  const env = Object.freeze({
    LAUNCHDECK_HOME: launchdeckHome,
    HOME: userRoot,
    USERPROFILE: userRoot,
    LOCALAPPDATA: path.join(userRoot, 'AppData', 'Local'),
    XDG_STATE_HOME: path.join(userRoot, '.local', 'state')
  });
  const clock = options.clock ?? (() => new Date(FIXTURE_TIME));
  const journal = createOperationJournal({ env, clock });
  const receiptStore = createReceiptStore({ env, clock });
  const backupStore = createBackupStore({ env, clock });
  const scope = resolveInstallationScope({
    scope: 'project',
    projectRoot,
    env
  });
  const trace = [];
  const counters = {
    apply: 0,
    rollback: 0,
    verify: 0,
    receiptCommit: 0,
    reconcileObserve: 0
  };

  let cleaned = false;
  testContext.after(() => {
    if (cleaned) return;
    cleaned = true;
    fs.rmSync(root, { recursive: true, force: true });
  });

  return Object.freeze({
    root,
    launchdeckHome,
    projectRoot,
    userRoot,
    env,
    clock,
    journal,
    receiptStore,
    backupStore,
    scope,
    trace,
    counters,
    transactionRequest(overrides = {}) {
      const operationId = overrides.operationId ?? 'op_transaction000000000001';
      const actions = overrides.actions ?? [
        fileMutationAction({
          fixture: { projectRoot, backupStore, trace, counters },
          actionId: 'action-codex-skill',
          targetId: 'codex:project:skill',
          relativePath: '.codex/skills/launchdeck-agent/SKILL.md',
          original: '# Previous Skill\n',
          desired: '# Launchdeck Agent\n'
        })
      ];
      const receiptCandidate = overrides.receiptCandidate
        ?? receiptCandidateFor(scope, actions, operationId);
      const planShape = {
        planId: overrides.planId ?? 'plan_transaction_00000001',
        buildIdentity: overrides.buildIdentity ?? BUILD_IDENTITY,
        scope: scope.scope,
        scopeIdentity: scope.scopeIdentity,
        projectIdentity: scope.projectIdentity,
        targetIds: actions.map((action) => action.targetId).sort(),
        includeLauncher: overrides.includeLauncher ?? false,
        previousBuildPins: overrides.previousBuildPins ?? [PREVIOUS_BUILD_IDENTITY],
        targets: actions.map(targetDescription),
        actions: actions.map(actionDescription)
      };
      const planDigest = overrides.planDigest ?? digestCanonical(planDigestShape(planShape));
      const plan = {
        ...planShape,
        planDigest
      };
      const planBindingDigest = digestCanonical(planBindingShape(plan));
      const approval = overrides.approval ?? {
        approved: true,
        planDigest,
        planBindingDigest
      };

      return {
        operationId,
        operation: overrides.operation ?? 'setup',
        inputDigest: overrides.inputDigest ?? INPUT_DIGEST,
        plan,
        approval,
        actions,
        revalidatePlan: overrides.revalidatePlan ?? (async () => ({
          valid: true,
          planDigest
        })),
        verify: overrides.verify ?? (async () => {
          counters.verify += 1;
          trace.push('verify:runtime');
          return actions.map((action) => ({
            targetId: action.targetId,
            kind: 'runtime-and-digest',
            buildIdentity: BUILD_IDENTITY,
            observedDigest: digestFile(action.targetPath),
            verified: true
          }));
        }),
        receiptCandidate
      };
    },
    fileMutationAction(input = {}) {
      return fileMutationAction({
        fixture: { projectRoot, backupStore, trace, counters },
        ...input
      });
    },
    receiptCandidate(actions, operationId = 'op_transaction000000000001') {
      return receiptCandidateFor(scope, actions, operationId);
    },
    readJournal(operationId) {
      return journal.get(operationId);
    },
    journalRecordExists(operationId) {
      return fs.existsSync(journal.paths.recordPath(operationId));
    }
  });
}

export function fileMutationAction(input) {
  const fixture = input.fixture;
  const actionId = input.actionId ?? 'action-managed-target';
  const targetId = input.targetId ?? 'codex:project:mcp';
  const ownershipBoundary = input.ownershipBoundary ?? 'mcpServers.launchdeck';
  const targetPath = path.join(
    fixture.projectRoot,
    input.relativePath ?? '.codex/mcp.json'
  );
  const original = input.original ?? '{"mcpServers":{}}\n';
  const desired = input.desired ?? '{"mcpServers":{"launchdeck":{"command":"launchdeck"}}}\n';
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, original, 'utf8');
  const preconditionDigest = digestText(original);
  const desiredDigest = digestText(desired);

  return Object.freeze({
    actionId,
    kind: input.kind ?? 'replace-managed-boundary',
    targetId,
    ownershipBoundary,
    targetPath,
    preconditionDigest,
    desiredDigest,
    requiresBackup: input.requiresBackup ?? true,
    async apply(context) {
      fixture.counters.apply += 1;
      fixture.trace.push(`apply:${actionId}`);
      if (input.apply) return input.apply(context, {
        targetPath,
        original,
        desired,
        preconditionDigest,
        desiredDigest
      });
      fs.writeFileSync(targetPath, desired, 'utf8');
      if (input.applyError) throw input.applyError;
      return Object.freeze({
        effectId: `effect-${actionId}`,
        actionId,
        targetId,
        ownershipBoundary,
        effectType: 'replace',
        effectCertainty: 'complete',
        beforeDigest: preconditionDigest,
        afterDigest: desiredDigest
      });
    },
    async rollback(context) {
      fixture.counters.rollback += 1;
      fixture.trace.push(`rollback:${actionId}`);
      if (input.rollback) return input.rollback(context, {
        targetPath,
        original,
        desired,
        preconditionDigest,
        desiredDigest
      });
      const restored = fixture.backupStore.restore(context.backupRef.backupId, {
        targetId,
        targetPath,
        expectedCurrentDigest: digestFile(targetPath)
      });
      return Object.freeze({
        actionId,
        targetId,
        restored: restored.restored,
        restoredDigest: restored.restoredDigest,
        verified: digestFile(targetPath) === preconditionDigest
      });
    }
  });
}

export function receiptCandidateFor(scope, actions, operationId) {
  return {
    receiptId: `receipt_${safeToken(operationId).slice(0, 64)}`,
    scope: scope.scope,
    scopeIdentity: scope.scopeIdentity,
    projectIdentity: scope.projectIdentity,
    buildIdentity: BUILD_IDENTITY,
    targets: actions.map((action) => ({
      targetId: action.targetId,
      ownershipBoundary: action.ownershipBoundary,
      desiredDigest: action.desiredDigest
    })),
    ownedDigests: actions.map((action) => action.desiredDigest),
    verificationEvidence: [],
    committedAt: FIXTURE_TIME,
    supersedesReceiptId: null
  };
}

export function digestText(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function digestFile(filePath) {
  return digestText(fs.readFileSync(filePath));
}

export function fatalFault(point) {
  return Object.assign(new Error(`simulated fatal fault at ${point}`), {
    code: 'agent_simulated_process_crash',
    fatal: true,
    faultPoint: point
  });
}

export function actionDescription(action) {
  return {
    actionId: action.actionId,
    kind: action.kind,
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    targetPath: action.targetPath,
    preconditionDigest: action.preconditionDigest,
    desiredDigest: action.desiredDigest,
    requiresBackup: action.requiresBackup
  };
}

function targetDescription(action) {
  const [hostId, scope, component] = action.targetId.split(':');
  const target = {
    targetId: action.targetId,
    hostId,
    scope,
    component,
    path: action.targetPath,
    ownershipBoundary: action.ownershipBoundary,
    ownership: 'launchdeck',
    liveDigest: action.preconditionDigest,
    desiredDigest: action.desiredDigest
  };
  return {
    ...target,
    evidenceDigest: digestCanonical(target)
  };
}

function safeToken(value) {
  return String(value).replace(/[^A-Za-z0-9_-]/g, '-');
}

function planDigestShape(plan) {
  return {
    planId: plan.planId,
    buildIdentity: plan.buildIdentity,
    scope: plan.scope,
    scopeIdentity: plan.scopeIdentity,
    projectIdentity: plan.projectIdentity,
    targetIds: plan.targetIds,
    includeLauncher: plan.includeLauncher,
    previousBuildPins: plan.previousBuildPins,
    targets: plan.targets,
    actions: plan.actions
  };
}

function planBindingShape(plan) {
  return {
    planId: plan.planId,
    planDigest: plan.planDigest,
    buildIdentity: plan.buildIdentity,
    scope: plan.scope,
    scopeIdentity: plan.scopeIdentity,
    projectIdentity: plan.projectIdentity,
    targetIds: plan.targetIds,
    includeLauncher: plan.includeLauncher,
    previousBuildPins: plan.previousBuildPins,
    targets: plan.targets,
    actions: plan.actions
  };
}
