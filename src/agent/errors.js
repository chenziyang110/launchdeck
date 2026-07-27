import { redactInstallerValue } from './result.js';

const EFFECT_CERTAINTIES = new Set(['none', 'complete', 'partial', 'unknown']);

export class AgentInstallerError extends Error {
  constructor(code, message, options = {}) {
    super(String(message));
    this.name = 'AgentInstallerError';
    this.code = normalizeCode(code);
    this.effectCertainty = EFFECT_CERTAINTIES.has(options.effectCertainty)
      ? options.effectCertainty
      : 'unknown';
    this.details = options.details && typeof options.details === 'object'
      ? options.details
      : {};
    this.nextActions = Array.isArray(options.nextActions) ? options.nextActions : [];
  }
}

export function toInstallerErrorPayload(error) {
  const typed = error instanceof AgentInstallerError;
  const payload = {
    code: typed ? error.code : 'internal_error',
    message: typed ? error.message : (error?.message ?? 'Unexpected installer failure.'),
    effectCertainty: typed ? error.effectCertainty : 'unknown',
    details: typed ? error.details : {},
    nextActions: typed ? error.nextActions : []
  };
  return redactInstallerValue(payload);
}

function normalizeCode(value) {
  const code = String(value ?? '').trim();
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/.test(code)) {
    return 'internal_error';
  }
  return code;
}
