import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_SEED_PATH = path.join(PROJECT_ROOT, 'data', 'seed.json');
const DEFAULT_STORE_PATH = path.join(PROJECT_ROOT, 'data', 'node-issues.json');
const ISSUE_STATUSES = new Set(['open', 'in_progress', 'closed']);

function issueError(message, statusCode = 400, code = 'invalid_issue') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cloneIssue(issue) {
  return { ...issue, labels: [...issue.labels] };
}

function normalizeIssue(issue) {
  if (!issue || typeof issue !== 'object') throw issueError('Issue must be an object.');
  const normalized = {
    id: String(issue.id ?? '').trim(),
    title: String(issue.title ?? '').trim(),
    description: String(issue.description ?? '').trim(),
    status: String(issue.status ?? 'open').trim(),
    labels: Array.isArray(issue.labels)
      ? issue.labels.map((label) => String(label).trim()).filter(Boolean)
      : [],
    assignee: String(issue.assignee ?? '').trim(),
    createdAt: String(issue.createdAt ?? '').trim()
  };
  if (!normalized.id || !normalized.title || normalized.title.length > 120 || !ISSUE_STATUSES.has(normalized.status)) {
    throw issueError('Issue requires an id, a title up to 120 characters, and a valid status.');
  }
  if (normalized.description.length > 2000 || normalized.labels.length > 12 || normalized.assignee.length > 80 || !normalized.createdAt) {
    throw issueError('Issue fields exceed the supported limits.');
  }
  return normalized;
}

async function writeJsonAtomically(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

async function readSeed(seedPath) {
  const seed = JSON.parse(await readFile(seedPath, 'utf8'));
  if (!Array.isArray(seed) || seed.length === 0) throw issueError('Seed data must be a non-empty array.', 500, 'seed_invalid');
  return seed.map(normalizeIssue);
}

export function createIssueStore({ filePath = process.env.ISSUE_STORE_PATH ?? DEFAULT_STORE_PATH, seedPath = DEFAULT_SEED_PATH } = {}) {
  let issues = null;
  let seedIssues = null;

  async function initialize() {
    if (issues) return;
    seedIssues = await readSeed(seedPath);
    try {
      const raw = JSON.parse(await readFile(filePath, 'utf8'));
      if (!raw || !Array.isArray(raw.issues)) throw new Error('Invalid issue store.');
      issues = raw.issues.map(normalizeIssue).sort((left, right) => left.id.localeCompare(right.id));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        if (error.code === 'invalid_issue' || error.code === 'seed_invalid') throw error;
        throw issueError('The local issue store is not valid JSON.', 500, 'store_invalid');
      }
      issues = seedIssues.map(cloneIssue);
      await writeJsonAtomically(filePath, { version: 1, issues });
    }
  }

  async function persist() {
    await writeJsonAtomically(filePath, { version: 1, issues });
  }

  return {
    async list() {
      await initialize();
      return issues.map(cloneIssue);
    },
    async get(id) {
      await initialize();
      const issue = issues.find((candidate) => candidate.id === id);
      return issue ? cloneIssue(issue) : null;
    },
    async create(input) {
      await initialize();
      const nextNumber = issues.reduce((highest, issue) => {
        const match = /^ISSUE-(\d+)$/.exec(issue.id);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 1000) + 1;
      const issue = normalizeIssue({
        id: `ISSUE-${nextNumber}`,
        title: input?.title,
        description: input?.description,
        status: input?.status ?? 'open',
        labels: input?.labels,
        assignee: input?.assignee,
        createdAt: new Date().toISOString()
      });
      issues = [...issues, issue].sort((left, right) => left.id.localeCompare(right.id));
      await persist();
      return cloneIssue(issue);
    },
    async update(id, input) {
      await initialize();
      const index = issues.findIndex((issue) => issue.id === id);
      if (index < 0) throw issueError(`Issue ${id} was not found.`, 404, 'issue_not_found');
      const current = issues[index];
      const updated = normalizeIssue({ ...current, ...input, id, createdAt: current.createdAt });
      issues = issues.map((issue, candidateIndex) => (candidateIndex === index ? updated : issue));
      await persist();
      return cloneIssue(updated);
    },
    async seed() {
      await initialize();
      const byId = new Map(issues.map((issue) => [issue.id, issue]));
      for (const seedIssue of seedIssues) if (!byId.has(seedIssue.id)) byId.set(seedIssue.id, cloneIssue(seedIssue));
      issues = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
      await persist();
      return issues.map(cloneIssue);
    },
    get seedCount() {
      return seedIssues?.length ?? 0;
    }
  };
}

export { DEFAULT_SEED_PATH, DEFAULT_STORE_PATH };
