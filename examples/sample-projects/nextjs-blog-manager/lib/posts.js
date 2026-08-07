import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DATA_DIRECTORY = path.join(process.cwd(), '.data');
const SEED_FILE = path.join(process.cwd(), 'data', 'seed.json');

function dataDirectory() {
  return process.env.BLOG_MANAGER_DATA_DIR
    ? path.resolve(process.env.BLOG_MANAGER_DATA_DIR)
    : DEFAULT_DATA_DIRECTORY;
}

function dataFile() {
  return path.join(dataDirectory(), 'posts.json');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parsePosts(value, source) {
  if (!Array.isArray(value)) {
    throw new Error(`${source} must contain an array of posts`);
  }
  return value.map((post) => ({
    id: String(post.id),
    slug: String(post.slug),
    title: String(post.title),
    excerpt: String(post.excerpt ?? ''),
    body: String(post.body),
    author: String(post.author),
    status: post.status === 'published' ? 'published' : 'draft',
    tags: Array.isArray(post.tags) ? post.tags.map(String) : [],
    publishedAt: post.publishedAt ?? null,
    updatedAt: String(post.updatedAt)
  }));
}

function readSeed() {
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  return parsePosts(seed, SEED_FILE);
}

function readPersisted() {
  const file = dataFile();
  if (!fs.existsSync(file)) return readSeed();
  return parsePosts(JSON.parse(fs.readFileSync(file, 'utf8')), file);
}

function writePersisted(posts) {
  fs.mkdirSync(dataDirectory(), { recursive: true });
  const temporaryFile = `${dataFile()}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryFile, dataFile());
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled-post';
}

function nextId(posts) {
  const used = new Set(posts.map((post) => post.id));
  let sequence = posts.length + 1;
  let candidate = `post-${String(sequence).padStart(3, '0')}`;
  while (used.has(candidate)) {
    sequence += 1;
    candidate = `post-${String(sequence).padStart(3, '0')}`;
  }
  return candidate;
}

function uniqueSlug(posts, requestedSlug, ignoredSlug = null) {
  const base = slugify(requestedSlug);
  const used = new Set(posts.filter((post) => post.slug !== ignoredSlug).map((post) => post.slug));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function sortPosts(posts) {
  return [...posts].sort((left, right) => {
    const leftDate = left.publishedAt ?? left.updatedAt;
    const rightDate = right.publishedAt ?? right.updatedAt;
    return rightDate.localeCompare(leftDate) || left.id.localeCompare(right.id);
  });
}

export function listPosts({ status } = {}) {
  const posts = readPersisted();
  return clone(sortPosts(status ? posts.filter((post) => post.status === status) : posts));
}

export function getPostBySlug(slug) {
  const post = readPersisted().find((candidate) => candidate.slug === slug);
  return post ? clone(post) : null;
}

export function seedPosts() {
  const posts = readSeed();
  writePersisted(posts);
  return clone(posts);
}

export function createPost(input) {
  const source = input && typeof input === 'object' ? input : {};
  const posts = readPersisted();
  const title = String(source.title ?? '').trim();
  const body = String(source.body ?? '').trim();
  if (!title || !body) throw new Error('title and body are required');

  const now = new Date().toISOString();
  const status = source.status === 'published' ? 'published' : 'draft';
  const post = {
    id: nextId(posts),
    slug: uniqueSlug(posts, source.slug || title),
    title,
    excerpt: String(source.excerpt ?? '').trim(),
    body,
    author: String(source.author || 'Editorial desk').trim(),
    status,
    tags: Array.isArray(source.tags)
      ? source.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [],
    publishedAt: status === 'published' ? now : null,
    updatedAt: now
  };
  writePersisted([...posts, post]);
  return clone(post);
}

export function updatePost(slug, input) {
  const source = input && typeof input === 'object' ? input : {};
  const posts = readPersisted();
  const index = posts.findIndex((post) => post.slug === slug);
  if (index === -1) return null;

  const current = posts[index];
  const nextStatus = source.status === 'published' ? 'published' : source.status === 'draft' ? 'draft' : current.status;
  const now = new Date().toISOString();
  const updated = {
    ...current,
    ...(source.title !== undefined ? { title: String(source.title).trim() } : {}),
    ...(source.excerpt !== undefined ? { excerpt: String(source.excerpt).trim() } : {}),
    ...(source.body !== undefined ? { body: String(source.body).trim() } : {}),
    ...(source.author !== undefined ? { author: String(source.author).trim() } : {}),
    ...(Array.isArray(source.tags) ? { tags: source.tags.map(String).map((tag) => tag.trim()).filter(Boolean) } : {}),
    status: nextStatus,
    publishedAt: nextStatus === 'published' ? current.publishedAt || now : null,
    updatedAt: now
  };
  if (!updated.title || !updated.body) throw new Error('title and body are required');
  posts[index] = updated;
  writePersisted(posts);
  return clone(updated);
}

export function deletePost(slug) {
  const posts = readPersisted();
  const remaining = posts.filter((post) => post.slug !== slug);
  if (remaining.length === posts.length) return false;
  writePersisted(remaining);
  return true;
}

export function getPersistenceInfo() {
  return {
    backend: 'json-file',
    seedFile: 'data/seed.json',
    runtimeFile: '.data/posts.json',
    runtimeFileExists: fs.existsSync(dataFile())
  };
}
