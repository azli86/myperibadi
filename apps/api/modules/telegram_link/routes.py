from __future__ import annotations

from datetime import datetime, timedelta
from typing import Awaitable, Callable

from fastapi import HTTPException, Request
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas


async def internal_push_whatsapp_reconnect_route(
    *,
    payload: schemas.InternalWhatsAppReconnectPushRequest,
    request: Request,
    ensure_valid_whatsapp_worker_request: Callable[[Request], None],
    notify_whatsapp_reconnect: Callable[..., None],
) -> dict[str, bool]:
    ensure_valid_whatsapp_worker_request(request)
    user_id = (payload.user_id or "").strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    notify_whatsapp_reconnect(user_id=user_id, reason=payload.reason or "session_error")
    return {"ok": True}


async def request_telegram_link_route(
    *,
    current_user: models.User,
    db: AsyncSession,
    generate_telegram_pair_code: Callable[[], str],
    telegram_pair_code_ttl_minutes: int,
    telegram_bot_username: str,
) -> dict:
    now = datetime.utcnow()
    await db.execute(
        update(models.TelegramPairCode)
        .where(
            models.TelegramPairCode.user_id == current_user.id,
            models.TelegramPairCode.consumed_at.is_(None),
            models.TelegramPairCode.expires_at >= now,
        )
        .values(consumed_at=now)
    )
    code = generate_telegram_pair_code()
    expires_at = now + timedelta(minutes=telegram_pair_code_ttl_minutes)
    db.add(models.TelegramPairCode(user_id=current_user.id, code=code, expires_at=expires_at))
    await db.commit()
    return {
        "code": code,
        "expires_at": expires_at,
        "bot_username": telegram_bot_username,
    }


async def get_telegram_link_status_route(
    *,
    current_user: models.User,
    db: AsyncSession,
    get_telegram_link_by_user_id: Callable[..., Awaitable[models.TelegramLink | None]],
    telegram_bot_username: str,
) -> dict:
    link = await get_telegram_link_by_user_id(db, current_user.id)
    if not link:
        return {"is_connected": False, "bot_username": telegram_bot_username}
    return {
        "is_connected": True,
        "telegram_username": link.telegram_username,
        "telegram_user_id": link.telegram_user_id,
        "telegram_chat_id": link.telegram_chat_id,
        "linked_at": link.linked_at,
        "bot_username": telegram_bot_username,
    }


async def unlink_telegram_route(
    *,
    current_user: models.User,
    db: AsyncSession,
    get_telegram_link_by_user_id: Callable[..., Awaitable[models.TelegramLink | None]],
) -> dict[str, bool]:
    link = await get_telegram_link_by_user_id(db, current_user.id)
    if link:
        link.is_active = False
        link.updated_at = datetime.utcnow()
        await db.commit()
    return {"ok": True}
