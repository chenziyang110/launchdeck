import path from 'node:path';
import {
  getLiveness,
  getProcessEvidence,
  normalizePid
} from '../adapters/process.js';

export const OWNERSHIP_CONFIDENCE = Object.freeze({
  VERIFIED_OWNED: 'verified-owned',
  PROBABLE_OWNED: 'probable-owned',
  STALE_OWNED: 'stale-owned',
  EXTERNAL: 'external',
  UNKNOWN: 'unknown'
});

const UNAVAILABLE = 'unavailable';

export function proveRunOwnership(run, options = {}) {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const listeners = Array.isArray(options.listeners) ? options.listeners : [];
  const processEvidence = options.processEvidence ?? evidenceForRun(run, options);
  const portEvidence = listeners.map((listener) => portOwnershipEvidence(listener, run));
  const reasons = [];

  if (!run) {
    const confidence = listeners.length > 0 && listeners.every((listener) => Number.isInteger(listener.pid))
      ? OWNERSHIP_CONFIDENCE.EXTERNAL
      : OWNERSHIP_CONFIDENCE.UNKNOWN;
    return {
      confidence,
      pidMatchesRun: false,
      processAlive: false,
      cwdMatches: UNAVAILABLE,
      commandMatches: UNAVAILABLE,
      envMarkerMatches: UNAVAILABLE,
      startTimeMatches: UNAVAILABLE,
      portEvidence,
      checkedAt,
      reasons: confidence === OWNERSHIP_CONFIDENCE.EXTERNAL
        ? ['no_run_record', 'listener_has_pid']
        : ['no_run_record', 'listener_pid_unavailable']
    };
  }

  const runPid = normalizePid(run.pid, { allowMissing: true });
  if (runPid === undefined) {
    return unknownProof({
      checkedAt,
      listeners,
      portEvidence,
      processAlive: false,
      reasons: ['run_pid_missing']
    });
  }

  const listenerPids = listeners
    .map((listener) => normalizePid(listener.pid, { allowMissing: true }))
    .filter((pid) => pid !== undefined);
  const hasListenerWithoutPid = listeners.some((listener) => normalizePid(listener.pid, { allowMissing: true }) === undefined);
  const pidMatchesRun = listenerPids.includes(runPid);
  const listenerPidMismatch = listenerPids.length > 0 && !pidMatchesRun;
  const processAlive = processEvidence?.alive ?? getLiveness(runPid) === 'running';
  const cwdMatches = comparePathEvidence(processEvidence?.cwd, run.cwd);
  const commandMatches = compareCommandEvidence(processEvidence?.command, run.command);
  const envMarkerMatches = compareValueEvidence(processEvidence?.env?.LAUNCHDECK_RUN_ID, run.runId);
  const startTimeMatches = compareValueEvidence(processEvidence?.startTime, run.startedAt);
  const corroboratedProcessEvidence = [cwdMatches, commandMatches, envMarkerMatches, startTimeMatches]
    .some((value) => value === true);

  if (listenerPidMismatch) {
    reasons.push('listener_pid_differs_from_run');
    if (!processAlive) {
      reasons.push('run_process_not_alive');
    }
    return {
      confidence: OWNERSHIP_CONFIDENCE.EXTERNAL,
      pidMatchesRun: false,
      processAlive,
      cwdMatches,
      commandMatches,
      envMarkerMatches,
      startTimeMatches,
      portEvidence,
      checkedAt,
      reasons
    };
  }

  if (!processAlive) {
    reasons.push('run_process_not_alive');
    return {
      confidence: OWNERSHIP_CONFIDENCE.STALE_OWNED,
      pidMatchesRun,
      processAlive: false,
      cwdMatches,
      commandMatches,
      envMarkerMatches,
      startTimeMatches,
      portEvidence,
      checkedAt,
      reasons
    };
  }

  if (!isActiveRunStatus(run.status)) {
    reasons.push('run_status_not_active');
    return {
      confidence: OWNERSHIP_CONFIDENCE.STALE_OWNED,
      pidMatchesRun,
      processAlive,
      cwdMatches,
      commandMatches,
      envMarkerMatches,
      startTimeMatches,
      portEvidence,
      checkedAt,
      reasons
    };
  }

  if (listeners.length > 0 && hasListenerWithoutPid) {
    reasons.push('listener_pid_unavailable');
    return {
      confidence: OWNERSHIP_CONFIDENCE.UNKNOWN,
      pidMatchesRun,
      processAlive,
      cwdMatches,
      commandMatches,
      envMarkerMatches,
      startTimeMatches,
      portEvidence,
      checkedAt,
      reasons
    };
  }

  if (pidMatchesRun) {
    reasons.push('run_record_matches_listener_pid');
    if (!corroboratedProcessEvidence) {
      reasons.push('trusted_process_evidence_unavailable_or_incomplete');
      return {
        confidence: OWNERSHIP_CONFIDENCE.UNKNOWN,
        pidMatchesRun: true,
        processAlive,
        cwdMatches,
        commandMatches,
        envMarkerMatches,
        startTimeMatches,
        portEvidence,
        checkedAt,
        reasons
      };
    }
    return {
      confidence: OWNERSHIP_CONFIDENCE.VERIFIED_OWNED,
      pidMatchesRun: true,
      processAlive,
      cwdMatches,
      commandMatches,
      envMarkerMatches,
      startTimeMatches,
      portEvidence,
      checkedAt,
      reasons
    };
  }

  if (listeners.length === 0 && corroboratedProcessEvidence) {
    reasons.push('run_record_matches_process_evidence');
    return {
      confidence: OWNERSHIP_CONFIDENCE.PROBABLE_OWNED,
      pidMatchesRun: false,
      processAlive,
      cwdMatches,
      commandMatches,
      envMarkerMatches,
      startTimeMatches,
      portEvidence,
      checkedAt,
      reasons
    };
  }

  reasons.push(listeners.length === 0 ? 'no_listener_evidence' : 'ownership_evidence_incomplete');
  return {
    confidence: OWNERSHIP_CONFIDENCE.UNKNOWN,
    pidMatchesRun: false,
    processAlive,
    cwdMatches,
    commandMatches,
    envMarkerMatches,
    startTimeMatches,
    portEvidence,
    checkedAt,
    reasons
  };
}

