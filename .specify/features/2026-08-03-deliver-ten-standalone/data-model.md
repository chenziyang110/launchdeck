# Data Model

## Scope and Sources

- Authority: `spec-contract.json#/scope`, `#/constraints`, `#/acceptance_criteria`, and the accepted architecture/validation lane handoffs.
- Committed product data: one catalog at `examples/sample-projects/catalog.json` plus exactly ten sibling source directories named by `spec.md#Confirmed Scope`.
- Runtime-only data: copy request, staging identity, lock ownership, cleanup outcome, native sample persistence, and Launchdeck lifecycle receipts. None is committed into source samples.
- External validation data: candidate `.launchdeck.yml`, isolated `LAUNCHDECK_HOME`, process receipts, health results, and logs live only in temporary verification copies/evidence.

## Data Structures and Ownership

### Gallery entry

The catalog is a top-level array of exactly ten objects. Each object has exactly:

| Field | Shape | Invariant |
| --- | --- | --- |
| `id` | non-empty kebab-case string | Unique; equals one approved directory name. |
| `title` | non-empty string | Human label only; no score or ranking. |
| `stack` | non-empty string | Exact approved stack name. |
| `theme` | non-empty string | Exact approved project theme. |
| `requirements` | non-empty string array | Runtime/tool prerequisites only. |
| `ports` | non-empty object/array with numeric defaults and override names | Defaults unique across all entries and overridable. |
| `sourcePath` | repository-relative string | Resolves below `examples/sample-projects` to the matching directory. |

`src/examples/catalog.js` owns loading, strict field allowlisting, exact-set validation, containment checks, and immutable return values. Catalog consumers never maintain a second inventory.

### Copy request and transaction

- `CopyRequest`: selected `id`, optional caller destination, resolved absolute destination, mode (`human|json|compact`), TTY capability, and cancellation signal.
- `CopyTransaction`: source root, destination parent, unique staging path, target-specific lock identity, phase, cleanup result, and final receipt fields.
- Phases: `input-required -> validated -> staging -> ready-to-publish -> published`; terminal alternatives are `cancelled`, `validation-failed`, `copy-failed-cleaned`, and `rename-failed-cleaned`.

### Verification receipt

External CI owns per-sample/per-OS receipts with sample ID, OS, native phase results, Launchdeck phase results, port, process owner, health evidence, cleanup evidence, source/copy/tarball digest, and failure logs. Receipts are evidence, not scores.

## Relationships and Lifecycle

- The catalog is the only metadata producer for list, copy, README index generation/checking, npm inventory, native matrix, and Launchdeck compatibility matrix.
- Each catalog row owns exactly one source directory; every source directory in the canonical root is represented exactly once.
- List is read-only: `catalog -> presentation/envelope`.
- Copy is publish-once: `catalog row -> validated source/request -> same-parent staging -> prepublish recheck -> atomic rename -> receipt`.
- Native and Launchdeck validation always start from fresh temporary copies. Launchdeck configuration may be authored only in those copies by external fixtures.
- Repository source, successful copy, and tarball payload are related by exact inventory/content digests. Any mismatch blocks release under CA-004.

## Invariants, Persistence, and Migration

- Catalog and source trees are committed package content; sample runtime databases, logs, build outputs, dependency directories, virtual environments, binaries, and generated Launchdeck files are forbidden.
- Sample seed operations are deterministic and idempotent. Runtime persistence uses each stack's natural local mechanism and is created only after install/run in an isolated copy.
- Any existing destination object is rejected. Staging is created in the resolved destination parent so publication stays on one filesystem.
- Only the process-owned staging/lock paths may be recursively removed. Never clean an unverified destination, parent, home directory, or unrelated path.
- A successful retry after success is a destination conflict. A failed attempt retries with a fresh staging/lock identity after cleanup proof.
- Existing examples outside `examples/sample-projects` are preserved. No migration moves or deletes them.

## Integration and Verification

- Catalog contract tests: exact ten IDs, exact fields, unique source paths/ports, containment, source existence, and all-consumer derivation.
- Copy state tests: explicit/TTY input states, preflight object matrix, staging-name collision, copy/rename/cleanup fault injection, concurrent target lock, cancellation, retry, and no-residue proof on Windows/Linux.
- Sample tests: independent MIT license, lock data, deterministic seed, native tests, page/API health, overridable port, forbidden-content audit, and cleanup.
- Package tests: actual `npm pack` inventory/digests, packed <= 5 MiB, unpacked <= 20 MiB, repository/copy/tarball equality.
- Lifecycle tests: every sample on Windows/Linux completes applicable native and Launchdeck setup/build/test/start/health/stop with bounded retries and `finally` cleanup.
