"""Kesihatan module Pydantic schemas."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ── Health Readings ────────────────────────────────────────────────────────────

class HealthReadingCreate(BaseModel):
    metric_type: str
    value: Optional[float] = None
    systolic: Optional[float] = None
    diastolic: Optional[float] = None
    unit: Optional[str] = None
    note: Optional[str] = None
    measured_at: Optional[datetime] = None


class HealthReadingUpdate(BaseModel):
    value: Optional[float] = None
    systolic: Optional[float] = None
    diastolic: Optional[float] = None
    unit: Optional[str] = None
    note: Optional[str] = None
    measured_at: Optional[datetime] = None


class HealthReadingOut(BaseModel):
    id: int
    metric_type: str
    value: Optional[float] = None
    systolic: Optional[float] = None
    diastolic: Optional[float] = None
    unit: Optional[str] = None
    note: Optional[str] = None
    measured_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class HealthDashboardMetric(BaseModel):
    metric_type: str
    value: Optional[float] = None
    systolic: Optional[float] = None
    diastolic: Optional[float] = None
    unit: Optional[str] = None
    measured_at: Optional[datetime] = None
    label: Optional[str] = None


class HealthDashboardOut(BaseModel):
    metrics: List[HealthDashboardMetric]
    bmi: Optional[float] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None


class HealthHistoryPoint(BaseModel):
    measured_at: datetime
    value: Optional[float] = None
    systolic: Optional[float] = None
    diastolic: Optional[float] = None


class HealthHistoryOut(BaseModel):
    metric_type: str
    range: str
    points: List[HealthHistoryPoint]


# ── Medication & Reminder ──────────────────────────────────────────────────────

class MedicationScheduleCreate(BaseModel):
    time: str  # "08:00" 24h
    enabled: bool = True


class MedicationCreate(BaseModel):
    name: str
    dosage: Optional[str] = None
    frequency: int = 1
    timing: str = "anytime"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None
    reminder_enabled: bool = True
    schedules: List[MedicationScheduleCreate] = []


class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[int] = None
    timing: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None
    reminder_enabled: Optional[bool] = None
    schedules: Optional[List[MedicationScheduleCreate]] = None


class ScheduleOut(BaseModel):
    id: int
    time: str
    enabled: bool
    position: int


class DoseStatusOut(BaseModel):
    schedule_id: Optional[int] = None
    scheduled_time: str
    status: str
    taken_at: Optional[datetime] = None


class MedicationOut(BaseModel):
    id: int
    name: str
    dosage: Optional[str] = None
    frequency: int
    timing: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None
    reminder_enabled: bool
    created_at: datetime
    schedules: List[ScheduleOut] = []
    today_doses: List[DoseStatusOut] = []

    class Config:
        from_attributes = True


class DoseTickIn(BaseModel):
    schedule_id: Optional[int] = None
    dose_date: Optional[date] = None
    status: str = "taken"  # taken | skipped


class MedicationTodayItem(BaseModel):
    medication_id: int
    name: str
    dosage: Optional[str] = None
    timing: str
    schedule_id: Optional[int] = None
    scheduled_time: str
    enabled: bool
    status: str  # pending | taken | skipped | missed
    taken_at: Optional[datetime] = None
