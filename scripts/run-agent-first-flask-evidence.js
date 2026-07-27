#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoRoot = path.join(repoRoot, 'demos', 'flask-server');
const cliPath = path.join(repoRoot, 'src', 'cli.js');
const agentAuthorFixturePath = path.join(repoRoot, 'test', 'fixtures', 'agent-first-flask', 'installed-agent-author.js');
const FLASK_FIXTURE_HOST = Object.freeze({
  id: 'none',
  version: 'deterministic-installed-agent-fixture',
  versionEvidenceDigest: sha256Json({ fixture: 'deterministic-installed-agent' }),
  capabilityMatrixRevision: 'deterministic-installed-agent-fixture'
});
const DEFAULT_TIMEOUT_MS = 30_000;
const FRESH_COPY_ALLOWLIST = Object.freeze([
  'README.md',
  'pyproject.toml',
  'src/flask_demo/__init__.py',
  'src/flask_demo/__main__.py',
  'src/flask_demo/app.py',
  'src/flask_demo/static/app.js',
  'src/flask_demo/static/styles.css',
  'src/flask_demo/templates/index.html',
  'tests/test_app.py'
]);
const FRESH_COPY_FORBIDDEN_NAMES = new Set([
  '.launchdeck',
  '.launchdeck.yml',
  '.venv',
  '__pycache__',
  '.pytest_cache',
  'node_modules',
  'scratch',
  'cache'
]);

