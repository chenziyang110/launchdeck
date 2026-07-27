import fs from 'node:fs';
import path from 'node:path';
import { digestCanonical } from '../digests.js';
import { AgentInstallerError } from '../errors.js';

export function resolveInstallationScope(input = {}) {
  if (!isCanonicalPlainObject(input)) {
    throw scopeError('agent_scope_invalid', 'Scope reference must be a plain object.');
  }
  if (input.scope === 'project') return resolveProjectScope(input);
  if (input.scope === 'user') return resolveUserScope(input);
  throw scopeError('agent_scope_invalid', "scope must be 'project' or 'user'.");
}

export function resolveInstallationScopeReference(input = {}, env = process.env) {
  const scope = input.scope === 'user' ? 'user' : 'project';
  if (scope === 'project') {
    const resolved = resolveInstallationScope({
      scope,
      projectRoot: input.projectRoot ?? input.projectIdentity
    });
    assertSuppliedScopeIdentity(input.scopeIdentity, resolved.scopeIdentity);
    return resolved;
  }

  const userHome = input.userHome
    ?? input.homeDir
    ?? input.env?.HOME
    ?? input.env?.USERPROFILE
    ?? env?.HOME
    ?? env?.USERPROFILE;
  if (userHome) {
    const resolved = resolveInstallationScope({ scope, userHome });
    assertSuppliedScopeIdentity(input.scopeIdentity, resolved.scopeIdentity);
    return resolved;
  }
  if (/^user:sha256:[0-9a-f]{64}$/.test(input.scopeIdentity ?? '')) {
    return Object.freeze({
      scope,
      projectIdentity: null,
      scopeIdentity: input.scopeIdentity
    });
  }
  return resolveInstallationScope({ scope, userHome });
}

function resolveProjectScope(input) {
  const projectRoot = normalizedPath(input.projectRoot);
  if (!projectRoot) {
    throw scopeError(
      'agent_project_identity_required',
      'Project scope requires an explicit project root.'
    );
  }
  const projectIdentity = projectRoot;
  return Object.freeze({
    scope: 'project',
    projectIdentity,
    scopeIdentity: `project:${digestCanonical({
      projectIdentity: identityPath(projectIdentity)
    })}`
  });
}

function assertSuppliedScopeIdentity(supplied, resolved) {
  if (supplied !== undefined && supplied !== null && supplied !== resolved) {
    throw scopeError(
      'agent_scope_identity_invalid',
      'Supplied scope identity does not match the canonical installation scope.'
    );
  }
}

function resolveUserScope(input) {
  if (input.projectRoot !== undefined && input.projectRoot !== null) {
    throw scopeError(
      'agent_project_identity_forbidden',
      'User scope cannot carry project identity.'
    );
  }
  const userHome = normalizedPath(
    input.userHome
      ?? input.env?.HOME
      ?? input.env?.USERPROFILE
  );
  if (!userHome) {
    throw scopeError(
      'agent_user_identity_required',
      'User scope requires an explicit user home.'
    );
  }
  return Object.freeze({
    scope: 'user',
    projectIdentity: null,
    scopeIdentity: `user:${digestCanonical({
      userIdentity: identityPath(userHome)
    })}`
  });
}

function normalizedPath(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  const resolved = path.resolve(text);
  try {
    return fs.realpathSync.native(resolved);
  } catch (error) {
    throw scopeError(
      'agent_scope_identity_invalid',
      `Scope identity path cannot be resolved: ${resolved}`,
      { causeCode: error?.code }
    );
  }
}

function identityPath(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function scopeError(code, message, details = undefined) {
  return new AgentInstallerError(code, message, {
    effectCertainty: 'none',
    details
  });
}

function isCanonicalPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}
