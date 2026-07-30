import crypto from 'node:crypto';
import fs from 'node:fs';
import { AgentInstallerError } from '../errors.js';
import { createClaudeHostAdapter } from './claude/index.js';
import { createCodexHostAdapter } from './codex/index.js';
import { createCopilotAdapter } from './copilot/index.js';
import { normalizeRegistryTargets } from './shared-skill.js';
import { createClaudeCopilotCoexistenceGate } from './coexistence-gate.js';
import { createVisualStudioHostAdapter } from './visual-studio/index.js';

const DEFAULT_MATRIX = JSON.parse(
  fs.readFileSync(new URL('./compatibility-matrix.json', import.meta.url), 'utf8')
);
const EMPTY_DIGEST = digestBytes(Buffer.alloc(0));
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

const REGISTRATIONS = Object.freeze([
  Object.freeze({ id: 'codex', create: createCodexHostAdapter }),
  Object.freeze({ id: 'claude-code', create: createClaudeHostAdapter }),
  Object.freeze({ id: 'github-copilot', create: createCopilotAdapter }),
  Object.freeze({ id: 'visual-studio', create: createVisualStudioHostAdapter })
]);

/**
 * The single serialization authority for Launchdeck host adapters.
 *
 * Adapter construction is side-effect free. Live probe, configuration, and
 * runtime providers must still be injected into the isolated adapters.
 */
export function createHostRegistry(options = {}) {
  const matrix = freezeMatrix(options.matrix ?? DEFAULT_MATRIX);
  const adapterOptions = isPlainObject(options.adapterOptions) ? options.adapterOptions : {};
  const coexistenceGate = createClaudeCopilotCoexistenceGate({
    coexistence: matrix.sharedMcpCoexistence,
    matrixRevision: matrix.revision
  });
  const registrations = Object.freeze(REGISTRATIONS.map((registration) => {
    const rawAdapter = registration.create(adapterOptions[registration.id] ?? {});
    assertAdapterSurface(registration.id, rawAdapter);
    const adapter = createRegisteredAdapter(registration.id, rawAdapter, matrix);
    return Object.freeze({
      id: registration.id,
      adapter
    });
  }));
  const byId = new Map(registrations.map((registration) => [registration.id, registration.adapter]));

  return Object.freeze({
    matrix,
    list: () => registrations,
    get: (hostId) => byId.get(hostId) ?? null,
    evaluate: (request) => evaluateHostCapability(matrix, request),
    evaluateCoexistence: (request) => coexistenceGate.evaluate(request),
    normalizeTargets: (targets, normalizeOptions = {}) => {
      const eligibility = normalizeOptions.eligibility;
      if (eligibility && (
        eligibility.matrixRevision !== matrix.revision
        || eligibility.coexistenceRevision !== matrix.sharedMcpCoexistence?.revision
      )) {
        return registryRefusal('shared_mcp_coexistence_revision_mismatch');
      }
      return normalizeRegistryTargets(targets, { eligibility });
    }
  });
}

/**
 * Match a capability only on the complete exact evidence key.
 */
