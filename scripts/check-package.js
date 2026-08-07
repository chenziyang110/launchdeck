#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const roots = ['package.json', 'README.md', 'LICENSE', ...packageJson.files];
const required = [
  'src/cli.js',
  'src/mcp/stdio-server.js',
  'agent/compatibility-manifest.json',
  'agent/evidence/index.json',
  'agent/installer-payload/manifest.json',
  'examples/sample-projects/catalog.json'
];
const missingRoots = roots.filter((entry) => !fs.existsSync(path.join(repoRoot, entry)));
const files = [];

for (const entry of roots) {
  if (fs.existsSync(path.join(repoRoot, entry))) walk(entry);
}

const included = new Set(files.map((file) => file.path));
const missingRequired = required.filter((entry) => !included.has(entry));
const ok = missingRoots.length === 0 && missingRequired.length === 0;
const output = {
  ok,
  package: packageJson.name,
  version: packageJson.version,
  checkedRoots: roots,
  fileCount: files.length,
  unpackedSize: files.reduce((total, file) => total + file.size, 0),
  missingRoots,
  missingRequired
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(output, null, 2));
} else if (ok) {
  console.log(packageJson.name + '@' + packageJson.version + ' package inventory check passed (' + files.length + ' files).');
} else {
  console.error(JSON.stringify(output, null, 2));
}

process.exitCode = ok ? 0 : 1;

function walk(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(absolutePath).sort()) {
      walk(path.posix.join(relativePath.replaceAll('\\', '/').replace(/\/$/, ''), name));
    }
    return;
  }
  files.push({ path: relativePath.replaceAll('\\', '/'), size: stat.size });
}
