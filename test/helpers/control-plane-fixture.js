import {
  createCliFixture,
  createTempProject,
  parseJson,
  removeTempProject,
  runCli,
  runCliJson,
  writeConfig,
  writeFile,
  writeScript
} from './cli-fixture.js';

export {
  createCliFixture,
  createTempProject,
  parseJson,
  removeTempProject,
  runCli,
  runCliJson,
  writeConfig,
  writeFile,
  writeScript
};

export const controlPlaneHomePrefix = 'launchdeck-cli-control-plane-home-';
export const controlPlaneProjectPrefix = 'launchdeck-cli-control-plane-project-';
export const defaultManagedTask = 'dev';
export const defaultManagedPort = 4173;

export function createLaunchdeckHome(options = {}) {
  const homeDir = createTempProject({
    prefix: options.prefix ?? controlPlaneHomePrefix
  });
  const env = {
    ...options.env,
    LAUNCHDECK_HOME: homeDir
  };
  let cleaned = false;

  return {
    homeDir,
    env,
    cleanup: () => {
      if (!cleaned) {
        cleaned = true;
        removeTempProject(homeDir);
      }
    }
  };
}

export function createControlPlaneFixture(options = {}) {
  const home = createLaunchdeckHome(options.home);
  const project = createCliFixture({
    prefix: options.projectPrefix ?? controlPlaneProjectPrefix
  });
  let cleaned = false;

  return {
    homeDir: home.homeDir,
    env: home.env,
    projectRoot: project.projectRoot,
    project,
    path: project.path,
    writeConfig: project.writeConfig,
    writeFile: project.writeFile,
    writeScript: project.writeScript,
    mkdir: project.mkdir,
    runCli: (args = [], runOptions = {}) => project.runCli(args, withFixtureEnv(home.env, runOptions)),
    runCliJson: (args = [], runOptions = {}) => project.runCliJson(args, withFixtureEnv(home.env, runOptions)),
    runGlobalCli: (args = [], runOptions = {}) => runCli(args, withFixtureEnv(home.env, { cwd: home.homeDir, ...runOptions })),
    runGlobalCliJson: (args = [], runOptions = {}) => runCliJson(args, withFixtureEnv(home.env, { cwd: home.homeDir, ...runOptions })),
    cleanup: () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      project.runCli(['stop', '--json'], withFixtureEnv(home.env, { timeout: 5_000 }));
      project.cleanup();
      home.cleanup();
    }
  };
}

export function withControlPlaneFixture(callback, options = {}) {
  const fixture = createControlPlaneFixture(options);
  return Promise.resolve()
    .then(() => callback(fixture))
    .finally(() => fixture.cleanup());
}

export function createManagedProjectFixture(options = {}) {
  const fixture = createControlPlaneFixture(options);
  writeManagedFixtureProject(fixture.project, options.project ?? options);
  return fixture;
}

export function writeManagedFixtureProject(fixture, options = {}) {
  const taskName = options.taskName ?? defaultManagedTask;
  const port = options.port ?? defaultManagedPort;
  const scriptPath = options.scriptPath ?? `scripts/${taskName}-server.js`;
  const command = options.command ?? `node ${toConfigPath(scriptPath)} ${port}`;

  fixture.writeConfig(managedProjectConfig({
    name: options.name ?? 'control-plane-fixture',
    taskName,
    command,
    port,
    extraTasks: options.extraTasks,
    clean: options.clean
  }));
  fixture.writeScript(scriptPath, fixtureServerScriptContent(options.server ?? {}));

  return {
    taskName,
    port,
    scriptPath,
    absoluteScriptPath: fixture.path?.(scriptPath),
    command
  };
}

export function managedProjectConfig(options = {}) {
  const taskName = options.taskName ?? defaultManagedTask;
  const port = options.port ?? defaultManagedPort;

  return {
    version: 1,
    project: {
      name: options.name ?? 'control-plane-fixture'
    },
    tasks: {
      [taskName]: {
        command: options.command ?? `node scripts/${taskName}-server.js ${port}`,
        longRunning: true,
        ports: [port],
        risk: 'low'
      },
      ...options.extraTasks
    },
    clean: options.clean ?? {
      safe: [],
      risky: []
    }
  };
}

export function fixtureServerScriptContent(options = {}) {
  const responseText = JSON.stringify(options.responseText ?? 'launchdeck fixture ready');
  const readyText = JSON.stringify(options.readyText ?? 'ready');

  return `import http from 'node:http';

const requestedPort = Number(process.argv[2] ?? process.env.PORT ?? 0);
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  console.error('Invalid fixture port:', process.argv[2] ?? process.env.PORT);
  process.exit(2);
}

const server = http.createServer((request, response) => {
  const body = request.url === '/health'
    ? JSON.stringify({ ok: true, pid: process.pid })
    : ${responseText};
  response.writeHead(200, { 'content-type': request.url === '/health' ? 'application/json' : 'text/plain' });
  response.end(body);
});

server.listen(requestedPort, '127.0.0.1', () => {
  const address = server.address();
  console.log(\`[launchdeck-fixture] ${'${'}${readyText}${'}'} port=${'${'}address.port${'}'} pid=${'${'}process.pid${'}'}\`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
`;
}

export function writeFixtureServerScript(fixture, relativePath = 'scripts/dev-server.js', options = {}) {
  fixture.writeScript(relativePath, fixtureServerScriptContent(options));
  return fixture.path?.(relativePath);
}

function withFixtureEnv(env, options = {}) {
  return {
    ...options,
    env: {
      ...options.env,
      ...env
    }
  };
}

function toConfigPath(relativePath) {
  return relativePath.replaceAll('\\', '/');
}
