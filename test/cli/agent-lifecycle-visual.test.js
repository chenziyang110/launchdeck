import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUILD_IDENTITY,
  PLAN_DIGEST,
  assertEveryLineAtMost as assertCliEveryLineAtMost,
  assertNoAnsi as assertCliNoAnsi,
  parseSingleJsonObject,
  runAgentCli
} from '../fixtures/agent-cli/cli-harness.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(testDir, '..', 'fixtures', 'agent-cli-captures');

const CAPTURES = [
  { file: 'setup-plan-120.txt', columns: 120, mode: 'human' },
  { file: 'setup-plan-60.txt', columns: 60, mode: 'human' },
  { file: 'status-drift-no-color-120.txt', columns: 120, mode: 'no-color' },
  { file: 'doctor-error-no-color-60.txt', columns: 60, mode: 'no-color' },
  { file: 'compact-120.txt', columns: 120, mode: 'compact' },
  { file: 'compact-60.txt', columns: 60, mode: 'compact' },
  { file: 'json-status-drift.json', columns: 120, mode: 'json' },
  { file: 'approval-prompt-120.txt', columns: 120, mode: 'interactive' },
  { file: 'decline-cancelled-60.txt', columns: 60, mode: 'interactive' },
  { file: 'interrupt-recovery-60.txt', columns: 60, mode: 'interactive' }
];

test('terminal capture fixture set covers required widths, modes, and interaction states', () => {
  const names = new Set(CAPTURES.map((capture) => capture.file));

  assert.deepEqual([...names].sort(), [
    'approval-prompt-120.txt',
    'compact-120.txt',
    'compact-60.txt',
    'decline-cancelled-60.txt',
    'doctor-error-no-color-60.txt',
    'interrupt-recovery-60.txt',
    'json-status-drift.json',
    'setup-plan-120.txt',
    'setup-plan-60.txt',
    'status-drift-no-color-120.txt'
  ]);
  assert.equal(CAPTURES.some((capture) => capture.columns === 120 && capture.mode === 'human'), true);
  assert.equal(CAPTURES.some((capture) => capture.columns === 60 && capture.mode === 'human'), true);
  assert.equal(CAPTURES.some((capture) => capture.mode === 'no-color'), true);
  assert.equal(CAPTURES.some((capture) => capture.mode === 'compact'), true);
  assert.equal(CAPTURES.some((capture) => capture.mode === 'json'), true);
  assert.equal(CAPTURES.some((capture) => capture.file.includes('approval')), true);
  assert.equal(CAPTURES.some((capture) => capture.file.includes('decline')), true);
  assert.equal(CAPTURES.some((capture) => capture.file.includes('interrupt')), true);
});

