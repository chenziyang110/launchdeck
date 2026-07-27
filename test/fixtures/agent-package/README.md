# Agent Package Evidence Fixture

This directory is intentionally source-only. The T036 evidence runner must create npm cache,
package tarballs, Launchdeck home, project roots, and installed prefixes in a temporary work
root supplied at runtime.

Fixture hygiene requirements:

- no `.tgz` files
- no npm cache directories
- no `.launchdeck` runtime state
- no credentials, tokens, or environment captures
- no generated package output
