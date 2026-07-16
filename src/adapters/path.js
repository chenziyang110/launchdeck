import fs from 'node:fs';
import path from 'node:path';
import { LaunchdeckError } from '../errors.js';

const CASE_INSENSITIVE_PLATFORMS = new Set(['win32']);

export function canonicalPath(targetPath, options = {}) {
  const {
    basePath = process.cwd(),
    mustExist = false,
    resolveSymlinks = false,
    platform = process.platform,
    label = 'Path',
    code = 'project_root_escape'
  } = options;

  const pathApi = pathForPlatform(platform);
  const value = normalizePathValue(targetPath, label, code);
  const base = normalizePathValue(basePath, 'Base path', code);
  const resolved = pathApi.resolve(base, value);

  if ((mustExist || resolveSymlinks) && !fs.existsSync(resolved)) {
    throw new LaunchdeckError(code, `${label} does not exist.`, {
      targetPath: resolved
    });
  }

  if (resolveSymlinks) {
    return pathApi.normalize(fs.realpathSync.native(resolved));
  }

  return pathApi.normalize(resolved);
}

export function canonicalProjectRoot(projectRoot, options = {}) {
  return canonicalPath(projectRoot, {
    ...options,
    basePath: options.basePath ?? process.cwd(),
    label: options.label ?? 'Project root',
    code: options.code ?? 'project_root_escape'
  });
}

export function resolveProjectPath(projectRoot, targetPath, options = {}) {
  const root = canonicalProjectRoot(projectRoot, options);
  const resolved = canonicalPath(targetPath, {
    ...options,
    basePath: root,
    label: options.label ?? 'Project path',
    code: options.code ?? 'project_root_escape'
  });
  assertContainedPath(root, resolved, {
    ...options,
    allowRoot: options.allowRoot ?? true
  });
  return resolved;
}

export function pathContains(parentPath, targetPath, options = {}) {
  const {
    allowRoot = true,
    platform = process.platform
  } = options;

  const pathApi = pathForPlatform(platform);
  const parent = comparablePath(canonicalPath(parentPath, {
    ...options,
    label: options.parentLabel ?? 'Parent path'
  }), platform);
  const target = comparablePath(canonicalPath(targetPath, {
    ...options,
    basePath: parentPath,
    label: options.label ?? 'Target path'
  }), platform);
  const relative = pathApi.relative(parent, target);

  if (relative === '') {
    return allowRoot;
  }

  return Boolean(relative) && !relative.startsWith('..') && !pathApi.isAbsolute(relative);
}

export function assertContainedPath(projectRoot, targetPath, options = {}) {
  const {
    label = 'Path',
    code = 'project_root_escape',
    allowRoot = true,
    platform = process.platform
  } = options;

  const root = canonicalProjectRoot(projectRoot, { platform, code });
  const resolved = canonicalPath(targetPath, {
    basePath: root,
    platform,
    label,
    code
  });

  if (!pathContains(root, resolved, { allowRoot, platform })) {
    throw new LaunchdeckError(code, `${label} must stay inside the project root.`, {
      projectRoot: root,
      targetPath: resolved
    });
  }

  return resolved;
}

export function isSamePath(left, right, options = {}) {
  const platform = options.platform ?? process.platform;
  return comparablePath(canonicalPath(left, options), platform) === comparablePath(canonicalPath(right, options), platform);
}

export function assertProjectRelativePath(targetPath, options = {}) {
  const {
    label = 'Path',
    code = 'clean_target_ambiguous',
    platform = process.platform
  } = options;
  const pathApi = pathForPlatform(platform);
  const value = normalizePathValue(targetPath, label, code);

  if (pathApi.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
    throw new LaunchdeckError(code, `${label} must be project-relative.`, {
      targetPath: value
    });
  }

  return value;
}

export function resolveCleanTarget(projectRoot, targetPath, options = {}) {
  const {
    label = 'Clean target',
    platform = process.platform
  } = options;
  const relativePath = assertProjectRelativePath(targetPath, {
    label,
    code: 'clean_target_ambiguous',
    platform
  });
  const absolutePath = assertContainedPath(projectRoot, relativePath, {
    label,
    code: 'clean_target_outside_project',
    allowRoot: true,
    platform
  });

  if (isSamePath(projectRoot, absolutePath, { platform })) {
    throw new LaunchdeckError('clean_target_root', 'Launchdeck refuses to clean the project root.', {
      path: relativePath,
      projectRoot: canonicalProjectRoot(projectRoot, { platform })
    });
  }

  return {
    path: relativePath,
    absolutePath
  };
}

