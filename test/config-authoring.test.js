import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import {
  applyTaskPatch,
  assessTaskAuthoringRisk,
  proposeTaskPatch
} from '../src/config-authoring.js';

test('propose is deterministic and never writes the config', (t) => {
  const root = createProject(t);
  const configPath = writeConfig(root, configText());
  const before = fs.readFileSync(configPath, 'utf8');
  const input = { name: 'dev', command: 'npm run dev -- --host 127.0.0.1', longRunning: true };

  const first = proposeTaskPatch(root, input);
  const second = proposeTaskPatch(root, input);

  assert.deepEqual(second, first);
  assert.equal(first.operation, 'add');
  assert.equal(first.candidate.risk, 'low');
  assert.equal(first.agentExecutable, true);
  assert.match(first.diff, /\+\s+risk: low/);
  assert.equal(fs.readFileSync(configPath, 'utf8'), before);
});

test('patch requires approval and preserves the original bytes when approval is absent', (t) => {
  const root = createProject(t);
  const configPath = writeConfig(root, configText());
  const before = fs.readFileSync(configPath, 'utf8');

  assert.throws(
    () => applyTaskPatch(root, { name: 'dev', command: 'npm run dev' }),
    (error) => error.code === 'confirmation_required'
  );
  assert.equal(fs.readFileSync(configPath, 'utf8'), before);
});

test('patch atomically adds one task while preserving comments and unknown fields', (t) => {
  const root = createProject(t);
  fs.mkdirSync(path.join(root, 'packages', 'web'), { recursive: true });
  const configPath = writeConfig(root, configText());

  const result = applyTaskPatch(root, {
    name: 'web',
    command: 'npm run dev -- --host 127.0.0.1',
    cwd: 'packages/web',
    longRunning: true,
    ports: [5173]
  }, { authorized: true });
  const after = fs.readFileSync(configPath, 'utf8');
  const parsed = YAML.parse(after);

  assert.equal(result.changed, true);
  assert.match(after, /# keep this project comment/);
  assert.equal(parsed.xWorkspace.owner, 'platform');
  assert.equal(parsed.tasks.build.xExisting, 'preserved');
  assert.equal(parsed.tasks.web.cwd, 'packages/web');
  assert.equal(parsed.tasks.web.risk, 'low');
  assert.deepEqual(
    fs.readdirSync(root).filter((name) => name.includes('.launchdeck.yml.tmp-')),
    []
  );
});

test('patch refuses task collisions unless overwrite and approval are both explicit', (t) => {
  const root = createProject(t);
  const configPath = writeConfig(root, configText());
  const before = fs.readFileSync(configPath, 'utf8');

  assert.throws(
    () => applyTaskPatch(root, { name: 'build', command: 'npm run compile' }, { authorized: true }),
    (error) => error.code === 'config_task_collision'
  );
  assert.equal(fs.readFileSync(configPath, 'utf8'), before);

  applyTaskPatch(
    root,
    { name: 'build', command: 'npm run compile' },
    { authorized: true, overwrite: true }
  );
  const parsed = YAML.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(parsed.tasks.build.command, 'npm run compile');
  assert.equal(parsed.tasks.build.xExisting, 'preserved');
});

test('propose and patch reject task cwd path escapes without writing', (t) => {
  const root = createProject(t);
  const configPath = writeConfig(root, configText());
  const before = fs.readFileSync(configPath, 'utf8');

  assert.throws(
    () => proposeTaskPatch(root, { name: 'escape', command: 'npm run dev', cwd: '../outside' }),
    (error) => error.code === 'project_root_escape'
  );
  assert.throws(
    () => applyTaskPatch(
      root,
      { name: 'escape', command: 'npm run dev', cwd: '../outside' },
      { authorized: true }
    ),
    (error) => error.code === 'project_root_escape'
  );
  assert.equal(fs.readFileSync(configPath, 'utf8'), before);
});

test('ancestor config authoring requires an explicit workspace boundary and exact child cwd', (t) => {
  const root = createProject(t);
  const child = path.join(root, 'packages', 'web');
  const sibling = path.join(root, 'packages', 'api');
  fs.mkdirSync(child, { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });
  const configPath = writeConfig(root, configText());
  const before = fs.readFileSync(configPath, 'utf8');
  const task = { name: 'web', command: 'npm run dev', cwd: 'packages/web' };

  for (const operation of [
    () => proposeTaskPatch(child, task),
    () => applyTaskPatch(child, task),
    () => applyTaskPatch(child, task, { authorized: true })
  ]) {
    assert.throws(operation, (error) => {
      assert.equal(error.code, 'config_exists');
      assert.deepEqual(
        error.details.recoveryPaths.map((entry) => entry.kind),
        ['nested_config', 'workspace_task_cwd']
      );
      return true;
    });
    assert.equal(fs.readFileSync(configPath, 'utf8'), before);
  }

  for (const cwd of [undefined, '.', 'packages/api', '../outside']) {
    const input = { ...task, cwd };
    assert.throws(
      () => proposeTaskPatch(child, input, { workspace: true }),
      (error) => error.code === 'project_root_escape'
    );
    assert.equal(fs.readFileSync(configPath, 'utf8'), before);
  }

  const proposal = proposeTaskPatch(child, task, { workspace: true });
  assert.equal(proposal.configPath, configPath);
  assert.equal(proposal.candidate.cwd, 'packages/web');
  assert.equal(fs.readFileSync(configPath, 'utf8'), before);

  applyTaskPatch(child, task, { authorized: true, workspace: true });
  assert.notEqual(fs.readFileSync(configPath, 'utf8'), before);
  assert.equal(YAML.parse(fs.readFileSync(configPath, 'utf8')).tasks.web.cwd, 'packages/web');
});

test('low-risk authoring is limited to local bounded commands without sensitive env or shell chains', (t) => {
  const root = createProject(t);
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });

  assert.deepEqual(
    assessTaskAuthoringRisk({
      command: 'npm run dev -- --host 127.0.0.1',
      cwd: 'apps/web'
    }, root),
    { risk: 'low', agentExecutable: true, reasons: [] }
  );
  assert.equal(assessTaskAuthoringRisk({ command: 'python -m flask_demo' }, root).risk, 'low');

  for (const task of [
    { command: 'npm run deploy -- --target production' },
    { command: 'npm run dev && rm -rf dist' },
    { command: 'npm run dev>out.log' },
    { command: 'node app.js<input' },
    { command: 'npm run dev', env: { API_TOKEN: 'sensitive' } }
  ]) {
    const assessed = assessTaskAuthoringRisk(task, root);
    assert.equal(assessed.risk, 'medium');
    assert.equal(assessed.agentExecutable, false);
    assert.equal(assessed.reasons.length > 0, true);
  }
});

function configText() {
  return `version: 1
# keep this project comment
project:
  name: workspace
xWorkspace:
  owner: platform
tasks:
  build:
    command: npm run build
    xExisting: preserved
`;
}

function writeConfig(root, content) {
  const configPath = path.join(root, '.launchdeck.yml');
  fs.writeFileSync(configPath, content);
  return configPath;
}

function createProject(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-authoring-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
