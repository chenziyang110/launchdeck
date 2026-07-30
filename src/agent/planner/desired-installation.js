import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestCanonical } from '../digests.js';
import { AgentInstallerError, toInstallerErrorPayload } from '../errors.js';
import {
  PACKAGED_BUILD_SELECTOR,
  isDigest,
  resolveCanonicalScope
} from '../state/transaction-plan.js';
import { launcherPaths } from '../artifacts/launcher.js';
import { createInstallationPlan } from './installation-plan.js';

const OPERATIONS = new Set(['setup', 'update', 'repair', 'uninstall']);
const COMPONENTS = new Set(['runtime', 'skill', 'mcp']);
const HOST_COMPONENTS = new Set(['skill', 'mcp']);
const EMPTY_DIGEST = `sha256:${'0'.repeat(64)}`;
const PACKAGED_PAYLOAD_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'agent',
  'installer-payload'
);

export async function discoverDesiredInstallation(input = {}) {
  const registry = input.registry;
  if (!registry || typeof registry !== 'object') {
    throw plannerError('agent_registry_required', 'Host registry is required for discovery.');
  }

  let desired;
  try {
    assertExplicitSelection(input);
    desired = await normalizeDesiredInstallationSelection(input);
  } catch (error) {
    return refuseDesiredInstallation({
      input,
      error
    });
  }

  const receiptTargets = normalizeReceiptTargets(input.targets);
  const requestedHostComponents = desired.components.filter((component) =>
    HOST_COMPONENTS.has(component)
  );
  const selectedHosts = requestedHostComponents.length === 0
    ? []
    : desired.hostIds.length > 0
      ? desired.hostIds
      : normalizeDiscoveredHosts(registry);
  const hostComponents = setupHostComponentMap({
    desired,
    selectedHosts,
    requestedHostComponents,
    receiptTargets
  });
  if (requestedHostComponents.length > 0
    && selectedHosts.length !== 1
    && input.interactive !== true) {
    return refuseDesiredInstallation({
      desired,
      error: plannerError('agent_selection_ambiguous', 'Host selection is ambiguous.', {
        candidates: selectedHosts
      })
    });
  }

  const includeRuntimeTarget = desired.components.includes('runtime')
    || setupRetainsRuntime(desired, receiptTargets);
  const evidence = {
    matrixRevision: registry.matrixRevision ?? registry.matrix?.revision ?? null,
    hostEvidence: [],
    capabilities: [],
    targets: [],
    targetPlans: [],
    includeLauncher: input.includeLauncher === true || includeRuntimeTarget,
    previousBuildPins: desired.previousBuildPins,
    supersedesReceiptId: desired.operation === 'setup' ? input.receipt?.receiptId ?? null : null
  };
  if (includeRuntimeTarget) {
    const runtime = resolveRuntimeProvisioningContract({
      input,
      desired
    });
    if (runtime?.refusal) {
      return refuseDesiredInstallation({
        desired,
        error: runtime.refusal
      });
    }
    if (!runtime) {
      return refuseDesiredInstallation({
        desired,
        error: plannerError(
          'agent_runtime_payload_unavailable',
          'The selected runtime payload is not available or does not match the selected build.'
        )
      });
    }
    const receiptRuntimeTarget = receiptTargets.find((target) => (
      target.hostId === 'launchdeck'
      && target.scope === desired.scope
      && target.component === 'runtime'
    ));
    if (
      receiptRuntimeTarget
      && (
        receiptRuntimeTarget.ownershipBoundary !== runtime.target.ownershipBoundary
        || receiptRuntimeTarget.desiredDigest !== runtime.target.liveDigest
      )
    ) {
      return refuseDesiredInstallation({
        desired,
        error: plannerError(
          'agent_target_ownership_unverified',
          'Stable launcher does not match the selected receipt.',
          { targetId: runtime.target.targetId }
        )
      });
    }
    evidence.targets.push(runtime.target);
    evidence.targetPlans.push(runtime.targetPlan);
  }

  for (const [hostId, requestedComponents] of hostComponents) {
    const adapter = adapterFor(registry, hostId);
    const detected = asArray(await adapter.detect({
      scope: desired.scope,
      projectRoot: desired.projectIdentity,
      homeDir: input.homeDir,
      projectIdentity: desired.projectIdentity
    }));
    evidence.hostEvidence.push(...detected);
    if (detected.some((row) => row?.supportState === 'ambiguous')) {
      return refuseDesiredInstallation({
        desired,
        error: plannerError('agent_host_evidence_ambiguous', 'Host evidence is ambiguous.', { hostId })
      });
    }

    const capabilities = asArray(await adapter.capabilities(detected, desired.scope, {
      scope: desired.scope,
      projectRoot: desired.projectIdentity,
      homeDir: input.homeDir,
      projectIdentity: desired.projectIdentity
    }));
    const selectedCapabilities = capabilities.filter((capability) =>
      requestedComponents.includes(capability?.component)
    );
    evidence.capabilities.push(...selectedCapabilities);
    const ambiguous = selectedCapabilities.find((capability) => capability?.supportState === 'ambiguous');
    if (ambiguous) {
      return refuseDesiredInstallation({
        desired,
        error: plannerError('agent_host_evidence_ambiguous', 'Host capability evidence is ambiguous.', {
          hostId,
          component: ambiguous.component,
          reason: ambiguous.reason
        })
      });
    }
    const unsupported = selectedCapabilities.find((capability) => capability?.supportState !== 'supported');
    if (unsupported || selectedCapabilities.length !== requestedComponents.length) {
      return refuseDesiredInstallation({
        desired,
        error: plannerError('agent_component_unsupported', 'Requested component is unsupported by the selected host.', {
          hostId,
          component: unsupported?.component ?? null,
          reason: unsupported?.reason ?? 'missing-capability-evidence'
        })
      });
    }

    const targets = await adapter.resolveTargets({
      scope: desired.scope,
      projectRoot: desired.projectIdentity,
      homeDir: input.homeDir,
      projectIdentity: desired.projectIdentity,
      components: requestedComponents,
      hostEvidence: detected,
      evidence: detected
    });
    if (targets?.kind === 'refusal' || targets?.status === 'refused') {
      return refuseDesiredInstallation({
        desired,
        error: plannerError(codeForRegistryRefusal(targets.code), targets.message ?? 'Target resolution refused.', {
          hostId,
          reason: targets.code ?? null,
          details: targets.details ?? {}
        })
      });
    }

    const boundedTargets = bindResolvedTargets({
      hostId,
      scope: desired.scope,
      resolvedTargets: asArray(targets).filter((target) =>
        requestedComponents.includes(target?.component)
      ),
      receiptTargets,
      operation: desired.operation
    });
    if (desired.operation !== 'setup' && receiptTargets.length > 0 && boundedTargets.length === 0) {
      return refuseDesiredInstallation({
        desired,
        error: plannerError(
          'agent_receipt_target_unresolved',
          'No live Host target matches the receipt-bounded lifecycle target.',
          { hostId }
        )
      });
    }

    for (const target of boundedTargets) {
      const receiptTarget = receiptTargets.find((candidate) => candidate.targetId === target.targetId);
      let observation = null;
      if (receiptTarget && typeof adapter.inspect === 'function') {
        observation = await adapter.inspect(target, {
          operation: desired.operation,
          scope: desired.scope,
          projectRoot: desired.projectIdentity,
          projectIdentity: desired.projectIdentity,
          homeDir: input.homeDir
        });
        if (!observation || observation.kind === 'refusal') {
          return refuseDesiredInstallation({
            desired,
            error: plannerError(
              'agent_target_ownership_unverified',
              'Live Host target ownership could not be verified.',
              { hostId, targetId: target.targetId }
            )
          });
        }
      }
      const ownedTarget = mergeLiveTarget(target, receiptTarget, observation);
      evidence.targets.push(ownedTarget);
      const receiptOwnership = receiptTarget
        ? buildReceiptOwnership(input.receipt, receiptTarget, observation, target)
        : undefined;
      if (receiptTarget && receiptOwnership.owned !== true) {
        return refuseDesiredInstallation({
          desired,
          error: plannerError(
            'agent_target_ownership_unverified',
            'Live Host target does not match the selected receipt.',
            { hostId, targetId: target.targetId }
          )
        });
      }
      const desiredBuild = resolveDesiredBuildContract({
        input,
        desired,
        receiptOwnership
      });
      const targetPlan = desired.operation === 'uninstall'
        ? await adapter.uninstall(target, receiptOwnership, {
            operation: desired.operation,
            receiptOwnership
          })
        : await adapter.plan(target, desiredBuild, {
            operation: desired.operation,
            receiptOwnership
          });
      if (targetPlan?.kind === 'refusal' || targetPlan?.status === 'refused') {
        return refuseDesiredInstallation({
          desired,
          error: plannerError(codeForRegistryRefusal(targetPlan.code), targetPlan.message ?? 'Target planning refused.', {
            hostId,
            targetId: target.targetId,
            reason: targetPlan.code ?? null,
            details: targetPlan.details ?? {}
          })
        });
      }
      evidence.targetPlans.push(normalizeTargetPlan(target, targetPlan));
    }
  }

  try {
    retainOwnedSetupTargets(desired, evidence, receiptTargets);
    retainOwnedRepairTargets(desired, evidence);
    const plan = await createInstallationPlan({ desired, evidence });
    return deepFreeze({
      outcome: 'planned',
      operation: desired.operation,
      effectCertainty: 'none',
      scope: desired.scope,
      scopeIdentity: desired.scopeIdentity,
      projectIdentity: desired.projectIdentity,
      buildIdentity: plan.buildIdentity,
      planDigest: plan.planDigest,
      planBindingDigest: plan.planBindingDigest,
      desiredInstallationDigest: desired.inputDigest,
      targetIds: plan.targetIds,
      targets: plan.targets,
      evaluatedTargets: plan.evaluatedTargets,
      actions: plan.actions,
      includeLauncher: plan.includeLauncher,
      supersedesReceiptId: plan.supersedesReceiptId,
      trustedSources: plan.trustedSources,
      effects: [],
      receiptId: null
    });
  } catch (error) {
    return refuseDesiredInstallation({
      desired,
      error
    });
  }
}

