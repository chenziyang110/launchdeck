import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertEveryLineAtMost,
  assertInstallerEnvelope,
  assertNoAnsi,
  parseSingleJsonObject,
  runAgentCli
} from '../fixtures/agent-cli/cli-harness.js';

test('JSON lifecycle output writes exactly one schemaVersion 1 object to stdout and diagnostics to stderr', async () => {
  const result = await runAgentCli(['agent', 'setup', '--json', '--yes'], {
    serviceOptions: { diagnostics: ['probing codex', 'planned 1 target'] }
  });
  const payload = parseSingleJsonObject(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assertInstallerEnvelope(payload, 'agent setup');
  assert.doesNotMatch(result.stdout, /probing codex|planned 1 target/);
  assert.match(result.stderr, /probing codex/);
  assert.match(result.stderr, /planned 1 target/);
});

test('compact JSON preserves outcome scope build certainty drift and next action', async () => {
  const normal = await runAgentCli(['agent', 'status', '--json']);
  const compact = await runAgentCli(['agent', 'status', '--json', '--compact']);
  const payload = parseSingleJsonObject(compact.stdout);

  assert.equal(compact.status, 0, compact.stderr);
  assert.equal(compact.stdout.length < normal.stdout.length, true);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.ok, true);
  assert.equal(payload.command, 'agent status');
  assert.equal(payload.result.outcome, 'noop');
  assert.equal(payload.result.effectCertainty, 'none');
  assert.equal(payload.result.scope, 'project');
  assert.equal(typeof payload.result.buildIdentity, 'string');
  assert.equal(payload.result.health[0].state, 'drifted');
  assert.equal(payload.result.nextActions[0].command, 'launchdeck agent status --json');
});

test('human setup plan remains readable at 120 columns without relying on ANSI color', async () => {
  const result = await runAgentCli(['agent', 'setup', '--dry-run', '--no-color'], {
    terminal: { columns: 120, noColor: true }
  });

  assert.equal(result.status, 0, result.stderr);
  assertNoAnsi(result.stdout);
  assertEveryLineAtMost(result.stdout, 120);
  assert.match(result.stdout, /agent setup/i);
  assert.match(result.stdout, /planned/i);
  assert.match(result.stdout, /scope/i);
  assert.match(result.stdout, /project/i);
  assert.match(result.stdout, /build/i);
  assert.match(result.stdout, /effect certainty/i);
  assert.match(result.stdout, /next/i);
});

test('human refusal remains readable at 60 columns and keeps safe next action visible', async () => {
  const result = await runAgentCli(['agent', 'setup', '--yes', '--no-color'], {
    terminal: { columns: 60, noColor: true },
    serviceOptions: {
      outcomes: { setup: 'refused' },
      errors: {
        setup: {
          code: 'agent_pending_project_trust',
          message: 'Target planning refused.',
          details: {
            details: {
              message: 'Project trust approval is required before planning Codex MCP changes.'
            }
          }
        }
      }
    }
  });

  assert.equal(result.status, 1);
  assertNoAnsi(result.stdout + result.stderr);
  assertEveryLineAtMost(result.stdout + result.stderr, 60);
  assert.match(result.stdout + result.stderr, /refused/i);
  assert.match(result.stdout + result.stderr, /effect certainty/i);
  assert.match(result.stdout + result.stderr, /Error: \[agent_pending_project_trust\]/);
  assert.match(
    result.stdout + result.stderr,
    /Reason: Project trust approval is required before planning Codex MCP changes\./
  );
  assert.match(result.stdout + result.stderr, /launchdeck agent status --json/);
});

test('human status keeps drift state and severity visible at 60 columns without color', async () => {
  const result = await runAgentCli(['agent', 'status', '--no-color'], {
    terminal: { columns: 60, noColor: true }
  });

  assert.equal(result.status, 0, result.stderr);
  assertNoAnsi(result.stdout);
  assertEveryLineAtMost(result.stdout, 60);
  assert.match(result.stdout, /health/i);
  assert.match(result.stdout, /drifted/i);
  assert.match(result.stdout, /warn/i);
});

test('interactive decline wins over a latent pre-plan refusal without calling the lifecycle service', async () => {
  const result = await runAgentCli(['agent', 'setup'], {
    terminal: { isTTY: true, columns: 120 },
    inputAnswers: [false],
    serviceOptions: { outcomes: { setup: 'refused' } }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.input.prompts.length, 1);
  assert.match(String(result.input.prompts[0]), /approve|apply|install/i);
  assert.equal(result.service.calls.length, 0);
  assert.equal(result.service.writes().length, 0);
  assert.match(result.stdout, /cancelled/i);
  assert.match(result.stdout, /no effects|effect certainty:\s*none/i);
});

test('dry-run renders the complete plan without prompt or writes', async () => {
  const result = await runAgentCli(['agent', 'update', '--dry-run']);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.input.prompts.length, 0);
  assert.equal(result.service.calls.length, 1);
  assert.equal(result.service.calls[0].input.dryRun, true);
  assert.equal(result.service.writes().length, 0);
  assert.match(result.stdout, /planned/i);
  assert.match(result.stdout, /codex:project:skill/i);
});
