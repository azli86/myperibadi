"""Period Tracker HTTP routes: periods, daily logs, preferences and export.

Every route answers 404 until the user switches the feature on in Settings,
so the calendar stays invisible to anyone who has not asked for it.
"""

from __future__ import annotations

import csv
import io
from datetime import date
from typing import Any, Callable, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
from modules.period import service
from modules.period.service import (  # re-exported for older imports
    MAX_PERIOD_DAYS,
    close_open_cycle_before,
    compute_summary,
    date_problem,
)
from time_utils import current_business_date

__all__ = ["create_period_router", "MAX_PERIOD_DAYS", "close_open_cycle_before", "compute_summary", "date_problem"]


class PeriodCycleIn(BaseModel):
    start_date: date
    end_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=500)


class PeriodCycleUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    clear_end_date: bool = False
    notes: Optional[str] = Field(default=None, max_length=500)


class PeriodDayIn(BaseModel):
    flow: Optional[str] = None
    symptoms: Optional[list[str]] = None
    mood: Optional[str] = None
    temperature: Optional[float] = None
    ovulation_test: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=500)


def create_period_router(*, get_current_user: Callable[..., Any]) -> APIRouter:
    router = APIRouter(prefix="/period", tags=["period"])

    def require_enabled(user: models.User) -> None:
        if not bool(getattr(user, "period_tracker_enabled", False)):
            raise HTTPException(status_code=404, detail="Not found")

    def validate(start: date, end: Optional[date], others: list[models.PeriodCycle], today: date) -> None:
        problem = date_problem(start, end, others, today)
        if problem:
            raise HTTPException(status_code=400, detail=problem)

    @router.get("")
    async def get_period_overview(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        require_enabled(current_user)
        return await service.build_overview(db, current_user)

    @router.post("/cycles")
    async def create_cycle(
        body: PeriodCycleIn,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        require_enabled(current_user)
        today = current_business_date()
        others = await service.own_cycles(db, current_user.id)
        if service.running_period(others, body.start_date):
            raise HTTPException(status_code=400, detail="A period is already open. End it first, or edit it.")
        close_open_cycle_before(others, body.start_date)
        validate(body.start_date, body.end_date, others, today)
        db.add(
            models.PeriodCycle(
                user_id=current_user.id,
                start_date=body.start_date,
                end_date=body.end_date,
                notes=(body.notes or "").strip() or None,
            )
        )
        await db.commit()
        return await service.build_overview(db, current_user)

    @router.patch("/cycles/{cycle_id}")
    async def update_cycle(
        cycle_id: int,
        body: PeriodCycleUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        require_enabled(current_user)
        cycles = await service.own_cycles(db, current_user.id)
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
        return await service.build_overview(db, current_user)

    @router.delete("/cycles/{cycle_id}")
    async def delete_cycle(
        cycle_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        require_enabled(current_user)
        cycles = await service.own_cycles(db, current_user.id)
        cycle = next((c for c in cycles if c.id == cycle_id), None)
        if not cycle:
            raise HTTPException(status_code=404, detail="Not found")
        await db.delete(cycle)
        await db.commit()
        return await service.build_overview(db, current_user)

    @router.put("/days/{day}")
    async def save_day_log(
        day: date,
        body: PeriodDayIn,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        require_enabled(current_user)
        if day > current_business_date():
            raise HTTPException(status_code=400, detail="A day in the future cannot be logged.")
        fields = body.model_dump(exclude_unset=True)
        if "temperature" in fields and fields["temperature"] is not None and not 34 <= float(fields["temperature"]) <= 42:
            raise HTTPException(status_code=400, detail="The temperature must be between 34 and 42 °C.")
        await service.upsert_day_log(db, current_user.id, day, fields)
        await db.commit()
        return await service.build_overview(db, current_user)

    @router.delete("/days/{day}")
    async def delete_day_log(
        day: date,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        require_enabled(current_user)
        log = await service.log_for_day(db, current_user.id, day)
        if log:
            await db.delete(log)
            await db.commit()
        return await service.build_overview(db, current_user)

    @router.put("/prefs")
    async def save_prefs(
        patch: dict[str, Any] = Body(...),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        require_enabled(current_user)
        prefs = await service.load_prefs(db, current_user.id)
        try:
            prefs = service.merge_prefs(prefs, patch)
        except service.PrefsError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except (TypeError, ValueError, IndexError, KeyError):
            raise HTTPException(status_code=400, detail="These settings are not valid.")
        if prefs.get("spend_category_id"):
            category = await db.get(models.Category, int(prefs["spend_category_id"]))
            if not category or category.household_id != current_user.default_household_id:
                raise HTTPException(status_code=400, detail="That category was not found.")
        await service.save_json_setting(db, current_user.id, service.PREFS_KEY, prefs)
        await db.commit()
        return await service.build_overview(db, current_user)

    @router.get("/export.csv")
    async def export_csv(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        """Every period and daily log, for the user's own records or a doctor."""
        require_enabled(current_user)
        cycles = sorted(await service.own_cycles(db, current_user.id), key=lambda c: c.start_date)
        logs = await service.own_logs(db, current_user.id, date(1970, 1, 1))
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["Periods"])
        writer.writerow(["start_date", "end_date", "period_days", "cycle_days", "notes"])
        for i, c in enumerate(cycles):
            gap = (c.start_date - cycles[i - 1].start_date).days if i else ""
            length = (c.end_date - c.start_date).days + 1 if c.end_date else ""
            writer.writerow([c.start_date.isoformat(), c.end_date.isoformat() if c.end_date else "", length, gap, c.notes or ""])
        writer.writerow([])
        writer.writerow(["Daily logs"])
        writer.writerow(["date", "flow", "symptoms", "mood", "temperature_c", "ovulation_test", "notes"])
        for log in logs:
            row = service.serialize_log(log)
            writer.writerow([
                row["date"], row["flow"] or "", " ".join(row["symptoms"]), row["mood"] or "",
                row["temperature"] if row["temperature"] is not None else "", row["ovulation_test"] or "", row["notes"] or "",
            ])
        return Response(
            content="﻿" + buf.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="period-tracker-{current_business_date().isoformat()}.csv"'},
        )

    return router
