"""Loans module public API."""

from .routes import (
    create_loan_payment_route,
    create_loan_route,
    delete_loan_payment_route,
    delete_loan_route,
    get_loan_payments_route,
    get_loan_route,
    get_loans_route,
    update_loan_route,
)

__all__ = [
    "get_loans_route",
    "create_loan_route",
    "update_loan_route",
    "get_loan_route",
    "delete_loan_route",
    "get_loan_payments_route",
    "create_loan_payment_route",
    "delete_loan_payment_route",
]
