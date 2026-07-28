const OUTCOME_CERTAINTY = Object.freeze({
  planned: 'none',
  cancelled: 'none',
  noop: 'none',
  succeeded: 'complete',
  refused: 'none',
  'failed-and-rolled-back': 'complete',
  partial: 'partial',
  indeterminate: 'unknown',
  reconciled: 'complete'
});
const FAILURE_OUTCOMES = new Set([
  'refused',
  'failed-and-rolled-back',
  'partial',
  'indeterminate'
]);
const SECRET_KEY_PATTERN = /(?:authorization|cookie|credential|password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|raw[_-]?config|config[_-]?body|headers?|env(?:ironment)?)/i;
const SECRET_VALUE_PATTERN = /(?:bearer\s+[^\s]+|(?:^|[^a-z])(?:sk[-_][a-z0-9_-]+|[a-z0-9_-]*(?:token|secret|password|credential|api[_-]?key)[a-z0-9_-]*)(?:$|[^a-z0-9]))/i;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function redactInstallerValue(value, key = '', seen = new Map()) {
  if (key && SECRET_KEY_PATTERN.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    return SECRET_VALUE_PATTERN.test(value) ? '[REDACTED]' : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[REDACTED]';

  const output = Array.isArray(value) ? [] : {};
  seen.set(value, output);
  if (Array.isArray(value)) {
    for (const entry of value) output.push(redactInstallerValue(entry, '', seen));
  } else {
    for (const [entryKey, entryValue] of Object.entries(value)) {
      output[entryKey] = redactInstallerValue(entryValue, entryKey, seen);
    }
  }
  return deepFreeze(output);
}

export function normalizeInstallerResult(input = {}) {
  const outcome = String(input.outcome ?? '');
  const expectedCertainty = OUTCOME_CERTAINTY[outcome];
  if (!expectedCertainty || input.effectCertainty !== expectedCertainty) {
    throw resultError(
      `Outcome '${outcome}' requires effect certainty '${expectedCertainty ?? 'valid'}'.`
    );
  }
  const error = input.error === null || input.error === undefined
    ? null
    : normalizeError(input.error);
  if (FAILURE_OUTCOMES.has(outcome) !== (error !== null)) {
    throw resultError(`Outcome '${outcome}' has an invalid error shape.`);
  }

  const effects = requireArray(input.effects, 'effects');
  const targets = requireArray(input.targets, 'targets');
  const health = requireArray(input.health, 'health');
  const nextActions = requireArray(input.nextActions, 'nextActions');
  if (expectedCertainty === 'none' && effects.length !== 0) {
    throw resultError(`Outcome '${outcome}' cannot report effects.`);
  }
  const operationId = normalizeNullableText(input.operationId);
  const receiptId = normalizeNullableText(input.receiptId);
  if (outcome !== 'succeeded' && receiptId !== null) {
    throw resultError(`Outcome '${outcome}' cannot commit a receipt.`);
  }
  const prePlanRefusal = isPrePlanRefusalShape({
    outcome,
    effectCertainty: expectedCertainty,
    operationId,
    receiptId,
    planDigest: input.planDigest,
    targets,
    effects
  });

  const normalized = {
    outcome,
    effectCertainty: expectedCertainty,
    scope: requireScope(input.scope),
    projectIdentity: normalizeNullableText(input.projectIdentity),
    buildIdentity: prePlanRefusal
      ? normalizeNullableDigest(input.buildIdentity, 'buildIdentity')
      : requireDigest(input.buildIdentity, 'buildIdentity'),
    entrypoints: normalizeEntrypoints(input.entrypoints, {
      scope: input.scope,
      buildIdentity: input.buildIdentity
    }),
    operationId,
    planDigest: prePlanRefusal
      ? normalizeNullPlanDigest(input.planDigest, 'planDigest')
      : requireDigest(input.planDigest, 'planDigest'),
    receiptId,
    targets: redactInstallerValue(targets),
    health: redactInstallerValue(health),
    effects: redactInstallerValue(effects),
    nextActions: redactInstallerValue(nextActions),
    error
  };
  return deepFreeze(normalized);
}

function normalizeEntrypoints(value, expected) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw resultError('entrypoints must be an object or null.');
  }
  if (value.scope !== expected.scope || value.buildIdentity !== expected.buildIdentity) {
    throw resultError('entrypoints must match the installer scope and build identity.');
  }
  for (const key of ['cli', 'mcp']) normalizeEntrypoint(value[key], key, expected.buildIdentity);
  if (expected.buildIdentity === null) {
    if (value.runtime !== null) throw resultError('entrypoints.runtime must be null without a build identity.');
  } else {
    normalizeEntrypoint(value.runtime, 'runtime', expected.buildIdentity);
  }
  return redactInstallerValue(value);
}

function normalizeEntrypoint(value, label, buildIdentity) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw resultError(`entrypoints.${label} must be an object.`);
  }
  requireText(value.path, `entrypoints.${label}.path`);
  if (value.buildIdentity !== buildIdentity) {
    throw resultError(`entrypoints.${label}.buildIdentity must match the installer build identity.`);
  }
  if (typeof value.exists !== 'boolean') {
    throw resultError(`entrypoints.${label}.exists must be boolean.`);
  }
  if (label !== 'runtime') {
    requireText(value.command, `entrypoints.${label}.command`);
    if (!Array.isArray(value.args) || value.args.some((entry) => typeof entry !== 'string')) {
      throw resultError(`entrypoints.${label}.args must be a string array.`);
    }
  }
}

export function createInstallerExecutionEnvelope(command, input) {
  const result = normalizeInstallerResult(input);
  return deepFreeze({
    schemaVersion: 1,
    ok: !FAILURE_OUTCOMES.has(result.outcome),
    command: requireText(command, 'command'),
    result
  });
}

function normalizeError(error) {
  if (!error || typeof error !== 'object' || Array.isArray(error)) {
    throw resultError('Installer error must be an object.');
  }
  return redactInstallerValue({
    code: requireText(error.code, 'error.code'),
    message: requireText(error.message, 'error.message'),
    details: error.details && typeof error.details === 'object' ? error.details : {}
  });
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw resultError(`${label} must be an array.`);
  return structuredClone(value);
}

function requireScope(value) {
  if (!['project', 'user'].includes(value)) throw resultError('scope is invalid.');
  return value;
}

function requireDigest(value, label) {
  const normalized = String(value ?? '');
  if (!DIGEST_PATTERN.test(normalized)) throw resultError(`${label} is invalid.`);
  return normalized;
}

function normalizeNullableDigest(value, label) {
  if (value === null || value === undefined) return null;
  return requireDigest(value, label);
}

function normalizeNullPlanDigest(value, label) {
  if (value === null || value === undefined) return null;
  throw resultError(`${label} must be null for a pre-plan refusal.`);
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw resultError(`${label} is required.`);
  return normalized;
}

function normalizeNullableText(value) {
  if (value === null || value === undefined) return null;
  return requireText(value, 'value');
}

function resultError(message) {
  const error = new Error(message);
  error.name = 'AgentInstallerResultError';
  error.code = 'agent_result_invalid';
  return error;
}

function isPrePlanRefusalShape({
  outcome,
  effectCertainty,
  operationId,
  receiptId,
  planDigest,
  targets,
  effects
}) {
  return outcome === 'refused'
    && effectCertainty === 'none'
    && operationId === null
    && receiptId === null
    && (planDigest === null || planDigest === undefined)
    && targets.length === 0
    && effects.length === 0;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
