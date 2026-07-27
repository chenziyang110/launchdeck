import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AgentInstallerError } from '../../../src/agent/errors.js';
import { createAgentLifecycleService } from '../../../src/agent/lifecycle-service.js';
import { artifactPathForBuild } from '../../../src/agent/artifacts/store.js';
import { collectArtifactGarbage } from '../../../src/agent/artifacts/gc.js';
import { createReceiptStore } from '../../../src/agent/state/receipt-store.js';
import { resolveInstallationScope } from '../../../src/agent/state/scope-resolver.js';
import {
  createCanonicalTransactionPlan,
  createCanonicalTransactionPlanId
} from '../../../src/agent/state/transaction-plan.js';
import { createInstallationVerifier } from '../../../src/agent/verification/index.js';
import { operationJournalPaths } from '../../../src/control-plane/operation-journal.js';

export const CURRENT_BUILD = `sha256:${'1'.repeat(64)}`;
export const NEXT_BUILD = `sha256:${'2'.repeat(64)}`;
export const RECOVERY_BUILD = `sha256:${'3'.repeat(64)}`;

const fixturePrefix = 'launchdeck-agent-managed-lifecycle-';
const planBuilds = Object.freeze([CURRENT_BUILD, NEXT_BUILD, RECOVERY_BUILD]);
const clockInstant = '2026-07-23T12:00:00.000Z';
const staleArtifactDate = '2026-05-01T00:00:00.000Z';
const missingDigest = digestText('missing');

export function createManagedLifecycleFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), fixturePrefix));
  const projectRootPath = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  fs.mkdirSync(projectRootPath, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  const projectRoot = fs.realpathSync.native(projectRootPath);

  const env = { LAUNCHDECK_HOME: homeDir };
  const clock = () => new Date(clockInstant);
  const scopeRef = resolveInstallationScope({ scope: 'project', projectRoot });
  const receiptStore = createReceiptStore({ env, clock });
  const targets = createTargets({ projectRoot });
  const state = {
    calls: [],
    env,
    homeDir,
    projectRoot,
    receiptStore,
    scopeRef,
    targets,
    updateFailure: options.updateFailure === true
  };

  seedTargetFiles(state, CURRENT_BUILD);
  writeForeignTarget(state);
  seedArtifacts(state);
  seedReceipt(state, CURRENT_BUILD, 'receipt_seedcurrent1111111111111111111111');

  const service = createAgentLifecycleService({
    env,
    clock,
    registry: { adapterFor: () => null },
    receiptStore,
    diagnostics: createFilesystemDiagnostics(state),
    lifecyclePlanner: createFilesystemLifecyclePlanner(state),
    verifier: createFilesystemVerifier(state),
    garbageCollector: createProductionGcObserver(state),
    operationIds: createOperationIds(state)
  });

  return {
    root,
    projectRoot,
    homeDir,
    service,
    state,
    cleanup() {
      removeFixtureRoot(root);
    },
    snapshot() {
      return stableSnapshot(state);
    },
    target(id) {
      return observeTarget(state, targetById(state, id));
    },
    writeTarget(id, content) {
      writeTargetContent(targetById(state, id), content);
    },
    removeTarget(id) {
      fs.rmSync(targetById(state, id).path, { force: true });
    },
    receipt() {
      return currentReceipt(state);
    },
    artifact(identity) {
      return artifactState(state, identity);
    },
    commandInput(overrides = {}) {
      return {
        scope: 'project',
        scopeIdentity: scopeRef.scopeIdentity,
        projectRoot,
        projectIdentity: projectRoot,
        json: true,
        yes: true,
        ...overrides
      };
    }
  };
}

