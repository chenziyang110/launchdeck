#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  expectedInstallerPackageFiles,
  validateInstallerPackageInventory
} from '../src/agent/artifacts/payload.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_FIXTURE_HOST = Object.freeze({
  id: 'none',
  version: 'package-adapter-fixture',
  versionEvidenceDigest: sha256Json({ fixture: 'package-adapter' }),
  capabilityMatrixRevision: 'package-adapter-fixture'
});
const DEFAULT_COMPONENTS = ['runtime'];

if (isMain()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const evidence = await runPackageEvidence(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    } else {
      process.stdout.write(`agent installer package evidence: ${evidence.ok ? 'ok' : 'failed'}\n`);
    }
    process.exitCode = evidence.ok ? 0 : 1;
  } catch (error) {
    const failure = {
      schemaVersion: 1,
      ok: false,
      kind: 'agent-installer-package-evidence',
      error: {
        code: error?.code ?? 'agent_package_evidence_failed',
        message: error?.message ?? 'Package evidence failed.'
      }
    };
    process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
    process.exitCode = 1;
  }
}

export async function runPackageEvidence(options = {}) {
  const root = path.resolve(options.workRoot ?? fs.mkdtempSync(
    path.join(os.tmpdir(), 'launchdeck-agent-package-evidence-')
  ));
  const paths = evidencePaths(root);
  fs.mkdirSync(paths.projectRoot, { recursive: true });
  fs.mkdirSync(paths.npmCache, { recursive: true });
  fs.mkdirSync(paths.npmPrefix, { recursive: true });
  fs.mkdirSync(paths.homeDir, { recursive: true });
  fs.writeFileSync(path.join(paths.projectRoot, 'app.js'), 'console.log("fixture app");\n', 'utf8');

  const env = isolatedEnv(paths);
  const npmCommand = resolveNpmCommand({ env });
  const manifest = readJson(path.join(repoRoot, 'agent', 'installer-payload', 'manifest.json'));
  const packed = await npmPack({ paths, env, npmCommand });
  const inventory = validateInstallerPackageInventory({
    source: 'npm-pack-json',
    packageFiles: packed.files,
    manifest
  });

  const selection = [
    'agent',
    'setup',
    ...DEFAULT_COMPONENTS.flatMap((component) => ['--component', component]),
    '--scope',
    'project',
    '--project',
    paths.projectRoot,
    '--json'
  ];
  const beforeDryRun = snapshot(paths);
  const dryRun = await runNpmExec(
    npmCommand,
    packed.tarballPath,
    [...selection, '--dry-run'],
    { cwd: paths.projectRoot, env }
  );
  assertPublicLifecycleOutcome(dryRun, 'npx dry-run', ['planned']);
  assertNoStateChange(beforeDryRun, snapshot(paths), 'dry-run');

  const beforeRefusal = snapshot(paths);
  const jsonApprovalRefusal = await runNpmExec(npmCommand, packed.tarballPath, selection, {
    cwd: paths.projectRoot,
    env: { ...env, npm_config_yes: 'true' }
  });
  assertPublicLifecycleOutcome(jsonApprovalRefusal, 'npx JSON refusal', ['refused']);
  assertNoStateChange(beforeRefusal, snapshot(paths), 'json approval refusal');

  const approved = await runNpmExec(npmCommand, packed.tarballPath, [...selection, '--yes'], {
    cwd: paths.projectRoot,
    env: { ...env, npm_config_yes: 'true' }
  });
  assertPublicLifecycleOutcome(approved, 'npx approved setup', ['succeeded']);

  const install = await npmInstallGlobal(packed.tarballPath, { paths, env, npmCommand });
  const installedBin = installedLaunchdeckBin(paths.npmPrefix);
  const installedRepeat = await runCommand(installedBin.command, [
    ...installedBin.prefixArgs,
    ...selection,
    '--yes'
  ], { cwd: paths.projectRoot, env: withoutNpmCachePath(env) });
  assertPublicLifecycleOutcome(installedRepeat, 'installed repeat setup', ['noop']);

  const compatibilityPaths = await runCommand(installedBin.command, [
    ...installedBin.prefixArgs,
    'agent',
    'paths',
    '--json'
  ], { cwd: paths.projectRoot, env: withoutNpmCachePath(env) });
  assertJsonCommand(compatibilityPaths, 'agent paths');

  const skillInstallDryRun = await runCommand(installedBin.command, [
    ...installedBin.prefixArgs,
    'agent',
    'install',
    '--agent',
    'codex',
    '--dry-run',
    '--json'
  ], { cwd: paths.projectRoot, env: withoutNpmCachePath(env) });
  assertJsonCommand(skillInstallDryRun, 'agent install dry-run');
  const compatibilitySkillInstallDryRun = normalizeCompatibilitySkillInstallDryRun(
    jsonResult(skillInstallDryRun)
  );

  fs.rmSync(paths.npmCache, { recursive: true, force: true });
  const offlineLauncher = await runStableLauncher({
    paths,
    buildIdentity: jsonResult(approved).result.buildIdentity,
    env: withoutNpmCachePath(env)
  });

  const payloadExpected = expectedInstallerPackageFiles(manifest);
  const evidenceBody = {
    schemaVersion: 1,
    kind: 'agent-installer-package-evidence',
    generatedAt: new Date().toISOString(),
    isolation: {
      root,
      npmCache: paths.npmCache,
      npmPrefix: paths.npmPrefix,
      launchdeckHome: paths.homeDir,
      projectRoot: paths.projectRoot,
      projectTreeDigest: snapshot(paths).project,
      liveUserStateTouched: !isIsolatedPathSet(root, paths, env)
    },
    package: {
      tarballPath: packed.tarballPath,
      tarballSha256: sha256File(packed.tarballPath),
      tarballByteLength: fs.statSync(packed.tarballPath).size,
      inventory,
      fileCount: packed.files.length
    },
    payloadInventory: {
      buildIdentity: manifest.buildIdentity,
      expectedPayloadFilesPresent: payloadExpected.every((entry) => packed.files.includes(entry)),
      expectedPayloadFiles: payloadExpected,
      digest: sha256Json({
        buildIdentity: manifest.buildIdentity,
        expectedPayloadFilesPresent: payloadExpected.every((entry) => packed.files.includes(entry)),
        expectedPayloadFiles: payloadExpected
      })
    },
    producer: {
      environment: observedEnvironment(),
      host: PACKAGE_FIXTURE_HOST,
      sourceRevision: `package:${readJson(path.join(repoRoot, 'package.json')).version}`,
      manifestDigest: sha256Json(manifest),
      npmInvocation: {
        kind: 'node-npm-cli',
        command: path.basename(npmCommand.command),
        cliPathSha256: sha256Text(npmCommand.cliPath),
        shell: false
      }
    },
    npx: {
      dryRun: jsonResult(dryRun),
      jsonApprovalRefusal: jsonResult(jsonApprovalRefusal),
      approved: observedJsonResult(approved)
    },
    installed: {
      install,
      repeat: jsonResult(installedRepeat)
    },
    compatibility: {
      paths: jsonResult(compatibilityPaths),
      skillInstallDryRun: compatibilitySkillInstallDryRun
    },
    offlineAfterNpx: {
      cacheRemoved: !fs.existsSync(paths.npmCache),
      launcher: summarizeRun(offlineLauncher)
    },
    quoting: {
      projectPath: paths.projectRoot,
      projectPathIncludesSpace: paths.projectRoot.includes(' '),
      shellUsed: false
    }
  };
  evidenceBody.provenance = packageEvidenceProvenance({
    evidence: evidenceBody
  });
  const contract = evaluatePackageEvidenceContract(evidenceBody);
  const evidence = Object.freeze({
    ...evidenceBody,
    ok: contract.ok,
    contract
  });
  if (!contract.ok) {
    throw evidenceContractError(contract.failures);
  }
  return Object.freeze(evidence);
}

