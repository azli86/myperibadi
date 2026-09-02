"""Account cleanup service: hard delete account OR reset account data.

Both operations run inside a single DB transaction so any failure rolls back
cleanly. Deletes are ordered child → parent to satisfy foreign keys that do not
have ON DELETE CASCADE.

Column mapping is verified against the live schema (some tables use
uploaded_by_user_id / reporter_user_id / household_id instead of user_id).
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import models

# ---------------------------------------------------------------------------
# Per-user tables keyed by user_id. Order matters: children first.
# ---------------------------------------------------------------------------

# Vehicle / warranty / business children that reference transactions/wallets.
# These must be deleted BEFORE transactions & wallets.
_EARLY_USER_TABLES = [
    "warranty_claims",          # child of warranty_devices
    "warranty_attachments",     # child of warranty_devices
    "warranty_devices",         # references households
    "removed_business_inbox_messages",  # child of threads
    "biz_inbox_messages",
    "biz_inbox_threads",
    "biz_notifications",
    "biz_themes",
    "business_order_items",     # child of orders + products
    "removed_business_notifications",   # child of orders
    "business_orders",          # references products (SET NULL) + riders (nullable)
    "business_audit_logs",
    "business_phonebook_contacts",  # child of groups (SET NULL)
    "business_phonebook_groups",
    "business_product_categories",
    "business_products",
    "business_riders",
    "business_expenses",
    "business_owner_draws",     # references wallets + transactions
    "business_payment_settings",
    "business_automation_flows",
    "business_official_staff",
    "removed_business_inbox_threads",
    "removed_business_themes",
    "place_categories",
    "place_share_groups",
    "places",
    "monthly_checkoffs",
]

# Tables with a direct user_id, deleted after children.
_USER_DIRECT_TABLES = [
    "subscriptions",
    "loan_payments",            # references loans + transactions
    "loans",                    # references categories (kept)
    "debts",                    # references debtors + transactions
    "debtors",                  # references only users - delete AFTER debts
    "commitments",
    "user_location_contexts",
    "whatsapp_links",
    "whatsapp_group_rules",
    "whatsapp_inbound_events",
    "telegram_pair_codes",
    "telegram_links",
    "login_logs",
    "user_push_tokens",
    "native_push_subscriptions",
    "push_devices",
    "user_api_keys",
    "user_settings",
    "transactions",
    "access_logs",
]

# User-owned tables added after earlier modules shipped (tax, health,
# medications, split bills, BNPL, events, inventory, support). Many reference
# transactions/wallets, so they are deleted up-front, BEFORE those parents are
# removed. Order is child-first per the live FK graph.
_EXTRA_USER_TABLES = [
    "tax_transaction_links",   # -> transactions (CASCADE)
    "tax_reliefs",             # -> tax_rules (kept)
    "tax_rebates",             # -> tax_documents + transactions
    "tax_income",              # -> tax_employers + tax_profiles
    "tax_ea_forms",            # -> tax_documents + tax_employers
    "tax_employers",
    "tax_documents",
    "tax_profiles",
    "tax_calculations",
    "support_tickets",
    "split_bill_payments",     # -> split_bills + transactions + wallets
    "split_bills",             # -> transactions
    "inventory_movements",     # -> inventory_items (CASCADE)
    "inventory_items",
    "inventory_conversation_states",
    "inventory_containers",
    "inventory_locations",
    "health_readings",
    "events",                  # -> wallets (kept)
    "bnpl_payments",           # -> bnpl + transactions + wallets
    "bnpl",                    # -> categories (kept)
]

# Children without a user_id column that are CASCADE-cleared off the rows
# above. They are deleted with subqueries BEFORE their parents so no orphaned
# rows violate the FKs (the live schema resolves these as NO ACTION). The
# medication chain (dose_logs -> schedules -> medications) is fully spelled out
# here because dose_logs must go first.
_NO_UID_SUBQUERIES = [
    # medication_dose_logs has user_id - delete before schedules it references.
    ("medication_dose_logs", "DELETE FROM medication_dose_logs WHERE user_id = :uid"),
    # medication_schedules -> medications (no user_id)
    (
        "medication_schedules",
        "DELETE FROM medication_schedules WHERE medication_id IN "
        "(SELECT id FROM medications WHERE user_id = :uid)",
    ),
    # medications has user_id - last of the medication chain.
    ("medications", "DELETE FROM medications WHERE user_id = :uid"),
    # tax_dependants -> tax_profiles
    (
        "tax_dependants",
        "DELETE FROM tax_dependants WHERE tax_profile_id IN "
        "(SELECT id FROM tax_profiles WHERE user_id = :uid)",
    ),
    # tax_relief_items -> tax_reliefs / tax_documents
    (
        "tax_relief_items",
        "DELETE FROM tax_relief_items WHERE tax_relief_id IN "
        "(SELECT id FROM tax_reliefs WHERE user_id = :uid)",
    ),
    # support_ticket_replies -> support_tickets
    (
        "support_ticket_replies",
        "DELETE FROM support_ticket_replies WHERE ticket_id IN "
        "(SELECT id FROM support_tickets WHERE user_id = :uid)",
    ),
]

# Tables that use a different user key column.
_USER_ALT_COLUMN_TABLES = {
    "attachments": "uploaded_by_user_id",
    "scam_phone_reports": "reporter_user_id",
}

# Tables with no user_id but referencing transactions by FK.
_TRANSACTION_CHILD_TABLES = [
    "transaction_items",
]

# Household-owned tables (deleted per household). Vehicle data references
# transactions/wallets so it must be deleted before transactions & wallets.
_VEHICLE_TABLES = [
    "vehicle_odometer_readings",
    "vehicle_attachments",
    "vehicle_reminders",
    "vehicle_documents",
    "vehicle_maintenance",
    "vehicle_expenses",
    "vehicle_fuel_logs",
    "vehicles",
]

# Household core tables (wallets/categories/budgets) — deleted on hard delete only.
_HOUSEHOLD_CORE_TABLES = [
    "category_budgets",
    "category_keywords",
    "categories",
    "wallets",
    "household_members",
]


async def _delete_user_rows(db: AsyncSession, user_id: str, *, include_user_settings: bool = True) -> None:
    # Chat messages reference attachments — delete first.
    await db.execute(text("DELETE FROM chat_messages WHERE user_id = :uid"), {"uid": user_id})
    # Children of transactions (no user_id) must go before transactions.
    await db.execute(
        text(
            "DELETE FROM transaction_items WHERE transaction_id IN "
            "(SELECT id FROM transactions WHERE user_id = :uid)"
        ),
        {"uid": user_id},
    )
    # Attachments reference transactions + uploader.
    await db.execute(
        text(
            "DELETE FROM attachments WHERE transaction_id IN "
            "(SELECT id FROM transactions WHERE user_id = :uid)"
        ),
        {"uid": user_id},
    )

    for table in _EARLY_USER_TABLES:
        await db.execute(text(f'DELETE FROM "{table}" WHERE user_id = :uid'), {"uid": user_id})
    # Children that have no user_id column - clear via parent subquery first.
    for _name, sql in _NO_UID_SUBQUERIES:
        await db.execute(text(sql), {"uid": user_id})
    # Newer modules' tables reference transactions/wallets, so delete them here
    # before those parents are removed in _USER_DIRECT_TABLES below.
    for table in _EXTRA_USER_TABLES:
        await db.execute(text(f'DELETE FROM "{table}" WHERE user_id = :uid'), {"uid": user_id})
    for table in _USER_DIRECT_TABLES:
        if not include_user_settings and table in {"user_settings", "access_logs"}:
            continue
        await db.execute(text(f'DELETE FROM "{table}" WHERE user_id = :uid'), {"uid": user_id})
    for table, column in _USER_ALT_COLUMN_TABLES.items():
        await db.execute(text(f'DELETE FROM "{table}" WHERE "{column}" = :uid'), {"uid": user_id})


async def _delete_owned_household_vehicles(db: AsyncSession, user_id: str) -> None:
    """Delete vehicle data for households owned by this user (before transactions)."""
    rows = (await db.execute(
        text("SELECT id FROM households WHERE owner_user_id = :uid"),
        {"uid": user_id},
    )).all()
    for row in rows:
        hid = row[0]
        for table in _VEHICLE_TABLES:
            await db.execute(text(f'DELETE FROM "{table}" WHERE household_id = :hid'), {"hid": hid})


async def _delete_owned_households(db: AsyncSession, user_id: str) -> None:
    """Delete households owned by this user when no other members remain (hard delete)."""
    rows = (await db.execute(
        text("SELECT id FROM households WHERE owner_user_id = :uid"),
        {"uid": user_id},
    )).all()
    for row in rows:
        hid = row[0]
        member_count = (await db.execute(
            text("SELECT COUNT(*) FROM household_members WHERE household_id = :hid"),
            {"hid": hid},
        )).scalar_one()
        if member_count > 1:
            # Shared household — remove membership only, keep data.
            await db.execute(
                text("DELETE FROM household_members WHERE household_id = :hid AND user_id = :uid"),
                {"hid": hid, "uid": user_id},
            )
            continue
        # Owned & unshared — delete everything for this household.
        for table in _HOUSEHOLD_CORE_TABLES:
            if table == "category_keywords":
                await db.execute(
                    text(
                        "DELETE FROM category_keywords WHERE category_id IN "
                        "(SELECT id FROM categories WHERE household_id = :hid)"
                    ),
                    {"hid": hid},
                )
                continue
            await db.execute(text(f'DELETE FROM "{table}" WHERE household_id = :hid'), {"hid": hid})
        await db.execute(text("DELETE FROM households WHERE id = :hid"), {"hid": hid})


async def hard_delete_account(db: AsyncSession, user: models.User) -> None:
    """Permanently delete the user and all their data."""
    await _delete_owned_household_vehicles(db, user.id)   # before transactions/wallets
    await _delete_user_rows(db, user.id)
    await _delete_owned_households(db, user.id)           # wallets/categories/households
    # Final safety: null out references to this user where FK allows NULL.
    await db.execute(text("UPDATE ip_bans SET created_by_user_id = NULL WHERE created_by_user_id = :uid"), {"uid": user.id})
    await db.execute(text("UPDATE business_audit_logs SET actor_user_id = NULL WHERE actor_user_id = :uid"), {"uid": user.id})
    # Wallets may be owned directly by the user outside owned households.
    await db.execute(text("DELETE FROM wallets WHERE owner_user_id = :uid"), {"uid": user.id})
    await db.execute(text("DELETE FROM user_auth_sessions WHERE user_id = :uid"), {"uid": user.id})
    await db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": user.id})


async def reset_account_data(db: AsyncSession, user: models.User) -> None:
    """Wipe all user financial/app data but keep the account itself.

    Keeps: user, default household, wallets, categories, category keywords,
    user settings (theme/language).
    Deletes: transactions, debts, loans, subscriptions, vehicles, warranties,
    places, monthly checkoffs, chat history, business data, etc.
    """
    await _delete_owned_household_vehicles(db, user.id)
    await _delete_user_rows(db, user.id, include_user_settings=False)
    # Reset categories so onboarding re-seeds in the language the user picks.
    household_rows = (await db.execute(
        text("SELECT id FROM households WHERE owner_user_id = :uid"),
        {"uid": user.id},
    )).all()
    for row in household_rows:
        hid = row[0]
        # category_budgets + category_keywords reference categories — clear first.
        await db.execute(text("DELETE FROM category_budgets WHERE household_id = :hid"), {"hid": hid})
        await db.execute(
            text(
                "DELETE FROM category_keywords WHERE category_id IN "
                "(SELECT id FROM categories WHERE household_id = :hid)"
            ),
            {"hid": hid},
        )
        # Delete user-facing categories only; keep internal plumbing
        # (Transfer Wallet / Debt Out / Debt In / Monthly Salary).
        await db.execute(
            text('DELETE FROM categories WHERE household_id = :hid AND is_internal = FALSE AND system_code IS NULL'),
            {"hid": hid},
        )
    # Reset user to a fresh state so onboarding + default categories re-seed.
    user.onboarding_done = False
    user.category_language = None
    user.cycle_start_day = 1
    user.cycle_mode = "day"
    user.pin_hash = None
    user.pin_failed_attempts = 0
    user.pin_locked_until = None
    user.pin_updated_at = None