function createFilesystemDiagnostics(state) {
  return {
    async observe(input = {}) {
      state.calls.push({ type: 'diagnostics:observe', operation: input.operation });
      const receipt = currentReceipt(state);
      const managedTargets = targetsFromReceipt(state, receipt);
      const targets = [
        ...managedTargets.map((target) => observeTarget(state, target)),
        observeTarget(state, state.targets.foreign)
      ];
      const health = targets
        .filter((target) => ['missing', 'corrupt', 'drifted', 'divergent'].includes(target.state))
        .map((target) => ({
          targetId: target.targetId,
          state: target.state,
          severity: target.state === 'divergent' ? 'error' : 'warn'
        }));
      const doctorHasError = input.operation === 'doctor'
        && health.some((entry) => entry.severity === 'error');
      return {
        outcome: doctorHasError ? 'refused' : 'succeeded',
        effectCertainty: doctorHasError ? 'none' : 'complete',
        scope: state.scopeRef.scope,
        scopeIdentity: state.scopeRef.scopeIdentity,
        projectIdentity: state.scopeRef.projectIdentity,
        buildIdentity: receipt?.buildIdentity ?? null,
        operationId: null,
        planDigest: digestText(`diagnostics:${input.operation}:${receipt?.receiptDigest ?? 'none'}`),
        receiptId: doctorHasError ? null : (receipt?.receiptId ?? null),
        targets,
        health,
        effects: [],
        nextActions: health.length > 0 ? [{ command: 'launchdeck agent repair --yes' }] : [],
        error: doctorHasError
          ? { code: 'agent_health_check_failed', message: 'Doctor found unhealthy targets.', details: {} }
          : null
      };
    }
  };
}

function createFilesystemLifecyclePlanner(state) {
  return {
    async planMutation(input = {}) {
      const receipt = currentReceipt(state);
      const planTargets = (input.targets ?? targetsFromReceipt(state, receipt))
        .map((target) => targetById(state, target.targetId))
        .map((target) => planTargetFor(state, target, input));
      const actions = planTargets.map((target, index) =>
        actionFor(state, target, input, index)
      );
      const basePlan = {
        buildIdentity: input.operation === 'update'
          ? (input.desiredBuildIdentity ?? input.build ?? NEXT_BUILD)
          : (receipt?.buildIdentity ?? CURRENT_BUILD),
        scope: state.scopeRef.scope,
        scopeIdentity: state.scopeRef.scopeIdentity,
        projectIdentity: state.scopeRef.projectIdentity,
        includeLauncher: false,
        previousBuildPins: input.previousBuildPins ?? [],
        targets: planTargets,
        actions
      };
      const canonical = createCanonicalTransactionPlan({
        ...basePlan,
        planId: createCanonicalTransactionPlanId({
          ...basePlan,
          targetIds: actions.map((action) => action.targetId)
        })
      });
      const plan = {
        ...canonical,
        actions
      };
      state.calls.push({
        type: 'planner:planMutation',
        operation: input.operation,
        targetIds: canonical.targetIds,
        previousBuildPins: canonical.previousBuildPins
      });
      return plan;
    }
  };
}

function createProductionGcObserver(state) {
  return {
    async observe(input = {}) {
      state.calls.push({ type: 'gc:observe', dryRun: input.dryRun === true });
      const result = await collectArtifactGarbage({
        env: state.env,
        now: new Date(clockInstant),
        gracePeriodMs: 0,
        dryRun: input.dryRun !== false,
        maxDeletes: 10,
        listBuilds: () => listArtifactBuilds(state),
        listReferenceRecords: () => listArtifactReferences(state)
      });
      return result.decisions.map((decision) => ({
        ...decision,
        deleted: result.deleted.some((entry) => entry.buildIdentity === decision.buildIdentity)
      }));
    }
  };
}

