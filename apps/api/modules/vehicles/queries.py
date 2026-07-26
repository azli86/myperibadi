"""Household-scoped query helpers for My Vehicle."""

from __future__ import annotations

from datetime import date
from typing import Optional, Sequence

from fastapi import HTTPException
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import models


async def ensure_household(db: AsyncSession, current_user: models.User) -> int:
    household_id = current_user.default_household_id
    if household_id:
        return int(household_id)
    # Mirror main._ensure_current_user_household minimal path: create via standard categories.
    import whatsapp_service

    household_id = await whatsapp_service.ensure_standard_categories(db, current_user.id)
    await db.commit()
    await db.refresh(current_user)
    if not household_id:
        raise HTTPException(status_code=400, detail="Household is required.")
    return int(household_id)


async def get_vehicle_or_404(
    db: AsyncSession,
    *,
    vehicle_id: int,
    household_id: int,
    allow_inactive: bool = True,
) -> models.Vehicle:
    result = await db.execute(
        select(models.Vehicle).where(
            models.Vehicle.id == vehicle_id,
            models.Vehicle.household_id == household_id,
        )
    )
    vehicle = result.scalars().first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    if not allow_inactive and vehicle.status in {"sold", "inactive"}:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    return vehicle


async def list_vehicles(
    db: AsyncSession,
    *,
    household_id: int,
    include_inactive: bool = False,
) -> list[models.Vehicle]:
    query: Select = select(models.Vehicle).where(models.Vehicle.household_id == household_id)
    if not include_inactive:
        query = query.where(models.Vehicle.status.in_(["active", "maintenance"]))
    query = query.order_by(models.Vehicle.name.asc(), models.Vehicle.id.asc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_attachment_or_404(
    db: AsyncSession,
    *,
    attachment_id: int,
    household_id: int,
) -> models.VehicleAttachment:
    result = await db.execute(
        select(models.VehicleAttachment).where(
            models.VehicleAttachment.id == attachment_id,
            models.VehicleAttachment.household_id == household_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    return row


async def list_fuel_logs(
    db: AsyncSession,
    *,
    vehicle_id: int,
    household_id: int,
    limit: int = 100,
) -> list[models.VehicleFuelLog]:
    result = await db.execute(
        select(models.VehicleFuelLog)
        .where(
            models.VehicleFuelLog.vehicle_id == vehicle_id,
            models.VehicleFuelLog.household_id == household_id,
        )
        .order_by(models.VehicleFuelLog.log_date.desc(), models.VehicleFuelLog.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def list_expenses(
    db: AsyncSession,
    *,
    vehicle_id: int,
    household_id: int,
    limit: int = 100,
) -> list[models.VehicleExpense]:
    result = await db.execute(
        select(models.VehicleExpense)
        .where(
            models.VehicleExpense.vehicle_id == vehicle_id,
            models.VehicleExpense.household_id == household_id,
        )
        .order_by(models.VehicleExpense.expense_date.desc(), models.VehicleExpense.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def list_maintenance(
    db: AsyncSession,
    *,
    vehicle_id: int,
    household_id: int,
    limit: int = 100,
) -> list[models.VehicleMaintenance]:
    result = await db.execute(
        select(models.VehicleMaintenance)
        .where(
            models.VehicleMaintenance.vehicle_id == vehicle_id,
            models.VehicleMaintenance.household_id == household_id,
        )
        .order_by(models.VehicleMaintenance.service_date.desc(), models.VehicleMaintenance.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def list_documents(
    db: AsyncSession,
    *,
    vehicle_id: int,
    household_id: int,
) -> list[models.VehicleDocument]:
    result = await db.execute(
        select(models.VehicleDocument)
        .where(
            models.VehicleDocument.vehicle_id == vehicle_id,
            models.VehicleDocument.household_id == household_id,
            models.VehicleDocument.status != "archived",
        )
        .order_by(models.VehicleDocument.expiry_date.asc().nullslast(), models.VehicleDocument.id.desc())
    )
    return list(result.scalars().all())


async def list_reminders(
    db: AsyncSession,
    *,
    household_id: int,
    vehicle_id: Optional[int] = None,
    statuses: Sequence[str] = ("pending",),
) -> list[models.VehicleReminder]:
    query = select(models.VehicleReminder).where(
        models.VehicleReminder.household_id == household_id,
        models.VehicleReminder.status.in_(list(statuses)),
    )
    if vehicle_id is not None:
        query = query.where(models.VehicleReminder.vehicle_id == vehicle_id)
    query = query.order_by(
        models.VehicleReminder.due_date.asc().nullslast(),
        models.VehicleReminder.id.asc(),
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def month_fuel_total(
    db: AsyncSession,
    *,
    household_id: int,
    vehicle_id: Optional[int],
    month_start: date,
    month_end: date,
) -> float:
    query = select(func.coalesce(func.sum(models.VehicleFuelLog.total_amount), 0)).where(
        models.VehicleFuelLog.household_id == household_id,
        models.VehicleFuelLog.log_date >= month_start,
        models.VehicleFuelLog.log_date <= month_end,
    )
    if vehicle_id is not None:
        query = query.where(models.VehicleFuelLog.vehicle_id == vehicle_id)
    result = await db.execute(query)
    return float(result.scalar() or 0)


async def month_expense_total(
    db: AsyncSession,
    *,
    household_id: int,
    vehicle_id: Optional[int],
    month_start: date,
    month_end: date,
) -> float:
    query = select(func.coalesce(func.sum(models.VehicleExpense.amount), 0)).where(
        models.VehicleExpense.household_id == household_id,
        models.VehicleExpense.expense_date >= month_start,
        models.VehicleExpense.expense_date <= month_end,
    )
    if vehicle_id is not None:
        query = query.where(models.VehicleExpense.vehicle_id == vehicle_id)
    result = await db.execute(query)
    return float(result.scalar() or 0)


async def month_maintenance_total(
    db: AsyncSession,
    *,
    household_id: int,
    vehicle_id: Optional[int],
    month_start: date,
    month_end: date,
) -> float:
    query = select(func.coalesce(func.sum(models.VehicleMaintenance.total_cost), 0)).where(
        models.VehicleMaintenance.household_id == household_id,
        models.VehicleMaintenance.service_date >= month_start,
        models.VehicleMaintenance.service_date <= month_end,
    )
    if vehicle_id is not None:
        query = query.where(models.VehicleMaintenance.vehicle_id == vehicle_id)
    result = await db.execute(query)
    return float(result.scalar() or 0)


async def month_distance(
    db: AsyncSession,
    *,
    household_id: int,
    vehicle_id: Optional[int],
    month_start: date,
    month_end: date,
) -> Optional[float]:
    query = select(func.coalesce(func.sum(models.VehicleFuelLog.distance_travelled), 0)).where(
        models.VehicleFuelLog.household_id == household_id,
        models.VehicleFuelLog.log_date >= month_start,
        models.VehicleFuelLog.log_date <= month_end,
        models.VehicleFuelLog.distance_travelled.is_not(None),
    )
    if vehicle_id is not None:
        query = query.where(models.VehicleFuelLog.vehicle_id == vehicle_id)
    result = await db.execute(query)
    value = float(result.scalar() or 0)
    return value if value > 0 else None


async def avg_efficiency(
    db: AsyncSession,
    *,
    household_id: int,
    vehicle_id: Optional[int],
    month_start: date,
    month_end: date,
) -> Optional[float]:
    query = select(func.avg(models.VehicleFuelLog.km_per_litre)).where(
        models.VehicleFuelLog.household_id == household_id,
        models.VehicleFuelLog.log_date >= month_start,
        models.VehicleFuelLog.log_date <= month_end,
        models.VehicleFuelLog.km_per_litre.is_not(None),
        models.VehicleFuelLog.is_full_tank.is_(True),
    )
    if vehicle_id is not None:
        query = query.where(models.VehicleFuelLog.vehicle_id == vehicle_id)
    result = await db.execute(query)
    value = result.scalar()
    return float(value) if value is not None else None
