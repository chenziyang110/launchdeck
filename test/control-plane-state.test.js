import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createCliFixture,
  createLaunchdeckHome,
  managedProjectConfig,
  runCliJson
} from './helpers/control-plane-fixture.js';

test('project add creates a v2 registry/projects.json under LAUNCHDECK_HOME', async () => {
  await withControlPlaneHome(async ({ homeDir, env }) => {
    const project = createConfiguredProject('registry-v2-project');
    try {
      const result = project.runCliJson(['project', 'add', project.projectRoot, '--alias', 'registry-v2'], { env });

      assert.equal(result.status, 0, result.stderr);
      const data = payloadData(result.json);
      assert.equal(data.created, true);
      assert.equal(data.project.alias, 'registry-v2');
      assert.equal(data.project.name, 'registry-v2-project');
      assert.equal(data.project.projectRoot, project.projectRoot);
      assert.equal(data.project.configPath, project.path('.launchdeck.yml'));
      assert.equal(typeof data.project.projectId, 'string');
      assert.equal(data.project.status, 'active');

      const registryPath = path.join(homeDir, 'registry', 'projects.json');
      assert.equal(fs.existsSync(registryPath), true);
      assert.equal(fs.existsSync(path.join(homeDir, 'projects.json')), false);

      const registry = readJsonFile(registryPath);
      assert.equal(registry.version, 2);
      assert.equal(typeof registry.createdAt, 'string');
      assert.equal(typeof registry.updatedAt, 'string');
      assert.equal(registry.projects.length, 1);
      assert.deepEqual(registry.projects[0], data.project);
    } finally {
      project.cleanup();
    }
  });
});

test('projects reads legacy LAUNCHDECK_HOME/projects.json when v2 registry is absent and migrates on mutation', async () => {
  await withControlPlaneHome(async ({ homeDir, env }) => {
    const project = createConfiguredProject('legacy-project');
    try {
      const legacyRegistry = {
        version: 1,
        updatedAt: '2026-07-08T00:00:00.000Z',
        projects: [
          {
            id: 'legacy-id-001',
            key: project.projectRoot,
            name: 'legacy-project',
            projectRoot: project.projectRoot,
            configPath: project.path('.launchdeck.yml'),
            addedAt: '2026-07-08T00:00:00.000Z',
            updatedAt: '2026-07-08T00:00:00.000Z'
          }
        ]
      };
      fs.writeFileSync(path.join(homeDir, 'projects.json'), `${JSON.stringify(legacyRegistry, null, 2)}\n`);

      const listed = project.runGlobalCliJson(['projects'], { env });
      assert.equal(listed.status, 0, listed.stderr);
      assert.equal(payloadData(listed.json).projects[0].alias, 'legacy-project');
      assert.equal(payloadData(listed.json).projects[0].projectId, 'legacy-id-001');

      const addedAgain = project.runCliJson(['project', 'add', project.projectRoot, '--alias', 'legacy-project'], { env });
      assert.equal(addedAgain.status, 0, addedAgain.stderr);
      assert.equal(payloadData(addedAgain.json).updated, true);

      const migratedPath = path.join(homeDir, 'registry', 'projects.json');
      const migrated = readJsonFile(migratedPath);
      assert.equal(migrated.version, 2);
      assert.deepEqual(migrated.migratedFrom, {
        path: path.join(homeDir, 'projects.json'),
        version: 1
      });
      assert.equal(migrated.projects.length, 1);
      assert.equal(migrated.projects[0].projectId, 'legacy-id-001');
      assert.equal(migrated.projects[0].alias, 'legacy-project');
    } finally {
      project.cleanup();
    }
  });
});

