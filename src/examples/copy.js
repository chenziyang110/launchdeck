import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LaunchdeckError } from '../errors.js';
import { loadCatalog } from './catalog.js';

const DEFAULT_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_ROOT_RELATIVE_PATH = path.join('examples', 'sample-projects');
const FORBIDDEN_SOURCE_NAMES = Object.freeze([
  '.launchdeck',
  '.launchdeck.json',
  '.launchdeck.yml',
  '.launchdeck.yaml'
]);
const PUBLISH_RENAME_RETRY_DELAYS_MS = Object.freeze([25, 75, 150]);
const TRANSIENT_PUBLISH_ERROR_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);

export const COPY_OUTCOMES = Object.freeze({
  success: 'OUT-EX-COPY-OK',
  usage: 'OUT-EX-USAGE',
  unknownId: 'OUT-EX-UNKNOWN-ID',
  cancelled: 'OUT-EX-CANCEL',
  destinationConflict: 'OUT-EX-DEST-CONFLICT',
  sourceInvalid: 'OUT-EX-SOURCE-MISSING',
  copyFailed: 'OUT-EX-COPY-FAIL',
  publishFailed: 'OUT-EX-RENAME-FAIL'
});

const COPY_ERROR_CODES = new Set([
  'command_usage_error',
  'example_catalog_invalid',
  'example_not_found',
  'example_selection_cancelled',
  'example_destination_exists',
  'example_source_invalid',
  'example_copy_failed',
  'example_publish_failed'
]);

/**
 * Copy one catalog example into an absent destination and publish it atomically.
 *
 * The function is synchronous by design: it only uses local filesystem
 * primitives and is safe to await from an asynchronous CLI caller. It accepts
 * either copyExample({ id, destination, ...options }) or
 * copyExample(id, destination, options).
 */
export function copyExample(firstArgument, secondArgument, thirdArgument = {}) {
  const request = normalizeRequest(firstArgument, secondArgument, thirdArgument);
  const filesystem = request.filesystem ?? fs;

  if (isCancelled(request)) {
    throw typedError(
      'example_selection_cancelled',
      'Example copy was cancelled before filesystem mutation.',
      { id: request.id, destination: request.destination }
    );
  }

  if (!isNonEmptyString(request.id)) {
    throw typedError(
      'command_usage_error',
      '`launchdeck example copy` requires an example ID.',
      { syntax: 'launchdeck example copy [<id>] [<destination>]' }
    );
  }

  const rootDir = resolveRootDir(request.rootDir);
  const catalog = readCatalog(request, rootDir);
  const entry = catalog.find((candidate) => candidate?.id === request.id);
  if (!entry) {
    throw typedError(
      'example_not_found',
      `Example '${request.id}' was not found in the packaged catalog.`,
      {
        id: request.id,
        destination: request.destination,
        availableIds: catalog.map((candidate) => candidate.id)
      }
    );
  }

  const source = preflightSource(entry, rootDir, request.sourceRoot, filesystem);
  const destination = preflightDestination(
    request,
    entry.id,
    source.sourcePath,
    filesystem
  );

  return publishCopy({
    request,
    entry,
    source,
    destination,
    filesystem
  });
}

export default copyExample;

function normalizeRequest(firstArgument, secondArgument, thirdArgument) {
  if (isPlainObject(firstArgument)) {
    return {
      ...(isPlainObject(thirdArgument) ? thirdArgument : {}),
      ...firstArgument,
      ...(secondArgument === undefined ? {} : { destination: secondArgument })
    };
  }

  return {
    ...(isPlainObject(thirdArgument) ? thirdArgument : {}),
    id: firstArgument,
    destination: secondArgument
  };
}

function readCatalog(request, rootDir) {
  if (Array.isArray(request.catalog)) {
    return request.catalog;
  }

  const catalogLoader = request.catalogLoader ?? loadCatalog;
  try {
    const catalog = catalogLoader({ rootDir });
    if (!Array.isArray(catalog)) {
      throw new Error('Catalog loader did not return an array.');
    }
    return catalog;
  } catch (error) {
    if (error?.code === 'example_catalog_invalid') {
      throw error;
    }
    throw typedError(
      'example_catalog_invalid',
      'Unable to validate the packaged example catalog.',
      { cause: errorCode(error), rootDir }
    );
  }
}