function createFilesystemVerifier(state) {
  const verifier = createInstallationVerifier({
    mcpHandshake: () => ({
      async request(method) {
        if (method === 'initialize') return { serverInfo: { name: 'fixture' }, capabilities: {} };
        return {
          structuredContent: {
            capabilities: { operations: ['capabilities.get'] },
            provenance: { buildIdentity: state.currentVerificationBuildIdentity }
          }
        };
      },
      async close() {}
    })
  });
  const launcherPath = path.join(state.homeDir, 'installer', 'launcher', 'v1', 'launchdeck-agent.js');
  fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
  fs.writeFileSync(launcherPath, 'fixture launcher', 'utf8');
  return {
    async verifyInstallation({ plan, effects, receiptCandidate }) {
      state.currentVerificationBuildIdentity = plan.buildIdentity;
      const effectsByTargetId = new Map((effects ?? []).map((effect) => [effect.targetId, effect]));
      const evidence = [];
      for (const target of plan.targets ?? []) {
        const effect = effectsByTargetId.get(target.targetId);
        if (effect?.effectType === 'delete-owned-target') {
          evidence.push({
            targetId: target.targetId,
            kind: 'runtime-and-digest',
            buildIdentity: plan.buildIdentity,
            observedDigest: target.desiredDigest,
            verified: fs.existsSync(target.path) === false
          });
          continue;
        }
        const observedDigestValue = observedDigest(target.path);
        const verification = await verifier.verifyTarget({
          target: {
            ...target,
            skillPath: target.path,
            configPath: target.path,
            runtimePath: target.path,
            launcherPath
          },
          expected: {
            buildIdentity: plan.buildIdentity,
            scope: plan.scope,
            scopeIdentity: plan.scopeIdentity,
            projectIdentity: plan.projectIdentity,
            desiredDigest: target.desiredDigest,
            skillDigest: target.desiredDigest,
            configDigest: target.desiredDigest,
            runtimeDigest: target.desiredDigest
          },
          observed: {
            ownedDigest: observedDigestValue,
            skillDigest: observedDigestValue,
            configDigest: observedDigestValue,
            runtimeDigest: observedDigestValue,
            configOwnership: 'verified',
            launcherPath,
            launcherResolved: true,
            hostApprovalObserved: true
          },
          receiptCandidate
        });
        evidence.push({
          targetId: target.targetId,
          kind: 'runtime-and-digest',
          buildIdentity: verification.buildIdentity,
          observedDigest: target.desiredDigest,
          verified: verification.ready === true
        });
      }
      delete state.currentVerificationBuildIdentity;
      return evidence;
    }
  };
}

function createOperationIds(state) {
  let next = 1;
  return {
    next() {
      const operationId = `op_managed_lifecycle_${String(next).padStart(4, '0')}`;
      next += 1;
      state.calls.push({ type: 'operation-id:next', operationId });
      return operationId;
    }
  };
}

function actionFor(state, target, input, index) {
  const operation = input.operation;
  const buildIdentity = operation === 'update'
    ? (input.desiredBuildIdentity ?? input.build ?? NEXT_BUILD)
    : (currentReceipt(state)?.buildIdentity ?? CURRENT_BUILD);
  const desiredContent = operation === 'uninstall'
    ? null
    : `${target.component}:${buildIdentity}`;
  const beforeDigest = observedDigest(target.path);
  const desiredDigest = operation === 'uninstall'
    ? beforeDigest
    : digestText(desiredContent);
  const retainOwnedTarget = operation === 'repair' && beforeDigest === desiredDigest;
  const actionId = `action-${operation}-${target.targetId.replaceAll(':', '-')}`;
  return {
    actionId,
    kind: operation === 'uninstall'
      ? 'delete-owned-target'
      : retainOwnedTarget
        ? 'retain-owned-target'
        : `write-${target.component}`,
    targetId: target.targetId,
    ownershipBoundary: target.ownershipBoundary,
    targetPath: target.path,
    preconditionDigest: beforeDigest,
    desiredDigest,
    requiresBackup: fs.existsSync(target.path),
    async apply() {
      if (operation === 'update' && index === 0) {
        writeRecoveryPins(state, input.previousBuildPins ?? []);
      }
      if (operation === 'update' && state.updateFailure === true && index > 0) {
        throw new AgentInstallerError(
          'agent_update_verification_failed',
          'Injected update failure retained previous build.',
          { effectCertainty: 'none' }
        );
      }
      if (retainOwnedTarget) {
        // Healthy receipt-owned targets remain in the replacement receipt
        // without being rewritten during a repair.
      } else if (operation === 'uninstall') {
        fs.rmSync(target.path, { force: true });
      } else {
        writeTargetContent(target, desiredContent);
      }
      return {
        effectId: `effect-${operation}-${target.targetId.replaceAll(':', '-')}`,
        actionId,
        targetId: target.targetId,
        ownershipBoundary: target.ownershipBoundary,
        effectType: operation === 'uninstall'
          ? 'delete-owned-target'
          : retainOwnedTarget
            ? 'retain-owned-target'
            : `write-${target.component}`,
        beforeDigest,
        afterDigest: desiredDigest,
        effectCertainty: 'complete'
      };
    },
    async rollback(transaction = {}) {
      if (transaction.backupRef?.backupPath && fs.existsSync(transaction.backupRef.backupPath)) {
        fs.mkdirSync(path.dirname(target.path), { recursive: true });
        fs.copyFileSync(transaction.backupRef.backupPath, target.path);
      } else if (fs.existsSync(target.path)) {
        fs.rmSync(target.path, { force: true });
      }
      return {
        restored: true,
        restoredDigest: beforeDigest,
        verified: observedDigest(target.path) === beforeDigest
      };
    }
  };
}

