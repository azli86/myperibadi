"""User profile module public API."""

from .routes import (
    change_my_password_route,
    confirm_my_email_change_route,
    delete_my_account_route,
    delete_my_pin_route,
    get_my_pin_status_route,
    get_my_profile_route,
    request_my_email_change_route,
    reset_my_account_route,
    set_my_pin_route,
    update_my_profile_route,
    verify_my_pin_route,
)

__all__ = [
    "get_my_profile_route",
    "update_my_profile_route",
    "request_my_email_change_route",
    "confirm_my_email_change_route",
    "get_my_pin_status_route",
    "verify_my_pin_route",
    "set_my_pin_route",
    "delete_my_pin_route",
    "change_my_password_route",
    "delete_my_account_route",
    "reset_my_account_route",
]
