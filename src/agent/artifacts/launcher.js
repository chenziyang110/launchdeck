import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  artifactPathForBuild,
  assertInstallerOwnedPath
} from './store.js';
import { verifyInstallerPayload } from './manifest.js';
import { digestCanonical } from '../digests.js';
import { AgentInstallerError } from '../errors.js';

const BUILD_IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const LAUNCHER_VERSION = 'v1';
const RUNTIME_ENTRYPOINT = 'runtime/launchdeck-mcp.mjs';
const MAX_RUNTIME_ARGUMENTS = 1_024;
const MAX_RUNTIME_ARGUMENT_BYTES = 128 * 1_024;
const MAX_WINDOWS_CMD_COMMAND_CHARS = 8_000;
const REQUIRED_LAUNCHER_FILES = Object.freeze([
  'launchdeck-mcp',
  'launchdeck-mcp.cmd',
  'launcher.js'
]);
const verificationCaches = new WeakMap();

export function launcherPaths(env = process.env) {
  const homeDir = requireLaunchdeckHome(env);
  const root = assertInstallerOwnedPath({
    env,
    area: 'launcher',
    candidate: path.join(homeDir, 'installer', 'launcher', LAUNCHER_VERSION)
  });
  return deepFreeze({
    root,
    posix: path.join(root, 'launchdeck-mcp'),
    windows: path.join(root, 'launchdeck-mcp.cmd'),
    node: path.join(root, 'launcher.js')
  });
}

export function installStableLauncher({
  env = process.env,
  buildIdentity
} = {}) {
  const normalizedBuild = requireBuildIdentity(buildIdentity);
  const artifactPath = artifactPathForBuild(normalizedBuild, env);
  assertInstallerOwnedPath({
    env,
    area: 'artifacts',
    candidate: artifactPath,
    requireExisting: true
  });
  const verifiedRuntime = resolvePinnedRuntime({
    env,
    buildIdentity: normalizedBuild
  });
  const manifest = readManifest(path.join(artifactPath, 'manifest.json'));
  if (
    manifest.buildIdentity !== normalizedBuild
    || digestCanonical(manifest) !== verifiedRuntime.manifestDigest
  ) {
    throw launcherError(
      'agent_launcher_digest_mismatch',
      'Verified build metadata changed before launcher publication.',
      { buildIdentity: normalizedBuild }
    );
  }
  const source = requireDirectory(path.join(artifactPath, 'launcher'), 'launcherRoot');
  const paths = launcherPaths(env);
  fs.mkdirSync(paths.root, { recursive: true });

  for (const fileName of REQUIRED_LAUNCHER_FILES) {
    const manifestEntry = manifest.files?.find(
      (entry) => entry?.path === `launcher/${fileName}`
    );
    if (!manifestEntry) {
      throw launcherError(
        'agent_launcher_source_invalid',
        'Verified build does not declare every stable launcher file.',
        { buildIdentity: normalizedBuild, fileName }
      );
    }
    const sourcePath = containedFile(source, fileName);
    const sourceStat = fs.lstatSync(sourcePath);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw launcherError(
        'agent_launcher_source_invalid',
        'Stable launcher source must contain only regular files.',
        { path: sourcePath }
      );
    }
    const bytes = fs.readFileSync(sourcePath);
    if (
      bytes.length !== manifestEntry.bytes
      || sha256(bytes) !== manifestEntry.sha256
    ) {
      throw launcherError(
        'agent_launcher_digest_mismatch',
        'Stable launcher bytes changed after artifact verification.',
        { buildIdentity: normalizedBuild, fileName }
      );
    }
    assertSelfContainedLauncherText(fileName, bytes);
    const targetPath = path.join(paths.root, fileName);
    atomicWriteFile(targetPath, bytes, fileName === 'launchdeck-mcp' ? 0o755 : 0o644);
  }
  return paths;
}

