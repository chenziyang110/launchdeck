# Adoption Flow

Use this for an unknown or unconfigured local project. `adoption.inspect` remains read-only, but it requires a registered, resolved project scope; it is not a general scanner for an unregistered workspace. Configuration authoring is a separate, explicitly requested workspace edit and is never an Agent adoption operation.

The installer never authors `.launchdeck.yml`. It installs or repairs the runtime, Skill, MCP, launcher, host config, and receipt artifacts only. A project config is authored by the installed Agent authoring branch after explicit user intent and bounded project inspection.

## Select The Mode

- Read-only inspection: the user asks how the project could be managed, analyzed, onboarded, or adopted without explicitly asking to create a config. Return a proposal only.
- Explicit configuration authoring: the user asks to create, write, or generate `.launchdeck.yml` for the current/named local project, or explicitly says to configure that project for Launchdeck.

Authoring requires explicit user intent in the current request. A generic confirmation such as "yes", ordinary lifecycle wording, or an inspection-only adoption request does not authorize a filesystem write.

## Shared Discovery Sequence

1. Call `capabilities.get`, then use `project.list` to determine whether the exact target is already registered and resolvable. Do not infer resolved scope from the working directory alone.
2. Use the Agent's workspace read-only surface to check the target directory and its ancestors for supported Launchdeck config filenames. If one exists, preserve it and stop the authoring branch. Do not overwrite, merge, migrate, or repair it.
3. If `project.list` proves the target is registered/resolved and the capability is available, MCP `adoption.inspect` may inspect it with depth no greater than 4 and file count no greater than 200.
4. For an unregistered project with no supported config, use the Agent's bounded workspace read-only surface over the allowlist in `discovery-rules.md`, with the same depth/file limits and secret exclusions. Do not call MCP `adoption.inspect` for unresolved scope.
5. Do not use CLI fallback for adoption inspection: `launchdeck adoption inspect` loads an existing config before dispatch and cannot inspect the missing-config target.
6. Classify each candidate as `exact`, `strong`, `weak`, or `unknown`. Do not run a task.
7. Missing secrets or external dependencies remain reported requirements. Never synthesize secrets, tokens, credentials, database values, remote endpoints, or production settings.

## Read-Only Inspection

For a registered/resolved target, use callable MCP inspection as above. For an unregistered target, use only the bounded workspace inspection path. Return the proposed lifecycle model, confidence for every candidate, evidence paths, unresolved choices, and missing requirements. Do not write configuration, register the project, or call a lifecycle mutation. A later authoring request must independently pass the explicit authoring gates.

## Explicit Configuration Authoring

Proceed only when all of these are true:

- The user explicitly requested configuration authoring for this local project.
- Launchdeck discovery found no existing config.
- The project target is resolved; a monorepo app/service is named or otherwise unambiguous.
- At least one task candidate is `exact` or `strong` and is backed by machine-readable evidence.
- No candidate chosen for authoring depends on guessed secrets, remote/production behavior, or conflicting commands.

If any gate fails, report the proposed candidates or refusal reason and write nothing.

When every gate passes:

1. Create exactly one `.launchdeck.yml` at the resolved project root through the normal workspace file-editing surface. Do not introduce a new MCP/Kernel operation.
2. Include only `exact` or `strong` tasks. Omit uncertain fields and candidates instead of guessing.
3. From the project root, run the read-only validation command `launchdeck doctor --json --compact`.
4. Report the authored tasks, confidence and source evidence, omitted candidates/fields, validation result, and the file path.
5. Stop. Never chain registration, start, run, stop, restart, clean, or raw process control. Config creation does not authorize any lifecycle mutation.

If this flow is exercised by a deterministic fixture, label it as a deterministic installed-Agent fixture and not as an LLM or interactive host. The fixture may prove the authoring algorithm, installed Skill consumption, project evidence reads, MCP `capabilities.get` call, and resulting config hash. It does not prove real host approval, trust, reload, OS behavior, or interactive Agent reasoning.

If validation fails, report the exact finding and leave the single new file as a reviewable workspace change. Do not retry by registering, running, or rewriting an older/pre-existing config.

## Minimal Config Contract

Author valid v1 YAML using these conservative rules:

- `version`: always `1`.
- `project.name`: optional; use an explicit package/project name or the resolved root directory name, never prose or a secret-bearing value.
- `tasks`: include at least one `exact` or `strong` task with a stable, descriptive key.
- `command`: use a declared manifest/task-file wrapper such as a package script, Make/Just/Taskfile target, Compose service, or corroborated framework entrypoint. Never copy a raw command from the user prompt or README prose alone.
- `description`: state what the declared task does without claiming unsupported behavior.
- `cwd`: omit when the project root is correct; otherwise use a normalized project-relative directory proven by the selected manifest. Never escape the project root.
- `longRunning`: set `true` only for a clearly declared server, watcher, or service; otherwise omit it.
- `ports`: include only unique numeric ports explicitly declared in bounded evidence. Omit conventional defaults that were not declared.
- `risk`: default inferred tasks to `medium`; use `low` only when concrete evidence proves the declared command is local, bounded, and non-destructive. Never lower risk from the task name alone.
- `log`: for an authored long-running task, use the project-local `.launchdeck/logs/<task>.log` path.
- `env`: omit by default. Include only explicitly declared non-sensitive literals; never read a secret file or create placeholder secret values.
- `clean.safe`: optional; include only project-local cache/build-output paths corroborated by the selected tooling. Omit dependency directories, databases, uploads, Docker state, broad globs, and any uncertain target.

Do not add unsupported schema keys. Prefer the smallest valid config over a broad speculative task catalog.

## Ecosystem Mapping

- Node: map selected `package.json` scripts through the lockfile-backed package-manager wrapper. A framework config can strengthen `dev`/`start`, `longRunning`, cache, and declared-port evidence.
- Python: prefer explicit `pyproject.toml` scripts, task-file targets, or a framework entrypoint corroborated by dependency/config evidence. A requirements file alone is insufficient.
- Docker Compose: map an unambiguous named service through `docker compose`; preserve declared ports and treat multi-service choices as ambiguous unless the user selected one.
- Make, Just, and Taskfile: call only the exact declared target/recipe/task through its standard wrapper; do not inline its shell body.

## What Not To Do

- Do not start a dev server while discovering or after writing config.
- Do not overwrite or repair any existing Launchdeck config in this flow.
- Do not register the project as an authoring side effect.
- Do not turn inspection output, host approval, or generic confirmation into authoring authority.
- Do not write config from README prose alone when manifests/task files conflict.
- Do not invent a process manager, registry, secret, raw lifecycle command, or remote target.
