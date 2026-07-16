#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_PATH = path.join(REPO_ROOT, 'src', 'cli.js');
const OFFICIAL_DEMO_PATH = path.join(REPO_ROOT, 'examples', 'demo-api');
const DEMO_ALIAS = 'demo';
const DEMO_TASK = 'dev';
const DEMO_TARGET = `${DEMO_ALIAS}:${DEMO_TASK}`;
const DEMO_PORT = 8888;

const HELP = `Launchdeck lifecycle smoke

Runs the official demo lifecycle through the CLI with an isolated LAUNCHDECK_HOME.
This records evidence for the current platform only; it does not claim cross-platform readiness.

Usage:
  node scripts/smoke-lifecycle.js [--mode quick|full] [--quickstart] [--keep] [--json] [--help]

Options:
  --mode quick|full  quick runs add/start/duplicate/status/inspect/restart/stop/reconcile/clean.
                     full also runs projects/ps/ports/conflicts/logs/events and registry remove.
                     Default: quick.
  --quickstart       Run the full release-smoke path expected by the quickstart checklist.
  --keep             Keep the temporary smoke workspace and LAUNCHDECK_HOME for inspection.
  --json             Print a JSON evidence object instead of the human report.
  --help, -h         Show this help.

Safety:
  - Copies examples/demo-api into a temporary workspace and never mutates the source demo.
  - Uses a temporary LAUNCHDECK_HOME for registry/runtime state.
  - Stops only the isolated Launchdeck-owned demo target through the Launchdeck CLI.
  - Does not use privileged hooks, process scanners, kill-by-port, or arbitrary PID termination.
`;

function parseArgs(argv) {
  const options = {
    mode: 'quick',
    keep: false,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--keep') {
      options.keep = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--quickstart') {
      options.mode = 'full';
    } else if (arg === '--mode') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--mode requires quick or full.');
      }
      options.mode = value;
      index += 1;
    } else if (arg.startsWith('--mode=')) {
      options.mode = arg.slice('--mode='.length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!['quick', 'full'].includes(options.mode)) {
    throw new Error(`Unsupported mode '${options.mode}'. Use quick or full.`);
  }

  return options;
}

function createWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchdeck-lifecycle-smoke-'));
  const home = path.join(root, 'launchdeck-home');
  const project = path.join(root, 'demo-api');
  fs.mkdirSync(home, { recursive: true });
  fs.cpSync(OFFICIAL_DEMO_PATH, project, {
    recursive: true,
    filter: (source) => {
      const parts = path.relative(OFFICIAL_DEMO_PATH, source).split(path.sep);
      return !parts.includes('.launchdeck') && !parts.includes('scratch');
    }
  });
  fs.mkdirSync(path.join(project, 'scratch', 'clean-safe'), { recursive: true });
  fs.writeFileSync(path.join(project, 'scratch', 'clean-safe', 'smoke.txt'), 'owned smoke artifact\n');
  return { root, home, project };
}

function buildEnv(home) {
  return {
    ...process.env,
    LAUNCHDECK_HOME: home,
    NO_COLOR: '1'
  };
}

function runCli(step, args, context, options = {}) {
  const cwd = options.cwd ?? REPO_ROOT;
  const allowFailure = options.allowFailure ?? false;
  const command = `node ${path.relative(REPO_ROOT, CLI_PATH)} ${args.join(' ')}`;
  const startedAt = new Date().toISOString();

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd,
      env: context.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
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
    child.on('close', (code, signal) => {
      const result = {
        step,
        command,
        cwd,
        exitCode: code,
        signal,
        startedAt,
        finishedAt: new Date().toISOString(),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        expectedFailure: allowFailure
      };
      context.steps.push(result);
      resolve(result);
    });
  });
}

function parseJson(stepResult) {
  try {
    return JSON.parse(stepResult.stdout);
  } catch (error) {
    throw new Error(`${stepResult.step} did not return parseable JSON: ${error.message}`);
  }
}

