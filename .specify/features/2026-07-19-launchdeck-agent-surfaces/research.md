# Research: Agent Surfaces, MCP Runtime, and Host Packaging

**Date**: 2026-07-20  
**Status**: Complete for planning; host and OS readiness remain claim-gated  
**Source lane**: `planning/handoffs/research-host-runtime.json`

## Standard Stack

| Concern | Decision | Planning consequence |
| --- | --- | --- |
| MCP protocol | Pin `@modelcontextprotocol/sdk` v1.x, initially the evidenced `1.29.0` release | Use the SDK for initialization, framing, dispatch, cancellation-compatible behavior, and protocol errors; review v2 separately when it is production-ready. |
| Boundary validation | Pin an SDK-compatible Zod version exactly | Tool input validation is generated/validated from the canonical operation catalog; no adapter-specific permissive schema. |
| Runtime | JavaScript ESM on Node.js `>=20` | The Plugin prerequisite is Node 20+, not a native or zero-runtime-dependency claim. |
| Bundle | esbuild, `bundle=true`, `platform=node`, `format=esm`, `target=node20`, `splitting=false` | Emit one prebuilt `launchdeck-mcp.mjs`; reject any external npm import in the metafile. Node built-ins may remain external. |
| Compatibility | `node-semver`, pinned and bundled | Evaluate package, protocol, state, catalog, Skill, and host-format axes independently. |
| Integrity | `node:crypto` SHA-256 | Compute deterministic component digests and a non-self-referential build identity; integrity is drift evidence, not publisher authenticity. |
| Contract format | JSON Schema 2020-12 | Reuse the repository's existing schema dialect for operation, result, and compatibility contracts. |

## Architecture Decisions

1. MCP is a thin local stdio adapter over the same Application Kernel used by CLI. It does not shell out to CLI as its primary implementation and does not own a second registry, journal, policy engine, or lifecycle service.
2. Build one host-neutral runtime bundle and generate two relocatable Plugin artifacts from one compatibility manifest and build identity. Codex and Claude metadata/path rendering remain separate.
3. Codex's candidate launch shape is `node` plus an artifact-relative runtime argument with a relative `cwd` rebased by the host to the Plugin root. This remains a real-host verification item.
4. Claude's launch shape is `node ${CLAUDE_PLUGIN_ROOT}/runtime/launchdeck-mcp.mjs`. Shared Launchdeck state must never live under the Plugin root or `CLAUDE_PLUGIN_DATA`.
5. Plugin/cache paths identify executable code only. Project targeting comes from explicit project identity and registered Launchdeck state, never `process.cwd()` or the Plugin install directory.
6. Host or MCP process exit owns only protocol lifetime. Managed tasks and `LAUNCHDECK_HOME` state survive exit, update, disable, and uninstall.
7. `capabilities.get` and diagnosis expose actual runtime path, `process.execPath`, Node/runtime version, host, state home, build identity, independent version axes, component digests, supported operations, and the exact evidence scope. Incompatible writes fail closed.

## Artifact Shapes

```text
Codex artifact/                     Claude artifact/
├── .codex-plugin/plugin.json       ├── .claude-plugin/plugin.json
├── .mcp.json                       ├── .mcp.json
├── skills/launchdeck-agent/        ├── skills/launchdeck-agent/
├── runtime/launchdeck-mcp.mjs      ├── runtime/launchdeck-mcp.mjs
├── compatibility.json              ├── compatibility.json
└── artifact-integrity.json         └── artifact-integrity.json
```

Both artifacts contain byte-identical canonical Skill content and runtime bundle for one build identity. Host manifests contain identity, display metadata, Node prerequisite, relative component paths, and host presentation only. They may not duplicate operations, risk policy, ownership rules, state paths, journal behavior, fallback rules, or clean/adoption authorization.

## Build Identity and Integrity

The canonical identity payload contains a schema version; package/runtime/MCP SDK/Agent/CLI/config/registry/run-index/journal/catalog/Skill versions; the sorted source and component digests; and the dependency-lock digest. SHA-256 over canonical JSON produces the build identity.

