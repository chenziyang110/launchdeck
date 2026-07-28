# Entrypoint Discovery

Select exactly one Launchdeck entrypoint before making an operation call. Use this deterministic order and stop at the first usable candidate:

1. An available Launchdeck MCP whose initialize and `capabilities.get` response proves its build identity and requested scope.
2. A globally installed `launchdeck` executable found on the host PATH.
3. The current project's `node_modules/.bin/launchdeck` executable (`launchdeck.cmd` on Windows).
4. Only inside a Launchdeck source checkout, the checkout's `src/cli.js`, invoked with the current Node executable. Prove the checkout from its package identity and canonical Skill source; never use another project's coincidental `src/cli.js`.
5. Launchdeck is not installed. Stop and report that state with `npm install --global github:chenziyang110/launchdeck#<tag>`; do not guess an executable or use `npx` network resolution as discovery.

For a CLI candidate, run its exact invocation with `capabilities --json --compact`. Accept it only when the response is compatible and its provenance/build identity agrees with installer `agent paths`, `agent status`, or `agent doctor` evidence when that evidence is available. Record the exact command, fixed prefix arguments, build identity, and scope. After the successful handshake, reuse the same entrypoint for every later call in the request.

## Read-only CLI fallback

When MCP is unavailable before any dispatch, the pinned CLI may perform only bounded, side-effect-free discovery before lifecycle routing:

- `launchdeck capabilities --json --compact` for the operation and compatibility catalog.
- `launchdeck projects --json --compact` for project list discovery.
- `launchdeck doctor --json --compact` from the target directory for existing config discovery, plus the Agent's bounded workspace reads for supported config filenames.

These spellings are conceptual: preserve the pinned executable or Node-plus-script prefix instead of replacing it with bare `launchdeck` when the selected candidate is project-local or source-checkout based. Config discovery is read-only and does not authorize config creation, registration, or lifecycle mutation.

If lifecycle mutation is later authorized, observe and dispatch once through the same pinned CLI entrypoint. After a mutation may have been dispatched, never switch or fall back to another entrypoint or surface. Preserve effect certainty and recover by the operation ID or the bounded correlation procedure.
