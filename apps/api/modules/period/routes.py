"""My Cycle HTTP routes: record periods and predict the next one.

Every route answers 404 until the user switches the feature on in Settings,
so the calendar stays invisible to anyone who has not asked for it.
"""

from __future__ import annotations

from datetime import date, timedelta
from statistics import mean
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
from time_utils import current_business_date

DEFAULT_CYCLE_LENGTH = 28
DEFAULT_PERIOD_LENGTH = 5
MAX_PERIOD_DAYS = 15
# Gaps outside this range are a missed record, not a cycle; leave them out.
MIN_CYCLE_DAYS = 15
MAX_CYCLE_DAYS = 60
RECENT_CYCLES = 6


class PeriodCycleIn(BaseModel):
    start_date: date
    end_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=500)


class PeriodCycleUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    clear_end_date: bool = False
    notes: Optional[str] = Field(default=None, max_length=500)


def _serialize(cycle: models.PeriodCycle) -> dict[str, Any]:
    length = (cycle.end_date - cycle.start_date).days + 1 if cycle.end_date else None
    return {
        "id": cycle.id,
        "start_date": cycle.start_date.isoformat(),
        "end_date": cycle.end_date.isoformat() if cycle.end_date else None,
        "period_length": length,
        "notes": cycle.notes,
    }


def compute_summary(cycles: list[models.PeriodCycle], today: date) -> dict[str, Any]:
    """Averages and predictions from the recorded periods, oldest first.

    The cycle length is the gap between consecutive starts; the period length
    is start to end inclusive. Ovulation is taken as 14 days before the next
    period, with the fertile window the five days before it and the day after.
    These are estimates only."""
    ordered = sorted(cycles, key=lambda c: c.start_date)
    gaps = [
        (b.start_date - a.start_date).days
        for a, b in zip(ordered, ordered[1:])
        if MIN_CYCLE_DAYS <= (b.start_date - a.start_date).days <= MAX_CYCLE_DAYS
    ][-RECENT_CYCLES:]
    lengths = [(c.end_date - c.start_date).days + 1 for c in ordered if c.end_date][-RECENT_CYCLES:]

    avg_cycle = round(mean(gaps)) if gaps else DEFAULT_CYCLE_LENGTH
    avg_period = round(mean(lengths)) if lengths else DEFAULT_PERIOD_LENGTH
    summary: dict[str, Any] = {
        "avg_cycle_length": avg_cycle,
        "avg_period_length": avg_period,
        "cycle_length_known": bool(gaps),
        "cycles_counted": len(gaps),
        "regular": (max(gaps) - min(gaps) <= 7) if len(gaps) >= 2 else None,
        "status": "no_data",
        "cycle_day": None,
        "period_day": None,
        "days_until_next": None,
        "days_late": None,
        "next_start": None,
        "next_end": None,
        "ovulation_date": None,
        "fertile_start": None,
        "fertile_end": None,
        "upcoming": [],
    }
    if not ordered:
        return summary

    last = ordered[-1]
    next_start = last.start_date + timedelta(days=avg_cycle)
    summary["cycle_day"] = (today - last.start_date).days + 1

    ongoing = last.end_date is None and (today - last.start_date).days < MAX_PERIOD_DAYS
    in_recorded = last.end_date is not None and last.start_date <= today <= last.end_date
    if ongoing or in_recorded:
        summary["status"] = "period"
        summary["period_day"] = (today - last.start_date).days + 1
    elif today >= next_start:
        summary["status"] = "late"
        summary["days_late"] = (today - next_start).days
    else:
        summary["status"] = "waiting"
        summary["days_until_next"] = (next_start - today).days

    # A late period is expected any day now: predict from today, not the past.
    # The fertile window stays where it was predicted, so it does not drift.
    anchor = max(next_start, today) if summary["status"] == "late" else next_start
    ovulation = next_start - timedelta(days=14)
    summary.update(
        next_start=anchor.isoformat(),
        next_end=(anchor + timedelta(days=avg_period - 1)).isoformat(),
        ovulation_date=ovulation.isoformat(),
        fertile_start=(ovulation - timedelta(days=5)).isoformat(),
        fertile_end=(ovulation + timedelta(days=1)).isoformat(),
    )
    # The next few periods and fertile windows, for the calendar.
    upcoming = []
    for k in range(3):
        start = anchor + timedelta(days=avg_cycle * k)
        ov = start - timedelta(days=14)
        upcoming.append(
            {
                "start": start.isoformat(),
                "end": (start + timedelta(days=avg_period - 1)).isoformat(),
                "ovulation": ov.isoformat(),
                "fertile_start": (ov - timedelta(days=5)).isoformat(),
                "fertile_end": (ov + timedelta(days=1)).isoformat(),
            }
        )
    summary["upcoming"] = upcoming
    return summary


