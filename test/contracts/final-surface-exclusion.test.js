import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { AGENT_OPERATION_NAMES, validateAgentOperationRequest } from '../../src/kernel/operation-registry.js';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const schema = readJson('schema/agent-operations.schema.json');
const forbidden = readJson('test/skill/fixtures/forbidden-calls.json');
const expectedOperations = [
  'capabilities.get', 'system.diagnose', 'project.list', 'project.inspect', 'adoption.inspect',
  'task.list', 'task.status', 'task.logs.read', 'task.events.read', 'task.start', 'task.stop',
  'task.restart', 'task.run', 'operation.list', 'operation.get', 'operation.reconcile',
  'clean.plan', 'clean.applySafe'
];
const forbiddenInputKeys = [...forbidden.forbiddenInputKeys, 'shell', 'path', 'projectRoot', 'risk'];

test('registry and public input schema are one exact closed catalog', () => {
  assert.deepEqual(AGENT_OPERATION_NAMES, expectedOperations);
  assert.deepEqual(schema.oneOf.map((entry) => entry.$ref.slice('#/$defs/'.length)), expectedOperations);

  for (const operation of forbidden.forbiddenOperations) {
    assert.equal(AGENT_OPERATION_NAMES.includes(operation), false, operation);
    const validation = validateAgentOperationRequest({ operation, input: {} });
    assert.equal(validation.ok, false, operation);
    assert.equal(validation.errors[0].code, 'operation_not_supported', operation);
  }
});

test('public schemas cannot grow raw execution or confirmation inputs', () => {
  const schemaKeys = collectKeys(schema);
  for (const key of forbiddenInputKeys) assert.equal(schemaKeys.has(key), false, key);
});

test('hand-authored public surfaces neither advertise deferred operations nor promise exactly-once behavior', () => {
  const surfaces = [
    'README.md',
    'src/cli.js',
    '.agents/skills/launchdeck-agent',
    'agent/plugins',
    'agent/compatibility-manifest.json',
    'agent/evidence/schema.json'
  ];
  const content = surfaces.flatMap(readTextFiles).join('\n');
  for (const operation of forbidden.forbiddenOperations) {
    assert.equal(content.includes(operation), false, operation);
  }
  assert.equal(/exactly[- ]once/i.test(content), false);
});

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      keys.add(key);
      collectKeys(entry, keys);
    }
  }
  return keys;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function readTextFiles(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [fs.readFileSync(absolutePath, 'utf8')];
  return fs.readdirSync(absolutePath, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory()
      ? readTextFiles(path.join(relativePath, entry.name))
      : [fs.readFileSync(path.join(absolutePath, entry.name), 'utf8')]);
}
