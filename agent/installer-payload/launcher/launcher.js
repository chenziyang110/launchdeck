#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BUILD_IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const RUNTIME_ENTRYPOINT = 'runtime/launchdeck-mcp.mjs';
const MAX_ARGUMENTS = 1_024;
const MAX_ARGUMENT_BYTES = 128 * 1_024;

try {
  const request = parseArguments(process.argv.slice(2));
  const runtimePath = resolveRuntime(request.buildIdentity);
  const exitCode = await runRuntime(runtimePath, request);
  process.exitCode = exitCode;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    source: 'launchdeck-stable-launcher',
    code: error?.code ?? 'agent_launcher_failed',
    message: error?.message ?? 'Launchdeck launcher failed.'
  })}\n`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  if (argv[0] === '--request-base64') {
    if (
      argv.length !== 2
      || !/^[A-Za-z0-9_-]+$/.test(argv[1] ?? '')
    ) {
      throw launcherError(
        'agent_launcher_arguments_invalid',
        'Encoded launcher request is invalid.'
      );
    }
    let request;
    try {
      request = JSON.parse(Buffer.from(argv[1], 'base64url').toString('utf8'));
    } catch {
      throw launcherError(
        'agent_launcher_arguments_invalid',
        'Encoded launcher request is invalid.'
      );
    }
    return normalizeRequest(request?.buildIdentity, request?.runtimeArgs);
  }
  if (
    argv[0] !== '--build'
    || !BUILD_IDENTITY_PATTERN.test(argv[1] ?? '')
    || argv[2] !== '--'
  ) {
    throw launcherError(
      'agent_build_identity_invalid',
      'An exact lowercase sha256 build identity is required.'
    );
  }
  return normalizeRequest(argv[1], argv.slice(3));
}

function normalizeRequest(buildIdentity, value) {
  if (!BUILD_IDENTITY_PATTERN.test(buildIdentity ?? '') || !Array.isArray(value)) {
    throw launcherError(
      'agent_build_identity_invalid',
      'An exact lowercase sha256 build identity is required.'
    );
  }
  const runtimeArgs = value;
  if (
    runtimeArgs.length > MAX_ARGUMENTS
    || runtimeArgs.some((entry) => typeof entry !== 'string')
    || runtimeArgs.some((entry) => entry.includes('\0'))
    || runtimeArgs.reduce(
      (total, entry) => total + Buffer.byteLength(entry),
      0
    ) > MAX_ARGUMENT_BYTES
  ) {
    throw launcherError(
      'agent_launcher_arguments_invalid',
      'Runtime arguments exceed the supported bound.'
    );
  }
  return Object.freeze({
    buildIdentity,
    runtimeArgs: Object.freeze(runtimeArgs)
  });
}

function resolveRuntime(buildIdentity) {
  const home = String(process.env.LAUNCHDECK_HOME ?? '').trim();
  if (!home) {
    throw launcherError(
      'agent_launchdeck_home_missing',
      'LAUNCHDECK_HOME is required.'
    );
  }
  const artifactRoot = path.resolve(
    home,
    'installer',
    'artifacts',
    'v1',
    'sha256'
  );
  const buildPath = path.join(
    artifactRoot,
    buildIdentity.slice('sha256:'.length)
  );
  if (!fs.existsSync(buildPath)) {
    throw launcherError(
      'agent_launcher_build_missing',
      'The pinned Launchdeck build is not installed.'
    );
  }
  assertNoLinkedIntermediates(path.resolve(home), buildPath);
  assertRegularDirectory(buildPath);
  assertRealContained(path.resolve(home), artifactRoot);
  assertRealContained(artifactRoot, buildPath);

  const manifestPath = containedPath(buildPath, 'manifest.json');
  const manifest = readManifest(manifestPath);
  if (manifest.buildIdentity !== buildIdentity) {
    throw launcherError(
      'agent_launcher_digest_mismatch',
      'The installed manifest does not identify the pinned build.'
    );
  }
  const entries = normalizeManifestFiles(manifest.files);
  const runtimeEntry = entries.find(
    (entry) => entry.path === RUNTIME_ENTRYPOINT
  );
  if (!runtimeEntry) {
    throw launcherError(
      'agent_launcher_runtime_missing',
      'The pinned build does not declare the Launchdeck runtime.'
    );
  }

  const declaredPaths = new Set(entries.map((entry) => entry.path));
  const observedPaths = listFiles(buildPath);
  if (
    observedPaths.length !== declaredPaths.size
    || observedPaths.some((entry) => !declaredPaths.has(entry))
  ) {
    throw launcherError(
      'agent_launcher_digest_mismatch',
      'The pinned build contains undeclared or missing files.'
    );
  }
  for (const entry of entries) {
    const filePath = containedPath(buildPath, entry.path);
    assertRegularFile(filePath);
    assertRealContained(buildPath, filePath);
    const bytes = fs.readFileSync(filePath);
    if (
      bytes.length !== entry.bytes
      || sha256(bytes) !== entry.sha256
    ) {
      throw launcherError(
        'agent_launcher_digest_mismatch',
        'The pinned build failed integrity verification.'
      );
    }
  }
  return containedPath(buildPath, runtimeEntry.path);
}

async function runRuntime(runtimePath, request) {
  process.env.LAUNCHDECK_BUILD_IDENTITY = request.buildIdentity;
  process.argv = [process.execPath, runtimePath, ...request.runtimeArgs];
  try {
    await import(pathToFileURL(runtimePath).href);
  } catch (error) {
    throw launcherError(
      'agent_launcher_start_failed',
      error?.message ?? 'Pinned runtime could not start.'
    );
  }
  return Number.isInteger(process.exitCode) ? process.exitCode : 0;
}

function readManifest(manifestPath) {
  assertRegularFile(manifestPath);
  try {
    const value = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (
      !value
      || typeof value !== 'object'
      || Array.isArray(value)
      || value.manifestVersion !== 1
    ) {
      throw new Error('invalid manifest');
    }
    return value;
  } catch {
    throw launcherError(
      'agent_launcher_digest_mismatch',
      'The pinned build manifest is invalid.'
    );
  }
}

function normalizeManifestFiles(value) {
  if (!Array.isArray(value)) {
    throw launcherError(
      'agent_launcher_digest_mismatch',
      'The pinned build manifest files are invalid.'
    );
  }
  const seen = new Set();
  return value.map((entry) => {
    const relativePath = normalizeRelativePath(entry?.path);
    if (
      seen.has(relativePath)
      || !Number.isInteger(entry?.bytes)
      || entry.bytes < 0
      || !BUILD_IDENTITY_PATTERN.test(entry?.sha256 ?? '')
    ) {
      throw launcherError(
        'agent_launcher_digest_mismatch',
        'The pinned build manifest entry is invalid.'
      );
    }
    seen.add(relativePath);
    return Object.freeze({
      path: relativePath,
      bytes: entry.bytes,
      sha256: entry.sha256
    });
  });
}

function listFiles(root) {
  const files = [];
  visit(root, '');
  return files.sort(compareStrings);

  function visit(current, prefix) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relativePath = prefix
        ? `${prefix}/${entry.name}`
        : entry.name;
      if (relativePath === 'manifest.json') continue;
      const absolutePath = containedPath(root, relativePath);
      if (entry.isSymbolicLink()) {
        throw launcherError(
          'agent_launcher_path_escape',
          'The pinned build contains a symbolic link.'
        );
      }
      if (entry.isDirectory()) visit(absolutePath, relativePath);
      else if (entry.isFile()) files.push(relativePath);
      else {
        throw launcherError(
          'agent_launcher_digest_mismatch',
          'The pinned build contains an unsupported entry.'
        );
      }
    }
  }
}

function containedPath(root, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const candidate = path.resolve(root, ...normalized.split('/'));
  const relative = path.relative(path.resolve(root), candidate);
  if (
    relative === ''
    || relative.startsWith('..')
    || path.isAbsolute(relative)
  ) {
    throw launcherError(
      'agent_launcher_path_escape',
      'The pinned build path escapes its artifact root.'
    );
  }
  return candidate;
}

function normalizeRelativePath(value) {
  const normalized = String(value ?? '').replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (
    !normalized
    || normalized.startsWith('/')
    || normalized.includes('\0')
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw launcherError(
      'agent_launcher_path_escape',
      'The pinned build path is invalid.'
    );
  }
  return normalized;
}

function assertRegularDirectory(directoryPath) {
  const stat = fs.lstatSync(directoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw launcherError(
      'agent_launcher_path_escape',
      'The pinned build path is not a regular directory.'
    );
  }
}

function assertRegularFile(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw launcherError(
      'agent_launcher_digest_mismatch',
      'The pinned build contains a non-regular file.'
    );
  }
}

function assertRealContained(root, candidate) {
  const realRoot = fs.realpathSync(root);
  const realCandidate = fs.realpathSync(candidate);
  const relative = path.relative(realRoot, realCandidate);
  if (
    relative === ''
    || relative.startsWith('..')
    || path.isAbsolute(relative)
  ) {
    throw launcherError(
      'agent_launcher_path_escape',
      'The pinned build resolves outside its artifact root.'
    );
  }
}

function assertNoLinkedIntermediates(home, candidate) {
  const relative = path.relative(home, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw launcherError(
      'agent_launcher_path_escape',
      'The pinned build path escapes Launchdeck home.'
    );
  }
  let current = home;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw launcherError(
        'agent_launcher_path_escape',
        'The pinned build contains a linked or invalid path intermediate.'
      );
    }
  }
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function launcherError(code, message) {
  const error = new Error(message);
  error.name = 'LaunchdeckStableLauncherError';
  error.code = code;
  return error;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
