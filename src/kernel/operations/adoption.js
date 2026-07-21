import fs from 'node:fs';
import path from 'node:path';
import { LaunchdeckError } from '../../errors.js';
import { canonicalDigest } from '../compatibility.js';

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_FILES = 200;
const ALL_SIGNALS = Object.freeze([
  'package', 'scripts', 'compose', 'make', 'just', 'taskfile', 'existingConfig'
]);

export function createAdoptionHandlers() {
  return Object.freeze({
    'adoption.inspect': async (context) => inspectAdoption(context)
  });
}

export async function inspectAdoption(context = {}) {
  const project = context.inputs?.projectContext?.project;
  const projectRoot = requireTrustedProjectRoot(project?.projectRoot);
  const input = context.request?.input ?? {};
  const maxDepth = normalizeBound(input.maxDepth, DEFAULT_MAX_DEPTH, 1, 6, 'maxDepth');
  const maxFiles = normalizeBound(input.maxFiles, DEFAULT_MAX_FILES, 1, 500, 'maxFiles');
  const requestedSignals = input.signals ?? ALL_SIGNALS;
  const evidence = scanProject(projectRoot, { maxDepth, maxFiles, requestedSignals });
  const proposedConfig = buildProposedConfig(projectRoot, evidence, requestedSignals);
  const plan = {
    projectId: project.projectId ?? project.id ?? null,
    evidence,
    proposedConfig
  };

  return {
    outcome: {
      kind: 'succeeded',
      code: 'adoption_inspected',
      message: 'Project adoption signals were inspected without applying changes.',
      reusedExistingRun: false
    },
    resource: {
      kind: 'adoptionPlan',
      id: null,
      status: 'planned',
      projectRef: project.projectId ?? project.id ?? null,
      taskRef: null,
      runId: null,
      data: {
        planDigest: canonicalDigest(plan),
        proposedConfig,
        evidence
      }
    },
    effects: { certainty: 'none', changed: false, evidenceRefs: [] },
    error: null,
    nextActions: []
  };
}

function scanProject(projectRoot, options) {
  const files = [];
  const skippedSymlinks = [];
  const signalMatches = Object.fromEntries(options.requestedSignals.map((signal) => [signal, []]));
  let truncated = false;
  walk(projectRoot, '', 0);
  return {
    maxDepth: options.maxDepth,
    maxFiles: options.maxFiles,
    files,
    skippedSymlinks,
    signals: signalMatches,
    truncated
  };

  function walk(currentPath, relativeDir, depth) {
    if (depth > options.maxDepth || truncated) return;
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (truncated) break;
      const relativePath = normalizeRelative(path.join(relativeDir, entry.name));
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isSymbolicLink()) {
        skippedSymlinks.push(relativePath);
        continue;
      }
      if (entry.isDirectory()) {
        if (depth < options.maxDepth) walk(absolutePath, relativePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= options.maxFiles) {
        truncated = true;
        break;
      }
      files.push(relativePath);
      for (const signal of options.requestedSignals) {
        if (matchesSignal(signal, relativePath)) signalMatches[signal].push(relativePath);
      }
    }
  }
}

function buildProposedConfig(projectRoot, evidence, requestedSignals) {
  const tasks = {};
  if (requestedSignals.includes('package') || requestedSignals.includes('scripts')) {
    const packagePath = path.join(projectRoot, 'package.json');
    if (evidence.files.includes('package.json') && fs.statSync(packagePath).size <= 64 * 1024) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        for (const [name, command] of Object.entries(packageJson.scripts ?? {}).slice(0, 50)) {
          if (typeof command === 'string') {
            tasks[name] = { source: 'package.json', commandSummary: command.slice(0, 256) };
          }
        }
      } catch {
        // Invalid package metadata remains observable through evidence without becoming configuration authority.
      }
    }
  }
  return {
    version: 1,
    projectName: path.basename(projectRoot),
    tasks,
    detectedSignals: Object.entries(evidence.signals)
      .filter(([, matches]) => matches.length > 0)
      .map(([signal]) => signal)
      .sort()
  };
}

function matchesSignal(signal, relativePath) {
  const basename = path.posix.basename(relativePath).toLowerCase();
  if (signal === 'package') return basename === 'package.json';
  if (signal === 'scripts') return relativePath.toLowerCase().startsWith('scripts/') || basename === 'package.json';
  if (signal === 'compose') return ['compose.yml', 'compose.yaml', 'docker-compose.yml', 'docker-compose.yaml'].includes(basename);
  if (signal === 'make') return basename === 'makefile';
  if (signal === 'just') return basename === 'justfile';
  if (signal === 'taskfile') return basename === 'taskfile.yml' || basename === 'taskfile.yaml';
  if (signal === 'existingConfig') return basename === '.launchdeck.yml' || basename === '.launchdeck.yaml';
  return false;
}

function requireTrustedProjectRoot(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new LaunchdeckError('project_scope_missing', 'A trusted resolved project root is required for adoption inspection.');
  }
  const projectRoot = path.resolve(value);
  let stats;
  try {
    stats = fs.statSync(projectRoot);
  } catch (error) {
    throw new LaunchdeckError('project_not_found', `Project root is unavailable: ${projectRoot}`, {
      projectRoot,
      causeCode: error?.code
    });
  }
  if (!stats.isDirectory()) {
    throw new LaunchdeckError('project_scope_violation', `Project root is not a directory: ${projectRoot}`, { projectRoot });
  }
  return projectRoot;
}

function normalizeBound(value, fallback, minimum, maximum, label) {
  const normalized = value ?? fallback;
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new LaunchdeckError('observation_limit_invalid', `${label} must be between ${minimum} and ${maximum}.`);
  }
  return normalized;
}

function normalizeRelative(value) {
  return value.split(path.sep).join('/');
}