export function evaluateHostCapability(matrix, request = {}) {
  const rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  const normalized = normalizeCapabilityRequest(request);
  if (!normalized.valid) {
    return Object.freeze({
      supportState: 'ambiguous',
      reason: 'invalid-capability-evidence',
      invalidFields: Object.freeze(normalized.invalidFields)
    });
  }

  const exactRows = rows.filter((row) => matchesExactKey(row, normalized.value));
  if (exactRows.length > 1) {
    return Object.freeze({
      supportState: 'ambiguous',
      reason: 'contradictory-capability-rows',
      host: normalized.value.host,
      exactVersion: normalized.value.exactVersion,
      platform: normalized.value.platform,
      component: normalized.value.component,
      scope: normalized.value.scope,
      rowIds: Object.freeze(exactRows
        .map((row) => String(row.rowId ?? 'missing-row-id'))
        .sort(compareStrings))
    });
  }

  if (exactRows.length === 0) {
    const availableScopes = [...new Set(rows
      .filter((row) => matchesKeyExceptScope(row, normalized.value))
      .map((row) => row.scope)
      .filter((scope) => scope === 'project' || scope === 'user'))]
      .sort(compareStrings);
    return Object.freeze({
      supportState: 'unsupported',
      reason: availableScopes.length > 0 ? 'scope-not-proven' : 'absent-capability-row',
      host: normalized.value.host,
      exactVersion: normalized.value.exactVersion,
      platform: normalized.value.platform,
      component: normalized.value.component,
      scope: normalized.value.scope,
      ...(availableScopes.length > 0
        ? { availableScopes: Object.freeze(availableScopes) }
        : {})
    });
  }

  const row = exactRows[0];
  if (!hasCompleteEvidence(row)) {
    return Object.freeze({
      supportState: 'unsupported',
      reason: 'evidence-incomplete',
      host: normalized.value.host,
      exactVersion: normalized.value.exactVersion,
      platform: normalized.value.platform,
      component: normalized.value.component,
      scope: normalized.value.scope
    });
  }

  return Object.freeze({
    supportState: 'supported',
    rowId: row.rowId,
    host: row.host,
    exactVersion: row.exactVersion,
    platform: row.platform,
    component: row.component,
    scope: row.scope,
    relativePath: row.relativePath,
    dialect: row.dialect,
    probe: row.probe,
    approvalBoundary: row.approvalBoundary,
    fixtureRevision: row.fixtureRevision,
    realHostEvidenceRevision: row.realHostEvidenceRevision
  });
}

export { normalizeRegistryTargets } from './shared-skill.js';

