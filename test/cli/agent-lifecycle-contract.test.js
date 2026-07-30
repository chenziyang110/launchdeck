import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { LifecyclePromptCancelledError } from '../../src/agent/lifecycle-prompter.js';

import {
  BUILD_IDENTITY,
  assertInstallerEnvelope,
  parseSingleJsonObject,
  runAgentCli
} from '../fixtures/agent-cli/cli-harness.js';

test('agent help discovers every lifecycle command and lifecycle selection flag', async () => {
  const result = await runAgentCli(['agent', '--help']);

  assert.equal(result.status, 0, result.stderr);
  for (const expected of [
    'agent setup',
    'agent status',
    'agent doctor',
    'agent update',
    'agent repair',
    'agent uninstall',
    'agent paths',
    'agent install',
    '--host <agent-id[,agent-id...]>',
    '--component <runtime|skill|mcp>',
    '--scope <project|user>',
    '--project <path>',
    '--build <sha256:...|packaged>',
    '--dry-run',
    '--yes',
    '--json',
    '--compact',
    '--force',
    'Searchable Agent targets: 76',
    'Full Runtime/Skill/MCP integration: codex'
  ]) {
    assert.match(result.stdout, escapePattern(expected));
  }
});

test('setup from npx and installed entrypoints route to the same shared lifecycle service input', async () => {
  const projectRoot = path.resolve('workspace', 'demo');
  const installed = await runAgentCli([
    'agent',
    'setup',
    '--host',
    'codex,claude',
    '--host',
    'visual-studio',
    '--component',
    'skill,mcp',
    '--component',
    'runtime',
    '--scope',
    'user',
    '--project',
    projectRoot,
    '--build',
    BUILD_IDENTITY,
    '--dry-run',
    '--json',
    '--compact'
  ], { entrypoint: 'installed' });
  const npx = await runAgentCli([
    'agent',
    'setup',
    '--host',
    'codex,claude',
    '--host',
    'visual-studio',
    '--component',
    'skill,mcp',
    '--component',
    'runtime',
    '--scope',
    'user',
    '--project',
    projectRoot,
    '--build',
    BUILD_IDENTITY,
    '--dry-run',
    '--json',
    '--compact'
  ], { entrypoint: 'npx' });

  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(npx.status, 0, npx.stderr);
  assert.equal(installed.service.calls.length, 1);
  assert.equal(npx.service.calls.length, 1);
  assert.equal(installed.service.calls[0].operation, 'setup');
  assert.equal(npx.service.calls[0].operation, 'setup');
  assert.deepEqual(
    stripEntrypoint(installed.service.calls[0].input),
    stripEntrypoint(npx.service.calls[0].input)
  );
  assert.deepEqual(installed.service.calls[0].input.hosts, ['codex', 'claude', 'visual-studio']);
  assert.deepEqual(installed.service.calls[0].input.components, ['skill', 'mcp', 'runtime']);
  assert.equal(installed.service.calls[0].input.scope, 'user');
  assert.equal(installed.service.calls[0].input.projectRoot, projectRoot);
  assert.equal(installed.service.calls[0].input.build, BUILD_IDENTITY);
  assert.equal(installed.service.calls[0].input.dryRun, true);
  assert.equal(installed.service.calls[0].input.json, true);
  assert.equal(installed.service.calls[0].input.compact, true);
});

test('status doctor update repair and uninstall delegate to the shared lifecycle service', async () => {
  const cases = [
    [['agent', 'status', '--json'], 'status', 'agent status'],
    [['agent', 'doctor', '--json'], 'doctor', 'agent doctor'],
    [['agent', 'update', '--json', '--yes'], 'update', 'agent update'],
    [['agent', 'repair', '--json', '--yes', '--force'], 'repair', 'agent repair'],
    [['agent', 'uninstall', '--json', '--yes'], 'uninstall', 'agent uninstall']
  ];

  for (const [argv, operation, command] of cases) {
    const result = await runAgentCli(argv);
    const payload = parseSingleJsonObject(result.stdout);

    assert.equal(result.service.calls.length, 1, argv.join(' '));
    assert.equal(result.service.calls[0].operation, operation);
    assertInstallerEnvelope(payload, command);
    assert.equal(result.status, payload.ok ? 0 : 1);
    assert.equal(result.service.calls[0].input.force, argv.includes('--force'));
  }
});

test('lifecycle commands resolve a relative project path against the invocation cwd', async () => {
  const cwd = path.resolve('workspace', 'demo');
  const result = await runAgentCli(
    ['agent', 'status', '--project', '.', '--json'],
    { cwd }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.service.calls.length, 1);
  assert.equal(result.service.calls[0].input.projectRoot, path.resolve(cwd));
});

