import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { resolveCleanTargets } from '../src/runtime.js';
import { createCliFixture } from './helpers/cli-fixture.js';

function withFixture(fn) {
  const fixture = createCliFixture();
  try {
    return fn(fixture);
  } finally {
    fixture.cleanup();
  }
}

test('rejects unsupported config versions with unsupported_config_version', () => {
  withFixture((fixture) => {
    fixture.writeConfig({
      version: 2,
      tasks: {
        build: { command: 'npm run build' }
      }
    });

    assert.throws(
      () => loadConfig(fixture.projectRoot),
      (error) => error.code === 'unsupported_config_version'
    );
  });
});

test('rejects configs that omit the required version field', () => {
  withFixture((fixture) => {
    fixture.writeConfig({
      tasks: {
        build: { command: 'npm run build' }
      }
    });

    assert.throws(
      () => loadConfig(fixture.projectRoot),
      (error) => error.code === 'config_invalid'
    );
  });
});

test('derives deterministic project root and config path from the discovered config', () => {
  withFixture((fixture) => {
    const childDir = fixture.path('packages', 'web', 'src');
    fs.mkdirSync(childDir, { recursive: true });
    fixture.writeConfig({
      version: 1,
      tasks: {
        build: { command: 'npm run build' }
      }
    });

    const config = loadConfig(childDir);

    assert.equal(config.projectRoot, fixture.projectRoot);
    assert.equal(config.configPath, fixture.path('.launchdeck.yml'));
    assert.equal(config.project.name, path.basename(fixture.projectRoot));
  });
});

test('rejects task cwd paths that escape the project root', () => {
  withFixture((fixture) => {
    fixture.writeConfig({
      version: 1,
      tasks: {
        build: {
          command: 'npm run build',
          cwd: '../outside'
        }
      }
    });

    assert.throws(
      () => loadConfig(fixture.projectRoot),
      (error) => error.code === 'project_root_escape'
    );
  });
});

test('rejects task log paths that escape the project root', () => {
  withFixture((fixture) => {
    fixture.writeConfig({
      version: 1,
      tasks: {
        dev: {
          command: 'npm run dev',
          longRunning: true,
          log: '../outside/dev.log'
        }
      }
    });

    assert.throws(
      () => loadConfig(fixture.projectRoot),
      (error) => error.code === 'project_root_escape'
    );
  });
});

test('derives command task type when longRunning is false', () => {
  withFixture((fixture) => {
    fixture.writeConfig({
      version: 1,
      tasks: {
        build: {
          command: 'npm run build',
          longRunning: false
        }
      }
    });

    const config = loadConfig(fixture.projectRoot);

    assert.equal(config.tasks.build.type, 'command');
  });
});

test('derives managed task type when longRunning is true', () => {
  withFixture((fixture) => {
    fixture.writeConfig({
      version: 1,
      tasks: {
        dev: {
          command: 'npm run dev',
          longRunning: true
        }
      }
    });

    const config = loadConfig(fixture.projectRoot);

    assert.equal(config.tasks.dev.type, 'managed');
  });
});

test('defaults task risk metadata to medium', () => {
  withFixture((fixture) => {
    fixture.writeConfig({
      version: 1,
      tasks: {
        build: { command: 'npm run build' }
      }
    });

    const config = loadConfig(fixture.projectRoot);

    assert.equal(config.tasks.build.risk, 'medium');
  });
});

test('normalizes clean target lists as raw runtime-planning metadata', () => {
  withFixture((fixture) => {
    fixture.mkdir('dist');
    const absoluteTarget = fixture.path('absolute-cache');
    fixture.writeConfig({
      version: 1,
      tasks: {
        build: { command: 'npm run build' }
      },
      clean: {
        safe: ['dist', absoluteTarget],
        risky: [
          {
            path: 'node_modules',
            description: 'dependency cache'
          }
        ]
      }
    });

    const config = loadConfig(fixture.projectRoot);

    assert.deepEqual(config.clean.safe, [
      {
        kind: 'safe',
        rawPath: 'dist'
      },
      {
        kind: 'safe',
        rawPath: absoluteTarget
      }
    ]);
    assert.deepEqual(config.clean.risky, [
      {
        kind: 'risky',
        rawPath: 'node_modules',
        description: 'dependency cache'
      }
    ]);

    for (const target of [...config.clean.safe, ...config.clean.risky]) {
      assert.equal('resolvedPath' in target, false);
      assert.equal('canonicalPath' in target, false);
      assert.equal('exists' in target, false);
      assert.equal('status' in target, false);
      assert.equal('refusalCode' in target, false);
    }
  });
});

test('preserves project-root clean targets for runtime refusal planning', () => {
  withFixture((fixture) => {
    fixture.writeConfig({
      version: 1,
      tasks: {
        build: { command: 'npm run build' }
      },
      clean: {
        safe: ['.']
      }
    });

    const config = loadConfig(fixture.projectRoot);
    const plan = resolveCleanTargets(config.projectRoot, config.clean, 'safe');

    assert.deepEqual(config.clean.safe, [
      {
        kind: 'safe',
        rawPath: '.'
      }
    ]);
    assert.equal(plan[0].status, 'refused');
    assert.equal(plan[0].refusalCode, 'clean_target_root');
  });
});

test('preserves out-of-root clean targets for runtime refusal planning', () => {
  withFixture((fixture) => {
    fixture.writeConfig({
      version: 1,
      tasks: {
        build: { command: 'npm run build' }
      },
      clean: {
        safe: ['..']
      }
    });

    const config = loadConfig(fixture.projectRoot);
    const plan = resolveCleanTargets(config.projectRoot, config.clean, 'safe');

    assert.deepEqual(config.clean.safe, [
      {
        kind: 'safe',
        rawPath: '..'
      }
    ]);
    assert.equal(plan[0].status, 'refused');
    assert.equal(plan[0].refusalCode, 'clean_target_outside_project');
  });
});
