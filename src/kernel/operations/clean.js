import { canonicalDigest } from '../compatibility.js';

export function createCleanHandlers(options = {}) {
  const createPlan = options.createPlan ?? (async () => emptyPlan());
  const applySafe = options.applySafe;

  const planHandler = async (context) => {
    const plan = await resolvePlan(context, createPlan);
    return planResult(context, plan);
  };

  const applyHandler = async (context) => {
    const plan = context.preflight?.cleanPlan ?? await resolvePlan(context, createPlan);
    const refusal = applyRefusal(context, plan);
    if (refusal) return refusal;
    if (typeof applySafe !== 'function') {
      return cleanFailure(context, plan, {
        code: 'operation_not_implemented',
        message: 'Safe clean apply is not implemented.',
        details: {}
      });
    }
    const applied = await applySafe({
      ...cleanScope(context),
      plan,
      planDigest: plan.planDigest
    });
    const removed = Array.isArray(applied?.removed) ? applied.removed : [];
    const changed = applied?.changed ?? removed.some((entry) => entry?.existed === true);
    return {
      outcome: successOutcome(
        changed ? 'clean_safe_applied' : 'clean_safe_unchanged',
        changed ? 'Safe clean plan was applied.' : 'Safe clean plan required no changes.'
      ),
      resource: cleanResource(context, {
        kind: 'cleanResult',
        id: plan.planDigest,
        status: changed ? 'applied' : 'unchanged',
        data: {
          planDigest: plan.planDigest,
          targets: plan.targets,
          protectedPaths: plan.protectedPaths,
          removed
        }
      }),
      effects: {
        certainty: 'confirmed',
        changed: Boolean(changed),
        evidenceRefs: applied?.evidenceRefs ?? []
      },
      error: null,
      nextActions: []
    };
  };

  Object.defineProperty(applyHandler, 'preflight', {
    value: async (context) => {
      const plan = await resolvePlan(context, createPlan);
      const refusal = applyRefusal(context, plan);
      return refusal
        ? { result: refusal }
        : { context: { cleanPlan: plan } };
    },
    enumerable: false
  });

  return Object.freeze({
    'clean.plan': planHandler,
    'clean.applySafe': applyHandler
  });
}

export function canonicalizeCleanPlan(rawPlan = {}, project = {}) {
  const projectRef = project.projectId ?? project.id ?? null;
  const plan = {
    version: Number.isInteger(rawPlan.version) ? rawPlan.version : 1,
    projectRef,
    configDigest: normalizeDigest(rawPlan.configDigest),
    targets: normalizeTargets(rawPlan.targets, { safeOnly: true }),
    refusals: normalizeTargets(rawPlan.refusals),
    protectedPaths: normalizeStrings(rawPlan.protectedPaths),
    excludedRiskyTargets: normalizeTargets(rawPlan.excludedRiskyTargets)
  };
  return {
    ...plan,
    planDigest: canonicalDigest(plan)
  };
}

async function resolvePlan(context, createPlan) {
  const rawPlan = await createPlan(cleanScope(context));
  return canonicalizeCleanPlan(rawPlan, context.inputs?.projectContext?.project);
}

function planResult(context, plan) {
  const firstRefusal = plan.refusals[0];
  if (firstRefusal) {
    return cleanRefusal(context, plan, {
      code: firstRefusal.refusalCode ?? 'clean_target_unsafe',
      message: refusalMessage(firstRefusal.refusalCode),
      details: refusalDetails(firstRefusal)
    });
  }
  return {
    outcome: successOutcome('clean_plan_created', 'Safe clean plan was created from current project evidence.'),
    resource: cleanResource(context, {
      kind: 'cleanPlan',
      id: plan.planDigest,
      status: 'planned',
      data: plan
    }),
    effects: noEffects(),
    error: null,
    nextActions: []
  };
}

function applyRefusal(context, plan) {
  const providedPlanDigest = context.request.input.planDigest;
  if (providedPlanDigest !== plan.planDigest) {
    return cleanRefusal(context, plan, {
      code: 'plan_digest_mismatch',
      message: 'Safe clean plan changed after preview; create a fresh plan before applying.',
      details: {
        providedPlanDigest,
        currentPlanDigest: plan.planDigest
      }
    });
  }
  const firstRefusal = plan.refusals[0];
  if (!firstRefusal) return null;
  return cleanRefusal(context, plan, {
    code: firstRefusal.refusalCode ?? 'clean_target_unsafe',
    message: refusalMessage(firstRefusal.refusalCode),
    details: refusalDetails(firstRefusal)
  });
}

