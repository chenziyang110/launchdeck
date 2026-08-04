import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { parseNpmPackJson } from '../../scripts/run-agent-installer-package-evidence.js';
import { copyExample } from '../../src/examples/copy.js';
import { loadCatalog } from '../../src/examples/catalog.js';
import { repoRoot } from '../helpers/cli-fixture.js';

const SAMPLE_ROOT = path.join(repoRoot, 'examples', 'sample-projects');
const GALLERY_PREFIX = 'examples/sample-projects/';
const PACKAGE_GALLERY_PREFIX = `package/${GALLERY_PREFIX}`;
const PACKED_SIZE_LIMIT = 5 * 1024 * 1024;
const UNPACKED_SIZE_LIMIT = 20 * 1024 * 1024;
const FORBIDDEN_DIRECTORY_NAMES = new Set([
  '.git',
  '.launchdeck',
  '.npm',
  '.pytest_cache',
  '__pycache__',
  'bin',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'obj',
  'target',
  'vendor',
  '.venv',
  'venv'
]);
const FORBIDDEN_FILE_NAMES = new Set([
  '.env',
  '.launchdeck.json',
  '.launchdeck.yml'
]);
const FORBIDDEN_FILE_EXTENSIONS = /\.(?:db|log|pyc|sqlite|sqlite3|tgz|tar|zip)$/i;
const FORBIDDEN_CONTENT_NAMES = /(?:answer|evaluation|score|scoring|telemetry)/i;

const catalog = loadCatalog({ rootDir: repoRoot });
let packRoot;
let packageEntry;
let tarballPath;

test.before(() => {
  packRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-gallery-package-'));
  const npmCommand = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const npmArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm.cmd', 'pack', '--json', '--pack-destination', packRoot]
    : ['pack', '--json', '--pack-destination', packRoot];
  const result = spawnSync(
    npmCommand,
    npmArgs,
    {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true
    }
  );

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const entries = parseNpmPackJson(result.stdout);
  assert.equal(Array.isArray(entries), true);
  assert.equal(entries.length, 1);
  packageEntry = entries[0];
  tarballPath = path.resolve(packRoot, packageEntry.filename);
  assert.equal(fs.existsSync(tarballPath), true, tarballPath);
});

test.after(() => {
  if (packRoot) fs.rmSync(packRoot, { recursive: true, force: true });
});

test('real npm pack contains the exact catalog and catalog-derived source inventory', () => {
  const expectedGalleryFiles = repositoryGalleryFiles();
  const actualPackageFiles = packageInventory();
  const actualGalleryFiles = actualPackageFiles
    .filter((file) => file.startsWith(PACKAGE_GALLERY_PREFIX))
    .sort();
  const actualTarballFiles = [...readTarFiles(tarballPath).keys()]
    .filter((file) => file.startsWith(PACKAGE_GALLERY_PREFIX))
    .sort();

  assert.deepEqual(
    actualGalleryFiles,
    expectedGalleryFiles.map((file) => `package/${file}`).sort()
  );
  assert.deepEqual(actualTarballFiles, actualGalleryFiles);
  assert.equal(
    actualGalleryFiles.includes(`${PACKAGE_GALLERY_PREFIX}catalog.json`),
    true
  );
  assert.equal(new Set(actualPackageFiles).size, actualPackageFiles.length);
});

test('repository sources, successful copies, and tarball sources have matching digests', () => {
  const sourceFiles = repositoryProjectFiles();
  const tarballFiles = tarballGalleryFiles();
  assert.deepEqual([...tarballFiles.keys()].sort(), [...sourceFiles.keys()].sort());

  const copyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-gallery-copies-'));
  try {
    for (const entry of catalog) {
      copyExample({
        id: entry.id,
        destination: path.join(copyRoot, entry.id),
        rootDir: repoRoot,
        catalog
      });
    }
    const copiedFiles = copiedProjectFiles(copyRoot);
    assert.deepEqual([...copiedFiles.keys()].sort(), [...sourceFiles.keys()].sort());
    assert.equal(digestFiles(sourceFiles), digestFiles(copiedFiles));
    assert.equal(digestFiles(sourceFiles), digestFiles(tarballFiles));
  } finally {
    fs.rmSync(copyRoot, { recursive: true, force: true });
  }
});

test('catalog and source bytes in the tarball match the repository gallery digest', () => {
  const repositoryFiles = new Map(
    repositoryGalleryFiles().map((file) => [
      file.slice(GALLERY_PREFIX.length),
      fs.readFileSync(path.join(repoRoot, file))
    ])
  );
  const tarballFiles = new Map(
    [...readTarFiles(tarballPath)]
      .filter(([file]) => file.startsWith(PACKAGE_GALLERY_PREFIX))
      .map(([file, content]) => [file.slice(PACKAGE_GALLERY_PREFIX.length), content])
  );

  assert.deepEqual([...tarballFiles.keys()].sort(), [...repositoryFiles.keys()].sort());
  assert.equal(digestFiles(repositoryFiles), digestFiles(tarballFiles));
});

