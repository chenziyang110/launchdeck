import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  createInstallationVerifier
} from '../../../src/agent/verification/installation-verifier.js';
import {
  createFakeMcpTransport,
  createVerificationFixture
} from '../../fixtures/agent-verification/verification-fixture.js';

test('installation verifier module exports the planned T028 aggregation surface', () => {
  assert.equal(
    typeof createInstallationVerifier,
    'function',
    'T028 must provide createInstallationVerifier from src/agent/verification/installation-verifier.js'
  );
});

test('ready requires exact Skill, config, launcher, runtime, MCP, build, and receipt evidence', async (t) => {
  const fixture = createVerificationFixture(t, 'all-signals');
  const mcp = createFakeMcpTransport();
  const verifier = createInstallationVerifier({
    mcpHandshake: mcp.transportFactory,
    timeoutMs: 250
  });

  const verified = await verifier.verifyTarget({
    target: fixture.target,
    expected: fixture.expected,
    observed: fixture.observed,
    receiptCandidate: fixture.receiptCandidate
  });

  assert.equal(verified.state, 'verified');
  assert.equal(verified.ready, true);
  assert.equal(verified.targetId, fixture.target.targetId);
  assert.equal(verified.buildIdentity, fixture.buildIdentity);
  assert.deepEqual(verified.requiredHostActions, []);
  assert.deepEqual(verified.checks.map((check) => [check.code, check.status]), [
    ['skill-digest', 'pass'],
    ['config-ownership', 'pass'],
    ['config-digest', 'pass'],
    ['stable-launcher', 'pass'],
    ['runtime-digest', 'pass'],
    ['mcp-initialize', 'pass'],
    ['launchdeck-capabilities', 'pass'],
    ['build-identity', 'pass'],
    ['receipt-candidate', 'pass'],
    ['host-approval', 'pass']
  ]);
  assert.equal(mcp.calls.some((call) => call.method === 'initialize'), true);
  assert.equal(mcp.calls.some((call) => call.method === 'tools/call'), true);
  assert.deepEqual(
    mcp.calls.find((call) => call.phase === 'connect').invocation.args,
    ['--build', fixture.buildIdentity, '--']
  );
});

