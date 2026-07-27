import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMcpHandshakeVerifier
} from '../../../src/agent/verification/mcp-handshake.js';
import {
  createFakeMcpTransport,
  createVerificationFixture
} from '../../fixtures/agent-verification/verification-fixture.js';

test('MCP handshake verifier module exports the planned T028 bounded transport surface', () => {
  assert.equal(
    typeof createMcpHandshakeVerifier,
    'function',
    'T028 must provide createMcpHandshakeVerifier from src/agent/verification/mcp-handshake.js'
  );
});

test('MCP verification performs initialize before Launchdeck capabilities and checks exact build identity', async (t) => {
  const fixture = createVerificationFixture(t, 'mcp-happy');
  const fake = createFakeMcpTransport();
  const verifier = createMcpHandshakeVerifier({
    transportFactory: fake.transportFactory,
    timeoutMs: 200
  });

  const result = await verifier.verify({
    command: fixture.target.launcherPath,
    args: ['--build', fixture.buildIdentity],
    expectedBuildIdentity: fixture.buildIdentity,
    env: { LAUNCHDECK_HOME: fixture.launchdeckHome }
  });

  assert.equal(result.ready, true);
  assert.equal(result.state, 'verified');
  assert.equal(result.buildIdentity, fixture.buildIdentity);
  assert.deepEqual(result.checks.map((check) => [check.code, check.status]), [
    ['mcp-initialize', 'pass'],
    ['launchdeck-capabilities', 'pass'],
    ['build-identity', 'pass']
  ]);
  assert.deepEqual(
    fake.calls
      .filter((call) => call.phase === 'request')
      .map((call) => call.method),
    ['initialize', 'tools/call']
  );
  assert.deepEqual(fake.calls[0].invocation.args, ['--build', fixture.buildIdentity]);
  assert.equal(fake.calls[0].invocation.timeoutMs <= 200, true);
  assert.equal(fake.closed, true);
});

test('capability response from another build is failed evidence, not a usable ready state', async (t) => {
  const fixture = createVerificationFixture(t, 'mcp-build-mismatch');
  const verifier = createMcpHandshakeVerifier({
    transportFactory: createFakeMcpTransport({
      buildIdentity: fixture.previousBuildIdentity
    }).transportFactory,
    timeoutMs: 200
  });

  const result = await verifier.verify({
    command: fixture.target.launcherPath,
    args: ['--build', fixture.buildIdentity],
    expectedBuildIdentity: fixture.buildIdentity,
    env: { LAUNCHDECK_HOME: fixture.launchdeckHome }
  });

  assert.equal(result.ready, false);
  assert.equal(result.state, 'failed');
  assert.equal(result.code, 'agent_build_identity_mismatch');
  assert.equal(
    result.checks.some((check) => check.code === 'build-identity' && check.status === 'fail'),
    true
  );
});

test('transport failures are bounded, closed, and redacted before returning durable evidence', async (t) => {
  const fixture = createVerificationFixture(t, 'mcp-redaction');
  const fake = createFakeMcpTransport({
    secret: fixture.secretSentinel,
    failAt: 'initialize'
  });
  const verifier = createMcpHandshakeVerifier({
    transportFactory: fake.transportFactory,
    timeoutMs: 125
  });

  const result = await verifier.verify({
    command: fixture.target.launcherPath,
    args: ['--build', fixture.buildIdentity],
    expectedBuildIdentity: fixture.buildIdentity,
    env: {
      LAUNCHDECK_HOME: fixture.launchdeckHome,
      SECRET_TOKEN: fixture.secretSentinel
    }
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.ready, false);
  assert.equal(result.state, 'failed');
  assert.equal(result.code, 'agent_mcp_initialize_failed');
  assert.equal(fake.closed, true);
  assert.equal(fake.calls[0].invocation.timeoutMs <= 125, true);
  assert.equal(serialized.includes(fixture.secretSentinel), false);
  assert.equal(serialized.includes('SECRET_TOKEN'), false);
});