function setupHostComponentMap({ desired, selectedHosts, requestedHostComponents, receiptTargets }) {
  const hostComponents = new Map(selectedHosts.map((hostId) => [hostId, new Set(requestedHostComponents)]));
  if (desired.operation === 'setup') {
    for (const target of receiptTargets) {
      if (target.scope !== desired.scope || !HOST_COMPONENTS.has(target.component)) continue;
      if (!hostComponents.has(target.hostId)) hostComponents.set(target.hostId, new Set());
      hostComponents.get(target.hostId).add(target.component);
    }
  }
  return new Map([...hostComponents.entries()].map(([hostId, components]) => [
    hostId,
    [...components].sort(compareStrings)
  ]));
}

function setupRetainsRuntime(desired, receiptTargets) {
  return desired.operation === 'setup' && receiptTargets.some((target) => (
    target.hostId === 'launchdeck'
    && target.scope === desired.scope
    && target.component === 'runtime'
  ));
}

function retainOwnedSetupTargets(desired, evidence, receiptTargets) {
  if (desired.operation !== 'setup' || receiptTargets.length === 0) return;
  const hasSetupEffect = evidence.targetPlans.some((targetPlan) =>
    targetPlan.status === 'planned' && (targetPlan.actions ?? []).length > 0
  );
  if (!hasSetupEffect) return;
  const receiptIds = new Set(receiptTargets.map((target) => target.targetId));
  const targetsById = new Map(evidence.targets.map((target) => [target.targetId, target]));
  evidence.targetPlans = evidence.targetPlans.map((targetPlan) => {
    if (
      !receiptIds.has(targetPlan.targetId)
      || !['noop', 'no-op'].includes(targetPlan.status)
      || (targetPlan.actions ?? []).length > 0
    ) {
      return targetPlan;
    }
    const target = targetsById.get(targetPlan.targetId);
    const retainedDigest = target?.liveDigest;
    if (!target || !isDigest(retainedDigest)) return targetPlan;
    return {
      ...targetPlan,
      status: 'planned',
      actions: [{
        actionId: `retain-${target.targetId}`,
        targetId: target.targetId,
        kind: 'retain-owned-target',
        targetPath: target.path,
        ownershipBoundary: target.ownershipBoundary,
        preconditionDigest: retainedDigest,
        desiredDigest: retainedDigest,
        requiresBackup: false
      }]
    };
  });
}

