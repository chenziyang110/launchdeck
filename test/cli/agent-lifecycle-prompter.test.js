import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  createLifecyclePrompter,
  LifecyclePromptCancelledError
} from '../../src/agent/lifecycle-prompter.js';

test('lifecycle prompter renders labeled keyboard multi-select choices', async () => {
  const calls = [];
  const input = new PassThrough();
  const output = new PassThrough();
  const prompter = createLifecyclePrompter({
    input,
    output,
    promptApi: {
      async multiselect(options) {
        calls.push(options);
        return ['codex', 'github-copilot'];
      },
      isCancel() {
        return false;
      }
    }
  });

  const selected = await prompter.selectMany(
    'Select available agent host(s)',
    ['codex', 'claude-code', 'github-copilot', 'visual-studio'],
    { initialValues: ['codex'] }
  );

  assert.deepEqual(selected, ['codex', 'github-copilot']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, input);
  assert.equal(calls[0].output, output);
  assert.equal(calls[0].required, true);
  assert.deepEqual(calls[0].initialValues, ['codex']);
  assert.deepEqual(calls[0].options, [
    { value: 'codex', label: 'Codex', hint: 'OpenAI Codex CLI' },
    { value: 'claude-code', label: 'Claude Code', hint: 'Anthropic Claude Code' },
    { value: 'github-copilot', label: 'GitHub Copilot', hint: 'GitHub Copilot CLI' },
    { value: 'visual-studio', label: 'Visual Studio', hint: 'Microsoft Visual Studio' }
  ]);
});

test('lifecycle prompter uses single-select and choice-based confirmation defaults', async () => {
  const calls = [];
  const input = new PassThrough();
  const output = new PassThrough();
  const promptApi = {
    async select(options) {
      calls.push({ kind: 'select', options });
      return 'project';
    },
    async confirm(options) {
      calls.push({ kind: 'confirm', options });
      return true;
    },
    isCancel() {
      return false;
    }
  };
  const prompter = createLifecyclePrompter({ input, output, promptApi });

  assert.equal(await prompter.select(
    'Select installation scope',
    ['project', 'user'],
    { initialValue: 'project' }
  ), 'project');
  assert.equal(await prompter.confirm('Approve and apply Launchdeck agent setup?'), true);

  assert.deepEqual(calls[0].options.options, [
    { value: 'project', label: 'Current project', hint: 'Recommended' },
    { value: 'user', label: 'Current user', hint: 'Install for this user account' }
  ]);
  assert.equal(calls[0].options.initialValue, 'project');
  assert.equal(calls[1].options.initialValue, false);
  assert.equal(calls[1].options.active, 'Install');
  assert.equal(calls[1].options.inactive, 'Cancel');
});

test('lifecycle prompter turns Ctrl+C into a typed cancellation', async () => {
  const cancelled = Symbol('cancelled');
  let cancellationMessage;
  const prompter = createLifecyclePrompter({
    promptApi: {
      async select() {
        return cancelled;
      },
      isCancel(value) {
        return value === cancelled;
      },
      cancel(message) {
        cancellationMessage = message;
      }
    }
  });

  await assert.rejects(() => prompter.select(
    'Select installation scope',
    ['project', 'user']
  ), (error) => {
    assert.equal(error instanceof LifecyclePromptCancelledError, true);
    assert.equal(error.announced, true);
    return true;
  });
  assert.equal(cancellationMessage, 'Setup cancelled.');
});
