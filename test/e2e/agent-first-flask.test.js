import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertPublicSetupSucceeded,
  copyFreshDemoAllowlist,
  evaluateAgentFirstFlaskEvidence,
  runAgentFirstFlaskEvidence
} from '../../scripts/run-agent-first-flask-evidence.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(testDir, '..', 'fixtures', 'agent-first-flask');
const contractFixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'expected-contract.json'), 'utf8'));

test('Flask producer rejects a parseable refused public setup result', () => {
  const succeeded = {
    status: 0,
    stdout: '',
    stderr: ''
  };
  const envelope = {
    schemaVersion: 1,
    ok: true,
    result: { outcome: 'succeeded' }
  };
  assert.equal(assertPublicSetupSucceeded(succeeded, envelope), envelope);
  assert.throws(
    () => assertPublicSetupSucceeded(
      { ...succeeded, status: 1 },
      { ...envelope, ok: false, result: { outcome: 'refused' } }
    ),
    { code: 'agent_flask_setup_refused' }
  );
});

test('fresh Flask copy excludes existing user config and runtime state by allowlist', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-flask-copy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  fs.mkdirSync(path.join(source, '.launchdeck'), { recursive: true });
  fs.mkdirSync(path.join(source, '.venv'), { recursive: true });
  fs.writeFileSync(path.join(source, 'README.md'), 'fresh fixture\n');
  fs.writeFileSync(path.join(source, '.launchdeck.yml'), 'project: existing-user-config\n');
  fs.writeFileSync(path.join(source, '.launchdeck', 'state.json'), '{}\n');

  copyFreshDemoAllowlist({
    from: source,
    to: target,
    files: ['README.md']
  });

  assert.equal(fs.readFileSync(path.join(target, 'README.md'), 'utf8'), 'fresh fixture\n');
  assert.equal(fs.existsSync(path.join(target, '.launchdeck.yml')), false);
  assert.equal(fs.existsSync(path.join(target, '.launchdeck')), false);
  assert.equal(fs.existsSync(path.join(target, '.venv')), false);
});

test('agent-first Flask evidence contract declares actual public lifecycle proof points', () => {
  assert.deepEqual(contractFixture.requiredPublicCommands, [
    'agent setup',
    'up',
    'status --all',
    'logs start',
    'down'
  ]);
  assert.deepEqual(contractFixture.requiredProof, [
    'fresh demo copy uses an allowlist and rejects runtime state recursively',
    'installer leaves .launchdeck.yml absent',
    'deterministic installed-Agent fixture process authors .launchdeck.yml from project evidence',
    'parent runner proves it did not author .launchdeck.yml',
    'real MCP stdio capabilities.get and build identity are captured',
    'PYTHONPATH points at the fresh src layout',
    'HTTP webpage is reachable',
    'logs start returns task logPath and non-empty Flask process log evidence',
    'down runs from finally after an up attempt',
    'producer-observed provenance binds exact evidence cell dimensions'
  ]);
});

test('sample evidence evaluator enforces Agent-authored config and webpage lifecycle', () => {
  const contract = evaluateAgentFirstFlaskEvidence(contractFixture.sampleEvidence);

  assert.equal(contract.ok, true);
  assert.equal(contract.checks.installerLeftProjectConfigAbsent, true);
  assert.equal(contract.checks.agentAuthoredConfig, true);
  assert.equal(contract.checks.agentMcpAndBuildProof, true);
  assert.equal(contract.checks.upSucceeded, true);
  assert.equal(contract.checks.webpageReached, true);
  assert.equal(contract.checks.downSucceeded, true);
  assert.equal(contract.checks.producerProvenanceComplete, true);
  assert.equal(contract.checks.producerProvenanceMatchesBody, true);
  assert.equal(contract.checks.producerBodyProofPresent, true);
});

test('runner source uses disposable copy and public CLI lifecycle without fake lifecycle service', () => {
  assert.equal(typeof runAgentFirstFlaskEvidence, 'function');
  const source = fs.readFileSync(
    new URL('../../scripts/run-agent-first-flask-evidence.js', import.meta.url),
    'utf8'
  );

  for (const expected of [
    "'agent',",
    "'setup',",
    "'--component'",
    "'--scope'",
    "['up', '--json']",
    "['status', '--all', '--json']",
    "['logs', 'start', '--json']",
    "['down', '--json']",
    'agentAuthorFixturePath',
    'installed-agent-author.js',
    'deterministic-installed-agent-fixture',
    'parentAuthoredConfig: false',
    'startLogsObserved',
    'logsJson.task',
    'producerEvidence?.logs?.task',
    'copyFreshDemoAllowlist',
    'FRESH_COPY_ALLOWLIST',
    'assertNoForbiddenFreshCopyEntries',
    'isSymbolicLink',
    'assertFreshProject',
    'runInstalledAgentAuthoring',
    'mcpEntrypoint',
    'capabilities.get',
    'PYTHONPATH',
    'finally',
    'waitForHttp',
    'isolatedEnv',
    'producerProvenanceComplete',
    'producerProvenanceMatchesBody',
    'flaskEvidenceProvenance',
    "'--cli-path'",
    'selectedCliPath',
    'selectedMcpEntrypoint'
  ]) {
    assert.equal(source.includes(expected), true, expected);
  }
  assert.doesNotMatch(source, /createRecordingLifecycleService|agentLifecycleService|fakeLifecycle|mockLifecycle/i);
  assert.doesNotMatch(
    source,
    /'setup',[\s\S]{0,240}'--host'/,
    'Linux Flask package proof must not fabricate a Host capability selection'
  );
  assert.doesNotMatch(source, /launchdeck-agent MCP initialize|agent-first-flask-build|function buildIdentity/i);
  assert.doesNotMatch(source, /writeFileSync\([^)]*\.launchdeck\.yml/i);
  assert.doesNotMatch(source, /demos[\\/]+flask-server[\\s\\S]{0,200}writeFileSync/);
  assert.doesNotMatch(source, /logsJson\.result|logs\?\.result|logs\.result/);
});

test('fixture and runner contain no live path secret stale state or preseeded project config', () => {
  const fixtureText = fs.readFileSync(path.join(fixtureDir, 'expected-contract.json'), 'utf8');
  const runnerText = fs.readFileSync(
    new URL('../../scripts/run-agent-first-flask-evidence.js', import.meta.url),
    'utf8'
  );
  const combined = `${fixtureText}\n${runnerText}`;

  assert.doesNotMatch(fixtureText, /(?:^|["'\s])[A-Za-z]:[\\/]/m);
  assert.doesNotMatch(fixtureText, /(?:^|\s)\/(?:Users|home|var|tmp|etc)\//m);
  assert.doesNotMatch(combined, /(?:token|secret|password|authorization|api[_-]?key)\s*[:=]/i);
  assert.doesNotMatch(combined, /Bearer\s+[A-Za-z0-9._-]+/i);
  assert.equal(fixtureText.includes('.launchdeck.yml absent'), true);
  assert.equal(fixtureText.includes('<WORK_ROOT>'), true);
});