export function createPinnedLauncherInvocation({
  env = process.env,
  platform = process.platform,
  buildIdentity,
  runtimeArgs = []
} = {}) {
  const normalizedBuild = requireBuildIdentity(buildIdentity);
  const normalizedArgs = normalizeRuntimeArguments(runtimeArgs);
  const paths = launcherPaths(env);
  if (platform === 'win32') {
    const encodedRequest = Buffer.from(JSON.stringify({
      buildIdentity: normalizedBuild,
      runtimeArgs: normalizedArgs
    }), 'utf8').toString('base64url');
    const command = requireWindowsCommandProcessor(env);
    const commandPayload = `call "${escapeWindowsCommandPath(paths.windows)}" ${encodedRequest}`;
    const args = Object.freeze([
      '/d',
      '/s',
      '/c',
      commandPayload
    ]);
    assertWindowsCommandLength({
      command,
      args,
      encodedRequest
    });
    return deepFreeze({
      command,
      args,
      shell: false,
      windowsVerbatimArguments: true,
      transport: 'cmd-base64url'
    });
  }
  return deepFreeze({
    command: paths.posix,
    args: Object.freeze([
      '--build',
      normalizedBuild,
      '--',
      ...normalizedArgs
    ]),
    shell: false,
    transport: 'posix-argv'
  });
}

export function createLauncherVerificationCache() {
  const cache = Object.freeze({});
  verificationCaches.set(cache, new Map());
  return cache;
}

export function resolvePinnedRuntime({
  env = process.env,
  buildIdentity,
  cache
} = {}) {
  const normalizedBuild = requireBuildIdentity(buildIdentity);
  const artifactPath = artifactPathForBuild(normalizedBuild, env);
  if (!fs.existsSync(artifactPath)) {
    throw launcherError(
      'agent_launcher_build_missing',
      'The pinned Launchdeck build is not installed.',
      { buildIdentity: normalizedBuild, artifactPath }
    );
  }
  assertInstallerOwnedPath({
    env,
    area: 'artifacts',
    candidate: artifactPath,
    requireExisting: true
  });

  const artifactRoot = path.dirname(artifactPath);
  assertRealPathContained(artifactRoot, artifactPath);
  const manifestPath = path.join(artifactPath, 'manifest.json');
  const manifest = readManifest(manifestPath);
  if (manifest.buildIdentity !== normalizedBuild) {
    throw launcherError(
      'agent_launcher_digest_mismatch',
      'The installed manifest does not identify the pinned build.',
      {
        buildIdentity: normalizedBuild,
        observedBuildIdentity: manifest.buildIdentity ?? null
      }
    );
  }
  const runtimeEntry = Array.isArray(manifest.files)
    ? manifest.files.find((entry) => entry?.path === RUNTIME_ENTRYPOINT)
    : null;
  if (!runtimeEntry) {
    throw launcherError(
      'agent_launcher_runtime_missing',
      'The pinned build manifest does not declare the Launchdeck runtime.',
      { buildIdentity: normalizedBuild, runtimeEntrypoint: RUNTIME_ENTRYPOINT }
    );
  }
  const runtimePath = containedFile(artifactPath, RUNTIME_ENTRYPOINT);
  assertRealPathContained(artifactPath, runtimePath);

  const manifestDigest = digestCanonical(manifest);
  const metadataKey = verificationMetadataKey(artifactPath, manifest);
  const entries = cacheEntries(cache);
  const cached = entries?.get(normalizedBuild);
  if (
    cached?.manifestDigest === manifestDigest
    && cached.metadataKey === metadataKey
    && cached.runtimePath === runtimePath
  ) {
    return launcherResolution({
      buildIdentity: normalizedBuild,
      artifactPath,
      runtimePath,
      manifestDigest,
      verification: 'cache-hit'
    });
  }

  let verification;
  try {
    verification = verifyInstallerPayload({
      payloadRoot: artifactPath,
      manifest
    });
  } catch (error) {
    throw launcherError(
      'agent_launcher_digest_mismatch',
      'The pinned Launchdeck build manifest is invalid.',
      {
        buildIdentity: normalizedBuild,
        sourceCode: error?.code ?? null
      }
    );
  }
  if (!verification.ok || verification.buildIdentity !== normalizedBuild) {
    throw launcherError(
      'agent_launcher_digest_mismatch',
      'The pinned Launchdeck build failed integrity verification.',
      {
        buildIdentity: normalizedBuild,
        sourceCode: verification.code ?? null,
        mismatches: verification.mismatches ?? []
      }
    );
  }

  entries?.set(normalizedBuild, Object.freeze({
    manifestDigest,
    metadataKey,
    runtimePath
  }));
  return launcherResolution({
    buildIdentity: normalizedBuild,
    artifactPath,
    runtimePath,
    manifestDigest,
    verification: 'verified'
  });
}

