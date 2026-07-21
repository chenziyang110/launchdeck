#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { builtinModules } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import semver from 'semver';
import { createSkillContentManifest } from '../src/agent-installer.js';
import {
  canonicalDigest,
  computeBuildIdentity,
  validateCompatibilityManifest
} from '../src/kernel/compatibility.js';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const defaultOutputDir = path.join(repoRoot, 'dist', 'agent-plugins');
const hosts = Object.freeze(['codex', 'claude']);
const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

export async function buildAgentPlugins(options = {}) {
  const outputDir = path.resolve(options.outputDir ?? defaultOutputDir);
  const observedNodeVersion = normalizeNodeVersion(options.nodeVersion ?? process.versions.node);
  if (!observedNodeVersion || !semver.satisfies(observedNodeVersion, '>=20')) {
    const error = new Error(`Node ${options.nodeVersion ?? process.versions.node} does not satisfy >=20.`);
    error.code = 'node_version_unsupported';
    throw error;
  }
  assertSafeOutputDir(outputDir);

  const packageJson = readJson(path.join(repoRoot, 'package.json'));
  const packageVersion = options.packageVersion ?? packageJson.version;
  if (!semver.valid(packageVersion)) {
    const error = new Error(`Plugin package version must be strict semver: ${packageVersion}`);
    error.code = 'package_version_invalid';
    throw error;
  }
  const baseCompatibility = readJson(path.join(repoRoot, 'agent', 'compatibility-manifest.json'));
  const skillSource = path.join(repoRoot, '.agents', 'skills', 'launchdeck-agent');
  const skillManifest = createSkillContentManifest(skillSource);
  const bundle = await buildRuntimeBundle(packageVersion);
  assertNoExternalNpmImports(bundle.metafile);
  const hostTemplateDigests = Object.fromEntries(hosts.map((host) => [host, hostTemplateDigest(host)]));
  const compatibility = deriveCompatibilityManifest({
    baseCompatibility,
    packageVersion,
    runtimeBytes: bundle.bytes,
    skillManifest,
    hostTemplateDigests
  });

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  writeJson(path.join(outputDir, 'esbuild-metafile.json'), bundle.metafile);

  const artifacts = [];
  for (const host of hosts) {
    const artifactRoot = path.join(outputDir, host);
    renderArtifact({
      host,
      artifactRoot,
      packageVersion,
      buildIdentity: compatibility.buildIdentity,
      compatibility,
      runtimeBytes: bundle.bytes,
      skillSource
    });
    const archivePath = path.join(outputDir, `launchdeck-${host}-plugin.tgz`);
    writeDeterministicArchive(artifactRoot, archivePath);
    artifacts.push({
      host,
      generated: true,
      artifactRoot,
      archivePath,
      runtimeEntrypoint: path.join(artifactRoot, 'runtime', 'launchdeck-mcp.mjs')
    });
  }

  return {
    schemaVersion: 1,
    evidenceScope: 'generation',
    readinessClaims: [],
    buildIdentity: compatibility.buildIdentity,
    outputDir,
    bundle: {
      format: 'esm',
      platform: 'node',
      target: 'node20',
      splitting: false,
      metafile: path.join(outputDir, 'esbuild-metafile.json')
    },
    artifacts
  };
}

async function buildRuntimeBundle(packageVersion) {
  const operationSchema = readJson(path.join(repoRoot, 'schema', 'agent-operations.schema.json'));
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: ['src/mcp/stdio-server.js'],
    outfile: 'launchdeck-mcp.mjs',
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    splitting: false,
    sourcemap: false,
    legalComments: 'none',
    charset: 'utf8',
    metafile: true,
    banner: {
      js: "import { createRequire as __launchdeckCreateRequire } from 'node:module'; const require = __launchdeckCreateRequire(import.meta.url);"
    },
    define: {
      __LAUNCHDECK_PLUGIN_BUNDLE__: 'true',
      __LAUNCHDECK_PACKAGE_VERSION__: JSON.stringify(packageVersion),
      __LAUNCHDECK_AGENT_OPERATIONS_SCHEMA__: JSON.stringify(operationSchema)
    }
  });
  if (result.outputFiles.length !== 1) {
    const error = new Error(`Expected one runtime output, received ${result.outputFiles.length}.`);
    error.code = 'bundle_output_invalid';
    throw error;
  }
  return { bytes: Buffer.from(result.outputFiles[0].contents), metafile: result.metafile };
}

