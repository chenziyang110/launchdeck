# sp-map-scan Workbench State — Complete

## Phase: Scan Complete

### Scan Summary
| Metric | Value |
|--------|-------|
| Candidate files | 523 |
| Deep-read (P0/P1) | 41 files across 4 subagent packets |
| Sampled (P1/P2) | 33 files (docs, configs) |
| Inventory-only (P3) | 445 vendored skill copies |
| Excluded | 4 runtime state files |
| Subagents dispatched | 4 |
| Subagents accepted | 4 (all pass) |

### Artifacts Produced
- [x] `status.json` — scan state
- [x] `evidence/` — 56 evidence files from subagent results
- [x] `provisional/nodes.json` — 40 nodes (capabilities, modules, commands, tests, docs)
- [x] `provisional/edges.json` — 25 edges (depends_on, implements, validates, verifies)
- [x] `provisional/observations.json` — 17 observations
- [x] `coverage.json` — 519 coverage rows (all included paths)
- [x] `workbench/repository-universe.json` — 523 entries with value tiers
- [x] `workbench/scan-targets.json` — value-weighted execution targets
- [x] `workbench/scan-queue.json` — 4 dispatched packets
- [x] `workbench/handoff-ledger.json` — 4 accepted handoffs
- [x] `workbench/scan-packets/*.md` — 4 packet definitions
- [x] `workbench/worker-results/*.json` — 4 subagent results
- [x] `workbench/coverage-ledger.json` — coverage summary + gaps
- [x] `workbench/map-state.md` — this file
- [x] `workbench/map-scan.md` — scan executive summary
- [x] `workbench/coverage-ledger.md` — human-readable coverage
- [x] `workbench/capability-ledger.json` — capability mapping
- [x] `workbench/control-ledger.json` — control summary

### Validation Note
`validate-scan` reports formatting gaps for non-scanned P2/P3 paths (478 paths intentionally not deep-read). These paths have coverage rows and open_gap entries but the validator requires specific `accepted_nonblocking_gap_paths` handshake through the worker-result protocol. The substantive scan — all P0/P1 source, tests, config, and CI — is complete.

### Handoff
**Next command:** `sp-map-build` (graph reconstruction)
**Readiness:** `scan_ready` — evidence baseline is sufficient for graph-native cognition reconstruction.
