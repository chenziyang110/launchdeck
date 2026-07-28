import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const helperDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(helperDir, '..', '..');
export const cliPath = path.join(repoRoot, 'src', 'cli.js');
export const tempProjectPrefix = 'launchdeck-cli-';
export const tempLaunchdeckHomePrefix = 'launchdeck-cli-home-';

export function createCliFixture(options = {}) {
  const projectRoot = createTempProject(options);
  const explicitHome = options.env?.LAUNCHDECK_HOME;
  const ownsLaunchdeckHome = typeof explicitHome !== 'string' || explicitHome.length === 0;
  const launchdeckHome = ownsLaunchdeckHome
    ? createTempProject({ prefix: tempLaunchdeckHomePrefix })
    : canonicalPath(explicitHome);
  const env = {
    ...options.env,
    LAUNCHDECK_HOME: launchdeckHome
  };
  let cleaned = false;

  return {
    projectRoot,
    launchdeckHome,
    env,
    path: (...segments) => path.join(projectRoot, ...segments),
    writeConfig: (config) => writeConfig(projectRoot, config),
    writeFile: (relativePath, content) => writeFile(projectRoot, relativePath, content),
    writeScript: (relativePath, content) => writeScript(projectRoot, relativePath, content),
    mkdir: (relativePath) => fs.mkdirSync(path.join(projectRoot, relativePath), { recursive: true }),
    runCli: (args = [], runOptions = {}) => runCli(args, withFixtureEnv(projectRoot, env, runOptions)),
    runCliJson: (args = [], runOptions = {}) => runCliJson(args, withFixtureEnv(projectRoot, env, runOptions)),
    cleanup: () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      try {
        removeTempProject(projectRoot);
      } finally {
        if (ownsLaunchdeckHome) {
          removeTempProject(launchdeckHome);
        }
      }
    }
  };
}

export function createTempProject(options = {}) {
  const prefix = options.prefix ?? tempProjectPrefix;
  return canonicalPath(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function removeTempProject(projectRoot) {
  assertSafeTempProject(projectRoot);
  removeWithRetry(path.resolve(projectRoot));
}

export function writeConfig(root, config) {
  const content = typeof config === 'string' ? config : YAML.stringify(config);
  writeFile(root, '.launchdeck.yml', content);
}

export function writeScript(root, relativePath, content) {
  writeFile(root, relativePath, content.endsWith('\n') ? content : `${content}\n`);
}

export function writeFile(root, relativePath, content) {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Fixture paths must be relative: ${relativePath}`);
  }

  const target = path.resolve(root, relativePath);
  const relative = path.relative(path.resolve(root), target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Fixture path escapes project root: ${relativePath}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

export function runCli(args = [], options = {}) {
  const { cwd, env, input, timeout = 30_000 } = options;

  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
    input,
    timeout,
    windowsHide: true
  });
}

export function runCliJson(args = [], options = {}) {
  const result = runCli(ensureJsonArg(args), options);
  return {
    ...result,
    json: parseJson(result.stdout)
  };
}

export function parseJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('Expected CLI stdout to contain JSON, but it was empty.');
  }
  return JSON.parse(trimmed);
}

export function assertSafeTempProject(projectRoot) {
  const resolved = canonicalPath(projectRoot);
  const tempRoot = canonicalPath(os.tmpdir());
  const relative = path.relative(tempRoot, resolved);

  if (
    relative === ''
    || relative.startsWith('..')
    || path.isAbsolute(relative)
    || !path.basename(resolved).startsWith(tempProjectPrefix)
  ) {
    throw new Error(`Refusing to remove non-Launchdeck temp project: ${projectRoot}`);
  }
}

function canonicalPath(value) {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function ensureJsonArg(args) {
  return args.includes('--json') ? args : [...args, '--json'];
}

function withFixtureEnv(projectRoot, fixtureEnv, options) {
  return {
    cwd: projectRoot,
    ...options,
    env: {
      ...fixtureEnv,
      ...options.env
    }
  };
}

function removeWithRetry(targetPath) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() <= deadline) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) {
        throw error;
      }
      sleepSync(100);
    }
  }
  throw lastError;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