function deriveCompatibilityManifest(input) {
  const manifest = structuredClone(input.baseCompatibility);
  manifest.packageVersion = input.packageVersion;
  manifest.nodeRange = '>=20';
  manifest.componentDigests.runtimeBundle = sha256(input.runtimeBytes);
  manifest.componentDigests.canonicalSkillContentManifest = input.skillManifest.contentDigest;
  manifest.componentDigests.operationRegistry = manifest.supportedOperations.registryDigest;
  manifest.componentDigests.operationSchemas = manifest.supportedOperations.schemaDigest;
  for (const host of hosts) {
    manifest.hostArtifacts[host].integrityDigest = input.hostTemplateDigests[host];
  }
  manifest.buildIdentity = computeBuildIdentity(manifest);
  const validation = validateCompatibilityManifest(manifest);
  if (!validation.ok) {
    const error = new Error(`Generated compatibility manifest is invalid: ${JSON.stringify(validation.errors)}`);
    error.code = 'compatibility_manifest_invalid';
    throw error;
  }
  return validation.value;
}

function renderArtifact(input) {
  fs.mkdirSync(input.artifactRoot, { recursive: true });
  const runtimePath = path.join(input.artifactRoot, 'runtime', 'launchdeck-mcp.mjs');
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.writeFileSync(runtimePath, input.runtimeBytes);
  copySkillTree(input.skillSource, path.join(input.artifactRoot, 'skills', 'launchdeck-agent'));
  writeJson(path.join(input.artifactRoot, 'compatibility.json'), input.compatibility);

  const pluginTarget = input.host === 'codex'
    ? path.join(input.artifactRoot, '.codex-plugin', 'plugin.json')
    : path.join(input.artifactRoot, '.claude-plugin', 'plugin.json');
  writeJson(pluginTarget, renderTemplate(readHostTemplate(input.host, 'plugin'), {
    '$PACKAGE_VERSION': input.packageVersion,
    '$BUILD_IDENTITY': input.buildIdentity
  }));
  writeJson(
    path.join(input.artifactRoot, '.mcp.json'),
    renderTemplate(readHostTemplate(input.host, 'mcp'), {
      '$PACKAGE_VERSION': input.packageVersion,
      '$BUILD_IDENTITY': input.buildIdentity
    })
  );

  const integrityPath = path.join(input.artifactRoot, 'artifact-integrity.json');
  const files = treeInventory(input.artifactRoot).filter((entry) => entry.path !== 'artifact-integrity.json');
  writeJson(integrityPath, {
    schemaVersion: 1,
    algorithm: 'sha256',
    buildIdentity: input.buildIdentity,
    files
  });
}

function readHostTemplate(host, kind) {
  return readJson(path.join(repoRoot, 'agent', 'plugins', host, `${kind}.template.json`));
}

function hostTemplateDigest(host) {
  return canonicalDigest({
    plugin: readHostTemplate(host, 'plugin'),
    mcp: readHostTemplate(host, 'mcp')
  });
}

function renderTemplate(value, replacements) {
  if (typeof value === 'string') return replacements[value] ?? value;
  if (Array.isArray(value)) return value.map((item) => renderTemplate(item, replacements));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, renderTemplate(child, replacements)]));
}