function retainOwnedRepairTargets(desired, evidence) {
  if (desired.operation !== 'repair') return;
  const hasRepairEffect = evidence.targetPlans.some((targetPlan) =>
    targetPlan.status === 'planned' && (targetPlan.actions ?? []).length > 0
  );
  if (!hasRepairEffect) return;
  const targetsById = new Map(evidence.targets.map((target) => [target.targetId, target]));
  evidence.targetPlans = evidence.targetPlans.map((targetPlan) => {
    if (!['noop', 'no-op'].includes(targetPlan.status) || (targetPlan.actions ?? []).length > 0) {
      return targetPlan;
    }
    const target = targetsById.get(targetPlan.targetId);
    const retainedDigest = target?.liveDigest;
    if (!target || !isDigest(retainedDigest)) return targetPlan;
    return {
      ...targetPlan,
      status: 'planned',
      actions: [{
        actionId: `retain-${target.targetId}`,
        targetId: target.targetId,
        kind: 'retain-owned-target',
        targetPath: target.path,
        ownershipBoundary: target.ownershipBoundary,
        preconditionDigest: retainedDigest,
        desiredDigest: retainedDigest,
        requiresBackup: false
      }]
    };
  });
}

export async function normalizeDesiredInstallationSelection(input = {}) {
  const operation = requireOperation(input.operation);
  const scope = normalizeScope(input.scope);
  if (
    scope === 'user'
    && input.project !== undefined
    && input.project !== null
    && String(input.project).trim() !== ''
  ) {
    throw plannerError(
      'agent_project_identity_forbidden',
      'User-scope installation cannot bind a project identity.'
    );
  }
  const scopeRef = resolveCanonicalScope({
    scope,
    projectIdentity: input.projectIdentity ?? input.project ?? input.projectRoot,
    projectRoot: input.projectIdentity ?? input.project ?? input.projectRoot,
    homeDir: input.homeDir,
    userHome: input.homeDir,
    env: input.env
  });
  const requestedBuildSelector = normalizeRequestedBuildSelector(
    input.desiredBuildIdentity ?? input.build
  );
  const desiredBuildIdentity = resolveRequestedBuildIdentity({
    requestedBuildSelector,
    packagedBuildIdentity: input.packagedBuildIdentity
      ?? input.resolvedBuildIdentity
      ?? input.invokingBuildIdentity
      ?? input.buildIdentity
  });

  const normalized = {
    operation,
    scope: scopeRef.scope,
    scopeIdentity: scopeRef.scopeIdentity,
    projectIdentity: scopeRef.projectIdentity,
    hostIds: normalizeList(
      input.hostIds ?? input.hosts ?? input.host ?? hostIdsFromTargets(input.targets),
      'host'
    ),
    components: normalizeComponents(
      input.components ?? input.component ?? componentsFromTargets(input.targets)
    ),
    requestedBuildSelector,
    desiredBuildIdentity,
    sourceIdentity: requireText(input.sourceIdentity, 'sourceIdentity'),
    interactive: Boolean(input.interactive),
    approved: Boolean(input.yes ?? input.approved),
    dryRun: Boolean(input.dryRun),
    force: Boolean(input.force),
    includeLauncher: input.includeLauncher === true,
    previousBuildPins: normalizeDigestList(input.previousBuildPins ?? [])
  };
  return deepFreeze({
    ...normalized,
    inputDigest: digestCanonical(normalized)
  });
}

