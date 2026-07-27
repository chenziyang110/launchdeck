import { main } from '../../../src/cli.js';
import {
  BUILD_IDENTITY,
  createSyntheticLifecycleService
} from './setup-fixture.js';

const request = JSON.parse(Buffer.from(process.argv[2] ?? '', 'base64url').toString('utf8'));
const stdout = [];
const stderr = [];
const io = {
  columns: 120,
  isTTY: false,
  noColor: true,
  stdout: { write: (value) => stdout.push(String(value)) },
  stderr: { write: (value) => stderr.push(String(value)) }
};

const service = createSyntheticLifecycleService({
  projectRoot: request.projectRoot,
  homeDir: request.homeDir
});
const status = await main(request.argv, io, {
  agentLifecycleService: service,
  cwd: request.projectRoot,
  entrypoint: request.entrypoint,
  env: {
    LAUNCHDECK_HOME: request.homeDir
  },
  packageBuildIdentity: BUILD_IDENTITY
});

process.stdout.write(`${JSON.stringify({
  status,
  stdout: stdout.join(''),
  stderr: stderr.join(''),
  entrypoint: request.entrypoint,
  argv: request.argv
})}\n`);