test('real CLI renderer emits 120 and 60 column human plan output from deterministic lifecycle input', async () => {
  const cases = [
    { columns: 120, fixture: readCapture('setup-plan-120.txt') },
    { columns: 60, fixture: readCapture('setup-plan-60.txt') }
  ];

  for (const { columns, fixture } of cases) {
    const result = await runVisualCli(['agent', 'setup', '--dry-run', '--no-color'], {
      terminal: { columns, noColor: true },
      outcomes: { setup: 'planned' }
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.service.calls.length, 1);
    assert.equal(result.service.calls[0].input.dryRun, true);
    assert.equal(result.service.calls[0].input.terminal.columns, columns);
    assertCliNoAnsi(result.stdout);
    assertCliEveryLineAtMost(result.stdout, columns);
    assert.match(result.stdout, /agent setup: planned/);
    assert.match(result.stdout, /Scope: project/);
    assert.match(result.stdout, /Project: <PROJECT>/);
    assert.equal(
      result.stdout.replace(/\s+/g, '').includes(`Build:${BUILD_IDENTITY}`),
      true,
      'the complete build identity must survive width-bounded wrapping'
    );
    assert.match(result.stdout, /Effect certainty: none/);
    assert.match(result.stdout, /codex:project:skill/);
    assert.match(result.stdout, /codex:project:mcp/);
    assert.match(result.stdout, /No effects\./);
    assert.match(result.stdout, /launchdeck agent setup --yes/);
    assertOutputSharesFixtureContract(result.stdout, fixture);
  }
});

test('real CLI no-color status and doctor output preserve drift and health-gate semantics', async () => {
  const status = await runVisualCli(['agent', 'status', '--no-color'], {
    terminal: { columns: 120, noColor: true },
    outcomes: { status: 'succeeded' },
    health: { status: [{ targetId: 'codex:project:mcp', state: 'drifted', severity: 'warn' }] },
    nextActions: { status: [{ command: 'launchdeck agent repair --yes' }] }
  });
  const doctor = await runVisualCli(['agent', 'doctor', '--no-color'], {
    terminal: { columns: 60, noColor: true },
    outcomes: { doctor: 'refused' },
    health: { doctor: [{ targetId: 'codex:project:mcp', state: 'divergent', severity: 'error' }] },
    nextActions: { doctor: [{ command: 'launchdeck agent status --json' }] }
  });

  assert.equal(status.status, 0, status.stderr);
  assertCliNoAnsi(status.stdout);
  assertCliEveryLineAtMost(status.stdout, 120);
  assert.match(status.stdout, /agent status: succeeded/);
  assert.match(status.stdout, /Health:/);
  assert.match(status.stdout, /codex:project:mcp: drifted \(warn\)/);
  assert.match(status.stdout, /launchdeck agent repair --yes/);

  assert.equal(doctor.status, 1);
  assertCliNoAnsi(doctor.stdout + doctor.stderr);
  assertCliEveryLineAtMost(doctor.stdout + doctor.stderr, 60);
  assert.match(doctor.stdout + doctor.stderr, /agent doctor: refused/);
  assert.match(doctor.stdout + doctor.stderr, /codex:project:mcp: divergent \(error\)/);
  assert.match(doctor.stdout + doctor.stderr, /launchdeck agent status --json/);
});

test('real CLI compact JSON is one parseable schemaVersion 1 object without prompt prose', async () => {
  const result = await runVisualCli(['agent', 'status', '--json', '--compact'], {
    outcomes: { status: 'succeeded' },
    health: { status: [{ targetId: 'codex:project:mcp', state: 'drifted', severity: 'warn' }] },
    nextActions: { status: [{ command: 'launchdeck agent repair --yes' }] }
  });
  const payload = parseSingleJsonObject(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.input.prompts.length, 0);
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.ok, true);
  assert.equal(payload.command, 'agent status');
  assert.equal(payload.result.outcome, 'succeeded');
  assert.equal(payload.result.effectCertainty, 'complete');
  assert.equal(payload.result.scope, 'project');
  assert.equal(payload.result.projectIdentity, '<PROJECT>');
  assert.equal(payload.result.health[0].state, 'drifted');
  assert.equal(payload.result.nextActions[0].command, 'launchdeck agent repair --yes');
  assert.doesNotMatch(result.stdout, /Approve|Applying|Verifying|progress/i);
});

test('real CLI approval prompt decline and interrupt outputs expose effect certainty and safe actions', async () => {
  const approval = await runVisualCli(['agent', 'setup'], {
    terminal: { isTTY: true, columns: 120 },
    inputAnswers: [false],
    outcomes: { setup: 'cancelled' }
  });
  const decline = await runVisualCli(['agent', 'setup', '--no-color'], {
    terminal: { isTTY: true, columns: 60, noColor: true },
    inputAnswers: [false],
    outcomes: { setup: 'cancelled' },
    nextActions: { setup: [{ command: 'launchdeck agent setup --dry-run' }] }
  });
  const interrupt = await runVisualCli(['agent', 'update', '--yes', '--no-color'], {
    terminal: { columns: 60, noColor: true },
    outcomes: { update: 'indeterminate' },
    nextActions: { update: [{ command: 'launchdeck operation reconcile op_3333333333333333' }] }
  });

  assert.equal(approval.status, 0, approval.stderr);
  assert.equal(approval.input.prompts.length, 1);
  assert.match(String(approval.input.prompts[0]), /Approve and apply Launchdeck agent setup\?/);
  assert.equal(approval.service.calls.length, 0);

  assert.equal(decline.status, 0, decline.stderr);
  assertCliNoAnsi(decline.stdout);
  assertCliEveryLineAtMost(decline.stdout, 60);
  assert.match(decline.stdout, /agent setup: cancelled/);
  assert.match(decline.stdout, /Effect certainty: none/);
  assert.match(decline.stdout, /No effects\./);
  assert.match(decline.stdout, /launchdeck agent setup --dry-run/);

  assert.equal(interrupt.status, 1);
  assertCliNoAnsi(interrupt.stdout + interrupt.stderr);
  assertCliEveryLineAtMost(interrupt.stdout + interrupt.stderr, 60);
  assert.equal(interrupt.service.calls[0].input.approved, true);
  assert.match(interrupt.stdout + interrupt.stderr, /agent update: indeterminate/);
  assert.match(interrupt.stdout + interrupt.stderr, /Effect certainty: unknown/);
  assert.match(interrupt.stdout + interrupt.stderr, /launchdeck operation reconcile op_3333333333333333/);
});

