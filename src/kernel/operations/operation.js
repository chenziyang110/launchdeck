export function createOperationHandlers(options = {}) {
  const journal = requireJournal(options.journal);
  const reconcileRecord = options.reconcileRecord ?? (async () => null);

  return Object.freeze({
    'operation.get': async ({ request }) => {
      let record;
      try {
        record = await journal.get(request.input.operationId);
      } catch (error) {
        return operationReadFailure(request.input.operationId, error);
      }
      return operationRecordResult(record, {
        code: 'operation_found',
        message: `Operation '${record.operationId}' was found.`
      });
    },
    'operation.list': async ({ request, inputs }) => {
      const projectId = inputs?.projectContext?.project?.projectId
        ?? inputs?.projectContext?.project?.id;
      const listed = await journal.list({
        projectId,
        operationName: request.input.operationName,
        taskRef: request.input.taskRef ?? null,
        states: request.input.states,
        createdAfter: request.input.createdAfter,
        createdBefore: request.input.createdBefore,
        limit: request.input.limit ?? 20
      });
      const correlation = correlationFor(listed.records);
      return {
        outcome: {
          kind: 'succeeded',
          code: correlation.code,
          message: correlation.message,
          reusedExistingRun: false
        },
        resource: {
          kind: 'operationCollection',
          id: null,
          status: 'available',
          projectRef: projectId,
          taskRef: request.input.taskRef ?? null,
          runId: null,
          data: {
            records: listed.records,
            nextCursor: listed.nextCursor,
            correlation: correlation.data
          }
        },
        effects: { certainty: 'none', changed: false, evidenceRefs: [] },
        error: null,
        nextActions: correlation.nextActions
      };
    },
    'operation.reconcile': async (context) => {
      const operationId = context.request.input.operationId;
      let original;
      try {
        original = await journal.get(operationId);
      } catch (error) {
        return operationReadFailure(operationId, error);
      }
      const recovered = await journal.recover({
        operationId,
        inputDigest: original.inputDigest,
        reconcile: (record) => reconcileRecord(record, context)
      });
      const unresolved = !['succeeded', 'failed', 'refused', 'reconciled'].includes(recovered.state);
      return operationRecordResult(recovered, unresolved
        ? {
            kind: 'indeterminate',
            code: 'operation_still_indeterminate',
            message: `Operation '${operationId}' remains unresolved.`
          }
        : {
            code: recovered.state === 'reconciled' ? 'operation_reconciled' : 'operation_already_terminal',
            message: recovered.state === 'reconciled'
              ? `Operation '${operationId}' was reconciled from evidence.`
              : `Operation '${operationId}' was already terminal.`
          });
    }
  });
}

function operationReadFailure(operationId, error) {
  const code = normalizeJournalErrorCode(error?.code);
  const message = code === 'operation_record_missing_or_expired'
    ? `Operation record '${operationId}' is missing or expired.`
    : `Operation record '${operationId}' is unavailable.`;
  return {
    journalStatus: 'unavailable',
    outcome: { kind: 'failed', code, message, reusedExistingRun: false },
    resource: {
      kind: 'operation',
      id: operationId,
      status: code === 'operation_record_missing_or_expired' ? 'missing' : 'failed',
      projectRef: null,
      taskRef: null,
      runId: null,
      data: { operationId }
    },
    effects: { certainty: 'none', changed: false, evidenceRefs: [] },
    error: { code, message, details: boundedDetails(error?.details) },
    nextActions: []
  };
}

function normalizeJournalErrorCode(value) {
  const code = String(value ?? 'operation_record_unavailable');
  return /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/.test(code)
    ? code
    : 'operation_record_unavailable';
}

function boundedDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20));
}

function correlationFor(records) {
  if (records.length === 0) {
    return {
      code: 'operation_correlation_not_found',
      message: 'No operation record matched the bounded correlation query.',
      data: { status: 'none', operationId: null, candidateCount: 0 },
      nextActions: []
    };
  }
  if (records.length > 1) {
    return {
      code: 'operation_correlation_ambiguous',
      message: `Found ${records.length} matching operation records; no candidate was selected.`,
      data: { status: 'ambiguous', operationId: null, candidateCount: records.length },
      nextActions: []
    };
  }
  const operationId = records[0].operationId;
  return {
    code: 'operation_correlation_unique',
    message: `Found one matching operation record '${operationId}'.`,
    data: { status: 'unique', operationId, candidateCount: 1 },
    nextActions: [
      {
        kind: 'read',
        label: 'Read the original operation',
        operationName: 'operation.get',
        input: { operationId },
        reason: 'Inspect the unique original operation without replaying it.'
      },
      {
        kind: 'reconcile',
        label: 'Reconcile the original operation',
        operationName: 'operation.reconcile',
        input: { operationId },
        reason: 'Use live evidence to resolve the unique original operation without replaying it.'
      }
    ]
  };
}

function operationRecordResult(record, outcome = {}) {
  const unresolved = !['succeeded', 'failed', 'refused', 'reconciled'].includes(record.state);
  return {
    journalStatus: record.state,
    outcome: {
      kind: outcome.kind ?? 'succeeded',
      code: outcome.code,
      message: outcome.message,
      reusedExistingRun: false
    },
    resource: {
      kind: 'operation',
      id: record.operationId,
      status: operationResourceStatus(record.state),
      projectRef: record.projectRef?.projectId ?? null,
      taskRef: record.taskRef ?? null,
      runId: record.resourceRef?.runId ?? null,
      data: { record }
    },
    effects: {
      certainty: 'none',
      changed: false,
      evidenceRefs: record.effectEvidenceRefs ?? []
    },
    error: outcome.kind === 'indeterminate'
      ? { code: outcome.code, message: outcome.message, details: { journalState: record.state } }
      : null,
    nextActions: unresolved
      ? [{
          kind: 'reconcile',
          label: 'Reconcile operation evidence',
          operationName: 'operation.reconcile',
          input: { operationId: record.operationId },
          reason: 'The original operation is unresolved and must not be replayed.'
        }]
      : []
  };
}

function operationResourceStatus(state) {
  const statuses = {
    prepared: 'prepared',
    running: 'running',
    succeeded: 'completed',
    failed: 'failed',
    refused: 'refused',
    indeterminate: 'indeterminate',
    reconciled: 'reconciled'
  };
  return statuses[state] ?? 'unknown';
}

function requireJournal(journal) {
  if (!journal || typeof journal.get !== 'function' || typeof journal.list !== 'function' || typeof journal.recover !== 'function') {
    throw new TypeError('A journal with get, list, and recover methods is required.');
  }
  return journal;
}