export function evaluatePackageEvidenceContract(evidence) {
  const approvedBuild = evidence?.npx?.approved?.result?.buildIdentity;
  const installedBuild = evidence?.installed?.repeat?.result?.buildIdentity;
  const checks = {
    inventoryOk: evidence?.package?.inventory?.ok === true,
    expectedPayloadFilesPresent: evidence?.payloadInventory?.expectedPayloadFilesPresent === true,
    dryRunPlanned: evidence?.npx?.dryRun?.result?.outcome === 'planned',
    jsonApprovalRefused: evidence?.npx?.jsonApprovalRefusal?.result?.outcome === 'refused',
    npxSetupSucceeded: evidence?.npx?.approved?.result?.outcome === 'succeeded',
    installedRepeatNoop: evidence?.installed?.repeat?.result?.outcome === 'noop',
    installedParityBuildIdentity: isSha256Digest(approvedBuild) && approvedBuild === installedBuild,
    compatibilityPathsJson: evidence?.compatibility?.paths?.schemaVersion === 1,
    compatibilitySkillInstallDryRunPlanned:
      evidence?.compatibility?.skillInstallDryRun?.result?.outcome === 'planned',
    offlineCacheRemoved: evidence?.offlineAfterNpx?.cacheRemoved === true,
    offlineLauncherSucceeded: evidence?.offlineAfterNpx?.launcher?.status === 0,
    isolatedNoLiveUserState: evidence?.isolation?.liveUserStateTouched === false,
    quotedProjectPath: evidence?.quoting?.projectPathIncludesSpace === true
      && evidence?.quoting?.shellUsed === false,
    tarballDigestPresent: isSha256Digest(evidence?.package?.tarballSha256),
    tarballByteLengthPresent: Number.isInteger(evidence?.package?.tarballByteLength)
      && evidence.package.tarballByteLength > 0,
    producerBodyProofPresent: hasPackageBodyProof(evidence),
    producerProvenanceComplete: hasCompleteProducerProvenance(evidence?.provenance, 'package'),
    producerProvenanceMatchesBody: producerProvenanceMatchesBody(evidence, 'package')
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name);
  return Object.freeze({
    ok: failures.length === 0,
    checks: Object.freeze(checks),
    failures: Object.freeze(failures)
  });
}

