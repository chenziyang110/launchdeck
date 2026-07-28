import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launcherPaths } from './artifacts/launcher.js';
import { artifactPathForBuild } from './artifacts/store.js';

const BUILD_IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = path.resolve(moduleDir, '..', '..');

export function packagedAgentBuildIdentity(packageRoot = defaultPackageRoot) {
  const manifestPath = path.join(packageRoot, 'agent', 'compatibility-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return requireBuildIdentity(manifest.buildIdentity);
}

export function resolveInstallerEntrypoints(options = {}) {
  const packageRoot = path.resolve(options.packageRoot ?? defaultPackageRoot);
  const scope = requireScope(options.scope ?? 'project');
  const buildIdentity = options.buildIdentity === null
    ? null
    : requireBuildIdentity(options.buildIdentity ?? packagedAgentBuildIdentity(packageRoot));
  const env = normalizeEnv(options.env);
  const cliPath = path.join(packageRoot, 'src', 'cli.js');
  const launchers = launcherPaths(env);
  const mcpPath = options.platform === 'win32' || (options.platform === undefined && process.platform === 'win32')
    ? launchers.windows
    : launchers.posix;
  const runtimePath = buildIdentity
    ? path.join(artifactPathForBuild(buildIdentity, env), 'runtime', 'launchdeck-mcp.mjs')
    : null;

  return deepFreeze({
    scope,
    buildIdentity,
    cli: entrypoint({
      path: cliPath,
      command: process.execPath,
      args: [cliPath],
      buildIdentity
    }),
    mcp: entrypoint({
      path: mcpPath,
      command: mcpPath,
      args: ['mcp', 'serve'],
      buildIdentity
    }),
    runtime: runtimePath
      ? entrypoint({ path: runtimePath, buildIdentity })
      : null
  });
}

function entrypoint(input) {
  return {
    ...input,
    exists: fs.existsSync(input.path)
  };
}

function normalizeEnv(value = process.env) {
  const env = { ...(value ?? {}) };
  if (!String(env.LAUNCHDECK_HOME ?? '').trim()) {
    env.LAUNCHDECK_HOME = path.join(os.homedir(), '.launchdeck');
  }
  return env;
}

function requireBuildIdentity(value) {
  const normalized = String(value ?? '').trim();
  if (!BUILD_IDENTITY_PATTERN.test(normalized)) {
    throw new TypeError('buildIdentity must be an exact lowercase sha256 digest.');
  }
  return normalized;
}

function requireScope(value) {
  if (!['project', 'user'].includes(value)) throw new TypeError('scope must be project or user.');
  return value;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
