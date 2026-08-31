"""Kesihatan service layer."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Optional

from sqlalchemy import select

import models
from modules.health import queries
from modules.health.schemas import (
    HealthReadingCreate,
    HealthReadingUpdate,
    MedicationCreate,
    MedicationUpdate,
)

METRIC_UNITS = {
    "weight": "kg",
    "height": "cm",
    "bp": "mmHg",
    "glucose": "mmol/L",
    "pulse": "BPM",
    "spo2": "%",
    "temperature": "°C",
}

METRIC_LABELS_BM = {
    "weight": "Berat",
    "height": "Tinggi",
    "bp": "Tekanan Darah",
    "glucose": "Gula Darah",
    "pulse": "Denyutan Nadi",
    "spo2": "SpO₂",
    "temperature": "Suhu",
}


def parse_time(s: str) -> time:
    """Accept 'HH:MM' or 'HH:MM:SS' 24h format."""
    s = (s or "").strip()
    for fmt in ("%H:%M", "%H:%M:%S", "%H.%M"):
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            continue
    raise ValueError(f"Invalid time format: {s!r}")


def fmt_time(t: time) -> str:
    return t.strftime("%H:%M") if t else ""


def serialize_schedule(s: models.MedicationSchedule) -> dict[str, Any]:
    return {
        "id": s.id,
        "time": fmt_time(s.time),
        "enabled": s.enabled,
        "position": s.position,
    }


def serialize_dose(d: models.MedicationDoseLog) -> dict[str, Any]:
    return {
        "schedule_id": d.schedule_id,
        "scheduled_time": fmt_time(d.scheduled_time),
        "status": d.status,
        "taken_at": d.taken_at,
    }


def serialize_reading(r: models.HealthReading) -> dict[str, Any]:
    return {
        "id": r.id,
        "metric_type": r.metric_type,
        "value": float(r.value) if r.value is not None else None,
        "systolic": float(r.systolic) if r.systolic is not None else None,
        "diastolic": float(r.diastolic) if r.diastolic is not None else None,
        "unit": r.unit or METRIC_UNITS.get(r.metric_type),
        "note": r.note,
        "measured_at": r.measured_at,
        "created_at": r.created_at,
    }


async def create_reading(db, *, user_id, payload: HealthReadingCreate, household_id=None) -> models.HealthReading:
    row = models.HealthReading(
        user_id=user_id,
        household_id=household_id,
        metric_type=payload.metric_type,
        value=payload.value,
        systolic=payload.systolic if payload.metric_type == "bp" else None,
        diastolic=payload.diastolic if payload.metric_type == "bp" else None,
        unit=payload.unit or METRIC_UNITS.get(payload.metric_type),
        note=payload.note,
        measured_at=payload.measured_at or datetime.utcnow(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def update_reading(db, *, reading_id, user_id, payload: HealthReadingUpdate) -> Optional[models.HealthReading]:
    row = await queries.get_reading_or_404(db, reading_id=reading_id, user_id=user_id)
    if not row:
        return None
    data = payload.dict(exclude_unset=True)
    if "systolic" in data or "diastolic" in data:
        if row.metric_type != "bp":
            data.pop("systolic", None)
            data.pop("diastolic", None)
    for k, v in data.items():
        setattr(row, k, v)
    if payload.unit is None and row.unit is None:
        row.unit = METRIC_UNITS.get(row.metric_type)
    await db.commit()
    await db.refresh(row)
    return row


async def delete_reading(db, *, reading_id, user_id) -> bool:
    row = await queries.get_reading_or_404(db, reading_id=reading_id, user_id=user_id)
    if not row:
        return False
    await db.delete(row)
    await db.commit()
    return True


def _compute_bmi(weight_kg, height_cm):
    if not weight_kg or not height_cm or height_cm <= 0:
        return None
    return round(weight_kg / ((height_cm / 100) ** 2), 1)


async def build_dashboard(db, *, user_id) -> dict[str, Any]:
    latest = await queries.latest_readings(db, user_id=user_id)
    order = ["weight", "bp", "glucose", "pulse", "spo2", "temperature", "height"]
    metrics = []
    for m in order:
        r = latest.get(m)
        if not r:
            continue
        metrics.append(
            {
                "metric_type": m,
                "value": float(r.value) if r.value is not None else None,
                "systolic": float(r.systolic) if r.systolic is not None else None,
                "diastolic": float(r.diastolic) if r.diastolic is not None else None,
                "unit": r.unit or METRIC_UNITS.get(m),
                "measured_at": r.measured_at,
                "label": METRIC_LABELS_BM.get(m, m),
            }
        )
    weight = latest.get("weight")
    height = latest.get("height")
    weight_kg = float(weight.value) if weight and weight.value is not None else None
    height_cm = float(height.value) if height and height.value is not None else None
    return {
        "metrics": metrics,
        "bmi": _compute_bmi(weight_kg, height_cm),
        "height_cm": height_cm,
        "weight_kg": weight_kg,
    }


async def build_history(db, *, user_id, metric_type, range_key) -> dict[str, Any]:
    rows = await queries.list_readings(
        db, user_id=user_id, metric_type=metric_type, range_key=range_key
    )
    points = []
    for r in reversed(rows):
        points.append(
            {
                "measured_at": r.measured_at,
                "value": float(r.value) if r.value is not None else None,
                "systolic": float(r.systolic) if r.systolic is not None else None,
                "diastolic": float(r.diastolic) if r.diastolic is not None else None,
            }
        )
    return {"metric_type": metric_type, "range": range_key, "points": points}


# ── Medications ────────────────────────────────────────────────────────────────

async def _attach_schedules(db, med: models.Medication, schedules: list[dict[str, Any]]) -> None:
    for idx, sc in enumerate(schedules):
        db.add(
            models.MedicationSchedule(
                medication_id=med.id,
                time=parse_time(sc.get("time") or "08:00"),
                enabled=bool(sc.get("enabled", True)),
                position=idx,
            )
        )
    await db.commit()


async def create_medication(db, *, user_id, payload: MedicationCreate, household_id=None) -> models.Medication:
    med = models.Medication(
        user_id=user_id,
        household_id=household_id,
        name=payload.name,
        dosage=payload.dosage,
        frequency=payload.frequency or max(1, len(payload.schedules) or 1),
        timing=payload.timing or "anytime",
        start_date=payload.start_date,
        end_date=payload.end_date,
        notes=payload.notes,
        reminder_enabled=payload.reminder_enabled,
    )
    db.add(med)
    await db.flush()
    if payload.schedules:
        await _attach_schedules(db, med, [s.dict() for s in payload.schedules])
    else:
        await _attach_schedules(db, med, [{"time": "08:00", "enabled": True}])
    await db.refresh(med)
    return med


async def update_medication(db, *, medication_id, user_id, payload: MedicationUpdate) -> Optional[models.Medication]:
    med = await queries.get_medication_or_404(db, medication_id=medication_id, user_id=user_id)
    if not med:
        return None
    data = payload.dict(exclude_unset=True)
    schedules = data.pop("schedules", None)
    for k, v in data.items():
        setattr(med, k, v)
    if schedules is not None:
        old = (await db.execute(
            select(models.MedicationSchedule).where(models.MedicationSchedule.medication_id == med.id)
        )).scalars().all()
        for s in old:
            await db.delete(s)
        await db.flush()
        await _attach_schedules(db, med, schedules)
    await db.commit()
    await db.refresh(med)
    return med


async def delete_medication(db, *, medication_id, user_id) -> bool:
    med = await queries.get_medication_or_404(db, medication_id=medication_id, user_id=user_id)
    if not med:
        return False
    await db.delete(med)
    await db.commit()
    return True


async def toggle_reminder(db, *, medication_id, user_id, enabled: Optional[bool] = None) -> Optional[models.Medication]:
    med = await queries.get_medication_or_404(db, medication_id=medication_id, user_id=user_id)
    if not med:
        return None
    if enabled is None:
        med.reminder_enabled = not med.reminder_enabled
    else:
        med.reminder_enabled = enabled
    await db.commit()
    await db.refresh(med)
    return med


async def toggle_schedule(db, *, schedule_id, user_id, enabled: Optional[bool] = None) -> Optional[models.MedicationSchedule]:
    s = await queries.get_schedule_or_404(db, schedule_id=schedule_id, user_id=user_id)
    if not s:
        return None
    if enabled is None:
        s.enabled = not s.enabled
    else:
        s.enabled = enabled
    await db.commit()
    await db.refresh(s)
    return s


async def _ensure_today_logs(db, med: models.Medication, dose_date: date) -> list[models.MedicationDoseLog]:
    """Create pending dose logs for today's enabled schedules if missing."""
    existing = await queries.list_dose_logs(db, medication_ids=[med.id], dose_date=dose_date)
    by_sched = {d.schedule_id: d for d in existing}
    schedules = await queries.list_schedules(db, medication_id=med.id)
    logs = []
    for sc in schedules:
        if not sc.enabled:
            continue
        if sc.id not in by_sched:
            row = models.MedicationDoseLog(
                medication_id=med.id,
                schedule_id=sc.id,
                user_id=med.user_id,
                dose_date=dose_date,
                scheduled_time=sc.time,
                status="pending",
            )
            db.add(row)
            by_sched[sc.id] = row
        logs.append(by_sched[sc.id])
    await db.commit()
    return logs