function preflightSource(entry, rootDir, requestedSourceRoot, filesystem) {
  if (!isPlainObject(entry) || !isNonEmptyString(entry.id) ||
      !isNonEmptyString(entry.sourcePath) || entry.sourcePath.includes('\\') ||
      path.posix.isAbsolute(entry.sourcePath) || entry.id.includes('/') ||
      entry.id.includes('\\') || entry.id === '.' || entry.id === '..') {
    throw typedError(
      'example_source_invalid',
      'The packaged example source path is invalid.',
      { id: entry?.id, sourcePath: entry?.sourcePath }
    );
  }

  const sourceRoot = path.resolve(
    requestedSourceRoot ?? path.join(rootDir, SOURCE_ROOT_RELATIVE_PATH)
  );
  const sourcePath = path.resolve(rootDir, entry.sourcePath);
  const expectedSourcePath = path.join(sourceRoot, entry.id);

  if (!isInside(sourceRoot, sourcePath) ||
      !samePath(sourcePath, expectedSourcePath)) {
    throw typedError(
      'example_source_invalid',
      `Example '${entry.id}' points outside the packaged source root.`,
      {
        id: entry.id,
        sourcePath,
        sourceRoot
      }
    );
  }

  const sourceRootStat = lstatOrThrow(
    filesystem,
    sourceRoot,
    () => typedError(
      'example_source_invalid',
      'The packaged example source root is unavailable.',
      { id: entry.id, sourceRoot }
    )
  );
  if (!sourceRootStat.isDirectory() || sourceRootStat.isSymbolicLink()) {
    throw typedError(
      'example_source_invalid',
      'The packaged example source root must be a real directory.',
      { id: entry.id, sourceRoot }
    );
  }

  const sourceRootReal = realpathOrThrow(
    filesystem,
    sourceRoot,
    () => typedError(
      'example_source_invalid',
      'The packaged example source root cannot be resolved.',
      { id: entry.id, sourceRoot }
    )
  );
  const sourceStat = lstatOrThrow(
    filesystem,
    sourcePath,
    () => typedError(
      'example_source_invalid',
      `The source for example '${entry.id}' is unavailable.`,
      { id: entry.id, sourcePath }
    )
  );
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
    throw typedError(
      'example_source_invalid',
      `The source for example '${entry.id}' must be a real directory.`,
      { id: entry.id, sourcePath }
    );
  }

  const sourceReal = realpathOrThrow(
    filesystem,
    sourcePath,
    () => typedError(
      'example_source_invalid',
      `The source for example '${entry.id}' cannot be resolved.`,
      { id: entry.id, sourcePath }
    )
  );
  if (!isInside(sourceRootReal, sourceReal)) {
    throw typedError(
      'example_source_invalid',
      `The source for example '${entry.id}' resolves outside the packaged source root.`,
      { id: entry.id, sourcePath, sourceRoot }
    );
  }

  inspectSourceTree(sourcePath, sourceRootReal, entry.id, filesystem);
  return Object.freeze({ sourcePath, sourceRoot, sourceRootReal, sourceReal });
}

function inspectSourceTree(directory, sourceRootReal, id, filesystem) {
  const entries = readDirectoryOrThrow(filesystem, directory, () => typedError(
    'example_source_invalid',
    `The source for example '${id}' could not be inspected.`,
    { id, sourcePath: directory }
  ));

  for (const entry of entries) {
    const name = entry.name;
    if (!isSafeEntryName(name) || isForbiddenSourceName(name)) {
      throw typedError(
        'example_source_invalid',
        `The source for example '${id}' contains a forbidden or unsafe entry.`,
        { id, path: path.join(directory, name) }
      );
    }

    const childPath = path.join(directory, name);
    const childStat = lstatOrThrow(
      filesystem,
      childPath,
      () => typedError(
        'example_source_invalid',
        `The source for example '${id}' changed during validation.`,
        { id, path: childPath }
      )
    );
    if (childStat.isSymbolicLink() || isUnsupportedSourceType(childStat)) {
      throw typedError(
        'example_source_invalid',
        `The source for example '${id}' contains a symbolic link, reparse point, or unsupported file type.`,
        { id, path: childPath }
      );
    }

    const childReal = realpathOrThrow(
      filesystem,
      childPath,
      () => typedError(
        'example_source_invalid',
        `The source for example '${id}' contains an unresolved entry.`,
        { id, path: childPath }
      )
    );
    if (!isInside(sourceRootReal, childReal)) {
      throw typedError(
        'example_source_invalid',
        `The source for example '${id}' escapes the packaged source root.`,
        { id, path: childPath, sourceRoot: sourceRootReal }
      );
    }

    if (childStat.isDirectory()) {
      inspectSourceTree(childPath, sourceRootReal, id, filesystem);
    } else if (!childStat.isFile()) {
      throw typedError(
        'example_source_invalid',
        `The source for example '${id}' contains an unsupported entry.`,
        { id, path: childPath }
      );
    }
  }
}

