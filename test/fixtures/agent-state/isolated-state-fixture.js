import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createIsolatedStateFixture(testContext, label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `launchdeck-${safeLabel(label)}-`));
  const launchdeckHome = path.join(root, 'launchdeck-home');
  const projectRoot = path.join(root, 'project');
  const userRoot = path.join(root, 'user');
  fs.mkdirSync(launchdeckHome, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(userRoot, { recursive: true });

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