export function buildPortObservation({ port, listeners = [], declaredOwners = [], checkedAt = new Date().toISOString() }) {
  const conflicts = declaredOwners
    .filter((owner) => owner.ownership === 'external' || owner.ownership === 'conflict' || owner.ownership === 'unknown')
    .map((owner) => ({
      type: owner.ownership === 'conflict'
        ? 'launchdeck_duplicate'
        : owner.ownership === 'unknown'
          ? 'unknown'
          : 'external_port_occupied',
      severity: owner.ownership === 'unknown' ? 'warning' : 'blocking',
      projectId: owner.project?.projectId ?? owner.project?.id,
      alias: owner.project?.alias ?? owner.project?.name,
      task: owner.task,
      port,
      runId: owner.run?.runId,
      message: owner.ownership === 'unknown'
        ? `Declared port ${port} has incomplete listener evidence.`
        : `Declared port ${port} is occupied by a process that is not proven to be this Launchdeck run.`,
      next: [
        {
          label: 'Inspect port',
          command: `launchdeck inspect-port ${port}`,
          reason: 'Shows listener and declared owner evidence for this port.',
          risk: 'safe'
        }
      ]
    }));

  return {
    port,
    protocol: 'tcp',
    listeners,
    declaredOwners: declaredOwners.map((owner) => ({
      projectId: owner.project?.projectId ?? owner.project?.id,
      alias: owner.project?.alias ?? owner.project?.name,
      task: owner.task,
      runId: owner.run?.runId
    })),
    ownerType: ownerTypeForObservation(listeners, declaredOwners),
    conflicts,
    checkedAt
  };
}

