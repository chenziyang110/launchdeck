import path from 'node:path';
import { isTrustedCoexistenceEligibility } from './coexistence-gate.js';

const SHARED_SKILL_HOSTS = Object.freeze(['codex', 'github-copilot']);
const SHARED_SKILL_BOUNDARY = 'launchdeck-agent';

/**
 * Normalize targets without granting cross-host ownership implicitly.
 *
 * The only built-in deduplication is an exact Codex/Copilot Skill identity.
 * Shared Claude/Copilot MCP planning remains closed for the later,
 * evidence-gated coexistence module.
 */
export function normalizeRegistryTargets(targets, options = {}) {
  if (!Array.isArray(targets)) {
    throw new TypeError('Registry targets must be an array.');
  }

  const groups = new Map();
  for (const target of targets) {
    const normalized = normalizeTarget(target);
    const key = canonicalPathKey(normalized.path);
    const group = groups.get(key) ?? [];
    group.push(normalized);
    groups.set(key, group);
  }

  const resolved = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      resolved.push(freezeTarget(group[0]));
      continue;
    }

    if (group.every((target) => target.component === 'skill')
      && isExactSharedSkillHostSet(group)) {
      const canonical = canonicalSharedSkill(group);
      if (canonical.status === 'refused') return canonical;
      resolved.push(canonical);
      continue;
    }

    if (isClaudeCopilotSharedMcp(group)) {
      if (!isTrustedCoexistenceEligibility(options.eligibility)) {
        return refusal('shared_mcp_coexistence_not_proven');
      }
      const eligibility = options.eligibility;
      if (eligibility.hosts.some((host) => (
        !group.some((target) => target.host === host)
      ))
        || group.some((target) => (
          eligibility.exactVersions?.[target.host] !== target.exactVersion
        ))
        || group.some((target) => target.buildIdentity !== eligibility.buildIdentity)
        || group.some((target) => target.entryDigest !== eligibility.entryDigest)
        || group.some((target) => target.launcherPath !== eligibility.launcherPath)) {
        return refusal('shared_mcp_target_identity_mismatch');
      }
      resolved.push(Object.freeze({
        host: 'shared',
        hosts: Object.freeze([...eligibility.hosts]),
        component: 'mcp',
        scope: 'project',
        path: group.find((target) => target.host === 'claude-code').path,
        ownershipBoundary: 'mcpServers.launchdeck',
        pairId: eligibility.pairId,
        buildIdentity: eligibility.buildIdentity,
        entryDigest: eligibility.entryDigest,
        launcherPath: eligibility.launcherPath,
        matrixRevision: eligibility.matrixRevision,
        coexistenceRevision: eligibility.coexistenceRevision
      }));
      continue;
    }

    return refusal('duplicate_managed_target');
  }

  return Object.freeze({
    status: 'resolved',
    targets: Object.freeze(resolved)
  });
}

function canonicalSharedSkill(group) {
  const scopes = new Set(group.map((target) => target.scope));
  const digests = new Set(group.map((target) => target.contentDigest));
  const paths = new Set(group.map((target) => canonicalPathKey(target.path)));
  const canonicalSuffix = canonicalPathKey(
    path.join('.agents', 'skills', SHARED_SKILL_BOUNDARY),
    { relative: true }
  );
  const actualPath = canonicalPathKey(group[0].path);

  if (scopes.size !== 1
    || digests.size !== 1
    || !nonEmptyString(group[0].contentDigest)
    || paths.size !== 1
    || !actualPath.endsWith(canonicalSuffix)) {
    return refusal('shared_skill_content_mismatch');
  }

  return Object.freeze({
    host: 'shared',
    hosts: Object.freeze([...SHARED_SKILL_HOSTS]),
    component: 'skill',
    scope: group[0].scope,
    path: group[0].path,
    contentDigest: group[0].contentDigest,
    ownershipBoundary: SHARED_SKILL_BOUNDARY
  });
}

function isExactSharedSkillHostSet(group) {
  const hosts = [...new Set(group.map((target) => target.host))].sort(compareStrings);
  return group.length === SHARED_SKILL_HOSTS.length
    && hosts.length === SHARED_SKILL_HOSTS.length
    && hosts.every((host, index) => host === SHARED_SKILL_HOSTS[index]);
}

function isClaudeCopilotSharedMcp(group) {
  if (!group.every((target) => target.component === 'mcp' && target.scope === 'project')) {
    return false;
  }
  const hosts = [...new Set(group.map((target) => target.host))].sort(compareStrings);
  return hosts.length === 2
    && hosts[0] === 'claude-code'
    && hosts[1] === 'github-copilot';
}

function normalizeTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new TypeError('Every registry target must be an object.');
  }
  if (!nonEmptyString(target.host)
    || !['skill', 'mcp'].includes(target.component)
    || !['project', 'user'].includes(target.scope)
    || !nonEmptyString(target.path)) {
    throw new TypeError('Registry target requires host, component, scope, and path.');
  }
  return {
    ...target,
    path: path.resolve(target.path)
  };
}

function canonicalPathKey(targetPath, options = {}) {
  const normalized = options.relative
    ? path.normalize(targetPath)
    : path.resolve(targetPath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function freezeTarget(target) {
  const clone = { ...target };
  if (Array.isArray(clone.hosts)) clone.hosts = Object.freeze([...clone.hosts]);
  return Object.freeze(clone);
}

function refusal(code) {
  return Object.freeze({
    status: 'refused',
    code,
    effectCertainty: 'no-write'
  });
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