function copySkillTree(sourceRoot, targetRoot) {
  const manifest = createSkillContentManifest(sourceRoot);
  for (const entry of manifest.files) {
    const source = path.resolve(sourceRoot, ...entry.path.split('/'));
    const target = path.resolve(targetRoot, ...entry.path.split('/'));
    assertWithin(targetRoot, target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function assertNoExternalNpmImports(metafile) {
  const external = Object.values(metafile.outputs)
    .flatMap((output) => output.imports ?? [])
    .filter((entry) => entry.external === true && !nodeBuiltins.has(entry.path));
  if (external.length === 0) return;
  const error = new Error(`Bundled runtime has external npm imports: ${external.map((entry) => entry.path).join(', ')}`);
  error.code = 'bundle_external_import';
  throw error;
}

function treeInventory(root) {
  const files = [];
  collectTreeFiles(root, root, files);
  return files.sort((left, right) => compare(left.path, right.path));
}

function collectTreeFiles(root, current, files) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (entry.isSymbolicLink()) {
      const error = new Error(`Generated artifacts cannot contain symlinks: ${relative}`);
      error.code = 'artifact_symlink';
      throw error;
    }
    if (entry.isDirectory()) collectTreeFiles(root, absolute, files);
    else if (entry.isFile()) {
      const content = fs.readFileSync(absolute);
      files.push({ path: relative, bytes: content.length, sha256: sha256(content) });
    }
  }
}

function writeDeterministicArchive(root, archivePath) {
  const chunks = [];
  for (const entry of treeInventory(root)) {
    const content = fs.readFileSync(path.join(root, ...entry.path.split('/')));
    chunks.push(createTarHeader(entry.path, content.length), content);
    const remainder = content.length % 512;
    if (remainder !== 0) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1_024));
  const gzip = zlib.gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
  gzip[9] = 255;
  fs.writeFileSync(archivePath, gzip);
}

function createTarHeader(relativePath, size) {
  const header = Buffer.alloc(512);
  const { name, prefix } = splitTarPath(relativePath);
  writeTarString(header, 0, 100, name);
  writeTarOctal(header, 100, 8, 0o644);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, size);
  writeTarOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeTarString(header, 257, 6, 'ustar');
  writeTarString(header, 263, 2, '00');
  writeTarString(header, 345, 155, prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeTarString(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return header;
}

function splitTarPath(relativePath) {
  if (Buffer.byteLength(relativePath) <= 100) return { name: relativePath, prefix: '' };
  const slash = relativePath.lastIndexOf('/');
  if (slash <= 0) throw new Error(`Tar path is too long: ${relativePath}`);
  const prefix = relativePath.slice(0, slash);
  const name = relativePath.slice(slash + 1);
  if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
    throw new Error(`Tar path is too long: ${relativePath}`);
  }
  return { name, prefix };
}

function writeTarString(buffer, offset, length, value) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length > length) throw new Error(`Tar field exceeds ${length} bytes.`);
  bytes.copy(buffer, offset);
}

function writeTarOctal(buffer, offset, length, value) {
  writeTarString(buffer, offset, length, `${value.toString(8).padStart(length - 2, '0')}\0`);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function normalizeNodeVersion(value) {
  return semver.valid(value) ?? semver.coerce(value)?.version ?? null;
}

function assertSafeOutputDir(outputDir) {
  const parsed = path.parse(outputDir);
  if (outputDir === parsed.root || outputDir === repoRoot) {
    const error = new Error(`Refusing unsafe output directory: ${outputDir}`);
    error.code = 'output_dir_unsafe';
    throw error;
  }
}

function assertWithin(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error(`Generated path escapes artifact root: ${target}`);
    error.code = 'artifact_path_escape';
    throw error;
  }
}

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function main(argv) {
  const options = parseArgs(argv);
  try {
    const report = await buildAgentPlugins(options);
    if (options.json) process.stdout.write(`${JSON.stringify(report)}\n`);
    else process.stdout.write(`Built Launchdeck Agent Plugins at ${report.outputDir}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      source: 'build-agent-plugins',
      code: error?.code ?? 'plugin_build_failed',
      message: error?.message ?? 'Plugin build failed.'
    })}\n`);
    return 1;
  }
}

function parseArgs(argv) {
  const options = {
    outputDir: defaultOutputDir,
    nodeVersion: process.versions.node,
    packageVersion: undefined,
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out-dir') {
      options.outputDir = argv[++index];
      if (!options.outputDir) throw new Error('--out-dir requires a value.');
    } else if (arg === '--node-version') {
      options.nodeVersion = argv[++index];
      if (!options.nodeVersion) throw new Error('--node-version requires a value.');
    } else if (arg === '--package-version') {
      options.packageVersion = argv[++index];
      if (!options.packageVersion) throw new Error('--package-version requires a value.');
    } else if (arg === '--json') {
      options.json = true;
    } else {
      const error = new Error(`Unknown argument: ${arg}`);
      error.code = 'invalid_arguments';
      throw error;
    }
  }
  return options;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2));
}