async def tick_dose(db, *, medication_id, user_id, schedule_id, dose_date, status) -> Optional[models.MedicationDoseLog]:
    med = await queries.get_medication_or_404(db, medication_id=medication_id, user_id=user_id)
    if not med:
        return None
    dose_date = dose_date or date.today()
    log = await queries.get_dose_log(db, medication_id=med.id, schedule_id=schedule_id, dose_date=dose_date)
    if not log:
        # create it on demand (e.g. ticking a past time later today)
        sc = await queries.get_schedule_or_404(db, schedule_id=schedule_id, user_id=user_id)
        if not sc:
            return None
        log = models.MedicationDoseLog(
            medication_id=med.id,
            schedule_id=sc.id,
            user_id=user_id,
            dose_date=dose_date,
            scheduled_time=sc.time,
            status="pending",
        )
        db.add(log)
    log.status = status
    log.taken_at = datetime.utcnow() if status in ("taken", "skipped") else None
    await db.commit()
    await db.refresh(log)
    return log


async def serialize_medication(db, med: models.Medication, *, with_today=True) -> dict[str, Any]:
    schedules = await queries.list_schedules(db, medication_id=med.id)
    schedules.sort(key=lambda s: s.time)
    today_doses = []
    if with_today:
        today_doses = await _ensure_today_logs(db, med, date.today())
    return {
        "id": med.id,
        "name": med.name,
        "dosage": med.dosage,
        "frequency": med.frequency,
        "timing": med.timing,
        "start_date": med.start_date,
        "end_date": med.end_date,
        "notes": med.notes,
        "reminder_enabled": med.reminder_enabled,
        "created_at": med.created_at,
        "schedules": [serialize_schedule(s) for s in schedules],
        "today_doses": [serialize_dose(d) for d in today_doses],
    }


async def build_today(db, *, user_id) -> list[dict[str, Any]]:
    """Return today's medication reminder list, sorted by time."""
    meds = await queries.list_medications(db, user_id=user_id)
    items = []
    for med in meds:
        if not med.reminder_enabled:
            continue
        schedules = await queries.list_schedules(db, medication_id=med.id)
        if not schedules:
            continue
        logs = await _ensure_today_logs(db, med, date.today())
        by_sched = {d.schedule_id: d for d in logs}
        for sc in schedules:
            if not sc.enabled:
                continue
            log = by_sched.get(sc.id)
            status = log.status if log else "pending"
            items.append(
                {
                    "medication_id": med.id,
                    "name": med.name,
                    "dosage": med.dosage,
                    "timing": med.timing,
                    "schedule_id": sc.id,
                    "scheduled_time": fmt_time(sc.time),
                    "enabled": sc.enabled,
                    "status": status,
                    "taken_at": log.taken_at if log else None,
                }
            )
    items.sort(key=lambda x: x["scheduled_time"])
    return items
