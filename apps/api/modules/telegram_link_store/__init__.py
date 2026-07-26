"""Telegram link store module public API."""

from .routes import (
    consume_telegram_pair_code_route,
    get_telegram_link_by_identity_any_state_route,
    get_telegram_link_by_identity_route,
    get_telegram_link_by_user_id_route,
    mark_telegram_event_if_new_route,
)

__all__ = [
    "get_telegram_link_by_user_id_route",
    "get_telegram_link_by_identity_route",
    "get_telegram_link_by_identity_any_state_route",
    "mark_telegram_event_if_new_route",
    "consume_telegram_pair_code_route",
]
