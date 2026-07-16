#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['src', 'scripts', 'test', 'examples'];
const files = roots
  .flatMap((root) => collectJavaScriptFiles(path.join(repoRoot, root)))
  .sort((left, right) => left.localeCompare(right));
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    failures.push({
      file: path.relative(repoRoot, file),
      error: result.error?.message,
      stdout: result.stdout,
      stderr: result.stderr,
      status: result.status
    });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`Syntax check failed: ${failure.file}\n`);
    if (failure.error) {
      process.stderr.write(`${failure.error}\n`);
    }
    if (failure.stdout) {
      process.stderr.write(failure.stdout);
    }
    if (failure.stderr) {
      process.stderr.write(failure.stderr);
    }
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`Syntax check passed (${files.length} files).\n`);
}

function collectJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
  return files;
}
