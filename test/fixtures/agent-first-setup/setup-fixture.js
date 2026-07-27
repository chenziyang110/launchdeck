import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAgentLifecycleService } from '../../../src/agent/lifecycle-service.js';
import { createReceiptStore } from '../../../src/agent/state/receipt-store.js';
import { resolveInstallationScopeReference } from '../../../src/agent/state/scope-resolver.js';

export const BUILD_IDENTITY = `sha256:${'4'.repeat(64)}`;
export const HOST_ID = 'codex';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const childCliPath = path.join(fixtureDir, 'setup-cli-child.js');
const fixturePrefix = 'launchdeck-agent-first-setup-';
const ownedBoundary = 'synthetic-launchdeck-agent';

export function createFreshSetupFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), fixturePrefix));
  const projectRoot = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });

  if (options.launchdeckConfig !== undefined) {
    fs.writeFileSync(path.join(projectRoot, '.launchdeck.yml'), options.launchdeckConfig, 'utf8');
  }

  const env = {
    LAUNCHDECK_HOME: homeDir
  };
  const receiptStore = createReceiptStore({ env });
  const scopeRef = resolveInstallationScopeReference({
    scope: 'project',
    projectRoot
  });

  return {
    root,
    projectRoot,
    homeDir,
    env,
    receiptStore,
    setupArgs(overrides = {}) {
      return {
        host: [HOST_ID],
        component: ['skill', 'mcp'],
        scope: 'project',
        project: projectRoot,
        projectRoot,
        sourceIdentity: 'packaged',
        build: BUILD_IDENTITY,
        desiredBuildIdentity: BUILD_IDENTITY,
        packagedBuildIdentity: BUILD_IDENTITY,
        yes: true,
        json: true,
        dryRun: false,
        ...overrides
      };
    },
    runCli(argv, runOptions = {}) {
      return runSetupCliChild({
        argv,
        entrypoint: runOptions.entrypoint ?? 'installed',
        projectRoot,
        homeDir
      });
    },
    targetPath(component) {
      return pathForComponent(projectRoot, homeDir, component);
    },
    currentReceipt() {
      return receiptStore.readCurrent(scopeRef);
    },
    receiptRecordCount() {
      const recordsDir = receiptStore.paths.receiptRecordsDir;
      if (!fs.existsSync(recordsDir)) return 0;
      return fs.readdirSync(recordsDir).filter((entry) => entry.endsWith('.json')).length;
    },
    cleanup() {
      removeFixtureRoot(root);
    }
  };
}

export function createSyntheticLifecycleService({ projectRoot, homeDir }) {
  const env = {
    LAUNCHDECK_HOME: homeDir
  };
  const registry = createSyntheticRegistry({ projectRoot, homeDir });
  return createAgentLifecycleService({
    env,
    registry,
    clock: () => new Date('2026-07-23T12:00:00.000Z')
  });
}

export function setupCliArgv({ projectRoot, yes = true } = {}) {
  return [
    'agent',
    'setup',
    '--host',
    HOST_ID,
    '--component',
    'skill',
    '--component',
    'mcp',
    '--scope',
    'project',
    '--project',
    projectRoot,
    '--build',
    BUILD_IDENTITY,
    '--json',
    ...(yes ? ['--yes'] : [])
  ];
}

