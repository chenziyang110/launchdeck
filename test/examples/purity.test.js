import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { repoRoot } from '../helpers/cli-fixture.js';

const SAMPLE_ROOT = path.join(repoRoot, 'examples', 'sample-projects');
const EXPECTED_IDS = new Set([
  'vite-react-habit-tracker',
  'nextjs-blog-manager',
  'nestjs-url-shortener',
  'fastapi-inventory',
  'django-events',
  'go-webhook-inbox',
  'spring-boot-orders',
  'aspnet-library-catalog',
  'docker-compose-helpdesk',
  'node-python-issue-tracker'
]);
const FORBIDDEN_NAMES = new Set(['.launchdeck.yml', '.launchdeck', '.launchdeck.json']);

test('sample source tree contains only the exact standalone projects and no Launchdeck artifacts', () => {
  const directories = fs.readdirSync(SAMPLE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  assert.deepEqual(new Set(directories), EXPECTED_IDS);
  assert.equal(directories.length, EXPECTED_IDS.size);

  for (const id of directories) {
    const root = path.join(SAMPLE_ROOT, id);
    const files = walk(root);
    assert.ok(files.some((file) => path.basename(file) === 'LICENSE'), id);
    assert.ok(files.some((file) => /(^|\/)package-lock\.json$|(^|\/)poetry\.lock$|(^|\/)go\.sum$|(^|\/)pom\.xml$|(^|\/)\.csproj$|(^|\/)packages\.lock\.json$|(^|\/)docker-compose\.ya?ml$/.test(file.replaceAll('\\', '/'))), id);
    for (const file of files) {
      assert.equal(FORBIDDEN_NAMES.has(path.basename(file)), false, file);
      assert.equal(path.basename(file).toLowerCase().includes('answer'), false, file);
      assert.equal(path.basename(file).toLowerCase().includes('score'), false, file);
    }
  }
});

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}