function createTargets({ projectRoot }) {
  return {
    skill: {
      targetId: 'codex:project:skill',
      hostId: 'codex',
      component: 'skill',
      scope: 'project',
      path: path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent', 'SKILL.md'),
      ownership: 'launchdeck',
      ownershipBoundary: 'launchdeck:skill'
    },
    mcp: {
      targetId: 'codex:project:mcp',
      hostId: 'codex',
      component: 'mcp',
      scope: 'project',
      path: path.join(projectRoot, '.codex', 'config.toml'),
      ownership: 'launchdeck',
      ownershipBoundary: 'launchdeck:mcp'
    },
    foreign: {
      targetId: 'codex:project:foreign',
      hostId: 'codex',
      component: 'foreign',
      scope: 'project',
      path: path.join(projectRoot, '.codex', 'foreign-user-content.txt'),
      ownership: 'user',
      ownershipBoundary: 'user:foreign',
      desiredDigest: digestText('foreign:launchdeck')
    }
  };
}

function seedTargetFiles(state, buildIdentity) {
  for (const target of [state.targets.skill, state.targets.mcp]) {
    writeTargetContent(target, `${target.component}:${buildIdentity}`);
  }
}

function writeForeignTarget(state) {
  writeTargetContent(state.targets.foreign, 'user-owned');
}

function seedArtifacts(state) {
  for (const buildIdentity of planBuilds) {
    const artifactPath = artifactPathForBuild(buildIdentity, state.env);
    fs.mkdirSync(artifactPath, { recursive: true });
    fs.writeFileSync(path.join(artifactPath, 'manifest.json'), `${JSON.stringify({
      buildIdentity,
      fixture: 'managed-lifecycle',
      state: 'verified',
      createdAt: staleArtifactDate
    }, null, 2)}\n`, 'utf8');
  }
  writeRecoveryPins(state, [RECOVERY_BUILD]);
}

function seedReceipt(state, buildIdentity, receiptId) {
  const targets = [state.targets.skill, state.targets.mcp].map((target) => {
    const desiredDigest = digestText(`${target.component}:${buildIdentity}`);
    return {
      targetId: target.targetId,
      ownershipBoundary: target.ownershipBoundary,
      desiredDigest
    };
  });
  state.receiptStore.commit({
    receiptId,
    scope: state.scopeRef.scope,
    scopeIdentity: state.scopeRef.scopeIdentity,
    projectIdentity: state.scopeRef.projectIdentity,
    buildIdentity,
    targets,
    ownedDigests: targets.map((target) => target.desiredDigest),
    verificationEvidence: targets.map((target) => ({
      targetId: target.targetId,
      kind: 'runtime-and-digest',
      buildIdentity,
      observedDigest: target.desiredDigest,
      verified: true
    })),
    committedAt: clockInstant
  });
}