function createRegisteredAdapter(id, rawAdapter, matrix) {
  const managedTargets = new WeakSet();
  const plannedActions = new Map();
  const plannedTargets = new Map();

  async function capabilities(evidence, scope, context = {}) {
    const exactVersion = exactVersionFromEvidence(id, evidence);
    const platform = platformFromEvidence(evidence, context);
    return Object.freeze(['skill', 'mcp'].map((component) =>
      evaluateHostCapability(matrix, {
        host: id,
        exactVersion,
        platform,
        component,
        scope
      })
    ));
  }

  async function resolveTargets(selection = {}) {
    const scope = requireScope(selection.scope);
    const requested = normalizeRequestedComponents(selection.components);
    const evaluated = await capabilities(
      selection.hostEvidence ?? selection.evidence,
      scope,
      selection
    );
    const selectedCapabilities = evaluated.filter((row) => requested.includes(row.component));
    if (selectedCapabilities.length !== requested.length) {
      return registryRefusal('host_evidence_ambiguous', { host: id, scope });
    }
    const unsupported = selectedCapabilities.find((row) => row.supportState !== 'supported');
    if (unsupported) {
      return registryRefusal('host_capability_not_proven', {
        host: id,
        scope,
        component: unsupported.component,
        reason: unsupported.reason
      });
    }

    const rawSelection = {
      ...selection,
      scope,
      components: requested
    };
    if (id === 'visual-studio') {
      rawSelection.capabilities = Object.fromEntries(
        selectedCapabilities.map((row) => [row.component, row])
      );
    }
    const resolved = await rawAdapter.resolveTargets(rawSelection);
    if (!Array.isArray(resolved)) {
      return registryRefusal('host_target_resolution_invalid', { host: id });
    }
    const exactRows = new Map(selectedCapabilities.map((row) => [row.component, row]));
    const targets = resolved
      .filter((target) => target?.scope === scope && requested.includes(target?.component))
      .map((target) => {
        const component = target.component;
        const normalized = Object.freeze({
          ...target,
          host: id,
          hostId: target.hostId ?? target.host ?? id,
          targetId: target.targetId ?? `${id}:${scope}:${component}`,
          path: target.path ?? target.targetPath,
          ownershipBoundary: target.ownershipBoundary
            ?? (component === 'skill' ? 'launchdeck-agent' : target.dialect ?? 'launchdeck-mcp-entry'),
          ownership: target.ownership ?? 'launchdeck',
          matrixRevision: matrix.revision,
          capabilityRowId: exactRows.get(component)?.rowId
        });
        managedTargets.add(normalized);
        return normalized;
      });
    return Object.freeze(targets);
  }

  function requireManagedTarget(target) {
    if (!managedTargets.has(target)) {
      return registryRefusal('host_target_unregistered', { host: id });
    }
    return null;
  }

  function plannedTarget(target) {
    const registered = plannedTargets.get(target?.targetId);
    if (samePlannedTarget(registered, target)) return registered;
    for (const record of plannedActions.values()) {
      const candidate = record.target;
      if (samePlannedTarget(candidate, target)) return candidate;
    }
    return null;
  }

    return Object.freeze({
      id,
      detect: async (context = {}) => rawAdapter.detect(context),
      capabilities,
      resolveTargets,
    inspect: async (target, context = {}) => {
      const refusal = requireManagedTarget(target);
      return refusal ?? rawAdapter.inspect(target, context);
    },
    inspectPlanned: async (target, context = {}) => {
      const registered = plannedTarget(target);
      return registered
        ? rawAdapter.inspect(registered, context)
        : registryRefusal('host_target_unregistered', { host: id });
    },
      plan: async (target, desiredBuild = {}, context = {}) => {
        const refusal = requireManagedTarget(target);
        if (refusal) return refusal;
        const rawContext = id === 'codex'
          ? { ...context, ...desiredBuild }
          : context;
        const observation = await rawAdapter.inspect(target, rawContext);
        if (id === 'codex') {
          return normalizeRegisteredActionResult(
            id,
            target,
            await rawAdapter.plan(target, rawContext),
            { observation, plannedActions, plannedTargets, desiredBuild }
          );
        }
        if (id === 'visual-studio') {
          const visualTarget = desiredBuild?.mcpEntry
            ? { ...target, desiredEntry: desiredBuild.mcpEntry }
            : target;
          return normalizeRegisteredActionResult(
            id,
            target,
            await rawAdapter.plan(visualTarget, context),
            { observation, plannedActions, plannedTargets, desiredBuild }
          );
        }
        return normalizeRegisteredActionResult(
          id,
          target,
          await rawAdapter.plan(target, desiredBuild, context),
          { observation, plannedActions, plannedTargets, desiredBuild }
        );
      },
    backup: async (action, transaction, context = {}) => {
      const record = requirePlannedAction(id, action, plannedActions);
      return rawAdapter.backup(record.nativeAction, transaction, context);
    },
    apply: async (action, transaction, context = {}) => {
      const record = requirePlannedAction(id, action, plannedActions);
      const result = await rawAdapter.apply(record.nativeAction, transaction, context);
      return normalizeRegisteredEffect(record.action, result);
    },
    rollback: async (effectOrTransaction, backup, transaction, context = {}) => {
      const effect = effectOrTransaction?.effect ?? effectOrTransaction;
      const backupRef = backup ?? effectOrTransaction?.backupRef;
      const transactionContext = transaction
        ?? (effectOrTransaction?.effect ? effectOrTransaction : undefined);
      const record = requirePlannedEffect(id, effect, plannedActions);
      const rawEffect = {
        ...effect,
        path: record.action.targetPath,
        digest: record.action.desiredDigest
      };
      const result = await rawAdapter.rollback(
        rawEffect,
        materializeNativeBackup(backupRef),
        transactionContext,
        context
      );
      return normalizeRegisteredRollback(record.action, result);
      },
      verify: async (target, desiredBuild = {}, context = {}) => {
        const registeredTarget = managedTargets.has(target) ? target : plannedTarget(target);
        if (!registeredTarget) {
          return registryRefusal('host_target_unregistered', { host: id });
        }
        if (id === 'codex') {
          const buildIdentity = extractDesiredBuildIdentity(desiredBuild);
          return normalizeRegisteredVerification(
            id,
            registeredTarget,
            await rawAdapter.verify({
              ...context,
              target: registeredTarget,
              buildIdentity,
              desiredBuild: registeredTarget.component === 'skill'
                ? desiredBuild
                : buildIdentity,
              evidence: context.evidence ?? context.runtimeEvidence ?? {}
            })
          );
        }
        if (id === 'visual-studio') {
          return normalizeRegisteredVerification(
            id,
            registeredTarget,
            await rawAdapter.verify({
              target: registeredTarget,
              expectedBuildIdentity: extractDesiredBuildIdentity(desiredBuild),
              expectedRuntimeDigest: desiredBuild?.runtimeDigest,
              evidence: context.evidence ?? context.runtimeEvidence ?? {}
            })
          );
        }
        return normalizeRegisteredVerification(
          id,
          registeredTarget,
          await rawAdapter.verify(registeredTarget, desiredBuild, context)
        );
      },
      uninstall: async (target, receiptOwnership, context = {}) => {
        const refusal = requireManagedTarget(target);
        if (refusal) return refusal;
        const observation = await rawAdapter.inspect(target, context);
        return normalizeRegisteredActionResult(
          id,
          target,
          await rawAdapter.uninstall(target, receiptOwnership, context),
          { observation, plannedActions, plannedTargets }
        );
      }
    });
  }

