import { OPERATION_REGISTRY } from '../operation-registry.js';
import { redactObservation } from '../observations.js';

export function createCapabilitiesHandlers(options = {}) {
  const provenance = Object.freeze({ ...(options.provenance ?? {}) });
  const compatibility = options.compatibility ?? {
    canRead: true,
    canWrite: true,
    diagnosticOnly: false,
    axes: {},
    components: {}
  };
  const diagnosticChecks = Object.freeze({ ...(options.diagnosticChecks ?? {}) });
  const operations = OPERATION_REGISTRY.map((definition) => ({
    name: definition.name,
    kind: definition.kind,
    maxAgentRisk: definition.maxAgentRisk
  }));
  const identity = {
    product: options.identity?.product ?? 'Launchdeck',
    package: {
      name: options.identity?.package?.name ?? 'launchdeck',
      version: options.identity?.package?.version ?? provenance.runtimeVersion
    },
    buildIdentity: provenance.buildIdentity
  };
  const contracts = options.contracts ?? {
    agentProtocol: { current: provenance.agentProtocolVersion },
    cliSchema: { current: provenance.cliSchemaVersion },
    configSchema: { current: null }
  };
  const executable = {
    kind: provenance.runtimeKind,
    path: options.executable?.path ?? provenance.runtimePath,
    runtimePath: options.executable?.runtimePath,
    runtimeVersion: options.executable?.runtimeVersion ?? provenance.runtimeVersion,
    buildIdentity: provenance.buildIdentity
  };

  return Object.freeze({
    'capabilities.get': async () => ({
      outcome: successOutcome('capabilities_reported', 'Launchdeck Agent capabilities are available.'),
      resource: {
        kind: 'capabilities',
        id: null,
        status: compatibility.canWrite ? 'available' : 'degraded',
        projectRef: null,
        taskRef: null,
        runId: null,
        data: {
          agentOperations: OPERATION_REGISTRY.map((definition) => definition.name),
          operations,
          riskBoundary: 'low-only',
          stateHome: provenance.stateHome,
          agentProtocolVersion: provenance.agentProtocolVersion,
          cliSchemaVersion: provenance.cliSchemaVersion,
          buildIdentity: provenance.buildIdentity,
          identity,
          contracts,
          riskPolicy: {
            boundary: 'low-only',
            maxAgentRisk: 'low',
            mutationOperations: operations
              .filter((operation) => operation.kind === 'mutation')
              .map((operation) => operation.name)
          },
          state: {
            scope: options.stateScope ?? 'global',
            home: provenance.stateHome
          },
          executable,
          compatibility: redactObservation(compatibility),
          evidence: redactObservation(options.evidence ?? {})
        }
      },
      effects: noEffects(),
      error: null,
      nextActions: []
    }),
    'system.diagnose': async ({ request }) => {
      const requested = request.input.checks ?? Object.keys(diagnosticChecks).sort();
      const checks = {};
      for (const name of requested) {
        options.onDiagnosticCheck?.(name);
        const check = diagnosticChecks[name];
        checks[name] = redactObservation(typeof check === 'function'
          ? await check({ name, request })
          : { status: 'unavailable', code: 'diagnostic_check_unavailable' });
      }
      const degraded = Object.values(checks).some((check) => check?.status !== 'healthy');
      return {
        outcome: successOutcome('diagnosis_completed', 'Launchdeck diagnosis completed.'),
        resource: {
          kind: 'diagnostic',
          id: null,
          status: degraded ? 'degraded' : 'healthy',
          projectRef: request.input.projectRef ?? null,
          taskRef: null,
          runId: null,
          data: { checks, provenance }
        },
        effects: noEffects(),
        error: null,
        nextActions: []
      };
    }
  });
}

function successOutcome(code, message) {
  return { kind: 'succeeded', code, message, reusedExistingRun: false };
}

function noEffects() {
  return { certainty: 'none', changed: false, evidenceRefs: [] };
}