test('text captures are deterministic, width bounded, redacted, and ANSI-free', () => {
  for (const capture of CAPTURES.filter((entry) => entry.mode !== 'json')) {
    const text = readCapture(capture.file);

    assertNoAnsi(text, capture.file);
    assertNoSecrets(text, capture.file);
    assertNoLivePaths(text, capture.file);
    assertNoTimestamps(text, capture.file);
    assertEveryLineAtMost(text, capture.columns, capture.file);
    if (capture.mode === 'compact') {
      assert.match(text, /\bnext="/, capture.file);
      assert.match(text, /\bscope=project\b/, capture.file);
      assert.match(text, /\bbuild=sha256:[a-f0-9]{12,64}/, capture.file);
      assert.match(text, /\beffects=/, capture.file);
    } else {
      assert.match(text, /Next action:/, capture.file);
      assert.match(text, /Scope: project/, capture.file);
      assert.match(text, /Build: sha256:[a-f0-9.]{12,64}/, capture.file);
      assert.match(text, /Effects:/, capture.file);
    }
  }
});

test('human captures preserve scope target build effects and safe action at 120 and 60 columns', () => {
  const wide = readCapture('setup-plan-120.txt');
  const narrow = readCapture('setup-plan-60.txt');

  for (const [text, digestPattern] of [
    [wide, /Plan digest: sha256:[a-f0-9]{64}/],
    [narrow, /Plan digest:\s+sha256:[a-f0-9]{12,64}\.{0,3}/]
  ]) {
    assert.match(text, /Agent setup/);
    assert.match(text, /State: plan-ready/);
    assert.match(text, /Target: codex project skill/);
    assert.match(text, /Target: codex project mcp/);
    assert.match(text, digestPattern);
    assert.match(text, /No files changed/);
    assert.match(text, /launchdeck agent setup --yes/);
  }
});

test('no-color captures keep drift and doctor health semantics without color meaning', () => {
  const status = readCapture('status-drift-no-color-120.txt');
  const doctor = readCapture('doctor-error-no-color-60.txt');

  assert.match(status, /Agent status/);
  assert.match(status, /Outcome: succeeded/);
  assert.match(status, /Health: drifted warn/);
  assert.match(status, /Exit: 0/);
  assert.match(status, /launchdeck agent repair --yes/);

  assert.match(doctor, /Agent doctor/);
  assert.match(doctor, /Health: divergent error/);
  assert.match(doctor, /Exit: 1/);
  assert.match(doctor, /launchdeck agent status --json/);
});

test('compact captures remain actionable at both widths', () => {
  for (const file of ['compact-120.txt', 'compact-60.txt']) {
    const text = readCapture(file);

    assert.match(text, /outcome=succeeded/);
    assert.match(text, /scope=project/);
    assert.match(text, /targets=codex:skill,codex:mcp/);
    assert.match(text, /effects=complete/);
    assert.match(text, /receipt=receipt_/);
    assert.match(text, /next="launchdeck agent status --json"/);
  }
});

test('JSON capture is one schemaVersion 1 object with no prompt or progress prose', () => {
  const text = readCapture('json-status-drift.json');
  const parsed = JSON.parse(text);

  assertNoAnsi(text, 'json-status-drift.json');
  assertNoSecrets(text, 'json-status-drift.json');
  assertNoLivePaths(text, 'json-status-drift.json');
  assertNoTimestamps(text, 'json-status-drift.json');
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command, 'agent status');
  assert.equal(parsed.result.outcome, 'succeeded');
  assert.equal(parsed.result.effectCertainty, 'none');
  assert.equal(parsed.result.scope, 'project');
  assert.equal(parsed.result.health[0].state, 'drifted');
  assert.equal(parsed.result.nextActions[0].command, 'launchdeck agent repair --yes');
  assert.doesNotMatch(text, /Approve|Applying|Verifying|progress/i);
});

test('approval decline and interrupt captures expose boundaries and recovery states', () => {
  const approval = readCapture('approval-prompt-120.txt');
  const decline = readCapture('decline-cancelled-60.txt');
  const interrupt = readCapture('interrupt-recovery-60.txt');

  assert.match(approval, /State: awaiting-approval/);
  assert.match(approval, /Default: No/);
  assert.match(approval, /Plan digest: sha256:[a-f0-9]{64}/);
  assert.match(approval, /Approve this exact plan\?/);

  assert.match(decline, /Outcome: cancelled/);
  assert.match(decline, /Effects: none/);
  assert.match(decline, /Receipt: none/);
  assert.match(decline, /No files changed/);

  assert.match(interrupt, /Outcome: indeterminate/);
  assert.match(interrupt, /Effects: unknown/);
  assert.match(interrupt, /operation reconcile op_/);
  assert.match(interrupt, /Previous build retained/);
});

function readCapture(file) {
  return fs.readFileSync(path.join(fixtureDir, file), 'utf8');
}