function freezeMatrix(matrix) {
  if (!isPlainObject(matrix) || !Array.isArray(matrix.rows)) {
    throw new TypeError('Host compatibility matrix must contain rows.');
  }
  const clone = cloneJson(matrix);
  return deepFreeze(clone);
}

function normalizeCapabilityRequest(request) {
  const required = ['host', 'exactVersion', 'platform', 'component', 'scope'];
  const invalidFields = required.filter((field) => (
    typeof request?.[field] !== 'string' || request[field].trim().length === 0
  ));
  if (!['skill', 'mcp'].includes(request?.component) && !invalidFields.includes('component')) {
    invalidFields.push('component');
  }
  if (!['project', 'user'].includes(request?.scope) && !invalidFields.includes('scope')) {
    invalidFields.push('scope');
  }
  return {
    valid: invalidFields.length === 0,
    invalidFields,
    value: invalidFields.length === 0
      ? {
          host: request.host,
          exactVersion: request.exactVersion,
          platform: request.platform,
          component: request.component,
          scope: request.scope
        }
      : null
  };
}

function matchesExactKey(row, request) {
  return matchesKeyExceptScope(row, request) && row.scope === request.scope;
}

function matchesKeyExceptScope(row, request) {
  return row?.host === request.host
    && row?.exactVersion === request.exactVersion
    && row?.platform === request.platform
    && row?.component === request.component;
}

function hasCompleteEvidence(row) {
  return row?.supportState !== 'fixture-only'
    && nonEmptyString(row?.rowId)
    && nonEmptyString(row?.relativePath)
    && nonEmptyString(row?.dialect)
    && nonEmptyString(row?.probe)
    && nonEmptyString(row?.fixtureRevision)
    && nonEmptyString(row?.realHostEvidenceRevision);
}

function assertAdapterSurface(id, adapter) {
  const required = [
    'detect',
    'capabilities',
    'resolveTargets',
    'inspect',
    'plan',
    'backup',
    'apply',
    'rollback',
    'verify',
    'uninstall'
  ];
  const missing = required.filter((method) => typeof adapter?.[method] !== 'function');
  if (adapter?.id !== id || missing.length > 0) {
    throw new TypeError(`Host adapter '${id}' has an invalid surface: ${missing.join(', ')}`);
  }
}

