---
type: pitfall
summary: Windows Node managed-process tests can transiently fail during temp cleanup with EPERM.
evidence: T014, T018, and T021 validation encountered or referenced transient Windows EPERM cleanup behavior around managed-process/runtime tests; focused reruns or full reruns passed after process state settled.
applies_to:
  - sp-implement
  - managed runtime tests
  - Windows Node.js validation
---

# Windows Node Managed Test EPERM

When lifecycle tests spawn managed Node processes on Windows, temp fixture cleanup can occasionally fail with `EPERM` after assertions have already passed.

Recovery path:

- Re-run the focused failing suite once before treating it as a product regression.
- Inspect for leftover test-owned `node` or `cmd` processes only when the failure repeats.
- Do not kill arbitrary user processes; only consider surgical cleanup for commands clearly tied to the launchdeck test fixture.
- Preserve the transient evidence in worker results or review logs if the rerun passes.

This does not excuse real lifecycle failures. It only prevents a cleanup race from being misclassified as a behavioral regression before a focused rerun.