Each host artifact ships an integrity sidecar containing the build identity and sorted hashes for every shipped file except the sidecar itself. `compatibility.json` does not hash itself. A component mismatch permits only safely decodable capabilities, diagnosis, and bounded recovery reads; it blocks mutation.

## Don't Hand-Roll

- MCP/JSON-RPC framing, initialization, and protocol errors: use the official SDK.
- SemVer parsing and range intersection: use `node-semver`.
- SHA-256: use `node:crypto`.
- Host root substitution: use each host's documented mechanism and verify it in the real host.
- Bundle graph discovery: use esbuild's metafile plus isolated artifact execution.
- Publisher authenticity: do not mislabel checksums as signatures; specify a standard signing/provenance feature separately if required.

## Common Pitfalls and Containment

| Pitfall | Containment |
| --- | --- |
| Banner, warning, `console.log`, or child output corrupts stdout | Protocol frames are the only stdout writes; diagnostics use stderr and task output uses bounded Launchdeck logs/events. Static scans and real stdio parsing gate release. |
| Plugin cache cwd becomes the project | Launch from unrelated paths and require explicit, configured project resolution. |
| Claude variables leak into Codex or vice versa | Separate renderers, manifest golden tests, and independent real-host smokes. |
| Bundled runtime still needs `node_modules`, `npx`, or global CLI | Reject external npm imports, inspect archive inventory, and launch in an isolated directory without those dependencies. |
| One passing host/OS implies universal readiness | Record exact host/version/OS/scope/Node/build/scenario cells; never roll up missing cells. |
| Plugin update keeps an old MCP process alive | Verify old/new compatible coexistence, reload/restart behavior, shared-state access, and write-fail-closed mismatch. |
| Multiple discoverable Skill copies drift | Compare canonical content-manifest digests; report identical duplicates and preserve divergent copies without automatic overwrite/delete. |

## SU-002 Verification Ownership

SU-002 is resolved as a planning question but remains open as a readiness gate. Required work is:

1. Isolated bundle proof on Windows, macOS, and Linux, including paths with spaces/non-ASCII characters, no Plugin-local `node_modules`, no global Launchdeck/npx, real MCP lifecycle calls, stdout purity, restart/concurrency, inventory and tamper checks.
2. One real Codex cell per claimed OS and installation scope: cached installation, Skill/MCP discovery, relative path resolution, explicit project scope, read/mutate/refusal behavior, update/disable/uninstall, state/service survival, and CLI takeover.
3. One real Claude Code cell per claimed OS and installation scope: `claude plugin validate`, cached install, `${CLAUDE_PLUGIN_ROOT}` expansion, explicit project scope, mid-session update behavior, disable/uninstall, and CLI takeover.
4. Negative runtime evidence for missing/old Node, tampered runtime/Skill/schema/manifest, incompatible version axes, and injected stdout contamination.

No generator snapshot, direct handler test, or current CLI smoke substitutes for isolated bundle or real-host evidence.

## Open Assumptions

- Codex relative `cwd` rebasing and wrapped MCP configuration must pass real-host verification before a Codex-ready claim.
- Claude root-variable expansion must pass paths-with-spaces and non-ASCII cases on every claimed OS.
- The final Kernel graph must actually bundle to one ESM file with no runtime package assets.
- A supported Node executable must be resolvable in each claimed host environment.
- Plugin lifecycle separation and compatible old/new runtime coexistence must be proven, not inferred.

## Primary Sources

- MCP transports: <https://modelcontextprotocol.io/specification/2025-11-25/basic/transports>
- MCP lifecycle: <https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle>
- MCP tools: <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>
- MCP TypeScript SDK v1.x: <https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x>
- Codex Plugins: <https://learn.chatgpt.com/docs/build-plugins>
- Codex Skills: <https://learn.chatgpt.com/docs/build-skills>
- Codex Plugin MCP path implementation evidence: <https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/plugin_config.rs>
- Claude Code Plugins: <https://code.claude.com/docs/en/plugins-reference>
- Claude Code MCP: <https://code.claude.com/docs/en/mcp>
- esbuild API: <https://esbuild.github.io/api/>
- Node.js crypto: <https://nodejs.org/docs/latest-v20.x/api/crypto.html#cryptocreatehashalgorithm-options>
- node-semver: <https://github.com/npm/node-semver>