function exactVersionFromEvidence(hostId, evidence) {
  const rows = Array.isArray(evidence)
    ? evidence
    : evidence && Array.isArray(evidence.evidence)
      ? evidence.evidence
      : [evidence];
  for (const row of rows) {
    if (!row) continue;
    if (hostId === 'visual-studio') {
      const version = row.semanticVersion
        ?? (typeof row.exactVersion === 'string' ? row.exactVersion.split('.').slice(0, 3).join('.') : null);
      if (nonEmptyString(version)) return version;
    }
    const version = row.version ?? row.exactVersion ?? row.semanticVersion;
    if (nonEmptyString(version)) return version;
  }
  return '';
}

function platformFromEvidence(evidence, context) {
  const rows = Array.isArray(evidence)
    ? evidence
    : evidence && Array.isArray(evidence.evidence)
      ? evidence.evidence
      : [evidence];
  return rows.find((row) => nonEmptyString(row?.platform))?.platform
    ?? context.platform
    ?? process.platform;
}

function requireScope(scope) {
  if (scope !== 'project' && scope !== 'user') {
    throw new TypeError("Registered host scope must be explicitly 'project' or 'user'.");
  }
  return scope;
}

function normalizeRequestedComponents(components) {
  if (!Array.isArray(components) || components.length === 0) {
    throw new TypeError('Registered host components must be explicitly selected.');
  }
  const normalized = [...new Set(components)];
  if (normalized.some((component) => !['skill', 'mcp'].includes(component))) {
    throw new TypeError('Registered host components must be skill or mcp.');
  }
  return normalized;
}

function registryRefusal(code, details = {}) {
  return Object.freeze({
    kind: 'refusal',
    code,
    effectCertainty: 'no-write',
    details: Object.freeze({ ...details })
  });
}

function normalizeRegisteredActionResult(id, target, result, context = {}) {
  if (result?.kind === 'refusal' || result?.status === 'refused') {
    return normalizeRegisteredRefusal(id, target, result);
  }

  if (id === 'visual-studio') {
    if (result?.kind === 'no-op') {
      return actionEnvelope(id, target, 'noop', [], {
        ownershipBoundary: result.ownershipBoundary ?? target.ownershipBoundary ?? null
      }, context);
    }
    if (['create', 'remove', 'install-skill'].includes(result?.kind)) {
      return actionEnvelope(id, target, 'planned', [result], {
        ownershipBoundary: result.ownershipBoundary ?? target.ownershipBoundary ?? null
      }, context);
    }
    return registryRefusal('host_action_result_invalid', { host: id, component: target.component });
  }

  if (result?.kind === 'actions') {
    return actionEnvelope(
      id,
      target,
      Array.isArray(result.actions) && result.actions.length === 0 ? 'noop' : 'planned',
      result.actions ?? [],
      result,
      context
    );
  }

  if (result && Array.isArray(result.actions) && typeof result.status === 'string') {
    return actionEnvelope(
      id,
      target,
      result.status === 'no-op' ? 'noop' : 'planned',
      result.actions,
      result,
      context
    );
  }

  return registryRefusal('host_action_result_invalid', { host: id, component: target.component });
}

function normalizeRegisteredVerification(id, target, result) {
  if (!isPlainObject(result)) {
    return Object.freeze({
      kind: 'verification',
      host: id,
      component: target.component,
      scope: target.scope,
      path: target.path,
      status: 'not-ready',
      ready: false,
      code: 'host_verification_result_invalid',
      buildIdentity: null,
      checks: Object.freeze([]),
      nativeStatus: null
    });
  }

  const status = result.status === 'pending-host-approval'
    ? 'pending-host-approval'
    : (result.status === 'ready' || result.ready === true || result.state === 'verified')
        ? 'ready'
        : 'not-ready';

  return deepFreeze({
    kind: 'verification',
    host: id,
    component: target.component,
    scope: target.scope,
    path: target.path,
    status,
    ready: status === 'ready',
    code: nonEmptyString(result.code) ? result.code : null,
    buildIdentity: extractVerificationBuildIdentity(result),
    checks: Array.isArray(result.checks) ? cloneJson(result.checks) : [],
    nativeStatus: result.status ?? result.state ?? null,
    approval: result.approval ?? null
  });
}

