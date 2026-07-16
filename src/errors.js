export const ERROR_CODES = new Set([
  'config_not_found',
  'config_exists',
  'config_invalid',
  'alias_conflict',
  'unsupported_config_version',
  'state_version_unsupported',
  'project_root_escape',
  'scan_root_not_found',
  'scan_root_invalid',
  'task_not_found',
  'task_not_managed',
  'task_already_running',
  'duplicate_run',
  'start_in_progress',
  'task_command_failed',
  'command_usage_error',
  'port_conflict',
  'port_release_timeout',
  'project_not_found',
  'project_has_active_runs',
  'global_registry_invalid',
  'runtime_state_invalid',
  'process_not_found',
  'process_not_running',
  'run_not_found',
  'stop_failed',
  'ownership_not_verified',
  'external_process',
  'unknown_process_owner',
  'lock_busy',
  'project_lock_busy',
  'registry_lock_busy',
  'task_lock_busy',
  'log_not_found',
  'partial_failure',
  'confirmation_required',
  'clean_target_empty',
  'clean_target_root',
  'clean_target_outside_project',
  'clean_target_ambiguous',
  'clean_failed',
  'unsupported_option',
  'platform_unsupported',
  'adapter_failed',
  'agent_adapter_unsupported',
  'agent_source_invalid',
  'agent_target_conflict',
  'internal_error'
]);

export const ERROR_CODE_ALIASES = new Map([
  ['invalid_arguments', 'command_usage_error'],
  ['task_required', 'command_usage_error'],
  ['unknown_command', 'command_usage_error'],
  ['process_already_running', 'task_already_running'],
  ['run_already_exists', 'duplicate_run'],
  ['start_pending', 'start_in_progress'],
  ['project_lock_busy', 'lock_busy'],
  ['cwd_outside_project', 'project_root_escape'],
  ['log_path_outside_project', 'project_root_escape'],
  ['path_outside_project', 'project_root_escape'],
  ['clean_refuses_project_root', 'clean_target_root'],
  ['clean_path_outside_project', 'clean_target_outside_project']
]);

export class LaunchdeckError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'LaunchdeckError';
    this.code = code;
    if (details && Object.keys(details).length > 0) {
      this.details = details;
    }
  }
}

export function isKnownErrorCode(code) {
  return ERROR_CODES.has(code);
}

export function toContractErrorCode(code) {
  if (isKnownErrorCode(code)) {
    return code;
  }
  const alias = ERROR_CODE_ALIASES.get(code);
  return alias ?? 'internal_error';
}

export function toErrorPayload(error, options = {}) {
  const rawCode = error?.code ?? 'internal_error';
  const payload = {
    code: options.contractCode ? toContractErrorCode(rawCode) : rawCode,
    message: error?.message ?? String(error)
  };

  if (error?.details) {
    payload.details = error.details;
  }
  if (Array.isArray(error?.next)) {
    payload.next = error.next;
  }

  return payload;
}

export function toContractErrorPayload(error) {
  return toErrorPayload(error, { contractCode: true });
}