function preflightDestination(request, id, sourcePath, filesystem) {
  if (request.destination !== undefined && !isNonEmptyString(request.destination)) {
    throw typedError(
      'command_usage_error',
      'Example destination must be a non-empty path.',
      { syntax: 'launchdeck example copy [<id>] [<destination>]' }
    );
  }

  const cwd = request.cwd === undefined ? process.cwd() : request.cwd;
  if (!isNonEmptyString(cwd) || cwd.includes('\0')) {
    throw typedError('command_usage_error', 'Example copy working directory is invalid.', { cwd });
  }

  const destinationPath = path.resolve(cwd, request.destination ?? id);
  if (destinationPath.includes('\0')) {
    throw typedError('command_usage_error', 'Example destination contains an invalid character.', {
      destination: request.destination
    });
  }
  if (isInside(sourcePath, destinationPath, true)) {
    throw typedError(
      'example_copy_failed',
      'Example destination must not be inside its packaged source tree.',
      { id, destination: destinationPath, phase: 'destination-preflight' }
    );
  }

  const parentPath = path.dirname(destinationPath);
  const parentStat = lstatOrThrow(
    filesystem,
    parentPath,
    () => typedError(
      'example_copy_failed',
      'Example destination parent is unavailable.',
      { id, destination: destinationPath, parent: parentPath, phase: 'destination-preflight' }
    )
  );
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw typedError(
      'example_copy_failed',
      'Example destination parent must be a real directory.',
      { id, destination: destinationPath, parent: parentPath, phase: 'destination-preflight' }
    );
  }

  const parentReal = realpathOrThrow(
    filesystem,
    parentPath,
    () => typedError(
      'example_copy_failed',
      'Example destination parent cannot be resolved safely.',
      { id, destination: destinationPath, parent: parentPath, phase: 'destination-preflight' }
    )
  );
  if (!samePath(parentPath, parentReal) || isInside(sourcePath, parentReal, true)) {
    throw typedError(
      'example_copy_failed',
      'Example destination parent must not be a symlink or source-tree path.',
      { id, destination: destinationPath, parent: parentPath, phase: 'destination-preflight' }
    );
  }

  if (typeof filesystem.accessSync === 'function') {
    try {
      filesystem.accessSync(parentPath, filesystem.constants.W_OK | filesystem.constants.X_OK);
    } catch (error) {
      throw typedError(
        'example_copy_failed',
        'Example destination parent is not writable.',
        {
          id,
          destination: destinationPath,
          parent: parentPath,
          phase: 'destination-preflight',
          cause: errorCode(error)
        }
      );
    }
  }

  assertDestinationAbsent(filesystem, destinationPath, id);
  return Object.freeze({ destinationPath, parentPath, parentReal });
}