def date_problem(start: date, end: Optional[date], others: list[models.PeriodCycle], today: date) -> Optional[str]:
    """Why these dates cannot be saved, or None when they can. Shared by the
    API and the bot commands, so both refuse the same things."""
    if start > today:
        return "The start date cannot be in the future."
    if end is not None:
        if end < start:
            return "The end date cannot be before the start date."
        if (end - start).days + 1 > MAX_PERIOD_DAYS:
            return f"A period cannot be longer than {MAX_PERIOD_DAYS} days."
    new_end = end or start
    for other in others:
        other_end = other.end_date or other.start_date
        if start <= other_end and other.start_date <= new_end:
            return "These dates overlap another recorded period."
    return None


def close_open_cycle_before(cycles: list[models.PeriodCycle], start: date) -> None:
    """Starting a new period closes one still left open, the day before."""
    open_cycle = next((c for c in cycles if c.end_date is None), None)
    if open_cycle and open_cycle.start_date < start:
        closing = min(start - timedelta(days=1), open_cycle.start_date + timedelta(days=MAX_PERIOD_DAYS - 1))
        open_cycle.end_date = max(closing, open_cycle.start_date)


def create_period_router(*, get_current_user: Callable[..., Any]) -> APIRouter:
    router = APIRouter(prefix="/period", tags=["period"])

    def require_enabled(user: models.User) -> None:
        if not bool(getattr(user, "period_tracker_enabled", False)):
            raise HTTPException(status_code=404, detail="Not found")

    def validate(start: date, end: Optional[date], others: list[models.PeriodCycle], today: date) -> None:
        problem = date_problem(start, end, others, today)
        if problem:
            raise HTTPException(status_code=400, detail=problem)

    async def own_cycles(db: AsyncSession, user_id: str) -> list[models.PeriodCycle]:
        result = await db.execute(
            select(models.PeriodCycle)
            .where(models.PeriodCycle.user_id == user_id)
            .order_by(models.PeriodCycle.start_date.desc())
        )
        return list(result.scalars().all())

    async def overview(db: AsyncSession, user: models.User) -> dict[str, Any]:
        cycles = await own_cycles(db, user.id)
        return {
            "cycles": [_serialize(c) for c in cycles],
            "summary": compute_summary(cycles, current_business_date()),
            "today": current_business_date().isoformat(),
        }

    @router.get("")
    async def get_period_overview(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        require_enabled(current_user)
        return await overview(db, current_user)

    @router.post("/cycles")
    async def create_cycle(
        body: PeriodCycleIn,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        require_enabled(current_user)
        today = current_business_date()
        others = await own_cycles(db, current_user.id)
        close_open_cycle_before(others, body.start_date)
        validate(body.start_date, body.end_date, others, today)
        cycle = models.PeriodCycle(
            user_id=current_user.id,
            start_date=body.start_date,
            end_date=body.end_date,
            notes=(body.notes or "").strip() or None,
        )
        db.add(cycle)
        await db.commit()
        return await overview(db, current_user)

    @router.patch("/cycles/{cycle_id}")
    async def update_cycle(
        cycle_id: int,
        body: PeriodCycleUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        require_enabled(current_user)
        cycles = await own_cycles(db, current_user.id)
        cycle = next((c for c in cycles if c.id == cycle_id), None)
        if not cycle:
            raise HTTPException(status_code=404, detail="Not found")
        start = body.start_date or cycle.start_date
        end = None if body.clear_end_date else (body.end_date if body.end_date is not None else cycle.end_date)
        validate(start, end, [c for c in cycles if c.id != cycle.id], current_business_date())
        cycle.start_date = start
        cycle.end_date = end
        if body.notes is not None:
            cycle.notes = body.notes.strip() or None
        await db.commit()
        return await overview(db, current_user)

    @router.delete("/cycles/{cycle_id}")
    async def delete_cycle(
        cycle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        require_enabled(current_user)
        cycles = await own_cycles(db, current_user.id)
        cycle = next((c for c in cycles if c.id == cycle_id), None)
        if not cycle:
            raise HTTPException(status_code=404, detail="Not found")
        await db.delete(cycle)
        await db.commit()
        return await overview(db, current_user)

    return router
