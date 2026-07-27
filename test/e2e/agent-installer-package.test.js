import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertPublicLifecycleOutcome,
  normalizeCompatibilitySkillInstallDryRun,
  parseNpmPackJson,
  resolveNpmCommand
} from '../../scripts/run-agent-installer-package-evidence.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runnerPath = path.join(repoRoot, 'scripts', 'run-agent-installer-package-evidence.js');

test('package producer rejects parseable but unexpected public setup outcomes', () => {
  const succeeded = commandResult(0, 'succeeded');
  assert.equal(
    assertPublicLifecycleOutcome(succeeded, 'approved setup', ['succeeded']).result.outcome,
    'succeeded'
  );
  assert.throws(
    () => assertPublicLifecycleOutcome(commandResult(1, 'refused'), 'approved setup', ['succeeded']),
    { code: 'agent_package_lifecycle_outcome_invalid' }
  );
  assert.throws(
    () => assertPublicLifecycleOutcome(commandResult(1, 'succeeded'), 'approved setup', ['succeeded']),
    { code: 'agent_package_lifecycle_status_invalid' }
  );
});

test('package producer keeps Linux package proof separate from Host capability proof', () => {
  const source = fs.readFileSync(runnerPath, 'utf8');
  assert.match(source, /const DEFAULT_COMPONENTS = \['runtime'\]/);
  assert.doesNotMatch(source, /const DEFAULT_HOST|DEFAULT_HOST/);
});

test('npm resolution uses node plus npm-cli.js with shell disabled on Windows', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-npm-command-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nodeExecutable = path.join(root, 'node.exe');
  const npmCliPath = path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  fs.mkdirSync(path.dirname(npmCliPath), { recursive: true });
  fs.writeFileSync(nodeExecutable, '');
  fs.writeFileSync(npmCliPath, 'process.exitCode = 0;\n');

  const resolved = resolveNpmCommand({
    env: { PATH: '' },
    platform: 'win32',
    nodeExecutable
  });

  assert.equal(resolved.command, nodeExecutable);
  assert.deepEqual(resolved.prefixArgs, [npmCliPath]);
  assert.equal(resolved.cliPath, npmCliPath);
  assert.equal(resolved.shell, false);
});

test('npm pack inventory parser tolerates lifecycle output but remains schema-bound', () => {
  const parsed = parseNpmPackJson(
    'Built installer payload\n[{"filename":"launchdeck.tgz","files":[{"path":"package.json"}]}]\n'
  );
  assert.equal(parsed[0].filename, 'launchdeck.tgz');
  assert.throws(
    () => parseNpmPackJson('Built installer payload\n{"ok":true}\n'),
    { code: 'agent_package_pack_json_invalid' }
  );
});

test('legacy compatibility dry-run status is normalized without discarding native evidence', () => {
  for (const status of ['planned', 'already_installed']) {
    const normalized = normalizeCompatibilitySkillInstallDryRun({
      ok: true,
      dryRun: true,
      result: {
        status,
        actions: []
      }
    });

    assert.equal(normalized.result.status, status);
    assert.equal(normalized.result.outcome, 'planned');
  }
  assert.throws(
    () => normalizeCompatibilitySkillInstallDryRun({
      ok: true,
      dryRun: true,
      result: { status: 'installed' }
    }),
    { code: 'agent_package_compatibility_dry_run_invalid' }
  );
});

test('packed package runner emits complete isolated npx and installed lifecycle evidence', {
  timeout: 240_000
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-agent-package-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const run = await spawnJson(process.execPath, [
    runnerPath,
    '--json',
    '--work-root',
    root
  ], { cwd: repoRoot });

  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr.trim(), '');

  const evidence = JSON.parse(run.stdout);
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.ok, true);
  assert.equal(evidence.contract.ok, true);
  assert.deepEqual(evidence.contract.failures, []);
  assert.equal(Object.values(evidence.contract.checks).every((passed) => passed === true), true);
  assert.equal(evidence.kind, 'agent-installer-package-evidence');
  assert.equal(evidence.contract.checks.producerProvenanceComplete, true);
  assert.equal(evidence.contract.checks.producerProvenanceMatchesBody, true);
  assert.equal(evidence.contract.checks.tarballByteLengthPresent, true);
  assert.equal(evidence.provenance.observed, true);
  assert.equal(evidence.provenance.identity.buildIdentity, evidence.npx.approved.result.buildIdentity);
  assert.equal(evidence.provenance.candidate.sha256, evidence.package.tarballSha256);
  assert.equal(evidence.provenance.candidate.byteLength, evidence.package.tarballByteLength);
  assert.equal(evidence.provenance.host.id, 'none');
  assert.equal(evidence.provenance.host.version, 'package-adapter-fixture');
  assert.equal(evidence.producer.npmInvocation.kind, 'node-npm-cli');
  assert.equal(evidence.producer.npmInvocation.command, path.basename(process.execPath));
  assert.match(evidence.producer.npmInvocation.cliPathSha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(evidence.producer.npmInvocation.shell, false);
  assert.match(evidence.package.tarballSha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(evidence.package.inventory.ok, true);
  assert.equal(evidence.isolation.liveUserStateTouched, false);
  assert.equal(evidence.npx.dryRun.result.outcome, 'planned');
  assert.equal(evidence.npx.jsonApprovalRefusal.result.outcome, 'refused');
  assert.equal(evidence.npx.approved.result.buildIdentity, evidence.installed.repeat.result.buildIdentity);
  assert.equal(evidence.installed.repeat.result.outcome, 'noop');
  assert.equal(evidence.compatibility.paths.schemaVersion, 1);
  assert.equal(evidence.compatibility.skillInstallDryRun.result.outcome, 'planned');
  assert.equal(evidence.offlineAfterNpx.cacheRemoved, true);
  assert.equal(evidence.offlineAfterNpx.launcher.status, 0);
  assert.equal(evidence.quoting.projectPathIncludesSpace, true);
  assert.equal(evidence.payloadInventory.expectedPayloadFilesPresent, true);
});

function spawnJson(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function commandResult(status, outcome) {
  return {
    command: 'node',
    args: ['launchdeck', 'agent', 'setup'],
    status,
    signal: null,
    stdout: JSON.stringify({
      schemaVersion: 1,
      ok: outcome !== 'refused',
      result: { outcome }
    }),
    stderr: ''
  };
}