function packageEvidenceProvenance({ evidence }) {
  const candidateSha256 = evidence.package.tarballSha256;
  const payloadDigest = evidence.payloadInventory.digest;
  const manifestDigest = evidence.producer.manifestDigest;
  const producerDigestInput = withoutFields(evidence, ['provenance', 'contract', 'ok']);
  const producerJson = stableJson(producerDigestInput);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'agent-first-evidence-provenance',
    entrypoint: 'package',
    observed: true,
    identity: {
      buildIdentity: evidence.npx.approved.result.buildIdentity,
      sourceRevision: evidence.producer.sourceRevision,
      packageDigest: candidateSha256,
      payloadDigest
    },
    environment: evidence.producer.environment,
    host: evidence.producer.host,
    scope: {
      kind: 'project',
      identity: `project:sha256:${sha256Hex(stableJson({
        projectFiles: evidence.isolation.projectTreeDigest,
        setupScope: 'project'
      }))}`
    },
    component: 'package',
    scenario: {
      id: 'package-offline-launcher',
      kind: 'package',
      revision: manifestDigest
    },
    command: {
      entrypoint: 'npx launchdeck agent setup',
      argv: [
        'launchdeck',
        'agent',
        'setup',
        '--component',
        'runtime',
        '--scope',
        'project',
        '--project',
        '<PROJECT>',
        '--json',
        '--yes'
      ],
      cwd: '<PROJECT>'
    },
    result: {
      exitCode: evidence.npx.approved.status ?? 0,
      outcome: evidence.npx.approved.result.outcome,
      effectCertainty: evidence.npx.approved.result.effectCertainty ?? 'complete',
      stdoutSha256: evidence.npx.approved.stdoutSha256,
      stderrSha256: evidence.npx.approved.stderrSha256
    },
    candidate: {
      kind: 'npm-tarball',
      uri: `npm:launchdeck@${candidateSha256}`,
      sha256: candidateSha256,
      byteLength: evidence.package.tarballByteLength,
      manifestDigest,
      immutable: true,
      mutable: false
    },
    evidence: {
      rawRefs: [{
        path: 'producer/package-evidence.json',
        sha256: sha256Text(producerJson),
        byteLength: Buffer.byteLength(producerJson)
      }]
    }
  });
}

async function npmPack({ paths, env, npmCommand }) {
  fs.mkdirSync(paths.packDir, { recursive: true });
  const result = await runNpmCommand(npmCommand, [
    'pack',
    '--json',
    '--pack-destination',
    paths.packDir
  ], {
    cwd: repoRoot,
    env
  });
  if (result.status !== 0) throw commandError('agent_package_pack_failed', result);
  const parsed = parseNpmPackJson(result.stdout);
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  const tarballPath = path.resolve(paths.packDir, entry.filename);
  return {
    tarballPath,
    files: entry.files.map((file) => `package/${file.path}`).sort()
  };
}

