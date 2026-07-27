import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createIsolatedStateFixture(testContext, label) {
  const createdRoot = fs.mkdtempSync(path.join(os.tmpdir(), `launchdeck-${safeLabel(label)}-`));
  const createdLaunchdeckHome = path.join(createdRoot, 'launchdeck-home');
  const createdProjectRoot = path.join(createdRoot, 'project');
  const createdUserRoot = path.join(createdRoot, 'user');
  fs.mkdirSync(createdLaunchdeckHome, { recursive: true });
  fs.mkdirSync(createdProjectRoot, { recursive: true });
  fs.mkdirSync(createdUserRoot, { recursive: true });
  const launchdeckHome = fs.realpathSync.native(createdLaunchdeckHome);
  const projectRoot = fs.realpathSync.native(createdProjectRoot);
  const userRoot = fs.realpathSync.native(createdUserRoot);
  const root = path.dirname(projectRoot);

  let cleaned = false;
  testContext.after(() => {
    if (cleaned) return;
    cleaned = true;
    fs.rmSync(root, { recursive: true, force: true });
  });

  return Object.freeze({
    root,
    launchdeckHome,
    projectRoot,
    userRoot,
    env: Object.freeze({
      LAUNCHDECK_HOME: launchdeckHome,
      HOME: userRoot,
      USERPROFILE: userRoot,
      LOCALAPPDATA: path.join(userRoot, 'AppData', 'Local'),
      XDG_STATE_HOME: path.join(userRoot, '.local', 'state')
    })
  });
}

function safeLabel(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}
