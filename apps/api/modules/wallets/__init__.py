"""Wallet module public API."""

from .routes import (
    create_wallet_route,
    delete_wallet_route,
    get_wallets_route,
    update_wallet_route,
)

__all__ = [
    "get_wallets_route",
    "create_wallet_route",
    "update_wallet_route",
    "delete_wallet_route",
]