if (isMain()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const evidence = await runAgentFirstFlaskEvidence(options);
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    process.exitCode = evidence.ok ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      ok: false,
      kind: 'agent-first-flask-evidence',
      error: {
        code: error?.code ?? 'agent_first_flask_evidence_failed',
        message: error?.message ?? 'Flask evidence failed.'
      }
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

export async function runAgentFirstFlaskEvidence(options = {}) {
  const selectedCliPath = path.resolve(options.cliPath ?? cliPath);
  const selectedMcpEntrypoint = path.resolve(
    options.mcpEntrypoint
      ?? path.join(path.dirname(selectedCliPath), 'mcp', 'stdio-server.js')
  );
  const selectedInstalledSkillPath = path.resolve(
    options.installedSkillPath
      ?? path.join(path.dirname(path.dirname(selectedCliPath)), '.agents', 'skills', 'launchdeck-agent')
  );
  const root = path.resolve(options.workRoot ?? fs.mkdtempSync(
    path.join(os.tmpdir(), 'launchdeck-agent-first-flask-')
  ));
  const paths = evidencePaths(root);
  fs.mkdirSync(paths.projectRoot, { recursive: true });
  fs.mkdirSync(paths.homeDir, { recursive: true });
  const port = options.port ?? await reserveLoopbackPort();
  const env = isolatedEnv(paths, port);

  copyFreshDemoAllowlist({
    from: demoRoot,
    to: paths.projectRoot,
    files: FRESH_COPY_ALLOWLIST
  });
  assertFreshProject(paths.projectRoot);

  const setup = await runCli([
    'agent',
    'setup',
    '--component',
    'runtime',
    '--scope',
    'project',
    '--project',
    paths.projectRoot,
    '--json',
    '--yes'
  ], {
    cwd: paths.projectRoot,
    env,
    cliPath: selectedCliPath
  });
  const setupJson = parseJsonRun(setup, 'agent setup');
  assertPublicSetupSucceeded(setup, setupJson);
  if (fs.existsSync(path.join(paths.projectRoot, '.launchdeck.yml'))) {
    throw evidenceError('agent_installer_authored_launchdeck_config', 'Installer authored .launchdeck.yml.');
  }

  const agentAuthored = await runInstalledAgentAuthoring(
    paths,
    env,
    setupJson,
    selectedMcpEntrypoint,
    selectedInstalledSkillPath
  );
  assertAgentAuthoredConfig(paths.projectRoot);

  let upAttempted = false;
  let upJson;
  let statusJson;
  let logsJson;
  let downJson;
  let page;
  try {
    upAttempted = true;
    const up = await runCli(['up', '--json'], { cwd: paths.projectRoot, env, cliPath: selectedCliPath });
    upJson = parseJsonRun(up, 'up');
    await waitForHttp(`http://127.0.0.1:${port}/health`, DEFAULT_TIMEOUT_MS);
    page = await httpGet(`http://127.0.0.1:${port}/`);
    const status = await runCli(['status', '--all', '--json'], { cwd: paths.projectRoot, env, cliPath: selectedCliPath });
    statusJson = parseJsonRun(status, 'status --all');
    statusJson.command = 'status --all';
    const logs = await runCli(['logs', 'start', '--json'], { cwd: paths.projectRoot, env, cliPath: selectedCliPath });
    logsJson = parseJsonRun(logs, 'logs start');
  } finally {
    if (upAttempted) {
      const down = await runCli(['down', '--json'], { cwd: paths.projectRoot, env, cliPath: selectedCliPath });
      downJson = parseJsonRun(down, 'down');
    }
  }

  const evidenceBody = {
    setup: setupJson,
    agentAuthored,
    up: upJson,
    status: statusJson,
    logs: logsJson,
    down: downJson,
    page,
    paths,
    port,
    producer: {
      environment: observedEnvironment(),
      host: FLASK_FIXTURE_HOST
    }
  };
  evidenceBody.provenance = flaskEvidenceProvenance(evidenceBody);
  const contract = evaluateAgentFirstFlaskEvidence(evidenceBody);

  return Object.freeze({
    schemaVersion: 1,
    kind: 'agent-first-flask-evidence',
    ok: contract.ok,
    producerBody: Object.freeze(evidenceBody),
    isolation: {
      root,
      projectRoot: paths.projectRoot,
      launchdeckHome: paths.homeDir,
      port,
      liveUserStateTouched: !isIsolatedPathSet(root, paths, env)
    },
    setup: summarizeEnvelope(setupJson),
    installedAgent: agentAuthored,
    lifecycle: {
      up: summarizeEnvelope(upJson),
      status: summarizeEnvelope(statusJson),
      logs: {
        ...summarizeEnvelope(logsJson),
        task: logsJson.task ?? null,
        logPath: logsJson.logPath ?? null,
        contentSha256: logsJson.content ? sha256Text(logsJson.content) : null,
        nonEmptyFlaskProcessLog: typeof logsJson.content === 'string'
          && logsJson.content.trim().length > 0
          && /flask|werkzeug|running|serving|127\.0\.0\.1/i.test(logsJson.content)
      },
      down: summarizeEnvelope(downJson)
    },
    http: {
      statusCode: page.statusCode,
      bodySha256: sha256Text(page.body),
      containsFlaskPage: /Notes workspace|Flask Notes API|notes/i.test(page.body)
    },
    provenance: evidenceBody.provenance,
    contract
  });
}

export function evaluateAgentFirstFlaskEvidence(evidence) {
  const producerEvidence = evidence?.producerBody ?? evidence;
  const checks = {
    installerSucceeded: producerEvidence?.setup?.result?.outcome === 'succeeded'
      || producerEvidence?.setup?.ok === true,
    installerLeftProjectConfigAbsent: producerEvidence?.agentAuthored?.installerLeftConfigAbsent === true,
    agentAuthoredConfig: producerEvidence?.agentAuthored?.configAuthored === true,
    agentMcpAndBuildProof: Boolean(producerEvidence?.agentAuthored?.mcpProof?.ok)
      && /^sha256:[0-9a-f]{64}$/.test(String(producerEvidence?.agentAuthored?.buildIdentity ?? ''))
      && producerEvidence?.agentAuthored?.buildIdentity === producerEvidence?.agentAuthored?.mcpProof?.buildIdentity
      && Array.isArray(producerEvidence?.agentAuthored?.mcpProof?.tools)
      && producerEvidence.agentAuthored.mcpProof.tools.includes('capabilities.get')
      && /src[\\/]mcp[\\/]stdio-server\.js$/.test(String(producerEvidence?.agentAuthored?.mcpProof?.server?.path ?? '')),
    deterministicAgentFixtureAuthored: producerEvidence?.agentAuthored?.author === 'deterministic-installed-agent-fixture'
      && producerEvidence?.agentAuthored?.interactiveHost === false
      && producerEvidence?.agentAuthored?.llmReasoning === false
      && producerEvidence?.agentAuthored?.parentBoundary?.parentAuthoredConfig === false
      && producerEvidence?.agentAuthored?.parentBoundary?.configAbsentBeforeChild === true
      && producerEvidence?.agentAuthored?.installedSkill?.valid === true
      && producerEvidence?.agentAuthored?.parentBoundary?.installedSkill?.valid === true,
    upSucceeded: producerEvidence?.up?.ok === true,
    statusSucceeded: producerEvidence?.status?.ok === true,
    logsSucceeded: producerEvidence?.logs?.ok === true,
    startLogsObserved: producerEvidence?.logs?.task === 'start'
      && typeof producerEvidence?.logs?.logPath === 'string'
      && producerEvidence.logs.logPath.length > 0
      && typeof producerEvidence?.logs?.content === 'string'
      && producerEvidence.logs.content.trim().length > 0
      && /flask|werkzeug|running|serving|127\.0\.0\.1/i.test(producerEvidence.logs.content),
    downSucceeded: producerEvidence?.down?.ok === true,
    statusAllUsed: producerEvidence?.status?.command === 'status --all',
    webpageReached: producerEvidence?.page?.statusCode === 200
      && /Notes workspace|Flask Notes API|notes/i.test(producerEvidence?.page?.body ?? ''),
    isolatedNoLiveUserState: isIsolatedPathSet(
      producerEvidence?.paths?.root ?? '',
      producerEvidence?.paths ?? {},
      isolatedEnv(producerEvidence?.paths ?? {}, producerEvidence?.port ?? 0)
    ),
    producerBodyProofPresent: hasFlaskBodyProof(producerEvidence),
    producerProvenanceComplete: hasCompleteProducerProvenance(producerEvidence?.provenance, 'flask'),
    producerProvenanceMatchesBody: producerProvenanceMatchesBody(producerEvidence, 'flask')
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name);
  return Object.freeze({
    ok: failures.length === 0,
    checks,
    failures
  });
}

function flaskEvidenceProvenance(evidence) {
  const configInputs = evidence.agentAuthored.configInputs ?? {};
  const candidateInput = {
    configSha256: evidence.agentAuthored.configSha256,
    configInputs,
    lifecycle: {
      up: summarizeEnvelope(evidence.up),
      status: summarizeEnvelope(evidence.status),
      logs: summarizeEnvelope(evidence.logs),
      down: summarizeEnvelope(evidence.down)
    },
    http: {
      statusCode: evidence.page.statusCode,
      bodySha256: sha256Text(evidence.page.body)
    }
  };
  const candidateJson = stableJson(candidateInput);
  const manifestInput = {
    installedSkill: {
      contentSha256: evidence.agentAuthored.installedSkill?.contentSha256,
      files: evidence.agentAuthored.installedSkill?.files
    },
    mcpServer: evidence.agentAuthored.mcpProof?.server,
    configInputs
  };
  const producerJson = stableJson(withoutFields(evidence, ['provenance', 'contract', 'ok']));
  return Object.freeze({
    schemaVersion: 1,
    kind: 'agent-first-evidence-provenance',
    entrypoint: 'flask',
    observed: true,
    identity: {
      buildIdentity: evidence.agentAuthored.buildIdentity,
      sourceRevision: `flask:${configInputs.projectName ?? 'flask-demo'}`,
      packageDigest: evidence.agentAuthored.mcpProof?.server?.sha256 ?? sha256Json(evidence.agentAuthored.mcpProof ?? {}),
      payloadDigest: sha256Json(configInputs)
    },
    environment: evidence.producer.environment,
    host: evidence.producer.host,
    scope: {
      kind: 'project',
      identity: `project:sha256:${sha256Hex(stableJson({
        configInputs,
        projectRoot: '<PROJECT>'
      }))}`
    },
    component: 'flask',
    scenario: {
      id: 'agent-first-flask-lifecycle',
      kind: 'flask',
      revision: sha256Json(manifestInput)
    },
    command: {
      entrypoint: 'launchdeck flask lifecycle',
      argv: ['launchdeck', 'up', 'status --all', 'logs start', 'down'],
      cwd: '<PROJECT>'
    },
    result: {
      exitCode: evidence.down?.ok === true ? 0 : 1,
      outcome: evidence.down?.ok === true ? 'succeeded' : 'failed',
      effectCertainty: evidence.down?.ok === true ? 'complete' : 'unknown',
      stdoutSha256: sha256Json(candidateInput.lifecycle),
      stderrSha256: sha256Json(evidence.logs ?? {})
    },
    candidate: {
      kind: 'scenario',
      uri: `flask:${evidence.agentAuthored.buildIdentity}`,
      sha256: sha256Text(candidateJson),
      byteLength: Buffer.byteLength(candidateJson),
      manifestDigest: sha256Json(manifestInput),
      immutable: true,
      mutable: false
    },
    evidence: {
      rawRefs: [{
        path: 'producer/flask-evidence.json',
        sha256: sha256Text(producerJson),
        byteLength: Buffer.byteLength(producerJson)
      }]
    }
  });
}

export function copyFreshDemoAllowlist({ from, to, files }) {
  for (const file of files) {
    const source = path.resolve(from, file);
    const target = path.resolve(to, file);
    assertContainedPath(from, source, 'allowlisted source escaped the Flask demo root');
    assertContainedPath(to, target, 'allowlisted target escaped the fresh project root');
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw evidenceError('agent_flask_fresh_copy_invalid', `Allowlisted entry is not a regular file: ${file}.`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function assertFreshProject(projectRoot) {
  assertNoForbiddenFreshCopyEntries(projectRoot);
}

function assertNoForbiddenFreshCopyEntries(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw evidenceError('agent_flask_fresh_copy_invalid', `Fresh copy boundary rejects symlink: ${entryPath}.`);
    }
    if (FRESH_COPY_FORBIDDEN_NAMES.has(entry.name)) {
      throw evidenceError('agent_flask_fresh_copy_invalid', `Fresh copy boundary rejects ${entry.name}.`);
    }
    if (entry.isDirectory()) assertNoForbiddenFreshCopyEntries(entryPath);
  }
}

function assertContainedPath(root, candidate, message) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw evidenceError('agent_flask_path_escape', message);
  }
}

