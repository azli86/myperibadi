"""Kesihatan database queries."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models


def _range_start(range_key: str, ref: date) -> date:
    """Return the start date for a display range (7d/30d/3m/1y)."""
    key = (range_key or "").lower()
    if key == "7d":
        return ref - timedelta(days=6)
    if key == "3m":
        return date(ref.year, ref.month, 1) - timedelta(days=91)
    if key == "1y":
        return date(ref.year, ref.month, 1) - timedelta(days=365)
    # default 30d
    return ref - timedelta(days=29)


async def list_readings(
    db: AsyncSession,
    *,
    user_id: str,
    metric_type: Optional[str] = None,
    range_key: str = "30d",
) -> Sequence[models.HealthReading]:
    stmt = select(models.HealthReading).where(models.HealthReading.user_id == user_id)
    if metric_type:
        stmt = stmt.where(models.HealthReading.metric_type == metric_type)
    stmt = stmt.where(models.HealthReading.measured_at >= _range_start(range_key, date.today()))
    stmt = stmt.order_by(models.HealthReading.measured_at.desc())
    return (await db.execute(stmt)).scalars().all()


async def latest_readings(db: AsyncSession, *, user_id: str) -> dict[str, models.HealthReading]:
    """Return the most recent reading for each metric type."""
    rows = (
        await db.execute(
            select(models.HealthReading)
            .where(models.HealthReading.user_id == user_id)
            .order_by(models.HealthReading.measured_at.desc())
        )
    ).scalars().all()
    latest: dict[str, models.HealthReading] = {}
    for r in rows:
        if r.metric_type not in latest:
            latest[r.metric_type] = r
    return latest


async def get_reading_or_404(db: AsyncSession, *, reading_id: int, user_id: str) -> models.HealthReading:
    return (
        await db.execute(
            select(models.HealthReading).where(
                models.HealthReading.id == reading_id,
                models.HealthReading.user_id == user_id,
            )
        )
    ).scalar_one_or_none()


async def list_medications(db: AsyncSession, *, user_id: str) -> Sequence[models.Medication]:
    stmt = (
        select(models.Medication)
        .where(models.Medication.user_id == user_id)
        .order_by(models.Medication.created_at.desc())
    )
    return (await db.execute(stmt)).scalars().all()


async def get_medication_or_404(db: AsyncSession, *, medication_id: int, user_id: str) -> models.Medication:
    return (
        await db.execute(
            select(models.Medication).where(
                models.Medication.id == medication_id,
                models.Medication.user_id == user_id,
            )
        )
    ).scalar_one_or_none()


async def list_schedules(db: AsyncSession, *, medication_id: int) -> Sequence[models.MedicationSchedule]:
    stmt = (
        select(models.MedicationSchedule)
        .where(models.MedicationSchedule.medication_id == medication_id)
        .order_by(models.MedicationSchedule.time.asc())
    )
    return (await db.execute(stmt)).scalars().all()


async def get_schedule_or_404(db: AsyncSession, *, schedule_id: int, user_id: str) -> models.MedicationSchedule:
    return (
        await db.execute(
            select(models.MedicationSchedule)
            .join(models.Medication, models.Medication.id == models.MedicationSchedule.medication_id)
            .where(
                models.MedicationSchedule.id == schedule_id,
                models.Medication.user_id == user_id,
            )
        )
    ).scalar_one_or_none()


async def list_dose_logs(
    db: AsyncSession, *, medication_ids: list[int], dose_date: date
) -> Sequence[models.MedicationDoseLog]:
    if not medication_ids:
        return []
    stmt = (
        select(models.MedicationDoseLog)
        .where(
            models.MedicationDoseLog.medication_id.in_(medication_ids),
            models.MedicationDoseLog.dose_date == dose_date,
        )
    )
    return (await db.execute(stmt)).scalars().all()


async def get_dose_log(
    db: AsyncSession, *, medication_id: int, schedule_id: int, dose_date: date
) -> Optional[models.MedicationDoseLog]:
    return (
        await db.execute(
            select(models.MedicationDoseLog).where(
                models.MedicationDoseLog.medication_id == medication_id,
                models.MedicationDoseLog.schedule_id == schedule_id,
                models.MedicationDoseLog.dose_date == dose_date,
            )
        )
    ).scalar_one_or_none()