function planTargetFor(state, target, input) {
  const buildIdentity = input.operation === 'update'
    ? (input.desiredBuildIdentity ?? input.build ?? NEXT_BUILD)
    : (currentReceipt(state)?.buildIdentity ?? CURRENT_BUILD);
  const observed = observeTarget(state, target);
  const desiredDigest = input.operation === 'uninstall'
    ? observed.liveDigest
    : digestText(`${target.component}:${buildIdentity}`);
  return {
    targetId: target.targetId,
    hostId: target.hostId,
    scope: target.scope,
    component: target.component,
    path: target.path,
    ownershipBoundary: target.ownershipBoundary,
    ownership: target.ownership,
    liveDigest: observed.liveDigest,
    desiredDigest
  };
}

function targetsFromReceipt(state, receipt) {
  const targetByReceiptId = new Map([
    [state.targets.skill.targetId, state.targets.skill],
    [state.targets.mcp.targetId, state.targets.mcp]
  ]);
  return (receipt?.targets ?? [])
    .map((target) => targetByReceiptId.get(target.targetId))
    .filter(Boolean);
}

function targetById(state, targetId) {
  const target = Object.values(state.targets).find((entry) => entry.targetId === targetId);
  if (!target) throw new Error(`Unknown managed lifecycle target: ${targetId}`);
  return target;
}

function observeTarget(state, target) {
  const receipt = currentReceipt(state);
  const receiptTarget = (receipt?.targets ?? []).find((entry) => entry.targetId === target.targetId);
  const desiredDigest = receiptTarget?.desiredDigest ?? target.desiredDigest;
  const exists = fs.existsSync(target.path);
  const liveDigest = observedDigest(target.path);
  const content = exists ? fs.readFileSync(target.path, 'utf8') : null;
  return {
    targetId: target.targetId,
    hostId: target.hostId,
    component: target.component,
    scope: target.scope,
    path: target.path,
    ownership: target.ownership,
    ownershipBoundary: target.ownershipBoundary,
    state: classifyTargetState({ exists, liveDigest, desiredDigest, ownership: target.ownership }),
    exists,
    desiredDigest,
    observedDigest: liveDigest,
    liveDigest,
    content
  };
}

function classifyTargetState({ exists, liveDigest, desiredDigest, ownership }) {
  if (!exists) return 'missing';
  if (liveDigest === desiredDigest) return 'healthy';
  return ownership === 'launchdeck' ? 'divergent' : 'divergent';
}

function writeTargetContent(target, content) {
  fs.mkdirSync(path.dirname(target.path), { recursive: true });
  fs.writeFileSync(target.path, content, 'utf8');
}

