import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCENARIOS = JSON.parse(fs.readFileSync(
  new URL('./scenarios.json', import.meta.url),
  'utf8'
));

export function createVerificationFixture(t, label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `launchdeck-verification-${label}-`));
  const projectRoot = path.join(root, 'project');
  const launchdeckHome = path.join(root, 'launchdeck-home');
  const target = materializeTarget(root, SCENARIOS.target);
  const receiptCandidate = Object.freeze({
    ...SCENARIOS.receiptCandidate,
    buildIdentity: SCENARIOS.buildIdentity,
    targets: [{
      targetId: target.targetId,
      ownershipBoundary: target.ownershipBoundary,
      desiredDigest: SCENARIOS.configDigest
    }],
    ownedDigests: [SCENARIOS.configDigest],
    verificationEvidence: []
  });

  for (const directory of [
    target.skillPath,
    path.dirname(target.configPath),
    path.dirname(target.launcherPath),
    path.dirname(target.runtimePath)
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(path.join(target.skillPath, 'SKILL.md'), '# Launchdeck Agent\n', 'utf8');
  fs.writeFileSync(target.configPath, '[mcp_servers.launchdeck]\ncommand = "launchdeck-mcp"\n', 'utf8');
  fs.writeFileSync(target.launcherPath, '#!/usr/bin/env node\n', 'utf8');
  fs.writeFileSync(target.runtimePath, 'export const runtime = "launchdeck";\n', 'utf8');

  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  return Object.freeze({
    root,
    projectRoot,
    launchdeckHome,
    buildIdentity: SCENARIOS.buildIdentity,
    previousBuildIdentity: SCENARIOS.previousBuildIdentity,
    skillDigest: SCENARIOS.skillDigest,
    configDigest: SCENARIOS.configDigest,
    runtimeDigest: SCENARIOS.runtimeDigest,
    receiptDigest: SCENARIOS.receiptDigest,
    target,
    receiptCandidate,
    secretSentinel: SCENARIOS.secretSentinel,
    hostApprovalAction: SCENARIOS.hostApprovalAction,
    expected: Object.freeze({
      buildIdentity: SCENARIOS.buildIdentity,
      scope: target.scope,
      scopeIdentity: SCENARIOS.receiptCandidate.scopeIdentity,
      projectIdentity: SCENARIOS.receiptCandidate.projectIdentity,
      desiredDigest: SCENARIOS.configDigest,
      skillDigest: SCENARIOS.skillDigest,
      configDigest: SCENARIOS.configDigest,
      runtimeDigest: SCENARIOS.runtimeDigest,
      receiptDigest: SCENARIOS.receiptDigest
    }),
    observed: Object.freeze({
      skillDigest: SCENARIOS.skillDigest,
      configOwnership: 'verified',
      configDigest: SCENARIOS.configDigest,
      launcherResolved: true,
      launcherPath: target.launcherPath,
      runtimeDigest: SCENARIOS.runtimeDigest,
      runtimePath: target.runtimePath,
      receiptCandidateConsistent: true,
      hostApprovalObserved: true,
      requiredHostActions: []
    })
  });
}

export function createFakeMcpTransport({ buildIdentity = SCENARIOS.buildIdentity, secret = null, failAt = null } = {}) {
  const calls = [];
  let closed = false;
  const transportFactory = async (invocation) => {
    calls.push({ phase: 'connect', invocation });
    return {
      async request(method, params) {
        calls.push({ phase: 'request', method, params });
        if (failAt === method) {
          const error = new Error(`transport failed with ${secret ?? SCENARIOS.secretSentinel}`);
          error.code = 'fixture_transport_failed';
          throw error;
        }
        if (method === 'initialize') {
          return {
            protocolVersion: '2026-03-26',
            serverInfo: { name: 'launchdeck', version: '1.0.0' },
            capabilities: { tools: { listChanged: false } }
          };
        }
        if (method === 'tools/call') {
          return {
            structuredContent: {
              outcome: { kind: 'succeeded', code: 'capabilities_available' },
              provenance: { buildIdentity },
              resource: {
                kind: 'capabilities',
                status: 'available',
                data: {
                  agentOperations: ['capabilities.get', 'project.list', 'operation.reconcile']
                }
              }
            }
          };
        }
        throw new Error(`Unexpected MCP method: ${method}`);
      },
      async close() {
        closed = true;
        calls.push({ phase: 'close' });
      }
    };
  };

  return {
    transportFactory,
    calls,
    get closed() {
      return closed;
    }
  };
}

function materializeTarget(root, target) {
  return Object.freeze({
    targetId: target.targetId,
    host: target.host,
    scope: target.scope,
    component: target.component,
    dialect: target.dialect,
    ownershipBoundary: target.ownershipBoundary,
    skillPath: path.join(root, fromToken(target.skillPathToken)),
    configPath: path.join(root, fromToken(target.configPathToken)),
    launcherPath: path.join(root, fromToken(target.launcherPathToken)),
    runtimePath: path.join(root, fromToken(target.runtimePathToken))
  });
}

function fromToken(value) {
  return value.split('/').join(path.sep);
}
