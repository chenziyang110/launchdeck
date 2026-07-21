import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { resolveProjectContext } from '../../src/kernel/project-context.js';

const PROJECT_A = Object.freeze({
  projectId: 'project-a-id',
  alias: 'project-a',
  projectRoot: path.resolve('F:/fixtures/project-a'),
  configPath: path.resolve('F:/fixtures/project-a/.launchdeck.yml')
});
const PROJECT_B = Object.freeze({
  projectId: 'project-b-id',
  alias: 'project-b',
  projectRoot: path.resolve('F:/fixtures/project-b'),
  configPath: path.resolve('F:/fixtures/project-b/.launchdeck.yml')
});

test('project context resolves an explicit registered project deterministically', () => {
  const result = resolveProjectContext({
    projectRef: 'project-a',
    registry: registry(PROJECT_A, PROJECT_B)
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.code, 'project_scope_resolved');
  assert.equal(result.project.projectId, PROJECT_A.projectId);
  assert.equal(result.source, 'input.projectRef');
});

test('missing, ambiguous, conflicting, out-of-scope, and unconfigured contexts stay distinct', () => {
  const cases = [
    {
      expected: ['missing', 'project_scope_missing'],
      input: { projectRef: 'missing', registry: registry(PROJECT_A) }
    },
    {
      expected: ['ambiguous', 'project_scope_ambiguous'],
      input: { projectRef: 'duplicate', registry: registry({ ...PROJECT_A, alias: 'duplicate' }, { ...PROJECT_B, alias: 'duplicate' }) }
    },
    {
      expected: ['conflicting', 'project_scope_conflicting'],
      input: {
        projectRef: 'project-a',
        trustedContext: { adapterProjectRoot: PROJECT_B.projectRoot },
        registry: registry(PROJECT_A, PROJECT_B)
      }
    },
    {
      expected: ['out_of_scope', 'project_scope_violation'],
      input: {
        trustedContext: { adapterProjectRoot: path.resolve('F:/fixtures/unregistered') },
        registry: registry(PROJECT_A)
      }
    },
    {
      expected: ['unconfigured', 'project_not_configured'],
      input: { registry: registry() }
    }
  ];

  for (const { input, expected } of cases) {
    const result = resolveProjectContext(input);
    assert.deepEqual([result.status, result.code], expected);
    assert.equal(result.project, null);
  }
});

test('Plugin installation cwd is never used as project authority', () => {
  const pluginRoot = path.resolve('F:/plugins/launchdeck-codex');
  const result = resolveProjectContext({
    registry: registry(PROJECT_A),
    cwd: pluginRoot,
    pluginRoots: [pluginRoot],
    trustedContext: { runtimeKind: 'plugin-bundled-mcp' }
  });

  assert.equal(result.status, 'unconfigured');
  assert.equal(result.project, null);
  assert.ok(result.reasons.includes('plugin_cwd_ignored'));
});

test('untrusted model fields cannot nominate adapter project roots', () => {
  const result = resolveProjectContext({
    projectRef: undefined,
    untrustedContext: { adapterProjectRoot: PROJECT_A.projectRoot, projectRoot: PROJECT_A.projectRoot },
    registry: registry(PROJECT_A)
  });

  assert.equal(result.status, 'unconfigured');
  assert.equal(result.project, null);
});

function registry(...projects) {
  return { version: 2, projects };
}