async function runInstalledAgentAuthoring(
  paths,
  env,
  setupJson,
  selectedMcpEntrypoint,
  selectedInstalledSkillPath
) {
  const configPath = path.join(paths.projectRoot, '.launchdeck.yml');
  const installerLeftConfigAbsent = !fs.existsSync(configPath);
  const installedSkill = resolveInstalledSkill({
    paths,
    env,
    setupJson,
    installedSkillPath: selectedInstalledSkillPath
  });
  const child = await runCommand(process.execPath, [
    agentAuthorFixturePath,
    '--project-root',
    paths.projectRoot,
    '--config-path',
    configPath,
    '--installed-skill-path',
    installedSkill.path,
    '--port',
    env.PORT,
    '--mcp-entrypoint',
    selectedMcpEntrypoint
  ], { cwd: paths.projectRoot, env });
  const childJson = parseJsonRun(child, 'installed Agent fixture authoring');
  if (childJson.ok !== true) {
    throw evidenceError(
      childJson.error?.code ?? 'agent_flask_authoring_fixture_failed',
      childJson.error?.message ?? 'Installed Agent fixture did not author config.'
    );
  }
  if (!fs.existsSync(configPath)) {
    throw evidenceError('agent_flask_config_missing', 'Installed Agent fixture did not write .launchdeck.yml.');
  }
  const configSha256 = sha256File(configPath);
  return Object.freeze({
    ...childJson.result,
    installerLeftConfigAbsent,
    configAuthored: true,
    configPath,
    configSha256,
    parentBoundary: {
      parentAuthoredConfig: false,
      configAbsentBeforeChild: installerLeftConfigAbsent,
      childProcess: {
        command: path.basename(process.execPath),
        script: path.relative(repoRoot, agentAuthorFixturePath).replaceAll(path.sep, '/'),
        exitStatus: child.status
      },
      installedSkill
    }
  });
}

