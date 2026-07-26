"""WhatsApp admin module public API."""

from .routes import (
    create_whatsapp_group_rule_route,
    delete_whatsapp_group_rule_route,
    get_available_whatsapp_groups_route,
    get_internal_whatsapp_removed_business_routing_route,
    get_internal_whatsapp_group_rules_route,
    get_whatsapp_group_rules_route,
    get_whatsapp_session_route,
    logout_whatsapp_session_route,
    pair_whatsapp_session_route,
    update_whatsapp_group_rule_route,
    update_whatsapp_session_settings_route,
)

__all__ = [
    "get_internal_whatsapp_group_rules_route",
    "get_internal_whatsapp_removed_business_routing_route",
    "get_whatsapp_group_rules_route",
    "get_available_whatsapp_groups_route",
    "create_whatsapp_group_rule_route",
    "update_whatsapp_group_rule_route",
    "delete_whatsapp_group_rule_route",
    "get_whatsapp_session_route",
    "update_whatsapp_session_settings_route",
    "logout_whatsapp_session_route",
    "pair_whatsapp_session_route",
]