test('receipt candidate readiness is exact on root shape, scope, identity, target, path, and digests', async (t) => {
  const fixture = createVerificationFixture(t, 'receipt-exact');
  const verifier = createInstallationVerifier({
    mcpHandshake: createFakeMcpTransport().transportFactory,
    timeoutMs: 250
  });
  const userScopeIdentity = `user:sha256:${'7'.repeat(64)}`;
  const otherProjectIdentity = `project:sha256:${'8'.repeat(64)}`;
  const wrongDigest = `sha256:${'9'.repeat(64)}`;
  const exactTarget = fixture.receiptCandidate.targets[0];
  const pathAlias = `${path.dirname(fixture.target.configPath)}${path.sep}nested${path.sep}..${path.sep}${path.basename(fixture.target.configPath)}`;

  const exact = await verifier.verifyTarget({
    target: fixture.target,
    expected: fixture.expected,
    observed: fixture.observed,
    receiptCandidate: fixture.receiptCandidate
  });
  assert.equal(exact.ready, true);
  assert.equal(receiptCheckStatus(exact), 'pass');

  const cases = [
    ['malformed root scope identity fails canonical pattern', {
      expected: {
        ...fixture.expected,
        scopeIdentity: 'project:sha256:not-a-canonical-digest'
      },
      candidate: {
        scopeIdentity: 'project:sha256:not-a-canonical-digest'
      }
    }],
    ['unsupported root field fails allowlist', {
      candidate: {
        unsupported: { nested: true }
      }
    }],
    ['malformed receipt id fails canonical pattern', {
      candidate: {
        receiptId: 'bad'
      }
    }],
    ['missing required root field fails closed', {
      receiptCandidate: omit(fixture.receiptCandidate, 'scope')
    }],
    ['array root fails closed', {
      receiptCandidate: []
    }],
    ['non-plain root prototype fails closed', {
      receiptCandidate: Object.assign(Object.create({ ambiguous: true }), fixture.receiptCandidate)
    }],
    ['cross scope', {
      scope: 'user',
      scopeIdentity: userScopeIdentity,
      projectIdentity: null
    }],
    ['wrong scope identity', {
      scopeIdentity: `project:sha256:${'7'.repeat(64)}`
    }],
    ['wrong project identity', {
      projectIdentity: otherProjectIdentity
    }],
    ['user scope adopts project identity', {
      expected: {
        ...fixture.expected,
        scope: 'user',
        scopeIdentity: userScopeIdentity,
        projectIdentity: null
      },
      candidate: {
        scope: 'user',
        scopeIdentity: userScopeIdentity,
        projectIdentity: fixture.expected.projectIdentity
      }
    }],
    ['wrong target id', {
      targets: [{ ...exactTarget, targetId: 'codex:project:skill' }]
    }],
    ['non-canonical target component field', {
      targets: [{ ...exactTarget, component: 'skill' }]
    }],
    ['non-canonical target path field', {
      targets: [{ ...exactTarget, path: fixture.target.configPath }]
    }],
    ['selected target path alias is not canonical', {
      target: { ...fixture.target, configPath: pathAlias }
    }],
    ['wrong selected target component', {
      target: { ...fixture.target, component: 'skill' }
    }],
    ['wrong ownership boundary', {
      targets: [{ ...exactTarget, ownershipBoundary: 'mcp_servers.other' }]
    }],
    ['wrong desired digest', {
      targets: [{ ...exactTarget, desiredDigest: wrongDigest }]
    }],
    ['wrong owned digest', {
      ownedDigests: [wrongDigest]
    }],
    ['structured owned digest is non-canonical', {
      ownedDigests: [{
        targetId: fixture.target.targetId,
        component: fixture.target.component,
        path: fixture.target.configPath,
        digest: fixture.configDigest
      }]
    }],
    ['extra owned digest fails multiset equality', {
      ownedDigests: [fixture.configDigest, wrongDigest]
    }],
    ['duplicate owned digest fails multiset equality', {
      targets: [
        exactTarget,
        {
          targetId: 'codex:project:skill',
          ownershipBoundary: 'skills.launchdeck-agent',
          desiredDigest: fixture.skillDigest
        }
      ],
      ownedDigests: [fixture.configDigest, fixture.configDigest]
    }],
    ['wrong live owned digest', {
      observed: { ...fixture.observed, configDigest: wrongDigest }
    }],
    ['duplicate target id is ambiguous', {
      targets: [exactTarget, { ...exactTarget }]
    }],
    ['missing receipt target fails closed', {
      targets: []
    }],
    ['missing owned digests fails closed', {
      ownedDigests: []
    }]
  ];

  for (const [name, patch] of cases) {
    const { target, expected, observed, candidate, receiptCandidate, ...candidatePatch } = patch;
    const result = await verifier.verifyTarget({
      target: target ?? fixture.target,
      expected: expected ?? fixture.expected,
      observed: observed ?? fixture.observed,
      receiptCandidate: receiptCandidate ?? {
        ...fixture.receiptCandidate,
        ...(candidate ?? candidatePatch)
      }
    });
    assert.equal(result.ready, false, name);
    assert.equal(receiptCheckStatus(result), 'fail', name);
  }
});

test('filesystem presence alone is non-ready and does not skip runtime verification requirements', async (t) => {
  const fixture = createVerificationFixture(t, 'presence-only');
  let mcpCalls = 0;
  const verifier = createInstallationVerifier({
    mcpHandshake: async () => {
      mcpCalls += 1;
      throw new Error('presence-only inputs must not call runtime');
    },
    timeoutMs: 250
  });

  const result = await verifier.verifyTarget({
    target: fixture.target,
    expected: fixture.expected,
    observed: {
      skillPath: fixture.target.skillPath,
      configPath: fixture.target.configPath,
      launcherPath: fixture.target.launcherPath,
      runtimePath: fixture.target.runtimePath
    },
    receiptCandidate: fixture.receiptCandidate
  });

  assert.equal(result.ready, false);
  assert.equal(result.state, 'failed');
  assert.equal(result.code, 'agent_verification_evidence_incomplete');
  assert.equal(mcpCalls, 0);
  assert.equal(
    result.checks.filter((check) => check.status === 'fail').length >= 6,
    true,
    'missing runtime-backed proof must fail multiple required checks'
  );
});

