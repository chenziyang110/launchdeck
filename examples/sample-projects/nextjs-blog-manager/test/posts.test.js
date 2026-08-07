import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createPost,
  deletePost,
  getPostBySlug,
  listPosts,
  seedPosts,
  updatePost
} from '../lib/posts.js';

function temporaryStore() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nextjs-blog-manager-'));
}

function inStore(callback) {
  const previous = process.env.BLOG_MANAGER_DATA_DIR;
  const directory = temporaryStore();
  process.env.BLOG_MANAGER_DATA_DIR = directory;
  try {
    return callback(directory);
  } finally {
    if (previous === undefined) delete process.env.BLOG_MANAGER_DATA_DIR;
    else process.env.BLOG_MANAGER_DATA_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('seed is deterministic and idempotent', () => {
  inStore((directory) => {
    const first = seedPosts();
    const firstFile = fs.readFileSync(path.join(directory, 'posts.json'), 'utf8');
    const second = seedPosts();
    const secondFile = fs.readFileSync(path.join(directory, 'posts.json'), 'utf8');

    assert.deepEqual(second, first);
    assert.equal(secondFile, firstFile);
    assert.deepEqual(first.map((post) => post.id), ['post-001', 'post-002', 'post-003']);
  });
});

test('posts persist through create, update, and delete operations', () => {
  inStore(() => {
    seedPosts();
    const created = createPost({
      title: 'A Durable Draft',
      excerpt: 'A post saved locally.',
      body: 'The body survives a fresh read from disk.',
      tags: ['persistence']
    });
    assert.equal(getPostBySlug(created.slug).title, 'A Durable Draft');

    const updated = updatePost(created.slug, { status: 'published', title: 'A Published Draft' });
    assert.equal(updated.status, 'published');
    assert.equal(getPostBySlug(created.slug).title, 'A Published Draft');

    assert.equal(deletePost(created.slug), true);
    assert.equal(getPostBySlug(created.slug), null);
    assert.equal(deletePost(created.slug), false);
  });
});

test('missing runtime data falls back to the committed seed without writing runtime state', () => {
  inStore((directory) => {
    const posts = listPosts();
    assert.equal(posts.length, 3);
    assert.equal(fs.existsSync(path.join(directory, 'posts.json')), false);
  });
});
