import { seedPosts } from '../lib/posts.js';

const posts = seedPosts();
console.log(JSON.stringify({ seeded: posts.length, ids: posts.map((post) => post.id) }));
