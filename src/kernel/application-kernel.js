import { randomUUID } from 'node:crypto';
import { normalizeAgentOperationResult } from './agent-result.js';
import { canonicalDigest } from './compatibility.js';
import {
  digestAgentOperationRequest,
  getOperationDefinition,
  validateAgentOperationRequest
} from './operation-registry.js';
import { evaluateOperationPolicy } from './policy.js';
import { resolveProjectContext } from './project-context.js';
import { withMutationLocks } from '../control-plane/locks.js';

export function createApplicationKernel(options = {}) {
  const dependencies = normalizeDependencies(options);

  return Object.freeze({
    async execute(request, execution = {}) {
      const validation = validateAgentOperationRequest(request);
      if (!validation.ok) {
        return refusalResult({
          request,
          operationId: makeId('req'),
          inputDigest: canonicalDigest(request ?? null),
          code: 'input_invalid',
          message: 'Agent operation input is invalid.',
          policy: defaultRefusalPolicy(),
          provenance: dependencies.provenance,
          details: { errors: validation.errors }
        });
      }

      const normalizedRequest = validation.value;
      const definition = getOperationDefinition(normalizedRequest.operation);
      const operationId = dependencies.operationIdFactory();
      const inputDigest = digestAgentOperationRequest(normalizedRequest);
      const trustedContext = execution.trustedContext ?? {};
      const initial = await resolvePolicyInputs(dependencies, definition, normalizedRequest, trustedContext);
      const initialPolicy = policyFor(definition, initial);
      if (!initialPolicy.allowed) {
        return refusalResult({
          request: normalizedRequest,
          operationId,
          inputDigest,
          code: initialPolicy.code,
          message: refusalMessage(initialPolicy.code),
          policy: initialPolicy,
          provenance: dependencies.provenance
        });
      }

      if (definition.kind === 'query') {
        return executeHandler(dependencies, definition, normalizedRequest, {
          operationId,
          inputDigest,
          trustedContext,
          policy: initialPolicy,
          inputs: initial
        });
      }

      if (definition.kind === 'mutation' && dependencies.operationJournal) {
        return executeJournaledMutation({
          dependencies,
          definition,
          normalizedRequest,
          operationId,
          inputDigest,
          trustedContext,
          initial,
          initialPolicy
        });
      }

      const lockContext = {
        operationId,
        env: dependencies.lockEnv,
        projectId: initial.projectContext.project?.projectId ?? initial.projectContext.project?.id,
        taskRef: normalizedRequest.input.taskRef,
        includeRunIndex: false,
        includeJournalIndex: false,
        waitMs: dependencies.lockWaitMs,
        transactionId: operationId
      };
      return dependencies.lockRunner(lockContext, async () => {
        const current = await resolvePolicyInputs(dependencies, definition, normalizedRequest, trustedContext);
        const currentPolicy = policyFor(definition, current);
        if (!currentPolicy.allowed) {
          return refusalResult({
            request: normalizedRequest,
            operationId,
            inputDigest,
            code: currentPolicy.code,
            message: refusalMessage(currentPolicy.code),
            policy: currentPolicy,
            provenance: dependencies.provenance
          });
        }
        const preflight = await executeHandlerPreflight(dependencies, definition, normalizedRequest, {
          operationId,
          inputDigest,
          trustedContext,
          policy: currentPolicy,
          inputs: current
        });
        if (preflight.result) return preflight.result;
        return executeHandler(dependencies, definition, normalizedRequest, {
          operationId,
          inputDigest,
          trustedContext,
          policy: currentPolicy,
          inputs: current,
          preflight: preflight.context
        });
      });
    }
  });
}

