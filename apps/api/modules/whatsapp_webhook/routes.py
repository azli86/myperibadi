from __future__ import annotations

import base64
import binascii
import re
from typing import Any, Awaitable, Callable

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models


async def whatsapp_webhook_route(
    *,
    payload: Any,
    request: Request,
    db: AsyncSession,
    ensure_valid_whatsapp_worker_request: Callable[[Request], None],
    sanitize_input: Callable[[str], str],
    get_whatsapp_group_privacy_settings: Callable[..., Awaitable[tuple[bool, bool, bool]]],
    build_whatsapp_message_key: Callable[..., str],
    mark_whatsapp_event_if_new: Callable[..., Awaitable[bool]],
    removed_business_access_enabled: Callable[[models.User], bool],
    removed_business_extract_whatsapp_phone_from_value: Callable[..., str | None],
    removed_business_normalize_phone: Callable[[str | None], str | None],
    removed_business_handle_incoming_order_payload: Callable[..., Awaitable[dict[str, Any]]],
    get_personal_prefix_mode_settings: Callable[..., Awaitable[tuple[bool, str]]],
    strip_personal_prefix: Callable[[str, str], str | None],
    process_bot_input: Callable[..., Awaitable[dict[str, Any]]],
    removed_business_access_enabled_for_user: Callable[..., Awaitable[bool]] | None = None,
) -> dict[str, Any]:
    ensure_valid_whatsapp_worker_request(request)

    media_payload: bytes | None = None
    text = (payload.text or "").strip()
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Message too long.")

    text = sanitize_input(text)
    payload.text = text

    remote_jid = str(getattr(payload, "remote_jid", "") or "")
    if remote_jid == "status@broadcast" or remote_jid.endswith("@broadcast") or remote_jid.endswith("@newsletter"):
        return {"reply": None}

    if payload.media_base64:
        try:
            media_payload = base64.b64decode(payload.media_base64, validate=True)
        except (ValueError, binascii.Error):
            return {
                "reply": "Invalid media payload."
                if text.lower().startswith("lang en")
                else "Media tidak sah."
            }

    source_channel = "whatsapp_group" if payload.group_jid else "whatsapp"
    show_current_balance, show_expense_amount, show_income_amount = await get_whatsapp_group_privacy_settings(
        db,
        user_id=payload.user_id,
        group_jid=payload.group_jid,
    )
    message_key = build_whatsapp_message_key(payload, media_payload)
    is_new_event = await mark_whatsapp_event_if_new(
        db,
        user_id=payload.user_id,
        source_channel=source_channel,
        message_key=message_key,
    )
    if not is_new_event:
        return {"reply": None}

    if source_channel == "whatsapp":
        linked_phone_result = await db.execute(select(models.WhatsAppLink).where(models.WhatsAppLink.user_id == payload.user_id))
        linked_phone_row = linked_phone_result.scalar_one_or_none()
        linked_phone = removed_business_normalize_phone(getattr(linked_phone_row, "phone", None))
        incoming_phone = (
            removed_business_extract_whatsapp_phone_from_value(payload.phone, allow_group=False)
            or removed_business_normalize_phone(payload.phone)
            or removed_business_extract_whatsapp_phone_from_value(payload.remote_jid, allow_group=False)
            or removed_business_extract_whatsapp_phone_from_value(payload.participant_jid, allow_group=False)
            or removed_business_normalize_phone(payload.remote_jid)
            or removed_business_normalize_phone(payload.participant_jid)
        )
        is_real_self_chat = bool(payload.is_self_chat)
        if linked_phone and incoming_phone and incoming_phone == linked_phone:
            is_real_self_chat = True

        # [DO-NOT-CHANGE] !ORDER messages skip removed_business handler, go to bot processor directly
        is_direct_order = bool(text and ("!ORDER" in text or "!order" in text))

        if payload.from_me and incoming_phone and not is_real_self_chat and not is_direct_order:
            setting_res = await db.execute(
                select(models.BusinessPaymentSetting.allow_owner_whatsapp_order_proxy).where(
                    models.BusinessPaymentSetting.user_id == payload.user_id
                )
            )
            allow_owner_order = bool(setting_res.scalar_one_or_none())
            if allow_owner_order:
                user_res = await db.execute(select(models.User).where(models.User.id == payload.user_id))
                webhook_user = user_res.scalar_one_or_none()
                if webhook_user and (await removed_business_access_enabled_for_user(db, webhook_user) if removed_business_access_enabled_for_user else removed_business_access_enabled(webhook_user)):
                    removed_business_result = await removed_business_handle_incoming_order_payload(
                        db,
                        user_id=payload.user_id,
                        source="whatsapp",
                        text=text,
                        customer_name=(payload.customer_name or payload.push_name or "Customer").strip() or "Customer",
                        customer_phone=incoming_phone,
                        receipt_url=None,
                        has_receipt_media=bool(media_payload),
                        receipt_payload=media_payload,
                        receipt_mime_type=payload.media_mime_type,
                        receipt_file_name=payload.media_file_name,
                        latitude=payload.latitude,
                        longitude=payload.longitude,
                        location_name=payload.location_name,
                        bypass_whatsapp_prefix=True,
                    )
                    removed_business_status = str((removed_business_result or {}).get("status") or "")
                    if removed_business_status not in {
                        "ignored",
                        "ignored_whatsapp_non_removed_business",
                        "ignored_receipt_without_confirmed_order",
                        "ignored_receipt_before_payment_stage",
                        "ignored_receipt_without_payment_stage_order",
                    }:
                        return removed_business_result

        if media_payload and not payload.from_me:
            user_res = await db.execute(select(models.User).where(models.User.id == payload.user_id))
            webhook_user = user_res.scalar_one_or_none()
            if webhook_user and (await removed_business_access_enabled_for_user(db, webhook_user) if removed_business_access_enabled_for_user else removed_business_access_enabled(webhook_user)) and not is_real_self_chat:
                resolved_customer_name = (payload.customer_name or payload.push_name or "").strip() or None
                resolved_customer_phone = incoming_phone
                if resolved_customer_phone and not (linked_phone and resolved_customer_phone == linked_phone):
                    removed_business_result = await removed_business_handle_incoming_order_payload(
                        db,
                        user_id=payload.user_id,
                        source="whatsapp",
                        text=text,
                        customer_name=resolved_customer_name,
                        customer_phone=resolved_customer_phone,
                        receipt_url=None,
                        has_receipt_media=True,
                        receipt_payload=media_payload,
                        receipt_mime_type=payload.media_mime_type,
                        receipt_file_name=payload.media_file_name,
                        latitude=payload.latitude,
                        longitude=payload.longitude,
                        location_name=payload.location_name,
                    )
                    removed_business_status = str((removed_business_result or {}).get("status") or "")
                    if removed_business_status not in {
                        "ignored",
                        "ignored_whatsapp_prefix",
                        "ignored_whatsapp_prefix_unset",
                        "ignored_whatsapp_non_removed_business",
                        "ignored_receipt_without_confirmed_order",
                        "ignored_receipt_before_payment_stage",
                        "ignored_receipt_without_payment_stage_order",
                    }:
                        return removed_business_result
                return {"reply": None}
            if not is_real_self_chat:
                return {"reply": None}

        if not is_real_self_chat:
            if payload.from_me and not media_payload:
                return {"reply": None}
            if not payload.from_me:
                user_res = await db.execute(select(models.User).where(models.User.id == payload.user_id))
                webhook_user = user_res.scalar_one_or_none()
                if not webhook_user or not (await removed_business_access_enabled_for_user(db, webhook_user) if removed_business_access_enabled_for_user else removed_business_access_enabled(webhook_user)):
                    return {"reply": None}
                resolved_customer_name = (payload.customer_name or payload.push_name or "").strip() or None
                resolved_customer_phone = incoming_phone
                if not resolved_customer_phone or (linked_phone and resolved_customer_phone == linked_phone):
                    return {"reply": None}
                removed_business_result = await removed_business_handle_incoming_order_payload(
                    db,
                    user_id=payload.user_id,
                    source="whatsapp",
                    text=text,
                    customer_name=resolved_customer_name,
                    customer_phone=resolved_customer_phone,
                    receipt_url=None,
                    has_receipt_media=bool(media_payload),
                    receipt_payload=media_payload,
                    receipt_mime_type=payload.media_mime_type,
                    receipt_file_name=payload.media_file_name,
                    latitude=payload.latitude,
                    longitude=payload.longitude,
                    location_name=payload.location_name,
                )
                removed_business_status = str((removed_business_result or {}).get("status") or "")
                if removed_business_status not in {
                    "ignored",
                    "ignored_whatsapp_prefix",
                    "ignored_whatsapp_prefix_unset",
                    "ignored_whatsapp_non_removed_business",
                    "ignored_whatsapp_catalog_code_required",
                    "ignored_receipt_without_confirmed_order",
                    "ignored_receipt_before_payment_stage",
                    "ignored_receipt_without_payment_stage_order",
                }:
                    return removed_business_result
                # [DO-NOT-CHANGE] Don't return early — let ignored messages fall through to process_bot_input
                # so features like ORD- order lookup still work for external customer messages.

        if media_payload:
            if not payload.from_me:
                return {"reply": None}
            if not is_real_self_chat and (not linked_phone or not incoming_phone or incoming_phone != linked_phone):
                return {"reply": None}

        # ORD- lookup — respond with order details for valid order numbers (works for self & non-self)
        ord_match = re.search(r'\b(ORD-[A-Z0-9]{4}-[A-Z0-9]{4})\b', text or "", re.IGNORECASE)
        if ord_match:
            order_no = ord_match.group(0).upper()
            try:
                ord_result = await db.execute(
                    select(models.BusinessOrder).where(
                        models.BusinessOrder.order_no == order_no,
                        models.BusinessOrder.user_id == payload.user_id,
                    )
                )
                order = ord_result.scalar_one_or_none()
                if order:
                    status_label = order.status.replace("_", " ").title()
                    amt = float(order.amount or 0)
                    reply_parts = [
                        f"*Order #{order.order_no}*",
                        f"Status: {status_label}",
                        f"Customer: {order.customer_name or '-'}",
                        f"Item: {order.item_name}",
                    ]
                    if amt > 0:
                        reply_parts.append(f"Total: RM{amt:,.2f}")
                    if order.order_mode:
                        reply_parts.append(f"Mode: {order.order_mode.title()}")
                    return {"reply": "\n".join(reply_parts)}
            except Exception:
                pass
            return {"reply": None}

        # Personal bot & prefix only for self-chat — silently block non-self-chat
        if source_channel == "whatsapp" and not is_real_self_chat:
            return {"reply": None}

        prefix_mode_enabled, personal_trigger_prefix = await get_personal_prefix_mode_settings(
            db,
            user_id=payload.user_id,
        )
        if prefix_mode_enabled:
            has_non_text_payload = bool(media_payload) or payload.latitude is not None or payload.longitude is not None or bool(payload.target_txn_ref)
            stripped_text = strip_personal_prefix(text, personal_trigger_prefix)
            if stripped_text is None:
                if has_non_text_payload:
                    stripped_text = text
                else:
                    user_res = await db.execute(select(models.User).where(models.User.id == payload.user_id))
                    user = user_res.scalar_one_or_none()
                    is_en = getattr(user, "language", "BM") == "EN" if user else False
                    if is_en:
                        return {"reply": f"Personal trigger is active. Start your message with `{personal_trigger_prefix} ...` or turn it off in WhatsApp settings."}
                    return {"reply": f"Trigger personal sedang aktif. Mulakan mesej dengan `{personal_trigger_prefix} ...` atau matikan di tetapan WhatsApp."}
            text = stripped_text

    return await process_bot_input(
        db,
        user_id=payload.user_id,
        phone=payload.phone,
        text=text,
        media_payload=media_payload,
        media_mime_type=payload.media_mime_type,
        media_file_name=payload.media_file_name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        location_name=payload.location_name,
        target_txn_ref=payload.target_txn_ref,
        source_channel=source_channel,
        is_reply_message=payload.is_reply_message,
        show_current_balance=show_current_balance,
        show_expense_amount=show_expense_amount,
        show_income_amount=show_income_amount,
    )