function launcherResolution(value) {
  return deepFreeze(value);
}

function verificationMetadataKey(artifactPath, manifest) {
  const relativePaths = ['manifest.json', ...manifest.files.map((entry) => entry.path)];
  const records = relativePaths.sort(compareStrings).map((relativePath) => {
    const filePath = containedFile(artifactPath, relativePath);
    let stat;
    try {
      stat = fs.lstatSync(filePath);
    } catch (error) {
      throw launcherError(
        'agent_launcher_digest_mismatch',
        'Pinned build metadata is incomplete.',
        { path: relativePath, causeMessage: error?.message ?? String(error) }
      );
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw launcherError(
        'agent_launcher_digest_mismatch',
        'Pinned build metadata includes a non-regular file.',
        { path: relativePath }
      );
    }
    assertRealPathContained(artifactPath, filePath);
    return [
      relativePath,
      stat.dev,
      stat.ino,
      stat.size,
      stat.mtimeMs,
      stat.ctimeMs
    ];
  });
  return JSON.stringify(records);
}

function cacheEntries(cache) {
  if (cache === undefined || cache === null) return null;
  const entries = verificationCaches.get(cache);
  if (!entries) {
    throw launcherError(
      'agent_launcher_cache_invalid',
      'Launcher verification cache was not created by Launchdeck.'
    );
  }
  return entries;
}