function publishCopy({ request, entry, source, destination, filesystem }) {
  const id = entry.id;
  const { destinationPath, parentPath } = destination;
  const identity = targetIdentity(destinationPath);
  const lockPath = path.join(parentPath, `.${identity}.launchdeck-copy.lock`);
  const stagingPrefix = path.join(parentPath, `.${identity}.launchdeck-staging-`);
  let ownedLock = false;
  let ownedStaging = false;
  let stagingPath;
  let stagingIdentity;
  let phase = 'lock';
  let renameSucceeded = false;

  try {
    acquireLock(filesystem, lockPath, id, destinationPath);
    ownedLock = true;

    phase = 'destination-recheck';
    assertDestinationAbsent(filesystem, destinationPath, id);

    phase = 'staging';
    try {
      stagingPath = filesystem.mkdtempSync(stagingPrefix);
      ownedStaging = true;
      assertOwnedDirectory(filesystem, stagingPath, parentPath, id, 'staging');
    } catch (error) {
      throw typedError(
        'example_copy_failed',
        `Unable to create staging for example '${id}'.`,
        {
          id,
          destination: destinationPath,
          staging: stagingPath,
          phase,
          cause: errorCode(error)
        }
      );
    }

    phase = 'copy';
    try {
      const copyTree = request.copyTree ?? copySourceTree;
      copyTree(source.sourcePath, stagingPath, { filesystem, id });
    } catch (error) {
      if (error?.code === 'example_source_invalid') {
        throw error;
      }
      throw typedError(
        'example_copy_failed',
        `Unable to copy example '${id}' into staging.`,
        {
          id,
          destination: destinationPath,
          staging: stagingPath,
          phase,
          cause: errorCode(error)
        }
      );
    }

    phase = 'prepublish';
    assertOwnedDirectory(filesystem, lockPath, parentPath, id, 'lock');
    assertDestinationAbsent(filesystem, destinationPath, id);
    stagingIdentity = lstatOrThrow(
      filesystem,
      stagingPath,
      () => typedError(
        'example_publish_failed',
        `Staging for example '${id}' disappeared before publication.`,
        { id, destination: destinationPath, staging: stagingPath, phase }
      )
    );

    phase = 'rename';
    try {
      renameStagingWithRetry({
        request,
        filesystem,
        stagingPath,
        destinationPath,
        lockPath,
        parentPath,
        id
      });
      renameSucceeded = true;
      ownedStaging = false;
    } catch (error) {
      throw typedError(
        'example_publish_failed',
        `Unable to atomically publish example '${id}'.`,
        {
          id,
          destination: destinationPath,
          staging: stagingPath,
          phase,
          cause: errorCode(error)
        }
      );
    }

    phase = 'published';
    const publishedStat = lstatOrThrow(
      filesystem,
      destinationPath,
      () => typedError(
        'example_publish_failed',
        `Published example '${id}' could not be verified.`,
        { id, destination: destinationPath, phase, published: true }
      )
    );
    if (!publishedStat.isDirectory() || publishedStat.isSymbolicLink()) {
      throw typedError(
        'example_publish_failed',
        `Published example '${id}' has an unsafe destination type.`,
        { id, destination: destinationPath, phase, published: true }
      );
    }

    const lockCleanup = cleanupOwnedDirectory(filesystem, lockPath, parentPath, true);
    ownedLock = false;
    if (lockCleanup.status !== 'removed' && lockCleanup.status !== 'absent') {
      throw typedError(
        'example_publish_failed',
        `Published example '${id}' left lock cleanup unresolved.`,
        {
          id,
          destination: destinationPath,
          phase,
          published: true,
          cleanup: { lock: lockCleanup }
        }
      );
    }

    return deepFreeze({
      id,
      destination: destinationPath
    });
  } catch (error) {
    const cleanup = {
      staging: cleanupOwnedDirectory(filesystem, stagingPath, parentPath, ownedStaging),
      destination: cleanupDestinationAfterFailure({
        filesystem,
        destinationPath,
        parentPath,
        stagingIdentity,
        phase,
        renameSucceeded
      }),
      lock: cleanupOwnedDirectory(filesystem, lockPath, parentPath, ownedLock)
    };
    const normalizedError = normalizeFailure(error, {
      id,
      destination: destinationPath,
      staging: stagingPath,
      phase,
      cleanup
    });
    throw normalizedError;
  }
}

function renameStagingWithRetry({
  request,
  filesystem,
  stagingPath,
  destinationPath,
  lockPath,
  parentPath,
  id
}) {
  const rename = request.rename ?? ((from, to) => filesystem.renameSync(from, to));

  for (let attempt = 0; ; attempt += 1) {
    try {
      rename(stagingPath, destinationPath);
      return;
    } catch (error) {
      const retryDelay = PUBLISH_RENAME_RETRY_DELAYS_MS[attempt];
      if (!TRANSIENT_PUBLISH_ERROR_CODES.has(error?.code) || retryDelay === undefined) {
        throw error;
      }

      waitSynchronously(retryDelay);
      assertOwnedDirectory(filesystem, lockPath, parentPath, id, 'lock');
      assertOwnedDirectory(filesystem, stagingPath, parentPath, id, 'staging');
      assertDestinationAbsent(filesystem, destinationPath, id);
    }
  }
}

