# Discovery Rules

Discovery is read-only evidence collection for an unknown local project. It may inform a separate explicit config-authoring step, but it never writes by itself. Prefer machine-readable files over prose.

## Confidence Labels

- `exact`: a single machine-readable task file or manifest contains an unambiguous declared lifecycle command matching the requested local target.
- `strong`: one clear lifecycle candidate is supported by multiple signals, such as manifest script plus framework config or declared port.
- `weak`: a plausible command exists but is generic, inferred from README prose, or missing port/task metadata.
- `unknown`: no plausible candidate, conflicting candidates, missing required tooling, or lifecycle depends on secrets/services not present.

Only `exact` or `strong` candidates may be authored, and only when the user explicitly requested config creation and Launchdeck discovery found no existing config. `weak`, `unknown`, and conflicting candidates remain proposal-only and produce no write.

An existing supported Launchdeck config at the exact target is not a missing-config authoring candidate. Preserve it even when it is invalid or stale. An ancestor-only config triggers the explicit monorepo choice: either an independent child config or one workspace task with a project-relative child `cwd`; neither path may overwrite the ancestor.

## Evidence Priority

1. Existing `.launchdeck.yml`.
2. Launchdeck registry/runtime evidence.
3. Manifests and task files.
4. Framework config and declared ports.
5. README/package prose as supporting evidence only.

## Bounded Read Set

Use a bounded allowlist no greater than depth 4 and 200 files. For a registered/resolved target, pass those limits to callable MCP `adoption.inspect`. For an unregistered missing-config target, enforce the same limits through the Agent's workspace read-only surface and do not call MCP or CLI adoption inspection. Inspect only the applicable manifests, task files, framework config, declared source entrypoints, and supporting README sections named below. Skip generated/vendor directories such as `.git`, `.launchdeck`, `node_modules`, virtual environments, build outputs, and caches.

Do not read secret-bearing files such as `.env`, credential stores, private keys, tokens, or local production overrides. A checked-in example may establish that a variable is required, but never copy or invent its value.

## Ecosystem Signals

- Node: use `package.json` scripts such as `dev`, `start`, `build`, `test`, `lint`, and `typecheck`; use a matching lockfile only to select the package-manager wrapper. Framework files for Vite, Next.js, Astro, Remix, or similar may strengthen a script and supply an explicitly declared port, but a lockfile alone is not lifecycle evidence.
- Python: prefer explicit `pyproject.toml` scripts, framework entrypoints, or task-file commands. `setup.cfg`, `requirements.txt`, `uv.lock`, and `Pipfile` identify dependencies/tooling but do not by themselves authorize a guessed lifecycle command; `manage.py` or an application module needs corroborating framework evidence.
- Docker Compose: use `compose.yml`, `compose.yaml`, `docker-compose.yml`, or `docker-compose.yaml` services and explicitly exposed ports. Multiple plausible services are ambiguous unless the user named one.
- Make: use exact `Makefile` targets such as `dev`, `start`, `run`, `build`, `test`, or `lint` through their `make <target>` wrapper.
- Just: use exact `justfile` or `Justfile` lifecycle recipes through their `just <recipe>` wrapper.
- Taskfile: use exact `Taskfile.yml`, `Taskfile.yaml`, or `Taskfile.dist.yml` lifecycle tasks through their `task <task>` wrapper.

## Conflict Handling

- If two candidates can both satisfy the same lifecycle request, downgrade to `weak` and ask which target to adopt.
- If a declared port is already occupied, route to `recovery-playbooks.md` before start.
- If the project is a monorepo with multiple apps, propose the detected candidates and ask for the target unless the user already named one.
- Classify an authored task as `low` only with a fixed project-internal `cwd`, a declared local development server or build tool, no remote or production target, no sensitive `env`, and no destructive command or raw shell chain. Otherwise classify it as `medium`, state that the Agent cannot execute it, and do not disguise risk through the task name.
- Corroborated localhost Flask and Vite development tasks can be `low`; remote binds, deployment targets, shell chains, or secret-bearing environments remain `medium`.
- If a port is conventional but not explicitly declared in bounded evidence, omit it rather than guessing.
- If `doctor` fails after an explicit authoring write, report the failing evidence and do not register or run any task.