function readManifest(manifestPath) {
  try {
    const stat = fs.lstatSync(manifestPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular file');
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw launcherError(
      'agent_launcher_digest_mismatch',
      'The pinned Launchdeck manifest cannot be read.',
      { path: manifestPath, causeMessage: error?.message ?? String(error) }
    );
  }
}

function assertSelfContainedLauncherText(fileName, bytes) {
  const text = bytes.toString('utf8');
  if (
    text.includes('\0')
    || /\bnpx\b|@latest|node_modules[\\/]\.cache/i.test(text)
  ) {
    throw launcherError(
      'agent_launcher_source_invalid',
      'Stable launcher source contains a mutable or external bootstrap reference.',
      { fileName }
    );
  }
}

function atomicWriteFile(targetPath, bytes, mode) {
  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`
  );
  fs.writeFileSync(tempPath, bytes, { mode });
  try {
    fs.chmodSync(tempPath, mode);
    fs.renameSync(tempPath, targetPath);
  } catch (error) {
    if (process.platform === 'win32' && fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { force: true });
      fs.renameSync(tempPath, targetPath);
    } else {
      throw error;
    }
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  }
}

function containedFile(root, relativePath) {
  const normalized = String(relativePath ?? '').replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (
    !normalized
    || normalized.startsWith('/')
    || normalized.includes('\0')
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw launcherError(
      'agent_launcher_path_escape',
      'Launcher path escapes its owned root.',
      { path: normalized }
    );
  }
  const candidate = path.resolve(root, ...segments);
  if (!isContained(root, candidate)) {
    throw launcherError(
      'agent_launcher_path_escape',
      'Launcher path escapes its owned root.',
      { path: normalized }
    );
  }
  return candidate;
}

function assertRealPathContained(root, candidate) {
  let realRoot;
  let realCandidate;
  try {
    realRoot = fs.realpathSync(root);
    realCandidate = fs.realpathSync(candidate);
  } catch (error) {
    throw launcherError(
      'agent_launcher_build_missing',
      'The pinned Launchdeck build is incomplete.',
      { path: candidate, causeMessage: error?.message ?? String(error) }
    );
  }
  if (!isContained(realRoot, realCandidate)) {
    throw launcherError(
      'agent_launcher_path_escape',
      'The pinned runtime resolves outside the artifact root.',
      { path: candidate }
    );
  }
}

function isContained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function requireDirectory(value, label) {
  const resolved = path.resolve(requireText(value, label));
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    throw launcherError(
      'agent_launcher_source_invalid',
      'Stable launcher source directory cannot be read.',
      { [label]: resolved, causeMessage: error?.message ?? String(error) }
    );
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw launcherError(
      'agent_launcher_source_invalid',
      'Stable launcher source must be a regular directory.',
      { [label]: resolved }
    );
  }
  return resolved;
}

function requireWindowsCommandProcessor(env) {
  const value = String(env?.ComSpec ?? env?.COMSPEC ?? '').trim();
  if (!value || !path.win32.isAbsolute(value) || value.includes('"')) {
    throw launcherError(
      'agent_launcher_windows_command_invalid',
      'An absolute Windows command processor path is required.'
    );
  }
  return value;
}

function assertWindowsCommandLength({ command, args, encodedRequest }) {
  const rendered = renderWindowsCommandLine(command, args);
  if (rendered.length <= MAX_WINDOWS_CMD_COMMAND_CHARS) return;
  throw launcherError(
    'agent_launcher_arguments_invalid',
    'Launcher runtime arguments exceed the Windows cmd.exe command-line budget.',
    {
      transport: 'cmd-base64url',
      commandLength: rendered.length,
      commandBudget: MAX_WINDOWS_CMD_COMMAND_CHARS,
      encodedRequestLength: encodedRequest.length
    }
  );
}

function renderWindowsCommandLine(command, args) {
  const head = quoteWindowsProcessArgument(command);
  const tail = args.map(quoteWindowsProcessArgument);
  return [head, ...tail].join(' ');
}

function quoteWindowsProcessArgument(value) {
  const text = String(value);
  return /[\s"]/u.test(text)
    ? `"${text.replaceAll('"', '\\"')}"`
    : text;
}

function escapeWindowsCommandPath(value) {
  if (String(value).includes('"')) {
    throw launcherError(
      'agent_launcher_windows_command_invalid',
      'Windows launcher path cannot contain a quote.'
    );
  }
  return String(value).replaceAll('%', '%%');
}

function requireLaunchdeckHome(env) {
  const value = String(env?.LAUNCHDECK_HOME ?? '').trim();
  if (!value) {
    throw launcherError(
      'agent_launchdeck_home_missing',
      'LAUNCHDECK_HOME is required for stable launcher installation.'
    );
  }
  return path.resolve(value);
}

function requireBuildIdentity(value) {
  const normalized = String(value ?? '').trim();
  if (!BUILD_IDENTITY_PATTERN.test(normalized)) {
    throw launcherError(
      'agent_build_identity_invalid',
      'Build identity must be an exact lowercase sha256 digest.',
      { buildIdentity: normalized }
    );
  }
  return normalized;
}

function normalizeRuntimeArguments(value) {
  if (!Array.isArray(value) || value.length > MAX_RUNTIME_ARGUMENTS) {
    throw launcherError(
      'agent_launcher_arguments_invalid',
      'Launcher runtime arguments exceed the supported bound.'
    );
  }
  const args = value.map((entry) => {
    if (typeof entry !== 'string' || entry.includes('\0')) {
      throw launcherError(
        'agent_launcher_arguments_invalid',
        'Launcher runtime arguments must be strings without null bytes.'
      );
    }
    return entry;
  });
  const bytes = args.reduce((total, entry) => total + Buffer.byteLength(entry), 0);
  if (bytes > MAX_RUNTIME_ARGUMENT_BYTES) {
    throw launcherError(
      'agent_launcher_arguments_invalid',
      'Launcher runtime arguments exceed the supported byte bound.'
    );
  }
  return Object.freeze(args);
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw launcherError(
      'agent_launcher_source_invalid',
      `${label} is required.`
    );
  }
  return normalized;
}

function launcherError(code, message, details = {}) {
  return new AgentInstallerError(code, message, {
    effectCertainty: 'none',
    details
  });
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
