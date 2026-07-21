export function createReadinessCell(overrides = {}) {
  const cell = {
    schemaVersion: 1,
    cellId: 'CORE-STDIO-WINDOWS-10.0.26100-x64-c9f8ef1e',
    status: 'passed',
    buildIdentity: 'sha256:c9f8ef1ee494f3007ee365dc67e94bc21226610e2ec3e5f380dd05593c09cb5d',
    componentDigests: {
      compatibilityManifest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      runtime: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      schema: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      skill: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    },
    surface: {
      kind: 'mcp',
      operations: ['capabilities.get', 'task.status']
    },
    host: {
      kind: 'standalone',
      versions: {},
      scope: 'standalone'
    },
    platform: {
      os: 'windows',
      version: '10.0.26100',
      build: '26100',
      architecture: 'x64',
      distribution: null
    },
    runtime: {
      nodeExecutable: 'C:/Program Files/nodejs/node.exe',
      nodeVersion: '24.14.0'
    },
    scenario: {
      id: 'STDIO-REAL-WIRE',
      family: 'core-stdio-bundle',
      description: 'Initialize, list, and call the shipped runtime over real stdio.'
    },
    fixture: {
      digest: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      harnessDigest: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    },
    execution: {
      startedAt: '2026-07-20T08:00:00.000Z',
      completedAt: '2026-07-20T08:01:00.000Z',
      actions: ['initialize', 'tools/list', 'tools/call capabilities.get'],
      commands: ['node runtime/launchdeck-mcp.mjs']
    },
    result: {
      code: 'passed',
      summary: 'Real stdio framing and bounded calls passed.',
      assertions: [
        { id: 'initialize', status: 'passed', evidenceRefs: ['stdio-transcript'] }
      ]
    },
    evidence: {
      rawRefs: [
        {
          id: 'stdio-transcript',
          kind: 'protocol',
          path: 'raw/stdio-transcript.jsonl',
          sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }
      ]
    },
    invalidation: {
      state: 'current',
      checkedAt: '2026-07-20T08:01:00.000Z',
      invalidatedAt: null,
      reasons: [],
      keys: {
        buildIdentity: 'sha256:c9f8ef1ee494f3007ee365dc67e94bc21226610e2ec3e5f380dd05593c09cb5d',
        evidenceSchemaVersion: 1,
        hostVersions: {},
        os: 'windows',
        osVersion: '10.0.26100',
        osBuild: '26100',
        architecture: 'x64',
        nodeVersion: '24.14.0',
        fixtureDigest: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        harnessDigest: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      }
    }
  };
  return deepMerge(cell, overrides);
}

export function createStatusCell(status) {
  if (status === 'passed') return createReadinessCell();
  if (status === 'not_executed' || status === 'not_executed_host_owned') {
    return createReadinessCell({
      status,
      execution: { startedAt: null, completedAt: null, actions: [], commands: [] },
      result: { code: status, summary: 'This exact cell has not been executed.', assertions: [] },
      evidence: { rawRefs: [] }
    });
  }
  if (status === 'stale') {
    return createReadinessCell({
      status,
      result: { code: 'stale', summary: 'The recorded build identity is no longer current.' },
      invalidation: {
        state: 'invalidated',
        invalidatedAt: '2026-07-20T09:00:00.000Z',
        reasons: ['build_identity_changed']
      }
    });
  }
  return createReadinessCell({
    status,
    result: { code: status, summary: `The exact cell ended as ${status}.` }
  });
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return override ?? base;
  const output = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)
      && output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}
