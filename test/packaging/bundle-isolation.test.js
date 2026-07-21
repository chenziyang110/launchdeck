import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { builtinModules } from 'node:module';
import { connectLaunchdeckMcp, requireAgentResult } from '../helpers/mcp-client.js';
import { readJson, runPluginBuild } from './fixtures/build-harness.js';

let root;
let outputDir;
let report;
const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

test.before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-bundle-isolation-'));
  outputDir = path.join(root, 'build');
  const result = runPluginBuild(outputDir);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  report = result.json;
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('esbuild emits one Node 20 ESM runtime with no external npm import', () => {
  const metafile = readJson(path.join(outputDir, 'esbuild-metafile.json'));
  const outputs = Object.entries(metafile.outputs);
  assert.equal(outputs.length, 1);
  const imports = outputs.flatMap(([, output]) => output.imports ?? []);
  const externalNpm = imports.filter((entry) => entry.external === true && !nodeBuiltins.has(entry.path));
  assert.deepEqual(externalNpm, []);
  assert.equal(report.bundle.format, 'esm');
  assert.equal(report.bundle.platform, 'node');
  assert.equal(report.bundle.target, 'node20');
  assert.equal(report.bundle.splitting, false);
});

test('relocated Codex and Claude bundles initialize, list, and call over real stdio without node_modules', async () => {
  for (const host of ['codex', 'claude']) {
    const isolatedRoot = path.join(root, `isolated ${host} 非ASCII`);
    copyTree(path.join(outputDir, host), isolatedRoot);
    assert.equal(findNamedPath(isolatedRoot, 'node_modules'), null);
    const entrypoint = path.join(isolatedRoot, 'runtime', 'launchdeck-mcp.mjs');
    const homeDir = path.join(root, `state ${host}`);
    const unrelatedCwd = path.join(root, 'unrelated cwd');
    fs.mkdirSync(unrelatedCwd, { recursive: true });
    const mcp = await connectLaunchdeckMcp({
      entrypoint,
      cwd: unrelatedCwd,
      env: { LAUNCHDECK_HOME: homeDir, PATH: '', LAUNCHDECK_MCP_HOST: host },
      timeout: 15_000,
      callTimeout: 20_000
    });
    try {
      try {
        const tools = await mcp.listTools();
        assert.equal(tools.tools.length, 18, host);
        const capabilities = requireAgentResult(await mcp.callTool('capabilities.get'), {
          operation: 'capabilities.get',
          outcome: 'succeeded'
        });
        assert.equal(capabilities.provenance.runtimePath, entrypoint);
        assert.equal(capabilities.provenance.buildIdentity, report.buildIdentity);
        const refusal = requireAgentResult(await mcp.callTool('task.status', {
          projectRef: 'not-registered',
          taskRef: 'dev'
        }), { operation: 'task.status', outcome: 'refused' });
        assert.equal(refusal.effects.changed, false);
        assert.equal(mcp.stdoutFrames().every((frame) => frame && typeof frame === 'object'), true);
      } catch (error) {
        const stderr = mcp.stderrText().trim();
        if (stderr) error.message = `${error.message}\nMCP stderr: ${stderr}`;
        throw error;
      }
    } finally {
      await mcp.close();
    }
  }
});

test('build refuses an observed Node below the declared prerequisite without emitting artifacts', () => {
  const rejectedDir = path.join(root, 'old-node-build');
  const result = runPluginBuild(rejectedDir, ['--node-version', '18.19.0']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /node_version_unsupported/);
  assert.equal(fs.existsSync(path.join(rejectedDir, 'codex')), false);
  assert.equal(fs.existsSync(path.join(rejectedDir, 'claude')), false);
});

function findNamedPath(rootDir, name) {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const absolute = path.join(rootDir, entry.name);
    if (entry.name === name) return absolute;
    if (entry.isDirectory()) {
      const nested = findNamedPath(absolute, name);
      if (nested) return nested;
    }
  }
  return null;
}

function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, destinationPath);
    else fs.copyFileSync(sourcePath, destinationPath);
  }
}
