import { createHash } from 'node:crypto';
import semver from 'semver';
import { z } from 'zod';

export const COMPATIBILITY_VERSION_AXES = Object.freeze([
  'agentProtocol',
  'cliSchema',
  'configSchema',
  'registryState',
  'runtimeState',
  'runIndex',
  'lockRecord',
  'eventSchema',
  'operationJournal',
  'operationCatalog',
  'skillContract',
  'pluginBundleFormat',
  'codexHostManifest',
  'claudeHostManifest'
]);

const sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const versionAxisSchema = z.strictObject({
  current: z.union([z.number().int().nonnegative(), z.string().min(1)]),
  readRange: z.string().min(1),
  writeRange: z.string().min(1)
});
const operationNameSchema = z.string().regex(/^[a-z][a-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/);
const uniqueStringsSchema = z.array(z.string()).refine((values) => new Set(values).size === values.length, {
  message: 'Values must be unique.'
});
const hostArtifactSchema = z.strictObject({
  artifactId: z.string().min(1),
  manifestVersion: z.union([z.number().int(), z.string()]),
  integrityDigest: sha256Schema
});

const compatibilityManifestSchema = z.strictObject({
  manifestVersion: z.number().int().min(1),
  buildIdentity: sha256Schema,
  packageVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/),
  nodeRange: z.string().min(1),
  versions: z.strictObject(Object.fromEntries(
    COMPATIBILITY_VERSION_AXES.map((axis) => [axis, versionAxisSchema])
  )),
  componentDigests: z.record(z.string(), sha256Schema).superRefine((value, context) => {
    const required = [
      'runtimeBundle',
      'operationRegistry',
      'operationSchemas',
      'agentResultSchema',
      'canonicalSkillContentManifest'
    ];
    if (Object.keys(value).length < 5) {
      context.addIssue({ code: 'custom', message: 'At least five component digests are required.' });
    }
    for (const key of required) {
      if (!Object.hasOwn(value, key)) {
        context.addIssue({ code: 'custom', path: [key], message: `Missing component digest ${key}.` });
      }
    }
  }),
  supportedOperations: z.strictObject({
    registryDigest: sha256Schema,
    schemaDigest: sha256Schema,
    cliOperations: z.array(operationNameSchema).refine(isUnique, { message: 'CLI operations must be unique.' }),
    agentOperations: z.array(operationNameSchema).refine(isUnique, { message: 'Agent operations must be unique.' }),
    maxAgentRisk: z.literal('low')
  }),
  hostArtifacts: z.strictObject({
    codex: hostArtifactSchema,
    claude: hostArtifactSchema
  }),
  migrationCapabilities: z.strictObject({
    readable: uniqueStringsSchema,
    writable: uniqueStringsSchema,
    diagnosticOnly: uniqueStringsSchema
  })
});

export function canonicalJson(value) {
  return JSON.stringify(toCanonicalValue(value, new Set()));
}

export function canonicalDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function computeBuildIdentity(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('Compatibility manifest must be an object.');
  }
  const { buildIdentity: _ignored, ...identityInput } = manifest;
  return canonicalDigest(identityInput);
}

export function validateCompatibilityManifest(value) {
  const parsed = compatibilityManifestSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data, errors: [] };
  return { ok: false, errors: formatIssues(parsed.error.issues) };
}

export function assessCompatibility(localManifest, observedManifest) {
  const local = requireValidManifest(localManifest, 'local');
  const observed = requireValidManifest(observedManifest, 'observed');
  const axes = {};

  for (const axis of COMPATIBILITY_VERSION_AXES) {
    const localAxis = local.versions[axis];
    const observedAxis = observed.versions[axis];
    const readable = satisfiesRange(observedAxis.current, localAxis.readRange);
    const writable = readable
      && satisfiesRange(observedAxis.current, localAxis.writeRange)
      && satisfiesRange(localAxis.current, observedAxis.writeRange);
    axes[axis] = Object.freeze({
      localCurrent: localAxis.current,
      observedCurrent: observedAxis.current,
      readable,
      writable
    });
  }

  const values = Object.values(axes);
  const components = assessComponents(local.componentDigests, observed.componentDigests);
  const componentValues = Object.values(components);
  const canRead = values.every((axis) => axis.readable);
  const canWrite = values.every((axis) => axis.writable)
    && componentValues.every((component) => component.matches)
    && local.supportedOperations.registryDigest === observed.supportedOperations.registryDigest
    && local.supportedOperations.schemaDigest === observed.supportedOperations.schemaDigest;
  return Object.freeze({
    axes: Object.freeze(axes),
    components: Object.freeze(components),
    canRead,
    canWrite,
    diagnosticOnly: !canWrite
  });
}

export function evaluateCompatibilityGate(definition, assessment) {
  const diagnosticOperation = ['capabilities.get', 'system.diagnose'].includes(definition?.name);
  if (diagnosticOperation) {
    return Object.freeze({
      allowed: true,
      code: assessment?.canWrite ? 'compatible' : 'diagnostic_only',
      diagnosticOnly: assessment?.canWrite !== true
    });
  }
  if (definition?.kind === 'mutation' || definition?.kind === 'recovery') {
    if (assessment?.canWrite !== true) {
      return Object.freeze({ allowed: false, code: 'compatibility_mismatch', diagnosticOnly: true });
    }
  } else if (assessment?.canRead !== true) {
    return Object.freeze({ allowed: false, code: 'compatibility_mismatch', diagnosticOnly: true });
  }
  return Object.freeze({ allowed: true, code: 'compatible', diagnosticOnly: false });
}

function requireValidManifest(value, label) {
  const validation = validateCompatibilityManifest(value);
  if (!validation.ok) {
    throw new TypeError(`Invalid ${label} compatibility manifest: ${JSON.stringify(validation.errors)}`);
  }
  return validation.value;
}

function assessComponents(localDigests, observedDigests) {
  const components = {};
  const names = new Set([...Object.keys(localDigests), ...Object.keys(observedDigests)]);
  for (const name of [...names].sort()) {
    const localDigest = localDigests[name] ?? null;
    const observedDigest = observedDigests[name] ?? null;
    components[name] = Object.freeze({
      localDigest,
      observedDigest,
      matches: localDigest !== null && localDigest === observedDigest
    });
  }
  return components;
}

function satisfiesRange(current, range) {
  const version = normalizeVersion(current);
  return version !== null && semver.satisfies(version, range, { includePrerelease: true });
}

function normalizeVersion(value) {
  if (typeof value === 'number') return `${value}.0.0`;
  if (semver.valid(value)) return value;
  return semver.coerce(value)?.version ?? null;
}

function toCanonicalValue(value, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON does not support non-finite numbers.');
    return value;
  }
  if (typeof value !== 'object') throw new TypeError(`Canonical JSON does not support ${typeof value}.`);
  if (ancestors.has(value)) throw new TypeError('Canonical JSON does not support circular values.');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => toCanonicalValue(item, ancestors));
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) output[key] = toCanonicalValue(value[key], ancestors);
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function formatIssues(issues) {
  return issues.map((issue) => ({
    path: issue.path.length === 0 ? '$' : `$.${issue.path.join('.')}`,
    code: issue.code,
    message: issue.message
  }));
}

function isUnique(values) {
  return new Set(values).size === values.length;
}
