from __future__ import annotations

import asyncio
from typing import Awaitable, Callable

from fastapi import HTTPException, Request
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas


async def get_internal_whatsapp_group_rules_route(
    *,
    user_id: str,
    request: Request,
    db: AsyncSession,
    ensure_valid_whatsapp_worker_request: Callable[[Request], None],
) -> dict:
    ensure_valid_whatsapp_worker_request(request)

    result = await db.execute(
        select(models.WhatsAppGroupRule)
        .where(
            models.WhatsAppGroupRule.user_id == user_id,
            models.WhatsAppGroupRule.is_enabled == True,
        )
        .order_by(models.WhatsAppGroupRule.created_at.asc(), models.WhatsAppGroupRule.id.asc())
    )
    rules = result.scalars().all()
    return {
        "rules": [
            {
                "group_jid": rule.group_jid,
                "group_name": rule.group_name,
                "trigger_prefix": rule.trigger_prefix,
                "show_current_balance": rule.show_current_balance,
                "show_expense_amount": rule.show_expense_amount,
                "show_income_amount": rule.show_income_amount,
            }
            for rule in rules
        ]
    }


async def get_internal_whatsapp_removed_business_routing_route(
    *,
    user_id: str,
    request: Request,
    db: AsyncSession,
    ensure_valid_whatsapp_worker_request: Callable[[Request], None],
    removed_business_access_enabled: Callable[[models.User], bool],
) -> dict:
    ensure_valid_whatsapp_worker_request(request)

    # Direct match: cuba cari user by session ID
    user_result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = user_result.scalar_one_or_none()
    resolved_user_id = user.id if user else None

    # Fallback: cari mana-mana user yang ada removed_business payment settings aktif
    if not resolved_user_id:
        bps_result = await db.execute(
            select(models.BusinessPaymentSetting.user_id).where(
                or_(
                    models.BusinessPaymentSetting.whatsapp_trigger_prefix.isnot(None),
                    models.BusinessPaymentSetting.whatsapp_trigger_prefix != "",
                    models.BusinessPaymentSetting.capture_all_whatsapp_messages == True,
                )
            )
        )
        removed_business_user_ids = [row[0] for row in bps_result.all()]
        if removed_business_user_ids:
            user_result = await db.execute(
                select(models.User)
                .where(models.User.id.in_(removed_business_user_ids))
                .order_by(models.User.created_at.asc())
            )
            fallback_user = user_result.scalars().first()
            resolved_user_id = fallback_user.id if fallback_user else None

    if not resolved_user_id:
        return {
            "removed_business_enabled": False,
            "capture_all_whatsapp_messages": False,
            "whatsapp_trigger_prefix": None,
            "allow_non_self_for_removed_business": False,
        }

    setting_result = await db.execute(
        select(
            models.BusinessPaymentSetting.capture_all_whatsapp_messages,
            models.BusinessPaymentSetting.whatsapp_trigger_prefix,
        ).where(models.BusinessPaymentSetting.user_id == resolved_user_id)
    )
    row = setting_result.one_or_none()
    capture_all = bool(row[0]) if row else False
    prefix = (row[1] or "").strip() if row else ""

    return {
        "removed_business_enabled": True,
        "capture_all_whatsapp_messages": capture_all,
        "whatsapp_trigger_prefix": prefix or None,
        "allow_non_self_for_removed_business": bool(capture_all or prefix),
    }
async def get_whatsapp_group_rules_route(
    *,
    current_user: models.User,
    db: AsyncSession,
) -> list[models.WhatsAppGroupRule]:
    result = await db.execute(
        select(models.WhatsAppGroupRule)
        .where(models.WhatsAppGroupRule.user_id == current_user.id)
        .order_by(models.WhatsAppGroupRule.created_at.asc(), models.WhatsAppGroupRule.id.asc())
    )
    return result.scalars().all()


async def get_available_whatsapp_groups_route(
    *,
    current_user: models.User,
    fetch_worker_groups: Callable[[str], tuple[object, int]],
) -> list[dict]:
    data, status = await asyncio.to_thread(fetch_worker_groups, current_user.id)
    detail = data.get("detail") if isinstance(data, dict) else None
    if status == 200:
        return data.get("groups", []) if isinstance(data, dict) else []
    if status == 409:
        raise HTTPException(status_code=409, detail=detail or "WhatsApp session is not connected yet.")
    if status and status >= 400:
        raise HTTPException(status_code=status, detail=detail or "Failed to fetch WhatsApp groups from worker.")
    raise HTTPException(status_code=503, detail="WhatsApp bot worker is not reachable.")


