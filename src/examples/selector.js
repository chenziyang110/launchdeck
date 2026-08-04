import * as clackPrompts from '@clack/prompts';
import { LaunchdeckError } from '../errors.js';

const DEFAULT_MESSAGE = 'Search and select an example to copy';
const DEFAULT_PLACEHOLDER = 'Type to search by name, stack, theme, or ID';
const DEFAULT_MAX_ITEMS = 10;

export class ExampleSelectionCancelledError extends Error {
  constructor(options = {}) {
    super('Example selection was cancelled.');
    this.name = 'ExampleSelectionCancelledError';
    this.code = 'example_selection_cancelled';
    this.announced = options.announced === true;
  }
}

export function createExampleSelector(options = {}) {
  const input = options.input ?? options.stdin ?? process.stdin;
  const output = options.output ?? process.stdout;
  const promptApi = options.promptApi ?? clackPrompts;
  const streams = { input, output };

  async function select(entries, settings = {}) {
    const value = await promptApi.autocomplete({
      message: settings.message ?? DEFAULT_MESSAGE,
      options: buildExampleChoices(entries),
      maxItems: settings.maxItems ?? DEFAULT_MAX_ITEMS,
      placeholder: settings.placeholder ?? DEFAULT_PLACEHOLDER,
      initialValue: settings.initialValue,
      initialUserInput: settings.initialUserInput,
      filter: settings.filter ?? filterExampleOption,
      ...streams
    });

    if (isPromptCancellation(promptApi, value)) {
      const announced = typeof promptApi.cancel === 'function';
      promptApi.cancel?.('Example selection cancelled.', streams);
      throw new ExampleSelectionCancelledError({ announced });
    }

    return value;
  }

  return {
    select,
    selectExample: select
  };
}

export async function resolveExampleSelection(selection = {}, overrides = {}) {
  const options = normalizeSelectionOptions(selection, overrides);
  if (hasExplicitId(options)) {
    return options.id;
  }

  if (options.json === true || options.compact === true || !hasInteractiveTTY(options)) {
    throw new LaunchdeckError(
      'command_usage_error',
      'An example ID is required in JSON, compact, or non-interactive mode. Use: launchdeck example copy <id> [destination].'
    );
  }

  const selector = options.selector ?? createExampleSelector(options);
  return selector.select(options.entries ?? options.catalog ?? [], options);
}

export const selectExample = resolveExampleSelection;
export const selectExampleId = resolveExampleSelection;

export function buildExampleChoices(entries = []) {
  return entries.map((entry) => ({
    value: entry.id,
    label: entry.title,
    hint: `${entry.stack} · ${entry.theme} · ${entry.id}`
  }));
}

export function filterExampleOption(search, option) {
  const query = String(search ?? '').trim().toLocaleLowerCase();
  if (!query) return true;

  return [option?.value, option?.label, option?.hint]
    .filter((value) => value !== undefined && value !== null)
    .some((value) => String(value).toLocaleLowerCase().includes(query));
}

export function hasInteractiveTTY(options = {}) {
  if (typeof options.isTTY === 'boolean') return options.isTTY;
  if (typeof options.terminal?.isTTY === 'boolean') return options.terminal.isTTY;

  const input = options.input ?? options.stdin ?? process.stdin;
  const output = options.output ?? process.stdout;
  return input?.isTTY === true && output?.isTTY === true;
}

function normalizeSelectionOptions(selection, overrides) {
  if (Array.isArray(selection)) {
    return { entries: selection, ...overrides };
  }
  return { ...(selection ?? {}), ...overrides };
}

function hasExplicitId(options) {
  return options.id !== undefined && options.id !== null;
}

function isPromptCancellation(promptApi, value) {
  return typeof promptApi.isCancel === 'function' && promptApi.isCancel(value);
}