test('mixed build or receipt-candidate drift refuses success and preserves previous-build recovery evidence', async (t) => {
  const fixture = createVerificationFixture(t, 'mixed-build');
  const mcp = createFakeMcpTransport({
    buildIdentity: `sha256:${'9'.repeat(64)}`
  });
  const verifier = createInstallationVerifier({
    mcpHandshake: mcp.transportFactory,
    timeoutMs: 250
  });

  const result = await verifier.verifyTarget({
    target: fixture.target,
    expected: fixture.expected,
    observed: {
      ...fixture.observed,
      previousBuildIdentity: fixture.previousBuildIdentity
    },
    receiptCandidate: {
      ...fixture.receiptCandidate,
      buildIdentity: `sha256:${'8'.repeat(64)}`
    }
  });

  assert.equal(result.ready, false);
  assert.equal(result.state, 'failed');
  assert.equal(result.code, 'agent_build_identity_mismatch');
  assert.equal(result.buildIdentity, fixture.buildIdentity);
  assert.equal(result.previousBuildIdentity, fixture.previousBuildIdentity);
  assert.equal(
    result.checks.some((check) => check.code === 'receipt-candidate' && check.status === 'fail'),
    true
  );
  assert.equal(
    result.checks.some((check) => check.code === 'build-identity' && check.status === 'fail'),
    true
  );
});

test('pending host approval or reload remains non-ready with an explicit host action', async (t) => {
  const fixture = createVerificationFixture(t, 'pending-approval');
  const verifier = createInstallationVerifier({
    mcpHandshake: createFakeMcpTransport().transportFactory,
    timeoutMs: 250
  });

  const result = await verifier.verifyTarget({
    target: fixture.target,
    expected: fixture.expected,
    observed: {
      ...fixture.observed,
      hostApprovalObserved: false,
      requiredHostActions: [fixture.hostApprovalAction]
    },
    receiptCandidate: fixture.receiptCandidate
  });

  assert.equal(result.ready, false);
  assert.equal(result.state, 'pending-host-approval');
  assert.deepEqual(result.requiredHostActions, [fixture.hostApprovalAction]);
  assert.equal(
    result.checks.some((check) => check.code === 'host-approval' && check.status === 'pending'),
    true
  );
});

test('durable verification evidence is allowlisted and redacts transport secrets and raw protocol payloads', async (t) => {
  const fixture = createVerificationFixture(t, 'redaction');
  const mcp = createFakeMcpTransport({
    secret: fixture.secretSentinel,
    failAt: 'tools/call'
  });
  const verifier = createInstallationVerifier({
    mcpHandshake: mcp.transportFactory,
    timeoutMs: 250
  });

  const result = await verifier.verifyTarget({
    target: fixture.target,
    expected: fixture.expected,
    observed: fixture.observed,
    receiptCandidate: fixture.receiptCandidate
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.ready, false);
  assert.equal(result.state, 'failed');
  assert.equal(result.code, 'agent_capabilities_unavailable');
  assert.equal(serialized.includes(fixture.secretSentinel), false);
  assert.equal(serialized.includes('rawProtocolPayload'), false);
  assert.equal(serialized.includes(process.env.PATH ?? ''), false);
});

test('launcher verification stays exact-build and absolute without global/latest fallback', async (t) => {
  const fixture = createVerificationFixture(t, 'launcher-exact');
  const verifier = createInstallationVerifier({
    mcpHandshake: createFakeMcpTransport().transportFactory,
    timeoutMs: 250
  });

  for (const [launcherPath, buildIdentity, code] of [
    ['launchdeck-mcp', fixture.buildIdentity, 'agent_launcher_path_invalid'],
    [path.join(fixture.root, 'global-bin', 'launchdeck-mcp'), 'latest', 'agent_build_identity_invalid']
  ]) {
    const result = await verifier.verifyTarget({
      target: {
        ...fixture.target,
        launcherPath
      },
      expected: {
        ...fixture.expected,
        buildIdentity
      },
      observed: {
        ...fixture.observed,
        launcherPath
      },
      receiptCandidate: fixture.receiptCandidate
    });
    assert.equal(result.ready, false, code);
    assert.equal(result.state, 'failed', code);
    assert.equal(result.code, code);
  }
});

function receiptCheckStatus(result) {
  return result.checks.find((check) => check.code === 'receipt-candidate')?.status;
}

function omit(value, key) {
  const { [key]: _ignored, ...rest } = value;
  return rest;
}
