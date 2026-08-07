"""Deterministic inventory seed data."""

from typing import Final

SEED_ITEMS: Final[tuple[dict[str, object], ...]] = (
    {
        "sku": "KB-1001",
        "name": "Wireless Keyboard",
        "quantity": 42,
        "location": "A-01",
    },
    {
        "sku": "HB-1002",
        "name": "USB-C Hub",
        "quantity": 18,
        "location": "A-02",
    },
    {
        "sku": "LS-1003",
        "name": "Laptop Stand",
        "quantity": 7,
        "location": "B-01",
    },
)
