import { createIssueStore } from './store.mjs';

const store = createIssueStore();
const issues = await store.seed();
console.log(JSON.stringify({ seeded: store.seedCount, total: issues.length }, null, 2));