function assertExplicitSelection(input) {
  if (input.operation !== 'setup' || input.requireExplicitSelection !== true) return;
  const rawComponents = input.components ?? input.component;
  if (emptySelection(rawComponents)) {
    throw plannerError(
      'agent_component_selection_required',
      'Setup requires explicit component selection.'
    );
  }
  const components = normalizeComponents(rawComponents);
  const requiresHost = components.some((component) => HOST_COMPONENTS.has(component));
  if (
    (requiresHost && emptySelection(input.hostIds ?? input.hosts ?? input.host))
    || components.length === 0
    || emptySelection(input.scope)
  ) {
    throw plannerError(
      'agent_selection_ambiguous',
      'Setup requires explicit host, component, and scope selections.'
    );
  }
}

function resolveDesiredBuildContract({ input, desired, receiptOwnership }) {
  const skill = desired.components.includes('skill')
    ? resolveSkillPayloadContract(input, desired.desiredBuildIdentity)
    : null;
  return {
    buildIdentity: desired.desiredBuildIdentity,
    sourceIdentity: desired.sourceIdentity,
    receiptOwnership,
    ...(skill
      ? {
          skill,
          skillSource: skill.sourceDir,
          skillDigest: skill.contentDigest
        }
      : {})
  };
}

function resolveRuntimeProvisioningContract({ input, desired }) {
  const payloadRoot = resolvePayloadRoot(input, desired.desiredBuildIdentity);
  if (!payloadRoot) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(payloadRoot, 'manifest.json'), 'utf8'));
    const launcherEntries = manifest.files
      .filter((entry) => typeof entry?.path === 'string' && entry.path.startsWith('launcher/'))
      .map((entry) => ({
        path: entry.path.slice('launcher/'.length),
        bytes: entry.bytes,
        sha256: entry.sha256
      }))
      .sort((left, right) => compareStrings(left.path, right.path));
    if (launcherEntries.length !== 3) return null;
    const env = normalizedInstallerEnv(input);
    const targetPath = launcherPaths(env).root;
    const liveDigest = digestDirectoryOrEmpty(targetPath);
    const desiredDigest = digestCanonical({
      schemaVersion: 1,
      skillName: path.basename(targetPath),
      files: launcherEntries
    });
    const artifactVerified = runtimeArtifactVerified(
      input.artifactStore,
      desired.desiredBuildIdentity
    );
    const provisioningRequired = liveDigest !== desiredDigest || !artifactVerified;
    const targetId = `launchdeck:${desired.scope}:runtime`;
    const target = {
      targetId,
      hostId: 'launchdeck',
      scope: desired.scope,
      component: 'runtime',
      path: targetPath,
      ownershipBoundary: 'stable-launcher',
      ownership: 'launchdeck-owned',
      liveDigest
    };
    if (desired.operation === 'uninstall') {
      const receiptTarget = normalizeReceiptTargets(input.receipt?.targets)
        .find((candidate) => candidate.targetId === targetId);
      if (
        !receiptTarget
        || receiptTarget.ownershipBoundary !== target.ownershipBoundary
        || receiptTarget.desiredDigest !== liveDigest
      ) {
        return {
          refusal: plannerError(
            'agent_target_ownership_unverified',
            'Stable launcher does not match the selected receipt.',
            { targetId }
          )
        };
      }
      return {
        target,
        targetPlan: {
          targetId,
          status: liveDigest === EMPTY_DIGEST ? 'noop' : 'planned',
          actions: liveDigest === EMPTY_DIGEST ? [] : [{
            actionId: `remove-${targetId}`,
            targetId,
            kind: 'remove-stable-launcher',
            targetPath,
            ownershipBoundary: 'stable-launcher',
            preconditionDigest: liveDigest,
            desiredDigest: EMPTY_DIGEST,
            requiresBackup: true
          }]
        }
      };
    }
    return {
      target,
      targetPlan: {
        targetId,
        status: provisioningRequired ? 'planned' : 'noop',
        actions: provisioningRequired ? [{
          actionId: `install-${targetId}`,
          targetId,
          kind: 'install-stable-launcher',
          targetPath,
          ownershipBoundary: 'stable-launcher',
          preconditionDigest: liveDigest,
          desiredDigest,
          requiresBackup: liveDigest !== EMPTY_DIGEST
        }] : []
      }
    };
  } catch {
    return null;
  }
}

