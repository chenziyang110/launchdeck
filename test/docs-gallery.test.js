import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadCatalog } from '../src/examples/catalog.js';
import { repoRoot } from './helpers/cli-fixture.js';

const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const catalog = loadCatalog({ rootDir: repoRoot });

test('README documents the catalog-derived gallery and both example commands', () => {
  assert.match(readme, /## Standalone Sample Project Gallery/);
  assert.match(readme, /launchdeck example list --json/);
  assert.match(readme, /launchdeck example copy vite-react-habit-tracker/);
  assert.match(readme, /does not install[\s\S]*dependencies[\s\S]*run a build[\s\S]*start a service/);
  assert.match(readme, /no broad macOS support claim/);

  for (const entry of catalog) {
    assert.ok(readme.includes(`| \`${entry.id}\` |`), `README is missing ${entry.id}`);
    assert.ok(readme.includes(`| \`${entry.id}\` | ${entry.stack} |`), `README has the wrong stack for ${entry.id}`);
  }
});

test('README states that gallery copies are source-only and outside evaluation scoring', () => {
  assert.match(readme, /only copies source files/i);
  assert.match(readme, /create a `\.launchdeck\.yml`/i);
  assert.match(readme, /not Launchdeck evaluation targets or scored demos/i);
  assert.match(readme, /no Launchdeck configuration/i);
});