function normalizeRegisteredRefusal(id, target, result = {}) {
  const details = {
    host: id,
    component: target.component,
    scope: target.scope,
    path: target.path
  };
  for (const key of ['message', 'reason', 'approval', 'paths']) {
    if (result?.[key] !== undefined) details[key] = cloneJsonCompatible(result[key]);
  }
  if (isPlainObject(result.details)) {
    Object.assign(details, cloneJsonCompatible(result.details));
  }
  return Object.freeze({
    kind: 'refusal',
    code: nonEmptyString(result?.code) ? result.code : 'host_operation_refused',
    effectCertainty: result?.effectCertainty === 'no-write' ? 'no-write' : 'unknown',
    details: Object.freeze(details)
  });
}

function actionEnvelope(id, target, status, actions, metadata = {}, context = {}) {
  context.plannedTargets?.set(target.targetId, target);
  const normalizedActions = actions.map((action, index) =>
    normalizeRegisteredAction(
      id,
      target,
      action,
      index,
      metadata,
      context.observation,
      context.desiredBuild
    )
  );
  for (let index = 0; index < normalizedActions.length; index += 1) {
    const action = normalizedActions[index];
    context.plannedActions?.set(action.actionId, deepFreeze({
      action,
      nativeAction: cloneJsonCompatible(actions[index]),
      target
    }));
  }
  return deepFreeze({
    kind: 'actions',
    host: id,
    component: target.component,
    scope: target.scope,
    path: target.path,
    status,
    actions: normalizedActions,
    nativeStatus: metadata.status ?? metadata.kind ?? null,
    buildIdentity: metadata.buildIdentity ?? null,
    ownershipBoundary: metadata.ownershipBoundary ?? null
  });
}

function samePlannedTarget(candidate, target) {
  return candidate?.targetId === target?.targetId
    && candidate?.path === target?.path
    && candidate?.scope === target?.scope
    && candidate?.component === target?.component
    && candidate?.ownershipBoundary === target?.ownershipBoundary;
}

function normalizeRegisteredAction(
  id,
  target,
  nativeAction,
  index,
  metadata,
  observation,
  desiredBuild
) {
  if (!isPlainObject(nativeAction)) {
    throw hostProtocolError('host_action_result_invalid', id, target, 'Host action is invalid.');
  }
  const targetId = nonEmptyString(target.targetId)
    ? target.targetId
    : `${id}:${target.scope}:${target.component}`;
  const kind = firstText(nativeAction.kind, nativeAction.type);
  const targetPath = firstText(nativeAction.targetPath, nativeAction.path, target.path);
  const ownershipBoundary = normalizeOwnershipBoundary(
    nativeAction.ownershipBoundary
      ?? metadata.ownershipBoundary
      ?? nativeAction.ownedPath
      ?? metadata.ownedPath
      ?? target.ownershipBoundary
      ?? target.dialect
  );
  const preconditionDigest = firstDigest(
    nativeAction.preconditionDigest,
    metadata.preconditionDigest,
    observation?.documentDigest,
    observation?.digest,
    observation?.contentDigest,
    target.liveDigest
  ) ?? EMPTY_DIGEST;
  const desiredDigest = desiredDigestForAction(nativeAction, metadata, desiredBuild);
  if (!kind || !targetPath || !ownershipBoundary || !desiredDigest) {
    throw hostProtocolError(
      'host_action_result_invalid',
      id,
      target,
      `Host action at index ${index} cannot be represented as a canonical transaction action.`
    );
  }
  const identity = {
    host: id,
    targetId,
    kind,
    ownershipBoundary,
    targetPath,
    preconditionDigest,
    desiredDigest,
    index
  };
  return {
    actionId: `action_${digestHex(identity).slice(0, 32)}`,
    kind,
    targetId,
    ownershipBoundary,
    targetPath,
    preconditionDigest,
    desiredDigest,
    requiresBackup: nativeAction.requiresBackup === true
      || (nativeAction.requiresBackup !== false && observationRequiresBackup(observation, preconditionDigest))
  };
}

