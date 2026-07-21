import path from 'node:path';

export const PROJECT_CONTEXT_STATUSES = Object.freeze([
  'resolved',
  'missing',
  'ambiguous',
  'conflicting',
  'out_of_scope',
  'unconfigured'
]);

export function resolveProjectContext(options = {}) {
  const projects = Array.isArray(options.registry?.projects) ? options.registry.projects : [];
  const projectRef = normalizeOptionalString(options.projectRef);
  const trustedRoot = normalizeOptionalPath(options.trustedContext?.adapterProjectRoot);
  const pluginRoots = (options.pluginRoots ?? []).map(normalizeOptionalPath).filter(Boolean);
  const cwd = normalizeOptionalPath(options.cwd);
  const reasons = [];

  if (cwd && pluginRoots.some((root) => samePath(root, cwd))) reasons.push('plugin_cwd_ignored');
  if (projects.length === 0) return unresolved('unconfigured', 'project_not_configured', reasons);

  const explicitMatches = projectRef ? projects.filter((project) => matchesProjectRef(project, projectRef)) : [];
  if (projectRef && explicitMatches.length === 0) return unresolved('missing', 'project_scope_missing', reasons);
  if (explicitMatches.length > 1) return unresolved('ambiguous', 'project_scope_ambiguous', reasons);

  const trustedMatches = trustedRoot
    ? projects.filter((project) => samePath(project.projectRoot, trustedRoot))
    : [];
  if (trustedRoot && trustedMatches.length === 0) return unresolved('out_of_scope', 'project_scope_violation', reasons);
  if (trustedMatches.length > 1) return unresolved('ambiguous', 'project_scope_ambiguous', reasons);

  const explicit = explicitMatches[0];
  const trusted = trustedMatches[0];
  if (explicit && trusted && projectIdentity(explicit) !== projectIdentity(trusted)) {
    return unresolved('conflicting', 'project_scope_conflicting', reasons);
  }

  const selected = explicit ?? trusted ?? selectWorkspaceProject(projects, options.trustedContext?.workspaceRoots);
  if (selected?.ambiguous) return unresolved('ambiguous', 'project_scope_ambiguous', reasons);
  if (selected?.outOfScope) return unresolved('out_of_scope', 'project_scope_violation', reasons);
  if (selected?.project) return resolved(selected.project, 'trustedContext.workspaceRoots', reasons);
  if (explicit) return resolved(explicit, 'input.projectRef', reasons);
  if (trusted) return resolved(trusted, 'trustedContext.adapterProjectRoot', reasons);

  if (options.allowUserScopeDefault === true && projects.length === 1) {
    return resolved(projects[0], 'registered-project-default', reasons);
  }
  return unresolved('unconfigured', 'project_not_configured', reasons);
}

function selectWorkspaceProject(projects, workspaceRoots) {
  const roots = (workspaceRoots ?? []).map(normalizeOptionalPath).filter(Boolean);
  if (roots.length === 0) return null;
  const matches = projects.filter((project) => roots.some((root) => samePath(project.projectRoot, root)));
  if (matches.length === 1) return { project: matches[0] };
  if (matches.length > 1) return { ambiguous: true };
  return { outOfScope: true };
}

function matchesProjectRef(project, projectRef) {
  return [project.projectId, project.id, project.alias, project.name]
    .filter((value) => value !== undefined && value !== null)
    .some((value) => String(value) === projectRef)
    || samePath(project.projectRoot, projectRef);
}

function resolved(project, source, reasons) {
  return Object.freeze({
    status: 'resolved',
    code: 'project_scope_resolved',
    project,
    source,
    reasons: Object.freeze([...reasons])
  });
}

function unresolved(status, code, reasons) {
  return Object.freeze({
    status,
    code,
    project: null,
    source: null,
    reasons: Object.freeze([...reasons])
  });
}

function projectIdentity(project) {
  return String(project.projectId ?? project.id ?? normalizeOptionalPath(project.projectRoot));
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeOptionalPath(value) {
  const normalized = normalizeOptionalString(value);
  return normalized ? path.resolve(normalized) : null;
}

function samePath(left, right) {
  const normalizedLeft = normalizeOptionalPath(left);
  const normalizedRight = normalizeOptionalPath(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
