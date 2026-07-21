# Plugin Generation Contract

## One Source, Two Artifacts

`scripts/build-agent-plugins.js` consumes one compatibility manifest, one validated Operation Registry/schema set, one canonical `.agents/skills/launchdeck-agent` tree, one prebuilt stdio runtime, and host-specific metadata templates. It emits separate Codex and Claude artifacts for one build identity.

The build runs once per identity, emits deterministic trees/archives, rejects absolute build-machine paths, re-hashes every emitted component, and records an integrity sidecar. Generated host manifests may carry only identity/version, display metadata, Node `>=20` prerequisite, relative component paths, host-declared presentation/capability metadata, and a compatibility/build reference.

Host manifests may not define or override operations, risk thresholds, ownership, state/journal paths, retry/fallback, clean/adoption authorization, or managed-task lifetime.

## Runtime Bundle

The runtime is a single Node 20 ESM file built with esbuild. The build fails if its metafile reports an external npm import. Shipped artifacts require no global Launchdeck CLI, `npx`, install/postinstall script, Plugin-local `node_modules`, native executable, or remote transport.

Codex renders its own `.codex-plugin/plugin.json` and `.mcp.json` candidate launch path. Claude renders `.claude-plugin/plugin.json` and a `${CLAUDE_PLUGIN_ROOT}`-rooted MCP argument. The two path strategies are never copied across hosts.

## Canonical Skill

Both artifacts receive generated copies of the canonical Skill plus references and a content-manifest digest. The generator rejects symlinks and path traversal. User/project/Plugin copies remain separately observable.

Codex installation/doctor checks `$HOME/.agents/skills/launchdeck-agent`, legacy `~/.codex/skills/launchdeck-agent`, project copies, and Plugin copies. Identical duplicates are reported with deterministic current-location preference and optional user cleanup guidance. Divergent content is preserved, no winner is silently selected, and automatic install/update cannot overwrite or delete it.

## State and Lifetime

Generated Plugin roots are immutable relocatable code packages, never `LAUNCHDECK_HOME` and never project roots. Install, enable, host exit, update, disable, and uninstall affect Plugin/runtime presence only. They do not stop managed tasks, migrate/delete registry or journal state, prune logs/events, edit project configuration, or claim ownership of existing processes.

A compatible newer Plugin and standalone CLI must observe the same state home, run ID, PID, port, and ownership evidence and safely control an older run. An incompatible component may diagnose where safe but fails writes closed.

## Build Identity

The compatibility manifest keeps package, Agent protocol, CLI schema, config, registry, runtime, run-index, lock, event, journal, catalog, Skill, bundle format, and per-host manifest versions independent. Component digests bind runtime, catalog, schemas, canonical Skill, compatibility model, and generated host metadata.

The identity sidecar hashes all shipped files except itself. Checksums establish byte identity/drift only, not publisher authenticity.

## Generation vs Readiness

Generation tests prove deterministic contents, correct schemas/manifests, copied Skill digest, bundle identity, archive inventory, no external package dependency, and no policy-bearing host fields. Bundle-isolation tests prove Node launch and real MCP wire behavior. Real-host tests prove discovery, cached path resolution, project scope, lifecycle, update/disable/uninstall, and takeover.

No generated manifest, snapshot, direct handler test, or existing CLI smoke establishes host readiness. Readiness is recorded only for exact passing Codex/Claude version, OS/architecture, installation scope, Node version, build identity, and scenario cells.
