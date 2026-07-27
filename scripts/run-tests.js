#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = path.join(repoRoot, 'test');
const files = listTestFiles(testRoot).sort();

if (files.length === 0) {
  throw new Error('No test files were found.');
}

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  cwd: repoRoot,
  stdio: 'inherit',
  windowsHide: true
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

function listTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTestFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.test.js') ? [entryPath] : [];
  });
}
