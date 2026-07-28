import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findConfig, loadConfig, normalizeConfig } from '../src/config.js';
import { resolveCleanTargets } from '../src/runtime.js';

test('normalizes string and object task definitions', () => {
  const config = normalizeConfig(
    {
      version: 1,
      project: { name: 'demo' },
      tasks: {
        build: 'npm run build',
        dev: {
          command: 'npm run dev',
          longRunning: true,
          ports: [5173, '5173'],
          risk: 'medium'
        }
      },
      clean: {
        safe: ['dist'],
        risky: [{ path: 'node_modules', description: 'dependency install output' }]
      }
    },
    { projectRoot: process.cwd(), configPath: path.join(process.cwd(), '.launchdeck.yml') }
  );

  assert.equal(config.project.name, 'demo');
  assert.equal(config.tasks.build.command, 'npm run build');
  assert.equal(config.tasks.dev.longRunning, true);
  assert.deepEqual(config.tasks.dev.ports, [5173]);
  assert.equal(config.clean.risky[0].description, 'dependency install output');
});

test('loads config by searching upward from a child directory', (t) => {
  const root = createTempRoot(t);
  const child = path.join(root, 'packages', 'app');
  fs.mkdirSync(child, { recursive: true });
  fs.writeFileSync(
    path.join(root, '.launchdeck.yml'),
    `version: 1
project:
  name: temp-project
tasks:
  test: node --version
`
  );

  const config = loadConfig(child);
  assert.equal(config.project.name, 'temp-project');
  assert.equal(config.projectRoot, root);
});

test('uses the nearest config for an independently configured monorepo child', (t) => {
  const root = createTempRoot(t);
  const child = path.join(root, 'packages', 'app');
  const grandchild = path.join(child, 'src');
  fs.mkdirSync(grandchild, { recursive: true });
  fs.writeFileSync(path.join(root, '.launchdeck.yml'), `version: 1\nproject:\n  name: workspace\ntasks:\n  build: node --version\n`);
  fs.writeFileSync(path.join(child, '.launchdeck.yml'), `version: 1\nproject:\n  name: app\ntasks:\n  dev: node --version\n`);

  assert.equal(findConfig(grandchild), path.join(child, '.launchdeck.yml'));
  assert.equal(loadConfig(grandchild).project.name, 'app');
});

test('normalizes project.defaultTask when it names an existing task', () => {
  const config = normalizeConfig({
    version: 1,
    project: { name: 'workspace', defaultTask: 'web' },
    tasks: {
      web: { command: 'npm run dev', cwd: 'packages/web', longRunning: true }
    }
  });

  assert.equal(config.project.defaultTask, 'web');
  assert.equal(config.tasks.web.cwd, 'packages/web');
});

test('rejects project.defaultTask when the task does not exist', () => {
  assert.throws(
    () => normalizeConfig({
      version: 1,
      project: { defaultTask: 'missing' },
      tasks: { build: 'npm run build' }
    }),
    (error) => error.code === 'config_invalid' && /defaultTask.*missing/.test(error.message)
  );
});

test('refuses clean targets outside the project root', (t) => {
  const root = createTempRoot(t);

  assert.throws(
    () =>
      resolveCleanTargets(
        root,
        {
          safe: [{ path: '../outside' }],
          risky: []
        },
        'safe'
      ),
    /inside the project root/
  );
});

test('refuses to clean the project root itself', (t) => {
  const root = createTempRoot(t);

  assert.throws(
    () =>
      resolveCleanTargets(
        root,
        {
          safe: [{ path: '.' }],
          risky: []
        },
        'safe'
      ),
    /refuses to clean the project root/
  );
});

function createTempRoot(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
