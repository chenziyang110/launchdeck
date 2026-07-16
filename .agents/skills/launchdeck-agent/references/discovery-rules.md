# Discovery Rules

Discovery is read-only evidence collection for an unknown local project. Prefer machine-readable files over prose.

## Confidence Labels

- `exact`: an existing `.launchdeck.yml` names the requested task, or a single task file/manifest contains an unambiguous lifecycle command matching the user request.
- `strong`: one clear lifecycle candidate is supported by multiple signals, such as manifest script plus framework config or declared port.
- `weak`: a plausible command exists but is generic, inferred from README prose, or missing port/task metadata.
- `unknown`: no plausible candidate, conflicting candidates, missing required tooling, or lifecycle depends on secrets/services not present.

Only `exact` or `strong` can justify writing or repairing `.launchdeck.yml` without another confirmation. Treat `weak`, `unknown`, and conflicts as proposal-only.

## Evidence Priority

1. Existing `.launchdeck.yml`.
2. Launchdeck registry/runtime evidence.
3. Manifests and task files.
4. Framework config and declared ports.
5. README/package prose as supporting evidence only.

## Ecosystem Signals

- Node: `package.json` scripts such as `dev`, `start`, `build`, `test`, `lint`, `typecheck`; framework files for Vite, Next.js, Astro, Remix, or similar; lockfiles only identify package manager, not lifecycle intent.
- Python: `pyproject.toml`, `setup.cfg`, `requirements.txt`, `uv.lock`, `Pipfile`, `manage.py`, `app.py`; prefer explicit scripts or framework entrypoints over guessing.
- Docker Compose: `compose.yml`, `compose.yaml`, `docker-compose.yml`, `docker-compose.yaml`; use services and exposed ports as evidence, but do not start before adoption.
- Make: `Makefile` targets such as `dev`, `start`, `run`, `build`, `test`, `lint`.
- Just: `justfile` or `Justfile` recipes with lifecycle names.
- Taskfile: `Taskfile.yml`, `Taskfile.yaml`, or `Taskfile.dist.yml` tasks with lifecycle names.

## Conflict Handling

- If two candidates can both satisfy the same lifecycle request, downgrade to `weak` and ask which target to adopt.
- If a declared port is already occupied, route to `recovery-playbooks.md` before start.
- If the project is a monorepo with multiple apps, propose the detected candidates and ask for the target unless the user already named one.
- If `doctor` fails, report the failing evidence and do not start a long-running command.