test('project add keeps projectId stable across alias repair and rejects alias collisions', async () => {
  await withControlPlaneHome(async ({ env }) => {
    const first = createConfiguredProject('identity-first');
    const second = createConfiguredProject('identity-second');
    try {
      const added = first.runCliJson(['project', 'add', first.projectRoot, '--alias', 'alpha'], { env });
      assert.equal(added.status, 0, added.stderr);
      const projectId = payloadData(added.json).project.projectId;

      const repaired = first.runGlobalCliJson([
        'project',
        'repair',
        'alpha',
        '--alias',
        'bravo'
      ], { env });
      assert.equal(repaired.status, 0, repaired.stderr);
      assert.equal(payloadData(repaired.json).after.projectId, projectId);
      assert.equal(payloadData(repaired.json).after.alias, 'bravo');

      const collision = second.runCliJson(['project', 'add', second.projectRoot, '--alias', 'bravo'], { env });
      assert.equal(collision.status, 1);
      assert.equal(errorCode(collision.json), 'alias_conflict');
      assert.equal(payloadData(collision.json).details.alias, 'bravo');
      assert.equal(payloadData(collision.json).details.existingProjectId, projectId);
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });
});

test('project add refuses to mutate an unsupported newer registry version with repair guidance', async () => {
  await withControlPlaneHome(async ({ homeDir, env }) => {
    const project = createConfiguredProject('newer-state-project');
    try {
      const registryPath = path.join(homeDir, 'registry', 'projects.json');
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      fs.writeFileSync(registryPath, `${JSON.stringify({
        version: 999,
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
        projects: []
      }, null, 2)}\n`);

      const result = project.runCliJson(['project', 'add', project.projectRoot, '--alias', 'newer-state'], { env });

      assert.equal(result.status, 1);
      assert.equal(errorCode(result.json), 'state_version_unsupported');
      assert.equal(payloadData(result.json).details.statePath, registryPath);
      assert.equal(payloadData(result.json).details.foundVersion, 999);
      assert.equal(payloadData(result.json).details.supportedVersion, 2);
      assert.ok(payloadData(result.json).next.some((action) => action.command.includes('launchdeck project repair')));
      assert.equal(readJsonFile(registryPath).version, 999);
    } finally {
      project.cleanup();
    }
  });
});

test('project repair updates project path config and alias metadata without changing identity', async () => {
  await withControlPlaneHome(async ({ env }) => {
    const original = createConfiguredProject('repair-original');
    const moved = createConfiguredProject('repair-moved');
    try {
      const added = original.runCliJson(['project', 'add', original.projectRoot, '--alias', 'repairable'], { env });
      assert.equal(added.status, 0, added.stderr);
      const projectId = payloadData(added.json).project.projectId;

      const repaired = original.runGlobalCliJson([
        'project',
        'repair',
        'repairable',
        '--path',
        moved.projectRoot,
        '--config',
        moved.path('.launchdeck.yml'),
        '--alias',
        'repaired'
      ], { env });

      assert.equal(repaired.status, 0, repaired.stderr);
      const data = payloadData(repaired.json);
      assert.equal(data.before.projectId, projectId);
      assert.equal(data.before.alias, 'repairable');
      assert.equal(data.after.projectId, projectId);
      assert.equal(data.after.alias, 'repaired');
      assert.equal(data.after.projectRoot, moved.projectRoot);
      assert.equal(data.after.configPath, moved.path('.launchdeck.yml'));
      assert.equal(data.after.status, 'active');
      assert.deepEqual(data.changes.sort(), ['alias', 'configPath', 'projectRoot'].sort());

      const listed = original.runGlobalCliJson(['projects'], { env });
      assert.equal(payloadData(listed.json).projects.length, 1);
      assert.equal(payloadData(listed.json).projects[0].projectId, projectId);
      assert.equal(payloadData(listed.json).projects[0].alias, 'repaired');
    } finally {
      original.cleanup();
      moved.cleanup();
    }
  });
});

async function withControlPlaneHome(callback) {
  const home = createLaunchdeckHome();
  try {
    await callback(home);
  } finally {
    home.cleanup();
  }
}

function createConfiguredProject(name) {
  const project = createCliFixture();
  project.writeConfig(managedProjectConfig({ name }));
  project.writeScript('scripts/dev-server.js', 'setInterval(() => {}, 1000);');
  return {
    ...project,
    runGlobalCliJson: (args = [], options = {}) => runCliJson(args, options)
  };
}

function payloadData(payload) {
  return payload.data ?? payload;
}

function errorCode(payload) {
  return payload.code ?? payload.error?.code;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
