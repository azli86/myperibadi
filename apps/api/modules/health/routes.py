"""Kesihatan module HTTP routes."""

from __future__ import annotations

from datetime import date
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

import database
import models
from modules.health import queries, service
from modules.health.schemas import (
    DoseTickIn,
    HealthReadingCreate,
    HealthReadingUpdate,
    MedicationCreate,
    MedicationUpdate,
)


def create_health_router(*, get_current_user: Callable[..., Any]) -> APIRouter:
    router = APIRouter(prefix="/health", tags=["health"])

    def _household(user: models.User) -> Optional[int]:
        return getattr(user, "default_household_id", None)

    # ── Health Readings ──────────────────────────────────────────────────────
    @router.get("/readings")
    async def list_readings(
        metric: Optional[str] = Query(default=None),
        range: str = Query(default="30d"),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        rows = await queries.list_readings(
            db, user_id=current_user.id, metric_type=metric, range_key=range
        )
        return [service.serialize_reading(r) for r in rows]

    @router.post("/readings")
    async def create_reading(
        payload: HealthReadingCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.create_reading(
            db, user_id=current_user.id, payload=payload, household_id=_household(current_user)
        )
        return service.serialize_reading(row)

    @router.patch("/readings/{reading_id}")
    async def update_reading(
        reading_id: int,
        payload: HealthReadingUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        row = await service.update_reading(
            db, reading_id=reading_id, user_id=current_user.id, payload=payload
        )
        if not row:
            raise HTTPException(404, "Reading not found")
        return service.serialize_reading(row)

    @router.delete("/readings/{reading_id}")
    async def delete_reading(
        reading_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        ok = await service.delete_reading(db, reading_id=reading_id, user_id=current_user.id)
        if not ok:
            raise HTTPException(404, "Reading not found")
        return {"ok": True}

    # ── Dashboard & History ──────────────────────────────────────────────────
    @router.get("/dashboard")
    async def dashboard(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        return await service.build_dashboard(db, user_id=current_user.id)

    @router.get("/history")
    async def history(
        metric: str = Query(...),
        range: str = Query(default="30d"),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        return await service.build_history(
            db, user_id=current_user.id, metric_type=metric, range_key=range
        )

    # ── Medications ──────────────────────────────────────────────────────────
    @router.get("/medications")
    async def list_medications(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        meds = await queries.list_medications(db, user_id=current_user.id)
        return [await service.serialize_medication(db, m) for m in meds]

    @router.get("/medications/today")
    async def medications_today(
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        return await service.build_today(db, user_id=current_user.id)

    @router.post("/medications")
    async def create_medication(
        payload: MedicationCreate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        med = await service.create_medication(
            db, user_id=current_user.id, payload=payload, household_id=_household(current_user)
        )
        return await service.serialize_medication(db, med)

    @router.get("/medications/{medication_id}")
    async def get_medication(
        medication_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        med = await queries.get_medication_or_404(
            db, medication_id=medication_id, user_id=current_user.id
        )
        if not med:
            raise HTTPException(404, "Medication not found")
        return await service.serialize_medication(db, med)

    @router.patch("/medications/{medication_id}")
    async def update_medication(
        medication_id: int,
        payload: MedicationUpdate,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        med = await service.update_medication(
            db, medication_id=medication_id, user_id=current_user.id, payload=payload
        )
        if not med:
            raise HTTPException(404, "Medication not found")
        return await service.serialize_medication(db, med)

    @router.delete("/medications/{medication_id}")
    async def delete_medication(
        medication_id: int,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        ok = await service.delete_medication(
            db, medication_id=medication_id, user_id=current_user.id
        )
        if not ok:
            raise HTTPException(404, "Medication not found")
        return {"ok": True}

    @router.post("/medications/{medication_id}/toggle-reminder")
    async def toggle_medication_reminder(
        medication_id: int,
        enabled: Optional[bool] = Query(default=None),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        med = await service.toggle_reminder(
            db, medication_id=medication_id, user_id=current_user.id, enabled=enabled
        )
        if not med:
            raise HTTPException(404, "Medication not found")
        return {"reminder_enabled": med.reminder_enabled}

    @router.post("/medications/{medication_id}/doses")
    async def tick_dose(
        medication_id: int,
        payload: DoseTickIn,
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        if not payload.schedule_id:
            raise HTTPException(400, "schedule_id is required")
        if payload.status not in ("taken", "skipped"):
            raise HTTPException(400, "status must be 'taken' or 'skipped'")
        log = await service.tick_dose(
            db,
            medication_id=medication_id,
            user_id=current_user.id,
            schedule_id=payload.schedule_id,
            dose_date=payload.dose_date or date.today(),
            status=payload.status,
        )
        if not log:
            raise HTTPException(404, "Medication or schedule not found")
        return {
            "id": log.id,
            "medication_id": log.medication_id,
            "schedule_id": log.schedule_id,
            "dose_date": log.dose_date,
            "status": log.status,
            "taken_at": log.taken_at,
        }

    @router.patch("/schedules/{schedule_id}")
    async def toggle_schedule(
        schedule_id: int,
        enabled: Optional[bool] = Query(default=None),
        db: AsyncSession = Depends(database.get_db),
        current_user: models.User = Depends(get_current_user),
    ):
        s = await service.toggle_schedule(
            db, schedule_id=schedule_id, user_id=current_user.id, enabled=enabled
        )
        if not s:
            raise HTTPException(404, "Schedule not found")
        return {"id": s.id, "time": s.time.strftime("%H:%M"), "enabled": s.enabled}

    return router
