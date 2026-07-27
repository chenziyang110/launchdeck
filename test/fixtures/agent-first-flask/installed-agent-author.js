#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  connectLaunchdeckMcp,
  repoRoot,
  requireAgentResult,
  sourceMcpEntrypoint
} from '../../helpers/mcp-client.js';

if (isMain()) {
  const evidence = await runDeterministicInstalledAgentFixture(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exitCode = evidence.ok ? 0 : 1;
}

async function runDeterministicInstalledAgentFixture(options) {
  try {
    const projectRoot = path.resolve(options.projectRoot);
    const configPath = path.resolve(options.configPath);
    assertContainedPath(projectRoot, configPath, 'Agent fixture config path escaped project root');
    const installedSkill = inspectInstalledSkill(options.installedSkillPath);
    const port = Number(options.port);
    const fixtureEnv = {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      PYTHONPATH: path.join(projectRoot, 'src')
    };
    const projectEvidence = inspectFlaskProject(projectRoot);
    const mcpProof = await collectMcpProof({
      cwd: projectRoot,
      env: fixtureEnv,
      entrypoint: options.mcpEntrypoint ?? sourceMcpEntrypoint
    });
    const config = renderLaunchdeckConfig({ projectEvidence, port });
    fs.writeFileSync(configPath, config, 'utf8');
    return Object.freeze({
      schemaVersion: 1,
      ok: true,
      kind: 'deterministic-installed-agent-fixture-authorship',
      result: {
        author: 'deterministic-installed-agent-fixture',
        interactiveHost: false,
        llmReasoning: false,
        installedSkill,
        evidence: projectEvidence.files,
        configInputs: projectEvidence,
        configSha256: sha256Text(config),
        buildIdentity: mcpProof.buildIdentity,
        mcpProof
      }
    });
  } catch (error) {
    return Object.freeze({
      schemaVersion: 1,
      ok: false,
      kind: 'deterministic-installed-agent-fixture-authorship',
      error: {
        code: error?.code ?? 'agent_flask_authoring_fixture_failed',
        message: error?.message ?? 'Installed Agent fixture authoring failed.'
      }
    });
  }
}

function renderLaunchdeckConfig({ projectEvidence, port }) {
  return `version: 1
project:
  name: ${projectEvidence.projectName}
tasks:
  start:
    command: ${projectEvidence.startCommand}
    longRunning: true
    url: http://127.0.0.1:${port}
    ports:
      - ${port}
    env:
      HOST: 127.0.0.1
      PORT: "${port}"
      PYTHONPATH: src
  test:
    command: python -m pytest
    env:
      PYTHONPATH: src
`;
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

async function collectMcpProof({ cwd, env, entrypoint }) {
  const mcp = await connectLaunchdeckMcp({
    clientName: 'agent-first-flask-author-fixture',
    entrypoint,
    cwd,
    env,
    timeout: 8_000,
    callTimeout: 15_000
  });
  try {
    const [toolsResponse, capabilitiesResponse] = await Promise.all([
      mcp.listTools(),
      mcp.callTool('capabilities.get')
    ]);
    const capabilities = requireAgentResult(capabilitiesResponse, {
      operation: 'capabilities.get',
      outcome: 'succeeded'
    });
    const tools = (toolsResponse.tools ?? []).map((tool) => tool.name).sort();
    const buildIdentity = findBuildIdentity(capabilities);
    return Object.freeze({
      ok: /^sha256:[0-9a-f]{64}$/.test(String(buildIdentity ?? ''))
        && tools.includes('capabilities.get'),
      command: 'MCP stdio capabilities.get',
      buildIdentity,
      provenance: capabilities?.provenance ?? null,
      server: {
        path: path.relative(repoRoot, entrypoint).replaceAll(path.sep, '/'),
        sha256: sha256File(entrypoint)
      },
      tools,
      capabilities
    });
  } finally {
    await mcp.close().catch(() => {});
  }
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

function findBuildIdentity(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.buildIdentity === 'string') return value.buildIdentity;
  for (const nested of Object.values(value)) {
    const found = findBuildIdentity(nested);
    if (found) return found;
  }
  return null;
}

function assertContainedPath(root, candidate, message) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw evidenceError('agent_flask_path_escape', message);
  }
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function sha256File(filePath) {
  return sha256Text(fs.readFileSync(filePath));
}

function evidenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      options.projectRoot = argv[++index];
    } else if (arg === '--config-path') {
      options.configPath = argv[++index];
    } else if (arg === '--installed-skill-path') {
      options.installedSkillPath = argv[++index];
    } else if (arg === '--port') {
      options.port = Number(argv[++index]);
    } else if (arg === '--mcp-entrypoint') {
      options.mcpEntrypoint = argv[++index];
    } else {
      throw evidenceError('agent_flask_args_invalid', `Unknown argument: ${arg}`);
    }
  }
  return options;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
