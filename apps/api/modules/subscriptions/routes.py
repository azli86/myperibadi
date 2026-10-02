from __future__ import annotations

from datetime import date, datetime
from typing import Awaitable, Callable, Optional

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas
import whatsapp_service


async def _last_payment_date(db: AsyncSession, user_id: str, sub: models.Subscription) -> Optional[date]:
    """The latest payment that still counts: a transaction after the last reset, else the stored date."""
    stmt = select(func.max(models.Transaction.txn_date)).where(
        models.Transaction.user_id == user_id,
        models.Transaction.subscription_id == sub.id,
    )
    if sub.due_reset_at:
        stmt = stmt.where(models.Transaction.txn_date > sub.due_reset_at)
    txn_max = await db.scalar(stmt)
    if txn_max:
        return txn_max
    column = sub.last_payment_date
    if column and sub.due_reset_at and column <= sub.due_reset_at:
        return None
    return column


async def _validate_category(db: AsyncSession, current_user: models.User, household_id: Optional[int], category_id: Optional[int]) -> None:
    """A category must be one of this household's own (it was accepted from anyone)."""
    if category_id is None:
        return
    cat = await db.get(models.Category, int(category_id))
    if cat is None or cat.household_id != household_id or cat.is_internal:
        raise HTTPException(status_code=400, detail="Category not found.")


async def get_subscriptions_route(
    *,
    include_settled: bool,
    db: AsyncSession,
    current_user: models.User,
) -> list[schemas.SubscriptionResponse]:
    query = select(models.Subscription).where(models.Subscription.user_id == current_user.id)
    if not include_settled:
        query = query.where(models.Subscription.status == "active")
    result = await db.execute(
        query.order_by(models.Subscription.due_day_of_month.asc(), models.Subscription.name.asc(), models.Subscription.id.asc())
    )
    rows = list(result.scalars().all())
    response = []
    for c in rows:
        paid = await _last_payment_date(db, current_user.id, c)
        response.append(_serialize_subscription(c, paid))
    return response


def _serialize_subscription(c: models.Subscription, last_payment_date: Optional[date] = None) -> schemas.SubscriptionResponse:
    return schemas.SubscriptionResponse(
        id=int(c.id),
        name=str(c.name),
        key=str(c.key),
        amount=float(c.amount),
        due_day_of_month=int(c.due_day_of_month),
        notes=c.notes,
        status=str(c.status),
        category_id=int(c.category_id) if c.category_id is not None else None,
        start_date=c.start_date.strftime("%Y-%m-%d"),
        last_payment_date=last_payment_date.isoformat() if last_payment_date else None,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


async def create_subscription_route(
    *,
    payload: schemas.SubscriptionCreate,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
    current_business_date_fn: Callable[[], date],
) -> schemas.SubscriptionResponse:
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Subscription name is required.")
    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero.")
    due_day = int(payload.due_day_of_month)
    if due_day < 1 or due_day > 31:
        raise HTTPException(status_code=400, detail="due_day_of_month must be between 1 and 31.")
    household_id = await ensure_current_user_household(db, current_user)
    await _validate_category(db, current_user, household_id, payload.category_id)
    key = whatsapp_service.counterparty_key(name)
    existing = await db.execute(
        select(models.Subscription).where(models.Subscription.user_id == current_user.id, models.Subscription.key == key)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Subscription already exists.")
    c = models.Subscription(
        user_id=current_user.id,
        household_id=household_id,
        name=name,
        key=key,
        amount=amount,
        due_day_of_month=due_day,
        notes=(payload.notes or "").strip() or None,
        category_id=payload.category_id,
        status="active",
        start_date=current_business_date_fn(),
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return _serialize_subscription(c, await _last_payment_date(db, current_user.id, c))


async def update_subscription_route(
    *,
    subscription_id: int,
    payload: schemas.SubscriptionUpdate,
    db: AsyncSession,
    current_user: models.User,
) -> schemas.SubscriptionResponse:
    result = await db.execute(
        select(models.Subscription).where(models.Subscription.id == subscription_id, models.Subscription.user_id == current_user.id)
    )
    c = result.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Subscription not found.")
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return _serialize_subscription(c, await _last_payment_date(db, current_user.id, c))
    if "name" in updates:
        name = str(payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Subscription name is required.")
        key = whatsapp_service.counterparty_key(name)
        dup = await db.execute(
            select(models.Subscription).where(
                models.Subscription.user_id == current_user.id,
                models.Subscription.key == key,
                models.Subscription.id != c.id,
            )
        )
        if dup.scalars().first():
            raise HTTPException(status_code=400, detail="Subscription already exists.")
        c.name = name
        c.key = key
        await db.execute(
            update(models.Transaction)
            .where(models.Transaction.user_id == current_user.id, models.Transaction.subscription_id == c.id)
            .values(vendor_or_source=f"SUBX {name}")
        )
    if "amount" in updates:
        amt = float(payload.amount or 0)
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than zero.")
        c.amount = amt
    if "due_day_of_month" in updates:
        dd = int(payload.due_day_of_month or 1)
        if dd < 1 or dd > 31:
            raise HTTPException(status_code=400, detail="due_day_of_month must be between 1 and 31.")
        c.due_day_of_month = dd
    if "notes" in updates:
        c.notes = (payload.notes or "").strip() or None
    if "category_id" in updates:
        await _validate_category(db, current_user, c.household_id, payload.category_id)
        c.category_id = payload.category_id
    if "status" in updates and payload.status:
        if payload.status not in ("active", "settled"):
            raise HTTPException(status_code=400, detail="Status must be 'active' or 'settled'.")
        c.status = payload.status
    await db.commit()
    await db.refresh(c)
    return _serialize_subscription(c, await _last_payment_date(db, current_user.id, c))


async def get_subscription_route(
    *,
    subscription_id: int,
    db: AsyncSession,
    current_user: models.User,
) -> schemas.SubscriptionResponse:
    result = await db.execute(
        select(models.Subscription).where(models.Subscription.id == subscription_id, models.Subscription.user_id == current_user.id)
    )
    c = result.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Subscription not found.")
    return _serialize_subscription(c, await _last_payment_date(db, current_user.id, c))


async def delete_subscription_route(
    *,
    subscription_id: int,
    db: AsyncSession,
    current_user: models.User,
) -> dict[str, bool]:
    result = await db.execute(
        select(models.Subscription).where(models.Subscription.id == subscription_id, models.Subscription.user_id == current_user.id)
    )
    c = result.scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Subscription not found.")
    await db.delete(c)
    await db.commit()
    return {"ok": True}
