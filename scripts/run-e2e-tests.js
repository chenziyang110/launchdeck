#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const e2eDir = path.join(repoRoot, 'test', 'e2e');
const files = fs.readdirSync(e2eDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
  .map((entry) => path.join(e2eDir, entry.name))
  .sort((left, right) => left.localeCompare(right));

if (files.length === 0) {
  throw new Error('No E2E test files were found.');
}

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  cwd: repoRoot,
  stdio: 'inherit',
  windowsHide: true
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
