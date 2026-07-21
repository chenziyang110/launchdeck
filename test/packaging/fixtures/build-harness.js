import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(fixtureDir, '..', '..', '..');
export const buildScript = path.join(repoRoot, 'scripts', 'build-agent-plugins.js');

export function runPluginBuild(outputDir, extraArgs = []) {
  const result = spawnSync(process.execPath, [buildScript, '--out-dir', outputDir, '--json', ...extraArgs], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    timeout: 120_000,
    windowsHide: true
  });
  let json = null;
  try {
    json = result.stdout.trim() ? JSON.parse(result.stdout) : null;
  } catch {
    // Tests report raw stdout when the generator emits a non-JSON contract.
  }
  return { ...result, json };
}

export function treeInventory(root) {
  const files = [];
  walk(root, root, files);
  return files.sort((left, right) => compare(left.path, right.path));
}

export function archiveInventory(archivePath) {
  const tar = zlib.gunzipSync(fs.readFileSync(archivePath));
  const paths = [];
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = cString(header.subarray(0, 100));
    const prefix = cString(header.subarray(345, 500));
    const sizeText = cString(header.subarray(124, 136)).trim();
    const size = Number.parseInt(sizeText || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    if (type === '0' || type === '\0') paths.push(prefix ? `${prefix}/${name}` : name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return paths.sort(compare);
}

export function sha256File(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walk(root, current, files) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in artifact: ${relative}`);
    if (entry.isDirectory()) {
      walk(root, absolute, files);
    } else if (entry.isFile()) {
      const content = fs.readFileSync(absolute);
      files.push({
        path: relative,
        bytes: content.length,
        sha256: `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`
      });
    }
  }
}

function cString(buffer) {
  const zero = buffer.indexOf(0);
  return buffer.subarray(0, zero < 0 ? buffer.length : zero).toString('utf8');
}

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
