# Technical Options

## Selected Direction

Use a shared Application Kernel with thin CLI and MCP adapters. Package the existing canonical Skill and a prebuilt local stdio MCP runtime into separately generated Codex and Claude Plugins.

The Kernel owns an Operation Registry, project resolver, policy/risk engine, ownership proof, locks, confirmation verifier, operation journal, control-plane state, and a normalized Agent Operation Result. The CLI maps this result to its backward-compatible `schemaVersion: 1` envelope. MCP maps it to typed `structuredContent` and tool results.

Outcome status and resource lifecycle status must be separate. Normalized operation outcomes are `succeeded`, `refused`, `failed`, `partial`, or `indeterminate`; run/resource status remains `starting`, `running`, `ready`, `stopping`, `stopped`, `stale`, or another resource-specific value.

## Rejected Alternatives

- Permanent MCP-by-spawning-CLI architecture: acceptable only as a bounded validation bridge because it introduces PATH, version, timeout, exit-code, stdout, and retry ambiguity.
- CLI calling MCP: rejected because it weakens the daemonless independent CLI and makes a protocol server a mandatory local dependency.
- Separate safety and lifecycle logic per Skill/MCP/Plugin: rejected because behavior and state would drift.
- One universal host manifest: rejected because Codex and Claude manifest, namespace, path-variable, marketplace, and verification contracts differ.
- Remote MCP first: rejected because the product controls local files, processes, ports, and user-scoped state.
- Broad MCP parity with every CLI command: rejected because public Agent tools require a narrower safety surface.

## Packaging Direction

- One npm runtime exposes `launchdeck` and `launchdeck-mcp` and ships schemas plus the canonical Skill.
- Codex and Claude Plugins are distinct generated artifacts from one compatibility manifest.
- Plugins carry a single-file ESM MCP bundle and do not rely on global CLI, `npx`, install scripts, or lifecycle scripts.
- Node.js 20+ remains the first-release prerequisite; native binaries are deferred.
- Plugin data directories contain only Plugin cache/installation metadata, never authoritative Launchdeck state.

## Recovery Direction

Every mutation receives an operation ID and journal record. Resource-identifiable operations recover through current control-plane and OS evidence. Operations whose side effects cannot be proven, especially arbitrary configured foreground tasks, return `indeterminate` and are not automatically retried.

Plan digests protect preview-to-execution integrity but are not confirmation proofs. MCP tool inputs must not expose fields a model can use to claim human approval.

