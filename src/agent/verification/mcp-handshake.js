import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { redactInstallerValue } from '../result.js';

const DEFAULT_TIMEOUT_MS = 2_000;
const BUILD_IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REQUIRED_OPERATION = 'capabilities.get';

export function createMcpHandshakeVerifier(options = {}) {
  const transportFactory = options.transportFactory ?? createSdkTransport;
  const timeoutMs = normalizeTimeout(options.timeoutMs);

  return Object.freeze({
    async verify(request = {}) {
      const invocation = {
        command: request.command,
        args: Array.isArray(request.args) ? [...request.args] : [],
        env: request.env && typeof request.env === 'object' ? { ...request.env } : undefined,
        timeoutMs
      };
      const expectedBuildIdentity = String(request.expectedBuildIdentity ?? '');
      const checks = [];
      let transport = null;

      try {
        transport = await withTimeout(
          Promise.resolve(transportFactory(invocation)),
          timeoutMs,
          'agent_mcp_connect_timeout'
        );

        await withTimeout(
          transport.request('initialize', {
            protocolVersion: '2026-03-26',
            capabilities: {},
            clientInfo: { name: 'launchdeck-installer-verifier', version: '1.0.0' }
          }),
          timeoutMs,
          'agent_mcp_initialize_timeout'
        );
        checks.push(check('mcp-initialize', 'pass'));

        const capabilityResult = await withTimeout(
          transport.request('tools/call', {
            name: REQUIRED_OPERATION,
            arguments: {}
          }),
          timeoutMs,
          'agent_capabilities_timeout'
        );
        checks.push(check('launchdeck-capabilities', capabilityAvailable(capabilityResult) ? 'pass' : 'fail'));

        const reportedBuildIdentity = extractBuildIdentity(capabilityResult);
        const buildMatches = isBuildIdentity(expectedBuildIdentity)
          && reportedBuildIdentity === expectedBuildIdentity;
        checks.push(check('build-identity', buildMatches ? 'pass' : 'fail', {
          buildIdentity: isBuildIdentity(expectedBuildIdentity) ? expectedBuildIdentity : null,
          observedBuildIdentity: isBuildIdentity(reportedBuildIdentity) ? reportedBuildIdentity : null
        }));

        if (!capabilityAvailable(capabilityResult)) {
          return handshakeResult({
            ready: false,
            state: 'failed',
            code: 'agent_capabilities_unavailable',
            buildIdentity: expectedBuildIdentity,
            checks
          });
        }
        if (!buildMatches) {
          return handshakeResult({
            ready: false,
            state: 'failed',
            code: 'agent_build_identity_mismatch',
            buildIdentity: expectedBuildIdentity,
            checks
          });
        }

        return handshakeResult({
          ready: true,
          state: 'verified',
          buildIdentity: expectedBuildIdentity,
          checks
        });
      } catch (error) {
        const code = normalizeFailureCode(error, checks);
        if (!checks.some((entry) => entry.code === 'mcp-initialize')) {
          checks.push(check('mcp-initialize', 'fail'));
        } else if (!checks.some((entry) => entry.code === 'launchdeck-capabilities')) {
          checks.push(check('launchdeck-capabilities', 'fail'));
        }
        return handshakeResult({
          ready: false,
          state: 'failed',
          code,
          buildIdentity: expectedBuildIdentity,
          checks
        });
      } finally {
        if (transport && typeof transport.close === 'function') {
          try {
            await transport.close();
          } catch {
            // Verification close failures are intentionally not durable evidence.
          }
        }
      }
    }
  });
}

async function createSdkTransport(invocation) {
  const client = new Client(
    { name: 'launchdeck-installer-verifier', version: '1.0.0' },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({
    command: String(invocation.command ?? ''),
    args: invocation.args,
    env: invocation.env,
    stderr: 'pipe'
  });
  let initialized = false;

  return {
    async request(method, params) {
      if (method === 'initialize') {
        await client.connect(transport, { timeout: invocation.timeoutMs });
        initialized = true;
        return {
          serverInfo: client.getServerVersion(),
          capabilities: client.getServerCapabilities()
        };
      }
      if (!initialized) {
        await client.connect(transport, { timeout: invocation.timeoutMs });
        initialized = true;
      }
      if (method === 'tools/call') {
        return client.callTool(params, undefined, { timeout: invocation.timeoutMs });
      }
      return client.request({ method, params }, undefined, { timeout: invocation.timeoutMs });
    },
    async close() {
      await client.close();
    }
  };
}

function capabilityAvailable(result) {
  const structured = result?.structuredContent ?? result?.toolResult?.structuredContent ?? result;
  const operations = structured?.capabilities?.operations
    ?? structured?.resource?.data?.agentOperations
    ?? structured?.resource?.data?.operations?.map((entry) => entry?.name);
  const succeeded = structured?.outcome === undefined
    || structured?.outcome?.kind === 'succeeded';
  const available = structured?.resource === undefined
    || structured?.resource?.status === 'available';
  return succeeded
    && available
    && Array.isArray(operations)
    && operations.includes(REQUIRED_OPERATION);
}

function extractBuildIdentity(result) {
  const structured = result?.structuredContent ?? result?.toolResult?.structuredContent ?? result;
  return structured?.provenance?.buildIdentity ?? structured?.buildIdentity ?? null;
}

function check(code, status, details = {}) {
  return Object.freeze(redactInstallerValue({
    code,
    status,
    ...details
  }));
}

function handshakeResult(input) {
  return Object.freeze(redactInstallerValue({
    ready: input.ready,
    state: input.state,
    ...(input.code ? { code: input.code } : {}),
    buildIdentity: input.buildIdentity,
    checks: input.checks
  }));
}

function normalizeFailureCode(error, checks) {
  if (typeof error?.code === 'string' && error.code.startsWith('agent_')) return error.code;
  return checks.some((entry) => entry.code === 'mcp-initialize' && entry.status === 'pass')
    ? 'agent_capabilities_unavailable'
    : 'agent_mcp_initialize_failed';
}

function normalizeTimeout(value) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate > 0 ? Math.trunc(candidate) : DEFAULT_TIMEOUT_MS;
}

function withTimeout(promise, timeoutMs, code) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(code);
      error.code = code;
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function isBuildIdentity(value) {
  return BUILD_IDENTITY_PATTERN.test(String(value ?? ''));
}
