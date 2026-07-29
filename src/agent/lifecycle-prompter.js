import * as clackPrompts from '@clack/prompts';

const CHOICE_PRESENTATION = Object.freeze({
  codex: Object.freeze({ label: 'Codex', hint: 'OpenAI Codex CLI' }),
  'claude-code': Object.freeze({ label: 'Claude Code', hint: 'Anthropic Claude Code' }),
  'github-copilot': Object.freeze({ label: 'GitHub Copilot', hint: 'GitHub Copilot CLI' }),
  'visual-studio': Object.freeze({ label: 'Visual Studio', hint: 'Microsoft Visual Studio' }),
  runtime: Object.freeze({ label: 'Runtime', hint: 'Launchdeck lifecycle runtime' }),
  skill: Object.freeze({ label: 'Agent skill', hint: 'Host-specific agent instructions' }),
  mcp: Object.freeze({ label: 'MCP integration', hint: 'Launchdeck MCP server configuration' }),
  project: Object.freeze({ label: 'Current project', hint: 'Recommended' }),
  user: Object.freeze({ label: 'Current user', hint: 'Install for this user account' })
});

export class LifecyclePromptCancelledError extends Error {
  constructor(options = {}) {
    super('Launchdeck agent setup was cancelled.');
    this.name = 'LifecyclePromptCancelledError';
    this.code = 'agent_setup_cancelled';
    this.announced = options.announced === true;
  }
}

export function createLifecyclePrompter(options = {}) {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const promptApi = options.promptApi ?? clackPrompts;
  const streams = { input, output };

  function guardCancellation(value) {
    if (promptApi.isCancel(value)) {
      const announced = typeof promptApi.cancel === 'function';
      promptApi.cancel?.('Setup cancelled.', streams);
      throw new LifecyclePromptCancelledError({ announced });
    }
    return value;
  }

  return {
    async select(message, choices, settings = {}) {
      return guardCancellation(await promptApi.select({
        message,
        options: choices.map(promptChoice),
        initialValue: settings.initialValue,
        ...streams
      }));
    },
    async selectMany(message, choices, settings = {}) {
      return guardCancellation(await promptApi.multiselect({
        message,
        options: choices.map(promptChoice),
        initialValues: settings.initialValues,
        required: settings.required ?? true,
        ...streams
      }));
    },
    async selectSearchableMany(message, choices, settings = {}) {
      return guardCancellation(await promptApi.autocompleteMultiselect({
        message,
        options: choices.map(promptChoice),
        initialValues: settings.initialValues,
        maxItems: settings.maxItems,
        placeholder: settings.placeholder ?? 'Type to search by name or ID',
        required: settings.required ?? true,
        ...streams
      }));
    },
    async confirm(message, settings = {}) {
      return guardCancellation(await promptApi.confirm({
        message,
        initialValue: settings.initialValue ?? false,
        active: settings.active ?? 'Install',
        inactive: settings.inactive ?? 'Cancel',
        ...streams
      }));
    }
  };
}

function promptChoice(choice) {
  if (choice && typeof choice === 'object') return choice;
  const value = String(choice);
  return {
    value,
    ...(CHOICE_PRESENTATION[value] ?? { label: value })
  };
}
