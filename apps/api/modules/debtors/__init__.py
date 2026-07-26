"""Debtors module public API."""

from .routes import (
    create_debtor_route,
    delete_debtor_route,
    get_debtors_route,
)

__all__ = [
    "get_debtors_route",
    "create_debtor_route",
    "delete_debtor_route",
]
