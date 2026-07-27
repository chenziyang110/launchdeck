import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { controlPlanePaths } from '../../../src/control-plane/state.js';
import { installerStatePaths } from '../../../src/agent/state/paths.js';
import { resolveInstallationScope } from '../../../src/agent/state/scope-resolver.js';
import { createIsolatedStateFixture } from '../../fixtures/agent-state/isolated-state-fixture.js';

test('installer paths extend the existing LAUNCHDECK_HOME authority without touching project runtime state', (t) => {
  const fixture = createIsolatedStateFixture(t, 'installer-paths');
  const controlPlane = controlPlanePaths(fixture.env);
  const paths = installerStatePaths(fixture.env);

  assert.equal(paths.homeDir, controlPlane.homeDir);
  assert.equal(paths.installerDir, path.join(fixture.launchdeckHome, 'installer', 'v1'));
  assert.equal(paths.statePath, path.join(paths.installerDir, 'state.json'));
  assert.equal(paths.receiptsDir, path.join(paths.installerDir, 'receipts'));
  assert.equal(paths.receiptRecordsDir, path.join(paths.receiptsDir, 'records'));
  assert.equal(paths.receiptIndexesDir, path.join(paths.receiptsDir, 'indexes'));
  assert.equal(paths.backupsDir, path.join(paths.installerDir, 'backups'));
  assert.equal(
    path.relative(fixture.launchdeckHome, paths.installerDir).startsWith('..'),
    false
  );
  assert.equal(fs.readdirSync(fixture.launchdeckHome).length, 0, 'path discovery is read-only');
  assert.notEqual(paths.statePath, path.join(fixture.projectRoot, '.launchdeck', 'runtime', 'state.json'));
});

test('project and user scopes have canonical, distinct identities and never impersonate one another', (t) => {
  const fixture = createIsolatedStateFixture(t, 'scope-identity');
  const project = resolveInstallationScope({
    scope: 'project',
    projectRoot: path.join(fixture.projectRoot, '..', 'project'),
    env: fixture.env
  });
  const sameProject = resolveInstallationScope({
    scope: 'project',
    projectRoot: fixture.projectRoot,
    env: fixture.env
  });
  const user = resolveInstallationScope({
    scope: 'user',
    userHome: fixture.userRoot,
    env: fixture.env
  });

  assert.equal(project.scope, 'project');
  assert.equal(project.projectIdentity, path.resolve(fixture.projectRoot));
  assert.match(project.scopeIdentity, /^project:sha256:[0-9a-f]{64}$/);
  assert.deepEqual(project, sameProject);
  assert.equal(user.scope, 'user');
  assert.equal(user.projectIdentity, null);
  assert.match(user.scopeIdentity, /^user:sha256:[0-9a-f]{64}$/);
  assert.notEqual(user.scopeIdentity, project.scopeIdentity);
  assert.equal(Object.isFrozen(project), true);
  assert.equal(Object.isFrozen(user), true);
});

test('scope resolution refuses missing project authority and user-scope project injection', (t) => {
  const fixture = createIsolatedStateFixture(t, 'scope-refusal');

  assert.throws(
    () => resolveInstallationScope({ scope: 'project', projectRoot: null, env: fixture.env }),
    { code: 'agent_project_identity_required' }
  );
  assert.throws(
    () => resolveInstallationScope({
      scope: 'user',
      projectRoot: fixture.projectRoot,
      userHome: fixture.userRoot,
      env: fixture.env
    }),
    { code: 'agent_project_identity_forbidden' }
  );
  assert.equal(fs.readdirSync(fixture.launchdeckHome).length, 0, 'refusal has no state effects');
});