async def create_whatsapp_group_rule_route(
    *,
    rule_in: schemas.WhatsAppGroupRuleCreate,
    current_user: models.User,
    db: AsyncSession,
    normalize_whatsapp_group_jid: Callable[[str], str],
    normalize_group_prefix: Callable[[str | None], str],
) -> models.WhatsAppGroupRule:
    group_jid = normalize_whatsapp_group_jid(rule_in.group_jid)
    group_name = (rule_in.group_name or "").strip() or group_jid
    trigger_prefix = normalize_group_prefix(rule_in.trigger_prefix)

    result = await db.execute(
        select(models.WhatsAppGroupRule).where(
            models.WhatsAppGroupRule.user_id == current_user.id,
            models.WhatsAppGroupRule.group_jid == group_jid,
        )
    )
    existing = result.scalars().first()
    if existing:
        existing.group_name = group_name
        existing.trigger_prefix = trigger_prefix
        existing.show_current_balance = bool(rule_in.show_current_balance)
        existing.show_expense_amount = bool(rule_in.show_expense_amount)
        existing.show_income_amount = bool(rule_in.show_income_amount)
        existing.is_enabled = True
        await db.commit()
        await db.refresh(existing)
        return existing

    rule = models.WhatsAppGroupRule(
        user_id=current_user.id,
        group_jid=group_jid,
        group_name=group_name,
        trigger_prefix=trigger_prefix,
        show_current_balance=bool(rule_in.show_current_balance),
        show_expense_amount=bool(rule_in.show_expense_amount),
        show_income_amount=bool(rule_in.show_income_amount),
        is_enabled=True,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def update_whatsapp_group_rule_route(
    *,
    rule_id: int,
    rule_in: schemas.WhatsAppGroupRuleUpdate,
    current_user: models.User,
    db: AsyncSession,
    get_whatsapp_group_rule: Callable[[int, models.User, AsyncSession], Awaitable[models.WhatsAppGroupRule]],
    normalize_group_prefix: Callable[[str | None], str],
) -> models.WhatsAppGroupRule:
    rule = await get_whatsapp_group_rule(rule_id, current_user, db)
    if rule_in.group_name is not None:
        rule.group_name = (rule_in.group_name or "").strip() or rule.group_jid
    if rule_in.trigger_prefix is not None:
        rule.trigger_prefix = normalize_group_prefix(rule_in.trigger_prefix)
    if rule_in.show_current_balance is not None:
        rule.show_current_balance = bool(rule_in.show_current_balance)
    if rule_in.show_expense_amount is not None:
        rule.show_expense_amount = bool(rule_in.show_expense_amount)
    if rule_in.show_income_amount is not None:
        rule.show_income_amount = bool(rule_in.show_income_amount)
    if rule_in.is_enabled is not None:
        rule.is_enabled = bool(rule_in.is_enabled)
    await db.commit()
    await db.refresh(rule)
    return rule


async def delete_whatsapp_group_rule_route(
    *,
    rule_id: int,
    current_user: models.User,
    db: AsyncSession,
    get_whatsapp_group_rule: Callable[[int, models.User, AsyncSession], Awaitable[models.WhatsAppGroupRule]],
) -> dict[str, str]:
    rule = await get_whatsapp_group_rule(rule_id, current_user, db)
    await db.delete(rule)
    await db.commit()
    return {"message": "WhatsApp group rule deleted"}


async def get_whatsapp_session_route(
    *,
    current_user: models.User,
    fetch_session: Callable[[str], tuple[object, int]],
) -> dict:
    data, status = await asyncio.to_thread(fetch_session, current_user.id)
    if status == 200:
        if isinstance(data, dict):
            data["user_id"] = current_user.id
            data["personal_prefix_mode_enabled"] = bool(getattr(current_user, "personal_bot_prefix_enabled", False))
            stored_prefix = (getattr(current_user, "personal_bot_prefix", None) or "").strip()
            data["personal_trigger_prefix"] = stored_prefix or "bd"
        return data if isinstance(data, dict) else {}
    raise HTTPException(status_code=503, detail="WhatsApp bot worker is not reachable.")


async def update_whatsapp_session_settings_route(
    *,
    payload: schemas.WhatsAppSessionSettingsUpdate,
    current_user: models.User,
    db: AsyncSession,
    normalize_personal_prefix: Callable[[str | None], str],
) -> dict[str, object]:
    prefix_mode_enabled = bool(payload.personal_prefix_mode_enabled)
    current_user.personal_bot_prefix_enabled = prefix_mode_enabled

    if payload.personal_trigger_prefix is not None:
        current_user.personal_bot_prefix = normalize_personal_prefix(payload.personal_trigger_prefix)
    elif prefix_mode_enabled and not (current_user.personal_bot_prefix or "").strip():
        current_user.personal_bot_prefix = "bd"

    db.add(current_user)
    await db.commit()

    return {
        "personal_prefix_mode_enabled": bool(current_user.personal_bot_prefix_enabled),
        "personal_trigger_prefix": (current_user.personal_bot_prefix or "").strip() or "bd",
    }


async def logout_whatsapp_session_route(
    *,
    current_user: models.User,
    delete_session: Callable[[str], tuple[object, int]],
) -> dict[str, str]:
    _data, status = await asyncio.to_thread(delete_session, current_user.id)
    if status == 200:
        return {"message": "WhatsApp logged out successfully"}
    raise HTTPException(status_code=503, detail="WhatsApp bot worker is not reachable.")


async def pair_whatsapp_session_route(
    *,
    phone: str,
    current_user: models.User,
    pair_session: Callable[[str, str], tuple[object, int]],
) -> dict:
    data, status = await asyncio.to_thread(pair_session, current_user.id, phone)
    if status == 200:
        return data if isinstance(data, dict) else {}
    raise HTTPException(status_code=503, detail="WhatsApp bot worker is not reachable.")
