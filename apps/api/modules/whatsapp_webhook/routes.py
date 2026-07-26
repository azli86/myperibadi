from __future__ import annotations

import base64
import binascii
import re
from typing import Any, Awaitable, Callable

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models


def normalize_whatsapp_phone(phone: str | None) -> str | None:
    value = re.sub(r"[^0-9+]", "", (phone or "").strip())
    return value or None


def is_plausible_phone_digits(digits: str) -> bool:
    cleaned = re.sub(r"[^0-9]", "", digits or "")
    if not cleaned:
        return False
    if len(cleaned) < 8 or len(cleaned) > 15:
        return False
    if cleaned == (cleaned[:1] * len(cleaned)):
        return False
    return True


def extract_whatsapp_phone_from_value(value: Any, *, allow_group: bool = False) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    lowered = raw.lower()
    if lowered in {"status@broadcast", "broadcast"}:
        return None
    body = raw
    domain = ""
    if "@" in raw:
        body, domain = raw.split("@", 1)
        domain = domain.strip().lower()
        if domain == "g.us" and not allow_group:
            return None
        if domain and domain not in {"s.whatsapp.net", "c.us", "g.us", "lid"}:
            return None
    body = body.split(":", 1)[0].strip()
    digits = re.sub(r"[^0-9+]", "", body)
    if digits.startswith("+"):
        digits = digits[1:]
    if digits.startswith("00"):
        digits = digits[2:]
    if not is_plausible_phone_digits(digits):
        return None
    return digits


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
    get_personal_prefix_mode_settings: Callable[..., Awaitable[tuple[bool, str]]],
    strip_personal_prefix: Callable[[str, str], str | None],
    process_bot_input: Callable[..., Awaitable[dict[str, Any]]],
    **_ignored: Any,
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
        linked_phone = normalize_whatsapp_phone(getattr(linked_phone_row, "phone", None))
        incoming_phone = (
            extract_whatsapp_phone_from_value(payload.phone, allow_group=False)
            or normalize_whatsapp_phone(payload.phone)
            or extract_whatsapp_phone_from_value(payload.remote_jid, allow_group=False)
            or extract_whatsapp_phone_from_value(payload.participant_jid, allow_group=False)
            or normalize_whatsapp_phone(payload.remote_jid)
            or normalize_whatsapp_phone(payload.participant_jid)
        )
        is_real_self_chat = bool(payload.is_self_chat)
        if linked_phone and incoming_phone and incoming_phone == linked_phone:
            is_real_self_chat = True

        if media_payload:
            if not payload.from_me:
                return {"reply": None}
            if not is_real_self_chat and (not linked_phone or not incoming_phone or incoming_phone != linked_phone):
                return {"reply": None}

        # Personal bot only for self-chat
        if not is_real_self_chat:
            if payload.from_me and not media_payload:
                return {"reply": None}
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
