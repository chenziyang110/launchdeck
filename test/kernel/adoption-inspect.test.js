import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAdoptionHandlers } from '../../src/kernel/operations/adoption.js';
import { AGENT_OPERATION_NAMES } from '../../src/kernel/operation-registry.js';

test('adoption.inspect returns a bounded proposed plan with byte-for-byte zero writes', async () => {
  await withAdoptionFixture(async ({ projectRoot, homeDir }) => {
    const before = snapshotTrees([projectRoot, homeDir]);
    const counters = { processStarts: 0, portMutations: 0 };
    const handlers = createAdoptionHandlers({
      env: { ...process.env, LAUNCHDECK_HOME: homeDir },
      onProcessStart: () => { counters.processStarts += 1; },
      onPortMutation: () => { counters.portMutations += 1; }
    });

    const result = await handlers['adoption.inspect']({
      request: { input: { maxDepth: 3, maxFiles: 4, signals: ['package', 'scripts', 'compose', 'existingConfig'] } },
      inputs: {
        projectContext: {
          status: 'resolved',
          project: { projectId: 'project-a', alias: 'alpha', projectRoot }
        }
      }
    });
    const after = snapshotTrees([projectRoot, homeDir]);

    assert.deepEqual(after, before);
    assert.deepEqual(counters, { processStarts: 0, portMutations: 0 });
    assert.equal(result.resource.kind, 'adoptionPlan');
    assert.equal(result.resource.status, 'planned');
    assert.match(result.resource.data.planDigest, /^sha256:[a-f0-9]{64}$/);
    assert.ok(result.resource.data.evidence.files.length <= 4);
    assert.ok(result.resource.data.evidence.maxDepth <= 3);
    assert.equal(result.effects.certainty, 'none');
    assert.equal(result.effects.changed, false);
    assert.equal(fs.existsSync(path.join(projectRoot, '.launchdeck.yml')), false);
    assert.equal(fs.existsSync(path.join(homeDir, 'registry', 'projects.json')), false);
    assert.equal(fs.existsSync(path.join(homeDir, 'runtime', 'operations')), false);
    assert.equal(JSON.stringify(result).includes('adoption.apply'), false);
    assert.equal(AGENT_OPERATION_NAMES.includes('adoption.apply'), false);
  });
});

test('adoption inspection uses only the trusted project root and does not follow escaping symlinks', async () => {
  await withAdoptionFixture(async ({ projectRoot, outsideRoot, homeDir }) => {
    const outsideSecret = path.join(outsideRoot, 'outside-secret.txt');
    fs.writeFileSync(outsideSecret, 'outside-secret-must-not-appear');
    const linkPath = path.join(projectRoot, 'linked-outside');
    let symlinkCreated = false;
    try {
      fs.symlinkSync(outsideRoot, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
      symlinkCreated = true;
    } catch {
      // Symlink creation may be unavailable in restricted Windows environments.
    }
    const handlers = createAdoptionHandlers({ env: { ...process.env, LAUNCHDECK_HOME: homeDir } });

    const result = await handlers['adoption.inspect']({
      request: { input: { maxDepth: 6, maxFiles: 500 } },
      inputs: { projectContext: { status: 'resolved', project: { projectId: 'project-a', projectRoot } } }
    });

    assert.equal(JSON.stringify(result).includes('outside-secret-must-not-appear'), false);
    assert.equal(result.resource.data.evidence.files.some((file) => file.includes('outside-secret.txt')), false);
    if (symlinkCreated) {
      assert.ok(result.resource.data.evidence.skippedSymlinks.includes('linked-outside'));
    }
  });
});

async function withAdoptionFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-adoption-'));
  const projectRoot = path.join(root, 'project');
  const outsideRoot = path.join(root, 'outside');
  const homeDir = path.join(root, 'home');
  fs.mkdirSync(path.join(projectRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(outsideRoot, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ scripts: { dev: 'node server.js' } }, null, 2));
  fs.writeFileSync(path.join(projectRoot, 'scripts', 'dev.js'), 'console.log("dev");\n');
  fs.writeFileSync(path.join(projectRoot, 'compose.yml'), 'services: {}\n');
  try {
    await callback({ root, projectRoot, outsideRoot, homeDir });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function snapshotTrees(roots) {
  return roots.map((root) => ({ root, entries: snapshotTree(root) }));
}

function snapshotTree(root) {
  if (!fs.existsSync(root)) return [];
  const entries = [];
  walk(root, '');
  return entries;

  function walk(current, relative) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const entryRelative = path.join(relative, entry.name);
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        entries.push({ path: entryRelative, type: 'symlink', target: fs.readlinkSync(entryPath) });
      } else if (entry.isDirectory()) {
        entries.push({ path: entryRelative, type: 'directory' });
        walk(entryPath, entryRelative);
      } else {
        entries.push({
          path: entryRelative,
          type: 'file',
          digest: crypto.createHash('sha256').update(fs.readFileSync(entryPath)).digest('hex')
        });
      }
    }
  }
}