export function planCleanTarget(projectRoot, targetPath, options = {}) {
  const {
    kind = 'safe',
    description,
    label = 'Clean target',
    platform = process.platform
  } = options;
  const rawPath = typeof targetPath === 'string' ? targetPath : targetPath?.rawPath ?? targetPath?.path;
  const baseRecord = {
    kind,
    rawPath,
    path: rawPath,
    exists: false,
    status: 'refused',
    refusalCode: undefined
  };

  if (description !== undefined) {
    baseRecord.description = description;
  }

  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    return refusedCleanTarget(baseRecord, 'clean_target_empty');
  }

  const pathApi = pathForPlatform(platform);
  const cleanPath = rawPath.trim();
  baseRecord.rawPath = cleanPath;
  baseRecord.path = cleanPath;

  const root = safeCanonicalProjectRoot(projectRoot, platform);
  if (!root) {
    return refusedCleanTarget(baseRecord, 'clean_target_ambiguous');
  }

  if (pathApi.isAbsolute(cleanPath) || path.win32.isAbsolute(cleanPath) || path.posix.isAbsolute(cleanPath)) {
    return refusedCleanTarget(baseRecord, 'clean_target_ambiguous', { resolvedPath: pathApi.normalize(cleanPath) });
  }

  let resolvedPath;
  try {
    resolvedPath = canonicalPath(cleanPath, {
      basePath: root,
      platform,
      label,
      code: 'clean_target_ambiguous'
    });
  } catch {
    return refusedCleanTarget(baseRecord, 'clean_target_ambiguous');
  }

  const plannedRecord = {
    ...baseRecord,
    resolvedPath,
    absolutePath: resolvedPath
  };

  if (isSameComparablePath(root, resolvedPath, platform)) {
    return refusedCleanTarget(plannedRecord, 'clean_target_root');
  }

  if (!pathContainsComparable(root, resolvedPath, { allowRoot: false, platform })) {
    return refusedCleanTarget(plannedRecord, 'clean_target_outside_project');
  }

  if (!fs.existsSync(resolvedPath)) {
    return {
      ...plannedRecord,
      exists: false,
      status: 'skipped_missing'
    };
  }

  let canonicalTarget;
  try {
    canonicalTarget = pathApi.normalize(fs.realpathSync.native(resolvedPath));
  } catch {
    return refusedCleanTarget(plannedRecord, 'clean_target_ambiguous');
  }

  const existingRecord = {
    ...plannedRecord,
    canonicalPath: canonicalTarget,
    exists: true
  };

  if (isSameComparablePath(root, canonicalTarget, platform)) {
    return refusedCleanTarget(existingRecord, 'clean_target_root');
  }

  if (!pathContainsComparable(root, canonicalTarget, { allowRoot: false, platform })) {
    return refusedCleanTarget(existingRecord, 'clean_target_outside_project');
  }

  return {
    ...existingRecord,
    status: 'planned'
  };
}

export function assertSafeCleanTarget(projectRoot, targetPath, options = {}) {
  const {
    label = 'Clean target',
    platform = process.platform
  } = options;
  const resolved = resolveCleanTarget(projectRoot, targetPath, { label, platform });

  if (isSamePath(projectRoot, resolved.absolutePath, { platform })) {
    throw new LaunchdeckError('clean_target_root', 'Launchdeck refuses to clean the project root.', {
      path: resolved.path,
      projectRoot: canonicalProjectRoot(projectRoot, { platform })
    });
  }

  return resolved;
}

export function toProjectRelativePath(projectRoot, targetPath, options = {}) {
  const platform = options.platform ?? process.platform;
  const pathApi = pathForPlatform(platform);
  const root = canonicalProjectRoot(projectRoot, { platform });
  const resolved = assertContainedPath(root, targetPath, {
    ...options,
    allowRoot: options.allowRoot ?? true,
    platform
  });
  return pathApi.relative(root, resolved) || '.';
}

export function pathForPlatform(platform = process.platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function normalizePathValue(value, label, code) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new LaunchdeckError(code, `${label} must be a non-empty path.`, {
      value
    });
  }
  return value;
}

function comparablePath(value, platform) {
  const normalized = pathForPlatform(platform).normalize(value);
  return CASE_INSENSITIVE_PLATFORMS.has(platform) ? normalized.toLowerCase() : normalized;
}

function safeCanonicalProjectRoot(projectRoot, platform) {
  try {
    return pathForPlatform(platform).normalize(fs.realpathSync.native(canonicalProjectRoot(projectRoot, { platform })));
  } catch {
    return undefined;
  }
}

function refusedCleanTarget(record, refusalCode, extra = {}) {
  return {
    ...record,
    ...extra,
    exists: Boolean(record.exists),
    status: 'refused',
    refusalCode
  };
}

function isSameComparablePath(left, right, platform) {
  return comparablePath(left, platform) === comparablePath(right, platform);
}

function pathContainsComparable(parentPath, targetPath, options = {}) {
  const {
    allowRoot = true,
    platform = process.platform
  } = options;
  const pathApi = pathForPlatform(platform);
  const parent = comparablePath(parentPath, platform);
  const target = comparablePath(targetPath, platform);
  const relative = pathApi.relative(parent, target);

  if (relative === '') {
    return allowRoot;
  }

  return Boolean(relative) && !relative.startsWith('..') && !pathApi.isAbsolute(relative);
}
