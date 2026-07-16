# Launchdeck Hands-On Demo

This example is a dependency-free project you can run offline with Node.js 20 or newer. It shows foreground tasks, managed tasks, JSON output, logs, and cleanup planning from a real `.launchdeck.yml`.

Run every command from this directory:

```sh
cd examples/hands-on-demo
```

## Inspect the Project

```sh
node ../../src/cli.js doctor --json
node ../../src/cli.js tasks --json
```

`doctor --json` validates the config and cleanup targets. `tasks --json` lists `build` and `fail` as foreground tasks, and `dev` as a managed task.

## Run Foreground Tasks

```sh
node ../../src/cli.js run build --json
```

The build task writes a small generated file under `dist/`.

```sh
node ../../src/cli.js run fail --json
```

The fail task intentionally exits with status `7`. Launchdeck returns a JSON failure envelope with `error.code` set to `task_command_failed`, while preserving the child exit code for automation.

## Manage a Long-Running Task

```sh
node ../../src/cli.js start dev --json
node ../../src/cli.js ps --json
node ../../src/cli.js logs dev --json
node ../../src/cli.js stop dev --json
```

The `dev` task is managed by Launchdeck. Its process state is stored under `.launchdeck/runtime/`, and its log is written to `.launchdeck/logs/dev.log`.

## Clean Generated Files

```sh
node ../../src/cli.js clean --json
node ../../src/cli.js clean --safe --json
node ../../src/cli.js clean --all --json
```

`clean --json` is a dry run and does not remove files. `clean --safe --json` removes only safe demo-generated targets such as `dist/` and `.launchdeck/`. `clean --all --json` returns `confirmation_required` unless you explicitly add `--yes`.