function assertExit(result, expectedCode = 0) {
  if (result.exitCode !== expectedCode) {
    throw new Error(`${result.step} exited ${result.exitCode}; expected ${expectedCode}.`);
  }
}

function assertJsonOk(result) {
  assertExit(result, 0);
  const payload = parseJson(result);
  if (payload.ok !== true) {
    throw new Error(`${result.step} returned ok=${payload.ok}; expected ok=true.`);
  }
  return payload;
}

async function checkedStep(context, step, args, options = {}) {
  const result = await runCli(step, args, context, options);
  return assertJsonOk(result);
}

function assertExistingRun(result) {
  const payload = assertJsonOk(result);
  const processInfo = payload.process ?? payload.data?.process;
  if (processInfo?.spawned !== false) {
    throw new Error(`${result.step} returned spawned=${processInfo?.spawned}; expected existing run with spawned=false.`);
  }
  return payload;
}

async function stopDemoIfOwned(context) {
  const result = await runCli('cleanup: stop isolated demo target', ['stop', DEMO_TARGET, '--json'], context, {
    allowFailure: true
  });
  return {
    attempted: true,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

async function runSmoke(options) {
  if (!fs.existsSync(CLI_PATH)) {
    throw new Error(`Launchdeck CLI not found at ${CLI_PATH}`);
  }
  if (!fs.existsSync(path.join(OFFICIAL_DEMO_PATH, '.launchdeck.yml'))) {
    throw new Error(`Official demo config not found at ${OFFICIAL_DEMO_PATH}`);
  }

  const workspace = createWorkspace();
  const context = {
    env: buildEnv(workspace.home),
    steps: []
  };
  const evidence = {
    status: 'running',
    mode: options.mode,
    platform: {
      processPlatform: process.platform,
      osType: os.type(),
      osRelease: os.release(),
      arch: process.arch,
      node: process.version
    },
    startedAt: new Date().toISOString(),
    workspace: {
      root: workspace.root,
      launchdeckHome: workspace.home,
      demoProject: workspace.project,
      sourceDemo: OFFICIAL_DEMO_PATH
    },
    safety: {
      localEvidenceOnly: true,
      crossPlatformReadyClaim: false,
      cleanupScope: 'temporary workspace plus Launchdeck-owned demo target in isolated LAUNCHDECK_HOME',
      noPrivilegedHooks: true,
      noArbitraryProcessKill: true
    },
    steps: context.steps,
    cleanup: {}
  };

  try {
    await checkedStep(context, 'project add registers copied official demo', [
      'project',
      'add',
      workspace.project,
      '--alias',
      DEMO_ALIAS,
      '--json'
    ]);

    if (options.mode === 'full') {
      await checkedStep(context, 'projects lists registered demo', ['projects', '--json']);
    }

    const startPayload = await checkedStep(context, 'start creates Launchdeck-owned demo run', [
      'start',
      DEMO_TARGET,
      '--json'
    ]);
    evidence.startedRunId = startPayload.runId ?? startPayload.data?.run?.runId;

    const duplicateResult = await runCli(
      'duplicate start returns existing demo run without spawning another process',
      ['start', DEMO_TARGET, '--json'],
      context
    );
    assertExistingRun(duplicateResult);

    const statusPayload = await checkedStep(
      context,
      'status reports isolated control plane state',
      ['status', '--all', '--json']
    );
    const statusData = statusPayload.data ?? statusPayload;
    if (statusData.summary?.ports?.conflicts !== 0 || statusData.conflicts?.length !== 0) {
      throw new Error('status classified the healthy Launchdeck-owned demo port as a conflict.');
    }
    if (statusData.projects?.some((project) => project.status === 'conflict')) {
      throw new Error('status classified the healthy Launchdeck-owned demo project as conflict.');
    }

    if (options.mode === 'full') {
      await checkedStep(context, 'ps reports managed demo process', ['ps', '--all', '--json']);
      await checkedStep(context, 'ports reports declared demo port', ['ports', '--json']);
      await checkedStep(context, 'conflicts reports demo port conflicts', ['conflicts', '--json']);
    }

    await checkedStep(context, 'inspect task explains managed demo state', [
      'inspect',
      `task:${DEMO_ALIAS}:${DEMO_TASK}`,
      '--json'
    ]);
    await checkedStep(context, 'inspect port explains demo port ownership evidence', [
      'inspect',
      `port:${DEMO_PORT}`,
      '--json'
    ]);

    if (options.mode === 'full') {
      await checkedStep(context, 'logs read demo task output', ['logs', DEMO_TARGET, '--json']);
      await checkedStep(context, 'events read demo lifecycle events', ['events', DEMO_ALIAS, '--json']);
    }

    const restartPayload = await checkedStep(context, 'restart replaces the owned demo run', [
      'restart',
      DEMO_TARGET,
      '--json'
    ]);
    evidence.restartedRunId = restartPayload.startedRun?.runId ?? restartPayload.data?.startedRun?.runId;

    await checkedStep(context, 'stop terminates only Launchdeck-owned demo run', [
      'stop',
      DEMO_TARGET,
      '--json'
    ]);
    await checkedStep(context, 'reconcile repairs only isolated demo state', [
      'reconcile',
      DEMO_ALIAS,
      '--json'
    ]);
    await checkedStep(context, 'clean removes configured safe demo artifact only', [
      'clean',
      '--safe',
      '--json'
    ], {
      cwd: workspace.project
    });

    if (options.mode === 'full') {
      await checkedStep(context, 'project remove deletes only isolated registry entry', [
        'project',
        'remove',
        DEMO_ALIAS,
        '--json'
      ]);
    }

    evidence.status = 'passed';
    return evidence;
  } catch (error) {
    evidence.status = 'failed';
    evidence.error = {
      message: error.message,
      stack: error.stack
    };
    throw Object.assign(error, { evidence });
  } finally {
    evidence.cleanup.stop = await stopDemoIfOwned(context);
    evidence.finishedAt = new Date().toISOString();
    if (options.keep) {
      evidence.cleanup.tempWorkspaceRemoved = false;
      evidence.cleanup.keepReason = '--keep was supplied';
    } else {
      try {
        fs.rmSync(workspace.root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        evidence.cleanup.tempWorkspaceRemoved = true;
      } catch (error) {
        evidence.cleanup.tempWorkspaceRemoved = false;
        evidence.cleanup.error = error.message;
      }
    }
  }
}

function printHuman(evidence) {
  console.log(`Launchdeck lifecycle smoke: ${evidence.status}`);
  console.log(`Mode: ${evidence.mode}`);
  console.log(`Platform: ${evidence.platform.processPlatform} ${evidence.platform.arch}, Node ${evidence.platform.node}`);
  console.log(`LAUNCHDECK_HOME: ${evidence.workspace.launchdeckHome}`);
  console.log('Cross-platform-ready claim: false; this is current-platform evidence only.');
  console.log('');
  for (const step of evidence.steps) {
    const expected = step.expectedFailure ? 'expected-refusal' : 'expected-success';
    console.log(`[${step.exitCode === 0 ? 'pass' : step.expectedFailure ? 'pass' : 'fail'}] ${step.step}`);
    console.log(`  ${step.command}`);
    console.log(`  exit=${step.exitCode} ${expected}`);
  }
  if (evidence.error) {
    console.log('');
    console.log(`Error: ${evidence.error.message}`);
  }
  console.log('');
  console.log(`Cleanup stop attempted: ${evidence.cleanup.stop?.attempted === true}`);
  console.log(`Temporary workspace removed: ${evidence.cleanup.tempWorkspaceRemoved === true}`);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error('Run with --help for usage.');
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  try {
    const evidence = await runSmoke(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    } else {
      printHuman(evidence);
    }
  } catch (error) {
    const evidence = error.evidence;
    if (options.json && evidence) {
      process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    } else if (evidence) {
      printHuman(evidence);
    } else {
      console.error(error.message);
    }
    process.exitCode = 1;
  }
}

await main();
