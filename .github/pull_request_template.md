## What

Describe the focused change.

## Why

Explain the problem, user impact, or maintenance reason.

## Verification

- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run smoke` when lifecycle behavior changes
- [ ] `npm audit --omit=dev --audit-level=high`
- [ ] `npm run package:check` when packaging changes

## Review Checklist

- [ ] Tests cover the change and relevant failure paths
- [ ] Documentation and CLI help match behavior
- [ ] No secrets, local runtime state, or unrelated files are included
- [ ] Compatibility and safety effects are documented
