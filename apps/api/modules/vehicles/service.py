"""Business logic for My Vehicle."""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from typing import Any, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy import delete as sa_delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import storage_service
from modules.vehicles import queries, storage
from modules.vehicles.schemas import (
    DocumentCreate,
    DocumentUpdate,
    ExpenseCreate,
    ExpenseUpdate,
    FuelLogCreate,
    FuelLogUpdate,
    MaintenanceCreate,
    MaintenanceUpdate,
    OdometerCreate,
    OverdueDashboardResponse,
    OverdueItem,
    ReminderCreate,
    ReminderUpdate,
    VehicleCreate,
    VehicleSummaryResponse,
    VehicleUpdate,
)


def _parse_date(value: Optional[str], field: str = "date") -> Optional[date]:
    if value is None or value == "":
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be YYYY-MM-DD") from exc


def _fmt_date(value: Optional[date | datetime]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().strftime("%Y-%m-%d")
    return value.strftime("%Y-%m-%d")


def _num(value: Any) -> Optional[float]:
    if value is None:
        return None
    return float(value)


def serialize_vehicle(v: models.Vehicle) -> dict:
    return {
        "id": int(v.id),
        "name": v.name,
        "vehicle_type": v.vehicle_type,
        "registration_number": v.registration_number,
        "brand": v.brand,
        "model": v.model,
        "variant": v.variant,
        "year": int(v.year) if v.year is not None else None,
        "color": v.color,
        "fuel_type": v.fuel_type,
        "engine_capacity": v.engine_capacity,
        "purchase_date": _fmt_date(v.purchase_date),
        "purchase_price": _num(v.purchase_price),
        "current_odometer": _num(v.current_odometer),
        "has_image": bool(v.image_object_key),
        "image_url": storage_service.public_cdn_url(v.image_object_key),
        "status": v.status,
        "notes": v.notes,
        "created_at": v.created_at,
        "updated_at": v.updated_at,
    }


def serialize_fuel(row: models.VehicleFuelLog, *, txn_ref: Optional[str] = None) -> dict:
    return {
        "id": int(row.id),
        "vehicle_id": int(row.vehicle_id),
        "log_date": _fmt_date(row.log_date),
        "odometer": _num(row.odometer),
        "price_per_litre": _num(row.price_per_litre),
        "litres": _num(row.litres),
        "total_amount": float(row.total_amount),
        "is_full_tank": bool(row.is_full_tank),
        "station": row.station,
        "location": row.location,
        "payment_wallet": row.payment_wallet,
        "notes": row.notes,
        "receipt_attachment_id": int(row.receipt_attachment_id) if row.receipt_attachment_id else None,
        "distance_travelled": _num(row.distance_travelled),
        "km_per_litre": _num(row.km_per_litre),
        "cost_per_km": _num(row.cost_per_km),
        "wallet_id": int(row.wallet_id) if getattr(row, "wallet_id", None) else None,
        "transaction_id": int(row.transaction_id) if row.transaction_id else None,
        "transaction_reference_id": txn_ref,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def serialize_expense(row: models.VehicleExpense, *, txn_ref: Optional[str] = None) -> dict:
    return {
        "id": int(row.id),
        "vehicle_id": int(row.vehicle_id),
        "category": row.category,
        "expense_date": _fmt_date(row.expense_date),
        "amount": float(row.amount),
        "odometer": _num(row.odometer),
        "notes": row.notes,
        "wallet_id": int(row.wallet_id) if row.wallet_id else None,
        "transaction_id": int(row.transaction_id) if row.transaction_id else None,
        "transaction_reference_id": txn_ref,
        "receipt_attachment_id": int(row.receipt_attachment_id) if row.receipt_attachment_id else None,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def serialize_maintenance(row: models.VehicleMaintenance, *, txn_ref: Optional[str] = None) -> dict:
    return {
        "id": int(row.id),
        "vehicle_id": int(row.vehicle_id),
        "service_type": row.service_type,
        "service_date": _fmt_date(row.service_date),
        "odometer": _num(row.odometer),
        "workshop": row.workshop,
        "labour_cost": _num(row.labour_cost),
        "parts_cost": _num(row.parts_cost),
        "total_cost": _num(row.total_cost),
        "replaced_items": row.replaced_items,
        "next_service_date": _fmt_date(row.next_service_date),
        "next_service_odometer": _num(row.next_service_odometer),
        "notes": row.notes,
        "status": row.status,
        "receipt_attachment_id": int(row.receipt_attachment_id) if row.receipt_attachment_id else None,
        "wallet_id": int(row.wallet_id) if getattr(row, "wallet_id", None) else None,
        "transaction_id": int(row.transaction_id) if row.transaction_id else None,
        "transaction_reference_id": txn_ref,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


async def _get_user_wallet(
    db: AsyncSession,
    *,
    current_user: models.User,
    household_id: int,
    wallet_id: int,
) -> models.Wallet:
    result = await db.execute(
        select(models.Wallet).where(
            models.Wallet.id == int(wallet_id),
            or_(
                models.Wallet.owner_user_id == current_user.id,
                models.Wallet.household_id == household_id,
            ),
        )
    )
    wallet = result.scalars().first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found.")
    return wallet


async def _create_budget_transaction(
    db: AsyncSession,
    *,
    current_user: models.User,
    household_id: int,
    wallet_id: int,
    amount: float,
    txn_date: date,
    vendor_or_source: str,
    notes: Optional[str] = None,
) -> models.Transaction:
    if float(amount) <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero to create a transaction.")
    wallet = await _get_user_wallet(
        db, current_user=current_user, household_id=household_id, wallet_id=wallet_id
    )
    txn = models.Transaction(
        wallet_id=int(wallet.id),
        user_id=current_user.id,
        household_id=household_id,
        reference_id=models.generate_txn_reference(txn_date),
        type="expense",
        txn_date=txn_date,
        vendor_or_source=(vendor_or_source or "Vehicle")[:190],
        amount=float(amount),
        category_id=None,
        notes=(notes or "").strip()[:255] or None,
        source_channel="vehicle",
    )
    db.add(txn)
    await db.flush()
    return txn


async def _txn_ref_map(db: AsyncSession, txn_ids: list[int]) -> dict[int, str]:
    if not txn_ids:
        return {}
    result = await db.execute(
        select(models.Transaction.id, models.Transaction.reference_id).where(
            models.Transaction.id.in_(txn_ids)
        )
    )
    return {int(i): (ref or f"TXN-{i}") for i, ref in result.all()}


def serialize_document(row: models.VehicleDocument) -> dict:
    return {
        "id": int(row.id),
        "vehicle_id": int(row.vehicle_id),
        "doc_type": row.doc_type,
        "title": row.title,
        "start_date": _fmt_date(row.start_date),
        "expiry_date": _fmt_date(row.expiry_date),
        "amount": _num(row.amount),
        "provider": row.provider,
        "reference_number": row.reference_number,
        "coverage_info": row.coverage_info,
        "notes": row.notes,
        "status": row.status,
        "file_attachment_id": int(row.file_attachment_id) if row.file_attachment_id else None,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def serialize_reminder(
    row: models.VehicleReminder,
    *,
    vehicle: Optional[models.Vehicle] = None,
    today: Optional[date] = None,
) -> dict:
    today = today or date.today()
    days_overdue = None
    km_overdue = None
    is_overdue = False
    is_due_soon = False
    if row.due_date is not None:
        delta = (row.due_date - today).days
        if delta < 0:
            days_overdue = abs(delta)
            is_overdue = True
        elif delta <= 14:
            is_due_soon = True
    if row.due_odometer is not None and vehicle and vehicle.current_odometer is not None:
        km = float(vehicle.current_odometer) - float(row.due_odometer)
        if km > 0:
            km_overdue = km
            is_overdue = True
        elif km >= -500:
            is_due_soon = True
    return {
        "id": int(row.id),
        "vehicle_id": int(row.vehicle_id),
        "vehicle_name": vehicle.name if vehicle else None,
        "registration_number": vehicle.registration_number if vehicle else None,
        "reminder_type": row.reminder_type,
        "title": row.title,
        "due_date": _fmt_date(row.due_date),
        "due_odometer": _num(row.due_odometer),
        "status": row.status,
        "source_type": row.source_type,
        "source_id": int(row.source_id) if row.source_id else None,
        "notes": row.notes,
        "days_overdue": days_overdue,
        "km_overdue": km_overdue,
        "is_overdue": is_overdue,
        "is_due_soon": is_due_soon,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def serialize_odometer(row: models.VehicleOdometerReading) -> dict:
    return {
        "id": int(row.id),
        "vehicle_id": int(row.vehicle_id),
        "reading_date": _fmt_date(row.reading_date),
        "odometer": float(row.odometer),
        "source": row.source,
        "source_id": int(row.source_id) if row.source_id else None,
        "notes": row.notes,
        "created_at": row.created_at,
    }


def serialize_attachment(row: models.VehicleAttachment) -> dict:
    return {
        "id": int(row.id),
        "vehicle_id": int(row.vehicle_id),
        "parent_type": row.parent_type,
        "parent_id": int(row.parent_id) if row.parent_id else None,
        "file_name": row.file_name,
        "mime_type": row.mime_type,
        "size_bytes": int(row.size_bytes) if row.size_bytes is not None else None,
        "created_at": row.created_at,
    }


async def _maybe_bump_odometer(
    db: AsyncSession,
    vehicle: models.Vehicle,
    *,
    odometer: Optional[float],
    reading_date: date,
    source: str,
    source_id: Optional[int],
    notes: Optional[str] = None,
) -> None:
    if odometer is None:
        return
    if odometer < 0:
        raise HTTPException(status_code=400, detail="Odometer cannot be negative.")
    current = float(vehicle.current_odometer) if vehicle.current_odometer is not None else None
    if current is not None and odometer < current - 0.05:
        # Allow equal or higher only for new max; older edits recalculate separately.
        pass
    if current is None or odometer >= current:
        vehicle.current_odometer = odometer
    reading = models.VehicleOdometerReading(
        vehicle_id=vehicle.id,
        household_id=vehicle.household_id,
        reading_date=reading_date,
        odometer=odometer,
        source=source,
        source_id=source_id,
        notes=notes,
    )
    db.add(reading)


async def recalculate_fuel_efficiency(db: AsyncSession, vehicle_id: int, household_id: int) -> None:
    """Recompute distance / km_per_litre / cost_per_km for full-tank sequences."""
    result = await db.execute(
        select(models.VehicleFuelLog)
        .where(
            models.VehicleFuelLog.vehicle_id == vehicle_id,
            models.VehicleFuelLog.household_id == household_id,
        )
        .order_by(models.VehicleFuelLog.log_date.asc(), models.VehicleFuelLog.id.asc())
    )
    logs = list(result.scalars().all())
    prev_full: Optional[models.VehicleFuelLog] = None
    for log in logs:
        log.distance_travelled = None
        log.km_per_litre = None
        log.cost_per_km = None
        if not log.is_full_tank or log.odometer is None:
            if log.is_full_tank:
                prev_full = log
            continue
        if prev_full is not None and prev_full.odometer is not None and log.litres and float(log.litres) > 0:
            distance = float(log.odometer) - float(prev_full.odometer)
            if distance > 0:
                log.distance_travelled = distance
                log.km_per_litre = distance / float(log.litres)
                if float(log.total_amount or 0) > 0:
                    log.cost_per_km = float(log.total_amount) / distance
        prev_full = log


async def create_vehicle(
    db: AsyncSession,
    *,
    current_user: models.User,
    payload: VehicleCreate,
) -> models.Vehicle:
    household_id = await queries.ensure_household(db, current_user)
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Vehicle name is required.")
    odometer = payload.current_odometer
    if odometer is not None and odometer < 0:
        raise HTTPException(status_code=400, detail="Odometer cannot be negative.")
    vehicle = models.Vehicle(
        household_id=household_id,
        created_by_user_id=current_user.id,
        name=name,
        vehicle_type=(payload.vehicle_type or "").strip() or None,
        registration_number=(payload.registration_number or "").strip().upper() or None,
        brand=(payload.brand or "").strip() or None,
        model=(payload.model or "").strip() or None,
        variant=(payload.variant or "").strip() or None,
        year=payload.year,
        color=(payload.color or "").strip() or None,
        fuel_type=(payload.fuel_type or "").strip() or None,
        engine_capacity=(payload.engine_capacity or "").strip() or None,
        purchase_date=_parse_date(payload.purchase_date, "purchase_date"),
        purchase_price=payload.purchase_price,
        current_odometer=odometer,
        status=payload.status or "active",
        notes=(payload.notes or "").strip() or None,
    )
    db.add(vehicle)
    await db.flush()
    if odometer is not None:
        await _maybe_bump_odometer(
            db,
            vehicle,
            odometer=odometer,
            reading_date=date.today(),
            source="manual",
            source_id=None,
            notes="Initial odometer",
        )
    await db.commit()
    await db.refresh(vehicle)
    return vehicle


async def update_vehicle(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    payload: VehicleUpdate,
) -> models.Vehicle:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Vehicle name is required.")
        vehicle.name = name
    for field in (
        "vehicle_type",
        "brand",
        "model",
        "variant",
        "color",
        "fuel_type",
        "engine_capacity",
        "notes",
        "status",
        "year",
        "purchase_price",
    ):
        if field in data:
            value = data[field]
            if isinstance(value, str):
                value = value.strip() or None
            setattr(vehicle, field, value)
    if "registration_number" in data:
        vehicle.registration_number = (payload.registration_number or "").strip().upper() or None
    if "purchase_date" in data:
        vehicle.purchase_date = _parse_date(payload.purchase_date, "purchase_date")
    if "current_odometer" in data and payload.current_odometer is not None:
        if payload.current_odometer < 0:
            raise HTTPException(status_code=400, detail="Odometer cannot be negative.")
        current = float(vehicle.current_odometer) if vehicle.current_odometer is not None else None
        if current is not None and payload.current_odometer < current - 0.05:
            raise HTTPException(status_code=400, detail="New odometer cannot be lower than the latest reading.")
        await _maybe_bump_odometer(
            db,
            vehicle,
            odometer=payload.current_odometer,
            reading_date=date.today(),
            source="manual",
            source_id=None,
        )
    vehicle.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(vehicle)
    return vehicle


async def delete_vehicle(db: AsyncSession, *, current_user: models.User, vehicle_id: int) -> None:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    attachments = await db.execute(
        select(models.VehicleAttachment).where(
            models.VehicleAttachment.vehicle_id == vehicle_id,
            models.VehicleAttachment.household_id == household_id,
        )
    )
    for att in attachments.scalars().all():
        try:
            storage.delete(att.object_key)
        except Exception:
            pass
    if vehicle.image_object_key:
        try:
            storage.delete(vehicle.image_object_key)
        except Exception:
            pass
    await db.delete(vehicle)
    await db.commit()


async def create_fuel_log(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    payload: FuelLogCreate,
) -> models.VehicleFuelLog:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    if payload.total_amount is None or float(payload.total_amount) < 0:
        raise HTTPException(status_code=400, detail="total_amount is required.")
    log_date = _parse_date(payload.log_date, "log_date") or date.today()
    if payload.odometer is not None and payload.odometer < 0:
        raise HTTPException(status_code=400, detail="Odometer cannot be negative.")

    amount = float(payload.total_amount)
    should_create_txn = bool(payload.create_transaction) and amount > 0
    if should_create_txn and not payload.wallet_id:
        raise HTTPException(status_code=400, detail="wallet_id is required to create a budget transaction.")

    wallet_name = (payload.payment_wallet or "").strip() or None
    txn: models.Transaction | None = None
    if should_create_txn and payload.wallet_id:
        station = (payload.station or "").strip()
        label = f"Fuel · {vehicle.name}" + (f" · {station}" if station else "")
        txn = await _create_budget_transaction(
            db,
            current_user=current_user,
            household_id=household_id,
            wallet_id=int(payload.wallet_id),
            amount=amount,
            txn_date=log_date,
            vendor_or_source=label,
            notes=(payload.notes or f"Vehicle fuel for {vehicle.name}").strip() or None,
        )
        wallet = await _get_user_wallet(
            db, current_user=current_user, household_id=household_id, wallet_id=int(payload.wallet_id)
        )
        wallet_name = (getattr(wallet, "label", None) or wallet.name or wallet_name or None)

    row = models.VehicleFuelLog(
        vehicle_id=vehicle.id,
        household_id=household_id,
        log_date=log_date,
        odometer=payload.odometer,
        price_per_litre=payload.price_per_litre,
        litres=payload.litres,
        total_amount=amount,
        is_full_tank=bool(payload.is_full_tank),
        station=(payload.station or "").strip() or None,
        location=(payload.location or "").strip() or None,
        payment_wallet=wallet_name,
        notes=(payload.notes or "").strip() or None,
        wallet_id=int(payload.wallet_id) if payload.wallet_id else None,
        transaction_id=int(txn.id) if txn else None,
    )
    db.add(row)
    await db.flush()
    await _maybe_bump_odometer(
        db,
        vehicle,
        odometer=payload.odometer,
        reading_date=log_date,
        source="fuel",
        source_id=int(row.id),
    )
    await recalculate_fuel_efficiency(db, vehicle_id=int(vehicle.id), household_id=household_id)
    await db.commit()
    await db.refresh(row)
    return row


async def update_fuel_log(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    fuel_log_id: int,
    payload: FuelLogUpdate,
) -> models.VehicleFuelLog:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    result = await db.execute(
        select(models.VehicleFuelLog).where(
            models.VehicleFuelLog.id == fuel_log_id,
            models.VehicleFuelLog.vehicle_id == vehicle_id,
            models.VehicleFuelLog.household_id == household_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Fuel log not found.")
    data = payload.model_dump(exclude_unset=True)
    if "log_date" in data:
        row.log_date = _parse_date(payload.log_date, "log_date") or row.log_date
    for field in ("odometer", "price_per_litre", "litres", "total_amount", "is_full_tank"):
        if field in data:
            setattr(row, field, data[field])
    for field in ("station", "location", "payment_wallet", "notes"):
        if field in data:
            value = data[field]
            setattr(row, field, (value or "").strip() or None if isinstance(value, str) else value)
    if payload.odometer is not None:
        await _maybe_bump_odometer(
            db,
            vehicle,
            odometer=payload.odometer,
            reading_date=row.log_date,
            source="fuel",
            source_id=int(row.id),
        )
    await recalculate_fuel_efficiency(db, vehicle_id=int(vehicle.id), household_id=household_id)
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row


async def delete_fuel_log(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    fuel_log_id: int,
) -> None:
    household_id = await queries.ensure_household(db, current_user)
    result = await db.execute(
        select(models.VehicleFuelLog).where(
            models.VehicleFuelLog.id == fuel_log_id,
            models.VehicleFuelLog.vehicle_id == vehicle_id,
            models.VehicleFuelLog.household_id == household_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Fuel log not found.")
    if row.receipt_attachment_id:
        await _delete_attachment_internal(db, attachment_id=int(row.receipt_attachment_id), household_id=household_id)
    await db.delete(row)
    await recalculate_fuel_efficiency(db, vehicle_id=vehicle_id, household_id=household_id)
    await db.commit()


async def create_expense(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    payload: ExpenseCreate,
) -> models.VehicleExpense:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    category = (payload.category or "").strip()
    if not category:
        raise HTTPException(status_code=400, detail="category is required.")
    if float(payload.amount) < 0:
        raise HTTPException(status_code=400, detail="amount must be >= 0.")
    expense_date = _parse_date(payload.expense_date, "expense_date") or date.today()
    transaction_id = payload.transaction_id
    amount = float(payload.amount)
    if transaction_id is not None:
        txn_res = await db.execute(
            select(models.Transaction).where(
                models.Transaction.id == transaction_id,
                models.Transaction.household_id == household_id,
            )
        )
        if not txn_res.scalars().first():
            raise HTTPException(status_code=400, detail="Linked transaction not found in household.")
    elif bool(payload.create_transaction) and amount > 0:
        if not payload.wallet_id:
            raise HTTPException(status_code=400, detail="wallet_id is required to create a budget transaction.")
        txn = await _create_budget_transaction(
            db,
            current_user=current_user,
            household_id=household_id,
            wallet_id=int(payload.wallet_id),
            amount=amount,
            txn_date=expense_date,
            vendor_or_source=f"Vehicle · {vehicle.name} · {category}",
            notes=(payload.notes or f"Vehicle expense ({category}) for {vehicle.name}").strip() or None,
        )
        transaction_id = int(txn.id)

    row = models.VehicleExpense(
        vehicle_id=vehicle.id,
        household_id=household_id,
        category=category,
        expense_date=expense_date,
        amount=amount,
        odometer=payload.odometer,
        notes=(payload.notes or "").strip() or None,
        wallet_id=payload.wallet_id,
        transaction_id=transaction_id,
    )
    db.add(row)
    await db.flush()
    await _maybe_bump_odometer(
        db,
        vehicle,
        odometer=payload.odometer,
        reading_date=expense_date,
        source="manual",
        source_id=int(row.id),
        notes=f"Expense: {category}",
    )
    await db.commit()
    await db.refresh(row)
    return row


async def update_expense(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    expense_id: int,
    payload: ExpenseUpdate,
) -> models.VehicleExpense:
    household_id = await queries.ensure_household(db, current_user)
    result = await db.execute(
        select(models.VehicleExpense).where(
            models.VehicleExpense.id == expense_id,
            models.VehicleExpense.vehicle_id == vehicle_id,
            models.VehicleExpense.household_id == household_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found.")
    data = payload.model_dump(exclude_unset=True)
    if "expense_date" in data:
        row.expense_date = _parse_date(payload.expense_date, "expense_date") or row.expense_date
    if "category" in data:
        row.category = (payload.category or "").strip() or row.category
    if "amount" in data and payload.amount is not None:
        row.amount = float(payload.amount)
    if "odometer" in data:
        row.odometer = payload.odometer
    if "notes" in data:
        row.notes = (payload.notes or "").strip() or None
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row


async def delete_expense(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    expense_id: int,
) -> None:
    household_id = await queries.ensure_household(db, current_user)
    result = await db.execute(
        select(models.VehicleExpense).where(
            models.VehicleExpense.id == expense_id,
            models.VehicleExpense.vehicle_id == vehicle_id,
            models.VehicleExpense.household_id == household_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found.")
    if row.receipt_attachment_id:
        await _delete_attachment_internal(db, attachment_id=int(row.receipt_attachment_id), household_id=household_id)
    await db.delete(row)
    await db.commit()


async def create_maintenance(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    payload: MaintenanceCreate,
) -> models.VehicleMaintenance:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    service_type = (payload.service_type or "").strip()
    if not service_type:
        raise HTTPException(status_code=400, detail="service_type is required.")
    service_date = _parse_date(payload.service_date, "service_date") or date.today()
    labour = float(payload.labour_cost or 0)
    parts = float(payload.parts_cost or 0)
    total = payload.total_cost
    if total is None:
        total = labour + parts if (payload.labour_cost is not None or payload.parts_cost is not None) else None

    txn: models.Transaction | None = None
    amount = float(total or 0)
    if bool(payload.create_transaction) and amount > 0:
        if not payload.wallet_id:
            raise HTTPException(status_code=400, detail="wallet_id is required to create a budget transaction.")
        txn = await _create_budget_transaction(
            db,
            current_user=current_user,
            household_id=household_id,
            wallet_id=int(payload.wallet_id),
            amount=amount,
            txn_date=service_date,
            vendor_or_source=f"Vehicle · {vehicle.name} · {service_type}",
            notes=(payload.notes or f"Vehicle service ({service_type}) for {vehicle.name}").strip() or None,
        )

    row = models.VehicleMaintenance(
        vehicle_id=vehicle.id,
        household_id=household_id,
        service_type=service_type,
        service_date=service_date,
        odometer=payload.odometer,
        workshop=(payload.workshop or "").strip() or None,
        labour_cost=payload.labour_cost,
        parts_cost=payload.parts_cost,
        total_cost=total,
        replaced_items=(payload.replaced_items or "").strip() or None,
        next_service_date=_parse_date(payload.next_service_date, "next_service_date"),
        next_service_odometer=payload.next_service_odometer,
        notes=(payload.notes or "").strip() or None,
        status=payload.status or "completed",
        wallet_id=int(payload.wallet_id) if payload.wallet_id else None,
        transaction_id=int(txn.id) if txn else None,
    )
    db.add(row)
    await db.flush()
    await _maybe_bump_odometer(
        db,
        vehicle,
        odometer=payload.odometer,
        reading_date=service_date,
        source="maintenance",
        source_id=int(row.id),
    )
    # Auto-create next service reminder
    if row.next_service_date or row.next_service_odometer is not None:
        reminder = models.VehicleReminder(
            vehicle_id=vehicle.id,
            household_id=household_id,
            reminder_type="service",
            title=f"Next service: {service_type}",
            due_date=row.next_service_date,
            due_odometer=row.next_service_odometer,
            status="pending",
            source_type="maintenance",
            source_id=int(row.id),
        )
        db.add(reminder)
    await db.commit()
    await db.refresh(row)
    return row


async def get_link_by_transaction(
    db: AsyncSession,
    *,
    current_user: models.User,
    txn_id: int | str,
) -> dict:
    """Resolve a budget transaction back to a vehicle fuel/expense/service record."""
    household_id = await queries.ensure_household(db, current_user)

    # Accept numeric id or reference_id (TXN26-XXXXXX)
    txn_query = select(models.Transaction).where(models.Transaction.household_id == household_id)
    raw = str(txn_id).strip()
    if raw.isdigit():
        txn_query = txn_query.where(models.Transaction.id == int(raw))
    else:
        txn_query = txn_query.where(models.Transaction.reference_id == raw.upper())
    txn_res = await db.execute(txn_query)
    txn = txn_res.scalars().first()
    if not txn:
        # also allow user_id match (some txns may miss household)
        if raw.isdigit():
            txn_res = await db.execute(
                select(models.Transaction).where(
                    models.Transaction.id == int(raw),
                    models.Transaction.user_id == current_user.id,
                )
            )
        else:
            txn_res = await db.execute(
                select(models.Transaction).where(
                    models.Transaction.reference_id == raw.upper(),
                    models.Transaction.user_id == current_user.id,
                )
            )
        txn = txn_res.scalars().first()
    if not txn:
        return {
            "vehicle_id": None,
            "vehicle_name": None,
            "registration_number": None,
            "kind": None,
            "record_id": None,
            "label": None,
            "transaction_id": None,
            "transaction_reference_id": None,
        }

    tid = int(txn.id)
    fuel = (
        await db.execute(
            select(models.VehicleFuelLog).where(
                models.VehicleFuelLog.transaction_id == tid,
                models.VehicleFuelLog.household_id == household_id,
            )
        )
    ).scalars().first()
    if fuel:
        vehicle = await queries.get_vehicle_or_404(
            db, vehicle_id=int(fuel.vehicle_id), household_id=household_id
        )
        return {
            "vehicle_id": int(vehicle.id),
            "vehicle_name": vehicle.name,
            "registration_number": vehicle.registration_number,
            "kind": "fuel",
            "record_id": int(fuel.id),
            "label": f"Fuel · {vehicle.name}",
            "transaction_id": tid,
            "transaction_reference_id": txn.reference_id,
        }

    expense = (
        await db.execute(
            select(models.VehicleExpense).where(
                models.VehicleExpense.transaction_id == tid,
                models.VehicleExpense.household_id == household_id,
            )
        )
    ).scalars().first()
    if expense:
        vehicle = await queries.get_vehicle_or_404(
            db, vehicle_id=int(expense.vehicle_id), household_id=household_id
        )
        return {
            "vehicle_id": int(vehicle.id),
            "vehicle_name": vehicle.name,
            "registration_number": vehicle.registration_number,
            "kind": "expense",
            "record_id": int(expense.id),
            "label": f"{expense.category} · {vehicle.name}",
            "transaction_id": tid,
            "transaction_reference_id": txn.reference_id,
        }

    maint = (
        await db.execute(
            select(models.VehicleMaintenance).where(
                models.VehicleMaintenance.transaction_id == tid,
                models.VehicleMaintenance.household_id == household_id,
            )
        )
    ).scalars().first()
    if maint:
        vehicle = await queries.get_vehicle_or_404(
            db, vehicle_id=int(maint.vehicle_id), household_id=household_id
        )
        return {
            "vehicle_id": int(vehicle.id),
            "vehicle_name": vehicle.name,
            "registration_number": vehicle.registration_number,
            "kind": "maintenance",
            "record_id": int(maint.id),
            "label": f"{maint.service_type} · {vehicle.name}",
            "transaction_id": tid,
            "transaction_reference_id": txn.reference_id,
        }

    return {
        "vehicle_id": None,
        "vehicle_name": None,
        "registration_number": None,
        "kind": None,
        "record_id": None,
        "label": None,
        "transaction_id": tid,
        "transaction_reference_id": txn.reference_id,
    }


async def update_maintenance(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    maintenance_id: int,
    payload: MaintenanceUpdate,
) -> models.VehicleMaintenance:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    result = await db.execute(
        select(models.VehicleMaintenance).where(
            models.VehicleMaintenance.id == maintenance_id,
            models.VehicleMaintenance.vehicle_id == vehicle_id,
            models.VehicleMaintenance.household_id == household_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Maintenance record not found.")
    data = payload.model_dump(exclude_unset=True)
    if "service_date" in data:
        row.service_date = _parse_date(payload.service_date, "service_date") or row.service_date
    if "next_service_date" in data:
        row.next_service_date = _parse_date(payload.next_service_date, "next_service_date")
    for field in (
        "service_type",
        "odometer",
        "workshop",
        "labour_cost",
        "parts_cost",
        "total_cost",
        "replaced_items",
        "next_service_odometer",
        "notes",
        "status",
    ):
        if field in data:
            value = data[field]
            if isinstance(value, str) and field in {"service_type", "workshop", "replaced_items", "notes"}:
                value = value.strip() or None
            setattr(row, field, value)
    if payload.odometer is not None:
        await _maybe_bump_odometer(
            db,
            vehicle,
            odometer=payload.odometer,
            reading_date=row.service_date,
            source="maintenance",
            source_id=int(row.id),
        )
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row


async def _delete_linked_reminders(
    db: AsyncSession,
    *,
    household_id: int,
    vehicle_id: int,
    source_type: str,
    source_id: int,
) -> None:
    """Remove auto-seeded reminders when their parent record is deleted."""
    await db.execute(
        sa_delete(models.VehicleReminder).where(
            models.VehicleReminder.household_id == household_id,
            models.VehicleReminder.vehicle_id == vehicle_id,
            models.VehicleReminder.source_type == source_type,
            models.VehicleReminder.source_id == int(source_id),
        )
    )


async def delete_maintenance(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    maintenance_id: int,
) -> None:
    household_id = await queries.ensure_household(db, current_user)
    result = await db.execute(
        select(models.VehicleMaintenance).where(
            models.VehicleMaintenance.id == maintenance_id,
            models.VehicleMaintenance.vehicle_id == vehicle_id,
            models.VehicleMaintenance.household_id == household_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Maintenance record not found.")
    if row.receipt_attachment_id:
        await _delete_attachment_internal(db, attachment_id=int(row.receipt_attachment_id), household_id=household_id)
    # Clear overdue/due reminders that pointed at this service record
    await _delete_linked_reminders(
        db,
        household_id=household_id,
        vehicle_id=vehicle_id,
        source_type="maintenance",
        source_id=int(row.id),
    )
    await db.delete(row)
    await db.commit()


async def create_document(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    payload: DocumentCreate,
) -> models.VehicleDocument:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required.")
    expiry = _parse_date(payload.expiry_date, "expiry_date")
    row = models.VehicleDocument(
        vehicle_id=vehicle.id,
        household_id=household_id,
        doc_type=payload.doc_type,
        title=title,
        start_date=_parse_date(payload.start_date, "start_date"),
        expiry_date=expiry,
        amount=payload.amount,
        provider=(payload.provider or "").strip() or None,
        reference_number=(payload.reference_number or "").strip() or None,
        coverage_info=(payload.coverage_info or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
        status="active",
    )
    db.add(row)
    await db.flush()
    # Seed standard expiry reminders (60/30/14/7/0 days)
    if expiry and payload.doc_type in {"road_tax", "insurance"}:
        label = "Road tax" if payload.doc_type == "road_tax" else "Insurance"
        for days_before in (60, 30, 14, 7, 0):
            due = expiry - timedelta(days=days_before)
            db.add(
                models.VehicleReminder(
                    vehicle_id=vehicle.id,
                    household_id=household_id,
                    reminder_type=payload.doc_type,
                    title=f"{label} expires" if days_before == 0 else f"{label} expires in {days_before} days",
                    due_date=due,
                    status="pending",
                    source_type="document",
                    source_id=int(row.id),
                )
            )
    await db.commit()
    await db.refresh(row)
    return row


async def update_document(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    document_id: int,
    payload: DocumentUpdate,
) -> models.VehicleDocument:
    household_id = await queries.ensure_household(db, current_user)
    result = await db.execute(
        select(models.VehicleDocument).where(
            models.VehicleDocument.id == document_id,
            models.VehicleDocument.vehicle_id == vehicle_id,
            models.VehicleDocument.household_id == household_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found.")
    data = payload.model_dump(exclude_unset=True)
    if "start_date" in data:
        row.start_date = _parse_date(payload.start_date, "start_date")
    if "expiry_date" in data:
        row.expiry_date = _parse_date(payload.expiry_date, "expiry_date")
    for field in ("doc_type", "title", "amount", "provider", "reference_number", "coverage_info", "notes", "status"):
        if field in data:
            value = data[field]
            if isinstance(value, str) and field != "doc_type" and field != "status":
                value = value.strip() or None
            setattr(row, field, value)
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row


async def delete_document(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    document_id: int,
) -> None:
    household_id = await queries.ensure_household(db, current_user)
    result = await db.execute(
        select(models.VehicleDocument).where(
            models.VehicleDocument.id == document_id,
            models.VehicleDocument.vehicle_id == vehicle_id,
            models.VehicleDocument.household_id == household_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found.")
    if row.file_attachment_id:
        await _delete_attachment_internal(db, attachment_id=int(row.file_attachment_id), household_id=household_id)
    # Clear road tax / insurance expiry reminders seeded for this document
    await _delete_linked_reminders(
        db,
        household_id=household_id,
        vehicle_id=vehicle_id,
        source_type="document",
        source_id=int(row.id),
    )
    await db.delete(row)
    await db.commit()


async def create_reminder(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    payload: ReminderCreate,
) -> models.VehicleReminder:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required.")
    row = models.VehicleReminder(
        vehicle_id=vehicle.id,
        household_id=household_id,
        reminder_type=payload.reminder_type or "custom",
        title=title,
        due_date=_parse_date(payload.due_date, "due_date"),
        due_odometer=payload.due_odometer,
        status="pending",
        source_type="manual",
        notes=(payload.notes or "").strip() or None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def update_reminder(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    reminder_id: int,
    payload: ReminderUpdate,
) -> models.VehicleReminder:
    household_id = await queries.ensure_household(db, current_user)
    result = await db.execute(
        select(models.VehicleReminder).where(
            models.VehicleReminder.id == reminder_id,
            models.VehicleReminder.vehicle_id == vehicle_id,
            models.VehicleReminder.household_id == household_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Reminder not found.")
    data = payload.model_dump(exclude_unset=True)
    if "due_date" in data:
        row.due_date = _parse_date(payload.due_date, "due_date")
    for field in ("reminder_type", "title", "due_odometer", "status", "notes"):
        if field in data:
            value = data[field]
            if isinstance(value, str) and field in {"title", "notes"}:
                value = value.strip() or None
            setattr(row, field, value)
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row


async def create_odometer(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    payload: OdometerCreate,
) -> models.VehicleOdometerReading:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    if payload.odometer < 0:
        raise HTTPException(status_code=400, detail="Odometer cannot be negative.")
    current = float(vehicle.current_odometer) if vehicle.current_odometer is not None else None
    if current is not None and payload.odometer < current - 0.05:
        raise HTTPException(status_code=400, detail="New odometer cannot be lower than the latest reading.")
    reading_date = _parse_date(payload.reading_date, "reading_date") or date.today()
    row = models.VehicleOdometerReading(
        vehicle_id=vehicle.id,
        household_id=household_id,
        reading_date=reading_date,
        odometer=payload.odometer,
        source="manual",
        notes=(payload.notes or "").strip() or None,
    )
    db.add(row)
    vehicle.current_odometer = payload.odometer
    vehicle.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row


async def upload_parent_file(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    kind: str,
    parent_id: int,
    file: UploadFile,
) -> models.VehicleAttachment:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    payload = await file.read()
    try:
        mime_type, extension = storage.validate_file(file.filename, file.content_type, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    parent_type = kind
    if kind == "fuel":
        result = await db.execute(
            select(models.VehicleFuelLog).where(
                models.VehicleFuelLog.id == parent_id,
                models.VehicleFuelLog.vehicle_id == vehicle_id,
                models.VehicleFuelLog.household_id == household_id,
            )
        )
        parent = result.scalars().first()
        if not parent:
            raise HTTPException(status_code=404, detail="Fuel log not found.")
    elif kind == "expenses":
        parent_type = "expense"
        result = await db.execute(
            select(models.VehicleExpense).where(
                models.VehicleExpense.id == parent_id,
                models.VehicleExpense.vehicle_id == vehicle_id,
                models.VehicleExpense.household_id == household_id,
            )
        )
        parent = result.scalars().first()
        if not parent:
            raise HTTPException(status_code=404, detail="Expense not found.")
    elif kind == "maintenance":
        result = await db.execute(
            select(models.VehicleMaintenance).where(
                models.VehicleMaintenance.id == parent_id,
                models.VehicleMaintenance.vehicle_id == vehicle_id,
                models.VehicleMaintenance.household_id == household_id,
            )
        )
        parent = result.scalars().first()
        if not parent:
            raise HTTPException(status_code=404, detail="Maintenance record not found.")
    elif kind == "documents":
        parent_type = "document"
        result = await db.execute(
            select(models.VehicleDocument).where(
                models.VehicleDocument.id == parent_id,
                models.VehicleDocument.vehicle_id == vehicle_id,
                models.VehicleDocument.household_id == household_id,
            )
        )
        parent = result.scalars().first()
        if not parent:
            raise HTTPException(status_code=404, detail="Document not found.")
    else:
        raise HTTPException(status_code=400, detail="Unsupported upload kind.")

    object_key = storage.build_vehicle_object_key(
        household_id=household_id,
        vehicle_id=int(vehicle.id),
        kind=kind,
        parent_id=parent_id,
        filename=file.filename,
        extension=extension,
    )
    try:
        storage.upload(object_key, payload, mime_type, filename=file.filename)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}") from exc

    att = models.VehicleAttachment(
        vehicle_id=vehicle.id,
        household_id=household_id,
        parent_type=parent_type,
        parent_id=parent_id,
        file_name=file.filename or f"file{extension}",
        object_key=object_key,
        mime_type=mime_type,
        size_bytes=len(payload),
        uploaded_by_user_id=current_user.id,
    )
    db.add(att)
    await db.flush()
    if kind == "fuel":
        parent.receipt_attachment_id = att.id
    elif kind == "expenses":
        parent.receipt_attachment_id = att.id
    elif kind == "maintenance":
        parent.receipt_attachment_id = att.id
    elif kind == "documents":
        parent.file_attachment_id = att.id
    await db.commit()
    await db.refresh(att)
    return att


async def upload_vehicle_image(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
    file: UploadFile,
) -> models.Vehicle:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    payload = await file.read()
    try:
        mime_type, extension = storage.validate_file(file.filename, file.content_type, payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not mime_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Vehicle image must be an image file.")
    object_key = storage.build_vehicle_object_key(
        household_id=household_id,
        vehicle_id=int(vehicle.id),
        kind="images",
        parent_id=None,
        filename=file.filename,
        extension=extension,
    )
    try:
        storage.upload(object_key, payload, mime_type, filename=file.filename)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}") from exc
    old_key = vehicle.image_object_key
    vehicle.image_object_key = object_key
    att = models.VehicleAttachment(
        vehicle_id=vehicle.id,
        household_id=household_id,
        parent_type="vehicle_image",
        parent_id=int(vehicle.id),
        file_name=file.filename or f"image{extension}",
        object_key=object_key,
        mime_type=mime_type,
        size_bytes=len(payload),
        uploaded_by_user_id=current_user.id,
    )
    db.add(att)
    await db.commit()
    await db.refresh(vehicle)
    if old_key and old_key != object_key:
        try:
            storage.delete(old_key)
        except Exception:
            pass
    return vehicle


async def delete_vehicle_image(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
) -> models.Vehicle:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    if vehicle.image_object_key:
        try:
            storage.delete(vehicle.image_object_key)
        except Exception:
            pass
        vehicle.image_object_key = None
        await db.commit()
        await db.refresh(vehicle)
    return vehicle


async def get_attachment_bytes(
    db: AsyncSession,
    *,
    current_user: models.User,
    attachment_id: int,
) -> tuple[bytes, str, str]:
    household_id = await queries.ensure_household(db, current_user)
    att = await queries.get_attachment_or_404(db, attachment_id=attachment_id, household_id=household_id)
    try:
        payload, content_type = storage.download(att.object_key)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"File not found: {exc}") from exc
    return payload, content_type or att.mime_type or "application/octet-stream", att.file_name


async def get_vehicle_image_bytes(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: int,
) -> tuple[bytes, str, str]:
    household_id = await queries.ensure_household(db, current_user)
    vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
    if not vehicle.image_object_key:
        raise HTTPException(status_code=404, detail="Vehicle image not found.")
    try:
        payload, content_type = storage.download(vehicle.image_object_key)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"File not found: {exc}") from exc
    return payload, content_type or "image/jpeg", "vehicle-image"


async def _delete_attachment_internal(db: AsyncSession, *, attachment_id: int, household_id: int) -> None:
    result = await db.execute(
        select(models.VehicleAttachment).where(
            models.VehicleAttachment.id == attachment_id,
            models.VehicleAttachment.household_id == household_id,
        )
    )
    att = result.scalars().first()
    if not att:
        return
    try:
        storage.delete(att.object_key)
    except Exception:
        pass
    await db.delete(att)


async def delete_attachment(
    db: AsyncSession,
    *,
    current_user: models.User,
    attachment_id: int,
) -> None:
    household_id = await queries.ensure_household(db, current_user)
    await _delete_attachment_internal(db, attachment_id=attachment_id, household_id=household_id)
    await db.commit()


def _month_bounds(month_key: Optional[str]) -> tuple[str, date, date]:
    if not month_key:
        today = date.today()
        month_key = today.strftime("%Y-%m")
    try:
        year, month = map(int, month_key.split("-"))
        start = date(year, month, 1)
        end = date(year, month, calendar.monthrange(year, month)[1])
    except Exception as exc:
        raise HTTPException(status_code=400, detail="month_key must be YYYY-MM") from exc
    return month_key, start, end


async def build_vehicle_summary(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: Optional[int] = None,
    month_key: Optional[str] = None,
) -> dict:
    household_id = await queries.ensure_household(db, current_user)
    month_key, start, end = _month_bounds(month_key)
    if vehicle_id is not None:
        vehicle = await queries.get_vehicle_or_404(db, vehicle_id=vehicle_id, household_id=household_id)
        return await _summary_for_vehicle(db, vehicle=vehicle, household_id=household_id, month_key=month_key, start=start, end=end)

    vehicles = await queries.list_vehicles(db, household_id=household_id, include_inactive=False)
    items = []
    total_cost = fuel_cost = maintenance_cost = expense_cost = 0.0
    distance = 0.0
    for v in vehicles:
        s = await _summary_for_vehicle(db, vehicle=v, household_id=household_id, month_key=month_key, start=start, end=end)
        items.append(s)
        total_cost += s["total_cost"]
        fuel_cost += s["fuel_cost"]
        maintenance_cost += s["maintenance_cost"]
        expense_cost += s["expense_cost"]
        if s.get("distance_travelled"):
            distance += float(s["distance_travelled"])
    return {
        "vehicle_id": None,
        "vehicle_name": None,
        "registration_number": None,
        "current_odometer": None,
        "month_key": month_key,
        "total_cost": total_cost,
        "fuel_cost": fuel_cost,
        "maintenance_cost": maintenance_cost,
        "expense_cost": expense_cost,
        "distance_travelled": distance if distance > 0 else None,
        "avg_km_per_litre": await queries.avg_efficiency(
            db, household_id=household_id, vehicle_id=None, month_start=start, month_end=end
        ),
        "next_service_date": None,
        "next_service_odometer": None,
        "road_tax_expiry": None,
        "insurance_expiry": None,
        "vehicles": items,
    }


async def _summary_for_vehicle(
    db: AsyncSession,
    *,
    vehicle: models.Vehicle,
    household_id: int,
    month_key: str,
    start: date,
    end: date,
) -> dict:
    fuel_cost = await queries.month_fuel_total(
        db, household_id=household_id, vehicle_id=int(vehicle.id), month_start=start, month_end=end
    )
    expense_cost = await queries.month_expense_total(
        db, household_id=household_id, vehicle_id=int(vehicle.id), month_start=start, month_end=end
    )
    maintenance_cost = await queries.month_maintenance_total(
        db, household_id=household_id, vehicle_id=int(vehicle.id), month_start=start, month_end=end
    )
    distance = await queries.month_distance(
        db, household_id=household_id, vehicle_id=int(vehicle.id), month_start=start, month_end=end
    )
    avg_kpl = await queries.avg_efficiency(
        db, household_id=household_id, vehicle_id=int(vehicle.id), month_start=start, month_end=end
    )
    # Next service from latest maintenance with next_* set
    maint_res = await db.execute(
        select(models.VehicleMaintenance)
        .where(
            models.VehicleMaintenance.vehicle_id == vehicle.id,
            models.VehicleMaintenance.household_id == household_id,
        )
        .order_by(models.VehicleMaintenance.service_date.desc(), models.VehicleMaintenance.id.desc())
        .limit(20)
    )
    next_service_date = None
    next_service_odometer = None
    for m in maint_res.scalars().all():
        if m.next_service_date or m.next_service_odometer is not None:
            next_service_date = _fmt_date(m.next_service_date)
            next_service_odometer = _num(m.next_service_odometer)
            break
    docs = await queries.list_documents(db, vehicle_id=int(vehicle.id), household_id=household_id)
    road_tax_expiry = None
    insurance_expiry = None
    for d in docs:
        if d.doc_type == "road_tax" and d.expiry_date and road_tax_expiry is None:
            road_tax_expiry = _fmt_date(d.expiry_date)
        if d.doc_type == "insurance" and d.expiry_date and insurance_expiry is None:
            insurance_expiry = _fmt_date(d.expiry_date)
    return {
        "vehicle_id": int(vehicle.id),
        "vehicle_name": vehicle.name,
        "registration_number": vehicle.registration_number,
        "current_odometer": _num(vehicle.current_odometer),
        "month_key": month_key,
        "total_cost": fuel_cost + expense_cost + maintenance_cost,
        "fuel_cost": fuel_cost,
        "maintenance_cost": maintenance_cost,
        "expense_cost": expense_cost,
        "distance_travelled": distance,
        "avg_km_per_litre": avg_kpl,
        "next_service_date": next_service_date,
        "next_service_odometer": next_service_odometer,
        "road_tax_expiry": road_tax_expiry,
        "insurance_expiry": insurance_expiry,
        "vehicles": None,
    }


async def _reminder_source_exists(
    db: AsyncSession,
    *,
    household_id: int,
    source_type: Optional[str],
    source_id: Optional[int],
) -> bool:
    """Return False for orphaned auto-reminders (parent deleted)."""
    if not source_type or source_id is None:
        return True  # manual reminders without source stay
    if source_type == "maintenance":
        res = await db.execute(
            select(models.VehicleMaintenance.id).where(
                models.VehicleMaintenance.id == int(source_id),
                models.VehicleMaintenance.household_id == household_id,
            )
        )
        return res.scalar_one_or_none() is not None
    if source_type == "document":
        res = await db.execute(
            select(models.VehicleDocument.id).where(
                models.VehicleDocument.id == int(source_id),
                models.VehicleDocument.household_id == household_id,
            )
        )
        return res.scalar_one_or_none() is not None
    return True


async def build_due_reminders(
    db: AsyncSession,
    *,
    current_user: models.User,
    vehicle_id: Optional[int] = None,
) -> list[dict]:
    household_id = await queries.ensure_household(db, current_user)
    vehicles = await queries.list_vehicles(db, household_id=household_id, include_inactive=False)
    vehicle_map = {int(v.id): v for v in vehicles}
    if vehicle_id is not None:
        if vehicle_id not in vehicle_map:
            vehicle = await queries.get_vehicle_or_404(
                db, vehicle_id=vehicle_id, household_id=household_id
            )
            vehicle_map[int(vehicle.id)] = vehicle
        vehicle_ids = {vehicle_id}
    else:
        vehicle_ids = set(vehicle_map.keys())
    reminders = await queries.list_reminders(
        db, household_id=household_id, vehicle_id=vehicle_id, statuses=("pending",)
    )
    today = date.today()
    items = []
    orphan_ids: list[int] = []
    seen_keys: set[tuple] = set()

    for r in reminders:
        if int(r.vehicle_id) not in vehicle_ids:
            continue
        # Drop (and clean) orphaned reminders whose parent was deleted
        if r.source_type in {"maintenance", "document"} and r.source_id is not None:
            exists = await _reminder_source_exists(
                db,
                household_id=household_id,
                source_type=r.source_type,
                source_id=int(r.source_id),
            )
            if not exists:
                orphan_ids.append(int(r.id))
                continue
        v = vehicle_map.get(int(r.vehicle_id))
        serialized = serialize_reminder(r, vehicle=v, today=today)
        # Dedupe key for later synthetic items
        key = (
            int(r.vehicle_id),
            r.source_type or r.reminder_type,
            int(r.source_id) if r.source_id is not None else int(r.id),
            serialized.get("due_date"),
            serialized.get("due_odometer"),
        )
        seen_keys.add(key)
        items.append(serialized)

    # Best-effort cleanup of orphaned reminder rows left by older deletes
    if orphan_ids:
        await db.execute(
            sa_delete(models.VehicleReminder).where(models.VehicleReminder.id.in_(orphan_ids))
        )
        await db.commit()

    # Synthetic overdue from live maintenance records only (not deleted ones)
    target_vehicles = (
        [vehicle_map[vehicle_id]] if vehicle_id is not None and vehicle_id in vehicle_map else list(vehicles)
    )
    for v in target_vehicles:
        for m in await queries.list_maintenance(db, vehicle_id=int(v.id), household_id=household_id, limit=30):
            is_date_overdue = bool(m.next_service_date and m.next_service_date < today)
            is_odo_overdue = bool(
                m.next_service_odometer is not None
                and v.current_odometer is not None
                and float(v.current_odometer) > float(m.next_service_odometer)
            )
            if not is_date_overdue and not is_odo_overdue:
                continue
            # Skip if a linked pending reminder already covers this maintenance record
            dedupe = (
                int(v.id),
                "maintenance",
                int(m.id),
                _fmt_date(m.next_service_date),
                _num(m.next_service_odometer),
            )
            if dedupe in seen_keys:
                continue
            # Also skip if any reminder was already added with this source_id
            if any(
                i.get("source_type") == "maintenance" and i.get("source_id") == int(m.id)
                for i in items
            ):
                continue
            items.append(
                {
                    "id": int(m.id),
                    "vehicle_id": int(v.id),
                    "vehicle_name": v.name,
                    "registration_number": v.registration_number,
                    "reminder_type": "odometer" if is_odo_overdue and not is_date_overdue else "service",
                    "title": (
                        f"Service odometer overdue: {m.service_type}"
                        if is_odo_overdue and not is_date_overdue
                        else f"Service overdue: {m.service_type}"
                    ),
                    "due_date": _fmt_date(m.next_service_date),
                    "due_odometer": _num(m.next_service_odometer),
                    "status": "pending",
                    "source_type": "maintenance",
                    "source_id": int(m.id),
                    "notes": None,
                    "days_overdue": (today - m.next_service_date).days if is_date_overdue and m.next_service_date else None,
                    "km_overdue": (
                        float(v.current_odometer) - float(m.next_service_odometer)
                        if is_odo_overdue
                        else None
                    ),
                    "is_overdue": True,
                    "is_due_soon": False,
                    "created_at": m.created_at,
                    "updated_at": m.updated_at,
                }
            )
    return items


async def build_dashboard_overdue(
    db: AsyncSession,
    *,
    current_user: models.User,
    limit: int = 3,
) -> dict:
    limit = max(1, min(int(limit or 3), 20))
    due_items = await build_due_reminders(db, current_user=current_user)
    overdue = [i for i in due_items if i.get("is_overdue")]
    # Sort: oldest date first, then greatest km_overdue
    def sort_key(item: dict):
        days = item.get("days_overdue")
        km = item.get("km_overdue")
        date_rank = -(days or 0)  # more days overdue first
        km_rank = -(km or 0)
        return (0 if days else 1, date_rank, km_rank)

    overdue.sort(key=sort_key)
    mapped: list[dict] = []
    for item in overdue:
        rtype = item.get("reminder_type") or "custom"
        if rtype in {"road_tax", "insurance"}:
            target_tab = "documents"
        elif rtype in {"service", "odometer"}:
            target_tab = "maintenance"
        else:
            target_tab = "reminders"
        mapped.append(
            {
                "id": item["id"],
                "vehicle_id": item["vehicle_id"],
                "vehicle_name": item.get("vehicle_name") or "Vehicle",
                "registration_number": item.get("registration_number"),
                "type": rtype,
                "title": item.get("title") or "Overdue",
                "due_date": item.get("due_date"),
                "due_odometer": item.get("due_odometer"),
                "days_overdue": item.get("days_overdue"),
                "km_overdue": item.get("km_overdue"),
                "target_tab": target_tab,
            }
        )
    return {
        "total_overdue": len(mapped),
        "items": mapped[:limit],
    }
