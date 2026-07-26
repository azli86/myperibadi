from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas


def _last_day_of_month(year: int, month: int) -> int:
    return monthrange(year, month)[1]


def _due_date_for_month(year: int, month: int, due_day: int) -> date:
    last_day = _last_day_of_month(year, month)
    return date(year, month, min(due_day, last_day))


def _compute_checkoff_period(due_day: int, today: date) -> tuple[date, date]:
    current_due = _due_date_for_month(today.year, today.month, due_day)
    if today >= current_due:
        period_start = current_due
        next_month = today.replace(day=1) + timedelta(days=32)
        period_end = _due_date_for_month(next_month.year, next_month.month, due_day)
    else:
        prev_month = (today.replace(day=1) - timedelta(days=1))
        period_start = _due_date_for_month(prev_month.year, prev_month.month, due_day)
        period_end = current_due
    return period_start, period_end


def _item_due_day(item_type: str, item) -> int:
    if item_type == "subscription":
        return int(item.due_day_of_month or 1)
    return int(getattr(item, "due_day_of_month", None) or 1)


async def get_monthly_checkoffs_route(
    *,
    today: date,
    db: AsyncSession,
    current_user: models.User,
) -> list[schemas.MonthlyCheckoffResponse]:
    result = await db.execute(
        select(models.MonthlyCheckoff).where(
            models.MonthlyCheckoff.user_id == current_user.id,
            models.MonthlyCheckoff.period_start <= today,
            models.MonthlyCheckoff.period_end >= today,
        )
    )
    rows = list(result.scalars().all())
    return [
        schemas.MonthlyCheckoffResponse(
            id=int(row.id),
            item_type=row.item_type,
            item_id=int(row.item_id),
            period_start=row.period_start.strftime("%Y-%m-%d"),
            period_end=row.period_end.strftime("%Y-%m-%d"),
            created_at=row.created_at,
        )
        for row in rows
    ]


async def create_monthly_checkoff_route(
    *,
    payload: schemas.MonthlyCheckoffCreate,
    db: AsyncSession,
    current_user: models.User,
    ensure_current_user_household: Callable[..., Awaitable[int]],
) -> schemas.MonthlyCheckoffResponse:
    if payload.item_type == "loan":
        item_result = await db.execute(
            select(models.Loan).where(
                models.Loan.id == payload.item_id,
                models.Loan.user_id == current_user.id,
            )
        )
    else:
        item_result = await db.execute(
            select(models.Subscription).where(
                models.Subscription.id == payload.item_id,
                models.Subscription.user_id == current_user.id,
            )
        )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")

    due_day = _item_due_day(payload.item_type, item)
    today = current_business_date()
    period_start, period_end = _compute_checkoff_period(due_day, today)

    existing = await db.execute(
        select(models.MonthlyCheckoff).where(
            models.MonthlyCheckoff.user_id == current_user.id,
            models.MonthlyCheckoff.item_type == payload.item_type,
            models.MonthlyCheckoff.item_id == payload.item_id,
            models.MonthlyCheckoff.period_start == period_start,
        )
    )
    existing_checkoff = existing.scalar_one_or_none()
    if existing_checkoff:
        return schemas.MonthlyCheckoffResponse(
            id=int(existing_checkoff.id),
            item_type=existing_checkoff.item_type,
            item_id=int(existing_checkoff.item_id),
            period_start=existing_checkoff.period_start.strftime("%Y-%m-%d"),
            period_end=existing_checkoff.period_end.strftime("%Y-%m-%d"),
            created_at=existing_checkoff.created_at,
        )

    checkoff = models.MonthlyCheckoff(
        user_id=current_user.id,
        item_type=payload.item_type,
        item_id=payload.item_id,
        period_start=period_start,
        period_end=period_end,
    )
    db.add(checkoff)
    await db.commit()
    await db.refresh(checkoff)
    return schemas.MonthlyCheckoffResponse(
        id=int(checkoff.id),
        item_type=checkoff.item_type,
        item_id=int(checkoff.item_id),
        period_start=checkoff.period_start.strftime("%Y-%m-%d"),
        period_end=checkoff.period_end.strftime("%Y-%m-%d"),
        created_at=checkoff.created_at,
    )


async def delete_monthly_checkoff_route(
    *,
    item_type: str,
    item_id: int,
    db: AsyncSession,
    current_user: models.User,
) -> None:
    result = await db.execute(
        select(models.MonthlyCheckoff).where(
            models.MonthlyCheckoff.user_id == current_user.id,
            models.MonthlyCheckoff.item_type == item_type,
            models.MonthlyCheckoff.item_id == item_id,
        )
    )
    today = current_business_date()
    checkoff = None
    for row in result.scalars().all():
        if row.period_start <= today < row.period_end:
            checkoff = row
            break
    if not checkoff:
        raise HTTPException(status_code=404, detail="Checkoff not found.")
    await db.delete(checkoff)
    await db.commit()


def current_business_date() -> date:
    return datetime.utcnow().date()