function resolveInstalledSkill({ paths, env, setupJson, installedSkillPath }) {
  const observedPaths = collectObjectStrings(setupJson)
    .filter((value) => /launchdeck-agent/i.test(value))
    .map((value) => path.resolve(paths.projectRoot, value));
  const candidates = [
    installedSkillPath,
    ...observedPaths,
    path.join(paths.projectRoot, '.agents', 'skills', 'launchdeck-agent'),
    path.join(env.HOME ?? '', '.agents', 'skills', 'launchdeck-agent'),
    path.join(env.HOME ?? '', '.codex', 'skills', 'launchdeck-agent'),
    path.join(paths.projectRoot, '.codex', 'skills', 'launchdeck-agent')
  ];
  const uniqueCandidates = [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
  for (const candidate of uniqueCandidates) {
    if (fs.existsSync(path.join(candidate, 'SKILL.md'))) {
      return inspectInstalledSkill(candidate);
    }
  }
  throw evidenceError('agent_flask_installed_skill_missing', 'Real setup did not install launchdeck-agent skill in the isolated target.');
}

function collectObjectStrings(value, strings = []) {
  if (typeof value === 'string') {
    strings.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectObjectStrings(item, strings);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectObjectStrings(item, strings);
  }
  return strings;
}

function inspectInstalledSkill(skillPath) {
  const root = path.resolve(skillPath ?? '');
  const manifestPath = path.join(root, 'SKILL.md');
  if (!fs.existsSync(manifestPath)) {
    throw evidenceError('agent_flask_installed_skill_missing', `Installed skill manifest missing: ${manifestPath}.`);
  }
  const files = [];
  collectSkillFiles(root, '', files);
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const valid = /name:\s*["']?launchdeck-agent["']?/.test(manifest)
    && /capabilities\.get/.test(manifest)
    && /launchdeck\.yml/.test(manifest);
  if (!valid) {
    throw evidenceError('agent_flask_installed_skill_invalid', 'Installed launchdeck-agent skill does not expose the expected authoring rules.');
  }
  return Object.freeze({
    path: root,
    valid,
    manifestPath,
    contentSha256: sha256Text(files.map((file) => `${file.path}:${file.sha256}`).join('\n')),
    files
  });
}

function collectSkillFiles(root, relativeDir, files) {
  const directory = path.join(root, relativeDir);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw evidenceError('agent_flask_installed_skill_invalid', `Installed skill contains symlink: ${absolutePath}.`);
    }
    if (entry.isDirectory()) {
      collectSkillFiles(root, relativePath, files);
    } else if (entry.isFile()) {
      const content = fs.readFileSync(absolutePath);
      files.push({
        path: relativePath.replaceAll('\\', '/'),
        bytes: content.length,
        sha256: sha256Text(content)
      });
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
}

function inspectFlaskProject(projectRoot) {
  const files = ['pyproject.toml', 'src/flask_demo/app.py', 'README.md'];
  const [pyproject, appSource, readme] = files.map((file) =>
    fs.readFileSync(path.join(projectRoot, file), 'utf8')
  );
  if (!/flask-demo|flask_demo/.test(pyproject) || !/Flask|create_app/i.test(appSource) || !/Flask/i.test(readme)) {
    throw evidenceError('agent_flask_project_evidence_missing', 'Flask project evidence was not detected.');
  }
  const moduleName = pyproject.includes('flask_demo') ? 'flask_demo' : null;
  if (!moduleName) {
    throw evidenceError('agent_flask_project_evidence_missing', 'Flask module evidence was not detected.');
  }
  const nameMatch = pyproject.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
  return Object.freeze({
    files,
    projectName: nameMatch?.[1] ?? 'flask-demo',
    moduleName,
    startCommand: `python -m ${moduleName}`,
    pyprojectSha256: sha256Text(pyproject),
    appSha256: sha256Text(appSource),
    readmeSha256: sha256Text(readme)
  });
}

function assertAgentAuthoredConfig(projectRoot) {
  const configPath = path.join(projectRoot, '.launchdeck.yml');
  const config = fs.readFileSync(configPath, 'utf8');
  if (!/python -m flask_demo/.test(config) || !/longRunning: true/.test(config)) {
    throw evidenceError('agent_flask_config_invalid', 'Agent-authored config does not describe Flask lifecycle.');
  }
}

function runCli(args, options) {
  const selectedCliPath = options.cliPath ?? cliPath;
  return runCommand(process.execPath, [selectedCliPath, ...args], options);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (status, signal) => {
      resolve({ command, args, status, signal, stdout, stderr });
    });
  });
}

