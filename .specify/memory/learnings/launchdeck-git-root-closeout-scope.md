---
type: pitfall
summary: Launchdeck sits under a broader F:/github git root, so closeout planning can surface unrelated sibling paths.
evidence: During the 2026-07-08 CLI supervisor quick task, `git rev-parse --show-toplevel` returned `F:/github` and `git status --short -- .` reported `?? ./` from `F:/github/launchdeck`. `project-cognition closeout-plan` then listed many unrelated sibling directories as unknown paths.
applies_to:
  - sp-quick
  - project cognition closeout
  - git status
  - workflow finalization
---

# Launchdeck Git Root Closeout Scope

When finalizing Launchdeck workflows, do not treat the broad git root as the project boundary. The local git root may be `F:/github`, with `launchdeck/` appearing as an untracked directory from that root.

Recovery path:

- Use explicit workflow-owned changed paths for closeout and summaries.
- Record unrelated sibling directories as excluded boundary context, not blocking known unknowns.
- Do not stage, diff, or adopt sibling directories unless the user explicitly expands the task outside Launchdeck.
- Prefer live file evidence from `F:/github/launchdeck` over broad `git status` output when deciding this project's changed surfaces.