export function parseNpmPackJson(stdout) {
  const text = String(stdout ?? '');
  const candidates = [0];
  for (let index = text.indexOf('\n['); index !== -1; index = text.indexOf('\n[', index + 2)) {
    candidates.push(index + 1);
  }
  for (const index of candidates.reverse()) {
    try {
      const parsed = JSON.parse(text.slice(index).trim());
      const entry = Array.isArray(parsed) ? parsed[0] : parsed;
      if (
        typeof entry?.filename === 'string'
        && Array.isArray(entry.files)
        && entry.files.every((file) => typeof file?.path === 'string')
      ) {
        return parsed;
      }
    } catch {
      // npm lifecycle scripts may write informational lines before the final JSON array.
    }
  }
  const error = new Error('npm pack did not emit a valid package inventory JSON document.');
  error.code = 'agent_package_pack_json_invalid';
  throw error;
}

export function normalizeCompatibilitySkillInstallDryRun(result) {
  if (
    result?.ok !== true
    || result?.dryRun !== true
    || !result.result
    || typeof result.result !== 'object'
    || Array.isArray(result.result)
  ) {
    const error = new Error('Agent install dry-run did not emit a successful dry-run result.');
    error.code = 'agent_package_compatibility_dry_run_invalid';
    throw error;
  }
  if (result.result.outcome === 'planned') return result;
  if (!['planned', 'already_installed'].includes(result.result.status)) {
    const error = new Error(
      `Agent install dry-run emitted an unsupported status: ${result.result.status ?? '<missing>'}.`
    );
    error.code = 'agent_package_compatibility_dry_run_invalid';
    throw error;
  }
  return Object.freeze({
    ...result,
    result: Object.freeze({
      ...result.result,
      outcome: 'planned'
    })
  });
}

function npmInstallGlobal(tarballPath, { paths, env, npmCommand }) {
  return runNpmCommand(npmCommand, [
    'install',
    '--global',
    '--prefix',
    paths.npmPrefix,
    tarballPath
  ], {
    cwd: paths.projectRoot,
    env
  }).then((result) => {
    if (result.status !== 0) throw commandError('agent_package_install_failed', result);
    return summarizeRun(result);
  });
}

function runNpmExec(npmCommand, tarballPath, args, options) {
  return runNpmCommand(npmCommand, [
    'exec',
    '--yes',
    '--package',
    tarballPath,
    '--',
    'launchdeck',
    ...args
  ], options);
}

function runNpmCommand(npmCommand, args, options) {
  return runCommand(npmCommand.command, [...npmCommand.prefixArgs, ...args], options);
}

function runStableLauncher({ paths, buildIdentity, env }) {
  const launcherPath = path.join(paths.homeDir, 'installer', 'launcher', 'v1', 'launcher.js');
  const initialize = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'launchdeck-package-evidence',
        version: '1.0.0'
      }
    }
  });
  return runCommand(process.execPath, [
    launcherPath,
    '--build',
    buildIdentity,
    '--'
  ], {
    cwd: paths.projectRoot,
    env: withoutNpmCachePath(env),
    stdin: `${initialize}\n`
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: [options.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
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
    if (options.stdin !== undefined) {
      child.stdin.end(String(options.stdin));
    }
    child.once('error', reject);
    child.once('exit', (status, signal) => {
      resolve({ command, args, status, signal, stdout, stderr });
    });
  });
}

