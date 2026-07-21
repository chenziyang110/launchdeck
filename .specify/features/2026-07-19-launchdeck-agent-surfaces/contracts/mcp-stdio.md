# MCP stdio Contract

## Boundary

The first release exposes local stdio only. `src/mcp/stdio-server.js` adapts MCP frames and the 18 public `OperationDefinition` entries to the shared Application Kernel. It does not shell out to CLI, own policy, infer project scope from Plugin cwd, or maintain Plugin-local state.

## Public Tool Set

`capabilities.get`, `system.diagnose`, `project.list`, `project.inspect`, `adoption.inspect`, `task.list`, `task.status`, `task.logs.read`, `task.events.read`, `task.start`, `task.stop`, `task.restart`, `task.run`, `operation.list`, `operation.get`, `operation.reconcile`, `clean.plan`, and `clean.applySafe`.

Deferred/dropped CLI capabilities do not appear in `tools/list`, `capabilities.agentOperations`, Skill routing, or Plugin manifests. This includes adoption apply, medium/high/destructive execution, force-stop, project removal, risky clean/reset, raw shell/env/cwd/force, external termination, permanent follow, and remote/production control.

## Initialization and Framing

- Use the official MCP SDK v1.x lifecycle and `StdioServerTransport`.
- `initialize` and the initialized notification precede tool traffic.
- stdout contains serialized MCP protocol frames only. A single writer serializes responses by JSON-RPC ID.
- stderr contains bounded, redacted diagnostics only. Child process output and Launchdeck observations use the existing log/event authorities.
- Requests may complete out of order by JSON-RPC ID. Kernel locks serialize conflicting mutation effects.
- Host disconnect shuts down only the adapter process; managed-task lifetime is independent.

## Tool Schemas and Context

Tool schemas are projected from the Operation Registry and validated against `agent-operations.schema.json`. Every object is closed. Model/tool input can contain only declared project/task refs, operation IDs, plan digests, cursors, limits, time windows, and bounded operation-specific enums.

Runtime path, state home, build identity, host workspace roots, adapter-attested project root, risk, ownership, approval, and compatibility evidence come from trusted adapter/Kernel context, never tool input. Missing, ambiguous, conflicting, unregistered, or out-of-scope project context produces typed refusal. Plugin installation cwd is ignored.

## Result and Error Mapping

- Successful `tools/call` returns `structuredContent` equal to one valid `AgentOperationResult`; optional text content is one concise derived summary, not a second JSON contract.
- Malformed framing/method/request IDs are protocol errors and never enter the Kernel.
- Unknown tools or schema-invalid arguments are tool errors with `isError=true`, a normalized refused result, `req_` correlation ID, `journalStatus=not_applicable`, and `effects` none.
- Kernel `failed`, `partial`, `refused`, or `indeterminate` outcomes return `isError=true` with the complete structured result. `succeeded` returns `isError=false`.
- A broken transport never fabricates a successful or definitive business result. Recovery uses the operation journal.

## Policy and Annotations

Read-only queries receive `readOnlyHint=true`; reconciliation is not described as read-only because it may update journal evidence. All public tools have `destructiveHint=false` and `openWorldHint=false`. These annotations are hints and never authorize execution.

At execution time, the Kernel revalidates configured project, current task risk, ownership, compatibility, lock state, and clean plan digest. Public mutations execute only at effective low risk. Unknown or external-owned targets remain inspect-only.

## Bounded Observation and Recovery

Logs/events require bounded limits/windows/cursors and cannot follow permanently or read arbitrary paths. `operation.list` is a correlation API, not general history search: exact project/operation/time/state filters, task when applicable, at most a 15-minute window and 20 results. Zero and multiple matches do not authorize retry. `operation.reconcile` reads evidence and may update the original record but cannot invoke the original handler.

## Verification Gates

The real stdio client must cover initialization, `tools/list`, representative `tools/call`, all 18 schemas, invalid input, structured output validation, protocol/tool/domain error separation, stdout purity, stderr diagnostics, foreground child output isolation, interruption, restart, concurrent request IDs, response-loss recovery, and adapter semantic equivalence with CLI.
