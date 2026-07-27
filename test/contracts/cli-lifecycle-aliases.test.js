import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  CLI_MUTATION_ROUTES,
  CLI_OPERATION_ROUTES,
  mapCliInvocation
} from '../../src/adapters/cli-operation-map.js';

const cliSource = fs.readFileSync(new URL('../../src/cli.js', import.meta.url), 'utf8');
const operationMapSource = fs.readFileSync(
  new URL('../../src/adapters/cli-operation-map.js', import.meta.url),
  'utf8'
);

test('public up/down aliases map to existing start/stop Agent operation authorities', () => {
  const context = {
    agentEligible: true,
    projectRef: 'project-alpha',
    taskRef: 'dev'
  };

  assert.deepEqual(
    mapCliInvocation({ positionals: ['start', 'dev'], options: {}, context }),
    mapCliInvocation({ positionals: ['up', 'dev'], options: {}, context })
  );
  assert.deepEqual(
    mapCliInvocation({ positionals: ['up', 'dev'], options: {}, context }),
    {
      operation: 'task.start',
      input: { projectRef: 'project-alpha', taskRef: 'dev' }
    }
  );

  assert.deepEqual(
    mapCliInvocation({ positionals: ['stop', 'dev'], options: {}, context }),
    mapCliInvocation({ positionals: ['down', 'dev'], options: {}, context })
  );
  assert.deepEqual(
    mapCliInvocation({ positionals: ['down', 'dev'], options: {}, context }),
    {
      operation: 'task.stop',
      input: { projectRef: 'project-alpha', taskRef: 'dev' }
    }
  );
});

test('start and stop remain compatible public commands while aliases are additive', () => {
  assert.deepEqual(
    CLI_MUTATION_ROUTES.filter((route) => ['start', 'up'].includes(route.route)),
    [
      { route: 'start', operation: 'task.start', kind: 'mutation' },
      { route: 'up', operation: 'task.start', kind: 'mutation' }
    ]
  );
  assert.deepEqual(
    CLI_MUTATION_ROUTES.filter((route) => ['stop', 'down'].includes(route.route)),
    [
      { route: 'stop', operation: 'task.stop', kind: 'mutation' },
      { route: 'down', operation: 'task.stop', kind: 'mutation' }
    ]
  );
  assert.equal(CLI_OPERATION_ROUTES.some((route) => route.route === 'up' || route.route === 'down'), false);
});

test('help advertises up/down aliases without removing start/stop JSON compact or human surfaces', () => {
  for (const command of ['launchdeck start', 'launchdeck stop']) {
    assert.match(cliSource, new RegExp(`${escapePattern(command)}[^\\n]*\\[--json\\] \\[--compact\\]`));
  }
  for (const command of ['launchdeck up', 'launchdeck down']) {
    assert.match(cliSource, new RegExp(`${escapePattern(command)}[^\\n]*\\[--json\\] \\[--compact\\]`));
  }
  assert.match(cliSource, /Started \$\{[^}]+}\.\$\{[^}]+}|\`Started \$\{[^}]+}/);
  assert.match(cliSource, /Stopped \$\{[^}]+}\.\$\{[^}]+}|\`Stopped \$\{[^}]+}/);
  assert.match(cliSource, /createSuccessEnvelope\('start'/);
  assert.match(cliSource, /createSuccessEnvelope\('stop'/);
});

test('aliases do not introduce a second executor state output or exit authority', () => {
  assert.equal(countMatches(cliSource, /async function startCommand\(/g), 1);
  assert.equal(countMatches(cliSource, /async function stopCommand\(/g), 1);
  assert.equal(countMatches(cliSource, /async function startGlobalTaskCommand\(/g), 1);
  assert.equal(countMatches(cliSource, /async function stopGlobalTaskCommand\(/g), 1);
  assert.equal(countMatches(cliSource, /startManagedRunWithContext\(/g) >= 1, true);
  assert.equal(countMatches(cliSource, /stopManagedTasksWithContext\(/g) >= 1, true);
  assert.doesNotMatch(cliSource, /async function upCommand\(/);
  assert.doesNotMatch(cliSource, /async function downCommand\(/);
  assert.doesNotMatch(cliSource, /createUpExecutor|createDownExecutor|upState|downState/);
  assert.doesNotMatch(operationMapSource, /task\.up|task\.down|upExecutor|downExecutor/);
});

test('alias exits remain inherited from start and stop success or failure envelopes', () => {
  assert.match(cliSource, /return await startCommand\([^)]*'start'\)/);
  assert.match(cliSource, /return await startCommand\([^)]*'up'\)/);
  assert.match(cliSource, /return await stopCommand\([^)]*'stop'\)/);
  assert.match(cliSource, /return await stopCommand\([^)]*'down'\)/);
  assert.doesNotMatch(cliSource, /if \(command === 'up'\)[\s\S]{0,240}process\.exit/);
  assert.doesNotMatch(cliSource, /if \(command === 'down'\)[\s\S]{0,240}process\.exit/);
});

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
