import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { computeBuildIdentity } from '../../src/kernel/compatibility.js';
import { isPidRunning, readState } from '../../src/runtime.js';
import { createAgentSurfaceFixture } from '../helpers/agent-surface-fixture.js';
import { connectLaunchdeckMcp, requireAgentResult, sourceMcpEntrypoint } from '../helpers/mcp-client.js';

const baseManifest = JSON.parse(fs.readFileSync(
  new URL('../../agent/compatibility-manifest.json', import.meta.url),
  'utf8'
));

test('compatible Codex and Claude runtime identities observe and reuse one shared managed run', async () => {
  const fixture = await createAgentSurfaceFixture();
  let first;
  let replacement;
  try {
    const project = register(fixture, 'compatible-runtime-takeover');
    first = await connectLaunchdeckMcp({
      cwd: fixture.projectRoot,
      env: { ...fixture.env, LAUNCHDECK_MCP_HOST: 'codex' }
    });
    const started = requireAgentResult(await first.callTool('task.start', {
      projectRef: project.projectId,
      taskRef: 'managed'
    }), { operation: 'task.start', outcome: 'succeeded' });
    assert.equal(started.provenance.host, 'codex');
    const original = readState(fixture.projectRoot).processes.managed;
    await first.close();
    first = null;

    replacement = await connectLaunchdeckMcp({
      cwd: fixture.homeDir,
      env: { ...fixture.env, LAUNCHDECK_MCP_HOST: 'claude' }
    });
    const status = requireAgentResult(await replacement.callTool('task.status', {
      projectRef: project.projectId,
      taskRef: 'managed'
    }), { operation: 'task.status', outcome: 'succeeded' });
    assert.equal(status.provenance.host, 'claude');
    assert.equal(status.resource.runId, started.resource.runId);
    const reused = requireAgentResult(await replacement.callTool('task.start', {
      projectRef: project.projectId,
      taskRef: 'managed'
    }), { operation: 'task.start', outcome: 'succeeded' });
    assert.equal(reused.resource.runId, started.resource.runId);
    assert.equal(reused.outcome.reusedExistingRun, true);
    assert.equal(reused.effects.changed, false);
    const current = readState(fixture.projectRoot).processes.managed;
    assert.equal(current.pid, original.pid);
    assert.equal(current.launchdeckHome, original.launchdeckHome);
    assert.equal(readReceipts(fixture.spawnReceiptPath).length, 1);
  } finally {
    await first?.close().catch(() => {});
    await replacement?.close().catch(() => {});
    fixture.cleanup();
  }
});

test('incompatible replacement diagnoses safely and refuses writes while compatible CLI retains takeover', async () => {
  const fixture = await createAgentSurfaceFixture();
  let compatible;
  let incompatible;
  try {
    const project = register(fixture, 'incompatible-runtime-takeover');
    compatible = await connectLaunchdeckMcp({ cwd: fixture.projectRoot, env: fixture.env });
    const started = requireAgentResult(await compatible.callTool('task.start', {
      projectRef: project.projectId,
      taskRef: 'managed'
    }), { operation: 'task.start', outcome: 'succeeded' });
    const pid = readState(fixture.projectRoot).processes.managed.pid;
    await compatible.close();
    compatible = null;

    const observedManifest = incompatibleManifest();
    fixture.writeScript('scripts/incompatible-mcp-wrapper.mjs', [
      `import { runStdioServer } from ${JSON.stringify(pathToFileURL(sourceMcpEntrypoint).href)};`,
      'const observedCompatibilityManifest = JSON.parse(process.env.LAUNCHDECK_OBSERVED_COMPATIBILITY_MANIFEST);',
      'await runStdioServer({ observedCompatibilityManifest });'
    ].join('\n'));
    const wrapperPath = fixture.path('scripts', 'incompatible-mcp-wrapper.mjs');
    incompatible = await connectLaunchdeckMcp({
      cwd: fixture.projectRoot,
      entrypoint: wrapperPath,
      env: {
        ...fixture.env,
        LAUNCHDECK_MCP_HOST: 'codex',
        LAUNCHDECK_OBSERVED_COMPATIBILITY_MANIFEST: JSON.stringify(observedManifest)
      }
    });

    const capabilities = requireAgentResult(await incompatible.callTool('capabilities.get'), {
      operation: 'capabilities.get',
      outcome: 'succeeded'
    });
    assert.equal(capabilities.resource.data.compatibility.canRead, true);
    assert.equal(capabilities.resource.data.compatibility.canWrite, false);
    assert.equal(capabilities.resource.data.compatibility.diagnosticOnly, true);
    assert.equal(capabilities.provenance.buildIdentity, observedManifest.buildIdentity);
    const diagnosis = requireAgentResult(await incompatible.callTool('system.diagnose', {
      checks: ['compatibility']
    }), { operation: 'system.diagnose', outcome: 'succeeded' });
    assert.equal(diagnosis.resource.data.provenance.buildIdentity, observedManifest.buildIdentity);

    const stop = requireAgentResult(await incompatible.callTool('task.stop', {
      projectRef: project.projectId,
      taskRef: 'managed'
    }), { operation: 'task.stop', outcome: 'refused' });
    assert.equal(stop.outcome.code, 'compatibility_mismatch');
    assert.equal(stop.effects.changed, false);
    assert.equal(isPidRunning(pid), true);
    assert.equal(readState(fixture.projectRoot).processes.managed.runId, started.resource.runId);
    assert.equal(readReceipts(fixture.spawnReceiptPath).length, 1);

    await incompatible.close();
    incompatible = null;
    const cliStop = fixture.runGlobalCliJson(['stop', `${project.projectId}:managed`]);
    assert.equal(cliStop.status, 0, cliStop.stderr);
    assert.equal(cliStop.json.data.agentResult.resource.runId, started.resource.runId);
    assert.equal(isPidRunning(pid), false);
  } finally {
    await compatible?.close().catch(() => {});
    await incompatible?.close().catch(() => {});
    fixture.cleanup();
  }
});

function incompatibleManifest() {
  const manifest = structuredClone(baseManifest);
  manifest.componentDigests.runtimeBundle = `sha256:${'f'.repeat(64)}`;
  manifest.buildIdentity = computeBuildIdentity(manifest);
  return manifest;
}

function register(fixture, alias) {
  const added = fixture.runCliJson(['project', 'add', fixture.projectRoot, '--alias', alias]);
  assert.equal(added.status, 0, added.stderr);
  return added.json.project;
}

function readReceipts(receiptPath) {
  if (!fs.existsSync(receiptPath)) return [];
  return fs.readFileSync(receiptPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