function waitSynchronously(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function copySourceTree(sourcePath, stagingPath, { filesystem, id }) {
  const entries = readDirectoryOrThrow(filesystem, sourcePath, () => typedError(
    'example_source_invalid',
    `The source for example '${id}' could not be read during copy.`,
    { id, sourcePath }
  ));

  for (const entry of entries) {
    if (!isSafeEntryName(entry.name) || isForbiddenSourceName(entry.name)) {
      throw typedError(
        'example_source_invalid',
        `The source for example '${id}' changed to include an unsafe entry.`,
        { id, path: path.join(sourcePath, entry.name) }
      );
    }

    const sourceEntry = path.join(sourcePath, entry.name);
    const destinationEntry = path.join(stagingPath, entry.name);
    const stat = lstatOrThrow(filesystem, sourceEntry, () => typedError(
      'example_source_invalid',
      `The source for example '${id}' changed during copy.`,
      { id, path: sourceEntry }
    ));
    if (stat.isSymbolicLink() || isUnsupportedSourceType(stat)) {
      throw typedError(
        'example_source_invalid',
        `The source for example '${id}' contains an unsafe entry.`,
        { id, path: sourceEntry }
      );
    }

    if (stat.isDirectory()) {
      filesystem.mkdirSync(destinationEntry);
      copySourceTree(sourceEntry, destinationEntry, { filesystem, id });
    } else if (stat.isFile()) {
      filesystem.copyFileSync(sourceEntry, destinationEntry, filesystem.constants.COPYFILE_EXCL);
    } else {
      throw typedError(
        'example_source_invalid',
        `The source for example '${id}' contains an unsupported entry.`,
        { id, path: sourceEntry }
      );
    }
  }
}

function acquireLock(filesystem, lockPath, id, destinationPath) {
  try {
    filesystem.mkdirSync(lockPath, { recursive: false, mode: 0o700 });
  } catch (error) {
    throw typedError(
      'example_copy_failed',
      `Unable to reserve the copy lock for example '${id}'.`,
      {
        id,
        destination: destinationPath,
        lock: lockPath,
        phase: 'lock',
        cause: errorCode(error)
      }
    );
  }
}

function assertDestinationAbsent(filesystem, destinationPath, id) {
  let stat;
  try {
    stat = filesystem.lstatSync(destinationPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw typedError(
      'example_copy_failed',
      `Unable to inspect the destination for example '${id}'.`,
      { id, destination: destinationPath, phase: 'destination-preflight', cause: errorCode(error) }
    );
  }

  if (stat) {
    throw typedError(
      'example_destination_exists',
      `Example destination already exists: ${destinationPath}`,
      { id, destination: destinationPath, type: fileType(stat) }
    );
  }
}

function assertOwnedDirectory(filesystem, targetPath, parentPath, id, kind) {
  if (!targetPath || !samePath(path.dirname(targetPath), parentPath)) {
    throw typedError(
      'example_copy_failed',
      `The example ${kind} path is outside its destination parent.`,
      { id, path: targetPath, parent: parentPath, phase: kind }
    );
  }

  const stat = lstatOrThrow(filesystem, targetPath, () => typedError(
    'example_copy_failed',
    `The example ${kind} path disappeared.`,
    { id, path: targetPath, phase: kind }
  ));
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw typedError(
      'example_copy_failed',
      `The example ${kind} path is not an owned directory.`,
      { id, path: targetPath, phase: kind }
    );
  }
}

function cleanupOwnedDirectory(filesystem, targetPath, parentPath, owned) {
  if (!targetPath || !owned) {
    return { status: 'not-owned' };
  }
  if (!samePath(path.dirname(targetPath), parentPath)) {
    return { status: 'refused', reason: 'parent-mismatch' };
  }

  let stat;
  try {
    stat = filesystem.lstatSync(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { status: 'absent' };
    }
    return { status: 'failed', cause: errorCode(error) };
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return { status: 'refused', reason: 'type-changed' };
  }

  try {
    filesystem.rmSync(targetPath, { recursive: true, force: true });
  } catch (error) {
    return { status: 'failed', cause: errorCode(error) };
  }

  try {
    filesystem.lstatSync(targetPath);
    return { status: 'failed', cause: 'residue-present' };
  } catch (error) {
    return error?.code === 'ENOENT'
      ? { status: 'removed' }
      : { status: 'failed', cause: errorCode(error) };
  }
}

function cleanupDestinationAfterFailure({
  filesystem,
  destinationPath,
  parentPath,
  stagingIdentity,
  phase,
  renameSucceeded
}) {
  if (renameSucceeded) {
    return { status: 'published-preserved' };
  }

  let destinationStat;
  try {
    destinationStat = filesystem.lstatSync(destinationPath);
  } catch (error) {
    return error?.code === 'ENOENT'
      ? { status: 'absent' }
      : { status: 'failed', cause: errorCode(error) };
  }

  if (phase !== 'rename' || !stagingIdentity || !sameFileIdentity(destinationStat, stagingIdentity)) {
    return { status: 'preserved', reason: 'not-owned' };
  }
  if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink() ||
      !samePath(path.dirname(destinationPath), parentPath)) {
    return { status: 'refused', reason: 'type-or-parent-changed' };
  }

  try {
    filesystem.rmSync(destinationPath, { recursive: true, force: true });
  } catch (error) {
    return { status: 'failed', cause: errorCode(error) };
  }

  try {
    filesystem.lstatSync(destinationPath);
    return { status: 'failed', cause: 'residue-present' };
  } catch (error) {
    return error?.code === 'ENOENT'
      ? { status: 'removed' }
      : { status: 'failed', cause: errorCode(error) };
  }
}