test('operation reconcile uses the universal journal dispatcher without constructing a lifecycle authority', async () => {
  const result = await runAgentCli(
    ['operation', 'reconcile', 'op_fixture_factory_0001', '--json'],
    { useLifecycleFactory: true }
  );
  const payload = parseSingleJsonObject(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(result.factoryCalls.length, 0);
  assert.deepEqual(result.service.calls, []);
  assert.equal(payload.command, 'operation.reconcile');
  assert.equal(payload.data.agentResult.outcome.code, 'operation_record_missing_or_expired');
});

test('default lifecycle factory receives the catalog-extended provider registry', async () => {
  const projectRoot = path.resolve('workspace', 'demo');
  const result = await runAgentCli(
    ['agent', 'status', '--json'],
    { useLifecycleFactory: true }
  );

  assert.equal(result.factoryCalls.length, 1);
  const registry = result.factoryCalls[0].registry;
  assert.equal(typeof registry?.list, 'function');
  assert.equal(typeof registry?.get, 'function');
  assert.deepEqual(registry.list().slice(0, 4).map((entry) => entry.id), [
    'codex',
    'claude-code',
    'github-copilot',
    'visual-studio'
  ]);
  assert.equal(registry.get('cursor')?.id, 'cursor');

  const resolved = await registry.get('cursor').resolveTargets({
    scope: 'project',
    projectRoot,
    components: ['skill']
  });
  assert.equal(resolved[0]?.targetId, 'cursor:project:skill');
  assert.equal(
    resolved[0]?.path,
    path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent')
  );
});

test('interactive setup selects searchable Agent targets then valid components scope and approval', async () => {
  const prompts = [];
  const input = {
    async selectMany(prompt, choices, settings) {
      prompts.push({ kind: 'selectMany', prompt, choices, settings });
      return ['skill'];
    },
    async selectSearchableMany(prompt, choices, settings) {
      prompts.push({ kind: 'selectSearchableMany', prompt, choices, settings });
      return ['cursor'];
    },
    async select(prompt, choices, settings) {
      prompts.push({ kind: 'select', prompt, choices, settings });
      return 'project';
    },
    async confirm(prompt) {
      prompts.push({ kind: 'confirm', prompt });
      return true;
    }
  };

  const result = await runAgentCli(['agent', 'setup'], {
    input,
    terminal: { isTTY: true }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.service.calls[0].input.hosts, ['cursor']);
  assert.deepEqual(result.service.calls[0].input.components, ['skill']);
  assert.equal(result.service.calls[0].input.scope, 'project');
  assert.equal(result.service.calls[0].input.interactive, true);
  assert.equal(result.service.calls[0].input.approved, true);
  assert.deepEqual(prompts.map(({ kind }) => kind), [
    'selectSearchableMany',
    'selectMany',
    'select',
    'confirm'
  ]);
  assert.equal(prompts[0].choices.some((choice) => choice.value === 'cursor'), true);
  assert.match(prompts[0].choices.find((choice) => choice.value === 'cursor').hint, /Skill installable/);
  assert.doesNotMatch(prompts[0].choices.find((choice) => choice.value === 'cursor').hint, /Skill-only/);
  assert.deepEqual(prompts[0].settings, { initialValues: [] });
  assert.deepEqual(prompts[1].choices, ['skill']);
  assert.deepEqual(prompts[1].settings, { initialValues: ['skill'] });
  assert.deepEqual(prompts[2].settings, { initialValue: 'project' });
});

test('mixed Agent selection only offers components installable for every selected target', async () => {
  const prompts = [];
  const result = await runAgentCli(['agent', 'setup'], {
    terminal: { isTTY: true },
    input: {
      async selectSearchableMany() {
        return ['cursor', 'claude-code'];
      },
      async selectMany(prompt, choices, settings) {
        prompts.push({ prompt, choices, settings });
        return ['skill'];
      },
      async select() {
        return 'project';
      },
      async confirm() {
        return true;
      }
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(prompts[0], {
    prompt: 'Select component(s)',
    choices: ['skill'],
    settings: { initialValues: ['skill'] }
  });
  assert.deepEqual(result.service.calls[0].input.hosts, ['cursor', 'claude-code']);
});

test('empty Agent selection cancels before planning or writes', async () => {
  const result = await runAgentCli(['agent', 'setup'], {
    terminal: { isTTY: true },
    input: {
      async selectSearchableMany() {
        return [];
      }
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agent setup: cancelled/i);
  assert.deepEqual(result.service.calls, []);
});

test('Skill-only host aliases sharing one destination are planned once', async () => {
  const result = await runAgentCli([
    'agent',
    'setup',
    '--host',
    'cursor,cline',
    '--component',
    'skill',
    '--scope',
    'project',
    '--dry-run',
    '--json',
    '--yes'
  ], { cwd: 'F:\\workspace\\demo' });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.service.calls[0].input.hosts, ['cursor']);
});

test('Ctrl+C exits interactive setup as cancelled before planning or writes', async () => {
  const result = await runAgentCli(['agent', 'setup'], {
    terminal: { isTTY: true },
    input: {
      async selectMany() {
        throw new LifecyclePromptCancelledError();
      },
      async selectSearchableMany() {
        throw new LifecyclePromptCancelledError();
      }
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agent setup: cancelled/i);
  assert.deepEqual(result.service.calls, []);
});

test('JSON and non-interactive setup never prompt and preserve missing selections for typed refusal', async () => {
  const input = {
    prompts: [],
    async select() {
      this.prompts.push('select');
      return 'project';
    },
    async selectMany() {
      this.prompts.push('selectMany');
      return ['codex'];
    },
    async confirm() {
      this.prompts.push('confirm');
      return true;
    }
  };

  const result = await runAgentCli(['agent', 'setup', '--json'], {
    input,
    terminal: { isTTY: false }
  });

  assert.deepEqual(input.prompts, []);
  assert.equal(result.service.calls[0].input.interactive, false);
  assert.equal(result.service.calls[0].input.requireExplicitSelection, true);
  assert.equal(result.service.calls[0].input.hosts, undefined);
  assert.equal(result.service.calls[0].input.components, undefined);
  assert.equal(result.service.calls[0].input.scope, undefined);
});

test('lifecycle terminal outcomes map only to process exits 0 or 1 with stable next actions', async () => {
  const cases = [
    ['planned', 0],
    ['cancelled', 0],
    ['noop', 0],
    ['succeeded', 0],
    ['refused', 1],
    ['failed-and-rolled-back', 1],
    ['partial', 1],
    ['indeterminate', 1],
    ['reconciled', 0]
  ];

  for (const [outcome, expectedExit] of cases) {
    const result = await runAgentCli(['agent', 'setup', '--json', '--yes'], {
      serviceOptions: { outcomes: { setup: outcome } }
    });
    const payload = parseSingleJsonObject(result.stdout);

    assert.equal(result.status, expectedExit, outcome);
    assert.equal([0, 1].includes(result.status), true);
    assert.equal(payload.result.outcome, outcome);
    assert.equal(Array.isArray(payload.result.nextActions), true);
    assert.equal(payload.result.nextActions.length > 0, true);
  }
});

test('doctor error health exits 1 while status with the same read-only health exits 0', async () => {
  const health = [{
    targetId: 'codex:project:skill',
    state: 'divergent',
    severity: 'error',
    ownership: 'foreign'
  }];
  const calls = [];
  const service = {
    api: {
      async status() {
        calls.push('status');
        return diagnosticEnvelope('agent status', 'noop', health);
      },
      async doctor() {
        calls.push('doctor');
        return diagnosticEnvelope('agent doctor', 'succeeded', health);
      }
    }
  };

  const status = await runAgentCli(['agent', 'status', '--json'], { service });
  const doctor = await runAgentCli(['agent', 'doctor', '--json'], { service });

  assert.equal(status.status, 0);
  assert.equal(doctor.status, 1);
  assert.equal(parseSingleJsonObject(status.stdout).ok, true);
  assert.equal(parseSingleJsonObject(doctor.stdout).ok, true);
  assert.deepEqual(calls, ['status', 'doctor']);
});

test('automation setup in JSON mode refuses before writes unless Launchdeck --yes is explicit', async () => {
  const result = await runAgentCli(['agent', 'setup', '--json'], { entrypoint: 'npx' });
  const payload = parseSingleJsonObject(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(result.input.prompts.length, 0);
  assert.equal(result.service.calls.length, 1);
  assert.equal(result.service.calls[0].input.yes, false);
  assert.equal(result.service.calls[0].input.npmYes, false);
  assert.equal(result.service.writes().length, 0);
  assert.equal(payload.ok, false);
  assert.equal(payload.result.outcome, 'refused');
  assert.equal(payload.result.effectCertainty, 'none');
  assert.deepEqual(payload.result.effects, []);
});

function stripEntrypoint(input) {
  const { entrypoint, ...rest } = input;
  return rest;
}

function diagnosticEnvelope(command, outcome, health) {
  return {
    schemaVersion: 1,
    ok: true,
    command,
    result: {
      outcome,
      effectCertainty: 'complete',
      scope: 'project',
      projectIdentity: 'F:\\workspace\\demo',
      buildIdentity: BUILD_IDENTITY,
      operationId: null,
      planDigest: `sha256:${'b'.repeat(64)}`,
      receiptId: 'receipt_live',
      targets: [],
      health,
      effects: [],
      nextActions: [{ command: 'launchdeck agent repair' }],
      error: null
    }
  };
}

function escapePattern(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}