function parseJsonRun(result, label) {
  if (![0, 1].includes(result.status)) {
    throw evidenceError('agent_flask_command_failed', `${label} exited ${result.status}.`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw evidenceError('agent_flask_json_invalid', `${label} did not produce JSON: ${error.message}`);
  }
}

export function assertPublicSetupSucceeded(result, envelope = parseJsonRun(result, 'agent setup')) {
  const outcome = envelope?.result?.outcome;
  if (result?.status !== 0 || envelope?.ok !== true || outcome !== 'succeeded') {
    throw evidenceError(
      outcome === 'refused' ? 'agent_flask_setup_refused' : 'agent_flask_setup_failed',
      `agent setup must succeed through the public CLI; observed status=${result?.status ?? 'unknown'}, outcome=${outcome ?? 'missing'}.`
    );
  }
  return envelope;
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await httpGet(url);
      if (response.statusCode >= 200 && response.statusCode < 500) return response;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw evidenceError('agent_flask_http_timeout', `Timed out waiting for ${url}.`);
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => resolve({ statusCode: response.statusCode, body }));
    });
    request.once('error', reject);
    request.setTimeout(5_000, () => {
      request.destroy(new Error(`HTTP timeout: ${url}`));
    });
  });
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.once('error', reject);
  });
}