export function legacyOwnershipFromProof(proof, { hasRun = true, hasListeners = false } = {}) {
  if (!hasRun) {
    if (!hasListeners) {
      return 'declared-not-running';
    }
    return proof?.confidence === OWNERSHIP_CONFIDENCE.EXTERNAL ? 'external' : 'unknown';
  }
  if (proof.confidence === OWNERSHIP_CONFIDENCE.VERIFIED_OWNED) {
    return 'launchdeck-owned';
  }
  if (proof.confidence === OWNERSHIP_CONFIDENCE.PROBABLE_OWNED) {
    return 'launchdeck-probable-owned';
  }
  if (proof.confidence === OWNERSHIP_CONFIDENCE.STALE_OWNED) {
    return hasListeners ? 'external' : 'launchdeck-stale';
  }
  if (proof.confidence === OWNERSHIP_CONFIDENCE.EXTERNAL) {
    return 'conflict';
  }
  return hasListeners ? 'unknown' : 'launchdeck-declared-running';
}

export function applyTrustedSpawnOwnership(run, observedProof) {
  if (!run || !observedProof || observedProof.confidence === OWNERSHIP_CONFIDENCE.VERIFIED_OWNED) {
    return observedProof;
  }
  if (
    observedProof.confidence !== OWNERSHIP_CONFIDENCE.UNKNOWN
    && observedProof.confidence !== OWNERSHIP_CONFIDENCE.PROBABLE_OWNED
  ) {
    return observedProof;
  }
  if (!observedProof.processAlive || !observedProof.pidMatchesRun || !isActiveRunStatus(run.status)) {
    return observedProof;
  }

  const trustedProof = run.ownershipProof;
  if (!trustedSpawnProofMatchesRun(trustedProof, run)) {
    return observedProof;
  }

  return {
    ...observedProof,
    confidence: OWNERSHIP_CONFIDENCE.VERIFIED_OWNED,
    reasons: [...new Set([
      ...(observedProof.reasons ?? []),
      'launchdeck_spawn_ownership_proof'
    ])],
    trustedOwnershipProof: trustedProof
  };
}

export function inspectOnlyActionsForOwnership(target, proof) {
  if (proof?.confidence === OWNERSHIP_CONFIDENCE.VERIFIED_OWNED) {
    return {
      safeActions: [
        {
          label: 'View logs',
          command: `launchdeck logs ${target}`,
          reason: 'Reads logs for this Launchdeck-owned task.',
          risk: 'safe'
        },
        {
          label: 'Stop task',
          command: `launchdeck stop ${target}`,
          reason: 'Ownership is verified before stopping.',
          risk: 'confirm'
        }
      ],
      blockedActions: []
    };
  }

  return {
    safeActions: [],
    blockedActions: [
      {
        label: 'Stop blocked',
        command: `launchdeck stop ${target}`,
        reason: 'Ownership is not verified; inspect is read-only for external or unknown processes.',
        risk: 'confirm'
      },
      {
        label: 'Force-stop blocked',
        command: `launchdeck force-stop ${target}`,
        reason: 'Launchdeck never force-stops external or unknown processes.',
        risk: 'dangerous'
      },
      {
        label: 'Restart blocked',
        command: `launchdeck restart ${target}`,
        reason: 'Restart requires verified ownership of the current process.',
        risk: 'confirm'
      }
    ]
  };
}

function evidenceForRun(run, options = {}) {
  const pid = normalizePid(run?.pid, { allowMissing: true });
  if (pid === undefined) {
    return undefined;
  }

  const cache = options.processEvidenceCache;
  if (cache?.has(pid)) {
    return cache.get(pid);
  }

  let evidence;
  try {
    evidence = getProcessEvidence(pid, options.processEvidenceOptions);
  } catch {
    evidence = {
      pid,
      alive: getLiveness(pid) === 'running',
      source: 'liveness'
    };
  }
  cache?.set(pid, evidence);
  return evidence;
}