function runtimeArtifactVerified(artifactStore, buildIdentity) {
  if (typeof artifactStore?.inspect !== 'function') return false;
  try {
    return artifactStore.inspect(buildIdentity)?.state === 'verified';
  } catch {
    return false;
  }
}

function resolveSkillPayloadContract(input, buildIdentity) {
  if (input.skill && typeof input.skill === 'object') {
    return normalizeSkillPayloadContract(input.skill);
  }
  for (const payloadRoot of [
    resolvePayloadRoot(input, buildIdentity),
    PACKAGED_PAYLOAD_ROOT
  ].filter(Boolean)) {
    const contract = readSkillPayloadContract(payloadRoot, buildIdentity);
    if (contract) return contract;
  }
  return null;
}

function resolvePayloadRoot(input, buildIdentity) {
  const activationRoot = typeof input.artifactStore?.resolveForActivation === 'function'
    ? input.artifactStore.resolveForActivation(buildIdentity)
    : null;
  for (const candidate of [activationRoot, PACKAGED_PAYLOAD_ROOT].filter(Boolean)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'manifest.json'), 'utf8'));
      if (manifest.buildIdentity === buildIdentity) return candidate;
    } catch {
      // A missing or malformed candidate is not trusted as a payload source.
    }
  }
  return null;
}