function observedDigest(filePath) {
  if (!fs.existsSync(filePath)) return missingDigest;
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function currentReceipt(state) {
  return state.receiptStore.readCurrent({
    scope: state.scopeRef.scope,
    scopeIdentity: state.scopeRef.scopeIdentity,
    projectIdentity: state.scopeRef.projectIdentity
  });
}

function artifactState(state, buildIdentity) {
  const receipt = currentReceipt(state);
  const recoveryPins = readRecoveryPins(state);
  return {
    buildIdentity,
    pinnedByReceipt: receipt?.buildIdentity === buildIdentity,
    recoveryPinned: recoveryPins.includes(buildIdentity)
  };
}

function listArtifactBuilds(state) {
  return planBuilds.map((buildIdentity) => {
    const artifactPath = artifactPathForBuild(buildIdentity, state.env);
    return {
      buildIdentity,
      path: artifactPath,
      state: fs.existsSync(artifactPath) ? 'verified' : 'absent',
      verified: fs.existsSync(path.join(artifactPath, 'manifest.json')),
      ownershipVerified: true,
      unreferencedSince: staleArtifactDate
    };
  });
}

function listArtifactReferences(state) {
  const recoveryPins = readRecoveryPins(state);
  return {
    receipts: [currentReceipt(state)].filter(Boolean).map((receipt) => ({
      ...receipt,
      current: true
    })),
    transactions: readOperationRecords(state).filter((record) =>
      ['prepared', 'running', 'partial', 'indeterminate'].includes(record.state)
    ),
    backups: readBackupRecords(state),
    reconciliationRecords: recoveryPins.length > 0
      ? [{
          operationId: 'recovery-pins',
          state: 'recoverable',
          requiredBuildIdentities: recoveryPins
        }]
      : []
  };
}

function readOperationRecords(state) {
  const paths = operationJournalPaths(state.env);
  if (!fs.existsSync(paths.recordsDir)) return [];
  return fs.readdirSync(paths.recordsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => JSON.parse(fs.readFileSync(path.join(paths.recordsDir, entry.name), 'utf8')));
}

function readBackupRecords(state) {
  const backupsDir = state.receiptStore.paths.backupsDir;
  if (!fs.existsSync(backupsDir)) return [];
  const records = [];
  const requiredBuildIdentities = readRecoveryPins(state);
  for (const operationEntry of fs.readdirSync(backupsDir, { withFileTypes: true })) {
    if (!operationEntry.isDirectory()) continue;
    const operationDir = path.join(backupsDir, operationEntry.name);
    for (const backupEntry of fs.readdirSync(operationDir, { withFileTypes: true })) {
      if (!backupEntry.isDirectory()) continue;
      const metadataPath = path.join(operationDir, backupEntry.name, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        records.push({
          ...JSON.parse(fs.readFileSync(metadataPath, 'utf8')),
          requiredBuildIdentities
        });
      }
    }
  }
  return records;
}

function recoveryPinsPath(state) {
  return path.join(state.homeDir, 'installer', 'v1', 'recovery-pins.json');
}

function readRecoveryPins(state) {
  const filePath = recoveryPinsPath(state);
  if (!fs.existsSync(filePath)) return [];
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(value?.buildIdentities) ? value.buildIdentities : [];
}

function writeRecoveryPins(state, buildIdentities) {
  const next = [...new Set([...readRecoveryPins(state), ...buildIdentities])].sort();
  fs.mkdirSync(path.dirname(recoveryPinsPath(state)), { recursive: true });
  fs.writeFileSync(recoveryPinsPath(state), `${JSON.stringify({
    schemaVersion: 1,
    buildIdentities: next,
    updatedAt: clockInstant
  }, null, 2)}\n`, 'utf8');
}

function stableSnapshot(state) {
  return JSON.stringify({
    receipt: currentReceipt(state),
    targets: Object.values(state.targets)
      .map((target) => {
        const observed = observeTarget(state, target);
        return {
          targetId: observed.targetId,
          state: observed.state,
          liveDigest: observed.liveDigest,
          content: observed.content
        };
      })
      .sort((left, right) => left.targetId.localeCompare(right.targetId)),
    artifacts: planBuilds.map((buildIdentity) => artifactState(state, buildIdentity)),
    operations: readOperationRecords(state).map((record) => ({
      operationId: record.operationId,
      state: record.state,
      receiptId: record.installer?.receiptRef?.receiptId ?? null
    })),
    backups: readBackupRecords(state).map((record) => ({
      backupId: record.backupId,
      targetId: record.targetId,
      retentionState: record.retentionState
    }))
  });
}

function digestText(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function removeFixtureRoot(root) {
  const resolved = path.resolve(root);
  const relative = path.relative(path.resolve(os.tmpdir()), resolved);
  if (
    relative === ''
    || relative.startsWith('..')
    || path.isAbsolute(relative)
    || !path.basename(resolved).startsWith(fixturePrefix)
  ) {
    throw new Error(`Refusing to remove non-managed lifecycle fixture: ${root}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}