async function executeJournaledMutation(input) {
  const {
    dependencies,
    definition,
    normalizedRequest,
    operationId,
    inputDigest,
    trustedContext,
    initial,
    initialPolicy
  } = input;
  const project = initial.projectContext.project;
  const projectId = project.projectId ?? project.id;
  const lockContext = {
    operationId,
    env: dependencies.lockEnv,
    projectId,
    taskRef: normalizedRequest.input.taskRef,
    includeRunIndex: false,
    includeJournalIndex: false,
    waitMs: dependencies.lockWaitMs,
    transactionId: operationId
  };

  await injectFault(dependencies, 'before_journal', { operationId, request: normalizedRequest });
  const prepared = await dependencies.operationJournal.prepare({
    operationId,
    operationName: definition.name,
    definitionVersion: dependencies.definitionVersion,
    inputDigest,
    requestSummary: normalizedRequest.input,
    projectRef: {
      projectId,
      alias: project.alias ?? project.name ?? normalizedRequest.input.projectRef
    },
    taskRef: normalizedRequest.input.taskRef ?? null,
    runtimeProvenance: dependencies.provenance
  });
  await injectFault(dependencies, 'after_prepared', { operationId, record: prepared.record });

  return dependencies.lockRunner(lockContext, async (heldLocks = []) => {
    const lockProof = heldLocks.find((lock) => lock?.lockName === `operation-${operationId}`);
    const current = await resolvePolicyInputs(dependencies, definition, normalizedRequest, trustedContext);
    const currentPolicy = policyFor(definition, current);
    if (!currentPolicy.allowed) {
      const refused = refusalResult({
        request: normalizedRequest,
        operationId,
        inputDigest,
        code: currentPolicy.code,
        message: refusalMessage(currentPolicy.code),
        policy: currentPolicy,
        provenance: dependencies.provenance
      });
      const terminal = await dependencies.operationJournal.transition(operationId, {
        lockProof,
        expectedRevision: prepared.record.revision,
        to: 'refused',
        effectsCertainty: 'none',
        result: refused,
        lastError: refused.error
      });
      return withJournalStatus(refused, terminal.state);
    }

    const preflight = await executeHandlerPreflight(dependencies, definition, normalizedRequest, {
      operationId,
      inputDigest,
      trustedContext,
      policy: currentPolicy,
      inputs: current
    });
    if (preflight.result) {
      const terminal = await dependencies.operationJournal.transition(operationId, {
        lockProof,
        expectedRevision: prepared.record.revision,
        to: preflightJournalStateForResult(preflight.result),
        effectsCertainty: preflight.result.effects.certainty,
        effectEvidenceRefs: preflight.result.effects.evidenceRefs,
        resourceRef: {
          kind: preflight.result.resource.kind,
          id: preflight.result.resource.id,
          runId: preflight.result.resource.runId
        },
        result: preflight.result,
        lastError: preflight.result.error
      });
      return withJournalStatus(preflight.result, terminal.state);
    }

    const running = await dependencies.operationJournal.transition(operationId, {
      lockProof,
      expectedRevision: prepared.record.revision,
      to: 'running'
    });
    await injectFault(dependencies, 'after_running', { operationId, record: running });

    let result;
    try {
      result = await executeHandler(dependencies, definition, normalizedRequest, {
        operationId,
        inputDigest,
        trustedContext,
        policy: currentPolicy,
        inputs: current,
        preflight: preflight.context
      });
    } catch (error) {
      if (error?.fatal) throw error;
      await dependencies.operationJournal.transition(operationId, {
        lockProof,
        expectedRevision: running.revision,
        to: 'indeterminate',
        effectsCertainty: 'unknown',
        lastError: boundedError(error)
      });
      throw error;
    }
    await injectFault(dependencies, 'after_effect', { operationId, result });

    const journalState = journalStateForResult(result);
    const terminal = await dependencies.operationJournal.transition(operationId, {
      lockProof,
      expectedRevision: running.revision,
      to: journalState,
      effectsCertainty: result.effects.certainty,
      effectEvidenceRefs: result.effects.evidenceRefs,
      resourceRef: {
        kind: result.resource.kind,
        id: result.resource.id,
        runId: result.resource.runId
      },
      result,
      lastError: result.error
    });
    const journaledResult = withJournalStatus(result, terminal.state);
    await injectFault(dependencies, 'after_terminal', { operationId, record: terminal, result: journaledResult });
    await injectFault(dependencies, 'before_response', { operationId, record: terminal, result: journaledResult });
    return journaledResult;
  });
}

async function resolvePolicyInputs(dependencies, definition, request, trustedContext) {
  const projectContext = await dependencies.projectResolver({ request, trustedContext, definition });
  const task = request.input.taskRef
    ? await dependencies.taskResolver({ request, trustedContext, definition, projectContext })
    : definition.kind === 'query'
      ? null
      : { name: null, risk: definition.maxAgentRisk };
  const ownership = await dependencies.ownershipResolver({ request, trustedContext, definition, projectContext, task });
  const compatibility = await dependencies.compatibilityResolver({ request, trustedContext, definition, projectContext, task });
  return { projectContext, task, ownership, compatibility };
}

function policyFor(definition, inputs) {
  return Object.freeze({
    ...evaluateOperationPolicy({ definition, ...inputs }),
    projectContext: inputs.projectContext
  });
}

async function executeHandler(dependencies, definition, request, context) {
  const handler = dependencies.handlers[definition.name];
  if (typeof handler !== 'function') {
    return refusalResult({
      request,
      operationId: context.operationId,
      inputDigest: context.inputDigest,
      code: 'operation_not_implemented',
      message: `Operation '${definition.name}' is not implemented.`,
      policy: context.policy,
      provenance: dependencies.provenance
    });
  }

  const handled = await handler({ request, definition, ...context });
  return normalizeHandledResult(dependencies, definition, request, context, handled);
}

async function executeHandlerPreflight(dependencies, definition, request, context) {
  const handler = dependencies.handlers[definition.name];
  if (typeof handler !== 'function' || typeof handler.preflight !== 'function') {
    return { context: null, result: null };
  }
  const prepared = await handler.preflight({ request, definition, ...context });
  if (prepared?.result) {
    return {
      context: prepared.context ?? null,
      result: normalizeHandledResult(dependencies, definition, request, context, prepared.result)
    };
  }
  return { context: prepared?.context ?? null, result: null };
}

