"""Command-line entry point for deterministic Python-side seeding."""

from __future__ import annotations

import json

from .storage import load_seed_records, seed_database


def main() -> None:
    total = seed_database()
    print(json.dumps({"seeded": len(load_seed_records()), "total": total}, indent=2))


if __name__ == "__main__":
    main()

