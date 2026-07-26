from __future__ import annotations

from datetime import datetime
from typing import Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import models


async def get_telegram_link_by_user_id_route(
    *,
    db: AsyncSession,
    user_id: str,
) -> models.TelegramLink | None:
    res = await db.execute(
        select(models.TelegramLink)
        .where(models.TelegramLink.user_id == user_id, models.TelegramLink.is_active == True)
        .order_by(models.TelegramLink.id.desc())
    )
    return res.scalars().first()


async def get_telegram_link_by_identity_route(
    *,
    db: AsyncSession,
    telegram_user_id: str,
) -> models.TelegramLink | None:
    res = await db.execute(
        select(models.TelegramLink)
        .where(models.TelegramLink.telegram_user_id == telegram_user_id, models.TelegramLink.is_active == True)
        .order_by(models.TelegramLink.id.desc())
    )
    return res.scalars().first()


async def get_telegram_link_by_identity_any_state_route(
    *,
    db: AsyncSession,
    telegram_user_id: str,
) -> models.TelegramLink | None:
    res = await db.execute(
        select(models.TelegramLink)
        .where(models.TelegramLink.telegram_user_id == telegram_user_id)
        .order_by(models.TelegramLink.id.desc())
    )
    return res.scalars().first()


async def mark_telegram_event_if_new_route(
    *,
    db: AsyncSession,
    telegram_user_id: str,
    telegram_chat_id: str,
    message_key: str,
) -> bool:
    inbound_event = models.TelegramInboundEvent(
        telegram_user_id=telegram_user_id,
        telegram_chat_id=telegram_chat_id,
        message_key=message_key,
    )
    db.add(inbound_event)
    try:
        await db.commit()
        return True
    except IntegrityError:
        await db.rollback()
        return False


async def consume_telegram_pair_code_route(
    *,
    db: AsyncSession,
    code: str,
    telegram_user_id: str,
    telegram_chat_id: str,
    telegram_username: str | None,
    telegram_first_name: str | None,
    telegram_last_name: str | None,
    telegram_pair_code_max_attempts: int,
    get_telegram_link_by_identity: Callable[..., Awaitable[models.TelegramLink | None]],
    get_telegram_link_by_user_id: Callable[..., Awaitable[models.TelegramLink | None]],
    get_telegram_link_by_identity_any_state: Callable[..., Awaitable[models.TelegramLink | None]],
) -> str | None:
    normalized_code = (code or "").strip().upper()
    if not normalized_code:
        return None

    res = await db.execute(
        select(models.TelegramPairCode)
        .where(models.TelegramPairCode.code == normalized_code)
        .order_by(models.TelegramPairCode.id.desc())
    )
    pair_code = res.scalars().first()
    if not pair_code:
        return None

    pair_code.attempt_count = int(pair_code.attempt_count or 0) + 1
    now = datetime.utcnow()
    if pair_code.consumed_at is not None or pair_code.expires_at < now or pair_code.attempt_count > telegram_pair_code_max_attempts:
        if pair_code.attempt_count > telegram_pair_code_max_attempts and pair_code.consumed_at is None:
            pair_code.consumed_at = now
        await db.commit()
        return None

    existing = await get_telegram_link_by_identity(db=db, telegram_user_id=telegram_user_id)
    if existing and existing.user_id != pair_code.user_id:
        await db.commit()
        return None

    current = await get_telegram_link_by_user_id(db=db, user_id=pair_code.user_id)
    existing_any = await get_telegram_link_by_identity_any_state(db=db, telegram_user_id=telegram_user_id)
    target_link = current or existing_any
    if target_link:
        target_link.user_id = pair_code.user_id
        target_link.telegram_user_id = telegram_user_id
        target_link.telegram_chat_id = telegram_chat_id
        target_link.telegram_username = telegram_username
        target_link.telegram_first_name = telegram_first_name
        target_link.telegram_last_name = telegram_last_name
        target_link.is_active = True
        target_link.linked_at = now
    else:
        db.add(models.TelegramLink(
            user_id=pair_code.user_id,
            telegram_user_id=telegram_user_id,
            telegram_chat_id=telegram_chat_id,
            telegram_username=telegram_username,
            telegram_first_name=telegram_first_name,
            telegram_last_name=telegram_last_name,
            is_active=True,
            linked_at=now,
        ))

    pair_code.consumed_at = now
    await db.commit()
    return pair_code.user_id
