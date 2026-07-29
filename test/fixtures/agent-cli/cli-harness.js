import assert from 'node:assert/strict';

import { main } from '../../../src/cli.js';

export const BUILD_IDENTITY = `sha256:${'a'.repeat(64)}`;
export const PLAN_DIGEST = `sha256:${'b'.repeat(64)}`;

export async function runAgentCli(args, options = {}) {
  const terminal = createTerminal(options.terminal);
  const service = options.service ?? createRecordingLifecycleService(options.serviceOptions);
  const compatibility = options.compatibility ?? createRecordingCompatibilityFacade(options.compatibilityOptions);
  const input = options.input ?? createInput(options.inputAnswers ?? []);

  const factoryCalls = [];
  const dependencies = {
    agentCompatibilityFacade: compatibility.api,
    input,
    entrypoint: options.entrypoint ?? 'installed',
    env: options.env ?? {},
    cwd: options.cwd ?? 'F:\\workspace\\demo',
    packageBuildIdentity: BUILD_IDENTITY
  };
  if (options.useLifecycleFactory === true) {
    dependencies.agentLifecycleServiceFactory = (factoryOptions) => {
      factoryCalls.push(factoryOptions);
      return service.api;
    };
  } else {
    dependencies.agentLifecycleService = service.api;
  }

  const status = await main(args, terminal, dependencies);

  return {
    status,
    stdout: terminal.stdoutText(),
    stderr: terminal.stderrText(),
    terminal,
    input,
    service,
    compatibility,
    factoryCalls
  };
}

export function createRecordingLifecycleService(options = {}) {
  const calls = [];
  const outcomes = options.outcomes ?? {};
  const errors = options.errors ?? {};
  const diagnostics = options.diagnostics ?? [];
  const api = {};

  for (const operation of ['setup', 'status', 'doctor', 'update', 'repair', 'uninstall', 'reconcile']) {
    api[operation] = async (input = {}) => {
      calls.push({ operation, input: structuredClone(input) });
      if (Array.isArray(diagnostics) && diagnostics.length > 0) {
        for (const line of diagnostics) input.terminal?.stderr?.write(`${line}\n`);
      }
      const outcome = outcomes[operation] ?? defaultOutcomeFor(operation, input);
      return envelope(commandFor(operation), installerResult(outcome, errors[operation]));
    };
  }

  return {
    api,
    calls,
    writes: () => calls.filter((call) => call.input.dryRun !== true && call.input.approved === true)
  };
}

export function createRecordingCompatibilityFacade(options = {}) {
  const calls = [];
  const api = {
    paths(input = {}) {
      calls.push({ operation: 'paths', input: structuredClone(input) });
      return {
        schemaVersion: 1,
        ok: true,
        command: 'agent paths',
        status: 'ok',
        targets: [
          {
            agent: 'codex',
            scope: 'project',
            skillRoot: 'F:\\workspace\\demo\\.agents\\skills',
            targetDir: 'F:\\workspace\\demo\\.agents\\skills\\launchdeck-agent'
          }
        ]
      };
    },
    doctor(input = {}) {
      calls.push({ operation: 'doctor', input: structuredClone(input) });
      return {
        schemaVersion: 1,
        ok: true,
        command: 'agent doctor',
        status: 'ok',
        checks: [{ code: 'skill_target_readable', status: 'ok' }]
      };
    },
    install(input = {}) {
      calls.push({ operation: 'install', input: structuredClone(input) });
      return {
        schemaVersion: 1,
        ok: true,
        command: 'agent install',
        status: input.dryRun ? 'planned' : 'noop',
        result: {
          status: input.dryRun ? 'planned' : 'noop',
          actions: input.dryRun ? [{ type: 'copy', relativePath: 'SKILL.md' }] : [],
          current: !input.dryRun,
          divergent: Boolean(options.divergent)
        },
        targets: [
          {
            agent: input.agent ?? 'codex',
            scope: input.scope ?? 'project',
            targetDir: 'F:\\workspace\\demo\\.agents\\skills\\launchdeck-agent'
          }
        ]
      };
    }
  };
  return { api, calls };
}

