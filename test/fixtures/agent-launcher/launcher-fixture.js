import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CURRENT_BUILD = `sha256:${'1'.repeat(64)}`;
export const PREVIOUS_BUILD = `sha256:${'2'.repeat(64)}`;
export const RECOVERY_BUILD = `sha256:${'3'.repeat(64)}`;
export const COLLECTABLE_BUILD = `sha256:${'4'.repeat(64)}`;
export const QUARANTINED_BUILD = `sha256:${'5'.repeat(64)}`;

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(fixtureDir, '..', '..', '..');

export function createLauncherFixture(t, name = 'launcher') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `launchdeck-${name}-空 格-`));
  const launchdeckHome = path.join(root, 'Launchdeck Home 空 格');
  const acquisitionRoot = path.join(root, 'npx cache 临时');
  const launcherSourceRoot = path.join(acquisitionRoot, 'launcher');
  const env = {
    ...process.env,
    LAUNCHDECK_HOME: launchdeckHome
  };

  fs.mkdirSync(launcherSourceRoot, { recursive: true });
  const packagedLauncherRoot = path.join(
    repoRoot,
    'agent',
    'installer-payload',
    'launcher'
  );
  for (const fileName of ['launchdeck-mcp', 'launchdeck-mcp.cmd', 'launcher.js']) {
    fs.copyFileSync(
      path.join(packagedLauncherRoot, fileName),
      path.join(launcherSourceRoot, fileName)
    );
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  return Object.freeze({
    root,
    launchdeckHome,
    acquisitionRoot,
    launcherSourceRoot,
    bootstrapScript: path.join(fixtureDir, 'simulate-npx-parent.mjs'),
    env,
    publishBuild(buildIdentity = CURRENT_BUILD, options = {}) {
      return publishBuild({
        launchdeckHome,
        buildIdentity,
        launcherSourceRoot,
        runtimeSource: options.runtimeSource,
        unreferencedSince: options.unreferencedSince
      });
    },
    replaceBuildWithEscapeLink(buildIdentity = CURRENT_BUILD) {
      const canonical = artifactPath(launchdeckHome, buildIdentity);
      const escaped = path.join(root, 'outside-artifact-root', buildIdentity.slice(7));
      fs.rmSync(canonical, { recursive: true, force: true });
      writeBuildDirectory(
        escaped,
        buildIdentity,
        undefined,
        launcherSourceRoot
      );
      fs.mkdirSync(path.dirname(canonical), { recursive: true });
      fs.symlinkSync(escaped, canonical, process.platform === 'win32' ? 'junction' : 'dir');
      return Object.freeze({ canonical, escaped });
    }
  });
}

export function artifactPath(launchdeckHome, buildIdentity) {
  return path.join(
    launchdeckHome,
    'installer',
    'artifacts',
    'v1',
    'sha256',
    buildIdentity.slice('sha256:'.length)
  );
}

export function makeArtifactObservation(
  launchdeckHome,
  buildIdentity,
  overrides = {}
) {
  return Object.freeze({
    buildIdentity,
    path: artifactPath(launchdeckHome, buildIdentity),
    state: 'verified',
    verified: true,
    ownershipVerified: true,
    unreferencedSince: '2026-05-01T00:00:00.000Z',
    ...overrides
  });
}

function publishBuild({
  launchdeckHome,
  buildIdentity,
  launcherSourceRoot,
  runtimeSource,
  unreferencedSince
}) {
  const buildPath = artifactPath(launchdeckHome, buildIdentity);
  writeBuildDirectory(
    buildPath,
    buildIdentity,
    runtimeSource,
    launcherSourceRoot
  );
  if (unreferencedSince) {
    fs.writeFileSync(
      path.join(buildPath, 'artifact-state.json'),
      `${JSON.stringify({ unreferencedSince }, null, 2)}\n`,
      'utf8'
    );
  }
  return buildPath;
}

function writeBuildDirectory(
  buildPath,
  buildIdentity,
  runtimeSource,
  launcherSourceRoot
) {
  const runtime = runtimeSource ?? [
    'const result = {',
    '  args: process.argv.slice(2),',
    '  buildIdentity: process.env.LAUNCHDECK_BUILD_IDENTITY ?? null',
    '};',
    'process.stdout.write(`${JSON.stringify(result)}\\n`);',
    ''
  ].join('\n');
  const payloadFiles = new Map([
    ['runtime/launchdeck-mcp.mjs', Buffer.from(runtime, 'utf8')]
  ]);
  for (const fileName of ['launchdeck-mcp', 'launchdeck-mcp.cmd', 'launcher.js']) {
    payloadFiles.set(
      `launcher/${fileName}`,
      fs.readFileSync(path.join(launcherSourceRoot, fileName))
    );
  }
  const manifest = {
    manifestVersion: 1,
    buildIdentity,
    packageVersion: '0.0.0-fixture',
    nodeRange: '>=20',
    files: [...payloadFiles.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([relativePath, bytes]) => ({
        path: relativePath,
        bytes: bytes.length,
        sha256: sha256(bytes)
      }))
  };
  for (const [relativePath, bytes] of payloadFiles) {
    const target = path.join(buildPath, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  fs.writeFileSync(
    path.join(buildPath, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}
