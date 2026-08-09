"""User-scoped query helpers for My Event."""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import models


async def ensure_household(db: AsyncSession, current_user: models.User) -> Optional[int]:
    household_id = current_user.default_household_id
    if household_id:
        return int(household_id)
    try:
        import whatsapp_service

        household_id = await whatsapp_service.ensure_standard_categories(db, current_user.id)
        await db.commit()
        await db.refresh(current_user)
        return int(household_id) if household_id else None
    except Exception:
        return None


async def get_event_or_404(
    db: AsyncSession,
    *,
    event_id: int,
    user_id: str,
) -> models.Event:
    result = await db.execute(
        select(models.Event).where(
            models.Event.id == event_id,
            models.Event.user_id == user_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found.")
    return row


async def list_events(
    db: AsyncSession,
    *,
    user_id: str,
    search: Optional[str] = None,
) -> list[models.Event]:
    query = select(models.Event).where(models.Event.user_id == user_id)
    term = (search or "").strip()
    if term:
        like = f"%{term}%"
        query = query.where(models.Event.name.ilike(like))
    query = query.order_by(
        models.Event.end_date.asc().nullslast(),
        models.Event.name.asc(),
        models.Event.id.asc(),
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_wallet_or_404(
    db: AsyncSession,
    *,
    wallet_id: int,
    user_id: str,
) -> models.Wallet:
    result = await db.execute(
        select(models.Wallet).where(
            models.Wallet.id == wallet_id,
            or_(
                models.Wallet.owner_user_id == user_id,
                models.Wallet.owner_user_id.is_(None),
            ),
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Wallet not found.")
    return row