export function resolveNpmCommand({
  env = process.env,
  platform = process.platform,
  nodeExecutable = process.execPath
} = {}) {
  const candidates = [];
  const npmExecPath = String(env?.npm_execpath ?? env?.NPM_EXECPATH ?? '').trim();
  if (npmExecPath) candidates.push(npmExecPath);
  candidates.push(path.join(path.dirname(nodeExecutable), 'node_modules', 'npm', 'bin', 'npm-cli.js'));

  const pathValue = String(env?.PATH ?? env?.Path ?? '').trim();
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    for (const executableName of platform === 'win32' ? ['npm.cmd', 'npm'] : ['npm']) {
      const executablePath = path.join(directory, executableName);
      if (!fs.existsSync(executablePath)) continue;
      try {
        const realPath = fs.realpathSync(executablePath);
        if (path.basename(realPath) === 'npm-cli.js') candidates.push(realPath);
      } catch {
        // Continue to the co-located npm package candidate below.
      }
      candidates.push(path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    }
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (path.basename(resolved) !== 'npm-cli.js' || !fs.existsSync(resolved)) continue;
    const stat = fs.lstatSync(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    return Object.freeze({
      command: path.resolve(nodeExecutable),
      prefixArgs: Object.freeze([resolved]),
      cliPath: resolved,
      shell: false
    });
  }

  const error = new Error('A regular npm-cli.js could not be resolved without shell execution.');
  error.code = 'agent_package_npm_cli_unavailable';
  throw error;
}

function evidencePaths(root) {
  return {
    root,
    packDir: path.join(root, 'pack'),
    npmCache: path.join(root, 'npm cache'),
    npmPrefix: path.join(root, 'npm prefix'),
    homeDir: path.join(root, 'launchdeck home'),
    projectRoot: path.join(root, 'project with spaces')
  };
}

function isolatedEnv(paths) {
  return {
    ...process.env,
    HOME: path.join(paths.root, 'home'),
    USERPROFILE: path.join(paths.root, 'userprofile'),
    LOCALAPPDATA: path.join(paths.root, 'localappdata'),
    XDG_STATE_HOME: path.join(paths.root, 'xdg-state'),
    LAUNCHDECK_HOME: paths.homeDir,
    npm_config_cache: paths.npmCache,
    NPM_CONFIG_CACHE: paths.npmCache,
    npm_config_prefix: paths.npmPrefix,
    NPM_CONFIG_PREFIX: paths.npmPrefix,
    CI: '1',
    NO_COLOR: '1'
  };
}

function withoutNpmCachePath(env) {
  const prefixBin = process.platform === 'win32'
    ? env.NPM_CONFIG_PREFIX
    : path.join(env.NPM_CONFIG_PREFIX, 'bin');
  return {
    ...env,
    PATH: [prefixBin, process.execPath && path.dirname(process.execPath)]
      .filter(Boolean)
      .join(path.delimiter)
  };
}

function installedLaunchdeckBin(prefix) {
  const candidates = [
    path.join(prefix, 'lib', 'node_modules', 'launchdeck', 'src', 'cli.js'),
    path.join(prefix, 'node_modules', 'launchdeck', 'src', 'cli.js')
  ];
  const installedCli = candidates.find((candidate) => fs.existsSync(candidate));
  if (installedCli) return { command: process.execPath, prefixArgs: [installedCli] };
  return {
    command: path.join(prefix, 'bin', 'launchdeck'),
    prefixArgs: []
  };
}

function isIsolatedPathSet(root, paths, env) {
  const resolvedRoot = path.resolve(root);
  const ownedPaths = [
    paths.npmCache,
    paths.npmPrefix,
    paths.homeDir,
    paths.projectRoot,
    env.HOME,
    env.USERPROFILE,
    env.LOCALAPPDATA,
    env.XDG_STATE_HOME,
    env.LAUNCHDECK_HOME,
    env.NPM_CONFIG_CACHE,
    env.NPM_CONFIG_PREFIX
  ];
  return ownedPaths.every((entry) => {
    const resolved = path.resolve(entry);
    const relative = path.relative(resolvedRoot, resolved);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}

function assertJsonCommand(result, label) {
  if (result.status === 0 || result.status === 1) {
    jsonResult(result);
    return;
  }
  throw commandError('agent_package_command_failed', result, { label });
}

export function assertPublicLifecycleOutcome(result, label, expectedOutcomes) {
  assertJsonCommand(result, label);
  const envelope = jsonResult(result);
  const outcome = envelope?.result?.outcome;
  if (!Array.isArray(expectedOutcomes) || !expectedOutcomes.includes(outcome)) {
    throw commandError('agent_package_lifecycle_outcome_invalid', result, {
      label,
      expectedOutcomes,
      observedOutcome: outcome ?? null
    });
  }
  const expectedStatus = outcome === 'refused' ? 1 : 0;
  if (result.status !== expectedStatus) {
    throw commandError('agent_package_lifecycle_status_invalid', result, {
      label,
      expectedStatus,
      observedStatus: result.status
    });
  }
  if (outcome === 'refused' && !expectedOutcomes.includes('refused')) {
    throw commandError('agent_package_lifecycle_refused', result, {
      label,
      observedOutcome: outcome
    });
  }
  return envelope;
}

function jsonResult(result) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw commandError('agent_package_json_invalid', result, {
      causeMessage: error?.message
    });
  }
}

function observedJsonResult(result) {
  return {
    ...jsonResult(result),
    status: result.status ?? 0,
    stdoutSha256: sha256Text(result.stdout),
    stderrSha256: sha256Text(result.stderr)
  };
}

function snapshot(paths) {
  return {
    home: treeDigest(paths.homeDir),
    project: treeDigest(paths.projectRoot)
  };
}

function assertNoStateChange(before, after, label) {
  if (before.home !== after.home || before.project !== after.project) {
    const error = new Error(`${label} changed isolated state before approval.`);
    error.code = 'agent_package_unapproved_write';
    throw error;
  }
}

function treeDigest(root) {
  const hash = crypto.createHash('sha256');
  if (!fs.existsSync(root)) return 'missing';
  const files = [];
  walk(root, files);
  for (const filePath of files) {
    hash.update(path.relative(root, filePath).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function walk(current, files) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile()) files.push(absolute);
  }
  files.sort();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function isSha256Digest(value) {
  return /^sha256:[0-9a-f]{64}$/.test(String(value ?? ''));
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
    && isSha256Digest(provenance.identity.buildIdentity)
    && isSha256Digest(provenance.identity.packageDigest)
    && isSha256Digest(provenance.identity.payloadDigest)
    && provenance.component === entrypoint
    && Array.isArray(provenance.evidence.rawRefs)
    && provenance.evidence.rawRefs.length > 0;
}

function producerProvenanceMatchesBody(evidence, entrypoint) {
  if (!hasCompleteProducerProvenance(evidence?.provenance, entrypoint)) return false;
  try {
    const expected = entrypoint === 'package'
      ? packageEvidenceProvenance({ evidence })
      : null;
    return expected !== null && stableJson(evidence.provenance) === stableJson(expected);
  } catch {
    return false;
  }
}

function hasPackageBodyProof(evidence) {
  return isSha256Digest(evidence?.package?.tarballSha256)
    && Number.isInteger(evidence?.package?.tarballByteLength)
    && evidence.package.tarballByteLength > 0
    && isSha256Digest(evidence?.payloadInventory?.digest)
    && isSha256Digest(evidence?.producer?.manifestDigest)
    && typeof evidence?.producer?.sourceRevision === 'string'
    && evidence.producer.sourceRevision.length > 0
    && hasObject(evidence?.producer?.environment)
    && hasObject(evidence?.producer?.host)
    && evidence.producer.host.id === 'none'
    && evidence.producer.host.version === 'package-adapter-fixture'
    && isSha256Digest(evidence?.npx?.approved?.stdoutSha256)
    && isSha256Digest(evidence?.npx?.approved?.stderrSha256)
    && typeof evidence?.isolation?.projectTreeDigest === 'string'
    && evidence.isolation.projectTreeDigest.length > 0;
}

function hasObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function summarizeRun(result) {
  return {
    status: result.status,
    stdoutSha256: `sha256:${crypto.createHash('sha256').update(result.stdout).digest('hex')}`,
    stderrSha256: `sha256:${crypto.createHash('sha256').update(result.stderr).digest('hex')}`
  };
}

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
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

function commandError(code, result, details = {}) {
  const error = new Error(`Command failed: ${result.command} ${result.args.join(' ')}`);
  error.code = code;
  error.details = {
    ...details,
    status: result.status,
    stdout: result.stdout.slice(0, 2000),
    stderr: result.stderr.slice(0, 2000)
  };
  return error;
}

function evidenceContractError(failures) {
  const error = new Error(`Package evidence contract failed: ${failures.join(', ')}`);
  error.code = 'agent_package_evidence_contract_failed';
  error.failures = failures;
  return error;
}

function parseArgs(argv) {
  const options = { json: false, workRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--work-root') {
      options.workRoot = argv[++index];
    } else {
      throw Object.assign(new Error(`Unknown argument: ${arg}`), {
        code: 'agent_package_evidence_args_invalid'
      });
    }
  }
  return options;
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
