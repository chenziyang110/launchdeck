# Example CLI and Gallery Contract

## Command Grammar

- `launchdeck example list [--json] [--compact] [--no-color]`
- `launchdeck example copy [<id>] [<destination>] [--json] [--compact] [--no-color]`
- This feature adds no other `example` subcommand.
- Explicit ID is deterministic and never prompts. Omitted ID may open a searchable single-select only when stdin and stdout are TTY and output is not JSON. JSON or non-TTY omission returns `command_usage_error`.

## Catalog Contract

The canonical catalog is `examples/sample-projects/catalog.json`, a top-level array of exactly ten entries. Entry fields are exactly `id`, `title`, `stack`, `theme`, `requirements`, `ports`, and `sourcePath`. IDs, stacks and themes match `spec.md#Confirmed Scope`; source paths are contained below the canonical root and ports are unique and overridable. Rank, score, answer, evaluation and telemetry fields are forbidden.

## Output Contract

Human output follows `DESIGN.md`, stays readable at 60/120 columns and without color, and textually exposes focus, selection, no-match, cancel, conflict, success and cleanup failure. JSON and compact output each emit exactly one schemaVersion 1 object through the existing output envelope. Success list data contains catalog entries only. Success copy data is emitted only after publication and includes sample ID and resolved absolute destination; implementation may add stable file-count/digest fields if covered by contract tests.

## Outcome Contract

| Outcome | Classification | Required behavior |
| --- | --- | --- |
| `OUT-EX-LIST-OK` | terminal-success | Return exactly ten catalog entries; no mutation. |
| `OUT-EX-COPY-OK` | terminal-success | Receipt only after atomic rename; retry conflicts with existing destination. |
| `OUT-EX-USAGE` | terminal-failure | Stable usage error and valid syntax; no mutation. |
| `OUT-EX-CATALOG-INVALID` | terminal-failure | Typed package-integrity error; no partial list. |
| `OUT-EX-UNKNOWN-ID` | recoverable-user-input | Retain destination, replace ID on explicit retry; catalog-only IDs. |
| `OUT-EX-NO-TTY-ID` | recoverable-user-input | Never prompt; retain flags/destination for explicit-ID retry; no terminal UI noise. |
| `OUT-EX-NO-MATCH` | recoverable-user-input | TTY-only selector retains query; edit or cancel; catalog-only options. |
| `OUT-EX-CANCEL` | cancelled | Typed cancellation; no destination/staging mutation. |
| `OUT-EX-DEST-CONFLICT` | terminal-failure | Reject any existing target object before staging and report the path. |
| `OUT-EX-SOURCE-MISSING` | terminal-failure | Typed package-integrity failure; block list/copy or release as applicable. |
| `OUT-EX-COPY-FAIL` | terminal-failure | Remove owned staging, leave destination absent, report cleanup result. |
| `OUT-EX-RENAME-FAIL` | terminal-failure | Remove owned unpublished staging/destination when safe, leave no residue, report cleanup result. |

Public example-specific error codes must be added to `ERROR_CODES` and to the frozen CLI contract tests; otherwise normalization to `internal_error` is prohibited drift.

## Filesystem Safety Contract

Resolve and validate catalog source containment, destination, parent, object type, symlink/reparse behavior and permissions before mutation. Reject every existing destination. Create unique staging and target lock identities in the destination parent, copy completely, recheck destination absence, and publish with same-filesystem atomic rename. Cleanup may remove only positively owned staging/lock paths. Copy performs no install, build, run, network, Git, Launchdeck configuration, registry or runtime-state operation.

## Packaging and Compatibility Contract

The npm tarball contains the catalog and all ten complete source trees, excludes dependency/build/runtime/generated/config artifacts, and satisfies packed <= 5 MiB and unpacked <= 20 MiB. Repository source, successful copy and tarball digests must match. Every sample must pass native and external Launchdeck setup/build/test/start/health/stop evidence on Windows and Linux with no skip-based success. macOS and evaluation/scoring claims are excluded.