function desiredDigestForAction(action, metadata, desiredBuild) {
  const explicit = firstDigest(
    action.desiredDigest,
    action.contentDigest,
    metadata.desiredDigest,
    metadata.contentDigest
  );
  if (explicit) return explicit;
  for (const value of [action.source, action.rendered, action.content, metadata.source, metadata.rendered]) {
    if (typeof value === 'string' || Buffer.isBuffer(value)) return digestBytes(value);
  }
  if (String(action.kind ?? action.type ?? '').startsWith('remove')) return EMPTY_DIGEST;
  return firstDigest(
    action.buildIdentity,
    metadata.buildIdentity,
    typeof desiredBuild === 'string' ? desiredBuild : desiredBuild?.buildIdentity
  );
}

function observationRequiresBackup(observation, preconditionDigest) {
  if (preconditionDigest !== EMPTY_DIGEST) return true;
  if (observation?.exists === true) return true;
  if (['present', 'current', 'divergent'].includes(observation?.status ?? observation?.state)) {
    return true;
  }
  if (['absent', 'missing'].includes(observation?.status ?? observation?.state)) {
    return false;
  }
  return false;
}

function requirePlannedAction(id, action, plannedActions) {
  const record = plannedActions.get(action?.actionId);
  if (!record || record.action.targetId !== action?.targetId || !sameCanonicalAction(record.action, action)) {
    throw hostProtocolError(
      'host_action_unregistered',
      id,
      { component: String(action?.targetId ?? '').split(':')[2], scope: null, path: action?.targetPath },
      'Host action is not bound to an immutable registered plan.'
    );
  }
  return record;
}

function requirePlannedEffect(id, effect, plannedActions) {
  const record = plannedActions.get(effect?.actionId);
  if (
    !record
    || effect?.targetId !== record.action.targetId
    || effect?.ownershipBoundary !== record.action.ownershipBoundary
    || effect?.beforeDigest !== record.action.preconditionDigest
    || effect?.afterDigest !== record.action.desiredDigest
  ) {
    throw hostProtocolError(
      'host_effect_unregistered',
      id,
      { component: null, scope: null, path: null },
      'Host effect is not bound to an immutable registered action.',
      'unknown'
    );
  }
  return record;
}

function normalizeRegisteredEffect(action, result) {
  if (result?.kind === 'refusal' || result?.status === 'refused') {
    throw hostResultError(result, 'Host apply refused before producing a confirmed effect.');
  }
  if (isCanonicalEffect(result, action)) {
    return deepFreeze({
      effectId: result.effectId,
      actionId: action.actionId,
      targetId: action.targetId,
      ownershipBoundary: action.ownershipBoundary,
      effectType: result.effectType,
      beforeDigest: action.preconditionDigest,
      afterDigest: action.desiredDigest,
      effectCertainty: 'complete'
    });
  }
  const returnedDigest = firstDigest(result?.digest, result?.afterDigest);
  if (returnedDigest && returnedDigest !== action.desiredDigest) {
    throw hostProtocolError(
      'host_effect_digest_mismatch',
      action.targetId.split(':')[0],
      { component: action.targetId.split(':')[2], scope: action.targetId.split(':')[1], path: action.targetPath },
      'Host apply result does not match the approved desired digest.',
      'unknown'
    );
  }
  if (!['applied', 'succeeded', 'complete'].includes(result?.status) && result?.effectCertainty !== 'complete') {
    throw hostProtocolError(
      'host_effect_result_invalid',
      action.targetId.split(':')[0],
      { component: action.targetId.split(':')[2], scope: action.targetId.split(':')[1], path: action.targetPath },
      'Host apply did not return a recognized completed result.',
      'unknown'
    );
  }
  return deepFreeze({
    effectId: `effect_${action.actionId.slice('action_'.length)}`,
    actionId: action.actionId,
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    effectType: action.kind,
    beforeDigest: action.preconditionDigest,
    afterDigest: action.desiredDigest,
    effectCertainty: 'complete'
  });
}

