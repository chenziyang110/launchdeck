import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const FIXTURE_BUILD_IDENTITY = `sha256:${'b'.repeat(64)}`;

export function createIsolatedArtifactFixture(testContext, label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `launchdeck-artifact-${safeLabel(label)}-`));
  const launchdeckHome = path.join(root, 'launchdeck-home');
  const packageRoot = path.join(root, 'package');
  const payloadRoot = path.join(packageRoot, 'agent', 'installer-payload');
  fs.mkdirSync(launchdeckHome, { recursive: true });
  writeFixturePayload(payloadRoot);

  let cleaned = false;
  testContext.after(() => {
    if (cleaned) return;
    cleaned = true;
    fs.rmSync(root, { recursive: true, force: true });
  });

  return Object.freeze({
    root,
    launchdeckHome,
    packageRoot,
    payloadRoot,
    env: Object.freeze({ LAUNCHDECK_HOME: launchdeckHome }),
    compatibilityManifest: Object.freeze({
      manifestVersion: 1,
      buildIdentity: FIXTURE_BUILD_IDENTITY,
      packageVersion: '0.1.0',
      nodeRange: '>=20'
    })
  });
}

export function writeFixturePayload(payloadRoot) {
  const files = {
    'runtime/launchdeck-mcp.mjs': 'export const fixtureRuntime = true;\n',
    'skill/launchdeck-agent/SKILL.md': '---\nname: launchdeck-agent\n---\nFixture skill.\n',
    'skill/launchdeck-agent/references/operations.md': '# Fixture operations\n',
    'launcher/launchdeck-mcp': '#!/bin/sh\nexec node \"$0.js\" \"$@\"\n',
    'launcher/launchdeck-mcp.cmd': '@node \"%~dp0launcher.js\" %*\r\n',
    'launcher/launcher.js': 'export const fixtureLauncher = true;\n'
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(payloadRoot, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function safeLabel(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}