function cleanRefusal(context, plan, error) {
  return {
    outcome: {
      kind: 'refused',
      code: error.code,
      message: error.message,
      reusedExistingRun: false
    },
    resource: cleanResource(context, {
      kind: 'cleanPlan',
      id: plan.planDigest,
      status: 'refused',
      data: plan
    }),
    effects: noEffects(),
    error,
    nextActions: [{
      kind: error.code === 'plan_digest_mismatch' ? 'read' : 'fix_config',
      label: error.code === 'plan_digest_mismatch' ? 'Create a fresh safe clean plan' : 'Fix unsafe clean targets',
      operationName: error.code === 'plan_digest_mismatch' ? 'clean.plan' : null,
      input: error.code === 'plan_digest_mismatch'
        ? { projectRef: projectId(context) }
        : null,
      reason: error.code === 'plan_digest_mismatch'
        ? 'Refresh the current target and protected-evidence snapshot without deleting files.'
        : 'Safe clean cannot proceed while configured targets are unsafe.'
    }]
  };
}

function cleanFailure(context, plan, error) {
  return {
    outcome: { kind: 'failed', code: error.code, message: error.message, reusedExistingRun: false },
    resource: cleanResource(context, {
      kind: 'cleanResult',
      id: plan.planDigest,
      status: 'failed',
      data: { planDigest: plan.planDigest, targets: plan.targets, removed: [] }
    }),
    effects: noEffects(),
    error,
    nextActions: []
  };
}

function cleanScope(context) {
  const project = context.inputs?.projectContext?.project;
  return {
    operationId: context.operationId,
    project,
    projectId: project?.projectId ?? project?.id,
    request: context.request,
    trustedContext: context.trustedContext
  };
}

function cleanResource(context, input) {
  return {
    kind: input.kind,
    id: input.id,
    status: input.status,
    projectRef: projectId(context),
    taskRef: null,
    runId: null,
    data: input.data
  };
}

function projectId(context) {
  const project = context.inputs?.projectContext?.project;
  return project?.projectId ?? project?.id ?? null;
}

function normalizeTargets(values, options = {}) {
  return (Array.isArray(values) ? values : [])
    .filter((entry) => entry && typeof entry === 'object' && (!options.safeOnly || entry.kind === 'safe'))
    .map((entry) => ({
      ...entry,
      ...(Array.isArray(entry.protectedPaths)
        ? { protectedPaths: normalizeStrings(entry.protectedPaths) }
        : {})
    }))
    .sort((left, right) => targetKey(left).localeCompare(targetKey(right)));
}

function normalizeStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((entry) => typeof entry === 'string' && entry))]
    .sort((left, right) => left.localeCompare(right));
}

function targetKey(target) {
  return [target.rawPath, target.canonicalPath, target.resolvedPath, target.refusalCode]
    .map((entry) => String(entry ?? ''))
    .join('\u0000');
}

function normalizeDigest(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value)
    ? value
    : canonicalDigest(value ?? null);
}

function refusalDetails(target) {
  return {
    rawPath: target.rawPath ?? target.path,
    resolvedPath: target.resolvedPath ?? target.absolutePath,
    canonicalPath: target.canonicalPath
  };
}

function refusalMessage(code) {
  if (code === 'clean_target_root') return 'Launchdeck refuses to clean the project root.';
  if (code === 'clean_target_outside_project') return 'Clean target must stay inside the project root.';
  if (code === 'clean_target_empty') return 'Clean target must be a non-empty project-relative path.';
  return 'Safe clean target cannot be proven safe.';
}

function successOutcome(code, message) {
  return { kind: 'succeeded', code, message, reusedExistingRun: false };
}

function noEffects() {
  return { certainty: 'none', changed: false, evidenceRefs: [] };
}

function emptyPlan() {
  return {
    version: 1,
    configDigest: canonicalDigest({ safe: [], risky: [] }),
    targets: [],
    refusals: [],
    protectedPaths: [],
    excludedRiskyTargets: []
  };
}