function normalizedInstallerEnv(input) {
  const env = { ...(input.env ?? {}) };
  if (!String(env.LAUNCHDECK_HOME ?? '').trim()) {
    env.LAUNCHDECK_HOME = path.join(path.resolve(input.homeDir), '.launchdeck');
  }
  return env;
}

function digestDirectoryOrEmpty(root) {
  if (!fs.existsSync(root)) return EMPTY_DIGEST;
  const entry = fs.lstatSync(root);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw plannerError('agent_runtime_target_invalid', 'Stable launcher target is not a regular directory.');
  }
  const files = [];
  collectDigestFiles(root, '', files);
  files.sort((left, right) => compareStrings(left.path, right.path));
  return digestCanonical({
    schemaVersion: 1,
    skillName: path.basename(root),
    files
  });
}

function collectDigestFiles(root, relativeDir, files) {
  const directory = path.join(root, relativeDir);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw plannerError('agent_runtime_target_invalid', 'Stable launcher target contains a symbolic link.');
    }
    if (entry.isDirectory()) {
      collectDigestFiles(root, relativePath, files);
    } else if (entry.isFile()) {
      const bytes = fs.readFileSync(absolutePath);
      files.push({
        path: relativePath.replaceAll('\\', '/'),
        bytes: bytes.length,
        sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
      });
    } else {
      throw plannerError('agent_runtime_target_invalid', 'Stable launcher target contains an unsupported entry.');
    }
  }
}

function readSkillPayloadContract(payloadRoot, buildIdentity) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(payloadRoot, 'manifest.json'), 'utf8'));
    if (manifest.buildIdentity !== buildIdentity || !Array.isArray(manifest.files)) return null;
    const prefix = 'skill/launchdeck-agent/';
    const files = manifest.files
      .filter((entry) => typeof entry?.path === 'string' && entry.path.startsWith(prefix))
      .map((entry) => ({
        path: entry.path.slice(prefix.length),
        bytes: entry.bytes,
        sha256: entry.sha256
      }))
      .sort((left, right) => compareStrings(left.path, right.path));
    const sourceDir = path.join(payloadRoot, 'skill', 'launchdeck-agent');
    if (files.length === 0 || !fs.statSync(sourceDir).isDirectory()) return null;
    return normalizeSkillPayloadContract({
      sourceDir,
      contentDigest: digestCanonical({
        schemaVersion: 1,
        skillName: 'launchdeck-agent',
        files
      })
    });
  } catch {
    return null;
  }
}

function normalizeSkillPayloadContract(value) {
  const sourceDir = path.resolve(requireText(value.sourceDir, 'skill.sourceDir'));
  const contentDigest = String(value.contentDigest ?? '').trim();
  if (!isDigest(contentDigest)) {
    throw plannerError('agent_build_identity_invalid', 'skill.contentDigest must be a sha256 digest.');
  }
  return Object.freeze({ sourceDir, contentDigest });
}

export function refuseDesiredInstallation({ desired, input = {}, error } = {}) {
  const installerError = error instanceof AgentInstallerError
    ? error
    : plannerError(error?.code ?? 'agent_selection_refused', error?.message ?? 'Desired installation refused.');
  const buildIdentity = desired?.desiredBuildIdentity;
  return deepFreeze({
    outcome: 'refused',
    effectCertainty: 'none',
    scope: desired?.scope ?? normalizeScopeOrDefault(input.scope),
    scopeIdentity: desired?.scopeIdentity ?? null,
    projectIdentity: desired?.projectIdentity ?? null,
    buildIdentity: isDigest(buildIdentity) ? buildIdentity : null,
    planDigest: null,
    planBindingDigest: null,
    receiptId: null,
    targets: [],
    health: [],
    effects: [],
    nextActions: [],
    error: toInstallerErrorPayload(installerError)
  });
}

function requireOperation(operation) {
  const normalized = String(operation ?? '').trim();
  if (!OPERATIONS.has(normalized)) {
    throw plannerError('agent_operation_invalid', 'Installation operation is invalid.');
  }
  return normalized;
}

function normalizeScope(scopeInput) {
  const scope = normalizeScopeOrDefault(scopeInput);
  if (!['project', 'user'].includes(scope)) {
    throw plannerError('agent_scope_invalid', 'Installation scope must be project or user.');
  }
  return scope;
}

