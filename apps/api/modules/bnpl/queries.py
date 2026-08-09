"""User-scoped query helpers for My BNPL."""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_, select
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

async def get_bnpl_or_404(
    db: AsyncSession,
    *,
    bnpl_id: int,
    user_id: str,
) -> models.Bnpl:
    result = await db.execute(
        select(models.Bnpl).where(
            models.Bnpl.id == bnpl_id,
            models.Bnpl.user_id == user_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="BNPL not found.")
    return row

async def list_bnpl(
    db: AsyncSession,
    *,
    user_id: str,
    include_settled: bool = False,
) -> list[models.Bnpl]:
    query = select(models.Bnpl).where(models.Bnpl.user_id == user_id)
    if not include_settled:
        query = query.where(models.Bnpl.status == "active")
    query = query.order_by(
        models.Bnpl.due_day_of_month.asc(),
        models.Bnpl.name.asc(),
        models.Bnpl.id.asc(),
    )
    result = await db.execute(query)
    return list(result.scalars().all())

async def get_category_or_404(
    db: AsyncSession,
    *,
    category_id: int,
    household_id: Optional[int],
) -> models.Category:
    query = select(models.Category).where(models.Category.id == category_id)
    if household_id:
        query = query.where(models.Category.household_id == household_id)
    result = await db.execute(query)
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found.")
    return row

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

async def get_default_wallet(
    db: AsyncSession,
    *,
    user_id: str,
    household_id: Optional[int] = None,
) -> Optional[models.Wallet]:
    query = select(models.Wallet).where(
        models.Wallet.status == "active",
        or_(
            models.Wallet.owner_user_id == user_id,
            models.Wallet.owner_user_id.is_(None),
        ),
    )
    query = query.order_by(
        models.Wallet.is_bot_default.desc(),
        models.Wallet.id.asc(),
    )
    result = await db.execute(query.limit(1))
    return result.scalars().first()

async def count_payments(db: AsyncSession, *, bnpl_id: int) -> float:
    total = await db.scalar(
        select(func.coalesce(func.sum(models.BnplPayment.amount), 0)).where(
            models.BnplPayment.bnpl_id == bnpl_id,
        )
    )
    return float(total or 0)