function evidencePaths(root) {
  return {
    root,
    homeDir: path.join(root, 'launchdeck home'),
    projectRoot: path.join(root, 'flask project')
  };
}

function isolatedEnv(paths, port) {
  const projectSrc = paths.projectRoot ? path.join(paths.projectRoot, 'src') : '';
  return {
    ...process.env,
    HOME: path.join(paths.root ?? '', 'home'),
    USERPROFILE: path.join(paths.root ?? '', 'userprofile'),
    LOCALAPPDATA: path.join(paths.root ?? '', 'localappdata'),
    XDG_STATE_HOME: path.join(paths.root ?? '', 'xdg-state'),
    LAUNCHDECK_HOME: paths.homeDir,
    PORT: String(port),
    HOST: '127.0.0.1',
    PYTHONPATH: projectSrc,
    PYTHONUNBUFFERED: '1',
    NO_COLOR: '1',
    CI: '1'
  };
}

function isIsolatedPathSet(root, paths, env) {
  const resolvedRoot = path.resolve(root || '.');
  return [
    paths.homeDir,
    paths.projectRoot,
    env.HOME,
    env.USERPROFILE,
    env.LOCALAPPDATA,
    env.XDG_STATE_HOME,
    env.LAUNCHDECK_HOME
  ].filter(Boolean).every((entry) => {
    const relative = path.relative(resolvedRoot, path.resolve(entry));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}

function summarizeEnvelope(envelope) {
  return {
    schemaVersion: envelope.schemaVersion,
    ok: envelope.ok,
    command: envelope.command,
    outcome: envelope.result?.outcome ?? envelope.status ?? null
  };
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function sha256File(filePath) {
  return sha256Text(fs.readFileSync(filePath));
}

function sha256Json(value) {
  return sha256Text(stableJson(value));
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function withoutFields(value, fields) {
  const copy = { ...(value ?? {}) };
  for (const field of fields) delete copy[field];
  return copy;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function observedEnvironment() {
  return {
    os: {
      platform: schemaPlatform(process.platform),
      version: os.release(),
      arch: process.arch
    },
    node: {
      version: process.versions.node
    }
  };
}

function schemaPlatform(platform) {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

function hasCompleteProducerProvenance(provenance, entrypoint) {
  return provenance?.schemaVersion === 1
    && provenance?.kind === 'agent-first-evidence-provenance'
    && provenance?.entrypoint === entrypoint
    && provenance?.observed === true
    && hasObject(provenance.identity)
    && hasObject(provenance.environment)
    && hasObject(provenance.host)
    && hasObject(provenance.scope)
    && typeof provenance.component === 'string'
    && hasObject(provenance.scenario)
    && hasObject(provenance.command)
    && hasObject(provenance.result)
    && hasObject(provenance.candidate)
    && hasObject(provenance.evidence)
    && /^sha256:[0-9a-f]{64}$/.test(String(provenance.identity.buildIdentity ?? ''))
    && /^sha256:[0-9a-f]{64}$/.test(String(provenance.identity.packageDigest ?? ''))
    && /^sha256:[0-9a-f]{64}$/.test(String(provenance.identity.payloadDigest ?? ''))
    && provenance.component === entrypoint
    && Array.isArray(provenance.evidence.rawRefs)
    && provenance.evidence.rawRefs.length > 0;
}

function producerProvenanceMatchesBody(evidence, entrypoint) {
  if (!hasCompleteProducerProvenance(evidence?.provenance, entrypoint)) return false;
  try {
    const expected = entrypoint === 'flask'
      ? flaskEvidenceProvenance(evidence)
      : null;
    return expected !== null && stableJson(evidence.provenance) === stableJson(expected);
  } catch {
    return false;
  }
}

function hasFlaskBodyProof(evidence) {
  return isSha256Digest(evidence?.agentAuthored?.buildIdentity)
    && isSha256Digest(evidence?.agentAuthored?.mcpProof?.server?.sha256)
    && hasObject(evidence?.agentAuthored?.configInputs)
    && isSha256Digest(evidence?.agentAuthored?.configSha256)
    && hasObject(evidence?.producer?.environment)
    && hasObject(evidence?.producer?.host)
    && evidence.producer.host.id === 'none'
    && evidence.producer.host.version === 'deterministic-installed-agent-fixture'
    && typeof evidence?.page?.body === 'string'
    && typeof evidence?.logs?.content === 'string';
}

function isSha256Digest(value) {
  return /^sha256:[0-9a-f]{64}$/.test(String(value ?? ''));
}

function hasObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function evidenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseArgs(argv) {
  const options = {
    workRoot: null,
    port: null,
    projectRoot: null,
    configPath: null,
    installedSkillPath: null,
    mcpEntrypoint: null,
    cliPath: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--work-root') {
      options.workRoot = argv[++index];
    } else if (arg === '--project-root') {
      options.projectRoot = argv[++index];
    } else if (arg === '--config-path') {
      options.configPath = argv[++index];
    } else if (arg === '--installed-skill-path') {
      options.installedSkillPath = argv[++index];
    } else if (arg === '--mcp-entrypoint') {
      options.mcpEntrypoint = argv[++index];
    } else if (arg === '--cli-path') {
      options.cliPath = argv[++index];
    } else if (arg === '--port') {
      options.port = Number(argv[++index]);
      if (!Number.isInteger(options.port) || options.port <= 0) {
        throw evidenceError('agent_flask_args_invalid', '--port must be a positive integer.');
      }
    } else {
      throw evidenceError('agent_flask_args_invalid', `Unknown argument: ${arg}`);
    }
  }
  return options;
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