function normalizeScopeOrDefault(scopeInput) {
  if (scopeInput === undefined || scopeInput === null || scopeInput === '') return 'project';
  const scopes = normalizeList(scopeInput, 'scope');
  if (scopes.length !== 1) {
    throw plannerError('agent_scope_ambiguous', 'Installation scope is ambiguous.');
  }
  return scopes[0];
}

function normalizeComponents(value) {
  const components = normalizeList(value, 'component');
  if (components.some((component) => !COMPONENTS.has(component))) {
    throw plannerError('agent_selection_unsupported', 'Unsupported component selection.');
  }
  return components;
}

function normalizeRequestedBuildSelector(value) {
  const selector = String(value ?? '').trim();
  if (!selector) {
    throw plannerError('agent_build_identity_invalid', 'Build selection is required.');
  }
  if (selector === PACKAGED_BUILD_SELECTOR) return selector;
  if (!isDigest(selector)) {
    throw plannerError('agent_build_identity_invalid', 'Build selection must be a sha256 digest or packaged.');
  }
  return selector;
}

function resolveRequestedBuildIdentity({ requestedBuildSelector, packagedBuildIdentity }) {
  if (requestedBuildSelector !== PACKAGED_BUILD_SELECTOR) return requestedBuildSelector;
  if (packagedBuildIdentity === undefined || packagedBuildIdentity === null || packagedBuildIdentity === '') {
    return PACKAGED_BUILD_SELECTOR;
  }
  if (!isDigest(packagedBuildIdentity)) {
    throw plannerError('agent_build_identity_invalid', 'packagedBuildIdentity is invalid.');
  }
  return packagedBuildIdentity;
}

function normalizeList(value, label) {
  const raw = Array.isArray(value) ? value : [value];
  const entries = raw.flatMap((entry) => String(entry ?? '').split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) {
    if (label === 'host') return [];
    throw plannerError('agent_selection_ambiguous', `At least one ${label} must be selected.`);
  }
  return [...new Set(entries)].sort(compareStrings);
}

function normalizeReceiptTargets(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((target) => target && typeof target === 'object')
    .map((target) => {
      const [hostId, scope, component] = String(target.targetId ?? '').split(':');
      return {
        ...target,
        hostId: target.hostId ?? hostId,
        scope: target.scope ?? scope,
        component: target.component ?? component
      };
    });
}

function hostIdsFromTargets(value) {
  return normalizeReceiptTargets(value).map((target) => target.hostId).filter(Boolean);
}

function componentsFromTargets(value) {
  return normalizeReceiptTargets(value).map((target) => target.component).filter(Boolean);
}

function bindResolvedTargets({ hostId, scope, resolvedTargets, receiptTargets, operation }) {
  const normalized = resolvedTargets.map((target) => normalizeResolvedTarget(hostId, scope, target));
  if (receiptTargets.length === 0 || operation === 'setup') return normalized;
  const receiptIds = new Set(receiptTargets.map((target) => target.targetId));
  return normalized.filter((target) => receiptIds.has(target.targetId));
}

function normalizeResolvedTarget(hostId, scope, target) {
  const component = target.component;
  const normalized = {
    ...target,
    targetId: target.targetId ?? `${hostId}:${scope}:${component}`,
    hostId: target.hostId ?? target.host ?? hostId,
    scope: target.scope ?? scope,
    component,
    path: target.path ?? target.targetPath,
    ownershipBoundary: target.ownershipBoundary
      ?? (component === 'skill' ? 'launchdeck-agent' : 'launchdeck-mcp-entry'),
    ownership: target.ownership ?? 'launchdeck'
  };
  return target.targetId === normalized.targetId
    && target.hostId === normalized.hostId
    && target.scope === normalized.scope
    && target.component === normalized.component
    && target.path === normalized.path
    && target.ownershipBoundary === normalized.ownershipBoundary
    && target.ownership === normalized.ownership
    ? target
    : normalized;
}

function mergeLiveTarget(target, receiptTarget, observation) {
  const liveDigest = observation?.liveDigest
    ?? observation?.observedDigest
    ?? observation?.contentDigest
    ?? observation?.digest
    ?? receiptTarget?.liveDigest
    ?? receiptTarget?.desiredDigest;
  return {
    ...target,
    ownership: receiptTarget ? 'launchdeck' : target.ownership,
    ...(liveDigest ? { liveDigest } : {})
  };
}