export function assertInstallerEnvelope(payload, command) {
  assert.deepEqual(Object.keys(payload), ['schemaVersion', 'ok', 'command', 'result']);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.command, command);
  assert.equal(typeof payload.ok, 'boolean');
  assert.equal(typeof payload.result.outcome, 'string');
  assert.equal(typeof payload.result.effectCertainty, 'string');
  assert.equal(Array.isArray(payload.result.targets), true);
  assert.equal(Array.isArray(payload.result.health), true);
  assert.equal(Array.isArray(payload.result.effects), true);
  assert.equal(Array.isArray(payload.result.nextActions), true);
}

export function parseSingleJsonObject(stdout) {
  const trimmed = stdout.trim();
  assert.match(trimmed, /^\{[\s\S]*\}$/);
  const payload = JSON.parse(trimmed);
  assert.equal(JSON.stringify(payload) === trimmed || `${JSON.stringify(payload, null, 2)}` === trimmed, true);
  return payload;
}

export function assertNoAnsi(value) {
  assert.doesNotMatch(value, /\x1B\[[0-?]*[ -/]*[@-~]/);
}

export function assertEveryLineAtMost(value, columns) {
  for (const line of value.split(/\r?\n/).filter(Boolean)) {
    assert.ok(line.length <= columns, `line exceeds ${columns} columns: ${line}`);
  }
}

function createTerminal(options = {}) {
  const stdout = [];
  const stderr = [];
  return {
    columns: options.columns ?? 120,
    isTTY: options.isTTY ?? true,
    noColor: options.noColor ?? false,
    stdout: { write: (value) => stdout.push(String(value)) },
    stderr: { write: (value) => stderr.push(String(value)) },
    stdoutText: () => stdout.join(''),
    stderrText: () => stderr.join('')
  };
}

function createInput(answers) {
  const prompts = [];
  return {
    prompts,
    async confirm(prompt) {
      prompts.push(prompt);
      return answers.length > 0 ? answers.shift() : false;
    }
  };
}

function defaultOutcomeFor(operation, input) {
  if (input.dryRun === true) return 'planned';
  if (input.approved === false) return 'cancelled';
  if (input.json === true && input.yes !== true && ['setup', 'update', 'repair', 'uninstall'].includes(operation)) {
    return 'refused';
  }
  if (operation === 'status') return 'noop';
  if (operation === 'doctor') return 'succeeded';
  if (operation === 'reconcile') return 'reconciled';
  return 'succeeded';
}

function commandFor(operation) {
  if (operation === 'reconcile') return 'operation reconcile';
  return `agent ${operation}`;
}

function envelope(command, result) {
  return {
    schemaVersion: 1,
    ok: !['refused', 'failed-and-rolled-back', 'partial', 'indeterminate'].includes(result.outcome),
    command,
    result
  };
}

function installerResult(outcome, errorOverride = null) {
  const certainty = {
    planned: 'none',
    cancelled: 'none',
    noop: 'none',
    succeeded: 'complete',
    refused: 'none',
    'failed-and-rolled-back': 'complete',
    partial: 'partial',
    indeterminate: 'unknown',
    reconciled: 'complete'
  }[outcome];
  const failed = ['refused', 'failed-and-rolled-back', 'partial', 'indeterminate'].includes(outcome);
  return {
    outcome,
    effectCertainty: certainty,
    scope: 'project',
    projectIdentity: 'F:\\workspace\\demo',
    buildIdentity: BUILD_IDENTITY,
    operationId: certainty === 'none' ? null : `op_${outcome.replaceAll('-', '_')}`,
    planDigest: PLAN_DIGEST,
    receiptId: outcome === 'succeeded' ? 'receipt_succeeded' : null,
    targets: [{ targetId: 'codex:project:skill', hostId: 'codex', component: 'skill', state: outcome }],
    health: outcome === 'noop' ? [{ targetId: 'codex:project:skill', state: 'drifted', severity: 'warn' }] : [],
    effects: certainty === 'none' ? [] : [{ targetId: 'codex:project:skill', state: outcome }],
    nextActions: [{ command: 'launchdeck agent status --json', risk: 'safe' }],
    error: failed
      ? (errorOverride ?? {
          code: `agent_${outcome.replaceAll('-', '_')}`,
          message: `Fixture ${outcome}.`,
          details: {}
        })
      : null
  };
}
