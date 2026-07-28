import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { runTestSuite } from '../scripts/run-tests.js';

const isolationKeys = [
  'LAUNCHDECK_HOME',
  'HOME',
  'USERPROFILE',
  'LOCALAPPDATA',
  'XDG_STATE_HOME'
];

test('runs the test child with a suite-owned isolated environment and cleans it afterward', () => {
  let suiteRoot;
  const status = runTestSuite({
    files: [path.resolve('test', 'sentinel.test.js')],
    env: {
      ...process.env,
      home: path.resolve('outside-suite-home'),
      launchdeck_home: path.resolve('outside-suite-launchdeck-home')
    },
    spawn(command, args, options) {
      assert.equal(command, process.execPath);
      assert.deepEqual(args.slice(0, 2), ['--test', '--test-concurrency=1']);
      assert.equal(options.cwd, path.resolve('.'));
      assert.equal(readEnv(options.env, 'PATH'), process.env.PATH);

      suiteRoot = path.dirname(options.env.LAUNCHDECK_HOME);
      assert.equal(fs.existsSync(suiteRoot), true);
      for (const key of isolationKeys) {
        assert.equal(isWithin(suiteRoot, options.env[key]), true, `${key} must be isolated`);
        assert.equal(
          Object.keys(options.env).filter((candidate) => candidate.toUpperCase() === key).length,
          1,
          `${key} must not retain a differently-cased parent alias`
        );
      }

      fs.mkdirSync(options.env.LAUNCHDECK_HOME, { recursive: true });
      fs.writeFileSync(path.join(options.env.LAUNCHDECK_HOME, 'child-marker'), 'isolated');
      return { status: 0 };
    }
  });

  assert.equal(status, 0);
  assert.equal(fs.existsSync(suiteRoot), false);
});

test('cleans the suite-owned root when the test child cannot start', () => {
  let suiteRoot;
  const childError = new Error('synthetic spawn failure');

  assert.throws(
    () => runTestSuite({
      files: [path.resolve('test', 'sentinel.test.js')],
      spawn(_command, _args, options) {
        suiteRoot = path.dirname(options.env.LAUNCHDECK_HOME);
        return { error: childError, status: null };
      }
    }),
    childError
  );

  assert.equal(fs.existsSync(suiteRoot), false);
});

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function readEnv(env, name) {
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name);
  return key ? env[key] : undefined;
}
