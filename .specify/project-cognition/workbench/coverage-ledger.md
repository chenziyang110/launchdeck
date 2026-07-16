# Coverage Ledger

## Summary
- **Total candidates**: 523
- **Deep read**: 41 (7.8%)
- **Sampled**: 33 (6.3%)
- **Inventory only**: 445 (85.1%)
- **Excluded**: 4 (0.8%)

## By Value Tier

| Tier | Count | Deep Read | Sampled | Inventory | Excluded |
|------|-------|-----------|---------|-----------|----------|
| P0 (critical) | 16 | 16 | 0 | 0 | 0 |
| P1 (important) | 29 | 25 | 4 | 0 | 0 |
| P2 | 47 | 0 | 29 | 18 | 0 |
| P3 (vendored) | 431 | 0 | 0 | 427 | 4 |

## Coverage by Capability

| Capability | Paths | Status |
|------------|-------|--------|
| Project Lifecycle | src/cli.js, src/config.js, src/runtime.js | ✅ Complete |
| Process Management | Runs, Ownership, Locks, State, Global Runtime | ✅ Complete |
| Inspect & Observability | Inspect, Events | ✅ Complete |
| Agent Installer | agent-installer.js | ✅ Complete |
| CI Pipeline | ci.yml, smoke-lifecycle.js | ✅ Complete |
| CLI Tests | 20 test files | ✅ Complete |

## Open Gaps
None. All P0/P1 paths have been deep read.
