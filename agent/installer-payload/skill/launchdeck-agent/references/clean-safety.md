# Clean Safety

Clean is hygiene, not reset and not service control. It does not stop services.

## Classify First

- Safe clean: cache/build output that Launchdeck marks safe; default to `launchdeck clean --safe --json --compact`.
- Risky clean: dependency directories, broad generated directories, Docker artifacts, database-like storage, user uploads, or anything with unclear ownership/impact. Public Agent execution is unavailable.
- Reset: deleting source/config, `.launchdeck.yml`, registry/runtime evidence, logs/events needed for diagnosis, secrets, databases, user data, or project state.

## Safe Clean

1. Call `clean.plan` for the explicit configured project and retain its current plan digest.
2. Preserve logs, events, registry, runtime evidence, `.launchdeck.yml`, env files, secrets, databases, user data, and source/config files.
3. Call `clean.applySafe` once with the exact plan digest. Any drift refusal is final.
4. Summarize what was cleaned, what was preserved, and whether any running services were left alone.

## Risky Clean

Refuse execution. Explain which requested targets are outside the public safe-clean boundary and that no confirmation, approval token, or host annotation can elevate the Agent surface.

## Reset Refusal

If the user asks for reset, wipe, delete everything, remove config, or clear runtime history, do not treat it as clean. Refuse the Agent operation and explain that a separately specified manual workflow is required.

## Recovery Interaction

- Do not clean to fix an occupied port.
- Do not clean because logs are missing.
- If cleanup could hide evidence for a failure, collect `logs`, `events`, and `inspect` evidence first.
