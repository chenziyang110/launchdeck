import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createControlPlaneFixture } from './control-plane-fixture.js';

const helperDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureSourceDir = path.resolve(helperDir, '..', 'fixtures', 'agent-surfaces');
const manifestPath = path.join(fixtureSourceDir, 'fixture-manifest.json');

export const agentSurfaceHomePrefix = 'launchdeck-cli-agent-surfaces-home-';
export const agentSurfaceProjectPrefix = 'launchdeck-cli-agent-surfaces-project-';

export async function createAgentSurfaceFixture(options = {}) {
  const manifest = readJson(manifestPath);
  const ownershipCases = readJson(path.join(fixtureSourceDir, manifest.ownershipCases));
  const managedPort = options.managedPort ?? await getFreePort();
  const fixture = createControlPlaneFixture({
    home: { prefix: options.homePrefix ?? agentSurfaceHomePrefix },
    projectPrefix: options.projectPrefix ?? agentSurfaceProjectPrefix
  });

  materializeScripts(fixture, manifest);
  fixture.writeConfig(materializedConfig(manifest, managedPort));
  materializeCleanTargets(fixture, manifest);
  materializeSentinels(fixture, manifest);

  return {
    ...fixture,
    manifest,
    ownershipCases,
    managedPort,
    fixtureDigest: digestFixtureSources(),
    spawnReceiptPath: fixture.path('.launchdeck', 'receipts', 'spawn.ndjson'),
    finiteReceiptPath: (mode = 'low') => fixture.path('artifacts', 'finite', `${mode}-receipt.json`),
    sentinelPath: (id) => {
      const sentinel = manifest.sentinels.find((entry) => entry.id === id);
      if (!sentinel) {
        throw new Error(`Unknown agent-surface sentinel: ${id}`);
      }
      return fixture.path(...sentinel.path.split('/'));
    }
  };
}

export function digestFixtureSources() {
  const hash = crypto.createHash('sha256');
  for (const relativePath of listFixtureFiles()) {
    hash.update(relativePath.replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(fixtureSourceDir, relativePath)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function snapshotFixtureFiles(projectRoot) {
  const entries = [];
  walk(projectRoot, projectRoot, entries);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function materializedConfig(manifest, managedPort) {
  return {
    version: 1,
    project: { name: manifest.name },
    tasks: {
      managed: {
        command: `node scripts/managed-server.mjs ${managedPort}`,
        longRunning: true,
        ports: [managedPort],
        risk: 'low'
      },
      finite: {
        command: 'node scripts/finite-task.mjs low',
        longRunning: false,
        risk: 'low'
      },
      medium: {
        command: 'node scripts/finite-task.mjs medium',
        longRunning: false,
        risk: 'medium'
      }
    },
    clean: manifest.clean
  };
}

function materializeScripts(fixture, manifest) {
  const templates = new Set(manifest.tasks.map((task) => task.scriptTemplate));
  for (const templateName of templates) {
    const outputName = templateName.replace(/\.txt$/, '');
    fixture.writeScript(`scripts/${outputName}`, fs.readFileSync(path.join(fixtureSourceDir, templateName), 'utf8'));
  }
}

function materializeCleanTargets(fixture, manifest) {
  for (const entry of [...manifest.clean.safe, ...manifest.clean.risky]) {
    fixture.writeFile(`${entry.path}/generated.txt`, `${entry.path}\n`);
  }
}

function materializeSentinels(fixture, manifest) {
  for (const sentinel of manifest.sentinels) {
    fixture.writeFile(sentinel.path, sentinel.content);
  }
}

function listFixtureFiles() {
  return fs.readdirSync(fixtureSourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function walk(root, current, entries) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      walk(root, absolutePath, entries);
      continue;
    }
    const content = fs.readFileSync(absolutePath);
    entries.push({
      path: path.relative(root, absolutePath).replaceAll('\\', '/'),
      bytes: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex')
    });
  }
}

async function getFreePort() {
  const server = net.createServer();
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}