function normalizeRegisteredRollback(action, result) {
  if (result?.kind === 'refusal' || result?.status === 'refused') {
    throw hostResultError(result, 'Host rollback refused before restoration was confirmed.', 'unknown');
  }
  const restored = result?.restored === true || result?.status === 'rolled-back';
  const verified = result?.verified === true || result?.status === 'rolled-back';
  const restoredDigest = firstDigest(result?.restoredDigest, result?.digest)
    ?? action.preconditionDigest;
  return deepFreeze({
    actionId: action.actionId,
    targetId: action.targetId,
    restored,
    restoredDigest,
    verified: verified && restoredDigest === action.preconditionDigest
  });
}

function materializeNativeBackup(backup) {
  if (backup?.existed === true || backup?.existed === false) return backup;
  if (nonEmptyString(backup?.backupPath) && fs.existsSync(backup.backupPath)) {
    const entry = fs.lstatSync(backup.backupPath);
    if (entry.isDirectory()) {
      return {
        ...backup,
        existed: true,
        kind: 'directory',
        sourceKind: 'directory',
        sourceDir: backup.backupPath,
        bytes: null
      };
    }
    return {
      ...backup,
      existed: true,
      bytes: fs.readFileSync(backup.backupPath)
    };
  }
  return {
    ...backup,
    existed: false,
    bytes: null
  };
}

function isCanonicalEffect(result, action) {
  return isPlainObject(result)
    && result.actionId === action.actionId
    && result.targetId === action.targetId
    && result.ownershipBoundary === action.ownershipBoundary
    && result.beforeDigest === action.preconditionDigest
    && result.afterDigest === action.desiredDigest
    && result.effectCertainty === 'complete'
    && nonEmptyString(result.effectId)
    && nonEmptyString(result.effectType);
}

function sameCanonicalAction(expected, actual) {
  const fields = [
    'actionId',
    'kind',
    'targetId',
    'ownershipBoundary',
    'targetPath',
    'preconditionDigest',
    'desiredDigest',
    'requiresBackup'
  ];
  return isPlainObject(actual) && fields.every((field) => actual[field] === expected[field]);
}

function normalizeOwnershipBoundary(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join('.');
  return nonEmptyString(value) ? value : null;
}

function firstText(...values) {
  return values.find((value) => nonEmptyString(value)) ?? null;
}

function firstDigest(...values) {
  return values.find((value) => typeof value === 'string' && DIGEST_PATTERN.test(value)) ?? null;
}

function digestBytes(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function digestHex(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hostProtocolError(code, id, target, message, effectCertainty = 'none') {
  return new AgentInstallerError(code, message, {
    effectCertainty,
    details: {
      host: id,
      component: target?.component ?? null,
      scope: target?.scope ?? null,
      path: target?.path ?? null
    }
  });
}

function hostResultError(result, message, effectCertainty = 'none') {
  return new AgentInstallerError(result?.code ?? 'host_operation_refused', result?.message ?? message, {
    effectCertainty,
    details: cloneJsonCompatible(result?.details ?? {})
  });
}

function extractDesiredBuildIdentity(desiredBuild) {
  if (typeof desiredBuild === 'string') return desiredBuild;
  return nonEmptyString(desiredBuild?.buildIdentity) ? desiredBuild.buildIdentity : null;
}

function extractVerificationBuildIdentity(result) {
  if (nonEmptyString(result?.buildIdentity)) return result.buildIdentity;
  return null;
}

function cloneJsonCompatible(value) {
  if (value === undefined) return undefined;
  return cloneJson(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