function buildReceiptOwnership(receipt, receiptTarget, observation, resolvedTarget) {
  const observedDigest = observation?.liveDigest
    ?? observation?.observedDigest
    ?? observation?.contentDigest
    ?? observation?.digest
    ?? receiptTarget.liveDigest
    ?? null;
  const expectedDigest = receiptTarget.desiredDigest ?? receiptTarget.liveDigest ?? null;
  const exists = observation?.exists
    ?? !['absent', 'missing', 'malformed', 'unavailable'].includes(observation?.status);
  const digestMatches = Boolean(observedDigest && expectedDigest && observedDigest === expectedDigest);
  return {
    receiptId: receipt?.receiptId ?? null,
    buildIdentity: receipt?.buildIdentity ?? null,
    owned: receiptTarget.ownership === 'launchdeck' || receiptTarget.ownership === undefined,
    owner: 'launchdeck-agent-installer',
    component: receiptTarget.component ?? resolvedTarget?.component,
    path: receiptTarget.path ?? resolvedTarget?.path,
    ownershipBoundary: receiptTarget.ownershipBoundary,
    liveDigest: observedDigest,
    liveDigestMatches: exists !== false && digestMatches
  };
}

function normalizeTargetPlan(target, plan) {
  const actions = asArray(plan?.actions).map((action, index) => ({
    ...action,
    actionId: action.actionId ?? `${planActionKind(action)}-${target.targetId}-${index + 1}`,
    kind: action.kind ?? action.type ?? 'host-mutation',
    targetId: action.targetId ?? target.targetId,
    targetPath: action.targetPath ?? action.path ?? target.path,
    ownershipBoundary: action.ownershipBoundary ?? target.ownershipBoundary,
    preconditionDigest: action.preconditionDigest ?? target.liveDigest,
    desiredDigest: action.desiredDigest
      ?? (plan.status === 'noop' || plan.status === 'no-op'
        ? target.liveDigest
        : digestCanonical({
            operation: action.kind ?? action.type ?? 'host-mutation',
            targetId: target.targetId,
            content: action.content ?? action.source ?? action.rendered ?? null
          }))
  }));
  return {
    ...plan,
    targetId: target.targetId,
    status: plan.status === 'no-op' ? 'noop' : plan.status,
    actions
  };
}

function planActionKind(action) {
  return String(action.kind ?? action.type ?? 'host-mutation').replaceAll(/[^a-zA-Z0-9_-]/g, '-');
}

function emptySelection(value) {
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || String(value).trim() === '';
}

function normalizeDigestList(value) {
  if (!Array.isArray(value)) {
    throw plannerError('agent_build_identity_invalid', 'previousBuildPins must be an array.');
  }
  return [...new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))]
    .map((entry) => {
      if (!isDigest(entry)) {
        throw plannerError('agent_build_identity_invalid', 'previousBuildPins must contain only sha256 digests.');
      }
      return entry;
    })
    .sort(compareStrings);
}

function normalizeDiscoveredHosts(registry) {
  if (typeof registry.listHosts === 'function') return registry.listHosts().sort(compareStrings);
  if (typeof registry.list === 'function') return registry.list().map((entry) => entry.id).sort(compareStrings);
  return [];
}

function adapterFor(registry, hostId) {
  const lookup = (candidate) => typeof registry.adapterFor === 'function'
    ? registry.adapterFor(candidate)
    : typeof registry.get === 'function'
      ? registry.get(candidate)
      : null;
  let adapter = lookup(hostId);
  if (!adapter) {
    const canonical = { claude: 'claude-code', copilot: 'github-copilot' }[hostId];
    if (canonical) adapter = lookup(canonical);
  }
  if (!adapter) throw plannerError('agent_host_unsupported', 'Selected host is unavailable.', { hostId });
  return adapter;
}

function codeForRegistryRefusal(code) {
  if (code === 'host_evidence_ambiguous') return 'agent_host_evidence_ambiguous';
  if (code === 'host_capability_not_proven') return 'agent_component_unsupported';
  if (code === 'ownership-collision') return 'agent_target_ownership_collision';
  return `agent_${String(code ?? 'host_refused').replaceAll('-', '_')}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function plannerError(code, message, details = {}) {
  return new AgentInstallerError(code, message, {
    effectCertainty: 'none',
    details
  });
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw plannerError('agent_model_invalid', `${label} is required.`);
  }
  return text;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