function portOwnershipEvidence(listener, run) {
  const listenerPid = normalizePid(listener.pid, { allowMissing: true });
  const runPid = normalizePid(run?.pid, { allowMissing: true });
  return {
    port: listener.port,
    protocol: listener.protocol ?? 'tcp',
    pid: listenerPid,
    source: listener.source,
    pidMatchesRun: listenerPid !== undefined && runPid !== undefined
      ? listenerPid === runPid
      : false,
    evidenceAvailable: listenerPid !== undefined
  };
}

function unknownProof({ checkedAt, listeners, portEvidence, processAlive, reasons }) {
  return {
    confidence: OWNERSHIP_CONFIDENCE.UNKNOWN,
    pidMatchesRun: false,
    processAlive,
    cwdMatches: UNAVAILABLE,
    commandMatches: UNAVAILABLE,
    envMarkerMatches: UNAVAILABLE,
    startTimeMatches: UNAVAILABLE,
    portEvidence: portEvidence ?? listeners.map((listener) => portOwnershipEvidence(listener)),
    checkedAt,
    reasons
  };
}

function ownerTypeForObservation(listeners, declaredOwners) {
  if (listeners.length === 0) {
    return 'free';
  }
  if (declaredOwners.some((owner) => owner.ownership === 'conflict')) {
    return 'conflict';
  }
  if (declaredOwners.some((owner) => owner.ownership === 'unknown')) {
    return 'unknown';
  }
  if (declaredOwners.some((owner) => owner.ownership === 'launchdeck-owned' || owner.ownership === 'launchdeck-probable-owned')) {
    return 'launchdeck';
  }
  if (listeners.every((listener) => Number.isInteger(listener.pid))) {
    return 'external';
  }
  return 'unknown';
}

function comparePathEvidence(actual, expected) {
  if (!actual || !expected) {
    return UNAVAILABLE;
  }
  const actualPath = path.resolve(actual);
  const expectedPath = path.resolve(expected);
  return process.platform === 'win32'
    ? actualPath.toLowerCase() === expectedPath.toLowerCase()
    : actualPath === expectedPath;
}

function compareCommandEvidence(actual, expected) {
  if (!actual || !expected) {
    return UNAVAILABLE;
  }
  const actualCommand = compactWhitespace(actual);
  const expectedCommand = compactWhitespace(expected);
  return actualCommand.includes(expectedCommand) || expectedCommand.includes(actualCommand);
}

function compareValueEvidence(actual, expected) {
  if (!actual || !expected) {
    return UNAVAILABLE;
  }
  return String(actual) === String(expected);
}

function compactWhitespace(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

function trustedSpawnProofMatchesRun(proof, run) {
  if (
    proof?.source !== 'launchdeck-spawn'
    || proof.confidence !== OWNERSHIP_CONFIDENCE.VERIFIED_OWNED
    || !proof.reasons?.includes('launchdeck_spawned_process')
    || typeof proof.createdAt !== 'string'
    || typeof proof.startedAt !== 'string'
  ) {
    return false;
  }

  const identityMatches = proof.runId === run.runId
    && proof.projectId === run.projectId
    && proof.task === run.task
    && normalizePid(proof.pid, { allowMissing: true }) === normalizePid(run.pid, { allowMissing: true })
    && proof.startedAt === run.startedAt
    && compactWhitespace(proof.command) === compactWhitespace(run.command)
    && comparePathEvidence(proof.cwd, run.cwd) === true;
  if (!identityMatches) {
    return false;
  }
  if (run.transactionId && proof.transactionId !== run.transactionId) {
    return false;
  }
  if (run.projectRoot && comparePathEvidence(proof.projectRoot, run.projectRoot) !== true) {
    return false;
  }
  return true;
}

function isActiveRunStatus(status) {
  return status === 'starting' || status === 'running' || status === 'ready' || status === 'stopping';
}
