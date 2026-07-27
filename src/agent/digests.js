import { createHash } from 'node:crypto';
import { AgentInstallerError } from './errors.js';

export function canonicalInstallerJson(value) {
  try {
    return JSON.stringify(toCanonicalValue(value, new Set(), '$'));
  } catch (error) {
    if (error instanceof AgentInstallerError) throw error;
    throw invalidDigestInput(error?.message ?? String(error));
  }
}

export function digestCanonical(value) {
  return `sha256:${createHash('sha256').update(canonicalInstallerJson(value)).digest('hex')}`;
}

function toCanonicalValue(value, ancestors, location) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalidDigestInput(`Non-finite number at ${location}.`);
    return value;
  }
  if (value === undefined) throw invalidDigestInput(`Undefined value at ${location}.`);
  if (typeof value !== 'object') {
    throw invalidDigestInput(`Unsupported ${typeof value} value at ${location}.`);
  }
  if (ancestors.has(value)) throw invalidDigestInput(`Circular value at ${location}.`);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => toCanonicalValue(entry, ancestors, `${location}[${index}]`));
    }
    const output = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = toCanonicalValue(value[key], ancestors, `${location}.${key}`);
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function invalidDigestInput(message) {
  return new AgentInstallerError(
    'agent_digest_input_invalid',
    'Installer digest input is invalid.',
    {
      effectCertainty: 'none',
      details: { reason: message }
    }
  );
}