function normalizeFailure(error, context) {
  const code = COPY_ERROR_CODES.has(error?.code)
    ? error.code
    : context.phase === 'rename' || context.phase === 'published'
      ? 'example_publish_failed'
      : 'example_copy_failed';
  const message = error?.message ?? `Example copy failed during ${context.phase}.`;
  const details = deepFreeze({
    ...(isPlainObject(error?.details) ? error.details : {}),
    id: context.id,
    destination: context.destination,
    ...(context.staging === undefined ? {} : { staging: context.staging }),
    phase: context.phase,
    cleanup: context.cleanup
  });
  return new LaunchdeckError(code, message, details);
}

function lstatOrThrow(filesystem, targetPath, onMissing) {
  try {
    return filesystem.lstatSync(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw onMissing();
    }
    throw onMissing(error);
  }
}

function realpathOrThrow(filesystem, targetPath, onFailure) {
  try {
    return filesystem.realpathSync(targetPath);
  } catch (error) {
    throw onFailure(error);
  }
}

function readDirectoryOrThrow(filesystem, directory, onFailure) {
  try {
    return filesystem.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    throw onFailure(error);
  }
}

function resolveRootDir(rootDir) {
  if (rootDir === undefined) {
    return DEFAULT_ROOT_DIR;
  }
  if (!isNonEmptyString(rootDir) || rootDir.includes('\0')) {
    throw typedError('command_usage_error', 'Example package root must be a valid directory path.', { rootDir });
  }
  return path.resolve(rootDir);
}

function targetIdentity(destinationPath) {
  return crypto
    .createHash('sha256')
    .update(normalizeIdentityPath(destinationPath))
    .digest('hex')
    .slice(0, 24);
}

function normalizeIdentityPath(targetPath) {
  const resolved = path.resolve(targetPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isCancelled(request) {
  return request.cancelled === true || request.signal?.aborted === true;
}

function isForbiddenSourceName(name) {
  const normalized = name.toLowerCase();
  return FORBIDDEN_SOURCE_NAMES.includes(normalized) || normalized.startsWith('.launchdeck.');
}

function isSafeEntryName(name) {
  return typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..' &&
    !name.includes('/') && !name.includes('\\') && !name.includes('\0');
}

function isUnsupportedSourceType(stat) {
  return stat.isSocket?.() === true || stat.isFIFO?.() === true ||
    stat.isBlockDevice?.() === true || stat.isCharacterDevice?.() === true;
}

function fileType(stat) {
  if (stat.isDirectory()) return 'directory';
  if (stat.isFile()) return 'file';
  if (stat.isSymbolicLink()) return 'symlink';
  return 'other';
}

function sameFileIdentity(left, right) {
  return left?.dev !== undefined && right?.dev !== undefined &&
    left?.ino !== undefined && right?.ino !== undefined &&
    String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino);
}

function samePath(left, right) {
  const normalizedLeft = path.normalize(path.resolve(left));
  const normalizedRight = path.normalize(path.resolve(right));
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isInside(rootPath, targetPath, includeEqual = false) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  if (relative === '') {
    return includeEqual;
  }
  return !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function typedError(code, message, details = undefined) {
  return new LaunchdeckError(code, message, details);
}

function errorCode(error) {
  return error?.code ?? error?.name ?? 'unknown_error';
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