function runSetupCliChild(request) {
  const result = spawnSync(process.execPath, [
    childCliPath,
    Buffer.from(JSON.stringify(request), 'utf8').toString('base64url')
  ], {
    cwd: request.projectRoot,
    env: {
      ...process.env,
      LAUNCHDECK_HOME: request.homeDir
    },
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error([
      `Setup CLI child failed with status ${result.status}.`,
      result.stderr,
      result.stdout
    ].filter(Boolean).join('\n'));
  }
  return JSON.parse(result.stdout);
}

function createSyntheticRegistry({ projectRoot, homeDir }) {
  const adapter = createSyntheticAdapter({ projectRoot, homeDir });
  return {
    matrixRevision: `sha256:${'5'.repeat(64)}`,
    listHosts() {
      return [HOST_ID];
    },
    adapterFor(hostId) {
      return hostId === HOST_ID ? adapter : null;
    }
  };
}

function createSyntheticAdapter({ projectRoot, homeDir }) {
  return {
    async detect() {
      return [{
        hostId: HOST_ID,
        version: 'synthetic-1.0.0',
        supportState: 'supported'
      }];
    },
    async capabilities(_detected, scope) {
      return ['skill', 'mcp'].map((component) => ({
        hostId: HOST_ID,
        scope,
        component,
        supportState: 'supported'
      }));
    },
    async resolveTargets({ scope, components }) {
      return components.map((component) => targetFor({ projectRoot, homeDir, scope, component }));
    },
    async inspect(target) {
      const targetPath = pathForComponent(projectRoot, homeDir, target.component);
      return {
        ...target,
        path: targetPath,
        exists: fs.existsSync(targetPath),
        ownership: 'launchdeck-owned',
        liveDigest: fileDigest(targetPath),
        observedDigest: fileDigest(targetPath)
      };
    },
    async plan(target, context) {
      const targetPath = pathForComponent(projectRoot, homeDir, target.component);
      const preconditionDigest = fileDigest(targetPath);
      const desiredDigest = digestText(renderTargetContent(target.component, context.buildIdentity));
      const action = actionFor({
        component: target.component,
        targetPath,
        preconditionDigest,
        desiredDigest
      });
      return {
        host: HOST_ID,
        status: preconditionDigest === desiredDigest ? 'no-op' : 'planned',
        actions: preconditionDigest === desiredDigest ? [] : [action]
      };
    },
    async apply(action, transaction) {
      const component = componentFromTargetId(action.targetId);
      const content = renderTargetContent(component, transaction.plan.buildIdentity);
      fs.mkdirSync(path.dirname(action.targetPath), { recursive: true });
      fs.writeFileSync(action.targetPath, content, 'utf8');
      return effectFor(action);
    },
    async rollback(effect) {
      if (fs.existsSync(effect.targetPath)) fs.rmSync(effect.targetPath, { force: true });
      return { status: 'rolled-back' };
    },
    async verify(target, expected) {
      const observedDigest = fileDigest(pathForComponent(projectRoot, homeDir, target.component));
      return {
        targetId: target.targetId,
        kind: 'runtime-and-digest',
        buildIdentity: expected.buildIdentity,
        observedDigest,
        verified: observedDigest === target.desiredDigest
      };
    }
  };
}

function targetFor({ projectRoot, homeDir, scope, component }) {
  const targetPath = pathForComponent(projectRoot, homeDir, component);
  return {
    targetId: `${HOST_ID}:${scope}:${component}`,
    hostId: HOST_ID,
    scope,
    component,
    path: targetPath,
    ownershipBoundary: ownedBoundary,
    ownership: 'launchdeck-owned',
    liveDigest: fileDigest(targetPath)
  };
}

function actionFor({ component, targetPath, preconditionDigest, desiredDigest }) {
  return {
    actionId: `action-${HOST_ID}-project-${component}`,
    kind: `write-${component}`,
    targetId: `${HOST_ID}:project:${component}`,
    ownershipBoundary: ownedBoundary,
    targetPath,
    preconditionDigest,
    desiredDigest,
    requiresBackup: false
  };
}

function effectFor(action) {
  return {
    effectId: `effect-${action.actionId}`,
    actionId: action.actionId,
    targetId: action.targetId,
    ownershipBoundary: action.ownershipBoundary,
    effectType: action.kind,
    beforeDigest: action.preconditionDigest,
    afterDigest: action.desiredDigest,
    effectCertainty: 'complete'
  };
}

function renderTargetContent(component, buildIdentity) {
  return [
    'managedBy=launchdeck-agent-installer',
    `component=${component}`,
    `buildIdentity=${buildIdentity}`,
    ''
  ].join('\n');
}

function pathForComponent(projectRoot, homeDir, component) {
  if (component === 'skill') {
    return path.join(projectRoot, '.agents', 'skills', 'launchdeck-agent', 'SKILL.md');
  }
  if (component === 'mcp') {
    return path.join(homeDir, 'synthetic-host', 'mcp-launchdeck.json');
  }
  throw new Error(`Unsupported synthetic component: ${component}`);
}

function componentFromTargetId(targetId) {
  return String(targetId).split(':')[2];
}

function fileDigest(filePath) {
  return fs.existsSync(filePath) ? digestBytes(fs.readFileSync(filePath)) : digestBytes(Buffer.alloc(0));
}

function digestText(value) {
  return digestBytes(Buffer.from(value, 'utf8'));
}

function digestBytes(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function removeFixtureRoot(root) {
  const resolved = path.resolve(root);
  const relative = path.relative(path.resolve(os.tmpdir()), resolved);
  if (
    relative === ''
    || relative.startsWith('..')
    || path.isAbsolute(relative)
    || !path.basename(resolved).startsWith(fixturePrefix)
  ) {
    throw new Error(`Refusing to remove non-agent-first setup fixture: ${root}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}
