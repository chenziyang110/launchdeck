import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseSingleJsonObject,
  runAgentCli
} from '../fixtures/agent-cli/cli-harness.js';

test('agent paths keeps compatibility output and does not call the lifecycle mutator', async () => {
  const result = await runAgentCli(['agent', 'paths', '--json']);
  const payload = parseSingleJsonObject(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.service.calls.length, 0);
  assert.deepEqual(result.compatibility.calls.map((call) => call.operation), ['paths']);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.ok, true);
  assert.equal(payload.command, 'agent paths');
  assert.equal(payload.targets[0].agent, 'codex');
  assert.match(payload.targets[0].targetDir, /launchdeck-agent/);
});

test('agent doctor keeps compatibility diagnostics separate from lifecycle doctor', async () => {
  const result = await runAgentCli(['agent', 'doctor', '--compat', '--json']);
  const payload = parseSingleJsonObject(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.compatibility.calls.map((call) => call.operation), ['doctor']);
  assert.equal(result.service.calls.length, 0);
  assert.equal(payload.command, 'agent doctor');
  assert.equal(payload.checks[0].code, 'skill_target_readable');
});

test('Skill-only agent install dry-run remains planned and write-free', async () => {
  const result = await runAgentCli([
    'agent',
    'install',
    '--agent',
    'codex',
    '--scope',
    'project',
    '--dry-run',
    '--json'
  ]);
  const payload = parseSingleJsonObject(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.compatibility.calls.map((call) => call.operation), ['install']);
  assert.equal(result.service.calls.length, 0);
  assert.equal(result.compatibility.calls[0].input.dryRun, true);
  assert.equal(payload.status, 'planned');
  assert.equal(payload.result.status, 'planned');
  assert.equal(payload.result.actions.length, 1);
});

test('Skill-only agent install identical content remains noop without requiring lifecycle approval', async () => {
  const result = await runAgentCli([
    'agent',
    'install',
    '--agent',
    'codex',
    '--scope',
    'project',
    '--json'
  ]);
  const payload = parseSingleJsonObject(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.input.prompts.length, 0);
  assert.equal(result.compatibility.calls[0].input.yes, false);
  assert.equal(payload.status, 'noop');
  assert.equal(payload.result.current, true);
  assert.equal(payload.result.actions.length, 0);
});

test('lifecycle and compatibility commands preserve explicit paths and do not normalize them through cwd', async () => {
  const lifecycle = await runAgentCli([
    'agent',
    'setup',
    '--project',
    'F:\\workspace\\demo',
    '--json',
    '--yes'
  ]);
  const compatibility = await runAgentCli([
    'agent',
    'install',
    '--agent',
    'codex',
    '--target',
    'F:\\workspace\\demo\\.agents\\skills',
    '--dry-run',
    '--json'
  ]);

  assert.equal(lifecycle.service.calls[0].input.projectRoot, 'F:\\workspace\\demo');
  assert.equal(compatibility.compatibility.calls[0].input.target, 'F:\\workspace\\demo\\.agents\\skills');
  assert.equal(lifecycle.status, 0, lifecycle.stderr);
  assert.equal(compatibility.status, 0, compatibility.stderr);
});
