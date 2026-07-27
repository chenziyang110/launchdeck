import path from 'node:path';
import { createHash } from 'node:crypto';
import { digestCanonical } from '../digests.js';
import { isTrustedCoexistenceEligibility } from './coexistence-gate.js';

const OWNED_PATH = Object.freeze(['mcpServers', 'launchdeck']);
const OWNERSHIP_BOUNDARY = 'mcpServers.launchdeck';

/**
 * Produce one narrow strict-JSON mutation for an already eligible shared pair.
 */
export function planSharedMcpJsonMutation({
  eligibility,
  sharedConfig,
  copilotConfig,
  desiredEntry,
  receiptOwnership
} = {}) {
  if (eligibility?.status !== 'eligible') {
    return refusal(eligibility?.code ?? 'shared_mcp_pair_not_proven');
  }
  if (!isTrustedCoexistenceEligibility(eligibility)) {
    return refusal('shared_mcp_eligibility_untrusted');
  }

  const shared = normalizeConfig(sharedConfig);
  const copilot = normalizeConfig(copilotConfig);
  if (!shared.valid || !copilot.valid) {
    return refusal('shared_mcp_config_malformed');
  }
  if (!canonicalWorkspacePaths(shared.path, copilot.path)) {
    return refusal('shared_mcp_target_mismatch');
  }
  if (!isJsonObject(desiredEntry)
    || !nonEmptyString(desiredEntry.command)
    || !path.isAbsolute(desiredEntry.command)
    || desiredEntry.command !== eligibility.launcherPath
    || !exactGeneratedArgs(desiredEntry.args, eligibility.buildIdentity)
    || !onlyGeneratedFields(desiredEntry)) {
    return refusal('shared_mcp_entry_invalid');
  }

  const desiredDigest = safeDigest(desiredEntry);
  if (!desiredDigest || desiredDigest !== eligibility.entryDigest) {
    return refusal('shared_mcp_entry_identity_mismatch');
  }
  if (!containsExactValue(desiredEntry, eligibility.buildIdentity)) {
    return refusal('shared_mcp_build_identity_mismatch');
  }

  const sharedEntry = shared.document.mcpServers?.launchdeck;
  const copilotEntry = copilot.document.mcpServers?.launchdeck;
  if (sharedEntry !== undefined && copilotEntry !== undefined) {
    return refusal('duplicate_launchdeck_workspace_entries');
  }
  if (copilotEntry !== undefined) {
    return refusal('copilot_native_launchdeck_conflict');
  }
  if (sharedEntry !== undefined) {
    const liveDigest = safeDigest(sharedEntry);
    if (!receiptOwnsSharedEntry(receiptOwnership, liveDigest)) {
      return refusal('shared_mcp_launchdeck_collision');
    }
    if (liveDigest === desiredDigest) {
      return Object.freeze({
        status: 'noop',
        ownershipBoundary: OWNERSHIP_BOUNDARY,
        actions: Object.freeze([])
      });
    }
  }

  const document = cloneJson(shared.document);
  document.mcpServers ??= {};
  document.mcpServers.launchdeck = cloneJson(desiredEntry);
  const action = Object.freeze({
    type: 'replace-json-file',
    path: shared.path,
    ownedPath: Object.freeze([...OWNED_PATH]),
    preconditionDigest: digestBytes(shared.source),
    content: `${JSON.stringify(document, null, 2)}\n`
  });

  return Object.freeze({
    status: 'planned',
    ownershipBoundary: OWNERSHIP_BOUNDARY,
    pairId: eligibility.pairId,
    buildIdentity: eligibility.buildIdentity,
    entryDigest: eligibility.entryDigest,
    actions: Object.freeze([action])
  });
}

function normalizeConfig(config) {
  if (!isJsonObject(config) || !nonEmptyString(config.path)) {
    return { valid: false };
  }
  if (typeof config.source !== 'string') return { valid: false };
  let document;
  try {
    document = config.source.trim() === '' ? {} : JSON.parse(config.source);
  } catch {
    return { valid: false };
  }
  if (config.document !== undefined) {
    try {
      if (digestCanonical(config.document) !== digestCanonical(document)) return { valid: false };
    } catch {
      return { valid: false };
    }
  }
  if (!isJsonObject(document)
    || (document.mcpServers !== undefined && !isJsonObject(document.mcpServers))
    || (document.mcpServers?.launchdeck !== undefined
      && !isJsonObject(document.mcpServers.launchdeck))) {
    return { valid: false };
  }
  return {
    valid: true,
    path: path.resolve(config.path),
    document: cloneJson(document),
    source: config.source
  };
}

function canonicalWorkspacePaths(sharedPath, copilotPath) {
  const projectRoot = path.dirname(sharedPath);
  return samePath(sharedPath, path.join(projectRoot, '.mcp.json'))
    && samePath(copilotPath, path.join(projectRoot, '.github', 'mcp.json'));
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function receiptOwnsSharedEntry(ownership, liveDigest) {
  return ownership?.owner === 'launchdeck-agent-installer'
    && Array.isArray(ownership.ownedPath)
    && ownership.ownedPath.length === OWNED_PATH.length
    && ownership.ownedPath.every((part, index) => part === OWNED_PATH[index])
    && nonEmptyString(ownership.liveDigest)
    && ownership.liveDigest === liveDigest;
}

function containsExactValue(value, expected) {
  if (!nonEmptyString(expected)) return false;
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((entry) => containsExactValue(entry, expected));
  if (!isJsonObject(value)) return false;
  return Object.values(value).some((entry) => containsExactValue(entry, expected));
}

function exactGeneratedArgs(args, buildIdentity) {
  return Array.isArray(args)
    && args.length === 3
    && args[0] === 'serve'
    && args[1] === '--build'
    && args[2] === buildIdentity;
}

function onlyGeneratedFields(entry) {
  const keys = Object.keys(entry).sort();
  return keys.every((key) => ['args', 'command', 'env'].includes(key))
    && keys.includes('args')
    && keys.includes('command')
    && (entry.env === undefined || isJsonObject(entry.env));
}

function digestBytes(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function safeDigest(value) {
  try {
    return digestCanonical(value);
  } catch {
    return null;
  }
}

function refusal(code) {
  return Object.freeze({
    status: 'refused',
    code,
    effectCertainty: 'no-write'
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