test('repository and packed gallery trees contain no forbidden dependency, build, runtime, or evaluation files', () => {
  const repositoryForbidden = repositoryGalleryFiles().filter(isForbiddenGalleryPath);
  const packedForbidden = [...readTarFiles(tarballPath).keys()]
    .filter((file) => file.startsWith(PACKAGE_GALLERY_PREFIX))
    .map((file) => file.slice('package/'.length))
    .filter(isForbiddenGalleryPath);

  assert.deepEqual(repositoryForbidden, []);
  assert.deepEqual(packedForbidden, []);
});

test('real npm pack stays within the packed and unpacked size contract', () => {
  const tarballSize = fs.statSync(tarballPath).size;
  const inventorySize = packageEntry.files.reduce((total, file) => total + file.size, 0);

  assert.equal(typeof packageEntry.size, 'number');
  assert.equal(typeof packageEntry.unpackedSize, 'number');
  assert.equal(packageEntry.size, tarballSize);
  assert.equal(packageEntry.unpackedSize, inventorySize);
  assert.ok(packageEntry.size <= PACKED_SIZE_LIMIT, `packed size ${packageEntry.size} exceeds ${PACKED_SIZE_LIMIT}`);
  assert.ok(
    packageEntry.unpackedSize <= UNPACKED_SIZE_LIMIT,
    `unpacked size ${packageEntry.unpackedSize} exceeds ${UNPACKED_SIZE_LIMIT}`
  );
});

function repositoryGalleryFiles() {
  const files = new Set(['examples/sample-projects/catalog.json']);
  for (const entry of catalog) {
    for (const file of walkFiles(path.resolve(repoRoot, entry.sourcePath))) {
      files.add(toRepositoryRelative(file));
    }
  }

  const walked = walkFiles(SAMPLE_ROOT).map(toRepositoryRelative).sort();
  assert.deepEqual([...files].sort(), walked);
  return walked;
}

function repositoryProjectFiles() {
  const files = new Map();
  for (const entry of catalog) {
    const sourceRoot = path.resolve(repoRoot, entry.sourcePath);
    for (const file of walkFiles(sourceRoot)) {
      const relative = path.relative(sourceRoot, file).replaceAll(path.sep, '/');
      files.set(`${entry.id}/${relative}`, fs.readFileSync(file));
    }
  }
  return files;
}

function copiedProjectFiles(copyRoot) {
  const files = new Map();
  for (const entry of catalog) {
    const sourceRoot = path.join(copyRoot, entry.id);
    for (const file of walkFiles(sourceRoot)) {
      const relative = path.relative(sourceRoot, file).replaceAll(path.sep, '/');
      files.set(`${entry.id}/${relative}`, fs.readFileSync(file));
    }
  }
  return files;
}

function packageInventory() {
  return packageEntry.files.map((file) => `package/${file.path.replaceAll('\\', '/')}`);
}

function tarballGalleryFiles() {
  const tarFiles = readTarFiles(tarballPath);
  const files = new Map();
  for (const [file, content] of tarFiles) {
    if (!file.startsWith(PACKAGE_GALLERY_PREFIX)) continue;
    const relative = file.slice(PACKAGE_GALLERY_PREFIX.length);
    if (relative === 'catalog.json') continue;
    files.set(relative, content);
  }

  return new Map(
    [...files.entries()].map(([relative, content]) => {
      const id = relative.slice(0, relative.indexOf('/'));
      return [`${id}/${relative.slice(id.length + 1)}`, content];
    })
  );
}

function readTarFiles(filePath) {
  const archive = zlib.gunzipSync(fs.readFileSync(filePath));
  const files = new Map();
  let offset = 0;

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const prefix = tarString(header, 345);
    const name = [prefix, tarString(header, 0)].filter(Boolean).join('/');
    const size = tarOctal(header.subarray(124, 136));
    const type = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    if (type === '0') files.set(name, Buffer.from(archive.subarray(contentStart, contentEnd)));
    offset = contentStart + Math.ceil(size / 512) * 512;
  }

  return files;
}

function tarString(header, start) {
  return header.subarray(start, start + (start === 345 ? 155 : 100)).toString('utf8').replace(/\0.*$/, '');
}

function tarOctal(value) {
  const text = value.toString('ascii').replace(/\0/g, '').trim();
  return text ? Number.parseInt(text, 8) : 0;
}

function digestFiles(files) {
  const hash = crypto.createHash('sha256');
  for (const [relative, content] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(`${relative}\0`);
    hash.update(content);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function isForbiddenGalleryPath(relativePath) {
  const names = relativePath.split('/').filter(Boolean).map((name) => name.toLowerCase());
  return names.some((name) => FORBIDDEN_DIRECTORY_NAMES.has(name))
    || names.some((name) => FORBIDDEN_FILE_NAMES.has(name))
    || names.some((name) => FORBIDDEN_FILE_EXTENSIONS.test(name))
    || names.some((name) => FORBIDDEN_CONTENT_NAMES.test(name));
}

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Gallery source must not contain a symbolic link: ${entryPath}`);
    }
    if (entry.isDirectory()) return walkFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}

function toRepositoryRelative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, '/');
}
