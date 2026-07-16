# Clean Safety

Clean is hygiene, not reset and not service control. It does not stop services.

## Classify First

- Safe clean: cache/build output that Launchdeck marks safe; default to `launchdeck clean --safe --json --compact`.
- Risky clean: dependency directories, broad generated directories, Docker artifacts, database-like storage, user uploads, or anything with unclear ownership/impact.
- Reset: deleting source/config, `.launchdeck.yml`, registry/runtime evidence, logs/events needed for diagnosis, secrets, databases, user data, or project state.

## Safe Clean

1. Observe relevant running state with `launchdeck status --all --json --compact` when services may be active.
2. Preserve logs, events, registry, runtime evidence, `.launchdeck.yml`, env files, secrets, databases, user data, and source/config files.
3. Run `launchdeck clean --safe --json --compact`.
4. Summarize what was cleaned, what was preserved, and whether any running services were left alone.

## Risky Clean

Require explicit confirmation with named targets and impact before using broader cleanup such as `launchdeck clean --all --yes --json --compact`.

Confirmation must name:

- exact targets,
- likely impact,
- whether data may be expensive to recreate,
- evidence that logs/events/runtime records needed for diagnosis are preserved or intentionally excluded.

## Reset Refusal

If the user asks for reset, wipe, delete everything, remove config, or clear runtime history, do not treat it as clean. Explain that reset is a separate destructive request and ask for a precise confirmation path outside automatic clean.

## Recovery Interaction

- Do not clean to fix an occupied port.
- Do not clean because logs are missing.
- If cleanup could hide evidence for a failure, collect `logs`, `events`, and `inspect` evidence first.
