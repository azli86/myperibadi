"""User-scoped query helpers for My Event."""

from __future__ import annotations

from datetime import date
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

def event_membership_condition(event: models.Event) -> Optional[object]:
    """SQL predicate selecting the transactions that belong to an event.

    Membership is derived, never stored: a transaction counts when its date falls
    inside [start_date, end_date] and its wallet matches the event's wallet (all
    wallets when the event has none). An event without a start date or without an
    end date cannot claim anything, so it returns None and callers return no rows.
    """
    if event.start_date is None or event.end_date is None:
        return None
    conditions = [
        models.Transaction.user_id == event.user_id,
        models.Transaction.txn_date >= event.start_date,
        models.Transaction.txn_date <= event.end_date,
        ~select(models.EventTransactionExclusion.id)
        .where(
            models.EventTransactionExclusion.event_id == event.id,
            models.EventTransactionExclusion.transaction_id == models.Transaction.id,
        )
        .exists(),
    ]
    if event.wallet_id is not None:
        conditions.append(models.Transaction.wallet_id == event.wallet_id)
    return conditions

async def list_event_transactions(
    db: AsyncSession,
    *,
    event: models.Event,
) -> list[models.Transaction]:
    conditions = event_membership_condition(event)
    if conditions is None:
        return []
    result = await db.execute(
        select(models.Transaction).where(*conditions).order_by(
            models.Transaction.txn_date.asc(),
            models.Transaction.id.asc(),
        )
    )
    return list(result.scalars().all())

async def event_spend_totals(
    db: AsyncSession,
    *,
    events: list[models.Event],
) -> dict[int, float]:
    """Expense total per event, for the summary cards. One query per event is
    fine at this scale (list_events returns a user's own handful of events) and
    keeps the derived-membership rule in a single place."""
    totals: dict[int, float] = {}
    for event in events:
        conditions = event_membership_condition(event)
        if conditions is None:
            totals[int(event.id)] = 0.0
            continue
        result = await db.execute(
            select(func.coalesce(func.sum(models.Transaction.amount), 0)).where(
                *conditions,
                models.Transaction.type == "expense",
            )
        )
        totals[int(event.id)] = float(result.scalar() or 0)
    return totals

async def event_transaction_counts(
    db: AsyncSession,
    *,
    events: list[models.Event],
) -> dict[int, int]:
    counts: dict[int, int] = {}
    for event in events:
        conditions = event_membership_condition(event)
        if conditions is None:
            counts[int(event.id)] = 0
            continue
        result = await db.execute(select(func.count()).select_from(models.Transaction).where(*conditions))
        counts[int(event.id)] = int(result.scalar() or 0)
    return counts

async def wallet_name_map(db: AsyncSession, *, wallet_ids: list[int]) -> dict[int, str]:
    unique = sorted({int(w) for w in wallet_ids})
    if not unique:
        return {}
    result = await db.execute(
        select(models.Wallet.id, models.Wallet.name).where(models.Wallet.id.in_(unique))
    )
    return {int(wid): name for wid, name in result.all()}

async def set_transaction_in_event(
    db: AsyncSession,
    *,
    event: models.Event,
    transaction_id: int,
    included: bool,
) -> None:
    """Include or detach a transaction. Including is the default, so it only
    needs to clear a previous exclusion; excluding records one."""
    if included:
        existing = await db.execute(
            select(models.EventTransactionExclusion).where(
                models.EventTransactionExclusion.event_id == event.id,
                models.EventTransactionExclusion.transaction_id == transaction_id,
            )
        )
        row = existing.scalars().first()
        if row:
            await db.delete(row)
            await db.commit()
        return

    # Already detached? Nothing to do. Checked before the membership test below,
    # because once excluded the transaction no longer qualifies as a member and
    # that check would wrongly report it as missing.
    existing = await db.execute(
        select(models.EventTransactionExclusion.id).where(
            models.EventTransactionExclusion.event_id == event.id,
            models.EventTransactionExclusion.transaction_id == transaction_id,
        )
    )
    if existing.scalar() is not None:
        return

    conditions = event_membership_condition(event)
    if conditions is None:
        raise HTTPException(status_code=400, detail="Event has no date range.")
    member = await db.execute(
        select(models.Transaction.id).where(
            *conditions,
            models.Transaction.id == transaction_id,
        )
    )
    if member.scalar() is None:
        raise HTTPException(status_code=404, detail="Transaction is not in this event.")
    db.add(
        models.EventTransactionExclusion(
            event_id=event.id,
            transaction_id=transaction_id,
            user_id=event.user_id,
        )
    )
    await db.commit()