function normalizeHandledResult(dependencies, definition, request, context, handled) {
  return normalizeAgentOperationResult({
    protocolVersion: dependencies.provenance.agentProtocolVersion,
    operation: {
      id: context.operationId,
      name: definition.name,
      inputDigest: context.inputDigest,
      journalStatus: handled.journalStatus ?? 'not_applicable'
    },
    outcome: handled.outcome,
    resource: handled.resource,
    effects: handled.effects,
    safety: safetyFromPolicy(context.policy),
    error: handled.error ?? null,
    nextActions: handled.nextActions ?? [],
    provenance: dependencies.provenance
  });
}

function refusalResult({ request, operationId, inputDigest, code, message, policy, provenance, details = {} }) {
  const operationName = validOperationName(request?.operation) ? request.operation : 'system.diagnose';
  const taskRef = typeof request?.input?.taskRef === 'string' ? request.input.taskRef : null;
  const projectRef = typeof request?.input?.projectRef === 'string' ? request.input.projectRef : null;
  return normalizeAgentOperationResult({
    protocolVersion: provenance.agentProtocolVersion,
    operation: { id: operationId, name: operationName, inputDigest, journalStatus: 'not_applicable' },
    outcome: { kind: 'refused', code, message, reusedExistingRun: false },
    resource: {
      kind: taskRef ? 'task' : 'inspection',
      id: taskRef,
      status: 'refused',
      projectRef: policy.projectContext?.project?.projectId ?? projectRef,
      taskRef,
      runId: null
    },
    effects: { certainty: 'none', changed: false, evidenceRefs: [] },
    safety: safetyFromPolicy(policy),
    error: { code, message, details },
    nextActions: [],
    provenance
  });
}

function normalizeDependencies(options) {
  const provenance = Object.freeze({ ...options.provenance });
  const lockEnv = options.env ?? (options.operationJournal?.paths?.homeDir
    ? { ...process.env, LAUNCHDECK_HOME: options.operationJournal.paths.homeDir }
    : process.env);
  return {
    projectResolver: options.projectResolver ?? (({ request, trustedContext, definition }) => resolveProjectContext({
      projectRef: request.input.projectRef,
      trustedContext,
      registry: options.registry,
      cwd: trustedContext.cwd,
      pluginRoots: options.pluginRoots,
      allowUserScopeDefault: definition.name === 'project.list'
    })),
    taskResolver: options.taskResolver ?? (() => null),
    ownershipResolver: options.ownershipResolver ?? (() => ({ classification: 'unknown' })),
    compatibilityResolver: options.compatibilityResolver ?? (() => ({ canRead: false, canWrite: false, diagnosticOnly: true })),
    lockRunner: options.lockRunner ?? ((context, callback) => withMutationLocks(context, callback)),
    handlers: Object.freeze({ ...(options.handlers ?? {}) }),
    operationJournal: options.operationJournal ?? null,
    operationIdFactory: options.operationIdFactory ?? (() => makeId('op')),
    faultInjector: options.faultInjector ?? null,
    definitionVersion: options.definitionVersion ?? '1.0.0',
    lockWaitMs: options.lockWaitMs ?? 30_000,
    lockEnv,
    provenance
  };
}

async function injectFault(dependencies, point, context) {
  if (typeof dependencies.faultInjector === 'function') {
    await dependencies.faultInjector(point, context);
  }
}

function journalStateForResult(result) {
  if (result.outcome.kind === 'succeeded') return 'succeeded';
  if (result.outcome.kind === 'indeterminate') return 'indeterminate';
  return 'failed';
}

function preflightJournalStateForResult(result) {
  return result.outcome.kind === 'refused' ? 'refused' : 'failed';
}

function withJournalStatus(result, journalStatus) {
  return normalizeAgentOperationResult({
    ...result,
    operation: { ...result.operation, journalStatus }
  });
}

function boundedError(error) {
  return {
    code: String(error?.code ?? 'operation_execution_interrupted').slice(0, 128),
    message: String(error?.message ?? error ?? 'Operation execution was interrupted.').slice(0, 2048)
  };
}

function defaultRefusalPolicy() {
  return {
    decision: 'refused',
    risk: 'unknown',
    ownership: 'unknown',
    projectScope: 'unconfigured',
    projectContext: null
  };
}

function safetyFromPolicy(policy) {
  return {
    risk: policy.risk ?? 'unknown',
    decision: policy.allowed ? 'allowed' : 'refused',
    ownership: policy.ownership ?? 'unknown',
    projectScope: normalizeProjectScope(policy.projectScope)
  };
}

function normalizeProjectScope(value) {
  if (value === 'conflicting') return 'ambiguous';
  return ['resolved', 'not_required', 'missing', 'ambiguous', 'out_of_scope', 'unconfigured'].includes(value)
    ? value
    : 'unconfigured';
}

function refusalMessage(code) {
  const messages = {
    scope_not_resolved: 'Project scope is not resolved.',
    risk_not_low: 'Public Agent mutations require effective low risk.',
    ownership_not_verified: 'Verified Launchdeck ownership is required.',
    compatibility_mismatch: 'Component compatibility does not permit this operation.'
  };
  return messages[code] ?? 'Operation refused by the Launchdeck Kernel.';
}

function validOperationName(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/.test(value);
}

function makeId(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}
