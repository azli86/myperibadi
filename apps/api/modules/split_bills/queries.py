"""User-scoped query helpers for Split Bill."""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import models


def _base_split_query():
    return select(models.SplitBill).options(
        selectinload(models.SplitBill.payments)
    )


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


async def get_split_or_404(
    db: AsyncSession,
    *,
    split_id: int,
    user_id: str,
) -> models.SplitBill:
    result = await db.execute(
        _base_split_query().where(
            models.SplitBill.id == split_id,
            models.SplitBill.user_id == user_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Split bill not found.")
    return row


async def list_splits(
    db: AsyncSession,
    *,
    user_id: str,
    search: Optional[str] = None,
) -> list[models.SplitBill]:
    query = _base_split_query().where(models.SplitBill.user_id == user_id)
    term = (search or "").strip()
    if term:
        query = query.where(models.SplitBill.title.ilike(f"%{term}%"))
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


async def get_transaction_or_404(
    db: AsyncSession,
    *,
    transaction_id: int,
    user_id: str,
) -> models.Transaction:
    result = await db.execute(
        select(models.Transaction).where(
            models.Transaction.id == transaction_id,
            models.Transaction.user_id == user_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return row


async def get_split_for_transaction(
    db: AsyncSession,
    *,
    transaction_id: int,
    user_id: str,
) -> Optional[models.SplitBill]:
    result = await db.execute(
        select(models.SplitBill).where(
            models.SplitBill.transaction_id == transaction_id,
            models.SplitBill.user_id == user_id,
            models.SplitBill.status.in_(["active", "partial"]),
        )
    )
    return result.scalars().first()


async def find_or_create_reimbursement_category(
    db: AsyncSession,
    *,
    household_id: Optional[int],
) -> models.Category:
    """Return the 'Split reimbursement' income category, creating it if missing."""
    result = await db.execute(
        select(models.Category).where(
            models.Category.system_code == "split_reimbursement",
        )
    )
    cat = result.scalars().first()
    if cat:
        return cat
    cat = models.Category(
        name="Split Reimbursement",
        icon_name="hand-coins",
        kind="income",
        is_default=False,
        is_internal=True,
        system_code="split_reimbursement",
        household_id=household_id,
    )
    db.add(cat)
    await db.flush()
    return cat
