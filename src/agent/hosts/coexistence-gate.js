import path from 'node:path';

const CLAUDE = 'claude-code';
const COPILOT = 'github-copilot';
const SHARED_HOSTS = Object.freeze([CLAUDE, COPILOT]);
const SHARED_CONFIG = '.mcp.json';
const SHARED_DIALECT = 'mcpServers.launchdeck';
const trustedEligibility = new WeakSet();

export function createClaudeCopilotCoexistenceGate({
  coexistence,
  matrixRevision
} = {}) {
  const authority = Object.freeze({
    coexistence: cloneJson(coexistence ?? { enabled: false, provenPairs: [] }),
    matrixRevision: String(matrixRevision ?? '')
  });
  return Object.freeze({
    evaluate(request = {}) {
      const result = evaluateInternal({
        ...request,
        coexistence: authority.coexistence,
        matrixRevision: authority.matrixRevision
      });
      if (result.status === 'eligible') trustedEligibility.add(result);
      return result;
    }
  });
}

/**
 * Decide shared-root eligibility from one exact, maintained version pair.
 */
export function evaluateClaudeCopilotCoexistence({
  coexistence,
  hosts,
  platform,
  scope,
  matrixRevision
} = {}) {
  return evaluateInternal({ coexistence, hosts, platform, scope, matrixRevision });
}

export function isTrustedCoexistenceEligibility(value) {
  return value !== null && typeof value === 'object' && trustedEligibility.has(value);
}

function evaluateInternal({
  coexistence,
  hosts,
  platform,
  scope,
  matrixRevision
}) {
  const hostMap = normalizeHostEvidence(hosts);
  if (!hostMap) return refusal('shared_mcp_hosts_incomplete');
  if (scope !== 'project') return refusal('shared_mcp_scope_not_proven');
  if (!nonEmptyString(platform)) return refusal('shared_mcp_platform_ambiguous');
  if (!nonEmptyString(matrixRevision)) return refusal('shared_mcp_matrix_revision_missing');
  if (coexistence?.enabled !== true || !Array.isArray(coexistence?.provenPairs)) {
    return refusal('shared_mcp_pair_not_proven');
  }

  const claude = hostMap.get(CLAUDE);
  const copilot = hostMap.get(COPILOT);
  const pair = coexistence.provenPairs.find((candidate) => (
    candidate?.platform === platform
    && candidate?.scope === scope
    && candidate?.claudeVersion === claude.exactVersion
    && candidate?.copilotVersion === copilot.exactVersion
  ));
  if (!pair || !completePairEvidence(pair)) {
    return refusal('shared_mcp_pair_not_proven');
  }
  if (pair.configPath !== SHARED_CONFIG || pair.dialect !== SHARED_DIALECT) {
    return refusal('shared_mcp_pair_contradictory');
  }
  if (!nonEmptyString(claude.buildIdentity)
    || claude.buildIdentity !== copilot.buildIdentity) {
    return refusal('shared_mcp_build_identity_mismatch');
  }
  if (!nonEmptyString(claude.entryDigest)
    || claude.entryDigest !== copilot.entryDigest) {
    return refusal('shared_mcp_entry_identity_mismatch');
  }
  if (!nonEmptyString(claude.launcherPath)
    || !path.isAbsolute(claude.launcherPath)
    || claude.launcherPath !== copilot.launcherPath) {
    return refusal('shared_mcp_launcher_identity_mismatch');
  }

  return Object.freeze({
    status: 'eligible',
    pairId: pair.pairId,
    platform,
    scope,
    configPath: SHARED_CONFIG,
    dialect: SHARED_DIALECT,
    buildIdentity: claude.buildIdentity,
    entryDigest: claude.entryDigest,
    launcherPath: claude.launcherPath,
    hosts: Object.freeze([...SHARED_HOSTS]),
    exactVersions: Object.freeze({
      [CLAUDE]: claude.exactVersion,
      [COPILOT]: copilot.exactVersion
    }),
    matrixRevision,
    coexistenceRevision: coexistence.revision,
    fixtureRevision: pair.fixtureRevision,
    realHostEvidenceRevision: pair.realHostEvidenceRevision,
    evidenceRevision: pair.evidenceRevision
  });
}

/**
 * Resolve only the canonical native or proven shared project target.
 */
export function resolveClaudeCopilotProjectMcpTarget({
  projectRoot,
  hosts,
  eligibility
} = {}) {
  if (!nonEmptyString(projectRoot)) {
    return refusal('shared_mcp_project_root_missing');
  }
  const selected = normalizeSelectedHosts(hosts);
  if (!selected) return refusal('shared_mcp_hosts_unsupported');
  const root = path.resolve(projectRoot);

  if (selected.length === 1 && selected[0] === CLAUDE) {
    return Object.freeze({
      host: CLAUDE,
      hosts: Object.freeze([CLAUDE]),
      component: 'mcp',
      scope: 'project',
      path: path.join(root, SHARED_CONFIG),
      dialect: SHARED_DIALECT,
      shared: false
    });
  }
  if (selected.length === 1 && selected[0] === COPILOT) {
    return Object.freeze({
      host: COPILOT,
      hosts: Object.freeze([COPILOT]),
      component: 'mcp',
      scope: 'project',
      path: path.join(root, '.github', 'mcp.json'),
      dialect: SHARED_DIALECT,
      shared: false
    });
  }
  if (selected.length === SHARED_HOSTS.length
    && selected.every((host, index) => host === SHARED_HOSTS[index])) {
    if (!isTrustedCoexistenceEligibility(eligibility)
      || eligibility?.status !== 'eligible'
      || eligibility.configPath !== SHARED_CONFIG
      || eligibility.dialect !== SHARED_DIALECT) {
      return refusal(
        eligibility?.status === 'refused'
          ? eligibility.code
          : 'shared_mcp_eligibility_untrusted'
      );
    }
    return Object.freeze({
      host: 'shared',
      hosts: Object.freeze([...SHARED_HOSTS]),
      component: 'mcp',
      scope: 'project',
      path: path.join(root, SHARED_CONFIG),
      dialect: SHARED_DIALECT,
      shared: true,
      pairId: eligibility.pairId,
      buildIdentity: eligibility.buildIdentity,
      entryDigest: eligibility.entryDigest,
      launcherPath: eligibility.launcherPath,
      matrixRevision: eligibility.matrixRevision
    });
  }
  return refusal('shared_mcp_hosts_unsupported');
}

function normalizeHostEvidence(hosts) {
  if (!Array.isArray(hosts) || hosts.length !== SHARED_HOSTS.length) return null;
  const map = new Map();
  for (const evidence of hosts) {
    if (!evidence || !SHARED_HOSTS.includes(evidence.host) || map.has(evidence.host)) {
      return null;
    }
    if (!nonEmptyString(evidence.exactVersion)) return null;
    map.set(evidence.host, evidence);
  }
  return map.size === SHARED_HOSTS.length ? map : null;
}

function normalizeSelectedHosts(hosts) {
  if (!Array.isArray(hosts)
    || hosts.length === 0
    || hosts.some((host) => !SHARED_HOSTS.includes(host))
    || new Set(hosts).size !== hosts.length) {
    return null;
  }
  return [...hosts].sort(compareStrings);
}

function completePairEvidence(pair) {
  return nonEmptyString(pair?.pairId)
    && nonEmptyString(pair?.fixtureRevision)
    && nonEmptyString(pair?.realHostEvidenceRevision)
    && nonEmptyString(pair?.evidenceRevision);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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
