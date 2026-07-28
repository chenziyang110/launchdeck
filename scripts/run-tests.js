#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suiteRootPrefix = 'launchdeck-test-suite-';
const isolatedEnvironmentKeys = new Set([
  'LAUNCHDECK_HOME',
  'HOME',
  'USERPROFILE',
  'LOCALAPPDATA',
  'XDG_STATE_HOME'
]);

if (isMainModule()) {
  process.exitCode = runTestSuite();
}

export function runTestSuite(options = {}) {
  const files = options.files ?? listTestFiles(path.join(repoRoot, 'test')).sort();
  if (files.length === 0) {
    throw new Error('No test files were found.');
  }

  const spawn = options.spawn ?? spawnSync;
  const isolation = createSuiteIsolation(options.env ?? process.env);
  let result;

  try {
    result = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], {
      cwd: repoRoot,
      env: isolation.env,
      stdio: 'inherit',
      windowsHide: true
    });
  } finally {
    isolation.cleanup();
  }

  if (result.error) throw result.error;
  return result.status ?? 1;
}

function createSuiteIsolation(parentEnv) {
  const tempRoot = canonicalPath(os.tmpdir());
  const ownedRoot = canonicalPath(fs.mkdtempSync(path.join(tempRoot, suiteRootPrefix)));
  const env = {
    ...withoutIsolatedEnvironment(parentEnv),
    LAUNCHDECK_HOME: path.join(ownedRoot, 'launchdeck-home'),
    HOME: path.join(ownedRoot, 'home'),
    USERPROFILE: path.join(ownedRoot, 'userprofile'),
    LOCALAPPDATA: path.join(ownedRoot, 'localappdata'),
    XDG_STATE_HOME: path.join(ownedRoot, 'xdg-state-home')
  };

  for (const directory of [
    env.LAUNCHDECK_HOME,
    env.HOME,
    env.USERPROFILE,
    env.LOCALAPPDATA,
    env.XDG_STATE_HOME
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }

  return {
    env,
    cleanup() {
      removeOwnedSuiteRoot(ownedRoot, tempRoot);
    }
  };
}

function withoutIsolatedEnvironment(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !isolatedEnvironmentKeys.has(key.toUpperCase()))
  );
}

function listTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTestFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.test.js') ? [entryPath] : [];
  });
}

function removeOwnedSuiteRoot(ownedRoot, tempRoot) {
  const resolvedRoot = canonicalPath(ownedRoot);
  if (
    path.dirname(resolvedRoot) !== tempRoot
    || !path.basename(resolvedRoot).startsWith(suiteRootPrefix)
  ) {
    throw new Error(`Refusing to clean non-suite test root: ${resolvedRoot}`);
  }
  fs.rmSync(resolvedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

function canonicalPath(value) {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url));
}