function assertEveryLineAtMost(text, columns, label) {
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    assert.equal(
      line.length <= columns,
      true,
      `${label}:${index + 1} exceeds ${columns} columns: ${line.length}`
    );
  }
}

function assertNoAnsi(text, label) {
  assert.doesNotMatch(text, /\x1B\[[0-?]*[ -/]*[@-~]/, label);
}

function assertNoSecrets(text, label) {
  assert.doesNotMatch(text, /(?:token|secret|password|authorization|api[_-]?key)\s*[:=]/i, label);
  assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9._-]+/i, label);
}

function assertNoLivePaths(text, label) {
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/, label);
  assert.doesNotMatch(text, /(?:^|\s)\/(?:Users|home|var|tmp|etc)\//m, label);
}

function assertNoTimestamps(text, label) {
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, label);
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/, label);
}

async function runVisualCli(args, options = {}) {
  const service = createVisualLifecycleService(options);
  return runAgentCli(args, {
    cwd: '<PROJECT>',
    env: {},
    inputAnswers: options.inputAnswers,
    service,
    terminal: {
      columns: options.terminal?.columns ?? 120,
      isTTY: options.terminal?.isTTY ?? true,
      noColor: options.terminal?.noColor ?? false
    }
  });
}

function createVisualLifecycleService(options = {}) {
  const calls = [];
  const api = {};
  for (const operation of ['setup', 'status', 'doctor', 'update', 'repair', 'uninstall', 'reconcile']) {
    api[operation] = async (input = {}) => {
      calls.push({ operation, input: structuredClone(input) });
      const outcome = options.outcomes?.[operation] ?? defaultOutcome(operation, input);
      return envelopeFor(operation, resultFor(operation, outcome, options));
    };
  }
  return {
    api,
    calls,
    writes: () => calls.filter((call) => call.input.dryRun !== true && call.input.approved === true)
  };
}

function envelopeFor(operation, result) {
  return {
    schemaVersion: 1,
    ok: !['refused', 'failed-and-rolled-back', 'partial', 'indeterminate'].includes(result.outcome),
    command: operation === 'reconcile' ? 'operation reconcile' : `agent ${operation}`,
    result
  };
}

function resultFor(operation, outcome, options) {
  const effectCertainty = {
    planned: 'none',
    cancelled: 'none',
    noop: 'none',
    succeeded: 'complete',
    refused: 'none',
    'failed-and-rolled-back': 'complete',
    partial: 'partial',
    indeterminate: 'unknown',
    reconciled: 'complete'
  }[outcome] ?? 'unknown';
  const effects = effectCertainty === 'none'
    ? []
    : [{ targetId: 'codex:project:skill', state: outcome }];
  return {
    outcome,
    effectCertainty,
    scope: 'project',
    projectIdentity: '<PROJECT>',
    buildIdentity: BUILD_IDENTITY,
    operationId: outcome === 'indeterminate' ? 'op_3333333333333333' : null,
    planDigest: PLAN_DIGEST,
    receiptId: outcome === 'succeeded' ? 'receipt_22222222222222222222222222222222' : null,
    targets: [
      { targetId: 'codex:project:skill', hostId: 'codex', component: 'skill', state: outcome },
      { targetId: 'codex:project:mcp', hostId: 'codex', component: 'mcp', state: outcome }
    ],
    health: options.health?.[operation] ?? [],
    effects,
    nextActions: options.nextActions?.[operation] ?? defaultNextActions(operation, outcome),
    error: ['refused', 'failed-and-rolled-back', 'partial', 'indeterminate'].includes(outcome)
      ? { code: `agent_${outcome.replaceAll('-', '_')}`, message: `Fixture ${outcome}.`, details: {} }
      : null
  };
}

function defaultOutcome(operation, input) {
  if (input.dryRun === true) return 'planned';
  if (input.approved === false) return 'cancelled';
  if (operation === 'status') return 'succeeded';
  if (operation === 'doctor') return 'succeeded';
  if (operation === 'reconcile') return 'reconciled';
  return 'succeeded';
}

function defaultNextActions(operation, outcome) {
  if (outcome === 'planned') return [{ command: `launchdeck agent ${operation} --yes` }];
  if (outcome === 'cancelled') return [{ command: `launchdeck agent ${operation} --dry-run` }];
  if (outcome === 'indeterminate') {
    return [{ command: 'launchdeck operation reconcile op_3333333333333333' }];
  }
  return [{ command: 'launchdeck agent status --json' }];
}

function assertOutputSharesFixtureContract(output, fixture) {
  for (const required of ['Scope:', 'Project:', 'Build:', 'Next']) {
    assert.equal(output.includes(required), true, `${required} missing from product output`);
    assert.equal(fixture.includes(required), true, `${required} missing from golden fixture`);
  }
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
